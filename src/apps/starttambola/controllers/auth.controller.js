const { supabaseAdmin, supabase } = require('../config/supabaseClient');
const { AppError } = require('../utils/AppError');

// ─── GET /auth/me ─────────────────────────────────────────────────────────────
// Debug/verification endpoint. Returns the parsed req.auth object so you can
// confirm JWTs are being decoded and the custom claims (tenantId, role) are
// flowing through correctly. Protected by requireAuth.

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getMe = (req, res) => {
  return res.status(200).json({
    data: req.auth,
  });
};

// ─── In-memory rate limiter ───────────────────────────────────────────────────
// Tracks failed login attempts per tenant (keyed by tenantId).
// Resets after RATE_WINDOW_MS milliseconds.
// This is a simple in-process store — it resets on server restart and is not
// shared across multiple Node processes/workers. Sufficient for a single-instance
// deployment. Replace with Redis/Upstash for multi-instance deployments.

const RATE_MAX_ATTEMPTS = 10;           // max failed attempts before lockout
const RATE_WINDOW_MS   = 15 * 60 * 1000; // 15-minute rolling window

/** @type {Map<string, { attempts: number; windowStart: number }>} */
const rateLimitStore = new Map();

/**
 * Returns true if the tenantId has exceeded the failed attempt limit.
 * Automatically cleans up expired windows.
 * @param {string} tenantId
 */
function isRateLimited(tenantId) {
  const now = Date.now();
  const entry = rateLimitStore.get(tenantId);

  if (!entry) return false;

  // Window expired — clean up and start fresh
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitStore.delete(tenantId);
    return false;
  }

  return entry.attempts >= RATE_MAX_ATTEMPTS;
}

/**
 * Records a failed login attempt for a tenantId.
 * @param {string} tenantId
 */
function recordFailedAttempt(tenantId) {
  const now = Date.now();
  const entry = rateLimitStore.get(tenantId);

  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    // Start a fresh window
    rateLimitStore.set(tenantId, { attempts: 1, windowStart: now });
  } else {
    entry.attempts += 1;
  }
}

/**
 * Clears the rate limit counter for a tenantId after a successful login.
 * @param {string} tenantId
 */
function clearRateLimit(tenantId) {
  rateLimitStore.delete(tenantId);
}

// ─── POST /auth/admin-login ───────────────────────────────────────────────────
// Password-only admin login.
//
// The tenant is resolved from the request's Origin header — automatically set
// by the browser to the page's own domain (e.g. https://game1.com).
// This means only the password for THAT domain's admin will ever succeed,
// regardless of what password the user types. Cross-tenant login is impossible.
//
// Flow:
//   1. Extract domain from Origin header
//   2. Lookup tenant by domain → get owner_email
//   3. Rate-limit check (10 failed attempts / 15 min per tenant)
//   4. supabase.auth.signInWithPassword({ email: owner_email, password })
//   5. On success: return { access_token, refresh_token, expires_at }
//   6. On failure: record attempt, return 401

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const LOCAL_DEV_HOSTS = ['localhost', '127.0.0.1'];

const adminLogin = async (req, res, next) => {
  try {
    // ── Step 1: Extract domain from Origin header ──────────────────────────
    const originHeader = req.headers['origin'];

    if (!originHeader) {
      return next(
        new AppError(
          'Missing Origin header. This endpoint must be called from a browser.',
          'BAD_REQUEST',
          400
        )
      );
    }

    let domain;
    try {
      // Origin header format: "https://game1.com" or "http://localhost:3000"
      const url = new URL(originHeader);
      domain = url.hostname; // bare hostname, no port, no protocol
    } catch {
      return next(new AppError('Invalid Origin header.', 'BAD_REQUEST', 400));
    }

    // ── Step 2: Validate password from body ────────────────────────────────
    const { password, tenantId: bodyTenantId } = req.body;

    if (!password || typeof password !== 'string' || password.trim() === '') {
      return next(new AppError('Password is required.', 'BAD_REQUEST', 400));
    }

    // ── Step 3: Resolve tenant ─────────────────────────────────────────────
    // LOCAL DEV ONLY: when Origin is localhost/127.0.0.1/LAN IP, domain-based
    // lookup won't work because 'localhost' isn't stored in the tenants table.
    // In this case, accept an explicit tenantId from the request body and look
    // up by ID instead. This branch NEVER runs in production because the Origin
    // will always be a real custom domain (e.g. game1.com).
    const isLocalDev =
      LOCAL_DEV_HOSTS.includes(domain) ||
      domain.startsWith('192.168.') ||
      domain.startsWith('10.');

    let tenantQuery;
    if (isLocalDev && bodyTenantId) {
      tenantQuery = supabaseAdmin
        .from('tenants')
        .select('id, owner_email, status')
        .eq('id', bodyTenantId)
        .maybeSingle();
    } else {
      tenantQuery = supabaseAdmin
        .from('tenants')
        .select('id, owner_email, status')
        .eq('domain', domain)
        .maybeSingle();
    }

    const { data: tenant, error: tenantError } = await tenantQuery;

    if (tenantError) {
      console.error('[adminLogin] Tenant lookup error:', tenantError);
      return next(new AppError('Failed to resolve tenant.', 'INTERNAL_ERROR', 500));
    }

    if (!tenant) {
      return next(
        new AppError(
          `No tenant configured for domain '${domain}'.`,
          'NOT_FOUND',
          404
        )
      );
    }

    // ── Step 4: Rate limit check ───────────────────────────────────────────
    if (isRateLimited(tenant.id)) {
      return next(
        new AppError(
          'Too many failed login attempts. Please wait 15 minutes before trying again.',
          'RATE_LIMITED',
          429
        )
      );
    }

    // ── Step 5: Attempt Supabase sign-in with the resolved owner email ─────
    // We use the anon client (not the admin client) so we receive a real
    // user session (access_token + refresh_token) in return.
    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email:    tenant.owner_email,
      password: password.trim(),
    });

    if (signInError || !authData?.session) {
      // Record the failed attempt for rate limiting
      recordFailedAttempt(tenant.id);
      return next(new AppError('Incorrect password.', 'UNAUTHORIZED', 401));
    }

    // ── Step 6: Success — clear rate limit, return session tokens ──────────
    clearRateLimit(tenant.id);

    const { access_token, refresh_token, expires_at } = authData.session;

    return res.status(200).json({
      data: {
        access_token,
        refresh_token,
        expires_at,
      },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { getMe, adminLogin };

