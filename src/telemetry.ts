import AsyncStorage from '@react-native-async-storage/async-storage';

const TELEMETRY_KEY = 'simplyidle_telemetry_v1';
const TELEMETRY_CAP = 800;

export interface TelemetryEvent {
  name: string;
  ts: number;
  payload?: Record<string, string | number | boolean | null>;
}

export async function trackEvent(
  name: string,
  payload?: Record<string, string | number | boolean | null>,
): Promise<void> {
  try {
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
