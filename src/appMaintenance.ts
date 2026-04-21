import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from './services/firebase';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

const DEFAULT_ENABLED = false;
const DEFAULT_CTA_LABEL = 'DOWN FOR MAINTENANCE';
const DEFAULT_A11Y_LABEL = 'Game is down for maintenance';
const DEFAULT_MESSAGE = 'Simply Idle is currently down for maintenance. Please check back soon.';
const MAINTENANCE_COLLECTION = 'publicRuntime';
const MAINTENANCE_DOC_ID = 'appMaintenance';

export interface AppMaintenanceConfig {
  enabled: boolean;
  ctaLabel: string;
  a11yLabel: string;
  message: string;
}

interface AppMaintenanceDocRecord {
  enabled?: unknown;
  ctaLabel?: unknown;
  a11yLabel?: unknown;
  message?: unknown;
}

function readBooleanEnv(value: string | undefined): boolean | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return null;
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

const envEnabled = readBooleanEnv(process.env.EXPO_PUBLIC_GAME_MAINTENANCE_MODE);
const envMessage = readOptionalString(process.env.EXPO_PUBLIC_GAME_MAINTENANCE_MESSAGE);

export const APP_MAINTENANCE_DOC_PATH = `${MAINTENANCE_COLLECTION}/${MAINTENANCE_DOC_ID}`;

export const APP_MAINTENANCE: AppMaintenanceConfig = Object.freeze({
  // Flip this to true for a hard maintenance lock, or set EXPO_PUBLIC_GAME_MAINTENANCE_MODE=true.
  enabled: envEnabled ?? DEFAULT_ENABLED,
  ctaLabel: DEFAULT_CTA_LABEL,
  a11yLabel: DEFAULT_A11Y_LABEL,
  message: envMessage ?? DEFAULT_MESSAGE,
});

function mergeAppMaintenanceConfig(record?: AppMaintenanceDocRecord | null): AppMaintenanceConfig {
  const remoteEnabled = typeof record?.enabled === 'boolean' ? record.enabled : false;
  const remoteCtaLabel = readOptionalString(record?.ctaLabel);
  const remoteA11yLabel = readOptionalString(record?.a11yLabel);
  const remoteMessage = readOptionalString(record?.message);
  const localOverrideEnabled = APP_MAINTENANCE.enabled;

  return {
    enabled: localOverrideEnabled || remoteEnabled,
    ctaLabel: remoteCtaLabel ?? APP_MAINTENANCE.ctaLabel,
    a11yLabel: remoteA11yLabel ?? APP_MAINTENANCE.a11yLabel,
    message: localOverrideEnabled ? APP_MAINTENANCE.message : (remoteMessage ?? APP_MAINTENANCE.message),
  };
}

function getAppMaintenanceRef() {
  const db = getFirebaseFirestore();
  if (!db) return null;
  return doc(db, MAINTENANCE_COLLECTION, MAINTENANCE_DOC_ID);
}

export async function loadAppMaintenanceConfig(): Promise<AppMaintenanceConfig> {
  const maintenanceRef = getAppMaintenanceRef();
  if (!maintenanceRef) return APP_MAINTENANCE;

  try {
    const maintenanceSnap = await getDoc(maintenanceRef);
    return mergeAppMaintenanceConfig(
      maintenanceSnap.exists() ? (maintenanceSnap.data() as AppMaintenanceDocRecord) : null,
    );
  } catch {
    return APP_MAINTENANCE;
  }
}

export function subscribeToAppMaintenance(onChange: (config: AppMaintenanceConfig) => void): () => void {
  const maintenanceRef = getAppMaintenanceRef();
  if (!maintenanceRef) return () => {};

  return onSnapshot(
    maintenanceRef,
    maintenanceSnap => {
      onChange(
        mergeAppMaintenanceConfig(
          maintenanceSnap.exists() ? (maintenanceSnap.data() as AppMaintenanceDocRecord) : null,
        ),
      );
    },
    () => {
      onChange(APP_MAINTENANCE);
    },
  );
}
