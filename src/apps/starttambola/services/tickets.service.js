const { supabaseAdmin } = require('../config/supabaseClient');
const { AppError } = require('../utils/AppError');
const { handleSupabaseError } = require('../utils/supabaseError');

// ─── _resolveAgentId ──────────────────────────────────────────────────────────
// Looks up the agents.id for a given Supabase Auth user_id + tenantId.
// Returns null if the agent record doesn't exist — non-fatal (agent_id stays
// null on the ticket row rather than blocking the booking).

const _resolveAgentId = async (userId, tenantId) => {
  const { data, error } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    console.warn(`[Tickets] Could not resolve agent_id for user ${userId}:`, error.message);
    return null;
  }
  return data?.id ?? null;
};

// ─── _checkTicketStatus ───────────────────────────────────────────────────────
// Used on the error path of a conditional update to distinguish "not found"
// from "not available" — avoids leaking existence information unnecessarily.

const _checkTicketStatus = async (ticketId, gameId, tenantId) => {
  const { data } = await supabaseAdmin
    .from('tickets')
    .select('id, status')
    .eq('id', ticketId)
    .eq('game_id', gameId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!data) throw new AppError('Ticket not found', 'NOT_FOUND', 404);
  throw new AppError(
    `Ticket is not available for booking (current status: '${data.status}')`,
    'CONFLICT',
    409
  );
};

// ─── listGameTickets ──────────────────────────────────────────────────────────
// PUBLIC — returns only safe fields (no PII).

const listGameTickets = async (tenantId, gameId) => {
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('id, ticket_number, status, grid')
    .eq('game_id', gameId)
    .eq('tenant_id', tenantId)
    .order('ticket_number', { ascending: true });

  if (error) handleSupabaseError(error, 'Tickets');
  return data ?? [];
};

// ─── listAdminGameTickets ─────────────────────────────────────────────────────
// PROTECTED — returns all ticket fields including PII (player_name, etc).

const listAdminGameTickets = async (tenantId, gameId) => {
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('*, agents(name)')
    .eq('game_id', gameId)
    .eq('tenant_id', tenantId)
    .order('ticket_number', { ascending: true });

  if (error) handleSupabaseError(error, 'Tickets');
  return data ?? [];
};

// ─── createBookRequest ────────────────────────────────────────────────────────
// PUBLIC — player requests a specific ticket.
// Uses a conditional update (WHERE status = 'available') as an optimistic lock:
//   - If 0 rows updated → ticket was already taken → 409.
//   - If 1 row updated → safe to insert the booking_request.
// This is NOT a true DB transaction; in a race, two concurrent reservations
// could theoretically both succeed between the check and the insert of the
// booking_request. A Postgres RPC is needed for strict atomicity — acceptable
// as a v1 TODO.

const createBookRequest = async (tenantId, gameId, ticketId, {
  playerName,
  playerPhone,
  source = 'app',
}) => {
  // Step 1: Conditionally reserve the ticket
  const { data: ticket, error: updateError } = await supabaseAdmin
    .from('tickets')
    .update({ status: 'reserved' })
    .eq('id',        ticketId)
    .eq('game_id',   gameId)
    .eq('tenant_id', tenantId)
    .eq('status',    'available') // ← optimistic lock
    .select('id')
    .single();

  if (updateError) {
    if (updateError.code === 'PGRST116') {
      await _checkTicketStatus(ticketId, gameId, tenantId); // throws 404 or 409
    }
    handleSupabaseError(updateError, 'Ticket');
  }

  // Step 2: Insert booking_request
  const { data: request, error: insertError } = await supabaseAdmin
    .from('booking_requests')
    .insert({
      ticket_id:   ticket.id,
      game_id:     gameId,
      tenant_id:   tenantId,
      player_name: playerName,
      player_phone: playerPhone,
      source,
      status: 'pending',
    })
    .select()
    .single();

  if (insertError) {
    // Compensate: put the ticket back to available since request creation failed
    await supabaseAdmin
      .from('tickets')
      .update({ status: 'available' })
      .eq('id', ticket.id);

    handleSupabaseError(insertError, 'BookingRequest');
  }

  return request;
};

// ─── bookDirect ───────────────────────────────────────────────────────────────
// PROTECTED (tenant_admin or agent) — admin/agent books directly on behalf
// of a player. No booking_request row needed — this IS the approval.

const bookDirect = async (tenantId, gameId, ticketId, { playerName, playerPhone }, auth) => {
  const bookedVia = auth.role === 'agent' ? 'agent' : 'admin';
  const agentId = auth.role === 'agent' ? await _resolveAgentId(auth.userId, tenantId) : null;

  const { data: ticket, error } = await supabaseAdmin
    .from('tickets')
    .update({
      status:       'booked',
      player_name:  playerName,
      player_phone: playerPhone,
      booked_via:   bookedVia,
      agent_id:     agentId,
    })
    .eq('id',        ticketId)
    .eq('game_id',   gameId)
    .eq('tenant_id', tenantId)
    .eq('status',    'available') // only book if currently available
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      await _checkTicketStatus(ticketId, gameId, tenantId);
    }
    handleSupabaseError(error, 'Ticket');
  }

  return ticket;
};

// ─── bookBulk ────────────────────────────────────────────────────────────────
// PROTECTED (agent only) — books multiple tickets in one call (Agent "Book All").
//
// All-or-nothing strategy:
//   1. Read all tickets to verify they are all 'available'. If any are not,
//      return 409 immediately (no mutations yet).
//   2. Update all tickets with .eq('status', 'available') as a per-row guard.
//      If the count of updated rows < ticketIds.length (race condition), we
//      compensate by rolling back the ones we did update.
//
// NOTE: This is not a true DB transaction. For strict atomicity, wrap in a
// Postgres function via supabase.rpc(). Acceptable for v1.

const bookBulk = async (tenantId, gameId, { ticketIds, playerName, playerPhone }, auth) => {
  // Step 1: Verify all requested tickets exist and are available
  const { data: tickets, error: fetchError } = await supabaseAdmin
    .from('tickets')
    .select('id, ticket_number, status')
    .eq('game_id',   gameId)
    .eq('tenant_id', tenantId)
    .in('id', ticketIds);

  if (fetchError) handleSupabaseError(fetchError, 'Tickets');

  // Detect missing tickets
  if ((tickets ?? []).length !== ticketIds.length) {
    const foundIds = new Set((tickets ?? []).map(t => t.id));
    const missing  = ticketIds.filter(id => !foundIds.has(id));
    throw new AppError(
      `The following ticket IDs do not belong to this game: ${missing.join(', ')}`,
      'NOT_FOUND',
      404
    );
  }

  // Detect unavailable tickets
  const unavailable = (tickets ?? []).filter(t => t.status !== 'available');
  if (unavailable.length > 0) {
    throw new AppError(
      `${unavailable.length} ticket(s) are not available: ` +
        unavailable.map(t => `#${t.ticket_number} (${t.status})`).join(', '),
      'CONFLICT',
      409
    );
  }

  const agentId = await _resolveAgentId(auth.userId, tenantId);

  // Step 2: Bulk update (with per-row availability guard)
  const { data: booked, error: updateError } = await supabaseAdmin
    .from('tickets')
    .update({
      status:       'booked',
      player_name:  playerName,
      player_phone: playerPhone,
      booked_via:   'agent',
      agent_id:     agentId,
    })
    .in('id', ticketIds)
    .eq('game_id',   gameId)
    .eq('tenant_id', tenantId)
    .eq('status',    'available') // per-row race guard
    .select();

  if (updateError) handleSupabaseError(updateError, 'Tickets');

  // Step 3: Race condition detection — fewer rows updated than requested
  if ((booked ?? []).length !== ticketIds.length) {
    const bookedIds = (booked ?? []).map(t => t.id);

    // Compensate: reset the ones we did book
    if (bookedIds.length > 0) {
      await supabaseAdmin
        .from('tickets')
        .update({
          status:       'available',
          player_name:  null,
          player_phone: null,
          booked_via:   null,
          agent_id:     null,
        })
        .in('id', bookedIds);
    }

    throw new AppError(
      'Some tickets were claimed by another request concurrently — all changes rolled back. Please retry.',
      'CONFLICT',
      409
    );
  }

  return booked;
};

module.exports = { listGameTickets, listAdminGameTickets, createBookRequest, bookDirect, bookBulk };
