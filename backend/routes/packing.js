const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { generateId, now, addAuditLog, firestoreHelpers } = require('../utils/helpers');

const MEM = {};
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getSession(cid) {
  if (!MEM[cid]) MEM[cid] = { cid, skus: [], boxes: {}, currentBox: null, skuMap: {}, status: 'active', lastActivity: Date.now() };
  else MEM[cid].lastActivity = Date.now();
  return MEM[cid];
}

function clearSession(cid) { delete MEM[cid]; }

// Purge sessions inactive for more than 24 hours (prevents memory leak)
setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const cid of Object.keys(MEM)) {
    if ((MEM[cid].lastActivity || 0) < cutoff) {
      console.log(`[Packing] Purging stale session: ${cid}`);
      delete MEM[cid];
    }
  }
}, 60 * 60 * 1000); // run every hour

// Load consignment
router.post('/load', authenticateToken, async (req, res) => {
  try {
    const { consignment_id } = req.body;
    if (!consignment_id) return res.status(400).json({ error: 'Consignment ID required' });

    let consignment = await firestoreHelpers.getDocument('consignments', consignment_id);

    // Fallback: search by internalShipmentNo or shipmentNo
    if (!consignment) {
      const byIntShip = await firestoreHelpers.queryCollection('consignments', 'internalShipmentNo', '==', consignment_id);
      if (byIntShip.length > 0) consignment = byIntShip[0];
    }
    if (!consignment) {
      const byShipNo = await firestoreHelpers.queryCollection('consignments', 'shipmentNo', '==', consignment_id);
      if (byShipNo.length > 0) consignment = byShipNo[0];
    }

    if (!consignment) return res.status(404).json({ error: 'Consignment not found' });

    // Use the actual document id for all downstream references
    const actualCid = consignment.id;

    // Fetch SKUs and boxes in parallel (not sequential) for fast load
    const [rawSkus, rawBoxes] = await Promise.all([
      consignment.skuIds?.length
        ? Promise.all(consignment.skuIds.map(id => firestoreHelpers.getDocument('skus', id)))
        : Promise.resolve([]),
      consignment.boxIds?.length
        ? Promise.all(consignment.boxIds.map(id => firestoreHelpers.getDocument('boxes', id)))
        : Promise.resolve([])
    ]);

    const skus = rawSkus.filter(Boolean).map(sku => ({
      id: sku.id,
      barcode: sku.barcode || sku.marketplaceSku,
      marketplaceSku: sku.marketplaceSku,
      internalSku: sku.internalSku,
      required: sku.requiredQty,
      packed: sku.packedQty || 0,
      remaining: Math.max(0, (sku.requiredQty || 0) - (sku.packedQty || 0)),
      status: sku.status,
      marketplaceId: sku.marketplaceId
    }));

    const boxes = {};
    rawBoxes.filter(Boolean).forEach(box => { boxes[box.boxNo] = box.items || []; });

    const session = getSession(actualCid);
    session.skus = skus;
    session.boxes = boxes;
    session.currentBox = null;
    session.skuMap = {};
    // Index by barcode, marketplaceSku AND internalSku so any code can be scanned
    skus.forEach(s => {
      if (s.barcode)       session.skuMap[s.barcode] = s;
      if (s.marketplaceSku) session.skuMap[s.marketplaceSku] = s;
      if (s.internalSku)   session.skuMap[s.internalSku] = s;
    });

    const resumedBoxes = Object.keys(boxes).length;
    res.json({
      consignment_id: actualCid,
      internalShipmentNo: consignment.internalShipmentNo || '',
      shipmentNo: consignment.shipmentNo || '',
      total_skus: skus.length,
      skus,
      boxes,
      resumed: resumedBoxes > 0,
      resumed_boxes: resumedBoxes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Increment
router.post('/increment', authenticateToken, async (req, res) => {
  try {
    const { consignment_id, barcode, box_no, qty = 1 } = req.body;
    const session = getSession(consignment_id);
    if (!session.skus.length) return res.status(400).json({ error: 'No consignment loaded' });

    // Find by any of: barcode, marketplaceSku, internalSku
    const sku = session.skuMap[barcode];
    if (!sku) return res.json({ not_found: true, barcode });

    if (sku.status === 'completed' || sku.remaining <= 0) {
      return res.json({ over_limit: true, locked: true, message: `Already completed (${sku.packed}/${sku.required})` });
    }

    const newPacked = sku.packed + qty;
    if (newPacked > sku.required) {
      return res.json({ over_limit: true, message: `Cannot exceed required qty (${sku.required})` });
    }

    sku.packed = newPacked;
    sku.remaining = sku.required - newPacked;
    if (sku.remaining <= 0) sku.status = 'completed';

    if (!session.boxes[box_no]) session.boxes[box_no] = [];
    const boxItems = session.boxes[box_no];
    // Match box item by skuId (stable) instead of scanned code
    const existing = boxItems.find(i => i.skuId === sku.id);
    if (existing) {
      existing.qty += qty;
    } else {
      boxItems.push({
        skuId: sku.id,
        barcode: sku.barcode,
        marketplaceSku: sku.marketplaceSku,
        internalSku: sku.internalSku,
        name: sku.internalSku,
        qty
      });
    }

    res.json({
      barcode: sku.barcode,
      marketplaceSku: sku.marketplaceSku,
      internalSku: sku.internalSku,
      name: sku.internalSku,
      packed: sku.packed,
      required: sku.required,
      remaining: sku.remaining,
      box_items: boxItems
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Decrement
router.post('/decrement', authenticateToken, async (req, res) => {
  try {
    const { consignment_id, barcode, box_no, qty = 1 } = req.body;
    const session = getSession(consignment_id);
    if (!session.skus.length) return res.status(400).json({ error: 'No consignment loaded' });

    const sku = session.skuMap[barcode];
    if (!sku) return res.json({ error: 'SKU not found' });

    const newPacked = Math.max(0, sku.packed - qty);
    sku.packed = newPacked;
    sku.remaining = Math.max(0, sku.required - newPacked);
    sku.status = sku.remaining > 0 ? 'pending' : 'completed';

    if (session.boxes[box_no]) {
      const existing = session.boxes[box_no].find(i => i.skuId === sku.id);
      if (existing) {
        existing.qty -= qty;
        if (existing.qty <= 0) {
          session.boxes[box_no] = session.boxes[box_no].filter(i => i.skuId !== sku.id);
        }
      }
    }

    res.json({ barcode, marketplaceSku: barcode, internalSku: sku.internalSku, packed: sku.packed, required: sku.required, remaining: sku.remaining });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check duplicate box
router.post('/check-duplicate-box', authenticateToken, async (req, res) => {
  try {
    const { consignment_id, box_no } = req.body;
    const consignment = await firestoreHelpers.getDocument('consignments', consignment_id);
    if (!consignment) return res.json({ duplicate: false });

    const existingBox = consignment.boxIds?.find(bid => bid === `${consignment_id}_box_${box_no}`);
    if (existingBox) {
      const box = await firestoreHelpers.getDocument('boxes', existingBox);
      return res.json({ duplicate: true, total_qty: box?.totalQty || 0 });
    }
    res.json({ duplicate: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save box
router.post('/save-box', authenticateToken, async (req, res) => {
  try {
    const { consignment_id, box_no } = req.body;
    const session = getSession(consignment_id);
    if (!session.skus.length || !box_no) return res.status(400).json({ error: 'Invalid session' });

    const boxItems = session.boxes[box_no] || [];
    if (!boxItems.length) return res.status(400).json({ error: 'Box is empty' });

    const boxId = `${consignment_id}_box_${box_no}`;
    const totalQty = boxItems.reduce((sum, i) => sum + i.qty, 0);

    const boxData = {
      id: boxId,
      consignmentId: consignment_id,
      boxNo: String(box_no),
      items: boxItems,
      totalQty,
      createdAt: now(),
      updatedAt: now(),
      createdBy: req.user.id
    };

    const consignment = await firestoreHelpers.getDocument('consignments', consignment_id);
    const writeBatch = [];
    writeBatch.push(['boxes', boxId, boxData]);

    if (consignment) {
      const boxIds = new Set(consignment.boxIds || []);
      boxIds.add(boxId);

      // ── SINGLE SOURCE OF TRUTH: physical box contents ──
      // Build boxQuantities per SKU keyed strictly by skuId. packedQty is then
      // DERIVED from these box contents — so packedQty, boxQuantities, box totals
      // and consignment totals can never drift apart.
      const skuBoxQtys = {};   // skuId -> { boxNo: qty }
      for (const [bno, items] of Object.entries(session.boxes)) {
        for (const item of items) {
          if (!item.skuId) continue;
          if (!skuBoxQtys[item.skuId]) skuBoxQtys[item.skuId] = {};
          skuBoxQtys[item.skuId][bno] = (skuBoxQtys[item.skuId][bno] || 0) + (item.qty || 0);
        }
      }

      for (const sku of session.skus) {
        const boxQuantities = skuBoxQtys[sku.id] || {};
        const packedFromBoxes = Object.values(boxQuantities).reduce((a, b) => a + b, 0);
        // Keep the in-memory session counter in sync with physical boxes
        sku.packed = packedFromBoxes;
        sku.remaining = Math.max(0, (sku.required || 0) - packedFromBoxes);
        sku.status = (sku.required || 0) > 0 && packedFromBoxes >= sku.required ? 'completed' : 'pending';
        writeBatch.push(['skus', sku.id, {
          packedQty: packedFromBoxes,
          boxQuantities,
          status: sku.status,
          updatedAt: now()
        }]);
      }

      const totalPackedQty = session.skus.reduce((sum, s) => sum + (s.packed || 0), 0);
      const totalRequiredQty = session.skus.reduce((sum, s) => sum + (s.required || 0), 0);
      const allCompleted = session.skus.every(s => s.status === 'completed');

      writeBatch.push(['consignments', consignment_id, {
        boxIds: Array.from(boxIds),
        totalPackedQty,
        totalRequiredQty,
        status: allCompleted ? 'completed' : 'in_progress',
        updatedAt: now()
      }]);
    }

    await firestoreHelpers.batchSetMulti(writeBatch);

    await addAuditLog('save_box', 'box', boxId, req.user.id, { boxNo: box_no, itemCount: boxItems.length });
    await firestoreHelpers.setDocument('productivity', generateId(), {
      consignmentId: consignment_id, boxNo: String(box_no),
      eventType: 'box_saved', itemsCount: totalQty, timestamp: now(), userId: req.user.id
    });

    res.json({ success: true, box: boxData, synced: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate label
router.post('/generate-label', authenticateToken, async (req, res) => {
  try {
    const { consignment_id, box_no } = req.body;
    res.json({ success: true, message: `Label for Box #${box_no} generated` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Finish
router.post('/finish', authenticateToken, async (req, res) => {
  try {
    const { consignment_id } = req.body;
    const session = getSession(consignment_id);
    clearSession(consignment_id);

    const consignment = await firestoreHelpers.getDocument('consignments', consignment_id);
    if (consignment) {
      // Re-derive everything from the PHYSICAL BOXES (single source of truth).
      // This self-heals any drift between packedQty, boxQuantities and box totals.
      const [allSkus, allBoxes] = await Promise.all([
        Promise.all((consignment.skuIds || []).map(sid => firestoreHelpers.getDocument('skus', sid))),
        Promise.all((consignment.boxIds || []).map(bid => firestoreHelpers.getDocument('boxes', bid)))
      ]);
      const validSkus  = allSkus.filter(Boolean);
      const validBoxes = allBoxes.filter(Boolean);

      // Sum each SKU's qty across all boxes, keyed by skuId
      const packedBySku = {};   // skuId -> { boxNo: qty }
      for (const box of validBoxes) {
        for (const item of (box.items || [])) {
          if (!item.skuId) continue;
          if (!packedBySku[item.skuId]) packedBySku[item.skuId] = {};
          packedBySku[item.skuId][box.boxNo] = (packedBySku[item.skuId][box.boxNo] || 0) + (item.qty || 0);
        }
      }

      // Update each SKU to match physical boxes
      const skuWrites = [];
      for (const s of validSkus) {
        const boxQuantities = packedBySku[s.id] || {};
        const packed = Object.values(boxQuantities).reduce((a, b) => a + b, 0);
        const status = (s.requiredQty || 0) > 0 && packed >= s.requiredQty ? 'completed' : 'pending';
        s.packedQty = packed; s.status = status; s.boxQuantities = boxQuantities;
        skuWrites.push(['skus', s.id, { packedQty: packed, boxQuantities, status, updatedAt: now() }]);
      }
      if (skuWrites.length) await firestoreHelpers.batchSetMulti(skuWrites);

      const totalPackedQty = validSkus.reduce((sum, s) => sum + (s.packedQty || 0), 0);
      const totalRequiredQty = validSkus.reduce((sum, s) => sum + (s.requiredQty || 0), 0);
      const allCompleted = validSkus.length > 0 && validSkus.every(s => s.status === 'completed');

      const newStatus = allCompleted ? 'completed' : 'in_progress';
      await firestoreHelpers.setDocument('consignments', consignment_id, {
        ...consignment,
        status: newStatus,
        totalPackedQty,
        totalRequiredQty,
        updatedAt: now()
      });

      await addAuditLog('finish', 'consignment', consignment_id, req.user.id, { status: newStatus, totalPackedQty, totalRequiredQty });
      await firestoreHelpers.setDocument('productivity', generateId(), {
        consignmentId: consignment_id, eventType: 'consignment_finished', timestamp: now(), userId: req.user.id
      });

      res.json({ success: true, summary: { fully_packed: allCompleted, totalPackedQty, totalRequiredQty } });
    } else {
      res.status(404).json({ error: 'Consignment not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resume session
router.get('/resume-session', authenticateToken, async (req, res) => {
  try {
    const active = Object.keys(MEM).map(cid => {
      const s = MEM[cid];
      return {
        consignment_id: cid,
        box_count: Object.keys(s.boxes).length,
        total_packed: s.skus.reduce((sum, sku) => sum + sku.packed, 0),
        total_required: s.skus.reduce((sum, sku) => sum + sku.required, 0),
        last_saved: 'Unknown'
      };
    });
    res.json({ available: active.length > 0, consignments: active });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sync status
router.get('/sync-status', authenticateToken, async (req, res) => {
  res.json({ state: 'synced', pending_count: 0 });
});

// Productivity
router.get('/productivity', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toDateString();
    const records = await firestoreHelpers.getCollection('productivity');
    const todayRecords = records.filter(r => new Date(r.timestamp).toDateString() === today);
    const boxesToday = todayRecords.filter(r => r.eventType === 'box_saved').length;
    const itemsToday = todayRecords.filter(r => r.eventType === 'box_saved').reduce((sum, r) => sum + (r.itemsCount || 0), 0);
    const boxRecords = todayRecords.filter(r => r.eventType === 'box_saved');
    const avgSpeed = boxRecords.length > 0 ? (itemsToday / boxRecords.length).toFixed(1) : '0';
    res.json({ boxes_today: boxesToday, items_today: itemsToday, avg_speed: avgSpeed, avg_time_per_box: 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload video
router.post('/upload-video', authenticateToken, async (req, res) => {
  res.json({ ok: true, size_mb: 0 });
});

module.exports = router;
