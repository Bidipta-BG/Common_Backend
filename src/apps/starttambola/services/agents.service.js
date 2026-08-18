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
  phone,
  password,
  commissionPerTicket,
}, createdBy) => {
  const rawPhone = phone.trim();
  // Scope the fake email to this tenant so the same username can exist
  // across different tenants without colliding in Supabase Auth.
  const fakeEmail = `${tenantId}_${rawPhone}@agent.tambola.com`;

  // ── Step 1: Supabase Auth user ─────────────────────────────────────────────
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: fakeEmail,
    password,
    email_confirm: true, // admin-created — skip OTP
    user_metadata: { full_name: name, phone: rawPhone },
    app_metadata:  { tenant_id: tenantId, role: 'agent' },
  });

  if (authError) {
    const msg = authError.message ?? '';
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
      throw new AppError(
        `An agent with username '${rawPhone}' already exists`,
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
      name,
      phone:                rawPhone,
      plain_password:       password, // Stored to meet user requirement of visibility
      commission_per_ticket: commissionPerTicket,
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
  const { name, phone, commissionPerTicket, status } = updates;

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
      // Non-fatal: log the failure but continue with the DB update.
      // The agent row will show 'disabled' even if the auth ban partially failed.
      console.error(
        `[Agents] Failed to set ban_duration='${banDuration}' for auth user ${agent.user_id}:`,
        banError.message
      );
    }
  }

  // ── Sync phone change to Supabase Auth ───────────────────────────────────
  if (phone !== undefined && phone !== agent.phone && agent.user_id) {
    const rawPhone = phone.trim();
    // Scope the fake email to this tenant (must match creation convention)
    const fakeEmail = `${tenantId}_${rawPhone}@agent.tambola.com`;
    const { error: phoneError } = await supabaseAdmin.auth.admin.updateUserById(
      agent.user_id,
      { email: fakeEmail, email_confirm: true, user_metadata: { phone: rawPhone } }
    );

    if (phoneError) {
      console.warn(
        `[Agents] Failed to update email in auth for user ${agent.user_id}:`,
        phoneError.message
      );
      // Non-fatal — DB row will still update. Note the discrepancy.
    }
  }

  // ── DB update ────────────────────────────────────────────────────────────
  const dbUpdate = {};
  if (name                !== undefined) dbUpdate.name                  = name;
  if (phone               !== undefined) dbUpdate.phone                 = phone;
  if (commissionPerTicket !== undefined) dbUpdate.commission_per_ticket = commissionPerTicket;
  if (status              !== undefined) dbUpdate.status                = status;

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

module.exports = { createAgent, listAgents, updateAgent, getMyPerformance, getMyTickets };

