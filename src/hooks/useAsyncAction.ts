import { useCallback, useRef, useState } from 'react';
import { trackEvent } from '../telemetry';

interface UseAsyncActionOptions {
  /** Telemetry event name on success (omit to skip). */
  successEvent?: string;
  /** Telemetry event name on failure (omit to skip). */
  failureEvent?: string;
  /** Extra payload merged into telemetry events. */
  telemetryPayload?: Record<string, string | number | boolean | null>;
}

interface UseAsyncActionReturn<TArgs extends unknown[], TResult> {
  /** Whether the action is currently in-flight. */
  busy: boolean;
  /** Last error message from a failed action, or null. */
  error: string | null;
  /** Clear the current error manually. */
  clearError: () => void;
  /** Execute the async action. Re-entrant calls are ignored while busy. */
  run: (...args: TArgs) => Promise<TResult | undefined>;
}

/**
 * Generic wrapper for async service calls that handles:
 * - busy guard (prevents re-entrant calls)
 * - error capture (`err.message` or fallback)
 * - optional telemetry on success / failure
 *
 * Replaces 15+ duplicated try/catch/finally patterns across the social tab.
 */
export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  options: UseAsyncActionOptions = {},
): UseAsyncActionReturn<TArgs, TResult> {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const clearError = useCallback(() => setError(null), []);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      if (inFlightRef.current) return undefined;
      inFlightRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await action(...args);
        if (options.successEvent) {
          void trackEvent(options.successEvent, options.telemetryPayload ?? {});
        }
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Something went wrong.';
        setError(msg);
        if (options.failureEvent) {
          void trackEvent(options.failureEvent, {
            ...options.telemetryPayload,
            reason: msg.slice(0, 80),
          });
        }
        return undefined;
      } finally {
        inFlightRef.current = false;
        setBusy(false);
      }
    },
    [action, options.successEvent, options.failureEvent, options.telemetryPayload],
  );

  return { busy, error, clearError, run };
}
