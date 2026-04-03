import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Analytics, getAnalytics, isSupported, logEvent } from 'firebase/analytics';
import { Auth, browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;
let cachedAnalytics: Analytics | null = null;
let authPersistenceInitialized = false;

// Firebase config provided for SimplyIdle. Expo public env vars still override these.
const FALLBACK_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDjwMjg48BJqmvrDhgMv7cN0WxZcWG5354',
  authDomain: 'simplyidle-43c81.firebaseapp.com',
  projectId: 'simplyidle-43c81',
  storageBucket: 'simplyidle-43c81.firebasestorage.app',
  messagingSenderId: '619374758999',
  appId: '1:619374758999:web:17ca191d4fb3c42a3da712',
  measurementId: 'G-4TE7VYCSNK',
} as const;

function readConfig() {
  return {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || FALLBACK_FIREBASE_CONFIG.apiKey,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || FALLBACK_FIREBASE_CONFIG.authDomain,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || FALLBACK_FIREBASE_CONFIG.projectId,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || FALLBACK_FIREBASE_CONFIG.storageBucket,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || FALLBACK_FIREBASE_CONFIG.messagingSenderId,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || FALLBACK_FIREBASE_CONFIG.appId,
    measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || FALLBACK_FIREBASE_CONFIG.measurementId,
  };
}

export function isFirebaseConfigured(): boolean {
  const cfg = readConfig();
  return !!cfg.apiKey && !!cfg.projectId && !!cfg.appId;
}

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (cachedApp) return cachedApp;

  cachedApp = getApps().length > 0 ? getApp() : initializeApp(readConfig());
  return cachedApp;
}

export function getFirebaseAuth(): Auth | null {
  if (cachedAuth) return cachedAuth;
  const app = getFirebaseApp();
  if (!app) return null;
  cachedAuth = getAuth(app);

  if (Platform.OS === 'web' && !authPersistenceInitialized) {
    authPersistenceInitialized = true;
    void setPersistence(cachedAuth, browserLocalPersistence).catch(() => {
      // Persistence fallback is handled by Firebase defaults if this fails.
    });
  }

  return cachedAuth;
}

export function getFirebaseFirestore(): Firestore | null {
  if (cachedDb) return cachedDb;
  const app = getFirebaseApp();
  if (!app) return null;
  cachedDb = getFirestore(app);
  return cachedDb;
}

/**
 * Returns the Analytics instance if supported (web only).
 * Resolves asynchronously; call once on app boot.
 */
export async function initFirebaseAnalytics(): Promise<Analytics | null> {
  if (cachedAnalytics) return cachedAnalytics;
  if (Platform.OS !== 'web') return null;

  const app = getFirebaseApp();
  if (!app) return null;

  const cfg = readConfig();
  if (!cfg.measurementId) return null;

  try {
    const supported = await isSupported();
    if (!supported) return null;
    cachedAnalytics = getAnalytics(app);
    return cachedAnalytics;
  } catch {
    return null;
  }
}

export function logFirebaseEvent(
  name: string,
  params?: Record<string, string | number | boolean | null>,
): void {
  if (!cachedAnalytics) return;
  try {
    logEvent(cachedAnalytics, name, params ?? {});
  } catch {
    // Analytics must never block gameplay.
  }
}
