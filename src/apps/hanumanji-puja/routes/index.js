const express = require('express');
const router = express.Router();
const galleryController = require('../controllers/galleryController');

const referralController = require('../controllers/referralController');
const systemController = require('../controllers/systemController');

// GET endpoint - Fetch all gallery data
router.get('/gallery', galleryController.getGalleryData);

// GET endpoint - Referral Status
router.get('/referral/status', referralController.getStatus);

// GET endpoint - Version Check
router.get('/system/version-check', systemController.getVersionCheck);

// POST endpoints - Create new data
router.post('/promo-banner', galleryController.createPromoBanner);
router.post('/category', galleryController.createCategory);
router.post('/hero-section', galleryController.createHeroSection);
router.post('/image', galleryController.createImage);

// Referral endpoints
router.post('/referral/redeem', referralController.redeemCode);
router.post('/referral/claim', referralController.claimRewards);

// System endpoints
router.post('/system/version-check', systemController.updateVersionConfig);

module.exports = router;
