import { Platform } from 'react-native';
import { initFirebaseAnalytics, logFirebaseEvent } from './services/firebase';

let firebaseInitialized = false;
let telemetryBootstrapSent = false;
const DEBUG_LOGS_ENABLED = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
const gameplayThrottleMsByEvent = new Map<string, number>();

export interface TelemetryEvent {
  name: string;
  ts: number;
  payload?: Record<string, string | number | boolean | null>;
}

export function initTelemetry(): void {
  if (firebaseInitialized) return;

  try {
    void initFirebaseAnalytics();
    firebaseInitialized = true;
    debugLog('telemetry', 'Firebase Analytics initialized');

    if (!telemetryBootstrapSent) {
      telemetryBootstrapSent = true;
      logFirebaseEvent('telemetry_initialized', { source: 'initTelemetry' });
    }
  } catch {
    debugLog('telemetry', 'Firebase Analytics initialization failed');
    // Analytics must never block app startup.
  }
}

export async function identifyTelemetryDevice(deviceId: string | null): Promise<void> {
  try {
    initTelemetry();
    debugLog('telemetry', 'identifyDevice', { hasDeviceId: !!deviceId });
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
    logFirebaseEvent(name, payload);
  } catch {
    debugLog('telemetry', 'trackEvent failed', { name });
    // Telemetry must never block gameplay.
  }
}

export async function getTelemetryEvents(): Promise<TelemetryEvent[]> {
  try {
      return [];
  } catch {
    return [];
  }
}

export async function clearTelemetryEvents(): Promise<void> {
  try {
    debugLog('telemetry', 'local telemetry cleared');
  } catch {
    // No-op.
  }
}

export function getTelemetryDebugInfo(): {
  firebaseInitialized: boolean;
  telemetryBootstrapSent: boolean;
} {
  return {
    firebaseInitialized,
    telemetryBootstrapSent,
  };
}

export async function trackTelemetryHeartbeat(source: string): Promise<void> {
  await trackEvent('telemetry_heartbeat', {
    source,
    platform: Platform.OS,
    firebaseInitialized,
    telemetryBootstrapSent,
  });
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

/**
 * Report a caught error for crash-reporting purposes.
 * Uses Firebase Analytics as the transport until a dedicated service
 * (Sentry / Crashlytics) is integrated.
 */
export function reportCrash(
  error: Error,
  context?: { label?: string; componentStack?: string },
): void {
  const message = error.message?.slice(0, 200) ?? 'Unknown error';
  const stack = (error.stack ?? '').slice(0, 500);
  debugLog('crash', message, { stack, ...context });
  void trackEvent('app_crash', {
    message,
    stack: stack.slice(0, 200),
    label: context?.label ?? 'unknown',
    platform: Platform.OS,
  });
}
