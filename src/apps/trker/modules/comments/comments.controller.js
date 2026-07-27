const commentsService = require('./comments.service');

const getComments = async (req, res) => {
  try {
    const comments = await commentsService.getComments(req.trkerUser.id, req.params.taskId);
    res.json({ success: true, data: comments });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

const addComment = async (req, res) => {
  try {
    const comment = await commentsService.addComment(req.trkerUser.id, req.params.taskId, req.body);
    res.json({ success: true, data: comment });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

const editComment = async (req, res) => {
  try {
    const comment = await commentsService.editComment(req.trkerUser.id, req.params.taskId, req.params.commentId, req.body);
    res.json({ success: true, data: comment });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

const deleteComment = async (req, res) => {
  try {
    await commentsService.deleteComment(req.trkerUser.id, req.params.taskId, req.params.commentId);
    res.json({ success: true, data: null });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

module.exports = {
  getComments,
  addComment,
  editComment,
  deleteComment
};
