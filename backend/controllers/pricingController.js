const { db } = require('../database');
const { success, error } = require('../utils/response');
const moment = require('moment');
const { calculateCompletePrice, getActiveStrategies, calculateDailyRate } = require('../services/pricingService');

const now = () => new Date().toISOString();

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
    const { room_type_id, start_date, end_date, member_id, room_count = 1, points_to_use } = req.query;

    if (!room_type_id || !start_date || !end_date) {
      return res.json(error('房型ID、入住日期和离店日期不能为空', 400));
    }

    const roomType = db.prepare('SELECT * FROM room_types WHERE id = ?').get(room_type_id);
    if (!roomType) {
      return res.json(error('房型不存在', 404));
    }

    const result = calculateCompletePrice(
      parseInt(room_type_id),
      start_date,
      end_date,
      member_id ? parseInt(member_id) : null,
      parseInt(room_count) || 1,
      points_to_use ? parseInt(points_to_use) : null
    );

    result.room_type = {
      id: roomType.id,
      name: roomType.name,
      base_price: parseFloat(roomType.base_price)
    };

    res.json(success(result));
  } catch (err) {
    res.json(error('计算房价失败: ' + err.message));
  }
}

function getCalendarPrices(req, res) {
  try {
    const { room_type_id, year, month } = req.query;

    if (!room_type_id) {
      return res.json(error('房型ID不能为空', 400));
    }

    const roomType = db.prepare('SELECT * FROM room_types WHERE id = ?').get(room_type_id);
    if (!roomType) {
      return res.json(error('房型不存在', 404));
    }

    const targetYear = parseInt(year) || moment().year();
    const targetMonth = parseInt(month) || moment().month() + 1;

    const startDate = moment([targetYear, targetMonth - 1, 1]).format('YYYY-MM-DD');
    const endDate = moment([targetYear, targetMonth - 1, 1]).endOf('month').format('YYYY-MM-DD');

    const strategies = getActiveStrategies(parseInt(room_type_id), startDate, endDate);
    const calendarDays = [];

    const daysInMonth = moment([targetYear, targetMonth - 1, 1]).daysInMonth();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = moment([targetYear, targetMonth - 1, d]).format('YYYY-MM-DD');
      const rate = calculateDailyRate(parseInt(room_type_id), dateStr, strategies, 100);
      calendarDays.push(rate);
    }

    res.json(success({
      room_type: {
        id: roomType.id,
        name: roomType.name,
        base_price: parseFloat(roomType.base_price)
      },
      year: targetYear,
      month: targetMonth,
      calendar_days: calendarDays
    }));
  } catch (err) {
    res.json(error('获取日历价格失败: ' + err.message));
  }
}

module.exports = {
  getPriceStrategies,
  batchCreatePriceStrategies,
  calculatePrice,
  getCalendarPrices
};
