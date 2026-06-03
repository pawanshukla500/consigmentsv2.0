import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase Web SDK config — these are PUBLIC client keys (not secrets).
// They identify the Firebase project but grant no admin access.
// Security is enforced by Firebase Security Rules on the server.
// Fallback values ensure the app works even if VITE_ env vars are missing at build time.
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || 'AIzaSyAgrDquv5-Rw6JAxFpzGnnGxCHfMhpMHdg',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || 'consignment-packing-app.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || 'consignment-packing-app',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || 'consignment-packing-app.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| '421273083514',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || '1:421273083514:web:db136d87850397985725c3',
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID     || 'G-KEKJSPSD43'
};

const app = initializeApp(firebaseConfig);
export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);
export default app;
