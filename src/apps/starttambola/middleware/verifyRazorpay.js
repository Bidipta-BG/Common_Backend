const crypto = require('crypto');
const { AppError } = require('../utils/AppError');

// ─── verifyRazorpaySignature ──────────────────────────────────────────────────
// Razorpay signs each webhook payload with HMAC-SHA256 using the webhook secret.
// The signature arrives in the X-Razorpay-Signature header.
//
// Spec: https://razorpay.com/docs/webhooks/validate-test/
//   expectedSignature = HMAC-SHA256( rawBody, RAZORPAY_WEBHOOK_SECRET )
//
// CRITICAL: This MUST use req.rawBody (the raw Buffer captured by the
// express.json() verify callback in src/app.js). Using JSON.stringify(req.body)
// will fail because key ordering or whitespace may differ from what Razorpay signed.

const verifyRazorpayWebhook = (req, res, next) => {
  const receivedSignature = req.headers['x-razorpay-signature'];

  if (!receivedSignature) {
    return next(new AppError('Missing X-Razorpay-Signature header', 'WEBHOOK_SIGNATURE_MISSING', 400));
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Webhook] RAZORPAY_WEBHOOK_SECRET is not set — rejecting all webhook calls.');
    return next(new AppError('Webhook secret not configured on server', 'INTERNAL_ERROR', 500));
  }

  if (!req.rawBody) {
    // This means app.js's verify callback didn't run — should never happen in prod.
    console.error('[Webhook] req.rawBody is undefined — check express.json() verify callback in src/app.js.');
    return next(new AppError('Raw body unavailable for signature verification', 'INTERNAL_ERROR', 500));
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(req.rawBody)
    .digest('hex');

  // Use timingSafeEqual to prevent timing-based side-channel attacks.
  const expected = Buffer.from(expectedSignature, 'hex');
  const received = Buffer.from(receivedSignature, 'hex');

  const signaturesMatch =
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received);

  if (!signaturesMatch) {
    console.warn('[Webhook] Razorpay signature mismatch — rejecting request.');
    return next(new AppError('Webhook signature verification failed', 'WEBHOOK_SIGNATURE_INVALID', 400));
  }

  return next();
};

module.exports = { verifyRazorpayWebhook };
