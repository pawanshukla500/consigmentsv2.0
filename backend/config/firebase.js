const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let db = null;
let bucket = null;
let storage = null;
let firebaseInitialized = false;

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');

function validateServiceAccount(key) {
  return (
    key &&
    typeof key === 'object' &&
    key.type === 'service_account' &&
    key.project_id &&
    key.private_key &&
    key.private_key.includes('BEGIN PRIVATE KEY') &&
    key.client_email
  );
}

function loadServiceAccount() {
  try {
    // Check for inline JSON environment variable
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      try {
        const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        if (validateServiceAccount(key)) {
          return admin.credential.cert(key);
        }
      } catch (e) {
        console.warn('[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
      }
    }

    // Check for env-specified credentials file
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const credPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      if (fs.existsSync(credPath)) {
        const raw = fs.readFileSync(credPath, 'utf8');
        const key = JSON.parse(raw);
        if (validateServiceAccount(key)) {
          return admin.credential.cert(credPath);
        }
      }
    }

    // Check for default service account key
    if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
      const raw = fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8');
      const key = JSON.parse(raw);
      if (validateServiceAccount(key)) {
        return admin.credential.cert(SERVICE_ACCOUNT_PATH);
      }
    }

    return null;
  } catch (error) {
    console.warn('[Firebase] Error loading service account:', error.message);
    return null;
  }
}

function shouldInitializeFirebase() {
  // If we have valid service account credentials, yes
  const credential = loadServiceAccount();
  if (credential) return { credential, reason: 'service_account' };

  // If running in GCP environment
  if (process.env.K_SERVICE || process.env.GOOGLE_CLOUD_PROJECT) {
    return { credential: null, reason: 'gcp_environment' };
  }

  // If emulator is configured
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return { credential: null, reason: 'emulator' };
  }

  return null;
}

function initializeFirebase() {
  if (admin.apps.length) return;

  const initConfig = shouldInitializeFirebase();
  if (!initConfig) {
    console.log('[Firebase] No valid credentials found. Running in local-only mode.');
    console.log('[Firebase] To enable Firebase:');
    console.log('  1. Go to Firebase Console > Project Settings > Service Accounts');
    console.log('  2. Click "Generate new private key"');
    console.log('  3. Save the JSON file as backend/serviceAccountKey.json');
    return;
  }

  try {
    const config = {
      projectId: process.env.FIREBASE_PROJECT_ID || 'consignment-packing-app',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'consignment-packing-app.firebasestorage.app'
    };

    if (initConfig.credential) {
      config.credential = initConfig.credential;
    }

    admin.initializeApp(config);
    db = admin.firestore();
    storage = admin.storage();
    bucket = storage.bucket();
    firebaseInitialized = true;

    console.log('[Firebase] Initialized successfully');
    console.log('[Firebase] Project:', config.projectId);
    console.log('[Firebase] Storage:', config.storageBucket);
    console.log('[Firebase] Auth method:', initConfig.reason);
  } catch (error) {
    console.error('[Firebase] Initialization failed:', error.message);
    console.log('[Firebase] Falling back to local-only mode.');
  }
}

initializeFirebase();

module.exports = { admin, db, bucket, firebaseInitialized };
