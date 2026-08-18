const express = require('express');
const errorHandler = require('./middleware/errorHandler');
const { requireSuperAdminKey } = require('./middleware/superAdmin');

const healthRoutes       = require('./routes/health.routes');
const authRoutes         = require('./routes/auth.routes');
const webhooksRoutes     = require('./routes/webhooks.routes');
const checkoutRoutes     = require('./routes/checkout.routes');
const gamesRoutes        = require('./routes/games.routes');
const ticketsRoutes      = require('./routes/tickets.routes');
const bookingReqRoutes   = require('./routes/bookingRequests.routes');
const agentsRoutes       = require('./routes/agents.routes');
const gameEngineRoutes   = require('./routes/gameEngine.routes');
const themesRoutes       = require('./routes/themes.routes');
const jobsRoutes         = require('./routes/jobs.routes');
const { internalRouter: tenantsInternalRoutes,
        publicRouter:   tenantsPublicRoutes } = require('./routes/tenants.routes');
const { internalRouter: subscriptionsInternalRoutes,
        authenticatedRouter: subscriptionsAuthRoutes } = require('./routes/subscriptions.routes');

// ─── Bootstrap: start the subscription expiry scheduler ───────────────────────
// Runs checkAllExpiredSubscriptions every 15 minutes via setInterval.
// The .unref() inside ensures this won't keep the Node process alive on its own.
const { startScheduler } = require('./jobs/scheduler');
const { resumeRunningGames } = require('./jobs/resumeRunningGames');

// Boot sequence:
//  1. Start the subscription + booking expiry schedulers.
//  2. Start the game engine central tick loop (started when gameEngine.js is required above).
//  3. Resume any games that were 'running' when the server last shut down.
startScheduler();
// resumeRunningGames is async — run without await so it doesn't block route registration.
// The central tick loop will pick up resumed games as soon as they're in _gameState.
resumeRunningGames().catch((err) =>
  console.error('[Boot] resumeRunningGames failed:', err)
);

const router = express.Router();

// ─── Health ───────────────────────────────────────────────────────────────────
// GET /api/starttambola/health
router.use('/health', healthRoutes);

// ─── Auth ─────────────────────────────────────────────────────────────────────
// GET /api/starttambola/auth/me  (requires valid Supabase JWT)
router.use('/auth', authRoutes);

// ─── Webhooks (no auth — signature-verified) ──────────────────────────────────
// POST /api/starttambola/webhooks/razorpay
router.use('/webhooks', webhooksRoutes);

// ─── Public tenant routes (no auth) ──────────────────────────────────────────
// GET  /api/starttambola/tenants/by-domain/:domain
router.use('/tenants', tenantsPublicRoutes);

// ─── Authenticated tenant routes ─────────────────────────────────────────────
// POST /api/starttambola/tenants/:tenantId/checkout-session  (requireAuth + requireTenantMatch)
router.use('/tenants', checkoutRoutes);

// ─── Authenticated game routes (tenant_admin only) ────────────────────────────
// POST   /api/starttambola/tenants/:tenantId/games
// PATCH  /api/starttambola/tenants/:tenantId/games/:gameId
// POST   /api/starttambola/tenants/:tenantId/games/:gameId/reset-tickets
// POST   /api/starttambola/tenants/:tenantId/games/:gameId/reset-game
// PUT    /api/starttambola/tenants/:tenantId/games/:gameId/dividends
// GET    /api/starttambola/tenants/:tenantId/games/:gameId
router.use('/tenants', gamesRoutes);

// ─── Ticket routes ───────────────────────────────────────────────
// GET  /api/starttambola/tenants/:tenantId/games/:gameId/tickets            (public)
// POST /api/starttambola/tenants/:tenantId/games/:gameId/tickets/book-bulk  (agent)
// POST /api/starttambola/tenants/:tenantId/games/:gameId/tickets/:id/book-request (public)
// POST /api/starttambola/tenants/:tenantId/games/:gameId/tickets/:id/book-direct  (admin|agent)
router.use('/tenants', ticketsRoutes);

// ─── Booking request routes ─────────────────────────────────────────
// GET  /api/starttambola/tenants/:tenantId/booking-requests                 (admin)
// POST /api/starttambola/tenants/:tenantId/booking-requests/:id/approve     (admin)
// POST /api/starttambola/tenants/:tenantId/booking-requests/:id/reject      (admin)
router.use('/tenants', bookingReqRoutes);

// ─── Agent routes ───────────────────────────────────────────────
// GET  /api/starttambola/tenants/:tenantId/agents/me/performance  (agent-only)
// POST /api/starttambola/tenants/:tenantId/agents                 (admin)
// GET  /api/starttambola/tenants/:tenantId/agents                 (admin)
// PATCH /api/starttambola/tenants/:tenantId/agents/:agentId       (admin)
router.use('/tenants', agentsRoutes);

// ─── Game engine routes ─────────────────────────────────────────────
// POST /api/starttambola/tenants/:tenantId/games/:gameId/run    (admin)
// POST /api/starttambola/tenants/:tenantId/games/:gameId/stop   (admin)
// GET  /api/starttambola/tenants/:tenantId/games/:gameId/state  (public)
router.use('/tenants', gameEngineRoutes);

// ─── Subscription status (tenant_admin) ─────────────────────────────────────────────
// GET /api/starttambola/tenants/:tenantId/subscription-status (tenant_admin)
// No internal key needed — used by the admin dashboard badge.
router.use('/tenants', subscriptionsAuthRoutes);

// ─── Themes + Poster templates ──────────────────────────────────────────
// GET  /api/starttambola/themes                           (public)
// GET  /api/starttambola/poster-templates                 (public)
// PATCH /api/starttambola/tenants/:tenantId/theme         (admin)
// Mounted bare (no prefix) because paths span /themes and /tenants namespaces.
router.use(themesRoutes);

// ─── Internal routes (all require X-Internal-Key) ────────────────────────────
// POST   /api/starttambola/internal/tenants
// POST   /api/starttambola/internal/tenants/:id/activate
// POST   /api/starttambola/internal/tenants/:id/renew
// GET    /api/starttambola/internal/tenants/:id/subscription-status
// POST   /api/starttambola/internal/jobs/run-subscription-check
router.use('/internal/tenants', requireSuperAdminKey, tenantsInternalRoutes);
router.use('/internal/tenants', requireSuperAdminKey, subscriptionsInternalRoutes);
router.use('/internal/jobs',    requireSuperAdminKey, jobsRoutes);

// Future resource routes:
// router.use('/games',   requireAuth, gamesRoutes);
// router.use('/tickets', requireAuth, ticketsRoutes);
// router.use('/players', requireAuth, playersRoutes);
// router.use('/draws',   requireAuth, drawsRoutes);

// ─── Error handler (must be LAST — 4-arg signature) ──────────────────────────
router.use(errorHandler);

module.exports = router;
