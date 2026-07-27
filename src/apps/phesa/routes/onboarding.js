const express = require('express');
const router = express.Router();
const onboardingController = require('../controllers/onboardingController');
const requireAuth = require('../middleware/requireAuth');

router.get('/status', requireAuth, onboardingController.getStatus);
router.get('/clusters', requireAuth, onboardingController.getClusters);
router.get('/questions/:cluster_key', requireAuth, onboardingController.getQuestions);
router.post('/detect-cluster', requireAuth, onboardingController.detectCluster);
router.post('/complete', requireAuth, onboardingController.completeOnboarding);

module.exports = router;
