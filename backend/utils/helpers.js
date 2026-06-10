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
    let liveItems = [];
    if (!isFirebaseAvailable()) {
      liveItems = Array.from(memoryStore[collectionName]?.values() || []);
    } else {
      try {
        const snapshot = await db.collection(collectionName).get();
        liveItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (e) {
        console.error(`Error getting collection ${collectionName} from Firestore:`, e.message);
        liveItems = Array.from(memoryStore[collectionName]?.values() || []);
      }
    }

    if (pgEnabled()) {
      try {
        const pgItems = await pgHelpers.getCollection(collectionName);
        const merged = new Map();
        pgItems.forEach(item => merged.set(item.id, item));
        liveItems.forEach(item => merged.set(item.id, item));
        return Array.from(merged.values());
      } catch (e) {
        console.error(`Error merging PG collection ${collectionName}:`, e.message);
      }
    }
    return liveItems;
  },

  async getDocument(collectionName, docId) {
    let docData = null;
    if (isFirebaseAvailable()) {
      try {
        const doc = await db.collection(collectionName).doc(docId).get();
        if (doc.exists) docData = { id: doc.id, ...doc.data() };
      } catch (e) {}
    } else {
      docData = memoryStore[collectionName]?.get(docId) || null;
    }

    if (!docData && pgEnabled()) {
      try {
        docData = await pgHelpers.getDocument(collectionName, docId);
      } catch (e) {
        console.error(`Error checking PG document ${collectionName}/${docId}:`, e.message);
      }
    }
    return docData;
  },

  async setDocument(collectionName, docId, data) {
    if (pgEnabled()) {
      try {
        const existsInPg = await pgHelpers.getDocument(collectionName, docId);
        if (existsInPg) {
          return await pgHelpers.setDocument(collectionName, docId, data);
        }
      } catch (e) {
        console.error(`Error checking/updating PG document ${collectionName}/${docId}:`, e.message);
      }
    }

    if (!isFirebaseAvailable()) {
      if (!memoryStore[collectionName]) memoryStore[collectionName] = new Map();
      const existing = memoryStore[collectionName].get(docId) || {};
      const merged = { ...existing, id: docId, ...data };
      memoryStore[collectionName].set(docId, merged);
      return merged;
    }
    try {
      await db.collection(collectionName).doc(docId).set(data, { merge: true });
      return { id: docId, ...data };
    } catch (e) {
      console.error(`Error setting document ${collectionName}/${docId} in Firestore:`, e.message);
      if (!memoryStore[collectionName]) memoryStore[collectionName] = new Map();
      const existing = memoryStore[collectionName]?.get(docId) || {};
      const merged = { ...existing, id: docId, ...data };
      memoryStore[collectionName].set(docId, merged);
      return merged;
    }
  },

  async deleteDocument(collectionName, docId) {
    if (pgEnabled()) {
      try {
        await pgHelpers.deleteDocument(collectionName, docId);
      } catch (e) {
        console.error(`Error deleting PG document ${collectionName}/${docId}:`, e.message);
      }
    }

    if (!isFirebaseAvailable()) {
      if (memoryStore[collectionName]) {
        memoryStore[collectionName].delete(docId);
      }
      return true;
    }
    try {
      await db.collection(collectionName).doc(docId).delete();
      return true;
    } catch (e) {
      console.error(`Error deleting document ${collectionName}/${docId} in Firestore:`, e.message);
      if (memoryStore[collectionName]) {
        memoryStore[collectionName].delete(docId);
      }
      return true;
    }
  },

  async queryCollection(collectionName, fieldPath, opStr, value) {
    let liveItems = [];
    if (!isFirebaseAvailable()) {
      const all = Array.from(memoryStore[collectionName]?.values() || []);
      liveItems = all.filter(item => {
        if (opStr === '==') return item[fieldPath] === value;
        if (opStr === 'array-contains') return item[fieldPath]?.includes(value);
        return true;
      });
    } else {
      try {
        const snapshot = await db.collection(collectionName).where(fieldPath, opStr, value).get();
        liveItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (e) {
        console.error(`Error querying collection ${collectionName} in Firestore:`, e.message);
        const all = Array.from(memoryStore[collectionName]?.values() || []);
        liveItems = all.filter(item => {
          if (opStr === '==') return item[fieldPath] === value;
          if (opStr === 'array-contains') return item[fieldPath]?.includes(value);
          return true;
        });
      }
    }

    if (pgEnabled()) {
      try {
        const pgItems = await pgHelpers.queryCollection(collectionName, fieldPath, opStr, value);
        const merged = new Map();
        pgItems.forEach(item => merged.set(item.id, item));
        liveItems.forEach(item => merged.set(item.id, item));
        return Array.from(merged.values());
      } catch (e) {
        console.error(`Error merging PG query ${collectionName}:`, e.message);
      }
    }
    return liveItems;
  },

  async batchSet(collectionName, items) {
    const pgItems = [];
    const fsItems = [];

    if (pgEnabled()) {
      try {
        for (const [docId, data] of items) {
          const exists = await pgHelpers.getDocument(collectionName, docId);
          if (exists) {
            pgItems.push([docId, data]);
          } else {
            fsItems.push([docId, data]);
          }
        }
      } catch (e) {
        console.error(`Error resolving batch set PG targets:`, e.message);
        fsItems.push(...items);
      }
    } else {
      fsItems.push(...items);
    }

    if (pgItems.length > 0) {
      try {
        await pgHelpers.batchSet(collectionName, pgItems);
      } catch (e) {
        console.error(`PG batchSet failed:`, e.message);
      }
    }

    if (fsItems.length > 0) {
      if (!isFirebaseAvailable()) {
        if (!memoryStore[collectionName]) memoryStore[collectionName] = new Map();
        for (const [docId, data] of fsItems) {
          const existing = memoryStore[collectionName].get(docId) || {};
          memoryStore[collectionName].set(docId, { ...existing, id: docId, ...data });
        }
        return true;
      }
      const CHUNK_SIZE = 490;
      try {
        for (let i = 0; i < fsItems.length; i += CHUNK_SIZE) {
          const chunk = fsItems.slice(i, i + CHUNK_SIZE);
          const batch = db.batch();
          for (const [docId, data] of chunk) {
            const ref = db.collection(collectionName).doc(docId);
            batch.set(ref, data, { merge: true });
          }
          await batch.commit();
        }
        return true;
      } catch (e) {
        console.error(`Error batch setting ${collectionName} in Firestore:`, e.message);
        if (!memoryStore[collectionName]) memoryStore[collectionName] = new Map();
        for (const [docId, data] of fsItems) {
          const existing = memoryStore[collectionName].get(docId) || {};
          memoryStore[collectionName].set(docId, { ...existing, id: docId, ...data });
        }
        return true;
      }
    }
    return true;
  },

  async batchDelete(collectionName, docIds) {
    if (pgEnabled()) {
      try {
        await pgHelpers.batchDelete(collectionName, docIds);
      } catch (e) {
        console.error(`PG batchDelete failed:`, e.message);
      }
    }

    if (!isFirebaseAvailable()) {
      for (const docId of docIds) {
        memoryStore[collectionName]?.delete(docId);
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
      console.error(`Error batch deleting ${collectionName} in Firestore:`, e.message);
      for (const docId of docIds) {
        memoryStore[collectionName]?.delete(docId);
      }
      return true;
    }
  },

  async batchSetMulti(items) {
    const pgItems = [];
    const fsItems = [];

    if (pgEnabled()) {
      try {
        for (const [col, docId, data] of items) {
          const exists = await pgHelpers.getDocument(col, docId);
          if (exists) {
            pgItems.push([col, docId, data]);
          } else {
            fsItems.push([col, docId, data]);
          }
        }
      } catch (e) {
        console.error(`Error checking batchSetMulti targets:`, e.message);
        fsItems.push(...items);
      }
    } else {
      fsItems.push(...items);
    }

    if (pgItems.length > 0) {
      try {
        await pgHelpers.batchSetMulti(pgItems);
      } catch (e) {
        console.error(`PG batchSetMulti failed:`, e.message);
      }
    }

    if (fsItems.length > 0) {
      if (!isFirebaseAvailable()) {
        for (const [col, docId, data] of fsItems) {
          if (!memoryStore[col]) memoryStore[col] = new Map();
          const existing = memoryStore[col].get(docId) || {};
          memoryStore[col].set(docId, { ...existing, id: docId, ...data });
        }
        return true;
      }
      const CHUNK_SIZE = 490;
      try {
        for (let i = 0; i < fsItems.length; i += CHUNK_SIZE) {
          const chunk = fsItems.slice(i, i + CHUNK_SIZE);
          const batch = db.batch();
          for (const [col, docId, data] of chunk) {
            const ref = db.collection(col).doc(docId);
            batch.set(ref, data, { merge: true });
          }
          await batch.commit();
        }
        return true;
      } catch (e) {
        console.error('Error batchSetMulti in Firestore:', e.message);
        for (const [col, docId, data] of fsItems) {
          if (!memoryStore[col]) memoryStore[col] = new Map();
          const existing = memoryStore[col].get(docId) || {};
          memoryStore[col].set(docId, { ...existing, id: docId, ...data });
        }
        return true;
      }
    }
    return true;
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
