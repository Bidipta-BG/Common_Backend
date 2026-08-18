const { AppError } = require('../utils/AppError');

// ─── requireSuperAdminKey ─────────────────────────────────────────────────────
// Checks a static internal API key from the SUPER_ADMIN_API_KEY environment
// variable, expected in the X-Internal-Key request header.
//
// Use this ONLY on endpoints called by your own internal admin tooling
// (e.g. tenant activation, cross-tenant subscription checks).
// Never expose these routes to tenant admins or agents.
//
// On success, sets req.isSuperAdmin = true so that downstream middleware
// (e.g. requireTenantMatch) can grant cross-tenant access.
//
// Usage (internal-only route):
//   router.post('/tenants/:tenantId/activate', requireSuperAdminKey, handler);
//
// Usage (combined — allows either a super-admin key OR an authenticated user):
//   router.get('/:tenantId/data', requireSuperAdminKey, handler);
//   // OR: requireAuth + requireTenantMatch (super-admin bypass is built into requireTenantMatch)

const requireSuperAdminKey = (req, res, next) => {
  const incomingKey = req.headers['x-internal-key'];

  if (!incomingKey) {
    return next(
      new AppError('Missing X-Internal-Key header', 'UNAUTHORIZED', 401)
    );
  }

  const expectedKey = process.env.SUPER_ADMIN_API_KEY;

  if (!expectedKey) {
    // Misconfiguration — fail closed rather than open
    console.error('[SuperAdmin] SUPER_ADMIN_API_KEY is not set in environment');
    return next(
      new AppError('Server misconfiguration: super-admin key not configured', 'INTERNAL_ERROR', 500)
    );
  }

  if (incomingKey !== expectedKey) {
    return next(
      new AppError('Invalid internal API key', 'FORBIDDEN', 403)
    );
  }

  // Flag used by requireTenantMatch to grant cross-tenant access
  req.isSuperAdmin = true;
  return next();
};

module.exports = { requireSuperAdminKey };
