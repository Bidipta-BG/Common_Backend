const express = require('express');
const router = express.Router();
const greetingRoutes = require('../apps/greeting-app/routes');

router.get('/health', (req, res) => res.json({ status: 'up' }));
router.use('/greeting-app', greetingRoutes);

module.exports = router;