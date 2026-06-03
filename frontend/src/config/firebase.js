import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase Web SDK config — these are PUBLIC client keys (NOT secrets).
// They only identify the Firebase project; real security is enforced by
// Firebase Security Rules. Hardcoded so the production bundle always works.
const firebaseConfig = {
  apiKey:            "AIzaSyAgrDquv5-Rw6JAxFpzGnnGxCHfMhpMHdg",
  authDomain:        "consignment-packing-app.firebaseapp.com",
  projectId:         "consignment-packing-app",
  storageBucket:     "consignment-packing-app.firebasestorage.app",
  messagingSenderId: "421273083514",
  appId:             "1:421273083514:web:db136d87850397985725c3",
  measurementId:     "G-KEKJSPSD43"
};

const app = initializeApp(firebaseConfig);
export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);
export default app;
