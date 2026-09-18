import { getMonsterExp, getMonsterGold } from '../waves/curves';
import { calculateShardReward } from '../roster/progression';
import type { UsableItemType } from '../../content/usableItems';

/**
 * What using an item is actually worth.
 *
 * **Not its `value`.** Every gain is the larger of a scaled base and a *wave
 * floor* — three of the player's own monsters for a basic item, eight for an
 * advanced one — so a Gold Cache's 350 is what a brand-new account gets and
 * what nobody else does. At wave 400 the same cache pays 8.5e24.
 *
 * The consequence is worth stating because it is invisible from the formula:
 * **once the floor wins, none of the multipliers matter.** VIP, prestige and
 * achievements all move the scaled base, and the scaled base stops being the
 * answer somewhere in the first few hundred waves. Measured — an account with
 * six rebirths gets the same figure to the last digit as one with none.
 *
 * The three gains take three different chains, so a shared multiplier is wrong
 * on two of them: gold reads VIP gold, EXP reads achievements *and* VIP EXP,
 * shards read the weekly event.
 */

/** Multipliers the caller resolves; this module reads no save. */
export interface UsableScaling {
  level: number;
  highestWave: number;
  prestigeCount: number;
  /** Gold only. */
  vipGoldMult: number;
  /** EXP only, both of them. */
  achievementMult: number;
  vipExpMult: number;
  /** Shards only. */
  weeklyShardMult: number;
}

export const USABLE_GOLD_FLOOR_MONSTERS = { basic: 3, advanced: 8 } as const;
export const USABLE_EXP_FLOOR_MONSTERS = { basic: 2, advanced: 6 } as const;
export const USABLE_SHARD_FLOOR_MULT = { basic: 1.2, advanced: 2.5 } as const;

/**
 * How much a player's progress lifts a base value.
 *
 * Three factors multiplied, each with its own curve — a power of the level, a
 * logarithm of the deepest wave, and a linear term on rebirths. Shared by all
 * three gains, which is why it is not the thing that tells them apart.
 */
export function usableProgressScale(scaling: UsableScaling): number {
  const levelFactor = 1 + Math.pow(Math.max(1, scaling.level), 0.32) * 0.35;
  const waveFactor = 1 + Math.log10(Math.max(10, scaling.highestWave + 9)) * 0.8;
  const prestigeFactor = 1 + scaling.prestigeCount * 0.12;
  return levelFactor * waveFactor * prestigeFactor;
}

/** The larger of the two, floored at one, as every gain resolves it. */
function larger(scaledBase: number, waveFloor: number): number {
  if (!Number.isFinite(scaledBase) && !Number.isFinite(waveFloor)) return 1;
  const base = Number.isFinite(scaledBase) ? scaledBase : 0;
  const floor = Number.isFinite(waveFloor) ? waveFloor : 0;
  return Math.max(1, Math.floor(Math.max(base, floor)));
}

export function usableGoldGain(value: number, itemType: UsableItemType, scaling: UsableScaling): number {
  const scaledBase = Math.ceil(value * usableProgressScale(scaling) * scaling.vipGoldMult);
  const waveFloor = Math.ceil(
    getMonsterGold(Math.max(1, scaling.highestWave)).toNumber() * USABLE_GOLD_FLOOR_MONSTERS[itemType],
  );
  return larger(scaledBase, waveFloor);
}

export function usableExpGain(value: number, itemType: UsableItemType, scaling: UsableScaling): number {
  const scaledBase = Math.ceil(value * usableProgressScale(scaling) * scaling.achievementMult * scaling.vipExpMult);
  const waveFloor = Math.ceil(
    getMonsterExp(Math.max(1, scaling.highestWave)).toNumber() * USABLE_EXP_FLOOR_MONSTERS[itemType],
  );
  return larger(scaledBase, waveFloor);
}

export function usableShardGain(value: number, itemType: UsableItemType, scaling: UsableScaling): number {
  const scaledBase = Math.ceil(value * usableProgressScale(scaling) * scaling.weeklyShardMult);
  /*
   * A hero level invented from the player's own progress, because shards are
   * priced per hero level and an item has no hero. Level plus the square root
   * of the deepest wave — which is not a rounding of anything, it is the
   * shipped expression.
   */
  const syntheticHeroLevel = Math.max(1, Math.floor(scaling.level + Math.sqrt(Math.max(1, scaling.highestWave))));
  const waveFloor = Math.ceil(calculateShardReward('rare', syntheticHeroLevel) * USABLE_SHARD_FLOOR_MULT[itemType]);
  return larger(scaledBase, waveFloor);
}
