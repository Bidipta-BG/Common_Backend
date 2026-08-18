const express = require('express');
const router = express.Router();
const { healthCheck } = require('../controllers/health.controller');

// GET /api/starttambola/health
router.get('/', healthCheck);

module.exports = router;
