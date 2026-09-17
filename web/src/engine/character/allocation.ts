import { STAT_KEYS, type StatBlock } from '../save/schema';
import type { PlayerClass } from '../../content/classes';

/**
 * Spending stat points, and making the character who spends them.
 *
 * Four of the shipped game's eighty-five reducer actions, ported as pure
 * functions over the two fields they touch. They are the first actions in the
 * rewrite that change the player's character rather than the fight — before
 * this, everything clickable was BURST, a wipe offer, a boss tell and one
 * automation toggle.
 *
 * One deliberate divergence, and it is the only one. See `allocateN`.
 */

export const STAT_POINTS_PER_LEVEL = 5;
export const STARTING_STAT_POINTS = 10;
export const MAX_PLAYER_NAME_LENGTH = 24;

export interface StatPool {
  alloc: StatBlock;
  unspent: number;
}

export type StatKey = keyof StatBlock;

function spend(pool: StatPool, stat: StatKey, amount: number): StatPool {
  if (amount <= 0) return pool;
  return {
    alloc: { ...pool.alloc, [stat]: pool.alloc[stat] + amount },
    unspent: pool.unspent - amount,
  };
}

/** One point. A no-op on an empty pool rather than a negative balance. */
export function allocateOne(pool: StatPool, stat: StatKey): StatPool {
  return spend(pool, stat, Math.min(1, pool.unspent));
}

/**
 * `n` points, or the whole pool when it holds less.
 *
 * **The divergence.** The shipped reducer computes `Math.min(amount, unspent)`
 * with no floor, so `amount: -5` subtracts negative five: the player gains
 * five points back and the stat drops below where it started, repeatable
 * without limit. `characterFixture.test.ts` records that behaviour — a pool of
 * ten becomes fifteen and vitality goes to `-2` — precisely so that this
 * function does not inherit it.
 *
 * No screen in the shipped game sends a negative amount, so it has never cost
 * anyone anything. But a reducer is a contract with whatever calls it, and the
 * rewrite means to expose these as engine functions rather than as one
 * component's private handler. Clamping at zero is what makes that safe, and
 * zero is where the shipped behaviour stops being wrong: `amount: 0` is
 * already a harmless no-op there.
 */
export function allocateN(pool: StatPool, stat: StatKey, amount: number): StatPool {
  return spend(pool, stat, Math.min(Math.max(0, Math.floor(amount)), pool.unspent));
}

/** The whole pool into one stat. */
export function allocateMax(pool: StatPool, stat: StatKey): StatPool {
  return spend(pool, stat, pool.unspent);
}

/** How many points a level entitles a player to, before anything is spent. */
export function statPointsForLevel(level: number): number {
  return Math.max(0, (Math.max(1, Math.floor(level)) - 1) * STAT_POINTS_PER_LEVEL);
}

export function statPointsSpent(alloc: StatBlock): number {
  return STAT_KEYS.reduce((total, key) => total + alloc[key], 0);
}

export interface Character {
  name: string;
  playerClass: PlayerClass;
  created: boolean;
  unspent: number;
}

/**
 * Create a character, or refuse to.
 *
 * Returns null rather than throwing on the two refusals the shipped reducer
 * makes by returning the state unchanged — a blank name, and a character that
 * already exists. Silently returning the old character would let a caller
 * think it had re-rolled a class; null makes the refusal something the caller
 * has to look at.
 *
 * Starter equipment is the shipped action's other half and is Phase 9's. What
 * is here is identity and the ten points, which is what the fixture records.
 */
export function createCharacter(existing: Character | null, name: string, playerClass: PlayerClass): Character | null {
  if (existing?.created) return null;
  const trimmed = name.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
  if (!trimmed) return null;
  return { name: trimmed, playerClass, created: true, unspent: STARTING_STAT_POINTS };
}
