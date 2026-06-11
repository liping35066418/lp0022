const { db } = require('../database');
const { success, error } = require('../utils/response');
const moment = require('moment');
const { calculateStayBreakdown, getMemberInfo, getDateRange } = require('../services/pricingService');

const now = () => new Date().toISOString();

function parseJSON(val) {
  if (!val) return [];
  try { return JSON.parse(val); } catch (e) { return []; }
}

function parsePriceBreakdown(breakdownStr) {
  if (!breakdownStr) return null;
  try { return JSON.parse(breakdownStr); } catch (e) { return null; }
}

function getCheckinDetail(checkinId) {
  const checkin = db.prepare(`
    SELECT c.*, r.room_no, rt.name as room_type_name, rt.id as room_type_id, rt.base_price,
           m.name as member_name, m.level as member_level,
           b.order_no as booking_order_no, b.original_total, b.discount_amount,
           b.discounted_total, b.points_deducted, b.points_deduction_amount,
           b.member_discount_percent, b.member_level, b.price_breakdown
    FROM checkins c
    LEFT JOIN rooms r ON c.room_id = r.id
    LEFT JOIN room_types rt ON r.room_type_id = rt.id
    LEFT JOIN members m ON c.member_id = m.id
    LEFT JOIN bookings b ON c.booking_id = b.id
    WHERE c.id = ?
  `).get(checkinId);

  if (!checkin) return null;

  const bills = db.prepare('SELECT * FROM bills WHERE checkin_id = ? ORDER BY created_at ASC').all(checkinId);

  const depositTotal = bills.filter(b => b.type === 'deposit').reduce((sum, b) => sum + b.amount, 0);
  const extraTotal = bills.filter(b => b.type === 'extra').reduce((sum, b) => sum + b.amount, 0);
  const roomTotal = bills.filter(b => b.type === 'room').reduce((sum, b) => sum + b.amount, 0);
  const refundTotal = bills.filter(b => b.type === 'refund').reduce((sum, b) => sum + b.amount, 0);

  checkin.bills = bills;
  checkin.price_breakdown = parsePriceBreakdown(checkin.price_breakdown);
  checkin.balance = {
    deposit_total: Math.round(depositTotal * 100) / 100,
    extra_total: Math.round(extraTotal * 100) / 100,
    room_total: Math.round(roomTotal * 100) / 100,
    refund_total: Math.round(refundTotal * 100) / 100,
    net_balance: Math.round((depositTotal - roomTotal - extraTotal - refundTotal) * 100) / 100
  };

  return checkin;
}

function getCheckins(req, res) {
  try {
    const { status, room_no, start_date, end_date, keyword } = req.query;
    let sql = `
      SELECT c.*, r.room_no, rt.name as room_type_name, m.name as member_name
      FROM checkins c
      LEFT JOIN rooms r ON c.room_id = r.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      LEFT JOIN members m ON c.member_id = m.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND c.status = ?';
      params.push(status);
    }
    if (room_no) {
      sql += ' AND r.room_no LIKE ?';
      params.push(`%${room_no}%`);
    }
    if (start_date) {
      sql += ' AND DATE(c.actual_checkin) >= ?';
      params.push(start_date);
    }
    if (end_date) {
      sql += ' AND DATE(c.actual_checkin) <= ?';
      params.push(end_date);
    }
    if (keyword) {
      sql += ' AND (c.guest_name LIKE ? OR c.guest_phone LIKE ? OR r.room_no LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    sql += ' ORDER BY c.id DESC';
    const checkins = db.prepare(sql).all(...params);
    res.json(success({ list: checkins }, '获取入住单列表成功'));
  } catch (err) {
    res.json(error('获取入住单列表失败: ' + err.message));
  }
}

function getCheckinDetailById(req, res) {
  try {
    const { id } = req.params;
    const detail = getCheckinDetail(id);
    if (!detail) {
      return res.json(error('入住单不存在', 404));
    }
    res.json(success({ checkin: detail }, '获取入住单详情成功'));
  } catch (err) {
    res.json(error('获取入住单详情失败: ' + err.message));
  }
}

function checkin(req, res) {
  try {
    const { booking_id, room_id, guest_name, guest_idcard, guest_phone, member_id, deposit_amount, expected_checkout } = req.body;

    if (!room_id || !guest_name) {
      return res.json(error('客房和客人姓名不能为空', 400));
    }

    const room = db.prepare(`
      SELECT r.*, rt.name as room_type_name, rt.id as room_type_id, rt.base_price
      FROM rooms r LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE r.id = ?
    `).get(room_id);
    if (!room) {
      return res.json(error('客房不存在', 404));
    }
    if (room.status !== 'available' && room.status !== 'cleaning') {
      return res.json(error('当前客房不可入住，状态: ' + room.status, 400));
    }

    let booking = null;
    if (booking_id) {
      booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking_id);
      if (!booking) {
        return res.json(error('关联的预订不存在', 404));
      }
      if (booking.status !== 'confirmed') {
        return res.json(error('预订状态不是已确认，当前状态: ' + booking.status, 400));
      }
      if (booking.room_type_id !== room.room_type_id) {
        return res.json(error('预订房型与入住客房房型不匹配', 400));
      }
    }

    const memberInfo = getMemberInfo(member_id);

    const actualCheckin = now();
    const checkinDateStr = moment(actualCheckin).format('YYYY-MM-DD');
    let defaultCheckoutDate = moment(actualCheckin).add(1, 'days').format('YYYY-MM-DD');

    if (booking) {
      defaultCheckoutDate = booking.checkout_date;
    } else if (expected_checkout) {
      defaultCheckoutDate = expected_checkout;
    }

    const tx = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO checkins (booking_id, room_id, member_id, guest_name, guest_idcard, guest_phone,
                              actual_checkin, actual_checkout, deposit_amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        booking_id || null,
        room_id,
        member_id || null,
        guest_name,
        guest_idcard || null,
        guest_phone || null,
        actualCheckin,
        null,
        deposit_amount !== undefined && deposit_amount !== null ? parseFloat(deposit_amount) : 0,
        'checked_in'
      );

      const checkinId = result.lastInsertRowid;

      db.prepare("UPDATE rooms SET status = 'occupied', updated_at = ? WHERE id = ?").run(now(), room_id);

      if (booking_id) {
        db.prepare("UPDATE bookings SET status = 'checked_in' WHERE id = ?").run(booking_id);

        if (member_id) {
          const pendingPoints = db.prepare(`
            SELECT * FROM points_records
            WHERE member_id = ? AND type = 'pending' AND order_no = ?
          `).all(member_id, booking.order_no);

          for (const pr of pendingPoints) {
            db.prepare(`
              UPDATE points_records SET type = 'earn', description = ?
              WHERE id = ?
            `).run(`入住消费积分（预订 ${booking.order_no}）`, pr.id);
          }
        }
      }

      if (deposit_amount > 0) {
        db.prepare(`
          INSERT INTO bills (checkin_id, booking_id, type, amount, description)
          VALUES (?, ?, 'deposit', ?, ?)
        `).run(checkinId, booking_id || null, parseFloat(deposit_amount), '入住押金');
      }

      return checkinId;
    });

    const checkinId = tx();
    const detail = getCheckinDetail(checkinId);
    res.json(success({ checkin: detail }, '办理入住成功'));
  } catch (err) {
    res.json(error('办理入住失败: ' + err.message));
  }
}

function extendStay(req, res) {
  try {
    const { id } = params;
    const { new_checkout_date } = req.body;

    if (!new_checkout_date) {
      return res.json(error('新离店日期不能为空', 400));
    }

    const existing = db.prepare(`
      SELECT c.*, r.room_no, rt.id as room_type_id
      FROM checkins c
      LEFT JOIN rooms r ON c.room_id = r.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE c.id = ?
    `).get(id);

    if (!existing) {
      return res.json(error('入住单不存在', 404));
    }
    if (existing.status !== 'checked_in' && existing.status !== 'extended') {
      return res.json(error('当前入住状态不允许续住，状态: ' + existing.status, 400));
    }

    const currentCheckout = existing.actual_checkout
      ? moment(existing.actual_checkout)
      : moment(existing.actual_checkin).add(1, 'days');

    const newCheckout = moment(new_checkout_date);
    if (newCheckout.isSameOrBefore(currentCheckout, 'day')) {
      return res.json(error('新离店日期必须晚于当前离店日期', 400));
    }

    const extendStart = currentCheckout.format('YYYY-MM-DD');
    const extendEnd = newCheckout.format('YYYY-MM-DD');

    const conflictBooking = db.prepare(`
      SELECT br.* FROM bookings_rooms br
      JOIN bookings b ON br.booking_id = b.id
      WHERE br.room_id = ?
        AND b.status IN ('confirmed', 'pending')
        AND b.checkin_date < ?
        AND b.checkout_date > ?
      LIMIT 1
    `).get(existing.room_id, extendEnd, extendStart);

    if (conflictBooking) {
      return res.json(error('续住期间该客房已被预订占用', 400));
    }

    const memberInfo = getMemberInfo(existing.member_id);
    const breakdown = calculateStayBreakdown(existing.room_type_id, extendStart, extendEnd, memberInfo.discount);

    if (breakdown.nights === 0) {
      return res.json(error('续住天数计算异常', 400));
    }

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE checkins SET actual_checkout = ?, status = 'extended'
        WHERE id = ?
      `).run(newCheckout.toISOString(), id);

      db.prepare(`
        INSERT INTO bills (checkin_id, booking_id, type, amount, description)
        VALUES (?, ?, 'room', ?, ?)
      `).run(
        id,
        existing.booking_id || null,
        breakdown.final_total,
        `续住房费 (${extendStart} 至 ${extendEnd}，共${breakdown.nights}晚)`
      );

      if (existing.member_id && breakdown.final_total > 0) {
        const extraPoints = Math.floor(breakdown.final_total * memberInfo.points_rate);
        if (extraPoints > 0) {
          db.prepare(`
            UPDATE members SET points = points + ?
            WHERE id = ?
          `).run(extraPoints, existing.member_id);

          db.prepare(`
            INSERT INTO points_records (member_id, type, points, description)
            VALUES (?, 'earn', ?, ?)
          `).run(existing.member_id, extraPoints, `续住消费积分（${breakdown.nights}晚）`);
        }
      }

      return breakdown;
    });

    const result = tx();
    const detail = getCheckinDetail(id);
    detail.extend_breakdown = result;
    res.json(success({ checkin: detail }, '续住成功'));
  } catch (err) {
    res.json(error('续住失败: ' + err.message));
  }
}

function previewCheckout(req, res) {
  try {
    const { id } = req.params;

    const existing = db.prepare(`
      SELECT c.*, r.room_no, rt.id as room_type_id, rt.base_price,
             m.name as member_name, m.level as member_level, m.points as member_points,
             b.original_total, b.discount_amount, b.discounted_total,
             b.points_deducted, b.points_deduction_amount,
             b.member_discount_percent, b.member_level as booking_member_level,
             b.price_breakdown, b.deposit as booking_deposit
      FROM checkins c
      LEFT JOIN rooms r ON c.room_id = r.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      LEFT JOIN members m ON c.member_id = m.id
      LEFT JOIN bookings b ON c.booking_id = b.id
      WHERE c.id = ?
    `).get(id);

    if (!existing) {
      return res.json(error('入住单不存在', 404));
    }
    if (existing.status !== 'checked_in' && existing.status !== 'extended') {
      return res.json(error('当前入住状态不允许退房，状态: ' + existing.status, 400));
    }

    const checkinDate = moment(existing.actual_checkin);
    let checkoutDate = moment();

    if (checkoutDate.isSameOrBefore(checkinDate, 'day')) {
      checkoutDate = moment(checkinDate).add(1, 'days');
    }

    const checkinDateStr = checkinDate.format('YYYY-MM-DD');
    const checkoutDateStr = checkoutDate.format('YYYY-MM-DD');
    const actualNights = checkoutDate.diff(checkinDate, 'days') || 1;

    const memberInfo = getMemberInfo(existing.member_id);
    const memberDiscount = existing.member_discount_percent || memberInfo.discount;
    const roomBreakdown = calculateStayBreakdown(existing.room_type_id, checkinDateStr, checkoutDateStr, memberDiscount);

    const bookingBreakdown = existing.price_breakdown ? parsePriceBreakdown(existing.price_breakdown) : null;
    const bookingDaily = bookingBreakdown?.daily_breakdown || [];

    const allBills = db.prepare('SELECT * FROM bills WHERE checkin_id = ?').all(id);
    const depositTotal = allBills.filter(b => b.type === 'deposit').reduce((sum, b) => sum + b.amount, 0);
    const extraCharges = allBills.filter(b => b.type === 'extra');
    const extraTotal = extraCharges.reduce((sum, b) => sum + b.amount, 0);
    const existingRoomCharges = allBills.filter(b => b.type === 'room');
    const existingRoomTotal = existingRoomCharges.reduce((sum, b) => sum + b.amount, 0);

    const finalRoomCharge = roomBreakdown.discounted_total;
    const totalConsumption = Math.round((finalRoomCharge + extraTotal) * 100) / 100;
    let refundAmount = Math.round((depositTotal - totalConsumption) * 100) / 100;
    let finalPayable = refundAmount < 0 ? Math.abs(refundAmount) : 0;
    if (refundAmount < 0) refundAmount = 0;

    const itemizedList = [];

    for (let i = 0; i < roomBreakdown.daily_breakdown.length; i++) {
      const day = roomBreakdown.daily_breakdown[i];
      const bookingDay = bookingDaily[i];

      let itemDesc = '房费';
      if (day.is_holiday && day.holiday_name) {
        itemDesc = `房费(${day.holiday_name})`;
      } else if (day.is_weekend) {
        itemDesc = '房费(周末)';
      }

      const bookingPrice = bookingDay?.discounted_price || day.discounted_price;

      itemizedList.push({
        date: day.date,
        item: itemDesc,
        unit_price: day.discounted_price,
        booking_price: bookingPrice,
        quantity: 1,
        amount: day.discounted_price,
        type: 'room',
        note: day.price_type,
        matches_booking: Math.abs(day.discounted_price - bookingPrice) < 0.01
      });
    }

    for (const extra of extraCharges) {
      itemizedList.push({
        date: moment(extra.created_at).format('YYYY-MM-DD'),
        item: extra.description || '杂费',
        unit_price: extra.amount,
        quantity: 1,
        amount: extra.amount,
        type: 'extra',
        note: extra.type
      });
    }

    const settlement = {
      checkin_id: id,
      guest_name: existing.guest_name,
      room_no: existing.room_no,
      checkin_date: checkinDateStr,
      checkout_date: checkoutDateStr,
      actual_nights: actualNights,
      original_total: roomBreakdown.original_total,
      discount_amount: roomBreakdown.discount_amount,
      total_room_charge: finalRoomCharge,
      total_extra_charges: Math.round(extraTotal * 100) / 100,
      total_consumption: totalConsumption,
      points_deducted: existing.points_deducted || 0,
      points_deduction_amount: existing.points_deduction_amount || 0,
      deposit_paid: Math.round(depositTotal * 100) / 100,
      refund_amount: refundAmount,
      final_payable: finalPayable,
      itemized_list: itemizedList,
      member_level: memberInfo.level,
      member_discount_percent: memberDiscount,
      daily_price_matches: itemizedList.filter(i => i.type === 'room').every(i => i.matches_booking)
    };

    res.json(success({ settlement }, '获取退房预览成功'));
  } catch (err) {
    res.json(error('获取退房预览失败: ' + err.message));
  }
}

function checkout(req, res) {
  try {
    const { id } = req.params;
    const { actual_checkout_date } = req.body;

    const existing = db.prepare(`
      SELECT c.*, r.room_no, rt.id as room_type_id, rt.base_price,
             m.name as member_name, m.level as member_level, m.points as member_points,
             b.original_total, b.discount_amount, b.discounted_total,
             b.points_deducted, b.points_deduction_amount,
             b.member_discount_percent, b.member_level as booking_member_level,
             b.price_breakdown, b.deposit as booking_deposit
      FROM checkins c
      LEFT JOIN rooms r ON c.room_id = r.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      LEFT JOIN members m ON c.member_id = m.id
      LEFT JOIN bookings b ON c.booking_id = b.id
      WHERE c.id = ?
    `).get(id);

    if (!existing) {
      return res.json(error('入住单不存在', 404));
    }
    if (existing.status !== 'checked_in' && existing.status !== 'extended') {
      return res.json(error('当前入住状态不允许退房，状态: ' + existing.status, 400));
    }

    const checkinDate = moment(existing.actual_checkin);
    let checkoutDate = actual_checkout_date ? moment(actual_checkout_date) : moment();

    if (checkoutDate.isSameOrBefore(checkinDate, 'day')) {
      checkoutDate = moment(checkinDate).add(1, 'days');
    }

    const checkinDateStr = checkinDate.format('YYYY-MM-DD');
    const checkoutDateStr = checkoutDate.format('YYYY-MM-DD');
    const actualNights = checkoutDate.diff(checkinDate, 'days') || 1;

    const memberInfo = getMemberInfo(existing.member_id);
    const memberDiscount = existing.member_discount_percent || memberInfo.discount;
    const roomBreakdown = calculateStayBreakdown(existing.room_type_id, checkinDateStr, checkoutDateStr, memberDiscount);

    const bookingBreakdown = existing.price_breakdown ? parsePriceBreakdown(existing.price_breakdown) : null;
    const bookingDaily = bookingBreakdown?.daily_breakdown || [];

    const allBills = db.prepare('SELECT * FROM bills WHERE checkin_id = ?').all(id);
    const depositTotal = allBills.filter(b => b.type === 'deposit').reduce((sum, b) => sum + b.amount, 0);
    const extraCharges = allBills.filter(b => b.type === 'extra');
    const extraTotal = extraCharges.reduce((sum, b) => sum + b.amount, 0);
    const existingRoomCharges = allBills.filter(b => b.type === 'room');
    const existingRoomTotal = existingRoomCharges.reduce((sum, b) => sum + b.amount, 0);

    const finalRoomCharge = roomBreakdown.discounted_total;
    const additionalRoomCharge = Math.max(0, Math.round((finalRoomCharge - existingRoomTotal) * 100) / 100);

    const totalConsumption = Math.round((finalRoomCharge + extraTotal) * 100) / 100;
    let refundAmount = Math.round((depositTotal - totalConsumption) * 100) / 100;
    let finalPayable = refundAmount < 0 ? Math.abs(refundAmount) : 0;
    if (refundAmount < 0) refundAmount = 0;

    const itemizedList = [];

    for (let i = 0; i < roomBreakdown.daily_breakdown.length; i++) {
      const day = roomBreakdown.daily_breakdown[i];
      const bookingDay = bookingDaily[i];

      let itemDesc = '房费';
      if (day.is_holiday && day.holiday_name) {
        itemDesc = `房费(${day.holiday_name})`;
      } else if (day.is_weekend) {
        itemDesc = '房费(周末)';
      }

      const bookingPrice = bookingDay?.discounted_price || day.discounted_price;

      itemizedList.push({
        date: day.date,
        item: itemDesc,
        unit_price: day.discounted_price,
        booking_price: bookingPrice,
        quantity: 1,
        amount: day.discounted_price,
        type: 'room',
        note: day.price_type,
        matches_booking: Math.abs(day.discounted_price - bookingPrice) < 0.01
      });
    }

    for (const extra of extraCharges) {
      itemizedList.push({
        date: moment(extra.created_at).format('YYYY-MM-DD'),
        item: extra.description || '杂费',
        unit_price: extra.amount,
        quantity: 1,
        amount: extra.amount,
        type: 'extra',
        note: extra.id
      });
    }

    const tx = db.transaction(() => {
      if (additionalRoomCharge > 0) {
        db.prepare(`
          INSERT INTO bills (checkin_id, booking_id, type, amount, description)
          VALUES (?, ?, 'room', ?, ?)
        `).run(
          id,
          existing.booking_id || null,
          additionalRoomCharge,
          `退房核算房费差额 (${actualNights}晚)`
        );
      }

      if (refundAmount > 0) {
        db.prepare(`
          INSERT INTO bills (checkin_id, booking_id, type, amount, description)
          VALUES (?, ?, 'refund', ?, ?)
        `).run(id, existing.booking_id || null, refundAmount, '退房退还押金');
      }

      db.prepare(`
        UPDATE checkins
        SET status = 'checked_out', actual_checkout = ?
        WHERE id = ?
      `).run(checkoutDate.toISOString(), id);

      db.prepare("UPDATE rooms SET status = 'cleaning', last_cleaned_at = ?, updated_at = ? WHERE id = ?")
        .run(now(), now(), existing.room_id);

      if (existing.booking_id) {
        db.prepare("UPDATE bookings SET status = 'checked_out' WHERE id = ?").run(existing.booking_id);
      }

      if (existing.member_id && totalConsumption > 0) {
        const earnedPoints = Math.floor(finalRoomCharge * memberInfo.points_rate);

        const extraChargesAlreadyRecorded = db.prepare(`
          SELECT SUM(pr.points) as total
          FROM points_records pr
          JOIN bills b ON pr.description LIKE '%' || b.description || '%'
          WHERE b.checkin_id = ? AND b.type = 'extra' AND pr.type = 'earn'
        `).get(id);

        const extraPointsAlreadyRecorded = extraChargesAlreadyRecorded?.total || 0;

        const extraPointsToAdd = Math.max(0, Math.floor(extraTotal * memberInfo.points_rate) - extraPointsAlreadyRecorded);
        const totalPointsToAdd = earnedPoints + extraPointsToAdd;

        if (totalPointsToAdd > 0) {
          db.prepare(`
            UPDATE members SET points = points + ?
            WHERE id = ?
          `).run(totalPointsToAdd, existing.member_id);

          if (earnedPoints > 0) {
            db.prepare(`
              INSERT INTO points_records (member_id, type, points, description)
              VALUES (?, 'earn', ?, ?)
            `).run(existing.member_id, earnedPoints, `退房结算房费积分（${actualNights}晚，${finalRoomCharge}元）`);
          }

          if (extraPointsToAdd > 0) {
            db.prepare(`
              INSERT INTO points_records (member_id, type, points, description)
              VALUES (?, 'earn', ?, ?)
            `).run(existing.member_id, extraPointsToAdd, `退房结算杂费积分（${extraTotal}元）`);
          }
        }

        db.prepare(`
          UPDATE members SET total_spent = total_spent + ?
          WHERE id = ?
        `).run(totalConsumption, existing.member_id);

        const memberAfter = db.prepare('SELECT total_spent, level FROM members WHERE id = ?').get(existing.member_id);
        if (memberAfter) {
          const newLevel = db.prepare(`
            SELECT level FROM member_levels
            WHERE min_spent <= ? AND is_active = 1
            ORDER BY min_spent DESC LIMIT 1
          `).get(memberAfter.total_spent);
          if (newLevel && newLevel.level !== memberAfter.level) {
            db.prepare('UPDATE members SET level = ? WHERE id = ?').run(newLevel.level, existing.member_id);
          }
        }
      }
    });

    tx();

    const settlement = {
      checkin_id: id,
      guest_name: existing.guest_name,
      room_no: existing.room_no,
      checkin_date: checkinDateStr,
      checkout_date: checkoutDateStr,
      actual_nights: actualNights,
      original_total: roomBreakdown.original_total,
      discount_amount: roomBreakdown.discount_amount,
      total_room_charge: finalRoomCharge,
      total_extra_charges: Math.round(extraTotal * 100) / 100,
      total_consumption: totalConsumption,
      points_deducted: existing.points_deducted || 0,
      points_deduction_amount: existing.points_deduction_amount || 0,
      deposit_paid: Math.round(depositTotal * 100) / 100,
      refund_amount: refundAmount,
      final_payable: finalPayable,
      itemized_list: itemizedList,
      member_points_earned: existing.member_id ? Math.floor(finalRoomCharge * memberInfo.points_rate) : 0,
      member_level: memberInfo.level,
      member_discount_percent: memberDiscount,
      daily_price_matches: itemizedList.filter(i => i.type === 'room').every(i => i.matches_booking)
    };

    res.json(success({ settlement }, '退房结算成功'));
  } catch (err) {
    res.json(error('退房结算失败: ' + err.message));
  }
}

function addCharge(req, res) {
  try {
    const { id } = req.params;
    const { type, amount, description } = req.body;

    const validTypes = ['餐饮', '洗衣', '电话', '物品赔偿', '其他'];
    if (!type || !validTypes.includes(type)) {
      return res.json(error('杂费类型无效，允许值: ' + validTypes.join('/'), 400));
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.json(error('杂费金额必须为正数', 400));
    }

    const existing = db.prepare('SELECT * FROM checkins WHERE id = ?').get(id);
    if (!existing) {
      return res.json(error('入住单不存在', 404));
    }
    if (existing.status === 'checked_out') {
      return res.json(error('该入住单已退房，无法添加杂费', 400));
    }

    const chargeAmount = Math.round(parseFloat(amount) * 100) / 100;
    const desc = description || `${type}消费`;

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO bills (checkin_id, booking_id, type, amount, description)
        VALUES (?, ?, 'extra', ?, ?)
      `).run(id, existing.booking_id || null, chargeAmount, `${type} - ${desc}`);

      if (existing.member_id && chargeAmount > 0) {
        const memberInfo = getMemberInfo(existing.member_id);
        const extraPoints = Math.floor(chargeAmount * memberInfo.points_rate);
        if (extraPoints > 0) {
          db.prepare('UPDATE members SET points = points + ? WHERE id = ?')
            .run(extraPoints, existing.member_id);
          db.prepare(`
            INSERT INTO points_records (member_id, type, points, description)
            VALUES (?, 'earn', ?, ?)
          `).run(existing.member_id, extraPoints, `${type}消费积分`);
        }
      }
    });

    tx();
    const detail = getCheckinDetail(id);
    res.json(success({ checkin: detail }, `添加${type}杂费成功`));
  } catch (err) {
    res.json(error('添加杂费失败: ' + err.message));
  }
}

function addDeposit(req, res) {
  try {
    const { id } = req.params;
    const { amount, description } = req.body;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.json(error('押金金额必须为正数', 400));
    }

    const existing = db.prepare('SELECT * FROM checkins WHERE id = ?').get(id);
    if (!existing) {
      return res.json(error('入住单不存在', 404));
    }
    if (existing.status === 'checked_out') {
      return res.json(error('该入住单已退房，无法补交押金', 400));
    }

    const depositAmount = Math.round(parseFloat(amount) * 100) / 100;
    const desc = description || '补交押金';

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO bills (checkin_id, booking_id, type, amount, description)
        VALUES (?, ?, 'deposit', ?, ?)
      `).run(id, existing.booking_id || null, depositAmount, desc);

      db.prepare('UPDATE checkins SET deposit_amount = deposit_amount + ? WHERE id = ?')
        .run(depositAmount, id);
    });

    tx();
    const detail = getCheckinDetail(id);
    res.json(success({ checkin: detail }, '补交押金成功'));
  } catch (err) {
    res.json(error('补交押金失败: ' + err.message));
  }
}

module.exports = {
  getCheckins,
  getCheckinDetailById,
  previewCheckout,
  checkin,
  extendStay,
  checkout,
  addCharge,
  addDeposit
};
