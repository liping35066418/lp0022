const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const db = require('./database');
const { initDatabase, seedData } = require('./database');
const { authMiddleware, adminMiddleware, generateToken } = require('./middleware/auth');
const { success, error } = require('./utils/response');

const roomsRoutes = require('./routes/rooms');
const pricingRoutes = require('./routes/pricing');
const membersRoutes = require('./routes/members');
const advancedRoutes = require('./routes/advanced');
const bookingsRoutes = require('./routes/bookings');
const checkinsRoutes = require('./routes/checkins');

const { autoUpgradeMember } = require('./controllers/membersController');

const app = express();
const PORT = 8642;

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: error('请求过于频繁，请稍后再试', 429),
  standardHeaders: true,
  legacyHeaders: false
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(limiter);

app.get('/', (req, res) => {
  res.json(success({ timestamp: new Date().toISOString() }, '酒店预订管理平台 API 服务运行正常'));
});

app.get('/api/health', (req, res) => {
  res.json(success({
    status: 'ok',
    timestamp: new Date().toISOString()
  }));
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.json(error('用户名和密码不能为空', 400));
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      return res.json(error('用户名或密码错误', 401));
    }

    const isValidPassword = bcrypt.compareSync(password, user.password);

    if (!isValidPassword) {
      return res.json(error('用户名或密码错误', 401));
    }

    const token = generateToken(user.id, user.username, user.role);

    res.json(success({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        created_at: user.created_at
      }
    }, '登录成功'));
  } catch (err) {
    res.json(error('登录失败: ' + err.message));
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json(success(req.user, '获取当前用户信息成功'));
});


app.get('/api/dashboard/stats', authMiddleware, (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const totalRooms = db.prepare('SELECT COUNT(*) as count FROM rooms').get().count;
    const occupiedRooms = db.prepare("SELECT COUNT(*) as count FROM rooms WHERE status = 'occupied'").get().count;
    const availableRooms = db.prepare("SELECT COUNT(*) as count FROM rooms WHERE status = 'available'").get().count;
    const cleaningRooms = db.prepare("SELECT COUNT(*) as count FROM rooms WHERE status = 'cleaning'").get().count;
    const maintenanceRooms = db.prepare("SELECT COUNT(*) as count FROM rooms WHERE status = 'maintenance'").get().count;

    const todayCheckins = db.prepare('SELECT COUNT(*) as count FROM checkins WHERE DATE(created_at) = ?').get(today).count;
    const todayCheckouts = db.prepare('SELECT COUNT(*) as count FROM checkins WHERE DATE(actual_checkout) = ?').get(today).count;

    const todayRevenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE DATE(created_at) = ? AND type != 'refund'").get(today).total;

    const totalMembers = db.prepare('SELECT COUNT(*) as count FROM members').get().count;

    const pendingBookings = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'pending'").get().count;

    res.json(success({
      rooms: {
        total: totalRooms,
        occupied: occupiedRooms,
        available: availableRooms,
        cleaning: cleaningRooms,
        maintenance: maintenanceRooms
      },
      checkins: todayCheckins,
      checkouts: todayCheckouts,
      revenue: todayRevenue,
      members: totalMembers,
      pendingBookings
    }, '获取统计数据成功'));
  } catch (err) {
    res.json(error('获取统计数据失败: ' + err.message));
  }
});

app.use('/api', roomsRoutes);
app.use('/api', pricingRoutes);
app.use('/api', membersRoutes);
app.use('/api', advancedRoutes);
app.use('/api', bookingsRoutes);
app.use('/api', checkinsRoutes);

app.use((req, res) => {
  res.status(404).json(error('接口不存在', 404));
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json(error('服务器内部错误: ' + err.message, 500));
});

function startServer() {
  try {
    console.log('正在初始化数据库...');
    initDatabase();
    console.log('正在初始化种子数据...');
    seedData();

    if (require.main === module) {
      app.listen(PORT, () => {
        console.log(`酒店预订管理平台 API 服务已启动`);
        console.log(`服务地址: http://localhost:${PORT}`);
        console.log(`默认管理员: admin / admin`);
      });
    }
  } catch (error) {
    console.error('启动服务失败:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
