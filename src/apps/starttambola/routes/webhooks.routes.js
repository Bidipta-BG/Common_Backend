const express = require('express');
const { verifyRazorpayWebhook } = require('../middleware/verifyRazorpay');
const { handleRazorpayWebhook } = require('../controllers/webhooks.controller');

const router = express.Router();

// ─── POST /webhooks/razorpay ──────────────────────────────────────────────────
// NO auth middleware — Razorpay calls this directly.
// Security is enforced via HMAC-SHA256 signature verification (verifyRazorpayWebhook).
// Returns 400 if signature is invalid; 200 for all successfully verified events
// (including unhandled ones — Razorpay retries on non-2xx).
router.post('/razorpay', verifyRazorpayWebhook, handleRazorpayWebhook);

module.exports = router;
