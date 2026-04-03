const express = require('express');
const router = express.Router();
const widgetController = require('../controllers/widgetController');
const requireAuth = require('../middleware/requireAuth');

// PUBLIC JS script endpoint (must be defined before /:id)
router.get('/:id.js', widgetController.serveScript);
router.get('/:id/testimonials', widgetController.getPublicTestimonials);

// Standard CRUD endpoints
router.get('/', requireAuth, widgetController.getAll);
router.post('/', requireAuth, widgetController.create);
router.get('/:id', requireAuth, widgetController.getOne);
router.patch('/:id', requireAuth, widgetController.update);
router.delete('/:id', requireAuth, widgetController.remove);

module.exports = router;