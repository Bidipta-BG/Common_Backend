const express = require('express');
const router = express.Router();
const galleryController = require('../controllers/galleryController');
const astroController = require('../controllers/astroController');

// GET endpoint - Fetch all gallery data
router.get('/gallery', galleryController.getGalleryData);

// POST endpoints - Create new data
router.post('/promo-banner', galleryController.createPromoBanner);
router.post('/category', galleryController.createCategory);
router.post('/hero-section', galleryController.createHeroSection);
router.post('/image', galleryController.createImage);

// Astro endpoints
router.post('/astro-interest', astroController.recordAstroInterest);

module.exports = router;
