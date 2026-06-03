const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { firestoreHelpers } = require('../utils/helpers');

// Get all audit logs (admin only)
router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { userId, action, entityType, startDate, endDate, limit = 100 } = req.query;
    let logs = await firestoreHelpers.getCollection('auditLogs');

    if (userId) logs = logs.filter(l => l.userId === userId);
    if (action) logs = logs.filter(l => l.action === action);
    if (entityType) logs = logs.filter(l => l.entityType === entityType);
    if (startDate) {
      const sd = new Date(startDate).getTime();
      logs = logs.filter(l => new Date(l.timestamp).getTime() >= sd);
    }
    if (endDate) {
      const ed = new Date(endDate).getTime();
      logs = logs.filter(l => new Date(l.timestamp).getTime() <= ed);
    }

    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    logs = logs.slice(0, parseInt(limit));
    res.json({ logs, count: logs.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user's own activity
router.get('/my-activity', authenticateToken, async (req, res) => {
  try {
    let logs = await firestoreHelpers.getCollection('auditLogs');
    logs = logs.filter(l => l.userId === req.user.id);
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    logs = logs.slice(0, 50);
    res.json({ logs, count: logs.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
