// ─── Game Engine ──────────────────────────────────────────────────────────────
//
// ARCHITECTURE: Central tick loop (not per-game setInterval)
// ─────────────────────────────────────────────────────────────────────────────
// One setInterval runs every 500ms. It iterates an in-memory Map of running
// games, checking each game's `nextCallDue` timestamp. When a game is due,
// it kicks off an async tick (call a number → check dividends → broadcast).
//
// Why this design?
//   • Restartable: on boot, resumeRunningGames() re-populates the Map from DB.
//   • No stale timers: one central handle, easy to reason about.
//   • No busy-wait: 500ms is fine even for 3-second intervals.
//   • Concurrent protection: `processing` flag prevents overlapping ticks.
//
// In-memory state per game (_gameState Map):
// {
//   tenantId:        string,
//   intervalMs:      number,          // call_interval_seconds * 1000
//   nextCallDue:     Date,            // absolute timestamp of next number call
//   processing:      boolean,         // true while a tick is in progress
//   tickets:         [{id, ticket_number, grid}],  // all tickets, sorted by number
//   calledNumbers:   number[],        // in call order (index+1 = sequence)
//   calledSet:       Set<number>,     // O(1) membership test
//   dividends:       [{id, pattern_type}],  // active dividends only
//   wonDividends:    Map<dividendId → ticketId>,   // won dividend → winning ticket ID
// }
//
// DB is the source of truth; memory is a performance cache for the hot tick path.
// On each tick: ONE db write (insert called_number) + maybe one winners insert.
// No per-tick reads after game load.

const { supabaseAdmin }                = require('../config/supabaseClient');
const { AppError }                     = require('../utils/AppError');
const { handleSupabaseError }          = require('../utils/supabaseError');
const { isPatternComplete, getMatchedNumbers } = require('../utils/patternMatcher');
const { broadcastToGame, broadcastToTenant }  = require('../realtime/broadcaster');

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

/** Map<gameId, GameState> */
const _gameState = new Map();

// full_house variants — used to skip same-ticket for full_house_2/3
const FULL_HOUSE_VARIANTS = new Set(['full_house_1', 'full_house_2', 'full_house_3']);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Pick a random uncalled number (1–90). Returns null when all 90 are called. */
const _pickNextNumber = (calledSet) => {
  const available = [];
  for (let n = 1; n <= 90; n++) {
    if (!calledSet.has(n)) available.push(n);
  }
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
};

// ─────────────────────────────────────────────────────────────────────────────
// Dividend checking (pure in-memory — no DB reads)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks every active unwon dividend against every ticket using the latest
 * in-memory called numbers. Inserts winner rows to DB for newly won dividends.
 * Broadcasts each new winner to the game channel.
 *
 * For full_house_1/2/3: the first ticket (lowest ticket_number) to complete
 * full house wins full_house_1. The next wins full_house_2, and so on.
 * Tickets that already won a full_house variant are skipped for subsequent ones.
 *
 * @param {string} gameId
 * @returns {boolean} true if ALL active dividends now have winners
 */
const _checkDividends = async (gameId) => {
  const state = _gameState.get(gameId);
  if (!state) return false;

  const {
    tenantId, tickets, calledSet, calledNumbers,
    dividends, wonDividends,
  } = state;

  // Build the set of dividends that still need a winner
  const pendingDividends = dividends.filter((d) => !wonDividends.has(d.id));
  if (pendingDividends.length === 0) return true; // all done

  // Collect ticket IDs that already won ANY dividend (Ticket Retires Rule)
  const retiredTicketIds = new Set();
  for (const [divId, ticketId] of wonDividends.entries()) {
    retiredTicketIds.add(ticketId);
  }

  const newWinnerRows = [];

  for (const dividend of pendingDividends) {
    for (const ticket of tickets) {
      // TICKET RETIREMENT RULE: If the ticket has already won ANY prize, skip it.
      if (retiredTicketIds.has(ticket.id)) continue;

      if (isPatternComplete(dividend.pattern_type, ticket.grid, calledSet)) {
        const matchedNumbers = getMatchedNumbers(
          dividend.pattern_type, ticket.grid, calledSet, calledNumbers
        );

        newWinnerRows.push({
          game_id:         gameId,
          tenant_id:       tenantId,
          ticket_id:       ticket.id,
          dividend_id:     dividend.id,
          matched_numbers: matchedNumbers,
        });

        // Update in-memory state immediately
        wonDividends.set(dividend.id, ticket.id);
        
        // Retire this ticket immediately so it can't win another dividend in the same tick
        retiredTicketIds.add(ticket.id);

        break; // first ticket (by ticket_number ascending) wins this dividend
      }
    }
  }

  if (newWinnerRows.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from('winners')
      .insert(newWinnerRows);

    if (insertError) {
      console.error('[GameEngine] Failed to insert winners:', insertError.message);
      // Undo in-memory updates so we retry on the next tick
      for (const row of newWinnerRows) {
        wonDividends.delete(row.dividend_id);
        retiredTicketIds.delete(row.ticket_id);
      }
    } else {
      // Broadcast each new winner with a slight stagger (500ms) to ensure Supabase
      // REST API burst-protection doesn't drop it when fired alongside 'number_called'
      for (let i = 0; i < newWinnerRows.length; i++) {
        const winner = newWinnerRows[i];
        setTimeout(() => {
          broadcastToGame(gameId, 'winner', winner);
        }, 500 + (i * 200));
      }
    }
  }

  // All pending dividends won?
  const allWon = dividends.every((d) => wonDividends.has(d.id));
  return { allWon, newWinnersCount: newWinnerRows.length };
};

// ─────────────────────────────────────────────────────────────────────────────
// completeGame
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marks the game as completed in DB and removes it from the in-memory state.
 * Also triggers the subscription expiry hook so a game-end doesn't leave an
 * expired tenant running.
 */
const completeGame = async (tenantId, gameId) => {
  // Remove from engine FIRST to stop any concurrent ticks
  _gameState.delete(gameId);

  const completedAt = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from('games')
    .update({ status: 'completed', completed_at: completedAt })
    .eq('id', gameId)
    .eq('tenant_id', tenantId);

  if (error) {
    console.error(`[GameEngine] Failed to mark game ${gameId} completed:`, error.message);
  }

  await Promise.all([
    broadcastToGame(gameId,  'game_completed',   { gameId, completedAt }),
    broadcastToTenant(tenantId, 'game_state_changed', { gameId, status: 'completed' }),
  ]);

  // Deferred require to avoid circular dependency at module load time
  const { checkTenantExpiryOnGameComplete } = require('../jobs/subscriptionExpiry');
  try {
    await checkTenantExpiryOnGameComplete(tenantId);
  } catch (err) {
    console.error('[GameEngine] Subscription expiry hook failed after game complete:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-game tick
// ─────────────────────────────────────────────────────────────────────────────

const _processGameTick = async (gameId) => {
  const state = _gameState.get(gameId);
  if (!state) return; // game was stopped between loop check and tick execution

  const { tenantId, calledNumbers, calledSet } = state;

  // ── Pick the next uncalled number ─────────────────────────────────────────
  const nextNumber = _pickNextNumber(calledSet);

  if (nextNumber === null) {
    // All 90 numbers have been called → complete the game
    console.log(`[GameEngine] Game ${gameId}: all 90 numbers called. Completing.`);
    await completeGame(tenantId, gameId);
    return;
  }

  const sequence = calledNumbers.length + 1;

  // ── Insert into DB ────────────────────────────────────────────────────────
  const { error: insertError } = await supabaseAdmin
    .from('called_numbers')
    .insert({ game_id: gameId, tenant_id: tenantId, number: nextNumber, sequence });

  if (insertError) {
    // Log and bail — the tick will be retried next interval
    console.error(
      `[DEBUG-TICK] ❌ DB insert FAILED for number ${nextNumber}:`,
      insertError.message
    );
    return;
  }

  // ── Update in-memory cache ────────────────────────────────────────────────
  calledNumbers.push(nextNumber);
  calledSet.add(nextNumber);

  // ── Broadcast number called ───────────────────────────────────────────────
  await broadcastToGame(gameId, 'number_called', {
    number:      nextNumber,
    sequence,
    totalCalled: calledNumbers.length,
    remaining:   90 - calledNumbers.length,
  });

  // ── Check for newly won dividends ───────────────────────────────────────────────────────
  let allWon = false;
  try {
    const result = await _checkDividends(gameId);
    allWon = result.allWon;
    
    if (result.newWinnersCount > 0) {
      console.log(`[GameEngine] Game ${gameId}: Pausing for 6s to celebrate ${result.newWinnersCount} winner(s).`);
      state.nextCallDue = new Date(state.nextCallDue.getTime() + 6000);
    }
  } catch (err) {
    console.error(`[GameEngine] Game ${gameId}: dividend check failed:`, err.message);
    return; // don't complete on dividend check failure — retry next tick
  }

  if (allWon) {
    console.log(`[GameEngine] Game ${gameId}: all dividends won. Completing.`);
    await completeGame(tenantId, gameId);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Central tick loop
// ─────────────────────────────────────────────────────────────────────────────

const CENTRAL_INTERVAL_MS = 500; // poll every 500ms — precise enough for 3s+ call intervals

let _centralHandle = null;

const _startCentralLoop = () => {
  if (_centralHandle) return; // already running

  let _loopDebugCounter = 0;

  _centralHandle = setInterval(() => {
    const now = Date.now();
    _loopDebugCounter++;

    // Log loop status every 10 seconds (every 20 ticks at 500ms)
    // if (_loopDebugCounter % 20 === 0) { ... removed for log hygiene ... }

    for (const [gameId, state] of _gameState.entries()) {
      // Skip if: already processing, or not yet due
      if (state.processing || now < state.nextCallDue.getTime()) continue;

      // Claim the tick immediately to prevent double-processing
      state.processing = true;
      state.nextCallDue = new Date(now + state.intervalMs);

      _processGameTick(gameId)
        .catch((err) => console.error(`[GameEngine] Unhandled tick error for game ${gameId}:`, err))
        .finally(() => {
          // Only clear processing if the game is still in memory (wasn't completed)
          const s = _gameState.get(gameId);
          if (s) s.processing = false;
        });
    }
  }, CENTRAL_INTERVAL_MS);

  // .unref() so this timer doesn't prevent process exit in test/dev
  if (_centralHandle.unref) _centralHandle.unref();
  console.log('[GameEngine] Central tick loop started (500ms poll).');
};

// Start loop immediately when this module is first required
_startCentralLoop();

// ─────────────────────────────────────────────────────────────────────────────
// _loadGameIntoMemory  (shared by startGame and resumeRunningGames)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Populates _gameState for a game from DB data.
 * Called at startGame (fresh load) and at resume time (existing called numbers).
 *
 * @param {object} game — must have: id, tenant_id, call_interval_seconds
 * @param {number[]} [existingCalledNumbers] — in sequence order, for resume
 * @param {object}  [lastCalledAt]           — Date of last call, for computing nextCallDue
 */
const _loadGameIntoMemory = async (game, existingCalledNumbers = [], lastCalledAt = null) => {
  const gameId     = game.id;
  const tenantId   = game.tenant_id;
  const intervalMs = game.call_interval_seconds * 1000;

  // Load tickets (ONLY BOOKED tickets can play)
  const { data: tickets, error: ticketErr } = await supabaseAdmin
    .from('tickets')
    .select('id, ticket_number, grid')
    .eq('game_id', gameId)
    .eq('status', 'booked') // Prevent unsold/available tickets from stealing prizes!
    .order('ticket_number', { ascending: true });

  if (ticketErr) throw new Error(`Failed to load tickets for game ${gameId}: ${ticketErr.message}`);

  // Load active dividends
  const { data: dividends, error: divErr } = await supabaseAdmin
    .from('dividends')
    .select('id, pattern_type')
    .eq('game_id', gameId)
    .eq('active', true);

  if (divErr) throw new Error(`Failed to load dividends for game ${gameId}: ${divErr.message}`);

  // Load existing winners (for resume — to not re-detect already won dividends)
  const { data: existingWinners, error: winErr } = await supabaseAdmin
    .from('winners')
    .select('dividend_id, ticket_id')
    .eq('game_id', gameId);

  if (winErr) throw new Error(`Failed to load winners for game ${gameId}: ${winErr.message}`);

  const wonDividends = new Map(
    (existingWinners ?? []).map((w) => [w.dividend_id, w.ticket_id])
  );

  // Compute nextCallDue
  const baseTime   = lastCalledAt ? lastCalledAt.getTime() : Date.now();
  const nextCallDue = new Date(baseTime + intervalMs);

  _gameState.set(gameId, {
    tenantId,
    intervalMs,
    nextCallDue,
    processing:    false,
    tickets:       tickets ?? [],
    calledNumbers: existingCalledNumbers,
    calledSet:     new Set(existingCalledNumbers),
    dividends:     dividends ?? [],
    wonDividends,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Starts a game. Only allowed if:
 *   • game.status is 'scheduled' or 'booking_open' (booking was open before start)
 *   • game.scheduled_at <= now()
 *
 * Loads all tickets and dividends into memory, then lets the central loop drive it.
 */
const startGame = async (tenantId, gameId) => {
  if (_gameState.has(gameId)) {
    throw new AppError('Game is already running on this server instance.', 'BAD_REQUEST', 400);
  }

  // Fetch game (tenant ownership check via eq)
  const { data: game, error: fetchErr } = await supabaseAdmin
    .from('games')
    .select('*')
    .eq('id', gameId)
    .eq('tenant_id', tenantId)
    .single();

  if (fetchErr) handleSupabaseError(fetchErr, 'Game');

  const STARTABLE_STATUSES = ['scheduled', 'booking_open'];
  if (!STARTABLE_STATUSES.includes(game.status)) {
    throw new AppError(
      `Game status is '${game.status}'. Only games with status 'scheduled' or 'booking_open' can be started.`,
      'BAD_REQUEST',
      400
    );
  }

  const now = new Date();
  if (new Date(game.scheduled_at) > now) {
    throw new AppError(
      `Game is scheduled for ${game.scheduled_at}. Cannot start before the scheduled time.`,
      'BAD_REQUEST',
      400
    );
  }

  // Persist status change
  const { error: updateErr } = await supabaseAdmin
    .from('games')
    .update({ status: 'running', started_at: now.toISOString() })
    .eq('id', gameId);

  if (updateErr) handleSupabaseError(updateErr, 'Game');

  // Load into memory (no existing called numbers for a fresh start)
  await _loadGameIntoMemory(game);

  await Promise.all([
    broadcastToGame(gameId, 'game_started', { gameId, startedAt: now.toISOString() }),
    broadcastToTenant(tenantId, 'game_state_changed', { gameId, status: 'running' }),
  ]);

  console.log(`[GameEngine] Game ${gameId} started. Interval: ${game.call_interval_seconds}s.`);
  return { gameId, status: 'running', startedAt: now.toISOString() };
};

/**
 * Manual admin stop. Removes from memory, then completes the game.
 */
const stopGame = async (tenantId, gameId) => {
  // Check if in memory; if not, verify it's actually running in DB
  if (!_gameState.has(gameId)) {
    const { data: game } = await supabaseAdmin
      .from('games')
      .select('status')
      .eq('id', gameId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!game || game.status !== 'running') {
      throw new AppError(
        'Game is not currently running. Cannot stop a game that is not running.',
        'BAD_REQUEST',
        400
      );
    }
    // Game is running in DB but not in this instance's memory (e.g. different pod)
    // Still attempt to mark it complete.
  }

  // Remove from engine first to stop tick loop
  _gameState.delete(gameId);

  console.log(`[GameEngine] Game ${gameId} stopped manually by admin.`);
  await completeGame(tenantId, gameId);
  return { gameId, status: 'completed' };
};

/**
 * Public state snapshot — for a client that just loaded the page and needs
 * to catch up before subscribing to the live Realtime channel.
 *
 * If the game is currently running (in memory), called numbers are served from
 * the memory cache (faster). Winners are always fetched from DB for accuracy.
 */
const getGameState = async (tenantId, gameId) => {
  // Tenant ownership check
  const { data: game, error: gameErr } = await supabaseAdmin
    .from('games')
    .select('id, status, started_at, completed_at')
    .eq('id', gameId)
    .eq('tenant_id', tenantId)
    .single();

  if (gameErr) handleSupabaseError(gameErr, 'Game');

  const memState = _gameState.get(gameId);

  // Fetch winners from DB regardless of whether game is in memory
  const { data: winners, error: winErr } = await supabaseAdmin
    .from('winners')
    .select('id, dividend_id, ticket_id, matched_numbers')
    .eq('game_id', gameId);

  if (winErr) handleSupabaseError(winErr, 'Winners');

  let calledNumbers;
  if (memState) {
    // Hot path: serve from memory
    calledNumbers = memState.calledNumbers.map((n, i) => ({
      number:   n,
      sequence: i + 1,
    }));
  } else {
    // Cold path: read from DB (game not running or on different instance)
    const { data: dbCalled, error: calledErr } = await supabaseAdmin
      .from('called_numbers')
      .select('number, sequence')
      .eq('game_id', gameId)
      .order('sequence', { ascending: true });

    if (calledErr) handleSupabaseError(calledErr, 'CalledNumbers');
    calledNumbers = dbCalled ?? [];
  }

  return {
    status:        game.status,
    startedAt:     game.started_at,
    completedAt:   game.completed_at,
    calledNumbers,
    winners:       winners ?? [],
    isInMemory:    !!memState, // helpful for debugging
  };
};

/**
 * Resume hook — called once on server boot by resumeRunningGames.js.
 * Rehydrates _gameState for each game whose status = 'running' in DB.
 */
const resumeGame = async (game, calledRows) => {
  const calledNumbers = calledRows.map((r) => r.number);
  const lastRow       = calledRows.length > 0 ? calledRows[calledRows.length - 1] : null;
  const lastCalledAt  = lastRow ? new Date(lastRow.created_at) : null;

  await _loadGameIntoMemory(game, calledNumbers, lastCalledAt);

  console.log(
    `[GameEngine] Resumed game ${game.id} — ` +
    `${calledNumbers.length} numbers already called, next due ~${
      _gameState.get(game.id)?.nextCallDue?.toISOString() ?? 'unknown'
    }.`
  );
};

module.exports = { startGame, stopGame, completeGame, getGameState, resumeGame };
