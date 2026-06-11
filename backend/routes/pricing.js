const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const {
  getPriceStrategies,
  batchCreatePriceStrategies,
  calculatePrice
} = require('../controllers/pricingController');

router.get('/price-strategies', getPriceStrategies);
router.post('/price-strategies', authMiddleware, adminMiddleware, batchCreatePriceStrategies);
router.get('/price-strategies/calculate', calculatePrice);

module.exports = router;
