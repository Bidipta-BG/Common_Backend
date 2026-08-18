const express = require('express');
const { z } = require('zod');
const { validateBody } = require('../utils/validateBody');
const { requireAuth, requireRole, requireTenantMatch } = require('../middleware/auth');
const { DIVIDEND_PATTERN_TYPES } = require('../utils/dividendTypes');
const {
  createGame,
  updateGame,
  resetTickets,
  resetGame,
  deleteGame,
  upsertDividends,
  getGame,
  getGamesList,
} = require('../controllers/games.controller');

// ─── Shared auth guard ────────────────────────────────────────────────────────
// All game routes: requireAuth + tenant_admin only + tenantId must match token.
const gameAuth = [requireAuth, requireRole('tenant_admin'), requireTenantMatch];

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const createGameSchema = z.object({
  scheduledAt:          z.string().datetime({ message: 'scheduledAt must be an ISO 8601 datetime string' }),
  totalTickets:         z.number({ required_error: 'totalTickets is required' })
                          .int('totalTickets must be an integer')
                          .positive('totalTickets must be > 0')
                          .max(10000, 'totalTickets cannot exceed 10,000'),
  ticketPrice:          z.number({ required_error: 'ticketPrice is required' })
                          .nonnegative('ticketPrice must be ≥ 0'),
  agencyCommission:     z.number({ required_error: 'agencyCommission is required' })
                          .min(0,   'agencyCommission must be ≥ 0')
                          .max(100, 'agencyCommission must be ≤ 100'),
  callIntervalSeconds:  z.number({ required_error: 'callIntervalSeconds is required' })
                          .int('callIntervalSeconds must be an integer')
                          .positive('callIntervalSeconds must be > 0'),
});

const updateGameSchema = z.object({
  scheduledAt:         z.string().datetime().optional(),
  totalTickets:        z.number().int().positive().max(10000).optional(),
  ticketPrice:         z.number().nonnegative().optional(),
  agencyCommission:    z.number().min(0).max(100).optional(),
  callIntervalSeconds: z.number().int().positive().optional(),
  booking_status:      z.enum(['open', 'closed']).optional(),
}).refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'At least one field must be provided for update' }
);

const dividendItemSchema = z.object({
  name:         z.string().min(1, 'Dividend name is required'),
  patternType:  z.enum(
    DIVIDEND_PATTERN_TYPES,
    { errorMap: () => ({ message: `patternType must be one of: ${DIVIDEND_PATTERN_TYPES.join(', ')}` }) }
  ),
  active:       z.boolean({ required_error: 'active (boolean) is required' }),
  prizeAmount:  z.number({ required_error: 'prizeAmount is required' }).nonnegative(),
  sortOrder:    z.number({ required_error: 'sortOrder is required' }).int().nonnegative(),
});

// Body is the full dividends array (replaces all existing dividends)
const dividendsSchema = z.array(dividendItemSchema)
  .min(1, 'At least one dividend must be provided');

// ─── Router (mounted at /api/starttambola/tenants in index.js) ────────────────
const router = express.Router({ mergeParams: true });

// POST   /tenants/:tenantId/games
router.post(
  '/:tenantId/games',
  ...gameAuth,
  validateBody(createGameSchema),
  createGame
);

// PATCH  /tenants/:tenantId/games/:gameId
router.patch(
  '/:tenantId/games/:gameId',
  ...gameAuth,
  validateBody(updateGameSchema),
  updateGame
);

// POST   /tenants/:tenantId/games/:gameId/reset-tickets
router.post('/:tenantId/games/:gameId/reset-tickets', ...gameAuth, resetTickets);

// POST   /tenants/:tenantId/games/:gameId/reset-game
router.post('/:tenantId/games/:gameId/reset-game', ...gameAuth, resetGame);

// DELETE /tenants/:tenantId/games/:gameId
router.delete('/:tenantId/games/:gameId', ...gameAuth, deleteGame);

// PUT    /tenants/:tenantId/games/:gameId/dividends
router.put(
  '/:tenantId/games/:gameId/dividends',
  ...gameAuth,
  validateBody(dividendsSchema),
  upsertDividends
);

// GET    /tenants/:tenantId/games
router.get(
  '/:tenantId/games',
  ...gameAuth,
  getGamesList
);

// GET    /tenants/:tenantId/games/:gameId
router.get('/:tenantId/games/:gameId', ...gameAuth, getGame);

module.exports = router;
