import type { FormationRole } from '../../engine/combat/formation';
import { castByRole, type Cast } from '../models/cast';

/**
 * Where everyone stands.
 *
 * Side-on, as the Phase 0 stub established: the line on the left, whatever it
 * is fighting on the right, camera off to one side. Rank sets distance from
 * the enemy, and heroes spread across the depth of their own rank.
 *
 * Pure, and deliberately so. Placement is a decision about legibility — can a
 * player tell six heroes apart at a glance, does the front rank read as in
 * front — and a decision that can only be checked by looking at a render is
 * one that silently rots.
 */

export interface Placement {
  x: number;
  y: number;
  z: number;
  /** Radians about Y. Everyone faces what they are fighting. */
  yaw: number;
}

/** Distance from the enemy, by rank. Front is nearest. */
export const RANK_X: Record<FormationRole, number> = {
  front: -1.6,
  mid: -3.2,
  back: -4.8,
};

/** Gap between two heroes sharing a rank. */
export const RANK_SPACING = 1.5;

export const ENEMY_POSITION = { x: 3.2, y: 0, z: 0 } as const;

export function facing(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/**
 * Positions for the whole cast, keyed by uid.
 *
 * Each rank is laid out from its own members only. A back-rank hero leaving
 * must not shuffle the front line sideways — the eye tracks position, and a
 * line that reorders itself when someone dies reads as a bug even when the
 * numbers are right.
 */
export function layOutHeroes(cast: Cast): Map<string, Placement> {
  const placements = new Map<string, Placement>();
  for (const role of Object.keys(RANK_X) as FormationRole[]) {
    const members = castByRole(cast, role);
    const x = RANK_X[role];
    members.forEach((member, index) => {
      const z = (index - (members.length - 1) / 2) * RANK_SPACING;
      placements.set(member.uid, { x, y: 0, z, yaw: facing({ x, z }, ENEMY_POSITION) });
    });
  }
  return placements;
}

export function layOutEnemy(): Placement {
  return {
    ...ENEMY_POSITION,
    yaw: facing(ENEMY_POSITION, { x: RANK_X.front, z: 0 }),
  };
}
