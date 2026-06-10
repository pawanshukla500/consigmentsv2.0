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

    // Determine if archived in PostgreSQL
    let isArchived = false;
    const { pgEnabled } = require('../config/database');
    const pgHelpers = require('../utils/pgHelpers');
    const postgresSupport = pgEnabled();

    if (postgresSupport) {
      const existsInPg = await pgHelpers.getDocument('consignments', id);
      if (existsInPg) {
        const { isFirebaseAvailable, memoryStore } = require('../utils/helpers');
        const { db } = require('../config/firebase');
        let existsInLive = false;
        if (isFirebaseAvailable()) {
          const doc = await db.collection('consignments').doc(id).get();
          existsInLive = doc.exists;
        } else {
          existsInLive = memoryStore.consignments.has(id);
        }
        if (!existsInLive) {
          isArchived = true;
        }
      }
    }

    res.json({
      consignment: {
        ...consignment,
        skus,
        boxes,
        videos,
        documents,
        marketplace,
        isArchived,
        pgEnabled: postgresSupport
      }
    });
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

    // Auto-populate the SKU master catalog (upsert) so SKUs are reusable later
    try {
      if (skus.length) {
        const catalog = await firestoreHelpers.getCollection('skuCatalog');
        const byInternal = new Map(catalog.filter(i => i.internalSku).map(i => [i.internalSku, i]));
        const byBarcode = new Map(catalog.filter(i => i.barcode).map(i => [i.barcode, i]));
        const catWrites = [];
        for (const s of skus) {
          const internalSku = (s.internalSku || '').trim();
          const marketplaceSku = (s.marketplaceSku || '').trim();
          const barcode = (s.barcode || marketplaceSku || '').trim();
          if (!internalSku && !marketplaceSku && !barcode) continue;
          if ((internalSku && byInternal.has(internalSku)) || (barcode && byBarcode.has(barcode))) continue;
          const cid = generateId();
          const item = { id: cid, barcode, marketplaceSku, internalSku, name: internalSku || marketplaceSku, createdAt: now(), updatedAt: now(), createdBy: req.user.id };
          catWrites.push(['skuCatalog', cid, item]);
          if (internalSku) byInternal.set(internalSku, item);
          if (barcode) byBarcode.set(barcode, item);
        }
        if (catWrites.length) await firestoreHelpers.batchSetMulti(catWrites);
      }
    } catch (catErr) { console.warn('[Catalog] auto-populate skipped:', catErr.message); }

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

// Archive consignment to PostgreSQL
router.post('/:id/archive', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { pgEnabled } = require('../config/database');
    const pgHelpers = require('../utils/pgHelpers');
    const { isFirebaseAvailable, memoryStore } = require('../utils/helpers');
    const { db } = require('../config/firebase');

    if (!pgEnabled()) {
      return res.status(400).json({ error: 'PostgreSQL archive is not enabled or configured.' });
    }

    // Check if the consignment is already archived in PG
    const existsInPg = await pgHelpers.getDocument('consignments', id);
    if (existsInPg) {
      return res.status(400).json({ error: 'Consignment is already archived in PostgreSQL.' });
    }

    // Fetch consignment from the live store (Firestore or Memory)
    let consignment = null;
    let fromFirestore = false;

    if (isFirebaseAvailable()) {
      const doc = await db.collection('consignments').doc(id).get();
      if (doc.exists) {
        consignment = { id: doc.id, ...doc.data() };
        fromFirestore = true;
      }
    } else {
      consignment = memoryStore.consignments.get(id) || null;
    }

    if (!consignment) {
      return res.status(404).json({ error: 'Active consignment not found in live database.' });
    }

    // Gather all related documents from live store
    const skus = [];
    const boxes = [];
    const videos = [];
    const docs = [];
    const scan_records = [];

    // Helper to fetch live documents by query or ids
    if (fromFirestore) {
      // Fetch skus
      const skuSnap = await db.collection('skus').where('consignmentId', '==', id).get();
      skuSnap.forEach(d => skus.push({ id: d.id, ...d.data() }));

      // Fetch boxes
      const boxSnap = await db.collection('boxes').where('consignmentId', '==', id).get();
      boxSnap.forEach(d => boxes.push({ id: d.id, ...d.data() }));

      // Fetch videos metadata
      const videoSnap = await db.collection('videos').where('consignmentId', '==', id).get();
      videoSnap.forEach(d => videos.push({ id: d.id, ...d.data() }));

      // Fetch documents metadata
      const docSnap = await db.collection('documents').where('consignmentId', '==', id).get();
      docSnap.forEach(d => docs.push({ id: d.id, ...d.data() }));

      // Fetch scan records
      const scanSnap = await db.collection('scan_records').where('consignmentId', '==', id).get();
      scanSnap.forEach(d => scan_records.push({ id: d.id, ...d.data() }));
    } else {
      // Memory store fetch
      Array.from(memoryStore.skus.values()).forEach(item => {
        if (item.consignmentId === id) skus.push(item);
      });
      Array.from(memoryStore.boxes.values()).forEach(item => {
        if (item.consignmentId === id) boxes.push(item);
      });
      Array.from(memoryStore.videos.values()).forEach(item => {
        if (item.consignmentId === id) videos.push(item);
      });
      Array.from(memoryStore.documents.values()).forEach(item => {
        if (item.consignmentId === id) docs.push(item);
      });
      Array.from(memoryStore.scan_records.values()).forEach(item => {
        if (item.consignmentId === id) scan_records.push(item);
      });
    }

    // Now, prepare all items for batchSetMulti in Postgres
    // Format: [collection, id, data]
    const archiveBatch = [];

    archiveBatch.push(['consignments', id, consignment]);
    skus.forEach(item => archiveBatch.push(['skus', item.id, item]));
    boxes.forEach(item => archiveBatch.push(['boxes', item.id, item]));
    videos.forEach(item => archiveBatch.push(['videos', item.id, item]));
    docs.forEach(item => archiveBatch.push(['documents', item.id, item]));
    scan_records.forEach(item => archiveBatch.push(['scan_records', item.id, item]));

    // Perform PostgreSQL batch write
    await pgHelpers.batchSetMulti(archiveBatch);

    // If Postgres batch write succeeded, delete from live store (Firestore or Memory)
    if (fromFirestore) {
      // We will perform a batch delete from Firestore
      const chunks = [];
      const allRefs = [];

      allRefs.push(db.collection('consignments').doc(id));
      skus.forEach(item => allRefs.push(db.collection('skus').doc(item.id)));
      boxes.forEach(item => allRefs.push(db.collection('boxes').doc(item.id)));
      videos.forEach(item => allRefs.push(db.collection('videos').doc(item.id)));
      docs.forEach(item => allRefs.push(db.collection('documents').doc(item.id)));
      scan_records.forEach(item => allRefs.push(db.collection('scan_records').doc(item.id)));

      // Firestore batches are limited to 500 operations
      const CHUNK_SIZE = 400;
      for (let i = 0; i < allRefs.length; i += CHUNK_SIZE) {
        const chunk = allRefs.slice(i, i + CHUNK_SIZE);
        const batch = db.batch();
        chunk.forEach(ref => batch.delete(ref));
        await batch.commit();
      }
    } else {
      // Memory store delete
      memoryStore.consignments.delete(id);
      skus.forEach(item => memoryStore.skus.delete(item.id));
      boxes.forEach(item => memoryStore.boxes.delete(item.id));
      videos.forEach(item => memoryStore.videos.delete(item.id));
      docs.forEach(item => memoryStore.documents.delete(item.id));
      scan_records.forEach(item => memoryStore.scan_records.delete(item.id));
    }

    // Add audit log
    await addAuditLog('archive_to_sql', 'consignment', id, req.user.id, {
      shipmentNo: consignment.shipmentNo,
      internalShipmentNo: consignment.internalShipmentNo,
      skusCount: skus.length,
      boxesCount: boxes.length,
      videosCount: videos.length,
      documentsCount: docs.length,
      scansCount: scan_records.length
    });

    res.json({
      success: true,
      message: 'Consignment successfully archived to PostgreSQL database and deleted from active store.',
      archived: {
        consignments: 1,
        skus: skus.length,
        boxes: boxes.length,
        videos: videos.length,
        documents: docs.length,
        scan_records: scan_records.length
      }
    });
  } catch (error) {
    console.error('[Archive] Error during archival:', error);
    res.status(500).json({ error: 'Failed to archive consignment to PostgreSQL.', message: error.message });
  }
});

module.exports = router;
