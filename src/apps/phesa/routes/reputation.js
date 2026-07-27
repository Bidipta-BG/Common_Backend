const express = require('express');
const router = express.Router();
const reputationController = require('../controllers/reputationController');
const requireAuth = require('../middleware/requireAuth');

router.get('/status', requireAuth, reputationController.getReputationStatus);
router.get('/score-history', requireAuth, reputationController.getScoreHistory);
router.get('/latest', requireAuth, reputationController.getLatestAnalysis);
router.get('/topics', requireAuth, reputationController.getTopicBreakdown);
router.get('/reports', requireAuth, reputationController.getMonthlyReportList);

module.exports = router;
