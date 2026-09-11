const express = require('express');
const { z } = require('zod');
const { validateBody } = require('../utils/validateBody');
const { requireAuth, requireRole, requireTenantMatch } = require('../middleware/auth');
const { runGame, pauseGameHandler, resumeGameHandler, updateIntervalHandler, stopGameHandler, getState, resetCallHandler } = require('../controllers/gameEngine.controller');

// ─── Shared admin guard ───────────────────────────────────────────────────────
const adminAuth = [requireAuth, requireRole('tenant_admin'), requireTenantMatch];

const updateIntervalSchema = z.object({
  intervalSeconds: z.number().int().refine(v => [8, 10, 12].includes(v), {
    message: 'intervalSeconds must be 8, 10, or 12'
  })
});

// ─── Router (mounted at /api/starttambola/tenants in index.js) ────────────────
const router = express.Router();

// POST /tenants/:tenantId/games/:gameId/run  (tenant_admin)
router.post('/:tenantId/games/:gameId/run', ...adminAuth, runGame);

// POST /tenants/:tenantId/games/:gameId/pause  (tenant_admin)
router.post('/:tenantId/games/:gameId/pause', ...adminAuth, pauseGameHandler);

// POST /tenants/:tenantId/games/:gameId/resume  (tenant_admin)
router.post('/:tenantId/games/:gameId/resume', ...adminAuth, resumeGameHandler);

// POST /tenants/:tenantId/games/:gameId/update-interval  (tenant_admin)
router.post('/:tenantId/games/:gameId/update-interval', ...adminAuth, validateBody(updateIntervalSchema), updateIntervalHandler);

// POST /tenants/:tenantId/games/:gameId/stop  (tenant_admin)
router.post('/:tenantId/games/:gameId/stop', ...adminAuth, stopGameHandler);

// POST /tenants/:tenantId/games/:gameId/reset-call  (tenant_admin)
router.post('/:tenantId/games/:gameId/reset-call', ...adminAuth, resetCallHandler);

// GET  /tenants/:tenantId/games/:gameId/state  (PUBLIC — no auth)
router.get('/:tenantId/games/:gameId/state', getState);

module.exports = router;
