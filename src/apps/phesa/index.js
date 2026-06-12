const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'up', app: 'phesa' }));

router.use('/', require('./routes/auth'));
router.use('/testimonials', require('./routes/testimonials'));
router.use('/forms', require('./routes/forms'));
router.use('/forms', require('./routes/reviewSuggestions'));
router.use('/widgets', require('./routes/widgets'));
router.use('/import', require('./routes/import'));
router.use('/import', require('./routes/platformImport'));
router.use('/analytics', require('./routes/analytics'));
router.use('/analytics/ai', require('./routes/aiAnalytics'));
router.use('/payments', require('./routes/payments'));
router.use('/videos', require('./routes/videos'));
router.use('/google-profile', require('./routes/google'));
router.use('/users/business-profile', require('./routes/businessProfile'));
router.use('/users', require('./routes/users'));

module.exports = router;