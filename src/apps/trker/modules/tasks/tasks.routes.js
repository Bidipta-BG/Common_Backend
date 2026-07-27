const express = require('express');
const router = express.Router({ mergeParams: true });
const tasksController = require('./tasks.controller');

// If this is mounted at /tasks, then we have routes that start with /projects as well
router.get('/projects/:projectId/tasks', tasksController.getTasks);
router.post('/projects/:projectId/tasks', tasksController.createTask);
router.get('/tasks/:taskId', tasksController.getTaskById);
router.put('/tasks/:taskId', tasksController.updateTask);
router.patch('/tasks/:taskId/status', tasksController.updateTaskStatus);
router.delete('/tasks/:taskId', tasksController.deleteTask);
router.get('/tasks/:taskId/activity', tasksController.getTaskActivity);

module.exports = router;
