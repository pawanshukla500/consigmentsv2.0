const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { generateId, now, addAuditLog, firestoreHelpers } = require('../utils/helpers');

// Get all docket companies
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companies = await firestoreHelpers.getCollection('docketCompanies');
    companies.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    res.json({ companies, count: companies.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create docket company
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const id = generateId();
    const data = { id, name, createdAt: now(), updatedAt: now() };
    await firestoreHelpers.setDocument('docketCompanies', id, data);
    await addAuditLog('create', 'docket_company', id, req.user.id, { name });
    res.status(201).json({ company: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update docket company
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await firestoreHelpers.getDocument('docketCompanies', id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { name } = req.body;
    const updated = { ...existing, name: name || existing.name, updatedAt: now() };
    await firestoreHelpers.setDocument('docketCompanies', id, updated);
    await addAuditLog('update', 'docket_company', id, req.user.id, { name });
    res.json({ company: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete docket company
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await firestoreHelpers.deleteDocument('docketCompanies', id);
    await addAuditLog('delete', 'docket_company', id, req.user.id, {});
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
