const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { generateId, now, firestoreHelpers, addAuditLog } = require('../utils/helpers');

const COLLECTION = 'skuCatalog';

// List / search catalog
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search } = req.query;
    let items = await firestoreHelpers.getCollection(COLLECTION);
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(i =>
        i.barcode?.toLowerCase().includes(s) ||
        i.marketplaceSku?.toLowerCase().includes(s) ||
        i.internalSku?.toLowerCase().includes(s) ||
        i.name?.toLowerCase().includes(s)
      );
    }
    items.sort((a, b) => (a.internalSku || '').localeCompare(b.internalSku || ''));
    res.json({ items, count: items.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create catalog item
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { barcode, marketplaceSku, internalSku, name } = req.body;
    if (!internalSku && !marketplaceSku && !barcode) {
      return res.status(400).json({ error: 'At least one SKU identifier is required.' });
    }
    const existing = await firestoreHelpers.getCollection(COLLECTION);
    const dup = existing.find(i =>
      (internalSku && i.internalSku === internalSku) ||
      (barcode && i.barcode === barcode)
    );
    if (dup) return res.status(409).json({ error: 'SKU already exists in catalog', item: dup });

    const id = generateId();
    const item = {
      id,
      barcode: barcode || marketplaceSku || '',
      marketplaceSku: marketplaceSku || '',
      internalSku: internalSku || '',
      name: name || internalSku || marketplaceSku || '',
      createdAt: now(), updatedAt: now(), createdBy: req.user.id
    };
    await firestoreHelpers.setDocument(COLLECTION, id, item);
    await addAuditLog('create', 'skuCatalog', id, req.user.id, { internalSku, marketplaceSku });
    res.status(201).json({ item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk upsert (used by CSV import + auto-populate from consignments)
router.post('/bulk', authenticateToken, async (req, res) => {
  try {
    const { items = [] } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.json({ added: 0, updated: 0 });

    const existing = await firestoreHelpers.getCollection(COLLECTION);
    const byInternal = new Map(existing.filter(i => i.internalSku).map(i => [i.internalSku, i]));
    const byBarcode = new Map(existing.filter(i => i.barcode).map(i => [i.barcode, i]));

    const writes = [];
    let added = 0, updated = 0;
    for (const raw of items) {
      const internalSku = (raw.internalSku || '').trim();
      const marketplaceSku = (raw.marketplaceSku || '').trim();
      const barcode = (raw.barcode || marketplaceSku || '').trim();
      if (!internalSku && !marketplaceSku && !barcode) continue;

      const match = (internalSku && byInternal.get(internalSku)) || (barcode && byBarcode.get(barcode));
      if (match) {
        writes.push([COLLECTION, match.id, { barcode, marketplaceSku, internalSku, name: raw.name || match.name, updatedAt: now() }]);
        updated++;
      } else {
        const id = generateId();
        const item = { id, barcode, marketplaceSku, internalSku, name: raw.name || internalSku || marketplaceSku, createdAt: now(), updatedAt: now(), createdBy: req.user.id };
        writes.push([COLLECTION, id, item]);
        byInternal.set(internalSku, item); byBarcode.set(barcode, item);
        added++;
      }
    }
    if (writes.length) await firestoreHelpers.batchSetMulti(writes);
    res.json({ added, updated, total: writes.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await firestoreHelpers.getDocument(COLLECTION, id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { barcode, marketplaceSku, internalSku, name } = req.body;
    const updated = {
      ...existing,
      ...(barcode !== undefined ? { barcode } : {}),
      ...(marketplaceSku !== undefined ? { marketplaceSku } : {}),
      ...(internalSku !== undefined ? { internalSku } : {}),
      ...(name !== undefined ? { name } : {}),
      updatedAt: now()
    };
    await firestoreHelpers.setDocument(COLLECTION, id, updated);
    res.json({ item: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await firestoreHelpers.deleteDocument(COLLECTION, req.params.id);
    await addAuditLog('delete', 'skuCatalog', req.params.id, req.user.id, {});
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
