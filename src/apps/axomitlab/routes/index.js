const express = require('express');
const router = express.Router();
const calculatorController = require('../controllers/calculatorController');

// Route to get the calculator configuration
router.get('/config', calculatorController.getConfig);

// Route to update or create (initialize) the calculator configuration
// Using POST for both initialization and updates as per user request
router.post('/config', calculatorController.updateConfig);

module.exports = router;
