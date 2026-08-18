const { supabaseAdmin } = require('../config/supabaseClient');
const { handleSupabaseError } = require('../utils/supabaseError');

// ─── insertPayment ────────────────────────────────────────────────────────────
// Inserts a row into the `payments` table.
// Amount is stored in paise (the unit Razorpay uses) to avoid floating-point
// rounding on monetary values — convert to rupees at display time.
//
// @param {object} params
// @param {string} params.tenantId
// @param {string|null} params.subscriptionId
// @param {number} params.amountPaise           — as sent by Razorpay
// @param {string} params.currency              — e.g. 'INR'
// @param {string} params.gatewayTransactionId  — Razorpay payment ID (pay_xxx)
// @param {'success'|'failed'} params.status
// @param {object} [params.metadata]            — raw Razorpay payload for audit

const insertPayment = async ({
  tenantId,
  subscriptionId,
  amountPaise,
  currency,
  gatewayTransactionId,
  status,
  metadata = null,
}) => {
  const { data, error } = await supabaseAdmin
    .from('payments')
    .insert({
      tenant_id:              tenantId,
      subscription_id:        subscriptionId  || null,
      amount:                 amountPaise,
      currency,
      payment_gateway:        'razorpay',
      gateway_transaction_id: gatewayTransactionId,
      status,
      metadata,               // JSON column — store raw payload for audit/debugging
    })
    .select()
    .single();

  if (error) handleSupabaseError(error, 'Payment');
  return data;
};

module.exports = { insertPayment };
