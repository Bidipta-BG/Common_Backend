const express = require('express');
const { validateBody, z } = require('../utils/validateBody');
const {
  adminUpdateTenant,
  checkAvailability,
  createTenant,
  getAllTenants,
  getByDomain,
  getTenantById,
  markTenantAsPaid,
  updateTenant,
  getTenantGames,
  getGameDividendsForAdmin,
  updateGameDividendsForAdmin,
} = require('../controllers/tenants.controller');
const { getCurrentGame } = require('../controllers/games.controller');

// ─── Zod schema: POST /internal/tenants ──────────────────────────────────────
const createTenantSchema = z.object({
  businessName: z.string().min(1, 'businessName is required'),
  domain:       z.string().min(1, 'domain is required')
                  .regex(
                    /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/i,
                    'domain must be a valid hostname (e.g. mystore.tambola.com)'
                  ),
  ownerName:    z.string().min(1, 'ownerName is required'),
  ownerEmail:   z.string().email('ownerEmail must be a valid email address'),
  ownerPhone:   z.string().min(6, 'ownerPhone is required'),
  ownerPassword: z.string().min(4, 'ownerPassword must be at least 4 characters').optional(),
  plan:         z.string().min(1, 'plan is required'),
  themeId:      z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, 'themeId must be a valid UUID').optional(),
  referralCode: z.string().optional(),
});

// ─── Zod schema: POST /internal/tenants/check-availability ───────────────────
const checkAvailabilitySchema = z.object({
  email:  z.string().email('email must be a valid email address'),
  phone:  z.string().min(6, 'phone is required'),
  domain: z.string().min(1, 'domain is required'),
});

// ─── Zod schema: PATCH /internal/tenants/:tenantId ───────────────────────────
const adminUpdateSchema = z.object({
  status: z.enum(['pending_activation', 'active', 'expired', 'suspended']).optional(),
  start_date: z.string().optional(),
  expiry_date: z.string().optional(),
  organizer_whatsapp_number: z.string().optional().nullable(),
});

const adminUpdateDividendsSchema = z.object({
  dividends: z.array(
    z.object({
      id: z.string().uuid(),
      prizeAmount: z.number().nonnegative().optional(),
      prize_amount: z.number().nonnegative().optional(),
      targetTicketNumber: z.number().int().positive().nullable().optional(),
      target_ticket_number: z.number().int().positive().nullable().optional(),
    })
  ).min(1, 'dividends array must be non-empty'),
});

// ─── Internal router (mounted at /api/starttambola/internal/tenants) ──────────
// All routes here require requireSuperAdminKey (applied at mount in index.js).
const internalRouter = express.Router();

// GET /internal/tenants
// Fetches all tenants and their subscriptions (Admin Dashboard)
internalRouter.get('/', getAllTenants);

// PATCH /internal/tenants/:tenantId
// Updates tenant and subscription details (Admin Dashboard)
internalRouter.patch('/:tenantId', validateBody(adminUpdateSchema), adminUpdateTenant);

// GET /internal/tenants/:tenantId/games
internalRouter.get('/:tenantId/games', getTenantGames);

// GET /internal/tenants/:tenantId/games/:gameId/dividends
internalRouter.get('/:tenantId/games/:gameId/dividends', getGameDividendsForAdmin);

// PATCH /internal/tenants/:tenantId/games/:gameId/dividends
internalRouter.patch(
  '/:tenantId/games/:gameId/dividends',
  validateBody(adminUpdateDividendsSchema),
  updateGameDividendsForAdmin
);

// POST /internal/tenants/:tenantId/mark-paid
// Marks a tenant and its bumper subscription as paid
internalRouter.post('/:tenantId/mark-paid', markTenantAsPaid);

// POST /internal/tenants/check-availability  ← must be registered BEFORE /:id routes
internalRouter.post('/check-availability', validateBody(checkAvailabilitySchema), checkAvailability);

// POST /internal/tenants
// Creates tenant + subscription + Supabase Auth owner user.
internalRouter.post('/', validateBody(createTenantSchema), createTenant);

// ─── Public router (mounted at /api/starttambola/tenants) ───────────────────────────────
// No authentication required.
const publicRouter = express.Router();

// GET /tenants/by-domain/:domain
// Resolves a tenant from a custom domain. Used by the Next.js middleware.
publicRouter.get('/by-domain/:domain', getByDomain);

// GET /tenants/:tenantId/games/current
// Returns the most relevant game for the player page.
// IMPORTANT: This must be registered BEFORE any route with /:tenantId/games/:gameId
// to prevent the literal string 'current' being matched as a gameId.
publicRouter.get('/:tenantId/games/current', getCurrentGame);

const { requireAuth, requireRole, requireTenantMatch } = require('../middleware/auth');

// GET /tenants/:tenantId
// Full public tenant details (branding, theme, whatsapp_number).
// Used by the player page when it already knows the tenantId from middleware.
publicRouter.get('/:tenantId', getTenantById);

// PATCH /tenants/:tenantId
// Updates tenant details (like WhatsApp number or Theme ID).
// Requires tenant_admin role and matching tenantId.
const tenantAuth = [requireAuth, requireRole('tenant_admin'), requireTenantMatch];
const updateTenantSchema = z.object({
  theme_id: z.string().optional().nullable(),
  organizer_whatsapp_number: z.string().optional().nullable(),
  organizer_whatsapp_group_link: z.string().optional().nullable(),
  website_status: z.enum(['open', 'closed']).optional(),
  announcement_text: z.string().optional().nullable(),
  owner_name: z.string().min(1).optional(),
  owner_phone: z.string().min(6).optional(),
  recovery_email: z.string().email().optional().nullable(),
  telegram_link: z.string().optional().nullable(),
  whatsapp_active: z.boolean().optional(),
  telegram_active: z.boolean().optional(),
  game_name: z.string().min(1).max(100).optional(),
  owner_password: z.string().min(4).optional().nullable(),
});

publicRouter.patch(
  '/:tenantId',
  ...tenantAuth,
  validateBody(updateTenantSchema),
  updateTenant
);

module.exports = { internalRouter, publicRouter };
