import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache
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

export function parseFirebaseConfig(value) {
  let normalized = String(value || '').trim();
  normalized = normalized.replace(/^const\s+firebaseConfig\s*=\s*/, '').replace(/;\s*$/, '').trim();
  if (!normalized) throw new Error('La configuración está vacía.');

  let config;
  try {
    config = JSON.parse(normalized);
  } catch {
    // Firebase muestra su configuración como un objeto JavaScript. Convertimos
    // únicamente esa sintaxis simple a JSON, sin ejecutar el texto pegado.
    const jsonLike = normalized
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, content) => JSON.stringify(content.replace(/\\'/g, "'")));
    config = JSON.parse(jsonLike);
  }

  if (!config || Array.isArray(config) || typeof config !== 'object') {
    throw new Error('La configuración debe ser un objeto JSON.');
  }
  const allowedKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
  const sanitized = Object.fromEntries(allowedKeys
    .filter((key) => typeof config[key] === 'string' && config[key].trim())
    .map((key) => [key, config[key].trim()]));
  if (!sanitized.apiKey || !sanitized.projectId || !sanitized.appId) {
    throw new Error("La configuración debe contener 'apiKey', 'projectId' y 'appId'.");
  }
  return sanitized;
}

export function clearSensitiveLocalData() {
  if (typeof localStorage === 'undefined') return;
  const removable = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith('mp_')) removable.push(key);
  }
  removable.forEach((key) => localStorage.removeItem(key));
}

let cachedDb = null;
let cachedApp = null;
let cachedAppCheck = null;

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
    const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;
    if (!cachedAppCheck && appCheckSiteKey && typeof window !== 'undefined') {
      try {
        cachedAppCheck = initializeAppCheck(cachedApp, {
          provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
          isTokenAutoRefreshEnabled: true
        });
      } catch (appCheckError) {
        console.warn('Firebase App Check no pudo inicializarse:', appCheckError);
      }
    }
    if (!cachedDb && cachedApp) {
      try {
        // Los equipos de portería suelen ser compartidos. La caché en memoria
        // evita dejar nóminas e historiales persistidos entre sesiones.
        cachedDb = initializeFirestore(cachedApp, { localCache: memoryLocalCache() });
      } catch {
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
  cachedAppCheck = null;
}
