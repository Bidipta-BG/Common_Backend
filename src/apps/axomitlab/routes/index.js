const express = require('express');
const router = express.Router();
const calculatorController = require('../controllers/calculatorController');

// Route to get the calculator configuration
router.get('/config', calculatorController.getConfig);

// Route to update or create (initialize) the calculator configuration
// Using POST for both initialization and updates as per user request
router.post('/config', calculatorController.updateConfig);

const leadController = require('../controllers/leadController');

// Lead Routes
router.post('/leads', leadController.createLead);       // Capture new lead
router.get('/leads', leadController.getAllLeads);       // Get all leads (Admin)
router.patch('/leads/:id', leadController.updateLead);  // Update lead status (Admin)

module.exports = router;

