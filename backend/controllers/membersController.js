const { db } = require('../database');
const { success, error } = require('../utils/response');

const now = () => new Date().toISOString();

function autoUpgradeMember(memberId) {
  const member = db.prepare('SELECT total_spent, level FROM members WHERE id = ?').get(memberId);
  if (!member) return;

  const levels = db.prepare('SELECT level, min_spent FROM member_levels WHERE is_active = 1 ORDER BY min_spent DESC').all();
  for (const lvl of levels) {
    if (member.total_spent >= lvl.min_spent && member.level !== lvl.level) {
      db.prepare('UPDATE members SET level = ? WHERE id = ?').run(lvl.level, memberId);
      break;
    }
  }
}

function getMembers(req, res) {
  try {
    const { keyword, level, page = 1, pageSize = 20 } = req.query;
    let sql = 'SELECT m.*, ml.name as level_name, ml.discount, ml.points_rate FROM members m LEFT JOIN member_levels ml ON m.level = ml.level WHERE 1=1';
    const params = [];

    if (keyword) {
      sql += ' AND (m.name LIKE ? OR m.phone LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (level) {
      sql += ' AND m.level = ?';
      params.push(level);
    }

    const countSql = sql.replace('SELECT m.*, ml.name as level_name, ml.discount, ml.points_rate', 'SELECT COUNT(*) as count');
    const total = db.prepare(countSql).get(...params).count;

    sql += ' ORDER BY m.id DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

    const list = db.prepare(sql).all(...params);

    res.json(success({
      list,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        total,
        totalPages: Math.ceil(total / Number(pageSize))
      }
    }, '获取会员列表成功'));
  } catch (err) {
    res.json(error('获取会员列表失败: ' + err.message));
  }
}

function getMemberDetail(req, res) {
  try {
    const { id } = req.params;
    const member = db.prepare(`
      SELECT m.*, ml.name as level_name, ml.discount, ml.points_rate, ml.min_spent
      FROM members m LEFT JOIN member_levels ml ON m.level = ml.level
      WHERE m.id = ?
    `).get(id);

    if (!member) {
      return res.json(error('会员不存在', 404));
    }

    const pointsRecords = db.prepare(`
      SELECT * FROM points_records WHERE member_id = ? ORDER BY id DESC LIMIT 50
    `).all(id);

    const consumeHistory = db.prepare(`
      SELECT c.*, r.room_no, rt.name as room_type_name
      FROM checkins c
      LEFT JOIN rooms r ON c.room_id = r.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE c.member_id = ?
      ORDER BY c.id DESC
    `).all(id);

    const bookings = db.prepare(`
      SELECT b.*, rt.name as room_type_name
      FROM bookings b LEFT JOIN room_types rt ON b.room_type_id = rt.id
      WHERE b.member_id = ?
      ORDER BY b.id DESC
    `).all(id);

    res.json(success({
      member,
      pointsRecords,
      consumeHistory,
      bookings
    }, '获取会员详情成功'));
  } catch (err) {
    res.json(error('获取会员详情失败: ' + err.message));
  }
}

function createMember(req, res) {
  try {
    const { name, phone, level } = req.body;

    if (!name || !phone) {
      return res.json(error('姓名和手机号不能为空', 400));
    }

    const existing = db.prepare('SELECT id FROM members WHERE phone = ?').get(phone);
    if (existing) {
      return res.json(error('手机号已存在', 400));
    }

    const result = db.prepare(
      'INSERT INTO members (name, phone, level, created_at) VALUES (?, ?, ?, ?)'
    ).run(name, phone, level || 'bronze', now());

    const member = db.prepare('SELECT m.*, ml.name as level_name FROM members m LEFT JOIN member_levels ml ON m.level = ml.level WHERE m.id = ?').get(result.lastInsertRowid);
    res.json(success({ member }, '创建会员成功'));
  } catch (err) {
    res.json(error('创建会员失败: ' + err.message));
  }
}

function updateMember(req, res) {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(id);

    if (!existing) {
      return res.json(error('会员不存在', 404));
    }

    const { name, phone, level, points, total_spent } = req.body;

    if (phone && phone !== existing.phone) {
      const dup = db.prepare('SELECT id FROM members WHERE phone = ? AND id != ?').get(phone, id);
      if (dup) {
        return res.json(error('手机号已存在', 400));
      }
    }

    db.prepare(`
      UPDATE members SET name=?, phone=?, level=?, points=?, total_spent=? WHERE id=?
    `).run(
      name !== undefined ? name : existing.name,
      phone !== undefined ? phone : existing.phone,
      level !== undefined ? level : existing.level,
      points !== undefined ? points : existing.points,
      total_spent !== undefined ? total_spent : existing.total_spent,
      id
    );

    if (total_spent !== undefined) {
      autoUpgradeMember(id);
    }

    const member = db.prepare('SELECT m.*, ml.name as level_name, ml.discount, ml.points_rate FROM members m LEFT JOIN member_levels ml ON m.level = ml.level WHERE m.id = ?').get(id);
    res.json(success({ member }, '更新会员成功'));
  } catch (err) {
    res.json(error('更新会员失败: ' + err.message));
  }
}

function getPointsRecords(req, res) {
  try {
    const { id } = req.params;
    const { page = 1, pageSize = 50, type } = req.query;

    const member = db.prepare('SELECT id FROM members WHERE id = ?').get(id);
    if (!member) {
      return res.json(error('会员不存在', 404));
    }

    let sql = 'SELECT * FROM points_records WHERE member_id = ?';
    const params = [id];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    const total = db.prepare(countSql).get(...params).count;

    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

    const list = db.prepare(sql).all(...params);

    res.json(success({
      list,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        total,
        totalPages: Math.ceil(total / Number(pageSize))
      }
    }, '获取积分记录成功'));
  } catch (err) {
    res.json(error('获取积分记录失败: ' + err.message));
  }
}

function exchangePoints(req, res) {
  try {
    const { id } = req.params;
    const { points, type = 'room', description, item_name } = req.body;

    if (!points || points <= 0) {
      return res.json(error('积分数量必须大于0', 400));
    }

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    if (!member) {
      return res.json(error('会员不存在', 404));
    }

    if (member.points < points) {
      return res.json(error('积分不足，当前可用积分: ' + member.points, 400));
    }

    const level = db.prepare('SELECT exchange_rate FROM member_levels WHERE level = ?').get(member.level);
    const exchangeRate = level ? level.exchange_rate : 100;
    const amount = points / exchangeRate;

    const orderNo = 'EX' + Date.now() + Math.floor(Math.random() * 1000).toString().padStart(3, '0');

    const tx = db.transaction(() => {
      db.prepare('UPDATE members SET points = points - ? WHERE id = ?').run(points, id);
      db.prepare(`
        INSERT INTO points_records (member_id, type, points, description, order_no, created_at)
        VALUES (?, 'redeemed', ?, ?, ?, ?)
      `).run(
        id,
        points,
        description || `兑换${item_name || type}，抵扣${amount.toFixed(2)}元`,
        orderNo,
        now()
      );
    });

    tx();

    const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(id);

    res.json(success({
      member: updated,
      exchange: {
        points,
        amount,
        exchangeRate,
        orderNo,
        type,
        item_name: item_name || type
      }
    }, '积分兑换成功'));
  } catch (err) {
    res.json(error('积分兑换失败: ' + err.message));
  }
}

function getMemberLevels(req, res) {
  try {
    const levels = db.prepare('SELECT * FROM member_levels WHERE is_active = 1 ORDER BY min_spent ASC').all();
    res.json(success({ list: levels }, '获取会员等级配置成功'));
  } catch (err) {
    res.json(error('获取会员等级配置失败: ' + err.message));
  }
}

function updateMemberLevel(req, res) {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM member_levels WHERE id = ?').get(id);

    if (!existing) {
      return res.json(error('等级配置不存在', 404));
    }

    const { name, discount, min_spent, points_rate, exchange_rate, is_active } = req.body;

    db.prepare(`
      UPDATE member_levels SET name=?, discount=?, min_spent=?, points_rate=?, exchange_rate=?, is_active=?
      WHERE id=?
    `).run(
      name !== undefined ? name : existing.name,
      discount !== undefined ? discount : existing.discount,
      min_spent !== undefined ? min_spent : existing.min_spent,
      points_rate !== undefined ? points_rate : existing.points_rate,
      exchange_rate !== undefined ? exchange_rate : existing.exchange_rate,
      is_active !== undefined ? is_active : existing.is_active,
      id
    );

    const level = db.prepare('SELECT * FROM member_levels WHERE id = ?').get(id);
    res.json(success({ level }, '更新等级配置成功'));
  } catch (err) {
    res.json(error('更新等级配置失败: ' + err.message));
  }
}

module.exports = {
  getMembers,
  getMemberDetail,
  createMember,
  updateMember,
  getPointsRecords,
  exchangePoints,
  getMemberLevels,
  updateMemberLevel,
  autoUpgradeMember
};
