const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'up', app: 'phesa' }));

router.use('/testimonials', require('./routes/testimonials'));
router.use('/forms',        require('./routes/forms'));
router.use('/widgets',      require('./routes/widgets'));
router.use('/import',       require('./routes/import'));
router.use('/analytics',    require('./routes/analytics'));
router.use('/payments',     require('./routes/payments'));
router.use('/users',        require('./routes/users'));

module.exports = router;