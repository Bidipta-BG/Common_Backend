const express = require('express');
const router = express.Router();
const greetingRoutes = require('../apps/greeting-app/routes');
const axomitlabRoutes = require('../apps/axomitlab/routes');
const srikrishnaAartiRoutes = require('../apps/srikrishna-aarti/routes');
// const aiBusinessAnalyzerRoutes = require('../apps/ai-business-analyzer');
const shivjiPujaRoutes = require('../apps/shivji-puja/routes');
const hanumanjiPujaRoutes = require('../apps/hanumanji-puja/routes');

router.get('/health', (req, res) => res.json({ status: 'up' }));
router.use('/greeting-app', greetingRoutes);
router.use('/axomitlab', axomitlabRoutes);
router.use('/srikrishna-aarti', srikrishnaAartiRoutes);
// router.use('/ai-business-analyzer', aiBusinessAnalyzerRoutes);
router.use('/shivji-puja', shivjiPujaRoutes);
router.use('/hanumanji-puja', hanumanjiPujaRoutes);

module.exports = router;