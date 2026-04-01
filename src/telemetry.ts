import AsyncStorage from '@react-native-async-storage/async-storage';
import { customEvent, identifyDevice, vexo } from 'vexo-analytics';

const TELEMETRY_KEY = 'simplyidle_telemetry_v1';
const TELEMETRY_CAP = 800;
const VEXO_API_KEY = 'f974be1c-5121-4b5c-82f9-799a07387574';

let vexoInitialized = false;

export interface TelemetryEvent {
  name: string;
  ts: number;
  payload?: Record<string, string | number | boolean | null>;
}

export function initTelemetry(): void {
  if (vexoInitialized) return;

  try {
    vexo(VEXO_API_KEY);
    vexoInitialized = true;
  } catch {
    // Analytics must never block app startup.
  }
}

export async function identifyTelemetryDevice(deviceId: string | null): Promise<void> {
  try {
    initTelemetry();
    await identifyDevice(deviceId);
  } catch {
    // Analytics must never block auth or gameplay.
  }
}

export async function trackEvent(
  name: string,
  payload?: Record<string, string | number | boolean | null>,
): Promise<void> {
  try {
    initTelemetry();
    customEvent(name, payload ?? {});

    const raw = await AsyncStorage.getItem(TELEMETRY_KEY);
    const events: TelemetryEvent[] = raw ? JSON.parse(raw) as TelemetryEvent[] : [];
    const next: TelemetryEvent = { name, ts: Date.now(), payload };
    const merged = [...events, next].slice(-TELEMETRY_CAP);
    await AsyncStorage.setItem(TELEMETRY_KEY, JSON.stringify(merged));
  } catch {
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
  } catch {
    // No-op.
  }
}
