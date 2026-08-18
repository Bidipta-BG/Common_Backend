const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { getMe } = require('../controllers/auth.controller');

// ─── GET /api/starttambola/auth/me ────────────────────────────────────────────
// Requires a valid Supabase JWT. Returns the parsed req.auth payload so you
// can verify token parsing and custom claim extraction are working correctly.
//
// Test with:
//   curl -H "Authorization: Bearer <jwt>" http://localhost:3001/api/starttambola/auth/me
router.get('/me', requireAuth, getMe);

module.exports = router;
