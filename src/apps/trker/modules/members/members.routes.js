const express = require('express');
const router = express.Router({ mergeParams: true });
const membersController = require('./members.controller');

router.get('/:projectId/members', membersController.getMembers);
router.post('/:projectId/members/invite', membersController.inviteMember);
router.patch('/:projectId/members/:memberId', membersController.updateMemberRole);
router.delete('/:projectId/members/:memberId', membersController.removeMember);

module.exports = router;
