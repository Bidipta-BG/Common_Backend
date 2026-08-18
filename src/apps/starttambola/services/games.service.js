const { supabaseAdmin } = require('../config/supabaseClient');
const { AppError } = require('../utils/AppError');
const { handleSupabaseError } = require('../utils/supabaseError');
const { generateTambolaTicket } = require('../utils/ticketGenerator');

// ─── Constants ────────────────────────────────────────────────────────────────
// Supabase's PostgREST has a default row limit; chunk large inserts to stay safe.
const TICKET_CHUNK_SIZE = 100;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Fetches a game by id and tenant_id. The tenant_id equality check is
 * the ownership guard — if the game belongs to a different tenant the
 * row won't be found and PGRST116 → 404 is returned.
 */
const _getGameOrThrow = async (tenantId, gameId) => {
  const { data, error } = await supabaseAdmin
    .from('games')
    .select('*')
    .eq('id', gameId)
    .eq('tenant_id', tenantId)
    .single();

  if (error) handleSupabaseError(error, 'Game');
  return data;
};

/**
 * Builds the ticket rows array for insertion.
 * startNumber is the ticket_number for the first new ticket.
 */
const _buildTicketRows = (tenantId, gameId, count, startNumber = 1) =>
  Array.from({ length: count }, (_, i) => ({
    game_id:       gameId,
    tenant_id:     tenantId,
    ticket_number: startNumber + i,
    grid:          generateTambolaTicket(), // valid 3×9 Tambola grid
    status:        'available',
  }));

/** Inserts an array of ticket rows in chunks to avoid PostgREST row limits. */
const _insertTicketChunks = async (rows) => {
  for (let i = 0; i < rows.length; i += TICKET_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + TICKET_CHUNK_SIZE);
    const { error } = await supabaseAdmin.from('tickets').insert(chunk);
    if (error) handleSupabaseError(error, 'Tickets');
  }
};

// ─── createGame ───────────────────────────────────────────────────────────────
// Inserts a game row (status: 'scheduled') then bulk-generates totalTickets
// ticket rows, each with a randomly generated valid Tambola grid.

const createGame = async (tenantId, {
  scheduledAt,
  totalTickets,
  ticketPrice,
  agencyCommission,
  callIntervalSeconds,
}) => {
  // 1. Create game row
  const { data: game, error: gameError } = await supabaseAdmin
    .from('games')
    .insert({
      tenant_id:              tenantId,
      status:                 'scheduled',
      booking_status:         'open',
      scheduled_at:           scheduledAt,
      total_tickets:          totalTickets,
      ticket_price:           ticketPrice,
      agency_commission:      agencyCommission,
      call_interval_seconds:  callIntervalSeconds,
    })
    .select()
    .single();

  if (gameError) handleSupabaseError(gameError, 'Game');

  // 2. Bulk-generate tickets
  const ticketRows = _buildTicketRows(tenantId, game.id, totalTickets, 1);
  await _insertTicketChunks(ticketRows);

  // 3. Create default dividends
  const totalPool = totalTickets * ticketPrice;
  const defaultDividends = [
    { name: "Full House 1", pattern_type: "full_house_1", active: true, prize_amount: Math.floor(totalPool * 0.50), sort_order: 0 },
    { name: "Full House 2", pattern_type: "full_house_2", active: true, prize_amount: Math.floor(totalPool * 0.30), sort_order: 1 },
    { name: "Full House 3", pattern_type: "full_house_3", active: false, prize_amount: 0, sort_order: 2 },
    { name: "Top Line", pattern_type: "top_line", active: false, prize_amount: 0, sort_order: 3 },
    { name: "Middle Line", pattern_type: "middle_line", active: false, prize_amount: 0, sort_order: 4 },
    { name: "Bottom Line", pattern_type: "bottom_line", active: true, prize_amount: Math.floor(totalPool * 0.20), sort_order: 5 },
    { name: "Quick 5 (Early 5)", pattern_type: "quick_five", active: false, prize_amount: 0, sort_order: 6 },
    { name: "Corners", pattern_type: "corners", active: false, prize_amount: 0, sort_order: 7 },
    { name: "Half Seat Bonus", pattern_type: "half_seat_bonus", active: false, prize_amount: 0, sort_order: 8 },
  ].map(d => ({ ...d, tenant_id: tenantId, game_id: game.id }));

  const { error: divError } = await supabaseAdmin.from('dividends').insert(defaultDividends);
  if (divError) handleSupabaseError(divError, 'Dividends');

  return game;
};

// ─── updateGame ───────────────────────────────────────────────────────────────
// Partial update. Handles totalTickets increase (add new tickets) and
// decrease (only if no booked/reserved ticket would be deleted — else 409).

const updateGame = async (tenantId, gameId, updates) => {
  const game = await _getGameOrThrow(tenantId, gameId);

  const {
    scheduledAt,
    totalTickets,
    ticketPrice,
    agencyCommission,
    callIntervalSeconds,
    booking_status, // eslint-disable-line camelcase
  } = updates;

  // ── Ticket count change handling ─────────────────────────────────────────
  if (totalTickets !== undefined && totalTickets !== game.total_tickets) {
    const currentCount = game.total_tickets;

    if (totalTickets < currentCount) {
      // Decreasing: check if any ticket beyond the new limit is booked/reserved
      const { data: blockers, error: blockerError } = await supabaseAdmin
        .from('tickets')
        .select('ticket_number, status')
        .eq('game_id', gameId)
        .gt('ticket_number', totalTickets)
        .in('status', ['booked', 'reserved']);

      if (blockerError) handleSupabaseError(blockerError, 'Tickets');

      if (blockers && blockers.length > 0) {
        throw new AppError(
          `Cannot reduce to ${totalTickets} tickets: ` +
          `${blockers.length} ticket(s) beyond position ${totalTickets} ` +
          `are already booked or reserved ` +
          `(ticket numbers: ${blockers.map(t => t.ticket_number).join(', ')}).`,
          'CONFLICT',
          409
        );
      }

      // Safe to delete the excess available tickets
      const { error: deleteError } = await supabaseAdmin
        .from('tickets')
        .delete()
        .eq('game_id', gameId)
        .gt('ticket_number', totalTickets)
        .eq('status', 'available');

      if (deleteError) handleSupabaseError(deleteError, 'Tickets');

    } else {
      // Increasing: generate and insert the additional tickets
      const additionalCount = totalTickets - currentCount;
      const newRows = _buildTicketRows(tenantId, gameId, additionalCount, currentCount + 1);
      await _insertTicketChunks(newRows);
    }
  }

  // ── Build DB update payload (only include provided fields) ───────────────
  const dbUpdate = {};
  if (scheduledAt          !== undefined) dbUpdate.scheduled_at            = scheduledAt;
  if (totalTickets         !== undefined) dbUpdate.total_tickets            = totalTickets;
  if (ticketPrice          !== undefined) dbUpdate.ticket_price             = ticketPrice;
  if (agencyCommission     !== undefined) dbUpdate.agency_commission        = agencyCommission;
  if (callIntervalSeconds  !== undefined) dbUpdate.call_interval_seconds    = callIntervalSeconds;
  if (booking_status       !== undefined) dbUpdate.booking_status           = booking_status; // eslint-disable-line camelcase

  const { data: updatedGame, error: updateError } = await supabaseAdmin
    .from('games')
    .update(dbUpdate)
    .eq('id', gameId)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (updateError) handleSupabaseError(updateError, 'Game');
  return updatedGame;
};

// ─── resetTickets ─────────────────────────────────────────────────────────────
// Resets every ticket in the game to status: 'available', clearing all
// player/agent fields. Also deletes pending/approved booking_requests.

const resetTickets = async (tenantId, gameId) => {
  // Ownership check
  await _getGameOrThrow(tenantId, gameId);

  // Reset all tickets for this game
  const { error: ticketError } = await supabaseAdmin
    .from('tickets')
    .update({
      status:       'available',
      player_name:  null,
      player_phone: null,
      agent_id:     null,
      booked_via:   null,
    })
    .eq('game_id', gameId);

  if (ticketError) handleSupabaseError(ticketError, 'Tickets');

  // Delete pending and approved booking requests for this game
  const { error: brError } = await supabaseAdmin
    .from('booking_requests')
    .delete()
    .eq('game_id', gameId)
    .in('status', ['pending', 'approved']);

  if (brError) handleSupabaseError(brError, 'BookingRequests');

  return { message: 'All tickets reset to available.' };
};

// ─── resetGame ────────────────────────────────────────────────────────────────
// Deletes all called_numbers and winners rows for this game.
// Resets game.status back to 'scheduled' and clears timestamps.

const resetGame = async (tenantId, gameId) => {
  // Ownership check
  await _getGameOrThrow(tenantId, gameId);

  // Delete game-progress rows
  const [calledResult, winnersResult] = await Promise.all([
    supabaseAdmin.from('called_numbers').delete().eq('game_id', gameId),
    supabaseAdmin.from('winners').delete().eq('game_id', gameId),
  ]);

  if (calledResult.error)  handleSupabaseError(calledResult.error,  'CalledNumbers');
  if (winnersResult.error) handleSupabaseError(winnersResult.error, 'Winners');

  // Reset game status
  const { data: updatedGame, error: gameError } = await supabaseAdmin
    .from('games')
    .update({
      status:       'scheduled',
      started_at:   null,
      completed_at: null,
    })
    .eq('id', gameId)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (gameError) handleSupabaseError(gameError, 'Game');
  return updatedGame;
};

// ─── deleteGame ───────────────────────────────────────────────────────────────
const deleteGame = async (tenantId, gameId) => {
  // Ownership check
  await _getGameOrThrow(tenantId, gameId);

  // Due to foreign key constraints, we might need to delete related records first
  // if ON DELETE CASCADE is not set up perfectly.
  // Assuming cascade is set up, but let's be safe.
  const { error } = await supabaseAdmin
    .from('games')
    .delete()
    .eq('id', gameId)
    .eq('tenant_id', tenantId);

  if (error) handleSupabaseError(error, 'Game');
  return { success: true };
};

// ─── upsertDividends ─────────────────────────────────────────────────────────
// Replaces the full dividend set for a game in one operation:
// delete all existing rows then insert the new set.
// For v1 this is acceptable — a brief gap between delete and insert is
// non-critical since dividends are read only at game-start / claim time.

const upsertDividends = async (tenantId, gameId, dividends) => {
  // Ownership check
  await _getGameOrThrow(tenantId, gameId);

  // Delete existing dividends
  const { error: deleteError } = await supabaseAdmin
    .from('dividends')
    .delete()
    .eq('game_id', gameId);

  if (deleteError) handleSupabaseError(deleteError, 'Dividends');

  // Insert new set
  const rows = dividends.map((d) => ({
    game_id:      gameId,
    tenant_id:    tenantId,
    name:         d.name,
    pattern_type: d.patternType,
    active:       d.active,
    prize_amount: d.prizeAmount,
    sort_order:   d.sortOrder,
  }));

  const { data, error: insertError } = await supabaseAdmin
    .from('dividends')
    .insert(rows)
    .select();

  if (insertError) handleSupabaseError(insertError, 'Dividends');
  return data;
};

// ─── getGame ──────────────────────────────────────────────────────────────────
// Returns the game row + its dividends + a ticket count summary by status.
// Does NOT return individual ticket data — that's a separate endpoint.

const getGame = async (tenantId, gameId) => {
  // Ownership check + game fetch
  const game = await _getGameOrThrow(tenantId, gameId);

  // Fetch dividends (sorted by sort_order for consistent ordering)
  const { data: dividends, error: divError } = await supabaseAdmin
    .from('dividends')
    .select('*')
    .eq('game_id', gameId)
    .order('sort_order', { ascending: true });

  if (divError) handleSupabaseError(divError, 'Dividends');

  // Fetch only the status column for all tickets — group in JS to get counts
  const { data: ticketStatuses, error: ticketError } = await supabaseAdmin
    .from('tickets')
    .select('status')
    .eq('game_id', gameId);

  if (ticketError) handleSupabaseError(ticketError, 'Tickets');

  const ticketSummary = (ticketStatuses || []).reduce((acc, { status }) => {
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  return {
    ...game,
    dividends:     dividends  || [],
    ticketSummary: {
      total:     (ticketStatuses || []).length,
      available: ticketSummary.available  || 0,
      reserved:  ticketSummary.reserved   || 0,
      booked:    ticketSummary.booked     || 0,
      // add more statuses here as the schema evolves
      ...ticketSummary,
    },
  };
};

// ─── getCurrentGame ───────────────────────────────────────────────────────────
// Returns the single most relevant game for a tenant, following this priority:
//   1. Any game currently 'running'  (there should be at most one)
//   2. The next 'booking_open' or 'scheduled' game (soonest scheduled_at)
//   3. The most recently 'completed' game (fallback — show something to players)
//
// Returns null if the tenant has no games at all.
// Used by the public player page to decide which game board to display.
const getCurrentGame = async (tenantId) => {
  // 1. Try running first
  const { data: running } = await supabaseAdmin
    .from('games')
    .select('id, status, booking_status, scheduled_at, started_at, total_tickets, ticket_price, call_interval_seconds')
    .eq('tenant_id', tenantId)
    .eq('status', 'running')
    .maybeSingle();

  if (running) return running;

  // 2. Try upcoming (scheduled) WHERE booking_status is 'open'
  const { data: upcomingOpen } = await supabaseAdmin
    .from('games')
    .select('id, status, booking_status, scheduled_at, started_at, total_tickets, ticket_price, call_interval_seconds')
    .eq('tenant_id', tenantId)
    .eq('status', 'scheduled')
    .eq('booking_status', 'open')
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (upcomingOpen) return upcomingOpen;

  // 3. Fallback to any scheduled game
  const { data: upcoming } = await supabaseAdmin
    .from('games')
    .select('id, status, booking_status, scheduled_at, started_at, total_tickets, ticket_price, call_interval_seconds')
    .eq('tenant_id', tenantId)
    .eq('status', 'scheduled')
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (upcoming) return upcoming;

  // Fallback — most recently completed game
  const { data: completed } = await supabaseAdmin
    .from('games')
    .select('id, status, booking_status, scheduled_at, started_at, completed_at, total_tickets, ticket_price, call_interval_seconds')
    .eq('tenant_id', tenantId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return completed ?? null;
};

// ─── getGamesList ─────────────────────────────────────────────────────────────
// Returns all games for a tenant, ordered by scheduled_at descending, with a
// summary of tickets sold. Used by the admin dashboard list view.
const getGamesList = async (tenantId) => {
  const { data: games, error: gamesError } = await supabaseAdmin
    .from('games')
    .select('id, status, booking_status, scheduled_at, started_at, completed_at, created_at, total_tickets, ticket_price, agency_commission, call_interval_seconds')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (gamesError) handleSupabaseError(gamesError, 'Games');

  if (!games || games.length === 0) return [];

  // Fetch ticket statuses for these games to calculate sold vs available
  const gameIds = games.map(g => g.id);
  const { data: tickets, error: ticketsError } = await supabaseAdmin
    .from('tickets')
    .select('game_id, status')
    .in('game_id', gameIds);

  if (ticketsError) handleSupabaseError(ticketsError, 'Tickets');

  // Group tickets by game
  const ticketCountsByGame = (tickets || []).reduce((acc, ticket) => {
    if (!acc[ticket.game_id]) {
      acc[ticket.game_id] = { total: 0, booked: 0, available: 0, reserved: 0 };
    }
    acc[ticket.game_id].total++;
    acc[ticket.game_id][ticket.status] = (acc[ticket.game_id][ticket.status] || 0) + 1;
    return acc;
  }, {});

  return games.map(game => ({
    ...game,
    ticketSummary: ticketCountsByGame[game.id] || { 
      total: game.total_tickets, 
      booked: 0, 
      available: game.total_tickets, 
      reserved: 0 
    }
  }));
};

module.exports = {
  createGame,
  updateGame,
  resetTickets,
  resetGame,
  deleteGame,
  upsertDividends,
  getGame,
  getCurrentGame,
  getGamesList,
};


