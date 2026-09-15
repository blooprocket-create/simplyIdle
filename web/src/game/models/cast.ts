import type { FormationRole } from '../../engine/combat/formation';
import type { ModelKey } from './manifest';
import type { Silhouette } from './silhouette';

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
