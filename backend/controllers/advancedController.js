const { db } = require('../database');
const { success, error } = require('../utils/response');

const now = () => new Date().toISOString();

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function forecastInventory(req, res) {
  try {
    const days = Math.min(Number(req.query.days) || 30, 365);

    const roomTypes = db.prepare('SELECT id, name, base_price, total_rooms FROM room_types WHERE status = ? ORDER BY id').all('active');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyData = [];
    const roomTypeDaily = {};

    roomTypes.forEach(rt => {
      roomTypeDaily[rt.id] = [];
    });

    for (let i = 0; i < days; i++) {
      const date = formatDate(addDays(today, i));
      const dayResult = { date, roomTypes: {} };

      for (const rt of roomTypes) {
        const totalRooms = rt.total_rooms || 0;

        const bookedCount = db.prepare(`
          SELECT COUNT(*) as count FROM bookings b
          WHERE b.room_type_id = ?
            AND b.checkin_date <= ?
            AND b.checkout_date > ?
            AND b.status IN ('pending', 'confirmed', 'checked_in')
        `).get(rt.id, date, date).count;

        const occupiedCount = db.prepare(`
          SELECT COUNT(*) as count FROM checkins c
          LEFT JOIN rooms r ON c.room_id = r.id
          WHERE r.room_type_id = ?
            AND c.status = 'checked_in'
            AND DATE(c.actual_checkin) <= ?
            AND (c.actual_checkout IS NULL OR DATE(c.actual_checkout) > ?)
        `).get(rt.id, date, date).count;

        const maintenanceCount = db.prepare(`
          SELECT COUNT(*) as count FROM rooms
          WHERE room_type_id = ? AND status = 'maintenance'
        `).get(rt.id).count;

        const used = bookedCount + occupiedCount;
        const available = Math.max(0, totalRooms - used - maintenanceCount);
        const occupancyRate = totalRooms > 0 ? used / totalRooms : 0;

        const rtData = {
          room_type_id: rt.id,
          room_type_name: rt.name,
          base_price: rt.base_price,
          total: totalRooms,
          booked: bookedCount,
          occupied: occupiedCount,
          maintenance: maintenanceCount,
          available,
          occupancyRate: Number((occupancyRate * 100).toFixed(2))
        };

        dayResult.roomTypes[rt.id] = rtData;
        roomTypeDaily[rt.id].push({ date, ...rtData });
      }

      const totalAll = roomTypes.reduce((sum, rt) => sum + (dayResult.roomTypes[rt.id].total), 0);
      const usedAll = roomTypes.reduce((sum, rt) => sum + (dayResult.roomTypes[rt.id].booked + dayResult.roomTypes[rt.id].occupied), 0);
      dayResult.total = totalAll;
      dayResult.used = usedAll;
      dayResult.available = roomTypes.reduce((sum, rt) => sum + dayResult.roomTypes[rt.id].available, 0);
      dayResult.occupancyRate = totalAll > 0 ? Number(((usedAll / totalAll) * 100).toFixed(2)) : 0;

      dailyData.push(dayResult);
    }

    function calcTrend(daysRange) {
      const slice = dailyData.slice(0, daysRange);
      const result = {};
      roomTypes.forEach(rt => {
        const data = slice.map(d => d.roomTypes[rt.id]);
        const avgOccupancy = data.reduce((sum, d) => sum + d.occupancyRate, 0) / data.length;
        const avgAvailable = data.reduce((sum, d) => sum + d.available, 0) / data.length;
        result[rt.id] = {
          room_type_id: rt.id,
          room_type_name: rt.name,
          avgOccupancyRate: Number(avgOccupancy.toFixed(2)),
          avgAvailable: Number(avgAvailable.toFixed(1)),
          days: daysRange
        };
      });
      const overallAvg = slice.reduce((sum, d) => sum + d.occupancyRate, 0) / slice.length;
      return {
        byRoomType: result,
        overallAvgOccupancyRate: Number(overallAvg.toFixed(2)),
        days: daysRange
      };
    }

    const trends = {
      '7days': calcTrend(Math.min(7, days)),
      '15days': calcTrend(Math.min(15, days)),
      '30days': calcTrend(Math.min(30, days))
    };

    res.json(success({
      days,
      startDate: dailyData[0]?.date,
      endDate: dailyData[dailyData.length - 1]?.date,
      daily: dailyData,
      byRoomType: roomTypeDaily,
      trends
    }, '获取库存预测成功'));
  } catch (err) {
    res.json(error('获取库存预测失败: ' + err.message));
  }
}

function getHolidays(req, res) {
  try {
    const { year, active } = req.query;
    let sql = 'SELECT * FROM holidays WHERE 1=1';
    const params = [];

    if (year) {
      sql += ' AND (date LIKE ? OR start_date LIKE ?)';
      params.push(`${year}%`, `${year}%`);
    }
    if (active !== undefined) {
      sql += ' AND is_active = ?';
      params.push(active === 'true' || active === '1' ? 1 : 0);
    }

    sql += ' ORDER BY COALESCE(start_date, date) ASC';
    const list = db.prepare(sql).all(...params);

    res.json(success({ list }, '获取节假日配置成功'));
  } catch (err) {
    res.json(error('获取节假日配置失败: ' + err.message));
  }
}

function createHolidays(req, res) {
  try {
    const holidays = Array.isArray(req.body) ? req.body : [req.body];

    if (holidays.length === 0) {
      return res.json(error('节假日数据不能为空', 400));
    }

    const results = [];
    const tx = db.transaction(() => {
      for (const h of holidays) {
        const { name, date, start_date, end_date, price_multiplier, rate_multiplier, room_type_id, is_active } = h;

        if (!name) {
          throw new Error('节假日名称不能为空');
        }

        const actualStart = start_date || date;
        const actualEnd = end_date || date;

        if (!actualStart) {
          throw new Error('节假日日期不能为空');
        }

        const result = db.prepare(`
          INSERT INTO holidays (name, date, start_date, end_date, price_multiplier, rate_multiplier, room_type_id, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          name,
          date || actualStart,
          actualStart,
          actualEnd,
          price_multiplier !== undefined ? price_multiplier : 1.0,
          rate_multiplier !== undefined ? rate_multiplier : 1.0,
          room_type_id || null,
          is_active !== undefined ? is_active : 1,
          now()
        );

        const created = db.prepare('SELECT * FROM holidays WHERE id = ?').get(result.lastInsertRowid);
        results.push(created);
      }
    });

    tx();

    res.json(success({ list: results, count: results.length },
      results.length > 1 ? `批量创建${results.length}个节假日成功` : '创建节假日成功'));
  } catch (err) {
    res.json(error('创建节假日失败: ' + err.message));
  }
}

function updateHoliday(req, res) {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM holidays WHERE id = ?').get(id);

    if (!existing) {
      return res.json(error('节假日不存在', 404));
    }

    const { name, date, start_date, end_date, price_multiplier, rate_multiplier, room_type_id, is_active } = req.body;

    db.prepare(`
      UPDATE holidays SET name=?, date=?, start_date=?, end_date=?, price_multiplier=?, rate_multiplier=?, room_type_id=?, is_active=?
      WHERE id=?
    `).run(
      name !== undefined ? name : existing.name,
      date !== undefined ? date : existing.date,
      start_date !== undefined ? start_date : existing.start_date,
      end_date !== undefined ? end_date : existing.end_date,
      price_multiplier !== undefined ? price_multiplier : existing.price_multiplier,
      rate_multiplier !== undefined ? rate_multiplier : existing.rate_multiplier,
      room_type_id !== undefined ? room_type_id : existing.room_type_id,
      is_active !== undefined ? is_active : existing.is_active,
      id
    );

    const holiday = db.prepare('SELECT * FROM holidays WHERE id = ?').get(id);
    res.json(success({ holiday }, '更新节假日成功'));
  } catch (err) {
    res.json(error('更新节假日失败: ' + err.message));
  }
}

function deleteHoliday(req, res) {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM holidays WHERE id = ?').get(id);

    if (!existing) {
      return res.json(error('节假日不存在', 404));
    }

    db.prepare('DELETE FROM holidays WHERE id = ?').run(id);
    res.json(success(null, '删除节假日成功'));
  } catch (err) {
    res.json(error('删除节假日失败: ' + err.message));
  }
}

function getPriceRecommendation(req, res) {
  try {
    const { room_type_id, date } = req.query;
    const days = 7;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let roomTypes;
    if (room_type_id) {
      roomTypes = db.prepare('SELECT id, name, base_price FROM room_types WHERE id = ? AND status = ?').all(room_type_id, 'active');
    } else {
      roomTypes = db.prepare('SELECT id, name, base_price FROM room_types WHERE status = ? ORDER BY id').all('active');
    }

    if (roomTypes.length === 0) {
      return res.json(error('未找到有效的房型', 404));
    }

    const startDate = date ? new Date(date) : today;
    startDate.setHours(0, 0, 0, 0);

    const recommendations = [];

    for (let i = 0; i < days; i++) {
      const currentDate = formatDate(addDays(startDate, i));

      const isHoliday = db.prepare(`
        SELECT * FROM holidays
        WHERE is_active = 1
          AND (
            (date = ?)
            OR (start_date <= ? AND end_date >= ?)
          )
        LIMIT 1
      `).get(currentDate, currentDate, currentDate);

      for (const rt of roomTypes) {
        const totalRooms = db.prepare('SELECT COUNT(*) as count FROM rooms WHERE room_type_id = ?').get(rt.id).count;

        const bookedCount = db.prepare(`
          SELECT COUNT(*) as count FROM bookings b
          WHERE b.room_type_id = ?
            AND b.checkin_date <= ?
            AND b.checkout_date > ?
            AND b.status IN ('pending', 'confirmed', 'checked_in')
        `).get(rt.id, currentDate, currentDate).count;

        const occupiedCount = db.prepare(`
          SELECT COUNT(*) as count FROM checkins c
          LEFT JOIN rooms r ON c.room_id = r.id
          WHERE r.room_type_id = ?
            AND c.status = 'checked_in'
            AND DATE(c.actual_checkin) <= ?
            AND (c.actual_checkout IS NULL OR DATE(c.actual_checkout) > ?)
        `).get(rt.id, currentDate, currentDate).count;

        const used = bookedCount + occupiedCount;
        const occupancyRate = totalRooms > 0 ? used / totalRooms : 0;

        let adjustRate = 0;
        let suggestion = '维持原价';

        if (occupancyRate > 0.9) {
          adjustRate = 0.20;
          suggestion = '建议上浮20%';
        } else if (occupancyRate >= 0.7) {
          adjustRate = 0.10;
          suggestion = '建议上浮10%';
        } else if (occupancyRate >= 0.5) {
          adjustRate = 0;
          suggestion = '建议维持原价';
        } else if (occupancyRate >= 0.3) {
          adjustRate = -0.10;
          suggestion = '建议下浮10%';
        } else {
          adjustRate = -0.20;
          suggestion = '建议下浮20%';
        }

        let holidayMultiplier = 1.0;
        let holidayInfo = null;
        if (isHoliday) {
          holidayMultiplier = isHoliday.price_multiplier || 1.0;
          holidayInfo = {
            id: isHoliday.id,
            name: isHoliday.name,
            multiplier: holidayMultiplier
          };
          adjustRate = adjustRate + (holidayMultiplier - 1);
        }

        const recommendedPrice = Number((rt.base_price * (1 + adjustRate)).toFixed(2));

        recommendations.push({
          date: currentDate,
          room_type_id: rt.id,
          room_type_name: rt.name,
          base_price: rt.base_price,
          total_rooms: totalRooms,
          booked: bookedCount,
          occupied: occupiedCount,
          occupancyRate: Number((occupancyRate * 100).toFixed(2)),
          occupancyBasedRate: Number(((adjustRate - (holidayMultiplier - 1)) * 100).toFixed(2)),
          holidayAdjustRate: Number(((holidayMultiplier - 1) * 100).toFixed(2)),
          totalAdjustRate: Number((adjustRate * 100).toFixed(2)),
          recommendedPrice,
          suggestion,
          holiday: holidayInfo
        });
      }
    }

    const groupedByRoomType = {};
    roomTypes.forEach(rt => {
      groupedByRoomType[rt.id] = recommendations.filter(r => r.room_type_id === rt.id);
    });

    res.json(success({
      startDate: formatDate(startDate),
      days,
      list: recommendations,
      byRoomType: groupedByRoomType
    }, '获取调价建议成功'));
  } catch (err) {
    res.json(error('获取调价建议失败: ' + err.message));
  }
}

module.exports = {
  forecastInventory,
  getHolidays,
  createHolidays,
  updateHoliday,
  deleteHoliday,
  getPriceRecommendation
};
