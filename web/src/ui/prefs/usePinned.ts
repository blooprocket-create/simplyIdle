import { useCallback, useMemo, useRef, useState } from 'react';
import { loadPinned, savePinned, togglePin } from './pinned';
import { browserStore, type PreferenceStore } from './store';

/**
 * The shelf preference, as React state backed by storage.
 *
 * Read once on mount rather than on every render: the value only changes
 * through `toggle`, and re-reading storage each frame would be sixty parses a
 * second of a value nothing else writes. The store is a parameter so a test
 * can hand in one that throws.
 */
export function usePinned(knownIds: ReadonlySet<string>, store?: PreferenceStore) {
  // `browserStore()` touches `localStorage`, which can throw, so it is called
  // inside the lazy initialiser and kept rather than called again.
  const held = useRef<PreferenceStore | null>(null);
  const resolved = (): PreferenceStore => (held.current ??= store ?? browserStore());

  const [pinnedIds, setPinnedIds] = useState<readonly string[]>(() => loadPinned(resolved(), knownIds));

  const toggle = useCallback((id: string) => {
    setPinnedIds(current => {
      const next = togglePin(current, id);
      savePinned(resolved(), next);
      return next;
    });
    // `resolved` reads a ref and `knownIds` is only used on mount, so this is
    // stable for the life of the component and the shelf never re-renders
    // because the callback changed identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useMemo(() => ({ pinnedIds, toggle }), [pinnedIds, toggle]);
}
