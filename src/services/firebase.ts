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

export interface FirebaseConfigDiagnostics {
  appEnv: string;
  missingRequired: string[];
}

function selectedAppEnv(): string {
  const appEnv = (process.env.EXPO_PUBLIC_APP_ENV ?? 'dev').toLowerCase();
  return appEnv === 'staging' || appEnv === 'prod' ? appEnv : 'dev';
}

interface FirebaseConfigValues {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
}

function readStaticFirebaseVars(): {
  base: FirebaseConfigValues;
  staging: FirebaseConfigValues;
  prod: FirebaseConfigValues;
} {
  const base: FirebaseConfigValues = {
    apiKey: (process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '').trim(),
    authDomain: (process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '').trim(),
    projectId: (process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '').trim(),
    storageBucket: (process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '').trim(),
    messagingSenderId: (process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '').trim(),
    appId: (process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '').trim(),
    measurementId: (process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? '').trim(),
  };

  const staging: FirebaseConfigValues = {
    apiKey: (process.env.EXPO_PUBLIC_FIREBASE_API_KEY_STAGING ?? '').trim(),
    authDomain: (process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN_STAGING ?? '').trim(),
    projectId: (process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID_STAGING ?? '').trim(),
    storageBucket: (process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET_STAGING ?? '').trim(),
    messagingSenderId: (process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID_STAGING ?? '').trim(),
    appId: (process.env.EXPO_PUBLIC_FIREBASE_APP_ID_STAGING ?? '').trim(),
    measurementId: (process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID_STAGING ?? '').trim(),
  };

  const prod: FirebaseConfigValues = {
    apiKey: (process.env.EXPO_PUBLIC_FIREBASE_API_KEY_PROD ?? '').trim(),
    authDomain: (process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN_PROD ?? '').trim(),
    projectId: (process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID_PROD ?? '').trim(),
    storageBucket: (process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET_PROD ?? '').trim(),
    messagingSenderId: (process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID_PROD ?? '').trim(),
    appId: (process.env.EXPO_PUBLIC_FIREBASE_APP_ID_PROD ?? '').trim(),
    measurementId: (process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID_PROD ?? '').trim(),
  };

  return { base, staging, prod };
}

function preferNonEmpty(preferred: string, fallback: string): string {
  return preferred || fallback;
}

function readConfig() {
  const env = selectedAppEnv();
  const vars = readStaticFirebaseVars();
  const scoped = env === 'staging' ? vars.staging : env === 'prod' ? vars.prod : vars.base;

  return {
    apiKey: preferNonEmpty(scoped.apiKey, vars.base.apiKey),
    authDomain: preferNonEmpty(scoped.authDomain, vars.base.authDomain),
    projectId: preferNonEmpty(scoped.projectId, vars.base.projectId),
    storageBucket: preferNonEmpty(scoped.storageBucket, vars.base.storageBucket),
    messagingSenderId: preferNonEmpty(scoped.messagingSenderId, vars.base.messagingSenderId),
    appId: preferNonEmpty(scoped.appId, vars.base.appId),
    measurementId: preferNonEmpty(scoped.measurementId, vars.base.measurementId),
  };
}

export function getFirebaseConfigDiagnostics(): FirebaseConfigDiagnostics {
  const cfg = readConfig();
  const missingRequired: string[] = [];

  if (!cfg.apiKey) missingRequired.push('EXPO_PUBLIC_FIREBASE_API_KEY');
  if (!cfg.projectId) missingRequired.push('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  if (!cfg.appId) missingRequired.push('EXPO_PUBLIC_FIREBASE_APP_ID');

  return {
    appEnv: selectedAppEnv(),
    missingRequired,
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
