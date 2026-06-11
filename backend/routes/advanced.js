const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const {
  forecastInventory,
  getHolidays,
  createHolidays,
  updateHoliday,
  deleteHoliday,
  getPriceRecommendation
} = require('../controllers/advancedController');

router.get('/inventory/forecast', authMiddleware, forecastInventory);

router.get('/holidays', authMiddleware, getHolidays);
router.post('/holidays', authMiddleware, adminMiddleware, createHolidays);
router.put('/holidays/:id', authMiddleware, adminMiddleware, updateHoliday);
router.delete('/holidays/:id', authMiddleware, adminMiddleware, deleteHoliday);

router.get('/price-adjustment/recommend', authMiddleware, getPriceRecommendation);

module.exports = router;
