const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { getMe, adminLogin } = require('../controllers/auth.controller');

// ─── GET /api/starttambola/auth/me ────────────────────────────────────────────
// Requires a valid Supabase JWT. Returns the parsed req.auth payload so you
// can verify token parsing and custom claim extraction are working correctly.
//
// Test with:
//   curl -H "Authorization: Bearer <jwt>" http://localhost:3001/api/starttambola/auth/me
router.get('/me', requireAuth, getMe);

// ─── POST /api/starttambola/auth/admin-login ──────────────────────────────────
// Public route — no JWT required (this IS the login endpoint).
// Resolves the tenant from the request's Origin header (automatically set by
// the browser to the game's custom domain, e.g. https://game1.com).
// Accepts: { password: string }
// Returns: { access_token, refresh_token, expires_at } on success.
//
// Test with:
//   curl -X POST \
//     -H "Content-Type: application/json" \
//     -H "Origin: https://yourgame.com" \
//     -d '{"password":"yourpassword"}' \
//     http://localhost:3001/api/starttambola/auth/admin-login
router.post('/admin-login', adminLogin);

module.exports = router;
