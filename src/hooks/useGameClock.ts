import { useEffect, useRef, useState } from 'react';

/**
 * Centralized 1-second game clock for cooldown UIs.
 *
 * Returns the current `Date.now()` value, updated every second.
 * Only ticks while `active` is true (defaults to true).
 * Replaces scattered `setInterval(..., 1000)` timers in GuildSection
 * that were cascading re-renders through the entire component tree.
 */
export function useGameClock(active = true): number {
  const [now, setNow] = useState(Date.now);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => setNow(Date.now()), 1_000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [active]);

  return now;
}
