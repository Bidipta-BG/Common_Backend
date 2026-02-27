const express = require('express');
const router = express.Router();
const galleryController = require('../controllers/galleryController');
const astroController = require('../controllers/astroController');
const slokaController = require('../controllers/slokaController');
const mantraController = require('../controllers/mantraController');
const referralController = require('../controllers/referralController');
const systemController = require('../controllers/systemController');
const granthController = require('../controllers/granthController');

// GET endpoint - Fetch all gallery data
router.get('/gallery', galleryController.getGalleryData);

// GET endpoint - Fetch daily slokas
router.get('/daily-slokas', slokaController.getDailySlokas);

// GET endpoint - Fetch mantras
router.get('/mantras', mantraController.getMantras);

// GET endpoint - Referral Status
router.get('/referral/status', referralController.getStatus);

// GET endpoint - Version Check
router.get('/system/version-check', systemController.getVersionCheck);

// GET endpoints - Granth Study System
router.get('/granth', granthController.getGranthList);
router.get('/granth/:bookId', granthController.getGranthTree);
router.get('/granth/verse/:verseId', granthController.getVerseDetail);

// POST endpoints - Create new data
router.post('/promo-banner', galleryController.createPromoBanner);
router.post('/category', galleryController.createCategory);
router.post('/hero-section', galleryController.createHeroSection);
router.post('/image', galleryController.createImage);

// Astro endpoints
router.post('/astro-interest', astroController.recordAstroInterest);

// Sloka endpoints
router.post('/daily-slokas', slokaController.updateSlokas);

// Mantra endpoints
router.post('/mantras', mantraController.updateMantras);

// Referral endpoints
router.post('/referral/redeem', referralController.redeemCode);
router.post('/referral/claim', referralController.claimRewards);

// System endpoints
router.post('/system/version-check', systemController.updateVersionConfig);

// Granth endpoints
router.post('/granth', granthController.updateGranth);
router.post('/granth/chapter', granthController.updateChapter);
router.post('/granth/verse', granthController.updateVerse);

module.exports = router;
