const express = require('express');
const router = express.Router();
const { authMiddleware, staffMiddleware } = require('../middleware/auth');
const {
  checkAvailability,
  getBookings,
  getBookingDetail,
  createBooking,
  updateBooking,
  cancelBooking,
  confirmBooking
} = require('../controllers/bookingsController');

router.get('/bookings/availability', checkAvailability);
router.get('/bookings', authMiddleware, getBookings);
router.get('/bookings/:id', authMiddleware, getBookingDetail);
router.post('/bookings', authMiddleware, createBooking);
router.put('/bookings/:id', authMiddleware, staffMiddleware, updateBooking);
router.put('/bookings/:id/cancel', authMiddleware, cancelBooking);
router.put('/bookings/:id/confirm', authMiddleware, staffMiddleware, confirmBooking);

module.exports = router;
