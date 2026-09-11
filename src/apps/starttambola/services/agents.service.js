const { supabaseAdmin } = require('../config/supabaseClient');
const { AppError } = require('../utils/AppError');
const { handleSupabaseError } = require('../utils/supabaseError');

// ─── _getAgentOrThrow ─────────────────────────────────────────────────────────
// Fetches an agent scoped to a tenant. Returns 404 if not found — the
// tenant_id equality is the ownership guard (prevents cross-tenant reads).

const _getAgentOrThrow = async (tenantId, agentId) => {
  const { data, error } = await supabaseAdmin
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .eq('tenant_id', tenantId)
    .single();

  if (error) handleSupabaseError(error, 'Agent');
  return data;
};

// ─── createAgent ──────────────────────────────────────────────────────────────
// 1. Creates a Supabase Auth user identified by phone (E.164 format).
//    Phone is the login credential; password is set for password-based auth.
//    app_metadata is set server-side so the JWT contains tenant_id + role.
// 2. Creates the agents row, linking auth user_id.
//
// phone_confirm: true → bypass OTP verification since this is an admin-created
// account; the tenant_admin is responsible for distributing credentials.

const createAgent = async (tenantId, {
  name,
  password,
}, createdBy) => {
  const normalizedName = name.trim();
  
  // 1. Check uniqueness of the name for this tenant
  const { data: existing } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('tenant_id', tenantId)
    .ilike('name', normalizedName)
    .single();

  if (existing) {
    throw new AppError('This agent name already exists, please choose something else.', 'CONFLICT', 409);
  }

  // Scope the fake email to this tenant so the same username can exist
  // across different tenants without colliding in Supabase Auth.
  const cleanNameForEmail = normalizedName.replace(/\s+/g, '_').toLowerCase();
  const fakeEmail = `${tenantId}_${cleanNameForEmail}@agent.tambola.com`;

  // ── Step 1: Supabase Auth user ─────────────────────────────────────────────
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: fakeEmail,
    password,
    email_confirm: true, // admin-created — skip OTP
    user_metadata: { full_name: normalizedName },
    app_metadata:  { tenant_id: tenantId, role: 'agent' },
  });

  if (authError) {
    const msg = authError.message ?? '';
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
      throw new AppError(
        `This agent name already exists, please choose something else.`,
        'CONFLICT',
        409
      );
    }
    throw new AppError(`Auth user creation failed: ${msg}`, 'AUTH_ERROR', 500);
  }

  // ── Step 2: agents table row ───────────────────────────────────────────────
  const { data: agent, error: agentError } = await supabaseAdmin
    .from('agents')
    .insert({
      tenant_id:            tenantId,
      user_id:              authData.user.id,
      name:                 normalizedName,
      plain_password:       password, // Stored to meet user requirement of visibility
      status:               'active',
      created_by:           createdBy,
    })
    .select()
    .single();

  if (agentError) {
    // Compensate: if DB insert fails, remove the Auth user to keep state consistent
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    handleSupabaseError(agentError, 'Agent');
  }

  return agent;
};

// ─── listAgents ───────────────────────────────────────────────────────────────
// Returns all agents for a tenant, each enriched with their performance data
// from the `agent_performance_admin` view (joined in JS to avoid relying on
// PostgREST being able to traverse a view relationship).

const listAgents = async (tenantId) => {
  const [agentsResult, perfResult] = await Promise.all([
    supabaseAdmin
      .from('agents')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),

    supabaseAdmin
      .from('agent_performance_admin')
      .select('agent_id, total_tickets_sold, total_revenue, agent_earnings, admin_net_profit')
      .eq('tenant_id', tenantId),
  ]);

  if (agentsResult.error) handleSupabaseError(agentsResult.error, 'Agents');

  if (perfResult.error) {
    // Performance view is non-critical — log and continue with null performance
    console.warn('[Agents] Could not fetch agent_performance_admin view:', perfResult.error.message);
  }

  // Build an agent_id → performance map for O(1) lookup
  const perfMap = (perfResult.data ?? []).reduce((map, p) => {
    map[p.agent_id] = {
      totalTicketsSold: p.total_tickets_sold,
      totalRevenue:     p.total_revenue,
      agentEarnings:    p.agent_earnings,
      adminNetProfit:   p.admin_net_profit,
    };
    return map;
  }, {});

  return (agentsResult.data ?? []).map(agent => ({
    ...agent,
    performance: perfMap[agent.id] ?? null,
  }));
};

// ─── updateAgent ──────────────────────────────────────────────────────────────
// Partial update. If status changes to 'disabled', bans the Supabase Auth
// user for 100 years (effectively permanent). Re-enabling sets ban to 'none'.
// Phone changes are synced to the Auth user as well.

const BAN_DURATION_PERMANENT = '876600h'; // 100 years

const updateAgent = async (tenantId, agentId, updates) => {
  const { name, status } = updates;

  // Ownership check + get user_id for auth operations
  const agent = await _getAgentOrThrow(tenantId, agentId);

  // ── Sync status change to Supabase Auth ──────────────────────────────────
  if (status !== undefined && agent.user_id && status !== agent.status) {
    const banDuration = status === 'disabled' ? BAN_DURATION_PERMANENT : 'none';

    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(
      agent.user_id,
      { ban_duration: banDuration }
    );

    if (banError) {
      console.error(
        `[Agents] Failed to set ban_duration='${banDuration}' for auth user ${agent.user_id}:`,
        banError.message
      );
    }
  }

  // ── Sync name change to Supabase Auth ───────────────────────────────────
  if (name !== undefined && name.trim() !== agent.name) {
    const normalizedName = name.trim();
    
    // Check uniqueness
    const { data: existing } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('name', normalizedName)
      .single();

    if (existing && existing.id !== agentId) {
      throw new AppError('This agent name already exists, please choose something else.', 'CONFLICT', 409);
    }

    if (agent.user_id) {
      const cleanNameForEmail = normalizedName.replace(/\s+/g, '_').toLowerCase();
      const fakeEmail = `${tenantId}_${cleanNameForEmail}@agent.tambola.com`;
      const { error: nameError } = await supabaseAdmin.auth.admin.updateUserById(
        agent.user_id,
        { email: fakeEmail, email_confirm: true, user_metadata: { full_name: normalizedName } }
      );

      if (nameError) {
        console.warn(
          `[Agents] Failed to update email in auth for user ${agent.user_id}:`,
          nameError.message
        );
      }
    }
  }

  // ── DB update ────────────────────────────────────────────────────────────
  const dbUpdate = {};
  if (name   !== undefined) dbUpdate.name   = name.trim();
  if (status !== undefined) dbUpdate.status = status;

  const { data: updatedAgent, error: updateError } = await supabaseAdmin
    .from('agents')
    .update(dbUpdate)
    .eq('id', agentId)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (updateError) handleSupabaseError(updateError, 'Agent');
  return updatedAgent;
};

// ─── getMyPerformance ─────────────────────────────────────────────────────────
// Agent-only. Resolves the caller's agents.id from their JWT user_id, then
// queries agent_performance_self.
//
// SECURITY: This function MUST NEVER touch agent_performance_admin — that view
// exposes admin_net_profit and cross-agent data. The separation is enforced
// here and the route layer adds requireRole('agent') as a second guard.

const getMyPerformance = async (tenantId, userId) => {
  // Resolve agents.id from auth user_id (scoped to this tenant)
  const { data: agent, error: agentError } = await supabaseAdmin
    .from('agents')
    .select('id, name, phone, status, commission_per_ticket')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .single();

  if (agentError) handleSupabaseError(agentError, 'Agent');

  // Query agent_performance_self — never agent_performance_admin
  const { data: perf, error: perfError } = await supabaseAdmin
    .from('agent_performance_self')
    .select('*')
    .eq('agent_id', agent.id)
    .maybeSingle(); // returns null (not an error) if no bookings yet

  if (perfError) handleSupabaseError(perfError, 'AgentPerformance');

  return {
    agent: {
      id:                   agent.id,
      name:                 agent.name,
      phone:                agent.phone,
      status:               agent.status,
      commissionPerTicket:  agent.commission_per_ticket,
    },
    // Provide zero-value defaults if the agent has no bookings yet
    performance: perf ?? {
      agent_id:          agent.id,
      total_tickets_sold: 0,
      agent_earnings:     0,
    },
  };
};

// ─── getMyTickets ─────────────────────────────────────────────────────────────
// Agent-only. Resolves the caller's agents.id, then fetches all tickets booked
// by this agent.
const getMyTickets = async (tenantId, userId) => {
  // Resolve agents.id from auth user_id
  const { data: agent, error: agentError } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .single();

  if (agentError) handleSupabaseError(agentError, 'Agent');

  // Fetch tickets booked by this agent
  const { data: tickets, error: ticketsError } = await supabaseAdmin
    .from('tickets')
    .select('id, ticket_number, game_id, player_name, player_phone, status, updated_at')
    .eq('tenant_id', tenantId)
    .eq('agent_id', agent.id)
    .order('updated_at', { ascending: false });

  if (ticketsError) handleSupabaseError(ticketsError, 'Tickets');

  return tickets ?? [];
};

// ─── deleteAllAgents ──────────────────────────────────────────────────────────
// Soft-deletes all agents for a tenant. Also deletes their Supabase Auth users
// so their phone numbers can be reused for new agents later.
const deleteAllAgents = async (tenantId) => {
  // 1. Fetch all active/non-deleted agents for this tenant
  const { data: agents, error: fetchError } = await supabaseAdmin
    .from('agents')
    .select('id, user_id')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);

  if (fetchError) handleSupabaseError(fetchError, 'Agents');
  if (!agents || agents.length === 0) return { message: 'No agents to delete.' };

  // 2. Delete Supabase Auth users
  const authDeletePromises = agents
    .filter(a => a.user_id)
    .map(a => supabaseAdmin.auth.admin.deleteUser(a.user_id).catch(err => {
      console.error(`[Agents] Failed to delete auth user ${a.user_id}:`, err.message);
    }));

  await Promise.all(authDeletePromises);

  // 3. Soft-delete the agents in the DB
  const { error: updateError } = await supabaseAdmin
    .from('agents')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', agents.map(a => a.id));

  if (updateError) handleSupabaseError(updateError, 'Agents');

  return { message: `Successfully deleted ${agents.length} agents.` };
};

module.exports = { createAgent, listAgents, updateAgent, getMyPerformance, getMyTickets, deleteAllAgents };

