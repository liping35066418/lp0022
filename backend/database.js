const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'hotel.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'reception',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  const createRoomTypesTable = `
    CREATE TABLE IF NOT EXISTS room_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      base_price REAL NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 2,
      bed_count INTEGER NOT NULL DEFAULT 1,
      max_guests INTEGER NOT NULL DEFAULT 2,
      area REAL NOT NULL DEFAULT 0,
      facilities TEXT DEFAULT '[]',
      images TEXT DEFAULT '[]',
      image TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      total_rooms INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  const createRoomsTable = `
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_no TEXT NOT NULL UNIQUE,
      room_number TEXT NOT NULL UNIQUE,
      room_type_id INTEGER NOT NULL,
      floor INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      last_cleaned DATETIME,
      last_cleaned_at DATETIME,
      last_maintenance_at DATETIME,
      notes TEXT,
      remark TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE CASCADE
    )
  `;

  const createPriceStrategiesTable = `
    CREATE TABLE IF NOT EXISTS price_strategies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT '',
      room_type_id INTEGER NOT NULL,
      date DATE,
      price REAL NOT NULL,
      price_type TEXT NOT NULL DEFAULT 'base',
      start_date DATE,
      end_date DATE,
      weekdays TEXT DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      is_holiday INTEGER NOT NULL DEFAULT 0,
      weekend_rate REAL,
      description TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE CASCADE
    )
  `;

  const createMemberLevelsTable = `
    CREATE TABLE IF NOT EXISTS member_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      discount REAL NOT NULL DEFAULT 1.0,
      min_spent REAL NOT NULL DEFAULT 0,
      points_rate REAL NOT NULL DEFAULT 1.0,
      exchange_rate REAL NOT NULL DEFAULT 100,
      is_active INTEGER NOT NULL DEFAULT 1
    )
  `;

  const createMembersTable = `
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      level TEXT NOT NULL DEFAULT 'bronze',
      points INTEGER NOT NULL DEFAULT 0,
      total_spent REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (level) REFERENCES member_levels(level)
    )
  `;

  const createBookingsTable = `
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL UNIQUE,
      member_id INTEGER,
      room_type_id INTEGER NOT NULL,
      checkin_date DATE NOT NULL,
      checkout_date DATE NOT NULL,
      guest_count INTEGER NOT NULL DEFAULT 1,
      total_price REAL NOT NULL,
      deposit REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL,
      FOREIGN KEY (room_type_id) REFERENCES room_types(id)
    )
  `;

  const createBookingsRoomsTable = `
    CREATE TABLE IF NOT EXISTS bookings_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      room_id INTEGER NOT NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      UNIQUE(booking_id, room_id)
    )
  `;

  const createCheckinsTable = `
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER,
      room_id INTEGER NOT NULL,
      member_id INTEGER,
      guest_name TEXT NOT NULL,
      guest_idcard TEXT,
      guest_phone TEXT,
      actual_checkin DATETIME NOT NULL,
      actual_checkout DATETIME,
      deposit_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'checked_in',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
    )
  `;

  const createBillsTable = `
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checkin_id INTEGER,
      booking_id INTEGER,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (checkin_id) REFERENCES checkins(id) ON DELETE SET NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
    )
  `;

  const createPointsRecordsTable = `
    CREATE TABLE IF NOT EXISTS points_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      points INTEGER NOT NULL,
      description TEXT,
      order_no TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    )
  `;

  const createHolidaysTable = `
    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE,
      name TEXT NOT NULL,
      rate_multiplier REAL NOT NULL DEFAULT 1.0,
      price_multiplier REAL NOT NULL DEFAULT 1.0,
      room_type_id INTEGER,
      start_date DATE,
      end_date DATE,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  const createInventoryLogsTable = `
    CREATE TABLE IF NOT EXISTS inventory_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_type_id INTEGER NOT NULL,
      date DATE NOT NULL,
      available_count INTEGER NOT NULL,
      forecast_count INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE CASCADE,
      UNIQUE(room_type_id, date)
    )
  `;

  const tables = [
    ['users', createUsersTable],
    ['room_types', createRoomTypesTable],
    ['rooms', createRoomsTable],
    ['member_levels', createMemberLevelsTable],
    ['members', createMembersTable],
    ['price_strategies', createPriceStrategiesTable],
    ['bookings', createBookingsTable],
    ['bookings_rooms', createBookingsRoomsTable],
    ['checkins', createCheckinsTable],
    ['bills', createBillsTable],
    ['points_records', createPointsRecordsTable],
    ['holidays', createHolidaysTable],
    ['inventory_logs', createInventoryLogsTable]
  ];

  const transaction = db.transaction(() => {
    for (const [name, sql] of tables) {
      db.prepare(sql).run();
      console.log(`表 ${name} 初始化完成`);
    }
  });

  transaction();
  console.log('数据库表初始化完成');
}

function seedData() {
  const transaction = db.transaction(() => {
    const adminUser = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
    const hashedPassword = bcrypt.hashSync('123456', 10);
    
    if (!adminUser) {
      db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hashedPassword, 'admin');
      console.log('种子数据: 管理员 admin/123456 创建完成');
    } else {
      const isValidPassword = bcrypt.compareSync('123456', adminUser.password);
      if (!isValidPassword) {
        db.prepare('UPDATE users SET password = ? WHERE username = ?').run(hashedPassword, 'admin');
        console.log('种子数据: 管理员 admin 密码已重置为 123456');
      }
    }

    const roomTypeCount = db.prepare('SELECT COUNT(*) as count FROM room_types').get().count;
    if (roomTypeCount === 0) {
      const roomTypes = [
        { name: '标准单人间', description: '舒适单床房，适合商务出行', base_price: 198, capacity: 1, bed_count: 1, max_guests: 1, area: 25, image: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800' },
        { name: '标准双人间', description: '双床标准间，适合朋友同行', base_price: 258, capacity: 2, bed_count: 2, max_guests: 2, area: 30, image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800' },
        { name: '豪华大床房', description: '宽敞大床，配备高端设施', base_price: 388, capacity: 2, bed_count: 1, max_guests: 2, area: 40, image: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800' },
        { name: '商务套房', description: '独立客厅，尊享商务体验', base_price: 588, capacity: 3, bed_count: 1, max_guests: 3, area: 60, image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800' }
      ];

      const insertRoomType = db.prepare('INSERT INTO room_types (name, description, base_price, capacity, bed_count, max_guests, area, image, facilities, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const rt of roomTypes) {
        insertRoomType.run(rt.name, rt.description, rt.base_price, rt.capacity, rt.bed_count, rt.max_guests, rt.area, rt.image, '[]', '[]');
      }
      console.log('种子数据: 4种房型创建完成');
    }

    const roomCount = db.prepare('SELECT COUNT(*) as count FROM rooms').get().count;
    if (roomCount === 0) {
      const roomTypes = db.prepare('SELECT id FROM room_types ORDER BY id').all();
      const insertRoom = db.prepare('INSERT INTO rooms (room_no, room_number, room_type_id, floor, status, notes, remark) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const statuses = ['available', 'available', 'available', 'available', 'cleaning'];
      let roomIndex = 1;

      for (let floor = 1; floor <= 5; floor++) {
        for (let i = 0; i < 4; i++) {
          const roomNo = `${floor}${String(i + 1).padStart(2, '0')}`;
          const typeIndex = (roomIndex - 1) % roomTypes.length;
          const status = statuses[(roomIndex - 1) % statuses.length];
          insertRoom.run(roomNo, roomNo, roomTypes[typeIndex].id, floor, status, null, '');
          roomIndex++;
        }
      }

      db.prepare('UPDATE room_types SET total_rooms = (SELECT COUNT(*) FROM rooms WHERE rooms.room_type_id = room_types.id)').run();
      console.log('种子数据: 20间客房创建完成');
    }

    const memberLevelCount = db.prepare('SELECT COUNT(*) as count FROM member_levels').get().count;
    if (memberLevelCount === 0) {
      const levels = [
        { level: 'bronze', name: '普通会员', discount: 0.95, min_spent: 0, points_rate: 1.0, exchange_rate: 100 },
        { level: 'silver', name: '银卡会员', discount: 0.90, min_spent: 5000, points_rate: 1.5, exchange_rate: 100 },
        { level: 'gold', name: '金卡会员', discount: 0.85, min_spent: 20000, points_rate: 2.0, exchange_rate: 100 },
        { level: 'platinum', name: '铂金会员', discount: 0.80, min_spent: 50000, points_rate: 3.0, exchange_rate: 100 }
      ];

      const insertLevel = db.prepare('INSERT INTO member_levels (level, name, discount, min_spent, points_rate, exchange_rate) VALUES (?, ?, ?, ?, ?, ?)');
      for (const l of levels) {
        insertLevel.run(l.level, l.name, l.discount, l.min_spent, l.points_rate, l.exchange_rate);
      }
      console.log('种子数据: 4个会员等级创建完成');
    }

    const holidayCount = db.prepare('SELECT COUNT(*) as count FROM holidays').get().count;
    if (holidayCount === 0) {
      const year = new Date().getFullYear();
      const holidays = [
        { date: `${year}-01-01`, name: '元旦', rate_multiplier: 1.5, price_multiplier: 1.5, start_date: `${year}-01-01`, end_date: `${year}-01-01` },
        { date: `${year}-02-10`, name: '春节', rate_multiplier: 2.0, price_multiplier: 2.0, start_date: `${year}-02-10`, end_date: `${year}-02-16` },
        { date: `${year}-04-04`, name: '清明节', rate_multiplier: 1.3, price_multiplier: 1.3, start_date: `${year}-04-04`, end_date: `${year}-04-06` },
        { date: `${year}-05-01`, name: '劳动节', rate_multiplier: 1.5, price_multiplier: 1.5, start_date: `${year}-05-01`, end_date: `${year}-05-05` },
        { date: `${year}-06-10`, name: '端午节', rate_multiplier: 1.3, price_multiplier: 1.3, start_date: `${year}-06-10`, end_date: `${year}-06-10` },
        { date: `${year}-09-17`, name: '中秋节', rate_multiplier: 1.3, price_multiplier: 1.3, start_date: `${year}-09-17`, end_date: `${year}-09-17` },
        { date: `${year}-10-01`, name: '国庆节', rate_multiplier: 2.0, price_multiplier: 2.0, start_date: `${year}-10-01`, end_date: `${year}-10-07` }
      ];

      const insertHoliday = db.prepare('INSERT INTO holidays (date, name, rate_multiplier, price_multiplier, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)');
      for (const h of holidays) {
        insertHoliday.run(h.date, h.name, h.rate_multiplier, h.price_multiplier, h.start_date, h.end_date);
      }
      console.log('种子数据: 节假日配置创建完成');
    }
  });

  transaction();
  console.log('种子数据初始化完成');
}

module.exports = db;
module.exports.db = db;
module.exports.initDatabase = initDatabase;
module.exports.seedData = seedData;
module.exports.default = db;
