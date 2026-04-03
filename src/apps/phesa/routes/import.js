const express = require('express');
const router = express.Router();
const importController = require('../controllers/importController');
const requireAuth = require('../middleware/requireAuth');

router.post('/google/search', requireAuth, importController.searchBusiness);
router.post('/google/import', requireAuth, importController.importReviews);

module.exports = router;