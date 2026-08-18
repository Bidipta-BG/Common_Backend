const express = require('express');
const { validateBody, z } = require('../utils/validateBody');
const {
  activate,
  renew,
  subscriptionStatus,
  tenantAdminSubscriptionStatus,
} = require('../controllers/subscriptions.controller');
const { requireAuth, requireRole, requireTenantMatch } = require('../middleware/auth');

// ─── Zod schema: POST /internal/tenants/:id/renew ────────────────────────────
const renewSchema = z.object({
  plan: z.string().min(1, 'plan is required'),
});

// ─── Internal router (mounted at /internal/tenants, behind requireSuperAdminKey) ──
// All routes here already require the X-Internal-Key header at mount.
const internalRouter = express.Router();

// POST /internal/tenants/:id/activate
// Sets tenant active, computes subscription dates via Postgres RPC.
internalRouter.post('/:id/activate', activate);

// POST /internal/tenants/:id/renew
// Renews (or upgrades) subscription; re-activates suspended tenants.
internalRouter.post('/:id/renew', validateBody(renewSchema), renew);

// GET /internal/tenants/:id/subscription-status
// Returns { status, plan, expiryDate, daysRemaining, hoursRemaining }.
internalRouter.get('/:id/subscription-status', subscriptionStatus);

// ─── Authenticated router (mounted at /tenants, requires JWT) ─────────────────
// Tenant-admin-safe subscription status — no internal key needed.
const authenticatedRouter = express.Router();

// GET /tenants/:tenantId/subscription-status
// Used by the admin dashboard's subscription countdown badge.
authenticatedRouter.get(
  '/:tenantId/subscription-status',
  requireAuth,
  requireRole('tenant_admin'),
  requireTenantMatch,
  tenantAdminSubscriptionStatus
);

module.exports = { internalRouter, authenticatedRouter };
