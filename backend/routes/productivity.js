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

// ─────────────────────────────────────────────────────────────────────────────
// Production Planning Report
// Aggregates all open consignments + their SKUs so the production team can plan.
// Returns: summary, per-consignment pending/packed, and per-internal-SKU pending
//          (with the list of consignments each SKU is pending in).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/planning', authenticateToken, async (req, res) => {
  try {
    const [consignments, allSkus] = await Promise.all([
      firestoreHelpers.getCollection('consignments'),
      firestoreHelpers.getCollection('skus')
    ]);

    // Group SKUs by their consignment
    const skusByConsignment = {};
    for (const s of allSkus) {
      if (!skusByConsignment[s.consignmentId]) skusByConsignment[s.consignmentId] = [];
      skusByConsignment[s.consignmentId].push(s);
    }

    const byConsignment = [];
    const bySkuMap = {};   // keyed by internalSku (fallback marketplaceSku)
    let totalRequired = 0, totalPacked = 0, totalPending = 0, pendingConsignments = 0;

    for (const c of consignments) {
      // Only count open consignments for planning (skip completed/dispatched)
      const isOpen = c.status === 'pending' || c.status === 'in_progress';
      const skus = skusByConsignment[c.id] || [];

      let cRequired = 0, cPacked = 0;
      for (const s of skus) {
        const req = s.requiredQty || 0;
        const pkd = s.packedQty || 0;
        const pend = Math.max(0, req - pkd);
        cRequired += req;
        cPacked += pkd;

        if (isOpen && pend > 0) {
          const key = s.internalSku || s.marketplaceSku || s.barcode || s.id;
          if (!bySkuMap[key]) {
            bySkuMap[key] = {
              internalSku:   s.internalSku || '',
              marketplaceSku: s.marketplaceSku || '',
              barcode:       s.barcode || '',
              totalRequired: 0, totalPacked: 0, totalPending: 0,
              consignments: []
            };
          }
          const entry = bySkuMap[key];
          entry.totalRequired += req;
          entry.totalPacked   += pkd;
          entry.totalPending  += pend;
          entry.consignments.push({
            id: c.id,
            internalShipmentNo: c.internalShipmentNo || c.id,
            required: req, packed: pkd, pending: pend,
            status: c.status
          });
        }
      }

      const cPending = Math.max(0, cRequired - cPacked);
      if (isOpen) {
        pendingConsignments++;
        totalRequired += cRequired;
        totalPacked   += cPacked;
        totalPending  += cPending;
        byConsignment.push({
          id: c.id,
          internalShipmentNo: c.internalShipmentNo || c.id,
          marketplaceId: c.marketplaceId || '',
          warehouse: c.warehouse || '',
          status: c.status,
          shipmentStatus: c.shipmentStatus || 'Planned',
          required: cRequired,
          packed: cPacked,
          pending: cPending,
          skuCount: skus.length,
          pendingSkuCount: skus.filter(s => (s.requiredQty || 0) - (s.packedQty || 0) > 0).length,
          expectedDate: c.expectedDate || '',
          createdAt: c.createdAt
        });
      }
    }

    // Sort: most pending first
    byConsignment.sort((a, b) => b.pending - a.pending);
    const bySku = Object.values(bySkuMap).sort((a, b) => b.totalPending - a.totalPending);
    bySku.forEach(s => s.consignments.sort((a, b) => b.pending - a.pending));

    res.json({
      summary: {
        totalConsignments: consignments.length,
        openConsignments: pendingConsignments,
        completedConsignments: consignments.filter(c => c.status === 'completed').length,
        totalRequiredQty: totalRequired,
        totalPackedQty: totalPacked,
        totalPendingQty: totalPending,
        uniquePendingSkus: bySku.length
      },
      byConsignment,
      bySku
    });
  } catch (error) {
    console.error('Error building planning report:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
