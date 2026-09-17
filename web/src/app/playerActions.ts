import { HERO_POOL } from '../content/heroes';
import {
  DIAMOND_SUMMON_COST,
  GACHA_SUMMON_COST,
  SPARK_TOKEN_BY_RARITY,
  SUMMON_MILESTONES,
  summonCost,
} from '../content/summon';
import { boundedInt, SAFE_NUMBER_CAP } from '../engine/save/guards';
import type { SaveV3 } from '../engine/save/schema';
import { applySummon, type SummonOutcome, type SummonPayment, type SummonPoolEntry } from '../engine/roster/summonSave';

/**
 * What the player can do to their save, with the catalogue and the dice
 * supplied.
 *
 * The engine takes the hero pool, the milestone list and a `random` as
 * arguments — it may not read the catalogue and has no more business reading
 * the dice than the clock. Somebody has to hand it all three, and that somebody
 * belongs here rather than in a component: a surface describes data, and a
 * React callback that also picked a hero pool would be untestable without
 * rendering.
 */

/** The catalogue, in the shape a pull needs it. Built once. */
const SUMMON_POOL: readonly SummonPoolEntry[] = HERO_POOL.map(hero => ({
  id: hero.id,
  tier: hero.tier,
  baseTeamBoost: hero.baseTeamBoost,
}));

/**
 * The account's VIP level, out of the legacy bag.
 *
 * Unclaimed, and read rather than claimed on purpose: VIP is a whole system
 * — rewards, a track, a shop — that Phase 10 owns, and claiming one field of it
 * now would put a lone typed number next to the untyped rest. What is needed
 * here is only the summon discount, and `legacy` exists to be read from.
 */
export function vipLevel(save: SaveV3): number {
  return boundedInt(save.legacy.vipLevel, 0, SAFE_NUMBER_CAP, 0);
}

/** What one pull costs this account, in the currency it is paid with. */
export function priceOfSummon(save: SaveV3, pay: SummonPayment): number {
  return summonCost(pay === 'diamonds' ? DIAMOND_SUMMON_COST : GACHA_SUMMON_COST, vipLevel(save));
}

/** Whether a pull would go through, without drawing anything to find out. */
export function canSummon(save: SaveV3, pay: SummonPayment): boolean {
  if (save.summon.freeCharges > 0) return true;
  const held = pay === 'diamonds' ? save.wallet.diamonds : save.wallet.bossTears;
  return held >= priceOfSummon(save, pay);
}

export interface SummonAttempt {
  save: SaveV3;
  pay: SummonPayment;
  /** For the new hero's uid. Passed in, because nothing below reads a clock. */
  nowMs: number;
  random: () => number;
}

/** Pull once. Null when the account can pay with neither a charge nor coin. */
export function summonOnce(attempt: SummonAttempt): SummonOutcome | null {
  return applySummon({
    save: attempt.save,
    pool: SUMMON_POOL,
    milestones: SUMMON_MILESTONES,
    sparkRates: SPARK_TOKEN_BY_RARITY,
    pay: attempt.pay,
    cost: priceOfSummon(attempt.save, attempt.pay),
    random: attempt.random,
    nowMs: attempt.nowMs,
  });
}
