const express = require('express');
const router = express.Router();
const reviewSuggestionsController = require('../controllers/reviewSuggestionsController');
const requireAuth = require('../middleware/requireAuth');

router.get('/:id/suggestions', reviewSuggestionsController.getSuggestions);
router.post('/:id/regenerate-suggestions', requireAuth, reviewSuggestionsController.regenerateSuggestions);

module.exports = router;
