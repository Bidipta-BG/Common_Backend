const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// GET /api/phesa/google/login
router.get('/google/login', authController.googleLogin);

// GET /api/phesa/google/callback
router.get('/google/callback', authController.googleCallback);

module.exports = router;
