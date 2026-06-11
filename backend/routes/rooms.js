const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware, staffMiddleware } = require('../middleware/auth');
const {
  getRoomTypes,
  createRoomType,
  updateRoomType,
  deleteRoomType,
  getRooms,
  getRoomDetail,
  createRoom,
  updateRoom,
  updateRoomStatus,
  getRoomStatusOverview
} = require('../controllers/roomsController');

router.get('/room-types', getRoomTypes);
router.post('/room-types', authMiddleware, adminMiddleware, createRoomType);
router.put('/room-types/:id', authMiddleware, adminMiddleware, updateRoomType);
router.delete('/room-types/:id', authMiddleware, adminMiddleware, deleteRoomType);

router.get('/rooms', getRooms);
router.get('/rooms/:id', getRoomDetail);
router.post('/rooms', authMiddleware, adminMiddleware, createRoom);
router.put('/rooms/:id', authMiddleware, adminMiddleware, updateRoom);
router.put('/rooms/:id/status', authMiddleware, staffMiddleware, updateRoomStatus);

router.get('/room-status', getRoomStatusOverview);

module.exports = router;
