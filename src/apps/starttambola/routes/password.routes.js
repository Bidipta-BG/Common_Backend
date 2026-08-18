const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { updatePassword } = require('../controllers/password.controller');

// ─── POST /api/starttambola/password/update ─────────────────────────────────────
// Requires a valid Supabase JWT.
// Expects JSON body: { "oldPassword": "...", "newPassword": "..." }
//
// Test with:
//   curl -X POST -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" -d '{"oldPassword":"...", "newPassword":"..."}' http://localhost:3001/api/starttambola/password/update
router.post('/update', requireAuth, updatePassword);

module.exports = router;
