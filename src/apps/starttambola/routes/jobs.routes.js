const express = require('express');
const { runSubscriptionCheck, runBookingExpiry } = require('../controllers/jobs.controller');

// ─── Jobs router (mounted at /api/starttambola/internal/jobs) ─────────────────
// All routes here require requireSuperAdminKey (applied at mount in index.js).
const router = express.Router();

// POST /internal/jobs/run-subscription-check
// Manually triggers the 15-minute subscription expiry sweep.
router.post('/run-subscription-check', runSubscriptionCheck);

// POST /internal/jobs/run-booking-expiry
// Manually triggers the 5-minute booking request expiry sweep.
router.post('/run-booking-expiry', runBookingExpiry);

module.exports = router;
