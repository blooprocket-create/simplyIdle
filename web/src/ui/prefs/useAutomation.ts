import { useCallback, useMemo, useRef, useState } from 'react';
import type { AutomationId } from '../../content/automation';
import { loadAutomation, saveAutomation, toggleAutomation } from './automation';
import { browserStore, type PreferenceStore } from './store';

/**
 * Which automations the player has switched on, as React state.
 *
 * `earned` is passed in rather than computed here because it moves with the
 * fight — the five-hundredth kill can land mid-session — and this hook has no
 * business holding a snapshot. Anything stored but no longer earned is
 * filtered out on read, so a benefit cannot survive the thing that granted it.
 */
export function useAutomation(earned: ReadonlySet<AutomationId>, store?: PreferenceStore) {
  const held = useRef<PreferenceStore | null>(null);
  const resolved = (): PreferenceStore => (held.current ??= store ?? browserStore());

  const [enabled, setEnabled] = useState<readonly AutomationId[]>(() => loadAutomation(resolved(), earned));

  const toggle = useCallback((id: AutomationId) => {
    setEnabled(current => {
      const next = toggleAutomation(current, id);
      saveAutomation(resolved(), next);
      return next;
    });
    // `resolved` reads a ref; `earned` is only consulted on mount. Stable for
    // the component's life, so nothing re-renders on identity alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An automation stays off unless it is both earned and switched on. The
  // filter is here as well as on load because `earned` changes while playing.
  const active = useMemo(() => new Set(enabled.filter(id => earned.has(id))), [enabled, earned]);

  return useMemo(() => ({ enabled, active, toggle }), [enabled, active, toggle]);
}
