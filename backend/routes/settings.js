const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { now, firestoreHelpers, addAuditLog, generateId } = require('../utils/helpers');
const { firebaseInitialized, db, bucket } = require('../config/firebase');

const DEFAULT_SETTINGS = {
  consignmentRetentionDays: 450,
  videoRetentionDays: 60,
  lastCleanupRun: null,
  cleanupEnabled: true,
};

// Get settings (admin only)
router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const settings = await firestoreHelpers.getDocument('settings', 'retention');
    if (!settings) {
      return res.json({ settings: DEFAULT_SETTINGS });
    }
    const { id, ...data } = settings;
    res.json({ settings: { ...DEFAULT_SETTINGS, ...data } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update settings (admin only)
router.put('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { consignmentRetentionDays, videoRetentionDays, cleanupEnabled } = req.body;
    const update = {
      updatedAt: now(),
      updatedBy: req.user.id
    };
    if (consignmentRetentionDays !== undefined) {
      const days = parseInt(consignmentRetentionDays);
      if (isNaN(days) || days < 1 || days > 3650) {
        return res.status(400).json({ error: 'Consignment retention days must be between 1 and 3650' });
      }
      update.consignmentRetentionDays = days;
    }
    if (videoRetentionDays !== undefined) {
      const days = parseInt(videoRetentionDays);
      if (isNaN(days) || days < 1 || days > 3650) {
        return res.status(400).json({ error: 'Video retention days must be between 1 and 3650' });
      }
      update.videoRetentionDays = days;
    }
    if (cleanupEnabled !== undefined) update.cleanupEnabled = Boolean(cleanupEnabled);

    await firestoreHelpers.setDocument('settings', 'retention', update);
    await addAuditLog('update', 'settings', 'retention', req.user.id, update);
    const saved = await firestoreHelpers.getDocument('settings', 'retention');
    const { id: _id, ...savedData } = saved || {};
    res.json({ settings: { ...DEFAULT_SETTINGS, ...savedData } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Run cleanup manually (admin only)
router.post('/cleanup', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { runRetentionCleanup } = require('../scripts/retentionCleanup');
    const result = await runRetentionCleanup();
    await addAuditLog('cleanup', 'settings', 'retention', req.user.id, result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Database info + health (admin only) — shows the live datastore connection
// ─────────────────────────────────────────────────────────────────────────────
router.get('/db-info', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const info = {
      datastore: firebaseInitialized ? 'Firebase Firestore' : 'In-memory fallback',
      enabled: firebaseInitialized,
      connected: firebaseInitialized && Boolean(db),
      firestore: {
        projectId: process.env.FIREBASE_PROJECT_ID || null,
        connected: firebaseInitialized && Boolean(db)
      },
      storage: {
        bucket: process.env.FIREBASE_STORAGE_BUCKET || null,
        connected: Boolean(bucket)
      },
      counts: {},
      totalDocuments: 0
    };

    for (const col of ['consignments', 'skus', 'boxes', 'videos', 'documents', 'users', 'marketplaces', 'docketCompanies', 'auditLogs', 'productivity']) {
      try { info.counts[col] = (await firestoreHelpers.getCollection(col)).length; } catch { info.counts[col] = 0; }
    }
    info.totalDocuments = Object.values(info.counts).reduce((s, n) => s + n, 0);

    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Reconcile data integrity (admin only)
// Recomputes every consignment's packed totals, SKU packedQty/boxQuantities/status
// and consignment status DIRECTLY from the physical boxes (single source of truth).
// Guarantees packing-station data == SKU data == consignment totals == report.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/reconcile', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const consignments = await firestoreHelpers.getCollection('consignments');
    let fixedConsignments = 0, fixedSkus = 0, scanned = 0;
    const issues = [];

    for (const c of consignments) {
      scanned++;
      const [skus, boxes] = await Promise.all([
        Promise.all((c.skuIds || []).map(id => firestoreHelpers.getDocument('skus', id))),
        Promise.all((c.boxIds || []).map(id => firestoreHelpers.getDocument('boxes', id)))
      ]);
      const validSkus = skus.filter(Boolean);
      const validBoxes = boxes.filter(Boolean);

      // Sum each SKU's qty across all boxes (physical truth), keyed by skuId
      const packedBySku = {};
      for (const box of validBoxes) {
        for (const item of (box.items || [])) {
          if (!item.skuId) continue;
          if (!packedBySku[item.skuId]) packedBySku[item.skuId] = {};
          packedBySku[item.skuId][box.boxNo] = (packedBySku[item.skuId][box.boxNo] || 0) + (item.qty || 0);
        }
      }

      const skuWrites = [];
      for (const s of validSkus) {
        const bq = packedBySku[s.id] || {};
        const packed = Object.values(bq).reduce((a, b) => a + b, 0);
        const status = (s.requiredQty || 0) > 0 && packed >= s.requiredQty ? 'completed' : 'pending';
        const drift = (s.packedQty || 0) !== packed
          || JSON.stringify(s.boxQuantities || {}) !== JSON.stringify(bq)
          || s.status !== status;
        if (drift) {
          if (issues.length < 100) issues.push(`${c.internalShipmentNo || c.id} · ${s.internalSku || s.marketplaceSku}: packed ${s.packedQty || 0} → ${packed}`);
          skuWrites.push(['skus', s.id, { packedQty: packed, boxQuantities: bq, status, updatedAt: now() }]);
          fixedSkus++;
        }
        s.packedQty = packed; s.status = status;
      }
      if (skuWrites.length) await firestoreHelpers.batchSetMulti(skuWrites);

      const totalPacked = validSkus.reduce((sum, s) => sum + (s.packedQty || 0), 0);
      const totalReq = validSkus.reduce((sum, s) => sum + (s.requiredQty || 0), 0);
      const allDone = validSkus.length > 0 && validSkus.every(s => s.status === 'completed');
      const newStatus = totalPacked === 0 ? 'pending' : (allDone ? 'completed' : 'in_progress');

      if ((c.totalPackedQty || 0) !== totalPacked || (c.totalRequiredQty || 0) !== totalReq || c.status !== newStatus) {
        await firestoreHelpers.setDocument('consignments', c.id, {
          totalPackedQty: totalPacked, totalRequiredQty: totalReq, status: newStatus, updatedAt: now()
        });
        fixedConsignments++;
      }
    }

    await addAuditLog('reconcile', 'settings', 'data-integrity', req.user.id, { fixedConsignments, fixedSkus, scanned });
    res.json({ ok: true, scanned, fixedConsignments, fixedSkus, issues });
  } catch (error) {
    console.error('Reconcile error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
