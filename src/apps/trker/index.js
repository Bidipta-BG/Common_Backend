const express = require('express');
const authMiddleware = require('./middleware/auth');

const projectRoutes = require('./modules/projects/projects.routes');
const memberRoutes = require('./modules/members/members.routes');
const taskRoutes = require('./modules/tasks/tasks.routes');
const commentRoutes = require('./modules/comments/comments.routes');

const router = express.Router();

// Apply auth middleware globally to all trker routes
router.use(authMiddleware);

router.use('/projects', projectRoutes);
router.use('/projects', memberRoutes);
router.use('/', taskRoutes); // Mounted at root because it contains both /projects/... and /tasks/... routes
router.use('/tasks', commentRoutes);

module.exports = router;
