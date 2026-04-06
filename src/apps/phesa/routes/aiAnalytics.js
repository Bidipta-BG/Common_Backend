const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const { 
  checkEligibility, 
  runAnalysis, 
  getAnalysisHistory 
} = require('../controllers/aiAnalyticsController');

/**
 * GET /ai/eligibility (requireAuth)
 * Returns usage status and eligibility for new analysis.
 */
router.get('/eligibility', requireAuth, checkEligibility);

/**
 * POST /ai/run (requireAuth)
 * Triggers a new AI analysis run.
 */
router.post('/run', requireAuth, runAnalysis);

/**
 * GET /ai/history (requireAuth)
 * Returns history of previous analysis runs.
 */
router.get('/history', requireAuth, getAnalysisHistory);

module.exports = router;
