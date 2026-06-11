const { db } = require('../database');
const { success, error } = require('../utils/response');

const now = () => new Date().toISOString();

function parseJSON(val) {
  if (!val) return [];
  try { return JSON.parse(val); } catch (e) { return []; }
}

function getRoomTypes(req, res) {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM room_types WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY id ASC';
    const rows = db.prepare(sql).all(...params);

    rows.forEach(row => {
      row.facilities = parseJSON(row.facilities);
      row.images = parseJSON(row.images);
    });

    res.json(success({ list: rows }));
  } catch (err) {
    res.json(error('获取房型列表失败: ' + err.message));
  }
}

function createRoomType(req, res) {
  try {
    const { name, description, base_price, bed_count, max_guests, area, facilities, images, status } = req.body;

    if (!name || base_price === undefined || base_price === null) {
      return res.json(error('房型名称和基础价不能为空', 400));
    }

    const sql = `INSERT INTO room_types (name, description, base_price, bed_count, max_guests, area, facilities, images, status, total_rooms, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`;
    const result = db.prepare(sql).run(
      name,
      description || '',
      base_price,
      bed_count || 1,
      max_guests || 2,
      area || 0,
      facilities ? JSON.stringify(facilities) : '[]',
      images ? JSON.stringify(images) : '[]',
      status || 'active',
      now(),
      now()
    );

    const roomType = db.prepare('SELECT * FROM room_types WHERE id = ?').get(result.lastInsertRowid);
    roomType.facilities = parseJSON(roomType.facilities);
    roomType.images = parseJSON(roomType.images);

    res.json(success({ roomType }, '创建房型成功'));
  } catch (err) {
    res.json(error('创建房型失败: ' + err.message));
  }
}

function updateRoomType(req, res) {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM room_types WHERE id = ?').get(id);

    if (!existing) {
      return res.json(error('房型不存在', 404));
    }

    const { name, description, base_price, bed_count, max_guests, area, facilities, images, status } = req.body;

    const sql = `UPDATE room_types SET name=?, description=?, base_price=?, bed_count=?, max_guests=?, area=?, facilities=?, images=?, status=?, updated_at=? WHERE id=?`;
    db.prepare(sql).run(
      name !== undefined ? name : existing.name,
      description !== undefined ? description : existing.description,
      base_price !== undefined ? base_price : existing.base_price,
      bed_count !== undefined ? bed_count : existing.bed_count,
      max_guests !== undefined ? max_guests : existing.max_guests,
      area !== undefined ? area : existing.area,
      facilities !== undefined ? JSON.stringify(facilities) : existing.facilities,
      images !== undefined ? JSON.stringify(images) : existing.images,
      status !== undefined ? status : existing.status,
      now(),
      id
    );

    const roomType = db.prepare('SELECT * FROM room_types WHERE id = ?').get(id);
    roomType.facilities = parseJSON(roomType.facilities);
    roomType.images = parseJSON(roomType.images);

    res.json(success({ roomType }, '更新房型成功'));
  } catch (err) {
    res.json(error('更新房型失败: ' + err.message));
  }
}

function deleteRoomType(req, res) {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM room_types WHERE id = ?').get(id);

    if (!existing) {
      return res.json(error('房型不存在', 404));
    }

    const roomCount = db.prepare('SELECT COUNT(*) as count FROM rooms WHERE room_type_id = ?').get(id).count;
    if (roomCount > 0) {
      return res.json(error('该房型下还有客房，无法删除', 400));
    }

    db.prepare('DELETE FROM room_types WHERE id = ?').run(id);
    res.json(success(null, '删除房型成功'));
  } catch (err) {
    res.json(error('删除房型失败: ' + err.message));
  }
}

function getRooms(req, res) {
  try {
    const { room_type_id, status, floor } = req.query;
    let sql = `SELECT r.*, rt.name as room_type_name, rt.base_price, rt.bed_count, rt.max_guests, rt.area, rt.facilities
               FROM rooms r LEFT JOIN room_types rt ON r.room_type_id = rt.id WHERE 1=1`;
    const params = [];

    if (room_type_id) {
      sql += ' AND r.room_type_id = ?';
      params.push(room_type_id);
    }
    if (status) {
      sql += ' AND r.status = ?';
      params.push(status);
    }
    if (floor) {
      sql += ' AND r.floor = ?';
      params.push(floor);
    }

    sql += ' ORDER BY r.floor ASC, r.room_number ASC';
    const rows = db.prepare(sql).all(...params);

    rows.forEach(row => {
      row.facilities = parseJSON(row.facilities);
    });

    res.json(success({ list: rows }));
  } catch (err) {
    res.json(error('获取客房列表失败: ' + err.message));
  }
}

function getRoomDetail(req, res) {
  try {
    const { id } = req.params;
    const sql = `SELECT r.*, rt.name as room_type_name, rt.base_price, rt.bed_count, rt.max_guests, rt.area, rt.facilities, rt.description as room_type_description
                 FROM rooms r LEFT JOIN room_types rt ON r.room_type_id = rt.id WHERE r.id = ?`;
    const room = db.prepare(sql).get(id);

    if (!room) {
      return res.json(error('客房不存在', 404));
    }

    room.facilities = parseJSON(room.facilities);

    res.json(success({ room }));
  } catch (err) {
    res.json(error('获取客房详情失败: ' + err.message));
  }
}

function createRoom(req, res) {
  try {
    const { room_number, room_type_id, floor, status, remark } = req.body;

    if (!room_number || !room_type_id) {
      return res.json(error('房间号和房型不能为空', 400));
    }

    const roomType = db.prepare('SELECT * FROM room_types WHERE id = ?').get(room_type_id);
    if (!roomType) {
      return res.json(error('房型不存在', 404));
    }

    const existingRoom = db.prepare('SELECT * FROM rooms WHERE room_number = ?').get(room_number);
    if (existingRoom) {
      return res.json(error('房间号已存在', 400));
    }

    const sql = `INSERT INTO rooms (room_number, room_type_id, floor, status, remark, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const result = db.prepare(sql).run(
      room_number,
      room_type_id,
      floor || 1,
      status || 'available',
      remark || '',
      now(),
      now()
    );

    db.prepare('UPDATE room_types SET total_rooms = (SELECT COUNT(*) FROM rooms WHERE room_type_id = ?), updated_at = ? WHERE id = ?')
      .run(room_type_id, now(), room_type_id);

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(result.lastInsertRowid);
    res.json(success({ room }, '创建客房成功'));
  } catch (err) {
    res.json(error('创建客房失败: ' + err.message));
  }
}

function updateRoom(req, res) {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);

    if (!existing) {
      return res.json(error('客房不存在', 404));
    }

    const { room_number, room_type_id, floor, status, remark } = req.body;

    if (room_number && room_number !== existing.room_number) {
      const dup = db.prepare('SELECT * FROM rooms WHERE room_number = ? AND id != ?').get(room_number, id);
      if (dup) {
        return res.json(error('房间号已存在', 400));
      }
    }

    if (room_type_id) {
      const rt = db.prepare('SELECT * FROM room_types WHERE id = ?').get(room_type_id);
      if (!rt) {
        return res.json(error('房型不存在', 404));
      }
    }

    const newRoomTypeId = room_type_id !== undefined ? room_type_id : existing.room_type_id;

    const sql = `UPDATE rooms SET room_number=?, room_type_id=?, floor=?, status=?, remark=?, updated_at=? WHERE id=?`;
    db.prepare(sql).run(
      room_number !== undefined ? room_number : existing.room_number,
      newRoomTypeId,
      floor !== undefined ? floor : existing.floor,
      status !== undefined ? status : existing.status,
      remark !== undefined ? remark : existing.remark,
      now(),
      id
    );

    if (newRoomTypeId !== existing.room_type_id) {
      db.prepare('UPDATE room_types SET total_rooms = (SELECT COUNT(*) FROM rooms WHERE room_type_id = ?), updated_at = ? WHERE id = ?')
        .run(existing.room_type_id, now(), existing.room_type_id);
      db.prepare('UPDATE room_types SET total_rooms = (SELECT COUNT(*) FROM rooms WHERE room_type_id = ?), updated_at = ? WHERE id = ?')
        .run(newRoomTypeId, now(), newRoomTypeId);
    }

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    res.json(success({ room }, '更新客房成功'));
  } catch (err) {
    res.json(error('更新客房失败: ' + err.message));
  }
}

const VALID_ROOM_STATUSES = ['available', 'occupied', 'cleaning', 'maintenance', 'vacant'];

function updateRoomStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!VALID_ROOM_STATUSES.includes(status)) {
      return res.json(error('无效的客房状态，允许值: ' + VALID_ROOM_STATUSES.join('/'), 400));
    }

    const existing = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    if (!existing) {
      return res.json(error('客房不存在', 404));
    }

    let sql = 'UPDATE rooms SET status=?, updated_at=?';
    const params = [status, now()];

    if (status === 'cleaning') {
      sql += ', last_cleaned_at=?';
      params.push(now());
    }
    if (status === 'maintenance') {
      sql += ', last_maintenance_at=?';
      params.push(now());
    }

    sql += ' WHERE id=?';
    params.push(id);

    db.prepare(sql).run(...params);

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    res.json(success({ room }, '状态更新成功'));
  } catch (err) {
    res.json(error('状态更新失败: ' + err.message));
  }
}

function getRoomStatusOverview(req, res) {
  try {
    const stats = db.prepare(`SELECT status, COUNT(*) as count FROM rooms GROUP BY status`).all();

    const statusMap = {
      available: 0,
      occupied: 0,
      cleaning: 0,
      maintenance: 0,
      vacant: 0
    };

    stats.forEach(s => {
      if (statusMap.hasOwnProperty(s.status)) {
        statusMap[s.status] = s.count;
      } else {
        statusMap[s.status] = s.count;
      }
    });

    const total = Object.values(statusMap).reduce((a, b) => a + b, 0);

    const floors = db.prepare('SELECT DISTINCT floor FROM rooms ORDER BY floor ASC').all();
    const matrix = [];

    floors.forEach(f => {
      const floorRooms = db.prepare(`
        SELECT r.*, rt.name as room_type_name, rt.base_price
        FROM rooms r LEFT JOIN room_types rt ON r.room_type_id = rt.id
        WHERE r.floor = ? ORDER BY r.room_number ASC
      `).all(f.floor);

      matrix.push({
        floor: f.floor,
        rooms: floorRooms
      });
    });

    const roomTypes = db.prepare('SELECT id, name, total_rooms FROM room_types WHERE status = ?').all('active');
    const roomTypeStats = roomTypes.map(rt => {
      const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM rooms WHERE room_type_id = ? GROUP BY status').all(rt.id);
      const statusCount = { available: 0, occupied: 0, cleaning: 0, maintenance: 0, vacant: 0 };
      byStatus.forEach(s => {
        if (statusCount.hasOwnProperty(s.status)) {
          statusCount[s.status] = s.count;
        }
      });
      return {
        ...rt,
        status: statusCount
      };
    });

    res.json(success({
      stats: statusMap,
      total,
      matrix,
      roomTypes: roomTypeStats
    }));
  } catch (err) {
    res.json(error('获取房态概览失败: ' + err.message));
  }
}

module.exports = {
  getRoomTypes,
  createRoomType,
  updateRoomType,
  deleteRoomType,
  getRooms,
  getRoomDetail,
  createRoom,
  updateRoom,
  updateRoomStatus,
  getRoomStatusOverview
};
