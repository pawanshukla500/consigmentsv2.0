const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { generateId, now, addAuditLog, firestoreHelpers } = require('../utils/helpers');

// Get all marketplaces
router.get('/', authenticateToken, async (req, res) => {
  try {
    const marketplaces = await firestoreHelpers.getCollection('marketplaces');
    marketplaces.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    res.json({ marketplaces, count: marketplaces.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create marketplace
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, warehouses } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const id = generateId();
    const data = {
      id,
      name,
      warehouses: Array.isArray(warehouses) ? warehouses.filter(Boolean) : [],
      createdAt: now(),
      updatedAt: now()
    };
    await firestoreHelpers.setDocument('marketplaces', id, data);
    await addAuditLog('create', 'marketplace', id, req.user.id, { name });
    res.status(201).json({ marketplace: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update marketplace
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await firestoreHelpers.getDocument('marketplaces', id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { name, warehouses } = req.body;
    const updated = {
      ...existing,
      name: name || existing.name,
      warehouses: Array.isArray(warehouses) ? warehouses.filter(Boolean) : existing.warehouses || [],
      updatedAt: now()
    };
    await firestoreHelpers.setDocument('marketplaces', id, updated);
    await addAuditLog('update', 'marketplace', id, req.user.id, { name });
    res.json({ marketplace: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete marketplace
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await firestoreHelpers.deleteDocument('marketplaces', id);
    await addAuditLog('delete', 'marketplace', id, req.user.id, {});
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
