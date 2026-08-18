const { checkAllExpiredSubscriptions } = require('./subscriptionExpiry');
const { expireStaleBookingRequests }    = require('./bookingRequestExpiry');

// ─── Scheduler ────────────────────────────────────────────────────────────────
// All recurring jobs are registered here via Node's built-in setInterval.
//
// To swap to node-cron later (after `npm install node-cron`):
//   const cron = require('node-cron');
//   cron.schedule('*/15 * * * *', runSubscriptionCheck); // every 15 min
//   cron.schedule('*/5  * * * *', runBookingExpiry);     // every 5  min
//
// Current schedule:
//   ┌ runSubscriptionCheck  — every 15 minutes
//   └ runBookingExpiry      — every 5  minutes

const FIFTEEN_MINUTES_MS =  15 * 60 * 1000;
const FIVE_MINUTES_MS    =   5 * 60 * 1000;

let _subscriptionHandle = null;
let _bookingHandle      = null;

// ─── Job runners (exported for manual-trigger routes) ────────────────────────

const runSubscriptionCheck = async () => {
  console.log(`[Scheduler] ${new Date().toISOString()} — Subscription expiry sweep...`);
  try {
    const count = await checkAllExpiredSubscriptions();
    console.log(`[Scheduler] Subscription sweep done. Tenants suspended: ${count}.`);
  } catch (err) {
    console.error('[Scheduler] Unhandled error in subscription expiry sweep:', err);
  }
};

const runBookingExpiry = async () => {
  console.log(`[Scheduler] ${new Date().toISOString()} — Booking request expiry sweep...`);
  try {
    const count = await expireStaleBookingRequests();
    console.log(`[Scheduler] Booking expiry done. Requests expired: ${count}.`);
  } catch (err) {
    console.error('[Scheduler] Unhandled error in booking expiry sweep:', err);
  }
};

// ─── startScheduler ───────────────────────────────────────────────────────────
// Call once when the server boots. Idempotent — safe to call multiple times
// (the handle guards prevent double-registration).

const startScheduler = () => {
  if (_subscriptionHandle && _bookingHandle) {
    console.warn('[Scheduler] Already started — skipping duplicate registration.');
    return;
  }

  if (!_subscriptionHandle) {
    _subscriptionHandle = setInterval(runSubscriptionCheck, FIFTEEN_MINUTES_MS);
    if (_subscriptionHandle.unref) _subscriptionHandle.unref();
    console.log('[Scheduler] Subscription expiry check registered — every 15 minutes.');
  }

  if (!_bookingHandle) {
    _bookingHandle = setInterval(runBookingExpiry, FIVE_MINUTES_MS);
    if (_bookingHandle.unref) _bookingHandle.unref();
    console.log('[Scheduler] Booking request expiry check registered — every 5 minutes.');
  }
};

// ─── stopScheduler ────────────────────────────────────────────────────────────
// Stops both intervals. Used for graceful shutdown and tests.
const stopScheduler = () => {
  if (_subscriptionHandle) { clearInterval(_subscriptionHandle); _subscriptionHandle = null; }
  if (_bookingHandle)      { clearInterval(_bookingHandle);      _bookingHandle      = null; }
  console.log('[Scheduler] All jobs stopped.');
};

module.exports = { startScheduler, stopScheduler, runSubscriptionCheck, runBookingExpiry };
