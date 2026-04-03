const express = require('express');
const router = express.Router();
const formController = require('../controllers/formController');
const requireAuth = require('../middleware/requireAuth');

router.get('/', requireAuth, formController.getAll);
router.post('/', requireAuth, formController.create);
router.get('/:id', formController.getOne); // No auth middleware — handles both cases
router.patch('/:id', requireAuth, formController.update);
router.delete('/:id', requireAuth, formController.remove);

module.exports = router;