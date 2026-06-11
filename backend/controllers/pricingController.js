const { db } = require('../database');
const { success, error } = require('../utils/response');
const moment = require('moment');

const now = () => new Date().toISOString();

const WEEKEND_RATE_DEFAULT = 120;

function isWeekend(dateStr) {
  const day = moment(dateStr).day();
  return day === 0 || day === 6;
}

function parseJSON(val) {
  if (!val) return [];
  try { return JSON.parse(val); } catch (e) { return []; }
}

function getPriceStrategies(req, res) {
  try {
    const { room_type_id, start_date, end_date } = req.query;
    let sql = 'SELECT * FROM price_strategies WHERE 1=1';
    const params = [];

    if (room_type_id) {
      sql += ' AND room_type_id = ?';
      params.push(room_type_id);
    }
    if (start_date) {
      sql += ' AND (end_date >= ? OR end_date IS NULL)';
      params.push(start_date);
    }
    if (end_date) {
      sql += ' AND (start_date <= ? OR start_date IS NULL)';
      params.push(end_date);
    }

    sql += ' ORDER BY room_type_id, start_date, id';
    const rows = db.prepare(sql).all(...params);

    rows.forEach(row => {
      row.weekdays = parseJSON(row.weekdays);
    });

    res.json(success({ list: rows }));
  } catch (err) {
    res.json(error('获取房价策略列表失败: ' + err.message));
  }
}

function batchCreatePriceStrategies(req, res) {
  try {
    const { strategies } = req.body;

    if (!Array.isArray(strategies) || strategies.length === 0) {
      return res.json(error('策略数据不能为空', 400));
    }

    const results = [];
    const stmt = db.prepare(`INSERT INTO price_strategies (name, room_type_id, price_type, price, start_date, end_date, weekdays, is_active, description, created_at, updated_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    const tx = db.transaction((items) => {
      for (const s of items) {
        if (!s.name || !s.room_type_id || s.price === undefined || s.price === null) {
          throw new Error('策略名称、房型ID和价格不能为空');
        }
        const roomType = db.prepare('SELECT * FROM room_types WHERE id = ?').get(s.room_type_id);
        if (!roomType) {
          throw new Error('房型不存在: ' + s.room_type_id);
        }
        const result = stmt.run(
          s.name,
          s.room_type_id,
          s.price_type || 'base',
          s.price,
          s.start_date || null,
          s.end_date || null,
          s.weekdays ? JSON.stringify(s.weekdays) : '[]',
          s.is_active !== undefined ? s.is_active : 1,
          s.description || '',
          now(),
          now()
        );
        results.push({
          id: result.lastInsertRowid,
          ...s
        });
      }
    });

    tx(strategies);
    res.json(success({ created: results.length, strategies: results }, '批量设置房价策略成功'));
  } catch (err) {
    res.json(error('批量设置房价策略失败: ' + err.message));
  }
}

function calculatePrice(req, res) {
  try {
    const { room_type_id, start_date, end_date, member_level_id, member_id, nights } = req.query;

    if (!room_type_id || !start_date || !end_date) {
      return res.json(error('房型ID、入住日期和离店日期不能为空', 400));
    }

    const roomType = db.prepare('SELECT * FROM room_types WHERE id = ?').get(room_type_id);
    if (!roomType) {
      return res.json(error('房型不存在', 404));
    }

    const start = moment(start_date);
    const end = moment(end_date);
    let nightCount = nights ? parseInt(nights) : end.diff(start, 'days');
    if (nightCount <= 0) {
      nightCount = 1;
    }

    let memberDiscount = 100;
    let memberLevel = null;

    if (member_id) {
      const member = db.prepare('SELECT * FROM members WHERE id = ?').get(member_id);
      if (member && member.level_id) {
        memberLevel = db.prepare('SELECT * FROM member_levels WHERE id = ? AND is_active = 1').get(member.level_id);
        if (memberLevel) {
          memberDiscount = parseFloat(memberLevel.discount) || 100;
        }
      }
    } else if (member_level_id) {
      memberLevel = db.prepare('SELECT * FROM member_levels WHERE id = ? AND is_active = 1').get(member_level_id);
      if (memberLevel) {
        memberDiscount = parseFloat(memberLevel.discount) || 100;
      }
    }

    const dateArray = [];
    for (let i = 0; i < nightCount; i++) {
      dateArray.push(moment(start).add(i, 'days').format('YYYY-MM-DD'));
    }

    const strategies = db.prepare(`
      SELECT * FROM price_strategies
      WHERE room_type_id = ? AND is_active = 1
        AND (start_date IS NULL OR start_date <= ?)
        AND (end_date IS NULL OR end_date >= ?)
    `).all(room_type_id, end_date, start_date);

    const activeStrategies = strategies.map(s => ({
      ...s,
      weekdays: parseJSON(s.weekdays)
    }));

    const dailyBreakdown = [];
    let originalTotal = 0;
    let discountedTotal = 0;

    for (const dateStr of dateArray) {
      const dow = moment(dateStr).day();
      const basePrice = parseFloat(roomType.base_price);
      let dayPrice = basePrice;
      let priceType = 'base';
      let matchedHoliday = null;
      let matchedStrategy = null;
      let multiplier = 1;

      const holiday = db.prepare(`
        SELECT * FROM holidays
        WHERE is_active = 1
          AND (room_type_id IS NULL OR room_type_id = ?)
          AND start_date <= ? AND end_date >= ?
        ORDER BY price_multiplier DESC LIMIT 1
      `).get(room_type_id, dateStr, dateStr);

      if (holiday) {
        matchedHoliday = holiday;
        priceType = 'holiday';
        multiplier = parseFloat(holiday.price_multiplier) || 1;
        dayPrice = basePrice * multiplier;
      } else if (isWeekend(dateStr)) {
        const weekendStrategy = activeStrategies.find(s =>
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
        const weekdayStrategy = activeStrategies.find(s =>
          s.price_type === 'weekday' &&
          (s.weekdays.length === 0 || s.weekdays.includes(dow))
        );
        if (weekdayStrategy) {
          matchedStrategy = weekdayStrategy;
          dayPrice = parseFloat(weekdayStrategy.price);
          priceType = 'weekday';
        } else {
          const baseStrategy = activeStrategies.find(s => s.price_type === 'base');
          if (baseStrategy) {
            matchedStrategy = baseStrategy;
            dayPrice = parseFloat(baseStrategy.price);
          }
        }
      }

      const specificStrategy = activeStrategies.find(s =>
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
      const discountedDayPrice = Math.round(dayPrice * (memberDiscount / 100) * 100) / 100;

      originalTotal += dayPrice;
      discountedTotal += discountedDayPrice;

      dailyBreakdown.push({
        date: dateStr,
        weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dow],
        is_weekend: isWeekend(dateStr),
        is_holiday: !!matchedHoliday,
        holiday_name: matchedHoliday?.name || null,
        holiday_multiplier: matchedHoliday ? parseFloat(matchedHoliday.price_multiplier) : null,
        price_type: priceType,
        base_price: basePrice,
        original_price: dayPrice,
        discounted_price: discountedDayPrice,
        matched_strategy: matchedStrategy ? { id: matchedStrategy.id, name: matchedStrategy.name } : null
      });
    }

    originalTotal = Math.round(originalTotal * 100) / 100;
    discountedTotal = Math.round(discountedTotal * 100) / 100;
    const discountAmount = Math.round((originalTotal - discountedTotal) * 100) / 100;

    res.json(success({
      room_type: {
        id: roomType.id,
        name: roomType.name,
        base_price: parseFloat(roomType.base_price)
      },
      member_level: memberLevel ? {
        id: memberLevel.id,
        name: memberLevel.name,
        discount: parseFloat(memberLevel.discount)
      } : null,
      date_range: {
        start_date,
        end_date,
        nights: nightCount
      },
      original_total: originalTotal,
      member_discount_percent: memberDiscount,
      discount_amount: discountAmount,
      final_total: discountedTotal,
      daily_breakdown: dailyBreakdown
    }));
  } catch (err) {
    res.json(error('计算房价失败: ' + err.message));
  }
}

module.exports = {
  getPriceStrategies,
  batchCreatePriceStrategies,
  calculatePrice
};
