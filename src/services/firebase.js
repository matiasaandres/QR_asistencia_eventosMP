import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';

const STORAGE_KEY_FIREBASE = 'mundopalabra_firebase_config';
// Firebase web configuration is a public client identifier (not a server
// credential). Keeping it here ensures every Vercel device uses the same DB,
// even when deployment environment variables have not been configured yet.
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCy3DmCUQWgtR4hR-q4DlH9kzZBRf6OUmU',
  authDomain: 'mundopalabra-acceso.firebaseapp.com',
  projectId: 'mundopalabra-acceso',
  storageBucket: 'mundopalabra-acceso.firebasestorage.app',
  messagingSenderId: '609103289658',
  appId: '1:609103289658:web:e213924bdd24ac4a72c403'
};

export function getSavedFirebaseConfig() {
  const envConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };

  // A deployment-level config guarantees that every phone uses the same DB.
  if (envConfig.apiKey && envConfig.projectId && envConfig.appId) {
    return Object.fromEntries(
      Object.entries(envConfig).filter(([, value]) => Boolean(value))
    );
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_FIREBASE);
    if (!raw) return DEFAULT_FIREBASE_CONFIG;
    return JSON.parse(raw);
  } catch (e) {
    return DEFAULT_FIREBASE_CONFIG;
  }
}

export function saveFirebaseConfig(config) {
  if (!config) {
    localStorage.removeItem(STORAGE_KEY_FIREBASE);
  } else {
    localStorage.setItem(STORAGE_KEY_FIREBASE, JSON.stringify(config));
  }
}

let cachedDb = null;
let cachedApp = null;

export function initFirebase() {
  const config = getSavedFirebaseConfig();
  if (!config || !config.apiKey || !config.projectId) {
    return { app: null, db: null, isConfigured: false };
  }

  try {
    if (!cachedApp) {
      const existing = getApps();
      cachedApp = existing.length > 0 ? getApp() : initializeApp(config);
    }
    if (!cachedDb && cachedApp) {
      try {
        cachedDb = initializeFirestore(cachedApp, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
          })
        });
      } catch (persistenceError) {
        // IndexedDB can be unavailable in private mode. Firestore still works
        // online, only without its durable offline cache.
        cachedDb = getFirestore(cachedApp);
      }
    }
    return { app: cachedApp, db: cachedDb, isConfigured: true };
  } catch (err) {
    console.warn("Firebase initialization warning:", err);
    return { app: null, db: null, isConfigured: false, error: err.message };
  }
}

export function resetFirebase() {
  cachedDb = null;
  cachedApp = null;
}
