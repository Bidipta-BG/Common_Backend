const { supabaseAdmin } = require('../config/supabaseClient');
const { AppError } = require('../utils/AppError');
const { handleSupabaseError } = require('../utils/supabaseError');

// ─── Helper: get tenant or throw 404 ─────────────────────────────────────────
const _getTenant = async (tenantId) => {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single();

  if (error) handleSupabaseError(error, 'Tenant');
  return data;
};

// ─── Helper: get subscription for a tenant or throw 404 ──────────────────────
const _getSubscription = async (tenantId) => {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();

  if (error) handleSupabaseError(error, 'Subscription');
  return data;
};

// ─── Helper: call the Postgres RPC for expiry computation ────────────────────
// Delegates date math entirely to the DB function so JS never re-implements it.
// Function signature: compute_subscription_expiry(plan text, start_date timestamptz)
const _computeExpiry = async (plan, startDate) => {
  const { data: expiryDate, error: rpcError } = await supabaseAdmin
    .rpc('compute_subscription_expiry', { plan, start_date: startDate });

  if (rpcError) {
    throw new AppError(
      `Failed to compute subscription expiry: ${rpcError.message}`,
      'RPC_ERROR',
      500
    );
  }

  return expiryDate;
};

// ─── activateTenant ───────────────────────────────────────────────────────────
// Activates a pending tenant + its subscription.
// - Sets tenant.status = 'active'
// - Sets subscription.start_date = now(), computes expiry_date via RPC,
//   sets subscription.status = 'active'

const activateTenant = async (tenantId) => {
  const subscription = await _getSubscription(tenantId);

  const startDate = new Date().toISOString();
  const expiryDate = await _computeExpiry(subscription.plan, startDate);

  // Update subscription
  const { data: updatedSub, error: subUpdateError } = await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'active', start_date: startDate, expiry_date: expiryDate })
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (subUpdateError) handleSupabaseError(subUpdateError, 'Subscription');

  // Update tenant status
  const { data: updatedTenant, error: tenantUpdateError } = await supabaseAdmin
    .from('tenants')
    .update({ status: 'active' })
    .eq('id', tenantId)
    .select()
    .single();

  if (tenantUpdateError) handleSupabaseError(tenantUpdateError, 'Tenant');

  return { tenant: updatedTenant, subscription: updatedSub };
};

// ─── renewSubscription ────────────────────────────────────────────────────────
// Renews (or upgrades) a subscription. Allowed only if tenant is 'active' or
// 'suspended'. If 'suspended', flips tenant status back to 'active'.
// Sets a brand-new start_date and recomputes expiry_date via the same RPC.

const renewSubscription = async (tenantId, plan) => {
  const tenant = await _getTenant(tenantId);

  if (!['active', 'suspended'].includes(tenant.status)) {
    throw new AppError(
      `Cannot renew: tenant status is '${tenant.status}'. Must be 'active' or 'suspended'.`,
      'BAD_REQUEST',
      400
    );
  }

  const startDate  = new Date().toISOString();
  const expiryDate = await _computeExpiry(plan, startDate);

  // Update subscription
  const { data: updatedSub, error: subError } = await supabaseAdmin
    .from('subscriptions')
    .update({ plan, status: 'active', start_date: startDate, expiry_date: expiryDate })
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (subError) handleSupabaseError(subError, 'Subscription');

  // Re-activate tenant if it was suspended
  let updatedTenant = tenant;
  if (tenant.status === 'suspended') {
    const { data: t, error: tErr } = await supabaseAdmin
      .from('tenants')
      .update({ status: 'active' })
      .eq('id', tenantId)
      .select()
      .single();

    if (tErr) handleSupabaseError(tErr, 'Tenant');
    updatedTenant = t;
  }

  return { tenant: updatedTenant, subscription: updatedSub };
};

// ─── getSubscriptionStatus ────────────────────────────────────────────────────
// Returns countdown data for the admin panel subscription badge.
// daysRemaining and hoursRemaining are floored and never negative.

const getSubscriptionStatus = async (tenantId) => {
  const { data: sub, error } = await supabaseAdmin
    .from('subscriptions')
    .select('status, plan, expiry_date')
    .eq('tenant_id', tenantId)
    .single();

  if (error) handleSupabaseError(error, 'Subscription');

  const now = Date.now();
  const expiryMs  = sub.expiry_date ? new Date(sub.expiry_date).getTime() : now;
  const msLeft    = Math.max(0, expiryMs - now);

  return {
    status:         sub.status,
    plan:           sub.plan,
    expiryDate:     sub.expiry_date,
    daysRemaining:  Math.floor(msLeft / (1000 * 60 * 60 * 24)),
    hoursRemaining: Math.floor(msLeft / (1000 * 60 * 60)),
  };
};

module.exports = { activateTenant, renewSubscription, getSubscriptionStatus };
