const subscriptionsService = require('../services/subscriptions.service');

// ─── POST /internal/tenants/:id/activate ─────────────────────────────────────
const activate = async (req, res, next) => {
  try {
    const result = await subscriptionsService.activateTenant(req.params.id);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── POST /internal/tenants/:id/renew ────────────────────────────────────────
const renew = async (req, res, next) => {
  try {
    const result = await subscriptionsService.renewSubscription(req.params.id, req.body.plan);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /internal/tenants/:id/subscription-status ───────────────────────────
const subscriptionStatus = async (req, res, next) => {
  try {
    const result = await subscriptionsService.getSubscriptionStatus(req.params.id);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /tenants/:tenantId/subscription-status (tenant_admin) ────────────────────
// Tenant-admin-safe version of the same data returned by the internal endpoint.
// Uses req.params.tenantId (from the /:tenantId URL segment) instead of
// req.params.id. Auth is enforced by requireAuth + requireRole('tenant_admin')
// + requireTenantMatch at the route level — no internal key needed here.
const tenantAdminSubscriptionStatus = async (req, res, next) => {
  try {
    const result = await subscriptionsService.getSubscriptionStatus(req.params.tenantId);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
};

module.exports = { activate, renew, subscriptionStatus, tenantAdminSubscriptionStatus };

