const jwt = require('jsonwebtoken');
const { db } = require('../database');

const JWT_SECRET = 'hotel_secret_key';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未提供认证令牌' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(decoded.userId);

    if (!user) {
      return res.status(401).json({ code: 401, message: '用户不存在或已被删除' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 401, message: '认证令牌已过期' });
    }
    return res.status(401).json({ code: 401, message: '认证令牌无效' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ code: 401, message: '未认证' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ code: 403, message: '权限不足，需要管理员权限' });
  }

  next();
}

function generateToken(userId, username, role) {
  return jwt.sign(
    { userId, username, role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function staffMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ code: 401, message: '未认证' });
  }

  const allowedRoles = ['admin', 'reception', 'staff'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ code: 403, message: '权限不足，需要工作人员权限' });
  }

  next();
}

module.exports = {
  authMiddleware,
  adminMiddleware,
  staffMiddleware,
  generateToken,
  JWT_SECRET,
  authRequired: authMiddleware,
  adminRequired: [authMiddleware, adminMiddleware],
  staffRequired: [authMiddleware, staffMiddleware]
};
