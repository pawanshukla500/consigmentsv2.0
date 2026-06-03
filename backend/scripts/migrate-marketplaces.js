const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');

let credential = null;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  credential = admin.credential.cert(process.env.GOOGLE_APPLICATION_CREDENTIALS);
} else if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  credential = admin.credential.cert(SERVICE_ACCOUNT_PATH);
}

if (!credential) {
  console.error('No Firebase service account found.');
  process.exit(1);
}

admin.initializeApp({ credential, storageBucket: 'consignment-packing-app.firebasestorage.app' });
const db = admin.firestore();

async function migrate() {
  const snapshot = await db.collection('marketplaces').get();
  console.log(`Found ${snapshot.size} marketplaces`);

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const name = (data.name || '').toLowerCase();
    let warehouses = data.warehouses || [];
    let updated = false;

    if (name.includes('amazon')) {
      if (!warehouses.includes('ISK3')) {
        warehouses.push('ISK3');
        updated = true;
        console.log(`Adding ISK3 to Amazon (${doc.id})`);
      }
    }
    if (name.includes('cocoblu') || name.includes('cocoblue')) {
      if (!warehouses.includes('ISK3')) {
        warehouses.push('ISK3');
        updated = true;
        console.log(`Adding ISK3 to Cocoblu (${doc.id})`);
      }
    }

    if (updated) {
      await doc.ref.update({ warehouses, updatedAt: new Date().toISOString() });
      console.log(`Updated ${data.name}`);
    } else {
      console.log(`Skipped ${data.name} — already has warehouses: ${JSON.stringify(data.warehouses || [])}`);
    }
  }

  console.log('Migration complete.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
