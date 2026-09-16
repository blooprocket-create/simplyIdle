import { heroTemplatesById } from '../content/heroes';
import { migrateSave } from '../engine/save/migrate';
import type { SaveV3 } from '../engine/save/schema';
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
 * Anything that *is* stored goes through `migrateSave`, which is built to
 * take a payload of unknown shape — that is how it reads the shipped v2
 * saves — so a hand-edited object is its problem to bound rather than this
 * function's to reject. Text that is not JSON at all is not a save.
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
  return migrateSave(parsed, { nowMs, content: { heroesById: heroTemplatesById() } });
}

/*
 * There is deliberately no `writeSave` here yet.
 *
 * The first version of this file had one, and it was a trap. `migrateSave`
 * reads the *v2* payload shape — `heroRoster`, `activeTeamHeroIds` — because
 * reading the shipped saves is what it was written for. A `SaveV3` keeps its
 * roster at `roster.heroes`, so writing one and reading it back finds no
 * roster at all and returns an empty save. Caught by a round-trip test that
 * expected the heroes it had just stored and got none.
 *
 * Nothing called it, so no save was ever lost — but shipping a writer whose
 * output the reader silently empties is a trap primed for whoever wires
 * saving next. Writing needs a v3 reader to pair with, and that reader has to
 * bound a stored v3 payload as thoroughly as the migration bounds a v2 one,
 * because `version: 3` in local storage is a claim by whoever edited it
 * rather than a fact. That is its own piece of work.
 *
 * Until then this path is read-only: a save that arrives is honoured, and a
 * team the player changes does not persist. `runStore.ts` keeps the run —
 * wave, kills and the meter — which is a different question.
 */
