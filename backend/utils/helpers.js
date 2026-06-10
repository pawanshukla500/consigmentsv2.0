const { v4: uuidv4 } = require('uuid');
const { db, firebaseInitialized } = require('../config/firebase');
const { pgEnabled } = require('../config/database');
const pgHelpers = require('./pgHelpers');

const isFirebaseAvailable = () => firebaseInitialized && db !== null;

const memoryStore = {
  consignments: new Map(),
  skus: new Map(),
  boxes: new Map(),
  scan_records: new Map(),
  videos: new Map(),
  documents: new Map(),
  productivity: new Map(),
  auditLogs: new Map(),
  users: new Map(),
  marketplaces: new Map(),
  templates: new Map(),
  settings: new Map(),
  docketCompanies: new Map()
};

const generateId = () => uuidv4();
const now = () => new Date().toISOString();

const addAuditLog = async (action, entityType, entityId, userId, details = {}) => {
  const logEntry = {
    id: generateId(),
    action,
    entityType,
    entityId,
    userId,
    details,
    timestamp: now()
  };

  if (pgEnabled()) {
    try {
      await pgHelpers.setDocument('auditLogs', logEntry.id, logEntry);
      return;
    } catch (e) {
      console.error('[Audit] PG write failed:', e.message);
    }
  }
  if (isFirebaseAvailable()) {
    try {
      await db.collection('auditLogs').add(logEntry);
    } catch (e) {
      memoryStore.auditLogs.set(logEntry.id, logEntry);
    }
  } else {
    memoryStore.auditLogs.set(logEntry.id, logEntry);
  }
};

const firestoreHelpers = {
  async getCollection(collectionName) {
    if (pgEnabled()) return pgHelpers.getCollection(collectionName);
    if (!isFirebaseAvailable()) {
      return Array.from(memoryStore[collectionName]?.values() || []);
    }
    try {
      const snapshot = await db.collection(collectionName).get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
      console.error(`Error getting collection ${collectionName}:`, e.message);
      return Array.from(memoryStore[collectionName]?.values() || []);
    }
  },

  async getDocument(collectionName, docId) {
    if (pgEnabled()) return pgHelpers.getDocument(collectionName, docId);
    if (!isFirebaseAvailable()) {
      return memoryStore[collectionName]?.get(docId) || null;
    }
    try {
      const doc = await db.collection(collectionName).doc(docId).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    } catch (e) {
      console.error(`Error getting document ${collectionName}/${docId}:`, e.message);
      return memoryStore[collectionName]?.get(docId) || null;
    }
  },

  async setDocument(collectionName, docId, data) {
    if (pgEnabled()) return pgHelpers.setDocument(collectionName, docId, data);
    if (!isFirebaseAvailable()) {
      if (!memoryStore[collectionName]) memoryStore[collectionName] = new Map();
      // Merge with existing doc (mirrors Firestore { merge: true } behaviour)
      const existing = memoryStore[collectionName].get(docId) || {};
      const merged = { ...existing, id: docId, ...data };
      memoryStore[collectionName].set(docId, merged);
      return merged;
    }
    try {
      await db.collection(collectionName).doc(docId).set(data, { merge: true });
      return { id: docId, ...data };
    } catch (e) {
      console.error(`Error setting document ${collectionName}/${docId}:`, e.message);
      const existing = memoryStore[collectionName]?.get(docId) || {};
      const merged = { ...existing, id: docId, ...data };
      if (!memoryStore[collectionName]) memoryStore[collectionName] = new Map();
      memoryStore[collectionName].set(docId, merged);
      return merged;
    }
  },

  async deleteDocument(collectionName, docId) {
    if (pgEnabled()) return pgHelpers.deleteDocument(collectionName, docId);
    if (!isFirebaseAvailable()) {
      if (!memoryStore[collectionName]) return true;
      memoryStore[collectionName].delete(docId);
      return true;
    }
    try {
      await db.collection(collectionName).doc(docId).delete();
      return true;
    } catch (e) {
      console.error(`Error deleting document ${collectionName}/${docId}:`, e.message);
      memoryStore[collectionName].delete(docId);
      return true;
    }
  },

  async queryCollection(collectionName, fieldPath, opStr, value) {
    if (pgEnabled()) return pgHelpers.queryCollection(collectionName, fieldPath, opStr, value);
    if (!isFirebaseAvailable()) {
      const all = Array.from(memoryStore[collectionName]?.values() || []);
      return all.filter(item => {
        if (opStr === '==') return item[fieldPath] === value;
        if (opStr === 'array-contains') return item[fieldPath]?.includes(value);
        return true;
      });
    }
    try {
      const snapshot = await db.collection(collectionName).where(fieldPath, opStr, value).get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
      console.error(`Error querying collection ${collectionName}:`, e.message);
      const all = Array.from(memoryStore[collectionName]?.values() || []);
      return all.filter(item => {
        if (opStr === '==') return item[fieldPath] === value;
        if (opStr === 'array-contains') return item[fieldPath]?.includes(value);
        return true;
      });
    }
  },

  // Batch operations for better performance
  async batchSet(collectionName, items) {
    if (pgEnabled()) return pgHelpers.batchSet(collectionName, items);
    if (!isFirebaseAvailable()) {
      if (!memoryStore[collectionName]) memoryStore[collectionName] = new Map();
      for (const [docId, data] of items) {
        const existing = memoryStore[collectionName].get(docId) || {};
        memoryStore[collectionName].set(docId, { ...existing, id: docId, ...data });
      }
      return true;
    }
    // Firestore hard limit: 500 writes per batch — chunk accordingly
    const CHUNK_SIZE = 490;
    try {
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const batch = db.batch();
        for (const [docId, data] of chunk) {
          const ref = db.collection(collectionName).doc(docId);
          batch.set(ref, data, { merge: true });
        }
        await batch.commit();
      }
      return true;
    } catch (e) {
      console.error(`Error batch setting ${collectionName}:`, e.message);
      if (!memoryStore[collectionName]) memoryStore[collectionName] = new Map();
      for (const [docId, data] of items) {
        const existing = memoryStore[collectionName].get(docId) || {};
        memoryStore[collectionName].set(docId, { ...existing, id: docId, ...data });
      }
      return true;
    }
  },

  async batchDelete(collectionName, docIds) {
    if (pgEnabled()) return pgHelpers.batchDelete(collectionName, docIds);
    if (!isFirebaseAvailable()) {
      for (const docId of docIds) {
        memoryStore[collectionName].delete(docId);
      }
      return true;
    }
    try {
      const batch = db.batch();
      for (const docId of docIds) {
        const ref = db.collection(collectionName).doc(docId);
        batch.delete(ref);
      }
      await batch.commit();
      return true;
    } catch (e) {
      console.error(`Error batch deleting ${collectionName}:`, e.message);
      for (const docId of docIds) {
        memoryStore[collectionName].delete(docId);
      }
      return true;
    }
  },

  // Multi-collection batch write — auto-chunks to stay under Firestore's 500-op limit
  async batchSetMulti(items) {
    // items = [[collectionName, docId, data], ...]
    if (pgEnabled()) return pgHelpers.batchSetMulti(items);
    if (!isFirebaseAvailable()) {
      for (const [collectionName, docId, data] of items) {
        if (!memoryStore[collectionName]) memoryStore[collectionName] = new Map();
        const existing = memoryStore[collectionName].get(docId) || {};
        memoryStore[collectionName].set(docId, { ...existing, id: docId, ...data });
      }
      return true;
    }
    // Firestore hard limit: 500 writes per batch — chunk accordingly
    const CHUNK_SIZE = 490;
    try {
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const batch = db.batch();
        for (const [collectionName, docId, data] of chunk) {
          const ref = db.collection(collectionName).doc(docId);
          batch.set(ref, data, { merge: true });
        }
        await batch.commit();
      }
      return true;
    } catch (e) {
      console.error('Error batchSetMulti:', e.message);
      // Fallback to memory on failure
      for (const [collectionName, docId, data] of items) {
        if (!memoryStore[collectionName]) memoryStore[collectionName] = new Map();
        const existing = memoryStore[collectionName].get(docId) || {};
        memoryStore[collectionName].set(docId, { ...existing, id: docId, ...data });
      }
      return true;
    }
  }
};

module.exports = {
  isFirebaseAvailable,
  memoryStore,
  generateId,
  now,
  addAuditLog,
  firestoreHelpers
};
