/**
 * PostgreSQL connection (Google Cloud SQL).
 *
 * Data model: a single JSONB document table that mirrors Firestore's
 * collection/document structure — keeps the existing route code unchanged
 * while persisting everything in Postgres.
 *
 *   documents(collection TEXT, id TEXT, data JSONB, created_at, updated_at)
 *
 * Connection:
 *   - Production (Cloud Run): unix socket /cloudsql/INSTANCE_CONNECTION_NAME
 *   - Local dev: DB_HOST/DB_PORT (e.g. Cloud SQL Auth Proxy on 127.0.0.1:5432)
 */
const { Pool } = require('pg');

let pool = null;
let enabled = false;

function initPostgres() {
  const useP = process.env.DB_USE_POSTGRES === 'true' || !!process.env.DATABASE_URL || !!process.env.INSTANCE_CONNECTION_NAME || !!process.env.DB_HOST;
  if (!useP) {
    console.log('[Postgres] Not configured — falling back to Firestore/memory.');
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  const instanceConn = process.env.INSTANCE_CONNECTION_NAME; // e.g. project:region:instance
  const config = {
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  if (connectionString) {
    config.connectionString = connectionString;
    if (connectionString.includes('sslmode=require') || process.env.DB_SSL === 'true') {
      config.ssl = { rejectUnauthorized: false };
    }
  } else if (instanceConn && process.env.NODE_ENV === 'production') {
    // Cloud Run mounts the Cloud SQL socket here when --add-cloudsql-instances is set
    config.host = `/cloudsql/${instanceConn}`;
    config.user = process.env.DB_USER || 'postgres';
    config.password = process.env.DB_PASSWORD || '';
    config.database = process.env.DB_NAME || 'postgres';
  } else {
    // Local dev or direct connection
    config.host = process.env.DB_HOST || '127.0.0.1';
    config.port = parseInt(process.env.DB_PORT || '5432', 10);
    config.user = process.env.DB_USER || 'postgres';
    config.password = process.env.DB_PASSWORD || '';
    config.database = process.env.DB_NAME || 'postgres';
    if (process.env.DB_SSL === 'true') config.ssl = { rejectUnauthorized: false };
  }

  try {
    pool = new Pool(config);
    enabled = true;
    pool.on('error', (err) => console.error('[Postgres] Idle client error:', err.message));
    console.log('[Postgres] Pool created. Host:', config.host, 'DB:', config.database);
  } catch (e) {
    console.error('[Postgres] Failed to create pool:', e.message);
    enabled = false;
  }
}

async function initSchema() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        collection TEXT NOT NULL,
        id         TEXT NOT NULL,
        data       JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection);
      CREATE INDEX IF NOT EXISTS idx_documents_data_gin ON documents USING GIN (data jsonb_path_ops);
    `);
    console.log('[Postgres] Schema ready.');
  } catch (e) {
    console.error('[Postgres] Schema init failed:', e.message);
  }
}

initPostgres();

module.exports = {
  getPool: () => pool,
  pgEnabled: () => enabled,
  initSchema,
};
