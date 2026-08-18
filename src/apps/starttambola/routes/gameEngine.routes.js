const express = require('express');
const { requireAuth, requireRole, requireTenantMatch } = require('../middleware/auth');
const { runGame, stopGameHandler, getState } = require('../controllers/gameEngine.controller');

// ─── Shared admin guard ───────────────────────────────────────────────────────
const adminAuth = [requireAuth, requireRole('tenant_admin'), requireTenantMatch];

// ─── Router (mounted at /api/starttambola/tenants in index.js) ────────────────
const router = express.Router();

// POST /tenants/:tenantId/games/:gameId/run  (tenant_admin)
// Starts the game: sets status='running', loads state into engine, begins ticking.
router.post('/:tenantId/games/:gameId/run', ...adminAuth, runGame);

// POST /tenants/:tenantId/games/:gameId/stop  (tenant_admin)
// Manual override: stops the tick loop early and marks the game completed.
router.post('/:tenantId/games/:gameId/stop', ...adminAuth, stopGameHandler);

// GET  /tenants/:tenantId/games/:gameId/state  (PUBLIC — no auth)
// Returns { status, calledNumbers, winners } for late-joining clients to catch
// up to the current game state before subscribing to the Realtime channel.
// Tenant ownership is still verified (tenantId must match game.tenant_id).
router.get('/:tenantId/games/:gameId/state', getState);

module.exports = router;
