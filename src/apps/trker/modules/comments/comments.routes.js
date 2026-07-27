const express = require('express');
const router = express.Router({ mergeParams: true });
const commentsController = require('./comments.controller');

router.get('/:taskId/comments', commentsController.getComments);
router.post('/:taskId/comments', commentsController.addComment);
router.put('/:taskId/comments/:commentId', commentsController.editComment);
router.delete('/:taskId/comments/:commentId', commentsController.deleteComment);

module.exports = router;
