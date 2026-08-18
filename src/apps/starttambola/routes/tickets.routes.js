const express = require('express');
const { z } = require('zod');
const { validateBody } = require('../utils/validateBody');
const { requireAuth, requireRole, requireTenantMatch } = require('../middleware/auth');
const { listTickets, listAdminTickets, bookRequest, bookDirect, bookBulk } = require('../controllers/tickets.controller');

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const bookRequestSchema = z.object({
  playerName:  z.string().min(1, 'playerName is required'),
  playerPhone: z.string().min(6, 'playerPhone is required'),
  source:      z.enum(['app', 'whatsapp']).default('app'),
});

const bookDirectSchema = z.object({
  playerName:  z.string().min(1, 'playerName is required'),
  playerPhone: z.string().min(6, 'playerPhone is required'),
});

const bookBulkSchema = z.object({
  ticketIds:   z.array(z.string().uuid('Each ticketId must be a valid UUID'))
                  .min(1, 'ticketIds must contain at least one ticket'),
  playerName:  z.string().min(1, 'playerName is required'),
  playerPhone: z.string().min(6, 'playerPhone is required'),
});

// ─── Router (mounted at /api/starttambola/tenants in index.js) ────────────────
const router = express.Router();

// ── PUBLIC ROUTES (no auth) ───────────────────────────────────────────────────

// GET  /tenants/:tenantId/games/:gameId/tickets
// Returns id, ticket_number, status, grid — never PII.
router.get('/:tenantId/games/:gameId/tickets', listTickets);

// ── IMPORTANT: book-bulk comes BEFORE /:ticketId routes ──────────────────────
// Express matches routes in registration order. If /:ticketId/... came first,
// "book-bulk" would be captured as a ticketId value, causing a routing error.

// POST /tenants/:tenantId/games/:gameId/tickets/book-bulk  (agent only)
router.post(
  '/:tenantId/games/:gameId/tickets/book-bulk',
  requireAuth,
  requireRole('agent'),
  requireTenantMatch,
  validateBody(bookBulkSchema),
  bookBulk
);

// ── PUBLIC ROUTES (no auth, after book-bulk) ─────────────────────────────────

// POST /tenants/:tenantId/games/:gameId/tickets/:ticketId/book-request
// Player self-service — public.
router.post(
  '/:tenantId/games/:gameId/tickets/:ticketId/book-request',
  validateBody(bookRequestSchema),
  bookRequest
);

// ─── PROTECTED ROUTES ──────────────────────────────────────────────────────────

// GET /tenants/:tenantId/games/:gameId/admin-tickets
// Returns all tickets including PII (player name/phone)
router.get(
  '/:tenantId/games/:gameId/admin-tickets',
  requireAuth,
  requireRole('tenant_admin', 'agent'),
  requireTenantMatch,
  listAdminTickets
);

// POST /tenants/:tenantId/games/:gameId/tickets/:ticketId/book-direct
// Admin or agent booking on behalf of a player.
router.post(
  '/:tenantId/games/:gameId/tickets/:ticketId/book-direct',
  requireAuth,
  requireRole('tenant_admin', 'agent'),
  requireTenantMatch,
  validateBody(bookDirectSchema),
  bookDirect
);

module.exports = router;
