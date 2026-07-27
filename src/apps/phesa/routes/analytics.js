const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const requireAuth = require('../middleware/requireAuth');

router.get('/dashboard-intelligence', requireAuth, analyticsController.getDashboardIntelligence);
router.get('/', requireAuth, analyticsController.getDashboardStats);
router.post('/track', analyticsController.trackView); // PUBLIC
router.post('/track-form-view', analyticsController.trackFormView); // PUBLIC

module.exports = router;