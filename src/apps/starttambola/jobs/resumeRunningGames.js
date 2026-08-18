const { supabaseAdmin } = require('../config/supabaseClient');
const { resumeGame }    = require('../services/gameEngine');

// ─── resumeRunningGames ───────────────────────────────────────────────────────
// Called ONCE during server boot, AFTER the central game engine tick loop
// has started.
//
// Finds all games with status = 'running' and re-registers each with the
// game engine by loading their existing state from DB (tickets, called numbers,
// dividends, existing winners).
//
// This ensures a server restart (deploy, crash, PM2 reload) doesn't silently
// freeze live games. Players may miss at most one call during the restart
// window; the engine resumes from where the DB left off.
//
// Timing note: `nextCallDue` is computed as:
//   lastCalledAt + call_interval_seconds
// If the server was down longer than one interval, the first call after resume
// fires in ~500ms (the next central loop tick). This is acceptable because:
//   a) Restarts should be fast (< a few seconds)
//   b) The game state (which numbers are called) is correct — only timing
//      may be slightly off during the restart window.

const resumeRunningGames = async () => {
  console.log('[ResumeGames] Scanning for running games to resume...');

  const { data: runningGames, error } = await supabaseAdmin
    .from('games')
    .select('id, tenant_id, call_interval_seconds')
    .eq('status', 'running');

  if (error) {
    console.error('[ResumeGames] Failed to query running games:', error.message);
    return;
  }

  if (!runningGames || runningGames.length === 0) {
    console.log('[ResumeGames] No running games found.');
    return;
  }

  console.log(`[ResumeGames] Found ${runningGames.length} running game(s) — resuming...`);

  for (const game of runningGames) {
    try {
      // Load existing called numbers in sequence order so calledOrdered is correct
      const { data: calledRows, error: calledErr } = await supabaseAdmin
        .from('called_numbers')
        .select('number, sequence, created_at')
        .eq('game_id', game.id)
        .order('sequence', { ascending: true });

      if (calledErr) {
        console.error(
          `[ResumeGames] Failed to load called_numbers for game ${game.id}:`,
          calledErr.message
        );
        continue;
      }

      await resumeGame(game, calledRows ?? []);
    } catch (err) {
      console.error(`[ResumeGames] Failed to resume game ${game.id}:`, err.message);
      // Continue with other games — one bad resume shouldn't block the rest
    }
  }

  console.log('[ResumeGames] Resume complete.');
};

module.exports = { resumeRunningGames };
