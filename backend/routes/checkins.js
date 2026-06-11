const express = require('express');
const router = express.Router();
const { authMiddleware, staffMiddleware } = require('../middleware/auth');
const {
  getCheckins,
  getCheckinDetailById,
  checkin,
  extendStay,
  checkout,
  addCharge,
  addDeposit
} = require('../controllers/checkinsController');

router.get('/checkins', authMiddleware, getCheckins);
router.get('/checkins/:id', authMiddleware, getCheckinDetailById);
router.post('/checkins', authMiddleware, staffMiddleware, checkin);
router.put('/checkins/:id/extend', authMiddleware, staffMiddleware, extendStay);
router.put('/checkins/:id/checkout', authMiddleware, staffMiddleware, checkout);
router.post('/checkins/:id/add-charge', authMiddleware, staffMiddleware, addCharge);
router.post('/checkins/:id/deposit', authMiddleware, staffMiddleware, addDeposit);

module.exports = router;
