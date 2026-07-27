const tasksService = require('./tasks.service');

const getTasks = async (req, res) => {
  try {
    const tasks = await tasksService.getTasks(req.trkerUser.id, req.params.projectId, req.query);
    res.json({ success: true, data: tasks });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

const createTask = async (req, res) => {
  try {
    const task = await tasksService.createTask(req.trkerUser.id, req.params.projectId, req.body);
    res.json({ success: true, data: task });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

const getTaskById = async (req, res) => {
  try {
    const task = await tasksService.getTaskById(req.trkerUser.id, req.params.taskId);
    res.json({ success: true, data: task });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : (error.message === 'Task not found' ? 404 : 500);
    res.status(status).json({ success: false, message: error.message });
  }
};

const updateTask = async (req, res) => {
  try {
    const task = await tasksService.updateTask(req.trkerUser.id, req.params.taskId, req.body);
    res.json({ success: true, data: task });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

const updateTaskStatus = async (req, res) => {
  try {
    const task = await tasksService.updateTaskStatus(req.trkerUser.id, req.params.taskId, req.body.status);
    res.json({ success: true, data: task });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

const deleteTask = async (req, res) => {
  try {
    await tasksService.deleteTask(req.trkerUser.id, req.params.taskId);
    res.json({ success: true, data: null });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

const getTaskActivity = async (req, res) => {
  try {
    const activity = await tasksService.getTaskActivity(req.trkerUser.id, req.params.taskId);
    res.json({ success: true, data: activity });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

module.exports = {
  getTasks,
  createTask,
  getTaskById,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getTaskActivity
};
