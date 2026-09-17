import Decimal from 'break_eternity.js';
import { createAttackTimer, type AttackTimer } from '../combat/attackTimer';

/**
 * A hero as the simulation moves them: a swing timer, a hit, and a target.
 *
 * This is the shape the whole rewrite was for. The shipped simulation folds
 * every hero into one `heroDps` scalar, so there is nothing on screen to
 * animate and nothing for a player to read. A hero with their own timer has a
 * wind-up a cast bar can show, a moment of impact a number can fly from, and a
 * target a model can face.
 */

export interface HeroEntity {
  uid: string;
  /** What one swing lands for. */
  damagePerHit: Decimal;
  timer: AttackTimer;
  /** The enemy this hero is swinging at, or null when there is nothing to hit. */
  targetId: string | null;
}

/**
 * Stagger, so six heroes do not swing in lockstep.
 *
 * Derived from the uid rather than randomised: the same roster produces the
 * same opening rhythm every run, which keeps the simulation reproducible and
 * keeps a test from having to stub anything. The hash is the same cheap
 * string hash the hero stat variance uses.
 */
export function startOffsetMs(uid: string, intervalMs: number): number {
  let hash = 0;
  for (let index = 0; index < uid.length; index += 1) {
    hash = (hash * 31 + uid.charCodeAt(index)) & 0xffff;
  }
  return (hash / 0x10000) * intervalMs;
}

/**
 * Damage per swing is the hero's per-second contribution times their interval,
 * so a slower class hits proportionally harder and **average DPS is unchanged
 * from the shipped model**. Cadence changes the shape of the damage, not its
 * amount — everything the discrete model actually costs shows up as overkill,
 * which `encounter.ts` measures rather than hides.
 */
export function createHeroEntity(uid: string, damagePerSecond: Decimal, intervalMs: number): HeroEntity {
  return {
    uid,
    damagePerHit: damagePerSecond.mul(intervalMs).div(1_000),
    timer: createAttackTimer(intervalMs, startOffsetMs(uid, intervalMs)),
    targetId: null,
  };
}

/** The per-second rate a hero's discrete swings average out to. */
export function nominalDps(hero: HeroEntity): Decimal {
  return hero.damagePerHit.mul(1_000).div(hero.timer.intervalMs);
}

/**
 * What a roster averages out to, together.
 *
 * Lived in `Simulation` as a two-line private until the coordinator's line cap
 * objected, which is what the cap is for: summing a roster's damage is a rule
 * about heroes and belongs beside the one it sums. `awayCredit` already asks
 * for a team's DPS as one number, so the concept had a name before it had a
 * home.
 */
export function teamDps(heroes: readonly HeroEntity[]): Decimal {
  return heroes.reduce((total, hero) => total.add(nominalDps(hero)), new Decimal(0));
}
