const projectsService = require('./projects.service');

const getMyProjects = async (req, res) => {
  try {
    const projects = await projectsService.getMyProjects(req.trkerUser.id);
    res.json({ success: true, data: projects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createProject = async (req, res) => {
  try {
    const project = await projectsService.createProject(req.trkerUser.id, req.body);
    res.json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getProjectById = async (req, res) => {
  try {
    const project = await projectsService.getProjectById(req.trkerUser.id, req.params.id);
    res.json({ success: true, data: project });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

const updateProject = async (req, res) => {
  try {
    const project = await projectsService.updateProject(req.trkerUser.id, req.params.id, req.body);
    res.json({ success: true, data: project });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

const deleteProject = async (req, res) => {
  try {
    await projectsService.deleteProject(req.trkerUser.id, req.params.id);
    res.json({ success: true, data: null });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

module.exports = {
  getMyProjects,
  createProject,
  getProjectById,
  updateProject,
  deleteProject
};
