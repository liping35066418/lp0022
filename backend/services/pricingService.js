const { db } = require('../database');
const moment = require('moment');

const WEEKEND_RATE_DEFAULT = 120;

function parseJSON(val) {
  if (!val) return [];
  try { return JSON.parse(val); } catch (e) { return []; }
}

function isWeekend(dateStr) {
  const day = moment(dateStr).day();
  return day === 0 || day === 6;
}

function getDateRange(startDate, endDate) {
  const start = moment(startDate);
  const end = moment(endDate);
  const nights = end.diff(start, 'days');
  if (nights <= 0) return [];
  const dates = [];
  for (let i = 0; i < nights; i++) {
    dates.push(moment(start).add(i, 'days').format('YYYY-MM-DD'));
  }
  return dates;
}

function getMemberInfo(memberId) {
  if (!memberId) {
    return {
      member: null,
      level: null,
      discount: 100,
      points_rate: 1.0,
      exchange_rate: 100,
      max_deduction_percent: 30
    };
  }

  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
  if (!member) {
    return {
      member: null,
      level: null,
      discount: 100,
      points_rate: 1.0,
      exchange_rate: 100,
      max_deduction_percent: 30
    };
  }

  const level = db.prepare('SELECT * FROM member_levels WHERE level = ? AND is_active = 1').get(member.level);
  if (!level) {
    return {
      member,
      level: null,
      discount: 100,
      points_rate: 1.0,
      exchange_rate: 100,
      max_deduction_percent: 30
    };
  }

  return {
    member,
    level,
    discount: parseFloat(level.discount) || 100,
    points_rate: parseFloat(level.points_rate) || 1.0,
    exchange_rate: parseFloat(level.exchange_rate) || 100,
    max_deduction_percent: parseInt(level.max_deduction_percent) || 30
  };
}

function getActiveStrategies(roomTypeId, startDate, endDate) {
  const strategies = db.prepare(`
    SELECT * FROM price_strategies
    WHERE room_type_id = ? AND is_active = 1
      AND (start_date IS NULL OR start_date <= ?)
      AND (end_date IS NULL OR end_date >= ?)
    ORDER BY id
  `).all(roomTypeId, endDate, startDate);

  return strategies.map(s => ({
    ...s,
    weekdays: parseJSON(s.weekdays)
  }));
}

function getHoliday(roomTypeId, dateStr) {
  return db.prepare(`
    SELECT * FROM holidays
    WHERE is_active = 1
      AND (room_type_id IS NULL OR room_type_id = ?)
      AND start_date <= ? AND end_date >= ?
    ORDER BY price_multiplier DESC LIMIT 1
  `).get(roomTypeId, dateStr, dateStr);
}

function calculateDailyRate(roomTypeId, dateStr, strategies, memberDiscount = 100) {
  const roomType = db.prepare('SELECT * FROM room_types WHERE id = ?').get(roomTypeId);
  if (!roomType) {
    return {
      date: dateStr,
      weekday: '',
      is_weekend: false,
      is_holiday: false,
      holiday_name: null,
      holiday_multiplier: null,
      price_type: 'base',
      base_price: 0,
      original_price: 0,
      discounted_price: 0,
      matched_strategy: null
    };
  }

  const dow = moment(dateStr).day();
  const basePrice = parseFloat(roomType.base_price);
  let dayPrice = basePrice;
  let priceType = 'base';
  let matchedHoliday = null;
  let matchedStrategy = null;
  let multiplier = 1;

  const holiday = getHoliday(roomTypeId, dateStr);
  if (holiday) {
    matchedHoliday = holiday;
    priceType = 'holiday';
    multiplier = parseFloat(holiday.price_multiplier) || 1;
    dayPrice = basePrice * multiplier;
  } else if (isWeekend(dateStr)) {
    const weekendStrategy = strategies.find(s =>
      s.price_type === 'weekend' &&
      (s.weekdays.length === 0 || s.weekdays.includes(dow))
    );
    if (weekendStrategy) {
      matchedStrategy = weekendStrategy;
      dayPrice = parseFloat(weekendStrategy.price);
    } else {
      multiplier = WEEKEND_RATE_DEFAULT / 100;
      dayPrice = basePrice * multiplier;
    }
    priceType = 'weekend';
  } else {
    const weekdayStrategy = strategies.find(s =>
      s.price_type === 'weekday' &&
      (s.weekdays.length === 0 || s.weekdays.includes(dow))
    );
    if (weekdayStrategy) {
      matchedStrategy = weekdayStrategy;
      dayPrice = parseFloat(weekdayStrategy.price);
      priceType = 'weekday';
    } else {
      const baseStrategy = strategies.find(s => s.price_type === 'base');
      if (baseStrategy) {
        matchedStrategy = baseStrategy;
        dayPrice = parseFloat(baseStrategy.price);
      }
    }
  }

  const specificStrategy = strategies.find(s =>
    s.price_type === 'date' &&
    s.start_date && s.end_date &&
    moment(dateStr).isSameOrAfter(s.start_date) &&
    moment(dateStr).isSameOrBefore(s.end_date)
  );
  if (specificStrategy) {
    matchedStrategy = specificStrategy;
    dayPrice = parseFloat(specificStrategy.price);
    priceType = 'date';
  }

  dayPrice = Math.round(dayPrice * 100) / 100;
  const discountedPrice = Math.round(dayPrice * (memberDiscount / 100) * 100) / 100;

  return {
    date: dateStr,
    weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dow],
    is_weekend: isWeekend(dateStr),
    is_holiday: !!matchedHoliday,
    holiday_name: matchedHoliday?.name || null,
    holiday_multiplier: matchedHoliday ? parseFloat(matchedHoliday.price_multiplier) : null,
    price_type: priceType,
    base_price: basePrice,
    original_price: dayPrice,
    discounted_price: discountedPrice,
    matched_strategy: matchedStrategy ? { id: matchedStrategy.id, name: matchedStrategy.name } : null
  };
}

function calculateStayBreakdown(roomTypeId, startDate, endDate, memberDiscount = 100) {
  const dates = getDateRange(startDate, endDate);
  const strategies = getActiveStrategies(roomTypeId, startDate, endDate);
  const breakdown = [];
  let originalTotal = 0;
  let discountedTotal = 0;

  for (const dateStr of dates) {
    const rate = calculateDailyRate(roomTypeId, dateStr, strategies, memberDiscount);
    breakdown.push(rate);
    originalTotal += rate.original_price;
    discountedTotal += rate.discounted_price;
  }

  return {
    nights: dates.length,
    daily_breakdown: breakdown,
    original_total: Math.round(originalTotal * 100) / 100,
    discounted_total: Math.round(discountedTotal * 100) / 100,
    discount_amount: Math.round((originalTotal - discountedTotal) * 100) / 100
  };
}

function calculatePointsDeduction(memberInfo, discountedTotal, requestedPoints = null) {
  if (!memberInfo.member) {
    return {
      max_points: 0,
      max_amount: 0,
      points_to_use: 0,
      deduction_amount: 0,
      exchange_rate: memberInfo.exchange_rate,
      available_points: 0
    };
  }

  const availablePoints = parseInt(memberInfo.member.points) || 0;
  const maxDeductionAmount = Math.round(discountedTotal * (memberInfo.max_deduction_percent / 100) * 100) / 100;
  const maxPointsByPercent = Math.ceil(maxDeductionAmount * memberInfo.exchange_rate);
  const maxPoints = Math.min(availablePoints, maxPointsByPercent);
  const maxAmount = Math.round((maxPoints / memberInfo.exchange_rate) * 100) / 100;

  let pointsToUse = 0;
  let deductionAmount = 0;

  if (requestedPoints !== null && requestedPoints > 0) {
    pointsToUse = Math.min(Math.max(0, parseInt(requestedPoints)), maxPoints);
    deductionAmount = Math.round((pointsToUse / memberInfo.exchange_rate) * 100) / 100;
  }

  return {
    max_points: maxPoints,
    max_amount: maxAmount,
    points_to_use: pointsToUse,
    deduction_amount: deductionAmount,
    exchange_rate: memberInfo.exchange_rate,
    available_points: availablePoints,
    max_deduction_percent: memberInfo.max_deduction_percent
  };
}

function calculateCompletePrice(roomTypeId, startDate, endDate, memberId = null, roomCount = 1, pointsToUse = null) {
  const memberInfo = getMemberInfo(memberId);
  const stayBreakdown = calculateStayBreakdown(roomTypeId, startDate, endDate, memberInfo.discount);

  const roomOriginalTotal = Math.round(stayBreakdown.original_total * roomCount * 100) / 100;
  const roomDiscountedTotal = Math.round(stayBreakdown.discounted_total * roomCount * 100) / 100;
  const roomDiscountAmount = Math.round((roomOriginalTotal - roomDiscountedTotal) * 100) / 100;

  const pointsInfo = calculatePointsDeduction(memberInfo, roomDiscountedTotal, pointsToUse);

  const finalTotal = Math.round((roomDiscountedTotal - pointsInfo.deduction_amount) * 100) / 100;

  const dailyBreakdownWithRooms = stayBreakdown.daily_breakdown.map(day => ({
    ...day,
    original_price_total: Math.round(day.original_price * roomCount * 100) / 100,
    discounted_price_total: Math.round(day.discounted_price * roomCount * 100) / 100
  }));

  return {
    room_type: {
      id: roomTypeId
    },
    member: memberInfo.member ? {
      id: memberInfo.member.id,
      name: memberInfo.member.name,
      phone: memberInfo.member.phone,
      level: memberInfo.member.level
    } : null,
    member_level: memberInfo.level ? {
      id: memberInfo.level.id,
      level: memberInfo.level.level,
      name: memberInfo.level.name,
      discount: memberInfo.discount,
      points_rate: memberInfo.points_rate,
      exchange_rate: memberInfo.exchange_rate,
      max_deduction_percent: memberInfo.max_deduction_percent
    } : null,
    date_range: {
      start_date: startDate,
      end_date: endDate,
      nights: stayBreakdown.nights
    },
    room_count: roomCount,
    original_total: roomOriginalTotal,
    member_discount_percent: memberInfo.discount,
    discount_amount: roomDiscountAmount,
    discounted_total: roomDiscountedTotal,
    points_deduction: pointsInfo,
    final_total: finalTotal,
    daily_breakdown: dailyBreakdownWithRooms
  };
}

module.exports = {
  WEEKEND_RATE_DEFAULT,
  isWeekend,
  getDateRange,
  getMemberInfo,
  getActiveStrategies,
  getHoliday,
  calculateDailyRate,
  calculateStayBreakdown,
  calculatePointsDeduction,
  calculateCompletePrice
};
