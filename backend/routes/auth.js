const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { DEFAULT_USER, JWT_SECRET } = require('../middleware/auth');
const { firestoreHelpers, addAuditLog } = require('../utils/helpers');

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Check hardcoded admin first (Pawan Shukla)
    if (email === DEFAULT_USER.email && password === DEFAULT_USER.password) {
      const token = jwt.sign(
        { id: DEFAULT_USER.id, email: DEFAULT_USER.email, name: DEFAULT_USER.name, role: DEFAULT_USER.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      await addAuditLog('login', 'user', DEFAULT_USER.id, DEFAULT_USER.id, { email: DEFAULT_USER.email });
      return res.json({
        token,
        user: {
          id: DEFAULT_USER.id,
          email: DEFAULT_USER.email,
          name: DEFAULT_USER.name,
          role: DEFAULT_USER.role,
          permissions: {
            consignments: true, packing: true, productivity: true,
            marketplaces: true, users: true, auditLogs: true
          }
        }
      });
    }

    // Check Firestore users for non-admin users
    const users = await firestoreHelpers.getCollection('users');
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.isActive === false) {
      return res.status(403).json({ error: 'Account is deactivated.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    await addAuditLog('login', 'user', user.id, user.id, { email: user.email });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user from token
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.id === DEFAULT_USER.id) {
      return res.json({
        user: {
          ...decoded,
          permissions: {
            consignments: true, packing: true, productivity: true,
            marketplaces: true, users: true, auditLogs: true
          }
        }
      });
    }
    const users = await firestoreHelpers.getCollection('users');
    const dbUser = users.find(u => u.id === decoded.id);
    if (dbUser) {
      return res.json({ user: { ...decoded, permissions: dbUser.permissions } });
    }
    res.json({ user: decoded });
  } catch (error) {
    res.status(403).json({ error: 'Invalid token.' });
  }
});

module.exports = router;
