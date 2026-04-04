const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const requireAuth = require('../middleware/requireAuth');

// Protected route to ensure only logged-in users trigger their welcome email
router.post('/welcome', requireAuth, userController.welcome);

// Get user profile for plan synchronization
router.get('/profile', requireAuth, userController.getProfile);

module.exports = router;
