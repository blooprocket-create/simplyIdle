import type { PlayerClass } from './classes';

/**
 * How often each class swings.
 *
 * **This is new balance, not a port.** The shipped combat has no cadence at
 * all — it applies `dps * dt` continuously, so there is no attack to have a
 * speed. Every number here is therefore a design decision rather than a
 * translation, which is why they live in `content/` where balance lives and
 * not buried in the simulation.
 *
 * The intervals are shaped so a class reads the way it looks: an archer flurries,
 * a mage lands one heavy cast, a warrior sits in the middle. What they do *not*
 * do is change how much damage a hero deals per second — `damagePerHit` is
 * derived by multiplying the hero's existing per-second contribution by their
 * interval, so average DPS is preserved exactly and the only thing these
 * numbers change is the *shape* of the damage: how bursty it is, and how much
 * spills over the killing blow.
 */
export const CLASS_ATTACK_INTERVAL_MS: Record<PlayerClass, number> = {
  archer: 700,
  monk: 800,
  berserker: 900,
  warrior: 1_200,
  mage: 1_600,
};

/** The player character's own cadence, between the warrior and the berserker. */
export const PLAYER_ATTACK_INTERVAL_MS = 1_000;

export function getAttackIntervalMs(heroClass: PlayerClass): number {
  return CLASS_ATTACK_INTERVAL_MS[heroClass];
}
