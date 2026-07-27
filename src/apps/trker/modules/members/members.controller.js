const membersService = require('./members.service');

const getMembers = async (req, res) => {
  try {
    const members = await membersService.getMembers(req.params.projectId);
    res.json({ success: true, data: members });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const inviteMember = async (req, res) => {
  try {
    const member = await membersService.inviteMember(req.trkerUser.id, req.params.projectId, req.body.invited_email, req.body.role);
    res.json({ success: true, data: member });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

const updateMemberRole = async (req, res) => {
  try {
    const member = await membersService.updateMemberRole(req.trkerUser.id, req.params.projectId, req.params.memberId, req.body.role);
    res.json({ success: true, data: member });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

const removeMember = async (req, res) => {
  try {
    await membersService.removeMember(req.trkerUser.id, req.params.projectId, req.params.memberId);
    res.json({ success: true, data: null });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

module.exports = {
  getMembers,
  inviteMember,
  updateMemberRole,
  removeMember
};
