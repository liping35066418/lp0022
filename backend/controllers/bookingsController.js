const { db } = require('../database');
const { success, error } = require('../utils/response');
const moment = require('moment');

const now = () => new Date().toISOString();

const VALID_BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'checked_in', 'checked_out'];
const ACTIVE_STATUSES = ['pending', 'confirmed', 'checked_in'];

function generateOrderNo() {
  const date = moment().format('YYYYMMDD');
  const random = Math.floor(Math.random() * 900000 + 100000);
  return `HT${date}${random}`;
}

function parseJSON(val) {
  if (!val) return [];
  try { return JSON.parse(val); } catch (e) { return []; }
}

function getBookedCountByDateRange(roomTypeId, checkinDate, checkoutDate, excludeBookingId = null) {
  let sql = `
    SELECT COUNT(DISTINCT br.room_id) as booked_count
    FROM bookings_rooms br
    JOIN bookings b ON br.booking_id = b.id
    WHERE b.room_type_id = ?
      AND b.status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})
      AND b.checkin_date < ?
      AND b.checkout_date > ?
  `;
  const params = [roomTypeId, ...ACTIVE_STATUSES, checkoutDate, checkinDate];

  if (excludeBookingId) {
    sql += ' AND b.id != ?';
    params.push(excludeBookingId);
  }

  return db.prepare(sql).get(...params).booked_count;
}

function getDailyBreakdown(roomTypeId, checkinDate, checkoutDate, excludeBookingId = null) {
  const start = moment(checkinDate);
  const end = moment(checkoutDate);
  const nights = end.diff(start, 'days');
  const breakdown = [];
  const roomType = db.prepare('SELECT total_rooms FROM room_types WHERE id = ?').get(roomTypeId);
  const totalRooms = roomType ? roomType.total_rooms : 0;

  for (let i = 0; i < nights; i++) {
    const dayStart = moment(start).add(i, 'days').format('YYYY-MM-DD');
    const dayEnd = moment(start).add(i + 1, 'days').format('YYYY-MM-DD');
    const booked = getBookedCountByDateRange(roomTypeId, dayStart, dayEnd, excludeBookingId);
    breakdown.push({
      date: dayStart,
      total: totalRooms,
      booked: booked,
      available: Math.max(0, totalRooms - booked)
    });
  }

  return breakdown;
}

function checkAvailability(req, res) {
  try {
    const { room_type_id, checkin_date, checkout_date } = req.query;

    if (!room_type_id || !checkin_date || !checkout_date) {
      return res.json(error('房型ID、入住日期和离店日期不能为空', 400));
    }

    const roomType = db.prepare('SELECT * FROM room_types WHERE id = ?').get(room_type_id);
    if (!roomType) {
      return res.json(error('房型不存在', 404));
    }

    if (moment(checkin_date).isSameOrAfter(checkout_date)) {
      return res.json(error('入住日期必须早于离店日期', 400));
    }

    const totalRooms = roomType.total_rooms;
    const booked = getBookedCountByDateRange(room_type_id, checkin_date, checkout_date);
    const available = Math.max(0, totalRooms - booked);
    const dailyBreakdown = getDailyBreakdown(room_type_id, checkin_date, checkout_date);

    res.json(success({
      room_type_id: parseInt(room_type_id),
      room_type_name: roomType.name,
      checkin_date,
      checkout_date,
      total: totalRooms,
      booked: booked,
      available: available,
      daily_breakdown: dailyBreakdown
    }, '查询库存成功'));
  } catch (err) {
    res.json(error('查询库存失败: ' + err.message));
  }
}

function getBookings(req, res) {
  try {
    const { status, start_date, end_date, member_id, keyword, page = 1, page_size = 20 } = req.query;
    let sql = `
      SELECT b.*, m.name as member_name, m.phone as member_phone,
             rt.name as room_type_name, rt.base_price
      FROM bookings b
      LEFT JOIN members m ON b.member_id = m.id
      LEFT JOIN room_types rt ON b.room_type_id = rt.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND b.status = ?';
      params.push(status);
    }
    if (start_date) {
      sql += ' AND b.checkin_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      sql += ' AND b.checkout_date <= ?';
      params.push(end_date);
    }
    if (member_id) {
      sql += ' AND b.member_id = ?';
      params.push(member_id);
    }
    if (keyword) {
      sql += ' AND (b.order_no LIKE ? OR m.name LIKE ? OR m.phone LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const countSql = sql.replace(/SELECT b\.[\s\S]*?FROM bookings/, 'SELECT COUNT(*) as count FROM bookings');
    const total = db.prepare(countSql).get(...params).count;

    sql += ' ORDER BY b.id DESC LIMIT ? OFFSET ?';
    const limit = parseInt(page_size);
    const offset = (parseInt(page) - 1) * limit;
    params.push(limit, offset);

    const bookings = db.prepare(sql).all(...params);

    bookings.forEach(b => {
      const rooms = db.prepare(`
        SELECT r.*, rt.name as room_type_name
        FROM bookings_rooms br
        JOIN rooms r ON br.room_id = r.id
        LEFT JOIN room_types rt ON r.room_type_id = rt.id
        WHERE br.booking_id = ?
      `).all(b.id);
      b.rooms = rooms;
    });

    res.json(success({
      list: bookings,
      pagination: {
        page: parseInt(page),
        page_size: limit,
        total: total,
        total_pages: Math.ceil(total / limit)
      }
    }, '获取预订列表成功'));
  } catch (err) {
    res.json(error('获取预订列表失败: ' + err.message));
  }
}

function getBookingDetail(req, res) {
  try {
    const { id } = req.params;

    const booking = db.prepare(`
      SELECT b.*, m.name as member_name, m.phone as member_phone, m.level as member_level,
             rt.name as room_type_name, rt.base_price, rt.bed_count, rt.max_guests
      FROM bookings b
      LEFT JOIN members m ON b.member_id = m.id
      LEFT JOIN room_types rt ON b.room_type_id = rt.id
      WHERE b.id = ?
    `).get(id);

    if (!booking) {
      return res.json(error('预订不存在', 404));
    }

    const rooms = db.prepare(`
      SELECT r.*, rt.name as room_type_name
      FROM bookings_rooms br
      JOIN rooms r ON br.room_id = r.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE br.booking_id = ?
    `).all(id);

    const bills = db.prepare(`
      SELECT * FROM bills WHERE booking_id = ? ORDER BY id
    `).all(id);

    booking.rooms = rooms;
    booking.bills = bills;

    res.json(success({ booking }, '获取预订详情成功'));
  } catch (err) {
    res.json(error('获取预订详情失败: ' + err.message));
  }
}

function calculateRoomPrice(roomTypeId, checkinDate, checkoutDate, memberId = null) {
  const roomType = db.prepare('SELECT * FROM room_types WHERE id = ?').get(roomTypeId);
  if (!roomType) return { total: 0, daily: [] };

  const start = moment(checkinDate);
  const end = moment(checkoutDate);
  const nights = end.diff(start, 'days');

  let memberDiscount = 100;
  if (memberId) {
    const member = db.prepare('SELECT m.*, ml.discount FROM members m LEFT JOIN member_levels ml ON m.level = ml.level WHERE m.id = ?').get(memberId);
    if (member && member.discount) {
      memberDiscount = parseFloat(member.discount);
    }
  }

  const daily = [];
  let total = 0;

  for (let i = 0; i < nights; i++) {
    const dateStr = moment(start).add(i, 'days').format('YYYY-MM-DD');
    const dow = moment(dateStr).day();
    const isWeekend = dow === 0 || dow === 6;
    let dayPrice = parseFloat(roomType.base_price);

    const holiday = db.prepare(`
      SELECT * FROM holidays
      WHERE is_active = 1
        AND (room_type_id IS NULL OR room_type_id = ?)
        AND start_date <= ? AND end_date >= ?
      ORDER BY price_multiplier DESC LIMIT 1
    `).get(roomTypeId, dateStr, dateStr);

    if (holiday) {
      dayPrice = dayPrice * (parseFloat(holiday.price_multiplier) || 1);
    } else if (isWeekend) {
      const weekendStrategy = db.prepare(`
        SELECT * FROM price_strategies
        WHERE room_type_id = ? AND is_active = 1 AND price_type = 'weekend'
          AND (start_date IS NULL OR start_date <= ?)
          AND (end_date IS NULL OR end_date >= ?)
        LIMIT 1
      `).get(roomTypeId, dateStr, dateStr);
      if (weekendStrategy) {
        dayPrice = parseFloat(weekendStrategy.price);
      } else {
        dayPrice = dayPrice * 1.2;
      }
    } else {
      const weekdayStrategy = db.prepare(`
        SELECT * FROM price_strategies
        WHERE room_type_id = ? AND is_active = 1 AND price_type = 'weekday'
          AND (start_date IS NULL OR start_date <= ?)
          AND (end_date IS NULL OR end_date >= ?)
        LIMIT 1
      `).get(roomTypeId, dateStr, dateStr);
      if (weekdayStrategy) {
        dayPrice = parseFloat(weekdayStrategy.price);
      } else {
        const baseStrategy = db.prepare(`
          SELECT * FROM price_strategies
          WHERE room_type_id = ? AND is_active = 1 AND price_type = 'base'
          LIMIT 1
        `).get(roomTypeId);
        if (baseStrategy) {
          dayPrice = parseFloat(baseStrategy.price);
        }
      }
    }

    dayPrice = Math.round(dayPrice * (memberDiscount / 100) * 100) / 100;
    total += dayPrice;
    daily.push({ date: dateStr, price: dayPrice });
  }

  return { total: Math.round(total * 100) / 100, daily };
}

function createBooking(req, res) {
  try {
    const {
      member_id,
      room_type_id,
      checkin_date,
      checkout_date,
      guest_count,
      room_ids
    } = req.body;

    if (!room_type_id || !checkin_date || !checkout_date) {
      return res.json(error('房型、入住日期、离店日期不能为空', 400));
    }

    if (moment(checkin_date).isSameOrAfter(checkout_date)) {
      return res.json(error('入住日期必须早于离店日期', 400));
    }

    const roomType = db.prepare('SELECT * FROM room_types WHERE id = ?').get(room_type_id);
    if (!roomType) {
      return res.json(error('房型不存在', 404));
    }

    if (member_id) {
      const member = db.prepare('SELECT * FROM members WHERE id = ?').get(member_id);
      if (!member) {
        return res.json(error('会员不存在', 404));
      }
    }

    const tx = db.transaction(() => {


      const booked = getBookedCountByDateRange(room_type_id, checkin_date, checkout_date);
      const available = roomType.total_rooms - booked;
      const requestedCount = room_ids && room_ids.length > 0 ? room_ids.length : 1;

      if (available < requestedCount) {
        throw new Error(`库存不足，当前可用: ${available} 间`);
      }

      let assignedRoomIds = [];
      if (room_ids && room_ids.length > 0) {
        for (const roomId of room_ids) {
          const room = db.prepare(`
            SELECT r.* FROM rooms r
            WHERE r.id = ? AND r.room_type_id = ?
              AND r.status IN ('available', 'cleaning')
              AND r.id NOT IN (
                SELECT br.room_id FROM bookings_rooms br
                JOIN bookings b ON br.booking_id = b.id
                WHERE b.status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})
                  AND b.checkin_date < ? AND b.checkout_date > ?
              )
          `).get(roomId, ...ACTIVE_STATUSES, checkout_date, checkin_date);

          if (!room) {
            throw new Error(`客房 ${roomId} 不可用`);
          }
          assignedRoomIds.push(roomId);
        }
      } else {
        const availableRooms = db.prepare(`
          SELECT r.* FROM rooms r
          WHERE r.room_type_id = ?
            AND r.status IN ('available', 'cleaning')
            AND r.id NOT IN (
              SELECT br.room_id FROM bookings_rooms br
              JOIN bookings b ON br.booking_id = b.id
              WHERE b.status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})
                AND b.checkin_date < ? AND b.checkout_date > ?
            )
          ORDER BY CASE WHEN r.status = 'available' THEN 0 ELSE 1 END, r.room_number
          LIMIT ?
        `).all(room_type_id, ...ACTIVE_STATUSES, checkout_date, checkin_date, requestedCount);

        if (availableRooms.length < requestedCount) {
          throw new Error('可用客房数量不足');
        }
        assignedRoomIds = availableRooms.map(r => r.id);
      }

      const priceResult = calculateRoomPrice(room_type_id, checkin_date, checkout_date, member_id);
      const totalPrice = priceResult.total * assignedRoomIds.length;
      const perNightPrice = priceResult.daily.length > 0 ? priceResult.daily[0].price : roomType.base_price;
      const deposit = Math.round(perNightPrice * assignedRoomIds.length * 100) / 100;

      let orderNo = generateOrderNo();
      let exists = db.prepare('SELECT id FROM bookings WHERE order_no = ?').get(orderNo);
      while (exists) {
        orderNo = generateOrderNo();
        exists = db.prepare('SELECT id FROM bookings WHERE order_no = ?').get(orderNo);
      }

      const result = db.prepare(`
        INSERT INTO bookings (order_no, member_id, room_type_id, checkin_date, checkout_date, guest_count, total_price, deposit, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(
        orderNo,
        member_id || null,
        room_type_id,
        checkin_date,
        checkout_date,
        guest_count || 1,
        Math.round(totalPrice * 100) / 100,
        deposit
      );

      const bookingId = result.lastInsertRowid;
      const insertBookingRoom = db.prepare('INSERT INTO bookings_rooms (booking_id, room_id) VALUES (?, ?)');
      for (const roomId of assignedRoomIds) {
        insertBookingRoom.run(bookingId, roomId);
      }

      let pointsDeducted = 0;
      if (member_id) {
        const member = db.prepare('SELECT m.*, ml.points_rate, ml.exchange_rate FROM members m LEFT JOIN member_levels ml ON m.level = ml.level WHERE m.id = ?').get(member_id);
        if (member) {
          const pointsRate = parseFloat(member.points_rate) || 1.0;
          pointsDeducted = Math.floor(totalPrice * pointsRate);
          if (member.points >= pointsDeducted) {
            db.prepare('UPDATE members SET points = points - ? WHERE id = ?').run(pointsDeducted, member_id);
            db.prepare(`
              INSERT INTO points_records (member_id, type, points, description, order_no)
              VALUES (?, 'pending', ?, ?, ?)
            `).run(member_id, pointsDeducted, '预订预扣积分', orderNo);
          } else {
            pointsDeducted = 0;
          }
        }
      }

      return { bookingId, orderNo, totalPrice, deposit, pointsDeducted };
    });

    const result = tx();

    const booking = db.prepare(`
      SELECT b.*, m.name as member_name, m.phone as member_phone,
             rt.name as room_type_name
      FROM bookings b
      LEFT JOIN members m ON b.member_id = m.id
      LEFT JOIN room_types rt ON b.room_type_id = rt.id
      WHERE b.id = ?
    `).get(result.bookingId);

    const rooms = db.prepare(`
      SELECT r.*, rt.name as room_type_name
      FROM bookings_rooms br
      JOIN rooms r ON br.room_id = r.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE br.booking_id = ?
    `).all(result.bookingId);

    booking.rooms = rooms;
    booking.points_deducted = result.pointsDeducted;

    res.json(success({ booking }, '创建预订成功'));
  } catch (err) {
    res.json(error('创建预订失败: ' + err.message));
  }
}

function updateBooking(req, res) {
  try {
    const { id } = req.params;
    const {
      member_id,
      room_type_id,
      checkin_date,
      checkout_date,
      guest_count,
      room_ids
    } = req.body;

    const existing = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    if (!existing) {
      return res.json(error('预订不存在', 404));
    }

    if (existing.status === 'cancelled' || existing.status === 'checked_out') {
      return res.json(error('已取消或已退房的预订无法修改', 400));
    }

    const newRoomTypeId = room_type_id !== undefined ? room_type_id : existing.room_type_id;
    const newCheckinDate = checkin_date || existing.checkin_date;
    const newCheckoutDate = checkout_date || existing.checkout_date;
    const newMemberId = member_id !== undefined ? member_id : existing.member_id;

    if (moment(newCheckinDate).isSameOrAfter(newCheckoutDate)) {
      return res.json(error('入住日期必须早于离店日期', 400));
    }

    const roomType = db.prepare('SELECT * FROM room_types WHERE id = ?').get(newRoomTypeId);
    if (!roomType) {
      return res.json(error('房型不存在', 404));
    }

    const tx = db.transaction(() => {


      const booked = getBookedCountByDateRange(newRoomTypeId, newCheckinDate, newCheckoutDate, id);
      const requestedCount = room_ids && room_ids.length > 0 ? room_ids.length : 1;

      if (roomType.total_rooms - booked < requestedCount) {
        throw new Error('库存不足，无法修改预订');
      }

      if (room_ids && room_ids.length > 0) {
        for (const roomId of room_ids) {
          const room = db.prepare(`
            SELECT r.* FROM rooms r
            WHERE r.id = ? AND r.room_type_id = ?
              AND r.status IN ('available', 'cleaning')
              AND r.id NOT IN (
                SELECT br.room_id FROM bookings_rooms br
                JOIN bookings b ON br.booking_id = b.id
                WHERE b.id != ? AND b.status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})
                  AND b.checkin_date < ? AND b.checkout_date > ?
              )
          `).get(roomId, newRoomTypeId, id, ...ACTIVE_STATUSES, newCheckoutDate, newCheckinDate);

          if (!room) {
            throw new Error(`客房 ${roomId} 不可用`);
          }
        }

        db.prepare('DELETE FROM bookings_rooms WHERE booking_id = ?').run(id);
        const insertBookingRoom = db.prepare('INSERT INTO bookings_rooms (booking_id, room_id) VALUES (?, ?)');
        for (const roomId of room_ids) {
          insertBookingRoom.run(id, roomId);
        }
      }

      const priceResult = calculateRoomPrice(newRoomTypeId, newCheckinDate, newCheckoutDate, newMemberId);
      const roomCount = db.prepare('SELECT COUNT(*) as count FROM bookings_rooms WHERE booking_id = ?').get(id).count;
      const totalPrice = Math.round(priceResult.total * roomCount * 100) / 100;
      const perNightPrice = priceResult.daily.length > 0 ? priceResult.daily[0].price : roomType.base_price;
      const deposit = Math.round(perNightPrice * roomCount * 100) / 100;

      db.prepare(`
        UPDATE bookings SET
          member_id = ?,
          room_type_id = ?,
          checkin_date = ?,
          checkout_date = ?,
          guest_count = ?,
          total_price = ?,
          deposit = ?
        WHERE id = ?
      `).run(
        newMemberId || null,
        newRoomTypeId,
        newCheckinDate,
        newCheckoutDate,
        guest_count !== undefined ? guest_count : existing.guest_count,
        totalPrice,
        deposit,
        id
      );
    });

    tx();

    const booking = db.prepare(`
      SELECT b.*, m.name as member_name, m.phone as member_phone,
             rt.name as room_type_name
      FROM bookings b
      LEFT JOIN members m ON b.member_id = m.id
      LEFT JOIN room_types rt ON b.room_type_id = rt.id
      WHERE b.id = ?
    `).get(id);

    const rooms = db.prepare(`
      SELECT r.*, rt.name as room_type_name
      FROM bookings_rooms br
      JOIN rooms r ON br.room_id = r.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE br.booking_id = ?
    `).all(id);

    booking.rooms = rooms;

    res.json(success({ booking }, '修改预订成功'));
  } catch (err) {
    res.json(error('修改预订失败: ' + err.message));
  }
}

function cancelBooking(req, res) {
  try {
    const { id } = req.params;

    const existing = db.prepare(`
      SELECT b.*, m.name as member_name, m.phone as member_phone,
             rt.name as room_type_name
      FROM bookings b
      LEFT JOIN members m ON b.member_id = m.id
      LEFT JOIN room_types rt ON b.room_type_id = rt.id
      WHERE b.id = ?
    `).get(id);

    if (!existing) {
      return res.json(error('预订不存在', 404));
    }

    if (existing.status === 'cancelled') {
      return res.json(error('预订已取消', 400));
    }

    if (existing.status === 'checked_in' || existing.status === 'checked_out') {
      return res.json(error('已入住或已退房的预订无法取消', 400));
    }

    const tx = db.transaction(() => {


      const today = moment().startOf('day');
      const checkin = moment(existing.checkin_date).startOf('day');
      const daysDiff = checkin.diff(today, 'days');

      let penaltyRate = 0;
      let penaltyAmount = 0;
      let refundAmount = existing.total_price;

      if (daysDiff >= 7) {
        penaltyRate = 0;
      } else if (daysDiff >= 3 && daysDiff < 7) {
        penaltyRate = 0.2;
      } else if (daysDiff >= 1 && daysDiff < 3) {
        penaltyRate = 0.5;
      } else {
        penaltyRate = 1;
      }

      penaltyAmount = Math.round(existing.total_price * penaltyRate * 100) / 100;
      refundAmount = Math.round((existing.total_price - penaltyAmount) * 100) / 100;

      db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(id);

      if (penaltyAmount > 0) {
        db.prepare(`
          INSERT INTO bills (booking_id, type, amount, description)
          VALUES (?, 'penalty', ?, ?)
        `).run(id, penaltyAmount, `取消预订违约金 (${(penaltyRate * 100).toFixed(0)}%)`);
      }

      if (refundAmount > 0) {
        db.prepare(`
          INSERT INTO bills (booking_id, type, amount, description)
          VALUES (?, 'refund', ?, ?)
        `).run(id, refundAmount, '取消预订退款');
      }

      if (existing.member_id) {
        const pendingPoint = db.prepare(`
          SELECT * FROM points_records
          WHERE member_id = ? AND order_no = ? AND type = 'pending'
          ORDER BY id DESC LIMIT 1
        `).get(existing.member_id, existing.order_no);

        if (pendingPoint && pendingPoint.points > 0) {
          db.prepare('UPDATE members SET points = points + ? WHERE id = ?').run(pendingPoint.points, existing.member_id);
          db.prepare(`
            INSERT INTO points_records (member_id, type, points, description, order_no)
            VALUES (?, 'refund', ?, ?, ?)
          `).run(existing.member_id, pendingPoint.points, '取消预订返还积分', existing.order_no);
        }
      }

      return { penaltyRate, penaltyAmount, refundAmount, daysDiff };
    });

    const result = tx();

    const booking = db.prepare(`
      SELECT b.*, m.name as member_name, m.phone as member_phone,
             rt.name as room_type_name
      FROM bookings b
      LEFT JOIN members m ON b.member_id = m.id
      LEFT JOIN room_types rt ON b.room_type_id = rt.id
      WHERE b.id = ?
    `).get(id);

    const rooms = db.prepare(`
      SELECT r.*, rt.name as room_type_name
      FROM bookings_rooms br
      JOIN rooms r ON br.room_id = r.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE br.booking_id = ?
    `).all(id);

    const bills = db.prepare('SELECT * FROM bills WHERE booking_id = ? ORDER BY id').all(id);

    booking.rooms = rooms;
    booking.bills = bills;
    booking.cancel_info = {
      days_before_checkin: result.daysDiff,
      penalty_rate: result.penaltyRate,
      penalty_amount: result.penaltyAmount,
      refund_amount: result.refundAmount
    };

    res.json(success({ booking }, '取消预订成功'));
  } catch (err) {
    res.json(error('取消预订失败: ' + err.message));
  }
}

function confirmBooking(req, res) {
  try {
    const { id } = req.params;

    const existing = db.prepare(`
      SELECT b.*, m.name as member_name, m.phone as member_phone,
             rt.name as room_type_name
      FROM bookings b
      LEFT JOIN members m ON b.member_id = m.id
      LEFT JOIN room_types rt ON b.room_type_id = rt.id
      WHERE b.id = ?
    `).get(id);

    if (!existing) {
      return res.json(error('预订不存在', 404));
    }

    if (existing.status === 'confirmed') {
      return res.json(error('预订已确认', 400));
    }

    if (existing.status !== 'pending') {
      return res.json(error('只有待确认状态的预订才能确认', 400));
    }

    const tx = db.transaction(() => {


      db.prepare("UPDATE bookings SET status = 'confirmed' WHERE id = ?").run(id);

      if (existing.member_id) {
        const pendingPoint = db.prepare(`
          SELECT * FROM points_records
          WHERE member_id = ? AND order_no = ? AND type = 'pending'
          ORDER BY id DESC LIMIT 1
        `).get(existing.member_id, existing.order_no);

        if (pendingPoint && pendingPoint.points > 0) {
          db.prepare(`
            UPDATE points_records SET type = 'earn', description = ?
            WHERE id = ?
          `).run('预订确认消费积分', pendingPoint.id);
        }
      }
    });

    tx();

    const booking = db.prepare(`
      SELECT b.*, m.name as member_name, m.phone as member_phone,
             rt.name as room_type_name
      FROM bookings b
      LEFT JOIN members m ON b.member_id = m.id
      LEFT JOIN room_types rt ON b.room_type_id = rt.id
      WHERE b.id = ?
    `).get(id);

    const rooms = db.prepare(`
      SELECT r.*, rt.name as room_type_name
      FROM bookings_rooms br
      JOIN rooms r ON br.room_id = r.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE br.booking_id = ?
    `).all(id);

    booking.rooms = rooms;

    res.json(success({ booking }, '确认预订成功'));
  } catch (err) {
    res.json(error('确认预订失败: ' + err.message));
  }
}

module.exports = {
  checkAvailability,
  getBookings,
  getBookingDetail,
  createBooking,
  updateBooking,
  cancelBooking,
  confirmBooking
};
