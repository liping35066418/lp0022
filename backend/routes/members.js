const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const {
  getMembers,
  getMemberDetail,
  createMember,
  updateMember,
  getPointsRecords,
  exchangePoints,
  getMemberLevels,
  updateMemberLevel
} = require('../controllers/membersController');

router.get('/members', authMiddleware, getMembers);
router.get('/members/:id', authMiddleware, getMemberDetail);
router.post('/members', authMiddleware, createMember);
router.put('/members/:id', authMiddleware, updateMember);

router.get('/members/:id/points', authMiddleware, getPointsRecords);
router.post('/members/:id/points/exchange', authMiddleware, exchangePoints);

router.get('/member-levels', authMiddleware, getMemberLevels);
router.put('/member-levels/:id', authMiddleware, adminMiddleware, updateMemberLevel);

module.exports = router;
