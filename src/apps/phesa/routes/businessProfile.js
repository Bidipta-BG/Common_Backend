const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const { updateBusinessProfile, getBusinessProfileStatus } = require('../controllers/businessProfileController');

/**
 * PATCH /
 * requireAuth middleware ensures req.userId is set.
 */
router.patch('/', requireAuth, updateBusinessProfile);

/**
 * GET /status
 * Fetches completeness status of the business profile.
 */
router.get('/status', requireAuth, getBusinessProfileStatus);

module.exports = router;
