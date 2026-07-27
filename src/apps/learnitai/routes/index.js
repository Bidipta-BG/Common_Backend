const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Save lead, quiz data, and payment status
router.post('/save-payment', userController.saveQuizAndPayment);

// Set password for a user
router.post('/set-password', userController.setPassword);

// Login 
router.post('/login', userController.login);

module.exports = router;
