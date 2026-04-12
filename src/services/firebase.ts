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

function readEnvVar(baseKey: string, env: string): string {
  const normalized = env.toUpperCase();
  const envSpecific = process.env[`EXPO_PUBLIC_FIREBASE_${baseKey}_${normalized}` as keyof NodeJS.ProcessEnv];
  const fallback = process.env[`EXPO_PUBLIC_FIREBASE_${baseKey}` as keyof NodeJS.ProcessEnv];
  return (envSpecific ?? fallback ?? '').trim();
}

function readConfig() {
  const appEnv = (process.env.EXPO_PUBLIC_APP_ENV ?? 'dev').toLowerCase();
  const env = appEnv === 'staging' || appEnv === 'prod' ? appEnv : 'dev';

  return {
    apiKey: readEnvVar('API_KEY', env),
    authDomain: readEnvVar('AUTH_DOMAIN', env),
    projectId: readEnvVar('PROJECT_ID', env),
    storageBucket: readEnvVar('STORAGE_BUCKET', env),
    messagingSenderId: readEnvVar('MESSAGING_SENDER_ID', env),
    appId: readEnvVar('APP_ID', env),
    measurementId: readEnvVar('MEASUREMENT_ID', env),
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

export function logFirebaseEvent(name: string, params?: Record<string, string | number | boolean | null>): void {
  if (!cachedAnalytics) return;
  try {
    logEvent(cachedAnalytics, name, params ?? {});
  } catch {
    // Analytics must never block gameplay.
  }
}
