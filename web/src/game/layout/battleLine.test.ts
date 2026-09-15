import { describe, expect, it } from 'vitest';
import type { Cast, CastMember } from '../models/cast';
import { CLASS_SILHOUETTE } from '../models/silhouette';
import { ENEMY_POSITION, RANK_SPACING, RANK_X, layOutEnemy, layOutHeroes } from './battleLine';

const member = (uid: string, role: CastMember['role']): CastMember => ({
  uid,
  name: uid,
  role,
  modelKey: `hero/${uid}`,
  silhouette: CLASS_SILHOUETTE.warrior,
});

const TEAM: Cast = [
  member('a', 'front'),
  member('b', 'front'),
  member('c', 'mid'),
  member('d', 'back'),
  member('e', 'back'),
];

describe('battle line', () => {
  it('puts the front rank nearest the enemy', () => {
    const at = layOutHeroes(TEAM);
    expect(at.get('a')!.x).toBeGreaterThan(at.get('c')!.x);
    expect(at.get('c')!.x).toBeGreaterThan(at.get('d')!.x);
    expect(RANK_X.front).toBeLessThan(ENEMY_POSITION.x);
  });

  it('centres a rank on the line and spaces it evenly', () => {
    const at = layOutHeroes(TEAM);
    expect(at.get('a')!.z + at.get('b')!.z).toBeCloseTo(0);
    expect(Math.abs(at.get('a')!.z - at.get('b')!.z)).toBeCloseTo(RANK_SPACING);
    expect(at.get('c')!.z).toBeCloseTo(0);
  });

  it('places everyone exactly once', () => {
    const at = layOutHeroes(TEAM);
    expect(at.size).toBe(TEAM.length);
    const seen = [...at.values()].map(p => `${p.x},${p.z}`);
    expect(new Set(seen).size).toBe(TEAM.length);
  });

  it('does not depend on the order the cast arrives in', () => {
    const forward = layOutHeroes(TEAM);
    const backward = layOutHeroes([...TEAM].reverse());
    for (const [uid, placement] of forward) expect(backward.get(uid)).toEqual(placement);
  });

  it('does not shuffle one rank when another loses a member', () => {
    // The eye tracks position. A line that reorders itself because someone
    // in a different rank died reads as a bug even when the numbers are fine.
    const before = layOutHeroes(TEAM);
    const after = layOutHeroes(TEAM.filter(m => m.uid !== 'd'));
    expect(after.get('a')).toEqual(before.get('a'));
    expect(after.get('b')).toEqual(before.get('b'));
    expect(after.get('c')).toEqual(before.get('c'));
  });

  it('turns everyone to face what they are fighting', () => {
    const at = layOutHeroes(TEAM);
    for (const [, placement] of at) {
      const dx = ENEMY_POSITION.x - placement.x;
      const dz = ENEMY_POSITION.z - placement.z;
      expect(Math.sin(placement.yaw)).toBeCloseTo(dx / Math.hypot(dx, dz));
      expect(Math.cos(placement.yaw)).toBeCloseTo(dz / Math.hypot(dx, dz));
    }
    // And the enemy faces back down the line rather than off into the set.
    expect(Math.sin(layOutEnemy().yaw)).toBeLessThan(0);
  });

  it('stands everyone on the ground rather than in it', () => {
    for (const [, placement] of layOutHeroes(TEAM)) expect(placement.y).toBe(0);
    expect(layOutEnemy().y).toBe(0);
  });

  it('handles an empty line and a single hero', () => {
    expect(layOutHeroes([]).size).toBe(0);
    const solo = layOutHeroes([member('only', 'front')]);
    expect(solo.get('only')!.z).toBeCloseTo(0);
  });
});
