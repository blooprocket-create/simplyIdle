import { getUsableItem } from '../../content/usableItems';

/**
 * How many of each usable item the account holds.
 *
 * Claimed out of the `legacy` bag by the phase that gives them rules, which is
 * the arrangement that bag exists for: carry a key verbatim until something
 * can act on it, then type it.
 *
 * Bounded against the catalogue, so a stored id with no row behind it is
 * dropped — the same rule equipment instances follow, and the mechanism by
 * which a retired item leaves old saves. A count is floored at zero and an
 * entry that reaches zero is removed rather than stored, which is what
 * `addUsableItemCount` does in the shipped game and what keeps a save from
 * growing a key for every item ever used.
 */

export type SavedUsables = Readonly<Record<string, number>>;

const MAX_HELD = 9_999_999;

export function readUsables(raw: unknown): SavedUsables {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (getUsableItem(id) === null) continue;
    const count = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
    if (count > 0) out[id] = Math.min(count, MAX_HELD);
  }
  return out;
}

/** Add to a count, dropping the key when it reaches zero. */
export function addUsable(counts: SavedUsables, id: string, amount: number): SavedUsables {
  const next = { ...counts };
  const total = Math.max(0, (next[id] ?? 0) + Math.floor(amount));
  if (total === 0) delete next[id];
  else next[id] = Math.min(total, MAX_HELD);
  return next;
}

/** Back out to the shape the shipped game reads. */
export function usablesToLegacy(counts: SavedUsables): Record<string, number> {
  return { ...counts };
}
