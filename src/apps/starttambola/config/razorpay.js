const Razorpay = require('razorpay');

// ─── Razorpay SDK client ──────────────────────────────────────────────────────
// Shared singleton used by both checkout (order creation) and any future
// Razorpay API calls (refunds, fetch order, etc.).

const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.warn('[Razorpay] Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET — Razorpay features will fail at runtime.');
}

const razorpayClient = new Razorpay({
  key_id:     RAZORPAY_KEY_ID  || '',
  key_secret: RAZORPAY_KEY_SECRET || '',
});

module.exports = { razorpayClient };
