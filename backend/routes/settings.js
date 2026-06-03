const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { now, firestoreHelpers, addAuditLog } = require('../utils/helpers');

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

module.exports = router;
