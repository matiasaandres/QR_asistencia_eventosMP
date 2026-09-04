import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const STORAGE_KEY_FIREBASE = 'mundopalabra_firebase_config';

export function getSavedFirebaseConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FIREBASE);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
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
      cachedDb = getFirestore(cachedApp);
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
