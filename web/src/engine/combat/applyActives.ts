import type { Enemy } from './encounter';
import { applyCastDamage } from './heroActives';
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

/**
 * One ability, pressed by the player. Null when the press was refused.
 *
 * The same translation `applyActives` does for the automatic case, and
 * deliberately not a second path through it: a pressed `burst_volley` and an
 * auto-cast one have to leave the enemy in the same place, or the player is
 * punished for pressing.
 *
 * The caster is looked up by uid rather than passed in, so a press naming a
 * hero who is not in the fight is refused here instead of casting for a
 * `CasterView` the caller invented.
 */
export function castOne(
  clock: HeroActiveClock,
  uid: string,
  casters: readonly ActiveCaster[],
  enemy: Enemy,
  vitals: TeamVitals,
): { enemy: Enemy; vitals: TeamVitals; record: CastRecord } | null {
  const entry = casters.find(candidate => candidate.uid === uid);
  if (entry === undefined) return null;

  const record = clock.cast(uid, entry.caster, { enemyHp: enemy.hp, enemyMaxHp: enemy.maxHp }, entry.fielded);
  if (record === null) return null;

  return {
    enemy: { ...enemy, hp: applyCastDamage(enemy.hp, record.effect.damage) },
    vitals: healTeam(vitals, record.effect.healFraction),
    record,
  };
}
