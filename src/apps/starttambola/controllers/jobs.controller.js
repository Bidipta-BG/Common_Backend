const { checkAllExpiredSubscriptions } = require('../jobs/subscriptionExpiry');
const { expireStaleBookingRequests }   = require('../jobs/bookingRequestExpiry');

// ─── POST /internal/jobs/run-subscription-check ───────────────────────────────
// Manual trigger for the subscription expiry sweep.
const runSubscriptionCheck = async (req, res, next) => {
  try {
    console.log(`[Jobs] Manual subscription check triggered at ${new Date().toISOString()}`);
    const suspendedCount = await checkAllExpiredSubscriptions();
    return res.status(200).json({
      data: { message: 'Subscription expiry sweep completed.', suspendedCount, ranAt: new Date().toISOString() },
    });
  } catch (err) {
    return next(err);
  }
};

// ─── POST /internal/jobs/run-booking-expiry ───────────────────────────────────
// Manual trigger for the booking-request expiry sweep.
const runBookingExpiry = async (req, res, next) => {
  try {
    console.log(`[Jobs] Manual booking expiry triggered at ${new Date().toISOString()}`);
    const expiredCount = await expireStaleBookingRequests();
    return res.status(200).json({
      data: { message: 'Booking request expiry sweep completed.', expiredCount, ranAt: new Date().toISOString() },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { runSubscriptionCheck, runBookingExpiry };
