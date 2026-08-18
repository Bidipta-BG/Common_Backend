const { razorpayClient } = require('../config/razorpay');
const { supabaseAdmin } = require('../config/supabaseClient');
const { PLAN_PRICES_PAISE, PLAN_CURRENCY, PLAN_LABELS, isValidPlan } = require('../utils/plans');
const { AppError } = require('../utils/AppError');
const { handleSupabaseError } = require('../utils/supabaseError');

// ─── createCheckoutOrder ──────────────────────────────────────────────────────
// Creates a Razorpay order for the tenant's chosen plan.
// The tenant's subscription_id is embedded in order notes so the webhook
// can look it up without any additional DB call.
//
// Returns Razorpay's order object — the frontend passes id, amount, currency,
// and key_id to Razorpay's checkout.js to open the payment modal.

const createCheckoutOrder = async (tenantId, plan) => {
  if (!isValidPlan(plan)) {
    throw new AppError(
      `Invalid plan '${plan}'. Allowed: ${Object.keys(PLAN_PRICES_PAISE).join(', ')}`,
      'BAD_REQUEST',
      400
    );
  }

  // Fetch the tenant's current subscription so we can embed subscription_id in notes.
  const { data: subscription, error: subError } = await supabaseAdmin
    .from('subscriptions')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .single();

  if (subError) handleSupabaseError(subError, 'Subscription');

  const amountPaise = PLAN_PRICES_PAISE[plan];
  const receipt     = `rcpt_${tenantId.slice(0, 8)}_${Date.now()}`;

  // Create Razorpay order — this does NOT charge the customer.
  // The frontend uses the returned `id` to open Razorpay checkout.
  const order = await razorpayClient.orders.create({
    amount:   amountPaise,
    currency: PLAN_CURRENCY,
    receipt,
    notes: {
      tenant_id:       tenantId,
      subscription_id: subscription.id,
      plan,
    },
  });

  return {
    orderId:        order.id,
    amount:         order.amount,          // paise
    amountDisplay:  order.amount / 100,    // rupees — for frontend display
    currency:       order.currency,
    plan,
    planLabel:      PLAN_LABELS[plan],
    receipt:        order.receipt,
    // The frontend also needs the Razorpay public key to initialise checkout.js
    razorpayKeyId:  process.env.RAZORPAY_KEY_ID,
  };
};

module.exports = { createCheckoutOrder };
