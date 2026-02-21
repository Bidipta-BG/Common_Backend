const express = require('express');
const router = express.Router();
const galleryController = require('../controllers/galleryController');
const astroController = require('../controllers/astroController');
const slokaController = require('../controllers/slokaController');
const mantraController = require('../controllers/mantraController');

// GET endpoint - Fetch all gallery data
router.get('/gallery', galleryController.getGalleryData);

// GET endpoint - Fetch daily slokas
router.get('/daily-slokas', slokaController.getDailySlokas);

// GET endpoint - Fetch mantras
router.get('/mantras', mantraController.getMantras);

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

module.exports = router;
