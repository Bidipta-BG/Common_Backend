const { supabaseAdmin } = require('../config/supabaseClient');

// ─── _suspendTenant ───────────────────────────────────────────────────────────
// Internal helper shared by both the periodic sweep and the game-completion hook.
// Sets subscription.status = 'expired' and tenant.status = 'suspended'.
// Logs the outcome — does NOT throw on DB error (jobs should be fault-tolerant).

const _suspendTenant = async (tenantId) => {
  const [subResult, tenantResult] = await Promise.all([
    supabaseAdmin
      .from('subscriptions')
      .update({ status: 'expired' })
      .eq('tenant_id', tenantId)
      .eq('status', 'active'), // guard: only expire if still active

    supabaseAdmin
      .from('tenants')
      .update({ status: 'suspended' })
      .eq('id', tenantId)
      .eq('status', 'active'), // guard: only suspend if still active
  ]);

  if (subResult.error) {
    console.error(`[SubscriptionExpiry] Failed to expire subscription for tenant ${tenantId}:`, subResult.error.message);
    return false;
  }

  if (tenantResult.error) {
    console.error(`[SubscriptionExpiry] Failed to suspend tenant ${tenantId}:`, tenantResult.error.message);
    return false;
  }

  console.log(`[SubscriptionExpiry] Tenant ${tenantId} suspended — subscription expired.`);
  return true;
};

// ─── checkAllExpiredSubscriptions ─────────────────────────────────────────────
// Periodic sweep: finds every tenant where:
//   subscription.status = 'active' AND subscription.expiry_date < now()
//
// For each match:
//   - If a game with status = 'running' exists for that tenant → skip.
//     The game-completion hook (checkTenantExpiryOnGameComplete) will catch it
//     when that game finishes.
//   - Otherwise → suspend the tenant immediately.
//
// Returns: number of tenants suspended in this sweep.

const checkAllExpiredSubscriptions = async () => {
  const now = new Date().toISOString();
  let suspendedCount = 0;

  // Fetch all active subscriptions that have passed their expiry date.
  // Join tenant via tenant_id so we can filter active tenants only (avoid
  // re-suspending already-suspended tenants if the job runs frequently).
  const { data: expiredSubs, error: fetchError } = await supabaseAdmin
    .from('subscriptions')
    .select('tenant_id')
    .eq('status', 'active')
    .lt('expiry_date', now);

  if (fetchError) {
    console.error('[SubscriptionExpiry] Failed to fetch expired subscriptions:', fetchError.message);
    return 0;
  }

  if (!expiredSubs || expiredSubs.length === 0) {
    console.log('[SubscriptionExpiry] Sweep complete — no expired subscriptions found.');
    return 0;
  }

  console.log(`[SubscriptionExpiry] Found ${expiredSubs.length} expired subscription(s). Checking for running games...`);

  // Process tenants sequentially to avoid hammering the DB with parallel writes.
  for (const { tenant_id: tenantId } of expiredSubs) {
    // Check if this tenant has any game currently running.
    // If yes, defer — the game-completion hook will handle suspension.
    const { data: runningGame, error: gameError } = await supabaseAdmin
      .from('games')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'running')
      .limit(1)
      .maybeSingle(); // returns null (not an error) if no rows

    if (gameError) {
      console.error(`[SubscriptionExpiry] Failed to check running games for tenant ${tenantId}:`, gameError.message);
      continue; // skip this tenant for this sweep; retry next cycle
    }

    if (runningGame) {
      console.log(`[SubscriptionExpiry] Tenant ${tenantId} has a running game — deferring suspension.`);
      continue;
    }

    // No running game → suspend now.
    const suspended = await _suspendTenant(tenantId);
    if (suspended) suspendedCount++;
  }

  console.log(`[SubscriptionExpiry] Sweep complete. Tenants suspended: ${suspendedCount}.`);
  return suspendedCount;
};

// ─── checkTenantExpiryOnGameComplete ─────────────────────────────────────────
// Hook to be called by the games service whenever a game transitions to
// status = 'completed'. Checks whether the tenant's subscription has since
// expired (it may have been deferred by the periodic sweep above) and, if so,
// suspends the tenant.
//
// This function is intentionally fault-tolerant: it logs errors but does NOT
// throw — the caller (games service) should not fail a game-completion flow
// because of a billing side-effect.
//
// Usage (from games service):
//   const { checkTenantExpiryOnGameComplete } = require('../jobs/subscriptionExpiry');
//   await checkTenantExpiryOnGameComplete(game.tenant_id);

const checkTenantExpiryOnGameComplete = async (tenantId) => {
  const now = new Date().toISOString();

  try {
    const { data: sub, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('status, expiry_date')
      .eq('tenant_id', tenantId)
      .single();

    if (subError) {
      console.error(`[SubscriptionExpiry] Hook: failed to fetch subscription for tenant ${tenantId}:`, subError.message);
      return;
    }

    if (!sub) {
      console.warn(`[SubscriptionExpiry] Hook: no subscription found for tenant ${tenantId}.`);
      return;
    }

    // Only act if the subscription was still marked 'active' but has now expired.
    if (sub.status === 'active' && sub.expiry_date < now) {
      console.log(`[SubscriptionExpiry] Hook: game completed for tenant ${tenantId} — subscription expired. Suspending.`);
      await _suspendTenant(tenantId);
    }
  } catch (err) {
    // Catch-all: never bubble up from a billing hook
    console.error(`[SubscriptionExpiry] Hook: unexpected error for tenant ${tenantId}:`, err);
  }
};

module.exports = { checkAllExpiredSubscriptions, checkTenantExpiryOnGameComplete };
