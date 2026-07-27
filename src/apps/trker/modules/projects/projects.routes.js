const express = require('express');
const router = express.Router({ mergeParams: true });
const projectsController = require('./projects.controller');

router.get('/', projectsController.getMyProjects);
router.post('/', projectsController.createProject);
router.get('/:id', projectsController.getProjectById);
router.put('/:id', projectsController.updateProject);
router.delete('/:id', projectsController.deleteProject);

module.exports = router;
