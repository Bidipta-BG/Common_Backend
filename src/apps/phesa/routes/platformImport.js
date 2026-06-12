const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const platformImportController = require('../controllers/platformImportController');

router.get('/claimed-business', requireAuth, platformImportController.getClaimedBusiness);
router.post('/platforms/confirm-business', requireAuth, platformImportController.confirmBusiness);
router.post('/platforms/search', requireAuth, platformImportController.searchBusiness);
router.get('/platforms/status', requireAuth, platformImportController.getPlatformStatus);
router.post('/platforms/fetch', requireAuth, platformImportController.fetchPlatformReviews);
router.get('/platforms/reviews', requireAuth, platformImportController.getStagedReviews);
router.delete('/platforms/reviews/:id', requireAuth, platformImportController.deleteStagedReview);
router.post('/platforms/push-to-testimonials', requireAuth, platformImportController.pushToTestimonials);
router.get('/platforms/fetch/:id/status', requireAuth, platformImportController.getFetchStatus);

module.exports = router;
