import type { FormationRole } from '../../engine/combat/formation';
import { monsterModelKey, type ModelKey } from './manifest';
import { baseMonsterName, monsterSilhouette, type Silhouette } from './silhouette';

/**
 * Who is on the field, as opposed to what they are doing.
 *
 * The snapshot is per-frame state — swing progress, hit points, damage that
 * landed this step. A hero's rank, name and model are none of those: they
 * change when the team changes and not otherwise. Putting them in the
 * snapshot would re-send sixty-five strings sixty times a second to describe
 * something that did not move.
 *
 * So the renderer gets two things. A cast, when the roster changes, and a
 * snapshot, every frame.
 */

export interface CastMember {
  uid: string;
  /** Shown on a nameplate; also the fallback label if a model fails to load. */
  name: string;
  /** Which rank they fight in, and therefore where they stand. */
  role: FormationRole;
  /** What to draw them as. A key the pack may or may not have. */
  modelKey: ModelKey;
  /** What to draw them as when it does not — their outline, not a capsule. */
  silhouette: Silhouette;
}

export type Cast = readonly CastMember[];

export const EMPTY_CAST: Cast = [];

/** Stable ordering, so a hero does not change place because a sibling died. */
export function sortedCast(cast: Cast): CastMember[] {
  return [...cast].sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
}

export function castByRole(cast: Cast, role: FormationRole): CastMember[] {
  return sortedCast(cast).filter(member => member.role === role);
}

/**
 * What to draw the wave's monster as.
 *
 * The enemy is not in the cast — it is replaced a thousand times a session
 * while the roster sits still — but it is decided the same way, from content,
 * so it is decided here rather than inside the renderer. `Diorama` needs a
 * WebGL context to instantiate and so cannot be unit-tested; anything that
 * picks what to draw therefore has to live somewhere that can be.
 */
export interface MonsterAppearance {
  /** Tried in order; the first the pack can supply wins. */
  modelKeys: readonly ModelKey[];
  silhouette: Silhouette;
}

export function monsterAppearance(name: string): MonsterAppearance {
  const base = baseMonsterName(name);
  // A boss asks for its own model and settles for the monster it is a crowned
  // version of, so a pack that authored a distinct king gets used and one that
  // did not still draws an Orc rather than a placeholder.
  const modelKeys = base === name ? [monsterModelKey(name)] : [monsterModelKey(name), monsterModelKey(base)];
  return { modelKeys, silhouette: monsterSilhouette(name) };
}
