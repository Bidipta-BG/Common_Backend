const express = require('express');
const router = express.Router();
const businessVerificationController = require('../controllers/businessVerificationController');
const requireAuth = require('../middleware/requireAuth');

router.post('/send-verification-otp', requireAuth, businessVerificationController.sendVerificationOtp);
router.post('/verify-otp', requireAuth, businessVerificationController.verifyOtp);
router.get('/verification-status', requireAuth, businessVerificationController.getVerificationStatus);

module.exports = router;
