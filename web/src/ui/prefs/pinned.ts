import { SHELF_SLOTS } from '../nav/destinations';
import { DEFAULT_PINNED } from '../nav/registry';
import type { PreferenceStore } from './store';

/**
 * Which destinations the player keeps on the shelf.
 *
 * The shelf has three slots and the game has fifty destinations, so which
 * three is the one navigation decision worth remembering. `DEFAULT_PINNED` is
 * only a starting point; from here it is a preference, and `shelfLayout`
 * already fills any slot the preference leaves empty from registry order.
 *
 * The whole module is defensive on purpose. This value is read from storage a
 * determined player can edit by hand, written by a version of the game that
 * may name destinations this one has dropped, and kept somewhere that is
 * allowed to throw on both read and write.
 */

export const PINNED_KEY = 'simplyidle.shelf.pinned';

/**
 * The usable ids in `raw`, in order, deduped, capped at the shelf's size.
 *
 * Returns an empty list rather than throwing, for every shape of rubbish.
 * A partly usable list keeps the part it can use: dropping a renamed
 * destination should cost that slot, not the whole preference.
 */
export function parsePinned(raw: unknown, knownIds: ReadonlySet<string>): string[] {
  if (!Array.isArray(raw)) return [];
  const pinned: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    if (!knownIds.has(entry) || pinned.includes(entry)) continue;
    pinned.push(entry);
    if (pinned.length === SHELF_SLOTS) break;
  }
  return pinned;
}

/** The stored preference, or the default when there is nothing usable. */
export function loadPinned(store: PreferenceStore, knownIds: ReadonlySet<string>): string[] {
  const parsed = parsePinned(readJson(store, PINNED_KEY), knownIds);
  return parsed.length > 0 ? parsed : [...DEFAULT_PINNED];
}

export function savePinned(store: PreferenceStore, ids: readonly string[]): void {
  try {
    store.write(PINNED_KEY, JSON.stringify([...ids].slice(0, SHELF_SLOTS)));
  } catch {
    // A preference that cannot be saved is a preference that lasts one
    // session. That is a worse game, not a broken one.
  }
}

/**
 * Pins or unpins, returning a new list.
 *
 * A fourth pin pushes the oldest off rather than being refused. Refusing
 * would mean the player has to unpin before they can pin, for a reason the
 * shelf gives them no way to see.
 */
export function togglePin(current: readonly string[], id: string): string[] {
  if (current.includes(id)) return current.filter(pinned => pinned !== id);
  return [...current, id].slice(-SHELF_SLOTS);
}

function readJson(store: PreferenceStore, key: string): unknown {
  try {
    const raw = store.read(key);
    if (raw === null) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
