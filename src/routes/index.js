const express = require('express');
const router = express.Router();
const greetingRoutes = require('../apps/greeting-app/routes');
const axomitlabRoutes = require('../apps/axomitlab/routes');
const srikrishnaAartiRoutes = require('../apps/srikrishna-aarti/routes');

router.get('/health', (req, res) => res.json({ status: 'up' }));
router.use('/greeting-app', greetingRoutes);
router.use('/axomitlab', axomitlabRoutes);
router.use('/srikrishna-aarti', srikrishnaAartiRoutes);

module.exports = router;