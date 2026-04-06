const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const { 
  startGoogleAuth, 
  handleGoogleCallback, 
  getGoogleStatus, 
  syncGoogleReviews, 
  disconnectGoogle 
} = require('../controllers/googleController');

/**
 * GET /google/auth (requireAuth)
 * Initiates OAuth for Google Business.
 */
router.get('/auth', requireAuth, startGoogleAuth);

/**
 * GET /google/callback (PUBLIC)
 * Google's redirection endpoint.
 */
router.get('/callback', handleGoogleCallback);

/**
 * GET /google/status (requireAuth)
 * Returns Google connection status.
 */
router.get('/status', requireAuth, getGoogleStatus);

/**
 * POST /google/sync (requireAuth)
 * Triggers manual sync of Google reviews.
 */
router.post('/sync', requireAuth, syncGoogleReviews);

/**
 * DELETE /google/disconnect (requireAuth)
 * Removes Google connection.
 */
router.delete('/disconnect', requireAuth, disconnectGoogle);

module.exports = router;
