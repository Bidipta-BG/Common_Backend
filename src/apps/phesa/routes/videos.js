const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const { 
  getTemplates, 
  generateVideo, 
  getVideoHistory, 
  checkVideoStatus 
} = require('../controllers/videoController');

/**
 * GET /videos/templates (requireAuth)
 * Fetches active video templates.
 */
router.get('/templates', requireAuth, getTemplates);

/**
 * POST /videos/generate (requireAuth)
 * Triggers video generation.
 */
router.post('/generate', requireAuth, generateVideo);

/**
 * GET /videos/history (requireAuth)
 * Returns generation history.
 */
router.get('/history', requireAuth, getVideoHistory);

/**
 * GET /videos/:id/status (requireAuth)
 * Polling for render status.
 */
router.get('/:id/status', requireAuth, checkVideoStatus);

module.exports = router;
