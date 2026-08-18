const paymentsService = require('../services/payments.service');

// ─── Razorpay event type constants ────────────────────────────────────────────
const EVENT_PAYMENT_CAPTURED = 'payment.captured';
const EVENT_PAYMENT_FAILED   = 'payment.failed';

// ─── _extractPaymentFields ────────────────────────────────────────────────────
// Parses the Razorpay webhook payload to extract the fields we need for the
// payments table. Returns null if the payload shape is unexpected.
//
// Razorpay payload structure:
// {
//   event: 'payment.captured',
//   payload: {
//     payment: {
//       entity: {
//         id: 'pay_xxx',
//         amount: 460000,       ← paise
//         currency: 'INR',
//         order_id: 'order_xxx',
//         notes: { tenant_id, subscription_id, plan }
//       }
//     }
//   }
// }

const _extractPaymentFields = (body) => {
  const entity = body?.payload?.payment?.entity;
  if (!entity) return null;

  return {
    tenantId:             entity.notes?.tenant_id        || null,
    subscriptionId:       entity.notes?.subscription_id  || null,
    amountPaise:          entity.amount,
    currency:             entity.currency  || 'INR',
    gatewayTransactionId: entity.id,
  };
};

// ─── POST /webhooks/razorpay ──────────────────────────────────────────────────
// Entry point for all Razorpay webhook events.
// Signature is already verified by verifyRazorpayWebhook middleware before
// this controller runs — no additional auth needed here.
//
// Razorpay retries on any non-2xx response, so we ALWAYS return 200 unless
// the signature failed (400, handled in middleware). Even on DB errors we log
// and return 200 to prevent infinite Razorpay retries on a bad payload.

const handleRazorpayWebhook = async (req, res) => {
  const event = req.body?.event;

  // ── payment.captured — money arrived, record success ────────────────────
  if (event === EVENT_PAYMENT_CAPTURED) {
    const fields = _extractPaymentFields(req.body);

    if (!fields || !fields.tenantId || !fields.gatewayTransactionId) {
      console.error('[Webhook] payment.captured — could not extract required fields from payload:', JSON.stringify(req.body));
      // Still return 200 — don't let Razorpay retry a malformed payload forever
      return res.status(200).json({ received: true, warning: 'payload_parse_error' });
    }

    try {
      await paymentsService.insertPayment({
        ...fields,
        status:   'success',
        metadata: req.body,  // store raw payload for audit
      });

      console.log(`[Webhook] payment.captured recorded — tenantId: ${fields.tenantId}, txn: ${fields.gatewayTransactionId}`);
      // NOTE: Tenant activation is NOT triggered here. Your team manually calls
      // POST /internal/tenants/:id/activate once the domain is ready.
    } catch (err) {
      console.error('[Webhook] Failed to insert success payment record:', err.message);
    }

    return res.status(200).json({ received: true });
  }

  // ── payment.failed — record the failure, nothing else ───────────────────
  if (event === EVENT_PAYMENT_FAILED) {
    const fields = _extractPaymentFields(req.body);

    if (!fields || !fields.gatewayTransactionId) {
      console.error('[Webhook] payment.failed — could not extract required fields:', JSON.stringify(req.body));
      return res.status(200).json({ received: true, warning: 'payload_parse_error' });
    }

    try {
      await paymentsService.insertPayment({
        ...fields,
        status:   'failed',
        metadata: req.body,
      });

      console.log(`[Webhook] payment.failed recorded — tenantId: ${fields.tenantId || 'unknown'}, txn: ${fields.gatewayTransactionId}`);
    } catch (err) {
      console.error('[Webhook] Failed to insert failed payment record:', err.message);
    }

    return res.status(200).json({ received: true });
  }

  // ── Unhandled event type — log and acknowledge ───────────────────────────
  // Razorpay sends many event types (order.paid, subscription.charged, etc.).
  // Log them for visibility; returning 200 prevents Razorpay from retrying.
  console.log(`[Webhook] Unhandled Razorpay event: '${event || 'unknown'}' — acknowledged without action.`);
  return res.status(200).json({ received: true, event: event || 'unknown' });
};

module.exports = { handleRazorpayWebhook };
