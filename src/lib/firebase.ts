import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let isFirebaseConfigured = false;

if (firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY') {
  try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    storage = getStorage(app);
    isFirebaseConfigured = true;
  } catch (e) {
    console.error(
      'Failed to initialize Firebase. Please check your credentials in the .env file.',
      e
    );
  }
} else {
    // Only log this warning on the client-side, as it can be noisy during server-side rendering.
    if (typeof window !== 'undefined') {
        console.warn(
          'Firebase configuration is missing or uses placeholder values. Please update your .env file. Auth and other features will be disabled.'
        );
    }
}

export { app, db, storage, isFirebaseConfigured };
