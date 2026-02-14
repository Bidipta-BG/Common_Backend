const express = require('express');
const router = express.Router();
const galleryController = require('../controllers/galleryController');

// GET endpoint - Fetch all gallery data
router.get('/gallery', galleryController.getGalleryData);

// POST endpoints - Create new data
router.post('/promo-banner', galleryController.createPromoBanner);
router.post('/category', galleryController.createCategory);
router.post('/hero-section', galleryController.createHeroSection);
router.post('/image', galleryController.createImage);

module.exports = router;
