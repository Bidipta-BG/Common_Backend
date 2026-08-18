const { supabaseAdmin } = require('../config/supabaseClient');
const { AppError } = require('../utils/AppError');

// ─── requireAuth ──────────────────────────────────────────────────────────────
// Verifies the incoming Supabase JWT from Authorization: Bearer <token>.
// On success, attaches { userId, tenantId, role } to req.auth.
// Returns 401 if the token is missing, malformed, expired, or if the user's
// app_metadata is missing the required custom claims (tenant_id, role).
//
// app_metadata is set server-side only — never editable by the user — so these
// claims are trusted once the JWT signature is verified.

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(
        new AppError('Missing or invalid Authorization header', 'UNAUTHORIZED', 401)
      );
    }

    const token = authHeader.split(' ')[1];

    // supabaseAdmin.auth.getUser(token) validates the JWT signature against
    // the Supabase project's secret and returns the decoded user object.
    // Using the admin client avoids any RLS restrictions during auth checks.
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return next(new AppError('Invalid or expired token', 'UNAUTHORIZED', 401));
    }

    const tenantId = user.app_metadata?.tenant_id;
    const role     = user.app_metadata?.role;

    if (!tenantId || !role) {
      return next(
        new AppError(
          'Token is missing required claims (tenant_id, role). ' +
          'Ensure app_metadata is populated server-side.',
          'UNAUTHORIZED',
          401
        )
      );
    }

    req.auth = {
      userId:   user.id,
      tenantId: tenantId,
      role:     role,      // 'tenant_admin' | 'agent'
    };

    return next();
  } catch (err) {
    return next(err);
  }
};

// ─── requireRole ──────────────────────────────────────────────────────────────
// Middleware factory — must run AFTER requireAuth.
// Returns 403 if req.auth.role is not in the allowed list.
//
// Usage:
//   router.get('/settings', requireAuth, requireRole('tenant_admin'), handler);
//   router.get('/tickets',  requireAuth, requireRole('tenant_admin', 'agent'), handler);

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.auth) {
      return next(new AppError('Authentication required', 'UNAUTHORIZED', 401));
    }

    if (!roles.includes(req.auth.role)) {
      return next(
        new AppError(
          `Access denied. Allowed roles: [${roles.join(', ')}]. Your role: '${req.auth.role}'.`,
          'FORBIDDEN',
          403
        )
      );
    }

    return next();
  };
};

// ─── requireTenantMatch ───────────────────────────────────────────────────────
// For routes with a :tenantId param. Confirms req.auth.tenantId === :tenantId
// so a tenant_admin or agent can only operate on their own tenant's data.
//
// Super-admin requests bypass this check (req.isSuperAdmin flag set by
// requireSuperAdminKey middleware). This allows internal tooling to call
// cross-tenant endpoints with the same route signature.
//
// Must run AFTER requireAuth (or requireSuperAdminKey for super-admin paths).
//
// Usage:
//   router.get('/:tenantId/games', requireAuth, requireTenantMatch, handler);

const requireTenantMatch = (req, res, next) => {
  // Super-admin bypass — flag is set by requireSuperAdminKey
  if (req.isSuperAdmin) return next();

  if (!req.auth) {
    return next(new AppError('Authentication required', 'UNAUTHORIZED', 401));
  }

  const paramTenantId = req.params.tenantId;

  if (!paramTenantId) {
    // Programmer error — this middleware was applied to a route without :tenantId
    return next(
      new AppError('Route is missing :tenantId param', 'INTERNAL_ERROR', 500)
    );
  }

  if (req.auth.tenantId !== paramTenantId) {
    return next(
      new AppError(
        'You do not have access to this tenant',
        'FORBIDDEN',
        403
      )
    );
  }

  return next();
};

module.exports = { requireAuth, requireRole, requireTenantMatch };
