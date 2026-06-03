const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { generateId, now, addAuditLog, firestoreHelpers } = require('../utils/helpers');

// Get all consignments — datastore-agnostic (Postgres or Firestore via helper)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, search, marketplaceId, limit } = req.query;
    const maxLimit = limit ? Math.min(parseInt(limit) || 500, 1000) : 500;

    // Load all then filter/sort in Node — works identically for Postgres & Firestore
    let consignments = await firestoreHelpers.getCollection('consignments');

    if (status) {
      const statuses = status.split(',').map(s => s.trim());
      consignments = consignments.filter(c => statuses.includes(c.status));
    }
    if (marketplaceId) consignments = consignments.filter(c => c.marketplaceId === marketplaceId);

    consignments.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    consignments = consignments.slice(0, maxLimit);

    if (search) {
      const s = search.toLowerCase();
      consignments = consignments.filter(c =>
        c.id?.toLowerCase().includes(s) ||
        c.shipmentNo?.toLowerCase().includes(s) ||
        c.internalShipmentNo?.toLowerCase().includes(s) ||
        c.name?.toLowerCase().includes(s)
      );
    }

    res.json({ consignments, count: consignments.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single consignment
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const consignment = await firestoreHelpers.getDocument('consignments', id);
    if (!consignment) return res.status(404).json({ error: 'Consignment not found' });

    const fetchRelated = async (ids, collection) => {
      if (!ids?.length) return [];
      const items = await Promise.all(ids.map(id => firestoreHelpers.getDocument(collection, id)));
      return items.filter(Boolean);
    };

    const [skus, boxes, videos, documents, marketplace] = await Promise.all([
      fetchRelated(consignment.skuIds, 'skus'),
      fetchRelated(consignment.boxIds, 'boxes'),
      fetchRelated(consignment.videoIds, 'videos'),
      fetchRelated(consignment.documentIds, 'documents'),
      consignment.marketplaceId ? firestoreHelpers.getDocument('marketplaces', consignment.marketplaceId) : null
    ]);

    res.json({ consignment: { ...consignment, skus, boxes, videos, documents, marketplace } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create consignment
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { id, shipmentNo, internalShipmentNo, name, description, expectedDate, marketplaceId, warehouse,
      poExpiryDate, appointmentDate, scheduledDispatchDate, actualDispatchDate, dateOfInward,
      forwardInvoiceNo, docketCompany, docketNo, marketplaceTicketId, shipmentStatus,
      unitsShipped, unitsReceived, unitsInwarded, qaFailExcessQty, skus = [] } = req.body;
    
    if (!id) return res.status(400).json({ error: 'Consignment ID is required' });
    if (!internalShipmentNo) return res.status(400).json({ error: 'Internal Shipment No. is required' });

    const existing = await firestoreHelpers.getDocument('consignments', id);
    if (existing) return res.status(409).json({ error: 'Consignment ID already exists' });

    const consignmentData = {
      id,
      internalShipmentNo,
      name: name || internalShipmentNo,
      shipmentNo: shipmentNo || internalShipmentNo || '',
      description: description || '',
      expectedDate: expectedDate || '',
      marketplaceId: marketplaceId || '',
      warehouse: warehouse || '',
      poExpiryDate: poExpiryDate || '',
      appointmentDate: appointmentDate || '',
      scheduledDispatchDate: scheduledDispatchDate || '',
      actualDispatchDate: actualDispatchDate || '',
      dateOfInward: dateOfInward || '',
      forwardInvoiceNo: forwardInvoiceNo || '',
      docketCompany: docketCompany || '',
      docketNo: docketNo || '',
      marketplaceTicketId: marketplaceTicketId || '',
      shipmentStatus: shipmentStatus || 'Planned',
      status: 'pending',
      skuIds: [],
      boxIds: [],
      videoIds: [],
      documentIds: [],
      totalRequiredQty: 0,
      totalPackedQty: 0,
      unitsShipped: Number(unitsShipped) || 0,
      unitsReceived: Number(unitsReceived) || 0,
      unitsInwarded: Number(unitsInwarded) || 0,
      qaFailExcessQty: Number(qaFailExcessQty) || 0,
      createdAt: now(),
      updatedAt: now(),
      createdBy: req.user.id
    };

    const skuIds = [];
    let totalRequiredQty = 0;
    const skuBatch = [];
    
    for (const sku of skus) {
      const skuId = generateId();
      const skuData = {
        id: skuId,
        consignmentId: id,
        // Three distinct SKU identifiers:
        barcode:       sku.barcode || sku.marketplaceSku || '',  // physical barcode that gets scanned
        marketplaceSku: sku.marketplaceSku || sku.barcode || '', // marketplace's SKU code
        internalSku:   sku.internalSku || sku.name || '',        // internal / OMS SKU code
        marketplaceId: sku.marketplaceId || marketplaceId || '',
        requiredQty: parseInt(sku.requiredQty) || 0,
        packedQty: 0,
        boxQuantities: {},
        status: 'pending',
        createdAt: now(),
        updatedAt: now()
      };
      skuBatch.push([skuId, skuData]);
      skuIds.push(skuId);
      totalRequiredQty += skuData.requiredQty;
    }

    if (skuBatch.length > 0) await firestoreHelpers.batchSet('skus', skuBatch);

    consignmentData.skuIds = skuIds;
    consignmentData.totalRequiredQty = totalRequiredQty;

    await firestoreHelpers.setDocument('consignments', id, consignmentData);
    await addAuditLog('create', 'consignment', id, req.user.id, { internalShipmentNo, skuCount: skus.length });

    res.status(201).json({ consignment: consignmentData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update consignment
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const existing = await firestoreHelpers.getDocument('consignments', id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const allowed = ['name', 'shipmentNo', 'internalShipmentNo', 'description', 'expectedDate', 'marketplaceId', 'warehouse',
      'poExpiryDate', 'appointmentDate', 'scheduledDispatchDate', 'actualDispatchDate', 'dateOfInward',
      'forwardInvoiceNo', 'docketCompany', 'docketNo', 'marketplaceTicketId', 'shipmentStatus', 'status',
      'unitsShipped', 'unitsReceived', 'unitsInwarded', 'qaFailExcessQty'];
    const updateData = { updatedAt: now() };
    allowed.forEach(f => { if (updates[f] !== undefined) updateData[f] = updates[f]; });

    const updated = { ...existing, ...updateData };
    await firestoreHelpers.setDocument('consignments', id, updated);
    await addAuditLog('update', 'consignment', id, req.user.id, updateData);
    res.json({ consignment: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete consignment
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await firestoreHelpers.getDocument('consignments', id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const deleteTasks = [];
    if (existing.skuIds?.length) deleteTasks.push(firestoreHelpers.batchDelete('skus', existing.skuIds));
    if (existing.boxIds?.length) deleteTasks.push(firestoreHelpers.batchDelete('boxes', existing.boxIds));
    await Promise.all(deleteTasks);
    await firestoreHelpers.deleteDocument('consignments', id);
    await addAuditLog('delete', 'consignment', id, req.user.id, {});
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pack SKU
router.post('/:id/skus/:skuId/pack', authenticateToken, async (req, res) => {
  try {
    const { id, skuId } = req.params;
    const { boxNo, quantity, action } = req.body;
    if (!boxNo || !['add', 'remove'].includes(action)) return res.status(400).json({ error: 'Invalid request' });

    const sku = await firestoreHelpers.getDocument('skus', skuId);
    if (!sku || sku.consignmentId !== id) return res.status(404).json({ error: 'SKU not found' });

    const qty = parseInt(quantity) || 1;
    const currentBoxQty = sku.boxQuantities?.[boxNo] || 0;
    let newBoxQty = currentBoxQty;
    let newPackedQty = sku.packedQty;

    if (action === 'add') {
      if (sku.packedQty + qty > sku.requiredQty) {
        return res.status(400).json({ error: `Cannot pack more than required quantity (${sku.requiredQty})` });
      }
      newBoxQty = currentBoxQty + qty;
      newPackedQty = sku.packedQty + qty;
    } else if (action === 'remove') {
      newBoxQty = Math.max(0, currentBoxQty - qty);
      newPackedQty = Math.max(0, sku.packedQty - qty);
    }

    const updatedBoxQuantities = { ...sku.boxQuantities, [boxNo]: newBoxQty };
    if (newBoxQty === 0) delete updatedBoxQuantities[boxNo];

    const skuUpdate = {
      ...sku,
      packedQty: newPackedQty,
      boxQuantities: updatedBoxQuantities,
      status: newPackedQty >= sku.requiredQty && sku.requiredQty > 0 ? 'completed' : 'pending',
      updatedAt: now()
    };

    await firestoreHelpers.setDocument('skus', skuId, skuUpdate);

    const consignment = await firestoreHelpers.getDocument('consignments', id);
    if (consignment?.skuIds?.length) {
      const allSkus = await Promise.all(consignment.skuIds.map(sid => firestoreHelpers.getDocument('skus', sid)));
      const validSkus = allSkus.filter(Boolean);
      const totalPackedQty = validSkus.reduce((sum, s) => sum + (s.packedQty || 0), 0);
      const allCompleted = validSkus.every(s => s.status === 'completed');
      
      await firestoreHelpers.setDocument('consignments', id, {
        ...consignment,
        totalPackedQty,
        status: allCompleted ? 'completed' : totalPackedQty > 0 ? 'in_progress' : consignment.status,
        updatedAt: now()
      });
    }

    await addAuditLog('pack', 'sku', skuId, req.user.id, { boxNo, quantity: qty, action });
    res.json({ sku: skuUpdate });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save box
router.post('/:id/boxes', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { boxNo, items, notes } = req.body;
    if (!boxNo) return res.status(400).json({ error: 'Box number required' });

    const consignment = await firestoreHelpers.getDocument('consignments', id);
    if (!consignment) return res.status(404).json({ error: 'Not found' });

    const boxId = `${id}_box_${boxNo}`;
    const boxData = {
      id: boxId,
      consignmentId: id,
      boxNo: String(boxNo),
      items: items || [],
      notes: notes || '',
      totalQty: (items || []).reduce((sum, item) => sum + (item.qty || 0), 0),
      createdAt: now(),
      updatedAt: now(),
      createdBy: req.user.id
    };

    await firestoreHelpers.setDocument('boxes', boxId, boxData);
    const boxIds = new Set(consignment.boxIds || []);
    boxIds.add(boxId);
    
    await firestoreHelpers.setDocument('consignments', id, {
      ...consignment,
      boxIds: Array.from(boxIds),
      status: consignment.status === 'pending' ? 'in_progress' : consignment.status,
      updatedAt: now()
    });

    await addAuditLog('save_box', 'box', boxId, req.user.id, { boxNo, itemCount: items?.length });
    res.status(201).json({ box: boxData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
