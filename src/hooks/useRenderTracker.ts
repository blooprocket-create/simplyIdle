import { useEffect, useRef } from 'react';
import { debugLog } from '../telemetry';

/**
 * Tracks render count and flags excessive re-renders during development.
 * No-ops in production — zero overhead.
 *
 * Usage: useRenderTracker('GameScreen');
 */
export function useRenderTracker(label: string, warnThreshold = 60): void {
  const countRef = useRef(0);
  const windowStartRef = useRef(Date.now());

  if (typeof __DEV__ === 'undefined' || !__DEV__) return;

  countRef.current += 1;

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() - windowStartRef.current) / 1000;
      const rps = countRef.current / Math.max(elapsed, 1);
      if (countRef.current > warnThreshold) {
        debugLog('perf', `⚠️ ${label}: ${countRef.current} renders in ${elapsed.toFixed(1)}s (${rps.toFixed(1)} r/s)`);
      }
      countRef.current = 0;
      windowStartRef.current = Date.now();
    }, 10_000);

    return () => clearInterval(interval);
  }, [label, warnThreshold]);
}

/**
 * Measures execution time of a block and logs if it exceeds the threshold.
 * Usage: const end = perfMark('reducer'); ... end();
 */
export function perfMark(label: string, warnMs = 16): () => void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return () => {};
  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    if (duration > warnMs) {
      debugLog('perf', `⚠️ ${label} took ${duration.toFixed(1)}ms (threshold: ${warnMs}ms)`);
    }
  };
}
