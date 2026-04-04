const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const requireAuth = require('../middleware/requireAuth');

router.post('/create-subscription', requireAuth, paymentController.createSubscription);
router.post('/verify-subscription', requireAuth, paymentController.verifySubscription);
router.post('/webhook', paymentController.handleWebhook); 

module.exports = router;