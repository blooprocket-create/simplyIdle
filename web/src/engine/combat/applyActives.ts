import type { Enemy } from './encounter';
import type { HeroActiveClock, ActiveCaster, CastRecord } from './HeroActiveClock';
import { healTeam, type TeamVitals } from './survival';

/**
 * One step of the fight's abilities, as the pieces the simulation holds.
 *
 * A seam rather than a system: `HeroActiveClock` answers in the abstract —
 * damage dealt, a fraction healed — and this turns that into the enemy and the
 * vitals. It is its own file because `Simulation` is held under three hundred
 * lines and translating between two shapes is not the coordinator's job.
 */
export function applyActives(
  clock: HeroActiveClock,
  elapsedMs: number,
  casters: readonly ActiveCaster[],
  enemy: Enemy,
  vitals: TeamVitals,
): { enemy: Enemy; vitals: TeamVitals; casts: CastRecord[] } {
  const cast = clock.step(elapsedMs, casters, { enemyHp: enemy.hp, enemyMaxHp: enemy.maxHp });
  return {
    enemy: { ...enemy, hp: cast.enemyHp },
    vitals: healTeam(vitals, cast.healFraction),
    casts: cast.casts,
  };
}
