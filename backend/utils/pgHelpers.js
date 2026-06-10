/**
 * PostgreSQL-backed implementation of the firestoreHelpers interface.
 * All documents live in the JSONB `documents(collection, id, data)` table.
 * setDocument uses jsonb `||` for shallow-merge (mirrors Firestore { merge: true }).
 */
const { getPool } = require('../config/database');

// Always ensure the doc carries its own id
const withId = (id, data) => ({ ...data, id });

const pgHelpers = {
  async getCollection(collection) {
    const { rows } = await getPool().query(
      'SELECT data FROM documents WHERE collection = $1', [collection]
    );
    return rows.map(r => r.data);
  },

  async getDocument(collection, id) {
    const { rows } = await getPool().query(
      'SELECT data FROM documents WHERE collection = $1 AND id = $2', [collection, id]
    );
    return rows.length ? rows[0].data : null;
  },

  async setDocument(collection, id, data) {
    const docData = withId(id, data);
    // Shallow-merge on conflict (existing.data || new.data → new wins per top-level key)
    const { rows } = await getPool().query(
      `INSERT INTO documents (collection, id, data, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (collection, id)
       DO UPDATE SET data = documents.data || EXCLUDED.data, updated_at = now()
       RETURNING data`,
      [collection, id, JSON.stringify(docData)]
    );
    return rows[0].data;
  },

  async deleteDocument(collection, id) {
    await getPool().query('DELETE FROM documents WHERE collection = $1 AND id = $2', [collection, id]);
    return true;
  },

  async queryCollection(collection, fieldPath, opStr, value) {
    if (opStr === '==') {
      const { rows } = await getPool().query(
        `SELECT data FROM documents WHERE collection = $1 AND data->>$2 = $3`,
        [collection, fieldPath, String(value)]
      );
      return rows.map(r => r.data);
    }
    if (opStr === 'array-contains') {
      const { rows } = await getPool().query(
        `SELECT data FROM documents WHERE collection = $1 AND (data->$2) @> $3::jsonb`,
        [collection, fieldPath, JSON.stringify(value)]
      );
      return rows.map(r => r.data);
    }
    // Fallback: return all
    const { rows } = await getPool().query('SELECT data FROM documents WHERE collection = $1', [collection]);
    return rows.map(r => r.data);
  },

  async batchSet(collection, items) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      for (const [id, data] of items) {
        await client.query(
          `INSERT INTO documents (collection, id, data, updated_at)
           VALUES ($1, $2, $3::jsonb, now())
           ON CONFLICT (collection, id)
           DO UPDATE SET data = documents.data || EXCLUDED.data, updated_at = now()`,
          [collection, id, JSON.stringify(withId(id, data))]
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('[Postgres] batchSet failed:', e.message);
      throw e;
    } finally {
      client.release();
    }
  },

  async batchDelete(collection, ids) {
    if (!ids || ids.length === 0) return true;
    await getPool().query('DELETE FROM documents WHERE collection = $1 AND id = ANY($2)', [collection, ids]);
    return true;
  },

  async batchSetMulti(items) {
    // items = [[collection, id, data], ...]
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      for (const [collection, id, data] of items) {
        await client.query(
          `INSERT INTO documents (collection, id, data, updated_at)
           VALUES ($1, $2, $3::jsonb, now())
           ON CONFLICT (collection, id)
           DO UPDATE SET data = documents.data || EXCLUDED.data, updated_at = now()`,
          [collection, id, JSON.stringify(withId(id, data))]
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('[Postgres] batchSetMulti failed:', e.message);
      throw e;
    } finally {
      client.release();
    }
  },
};

module.exports = pgHelpers;
