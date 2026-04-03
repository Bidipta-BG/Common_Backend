const express = require('express');
const router = express.Router();
const testimonialController = require('../controllers/testimonialController');
const requireAuth = require('../middleware/requireAuth');

router.get('/', requireAuth, testimonialController.getAll);
router.post('/', testimonialController.create); // PUBLIC — no auth required
router.post('/manual', requireAuth, testimonialController.createManual);
router.get('/:id', requireAuth, testimonialController.getOne);
router.patch('/:id', requireAuth, testimonialController.update);
router.delete('/:id', requireAuth, testimonialController.remove);

module.exports = router;