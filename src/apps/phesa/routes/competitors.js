const express = require('express');
const router = express.Router();
const competitorController = require('../controllers/competitorController');
const requireAuth = require('../middleware/requireAuth');

router.get('/suggestions', requireAuth, competitorController.getCompetitorSuggestions);
router.get('/comparison', requireAuth, competitorController.getCompetitorComparison);
router.get('/', requireAuth, competitorController.getCompetitors);
router.post('/', requireAuth, competitorController.addCompetitor);
router.delete('/:id', requireAuth, competitorController.removeCompetitor);
router.post('/sync-all', requireAuth, competitorController.syncAllCompetitors);

module.exports = router;
