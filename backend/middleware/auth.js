const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'consignment-packing-secret-key-2024-change-in-production';

// Hardcoded admin user — always available, stored in Firestore will be checked for other users
const DEFAULT_USER = {
  id: 'default-admin',
  email: 'returnorders@vbexports.co.in',
  password: 'XchangeC$',
  name: 'Pawan Shukla',
  role: 'admin',
  createdAt: new Date().toISOString()
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.user.role === 'admin') {
      return next();
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    next();
  };
};

module.exports = { authenticateToken, requireRole, DEFAULT_USER, JWT_SECRET };
