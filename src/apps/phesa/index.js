const express = require('express');
const router = express.Router();

const safeRequire = (path) => {
  try {
    return require(path);
  } catch (error) {
    console.warn(`[WARNING] Failed to load route: ${path}. It may not be implemented yet. Error: ${error.message}`);
    // Return a dummy router that just returns 404/501 or logs
    const dummyRouter = express.Router();
    dummyRouter.use((req, res) => res.status(501).json({ error: 'Route not implemented' }));
    return dummyRouter;
  }
};

router.get('/health', (req, res) => res.json({ status: 'up', app: 'phesa' }));

router.use('/', safeRequire('./routes/auth'));
router.use('/testimonials', safeRequire('./routes/testimonials'));
router.use('/forms', safeRequire('./routes/forms'));
router.use('/forms', safeRequire('./routes/reviewSuggestions'));
router.use('/widgets', safeRequire('./routes/widgets'));
router.use('/import', safeRequire('./routes/import'));
router.use('/import', safeRequire('./routes/platformImport'));
router.use('/business', safeRequire('./routes/businessVerification'));
router.use('/analytics', safeRequire('./routes/analytics'));
router.use('/analytics/ai', safeRequire('./routes/aiAnalytics'));
router.use('/reputation', safeRequire('./routes/reputation'));
router.use('/competitors', safeRequire('./routes/competitors'));
router.use('/onboarding', safeRequire('./routes/onboarding'));
router.use('/payments', safeRequire('./routes/payments'));
router.use('/videos', safeRequire('./routes/videos'));
router.use('/google-profile', safeRequire('./routes/google'));
router.use('/users/business-profile', safeRequire('./routes/businessProfile'));
router.use('/users', safeRequire('./routes/users'));

module.exports = router;