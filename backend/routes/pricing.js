const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const {
  getPriceStrategies,
  batchCreatePriceStrategies,
  calculatePrice,
  getCalendarPrices
} = require('../controllers/pricingController');

router.get('/price-strategies', getPriceStrategies);
router.post('/price-strategies', authMiddleware, adminMiddleware, batchCreatePriceStrategies);
router.get('/price-strategies/calculate', calculatePrice);
router.get('/price-strategies/calendar', getCalendarPrices);

module.exports = router;
