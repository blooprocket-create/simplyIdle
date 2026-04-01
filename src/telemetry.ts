import AsyncStorage from '@react-native-async-storage/async-storage';
import { customEvent, identifyDevice, vexo } from 'vexo-analytics';

const TELEMETRY_KEY = 'simplyidle_telemetry_v1';
const TELEMETRY_CAP = 800;
const VEXO_API_KEY = 'f974be1c-5121-4b5c-82f9-799a07387574';

let vexoInitialized = false;
let telemetryBootstrapSent = false;
const DEBUG_LOGS_ENABLED = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
const gameplayThrottleMsByEvent = new Map<string, number>();

export interface TelemetryEvent {
  name: string;
  ts: number;
  payload?: Record<string, string | number | boolean | null>;
}

export function initTelemetry(): void {
  if (vexoInitialized) return;

  try {
    if (!VEXO_API_KEY || VEXO_API_KEY.trim().length < 10) {
      debugLog('telemetry', 'Vexo init skipped: API key missing or invalid');
      return;
    }

    vexo(VEXO_API_KEY);
    vexoInitialized = true;
    debugLog('telemetry', 'Vexo initialized');

    if (!telemetryBootstrapSent) {
      telemetryBootstrapSent = true;
      customEvent('telemetry_initialized', { source: 'initTelemetry' });
    }
  } catch {
    debugLog('telemetry', 'Vexo initialization failed');
    // Analytics must never block app startup.
  }
}

export async function identifyTelemetryDevice(deviceId: string | null): Promise<void> {
  try {
    initTelemetry();
    await identifyDevice(deviceId);
    debugLog('telemetry', 'identifyDevice success', { hasDeviceId: !!deviceId });
  } catch {
    debugLog('telemetry', 'identifyDevice failed', { hasDeviceId: !!deviceId });
    // Analytics must never block auth or gameplay.
  }
}

export async function trackEvent(
  name: string,
  payload?: Record<string, string | number | boolean | null>,
): Promise<void> {
  try {
    initTelemetry();
    debugLog('telemetry', 'trackEvent called', { name });
    customEvent(name, payload ?? {});

    const raw = await AsyncStorage.getItem(TELEMETRY_KEY);
    const events: TelemetryEvent[] = raw ? JSON.parse(raw) as TelemetryEvent[] : [];
    const next: TelemetryEvent = { name, ts: Date.now(), payload };
    const merged = [...events, next].slice(-TELEMETRY_CAP);
    await AsyncStorage.setItem(TELEMETRY_KEY, JSON.stringify(merged));
  } catch {
    debugLog('telemetry', 'trackEvent failed', { name });
    // Telemetry must never block gameplay.
  }
}

export async function getTelemetryEvents(): Promise<TelemetryEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(TELEMETRY_KEY);
    return raw ? JSON.parse(raw) as TelemetryEvent[] : [];
  } catch {
    return [];
  }
}

export async function clearTelemetryEvents(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TELEMETRY_KEY);
    debugLog('telemetry', 'local telemetry cleared');
  } catch {
    // No-op.
  }
}

export function getTelemetryDebugInfo(): {
  vexoInitialized: boolean;
  localKey: string;
  localCap: number;
} {
  return {
    vexoInitialized,
    localKey: TELEMETRY_KEY,
    localCap: TELEMETRY_CAP,
  };
}

export function debugLog(scope: string, message: string, payload?: Record<string, unknown>): void {
  if (!DEBUG_LOGS_ENABLED) return;
  const ts = new Date().toISOString();
  if (payload) {
    // eslint-disable-next-line no-console
    console.log(`[SimplyIdle][${ts}][${scope}] ${message}`, payload);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[SimplyIdle][${ts}][${scope}] ${message}`);
  }
}

export async function trackGameplayAction(
  eventName: string,
  payload?: Record<string, string | number | boolean | null>,
  throttleMs = 0,
): Promise<void> {
  const now = Date.now();
  if (throttleMs > 0) {
    const lastTs = gameplayThrottleMsByEvent.get(eventName) ?? 0;
    if (now - lastTs < throttleMs) return;
    gameplayThrottleMsByEvent.set(eventName, now);
  }
  await trackEvent(eventName, payload);
}
