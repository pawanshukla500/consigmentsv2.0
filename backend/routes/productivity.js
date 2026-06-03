const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { generateId, now, firestoreHelpers } = require('../utils/helpers');

// Log productivity event
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { consignmentId, boxNo, eventType, itemsCount, duration } = req.body;

    const record = {
      id: generateId(),
      consignmentId: consignmentId || '',
      boxNo: boxNo || '',
      eventType: eventType || 'box_saved', // box_saved, consignment_finished, scan
      itemsCount: parseInt(itemsCount) || 0,
      duration: parseInt(duration) || 0,
      timestamp: now(),
      userId: req.user.id,
      userName: req.user.name || req.user.email
    };

    await firestoreHelpers.setDocument('productivity', record.id, record);

    res.status(201).json({ record });
  } catch (error) {
    console.error('Error logging productivity:', error);
    res.status(500).json({ error: 'Failed to log productivity.' });
  }
});

// Get productivity stats
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    
    let records = await firestoreHelpers.getCollection('productivity');
    
    // Filter by date range
    if (date) {
      const targetDate = new Date(date).toDateString();
      records = records.filter(r => new Date(r.timestamp).toDateString() === targetDate);
    } else if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      records = records.filter(r => {
        const d = new Date(r.timestamp);
        return d >= start && d <= end;
      });
    }

    // Today's stats
    const today = new Date().toDateString();
    const todayRecords = records.filter(r => new Date(r.timestamp).toDateString() === today);
    
    const todayBoxes = todayRecords.filter(r => r.eventType === 'box_saved').length;
    const todayItems = todayRecords.filter(r => r.eventType === 'box_saved').reduce((sum, r) => sum + (r.itemsCount || 0), 0);
    
    // Calculate averages
    const allBoxRecords = records.filter(r => r.eventType === 'box_saved');
    const avgItemsPerBox = allBoxRecords.length > 0 
      ? allBoxRecords.reduce((sum, r) => sum + (r.itemsCount || 0), 0) / allBoxRecords.length 
      : 0;
    const avgTimePerBox = allBoxRecords.length > 0
      ? allBoxRecords.reduce((sum, r) => sum + (r.duration || 0), 0) / allBoxRecords.length
      : 0;

    // Recent activity
    records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const recentActivity = records.slice(0, 50);

    res.json({
      today: {
        boxes: todayBoxes,
        items: todayItems,
        avgItemsPerBox: Math.round(avgItemsPerBox * 100) / 100,
        avgTimePerBox: Math.round(avgTimePerBox * 100) / 100
      },
      summary: {
        totalBoxes: allBoxRecords.length,
        totalItems: allBoxRecords.reduce((sum, r) => sum + (r.itemsCount || 0), 0),
        avgItemsPerBox: Math.round(avgItemsPerBox * 100) / 100,
        avgTimePerBoxSeconds: Math.round(avgTimePerBox * 100) / 100
      },
      recentActivity
    });
  } catch (error) {
    console.error('Error fetching productivity:', error);
    res.status(500).json({ error: 'Failed to fetch productivity data.' });
  }
});

// Get audit logs
router.get('/audit', authenticateToken, async (req, res) => {
  try {
    const { entityType, limit = 100 } = req.query;
    
    let logs = await firestoreHelpers.getCollection('auditLogs');
    
    if (entityType) {
      logs = logs.filter(l => l.entityType === entityType);
    }

    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    logs = logs.slice(0, parseInt(limit));

    res.json({ logs });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs.' });
  }
});

module.exports = router;
