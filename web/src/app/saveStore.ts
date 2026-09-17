import { heroTemplatesById } from '../content/heroes';
import type { SaveV3 } from '../engine/save/schema';
import { readSave, writeSaveV3 } from '../engine/save/v3';
import type { PreferenceStore } from '../ui/prefs/store';

/**
 * Where the player's save comes from.
 *
 * `demoRoster.ts` has carried a note since Phase 3 saying what was missing:
 * `profileFromSave` already builds the read model from a migrated `SaveV3`
 * and is tested against the shipped fixtures — there was simply nowhere to
 * get a save *from*, because the shipped one lives behind Firebase auth.
 * This is that somewhere, and it is local storage rather than the account on
 * purpose: the cutover should not need a login to be a game. Reading the
 * account's save is `ports/SavePort`'s job, and a Firebase adapter's.
 */

export const SAVE_KEY = 'simplyidle.save.v3';

/**
 * Read and migrate whatever is stored, or null when there is nothing.
 *
 * Null and "an empty save" are deliberately different answers. Nothing
 * stored means a new player, who needs a starting team; a stored save with
 * an empty roster means a player who has one and has emptied it, and
 * inventing heroes for them would be inventing progress.
 *
 * Anything that *is* stored goes through `readSave`, which picks the v2 or v3
 * reader by looking at the payload and bounds it either way. Both are built to
 * take a shape they have never seen — that is how the v2 side reads the
 * shipped saves — so a hand-edited object is their problem to bound rather
 * than this function's to reject. Text that is not JSON at all is not a save.
 */
export function loadSave(store: PreferenceStore, nowMs: number): SaveV3 | null {
  const raw = store.read(SAVE_KEY);
  if (raw === null || raw === '') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return readSave(parsed, { nowMs, content: { heroesById: heroTemplatesById() } });
}

/**
 * Store a save.
 *
 * This file shipped read-only, and the note that stood here said why:
 * `migrateSave` reads the *v2* payload shape, so writing a `SaveV3` and
 * reading it back found no roster and returned an empty save. The first
 * version of this file had exactly that writer, nothing called it, and a
 * round-trip test caught it before anything did.
 *
 * What it was waiting for was a v3 reader that bounds a stored v3 payload as
 * thoroughly as the migration bounds a v2 one — because `version: 3` in local
 * storage is a claim by whoever last edited that string, not a fact.
 * `engine/save/v3.ts` is that reader, and `v3.test.ts` holds it to the
 * property that makes this safe: reading is idempotent, so whatever the reader
 * decides a save means, writing that meaning back cannot change it.
 *
 * Deliberately not total in the way `loadSave` is. A store that cannot write
 * throws nothing — `browserStore().write` swallows it, because a private
 * window should still be a game — so this returns whether the save is actually
 * somewhere, and a caller that cares can tell the player their progress is not
 * being kept rather than discovering it when the tab closes.
 */
export function writeSave(store: PreferenceStore, save: SaveV3): boolean {
  const text = writeSaveV3(save);
  store.write(SAVE_KEY, text);
  return store.read(SAVE_KEY) === text;
}
