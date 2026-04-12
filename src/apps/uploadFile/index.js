const express = require('express');
const router = express.Router();
const uploadRoutes = require('./routes');

router.get('/health', (req, res) => res.json({ status: 'up', app: 'uploadFile' }));

router.use('/', uploadRoutes);

module.exports = router;
