import { HERO_POOL, heroTemplatesById } from '../content/heroes';
import type { FormationRole } from '../engine/combat/formation';
import {
  DIAMOND_SUMMON_COST,
  GACHA_SUMMON_COST,
  SPARK_TOKEN_BY_RARITY,
  SUMMON_MILESTONES,
  summonCost,
} from '../content/summon';
import { boundedInt, SAFE_NUMBER_CAP } from '../engine/save/guards';
import type { SaveContent, SaveV3 } from '../engine/save/schema';
import { applySummon, type SummonOutcome, type SummonPayment, type SummonPoolEntry } from '../engine/roster/summonSave';
import {
  batchLevelHeroes,
  buySlot,
  fieldTeam,
  placeHero,
  recallLoadout,
  recycleHero,
  spendOnHero,
  storeLoadout,
  type HeroSpend,
} from '../engine/roster/rosterSave';

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

/** The catalogue, as the save reader and the selection rules need it. */
const CONTENT: SaveContent = { heroesById: heroTemplatesById() };

/**
 * The shard rate a recycle pays at.
 *
 * **Flat, because there is no weekly event system yet.** `WEEKLY_EVENTS` is
 * Phase 11's and the rotation is not ported, so the honest multiplier is one
 * rather than a guess at which week it is — and `recycleShards` takes it as an
 * argument precisely so this is a caller's decision rather than an engine
 * reading a clock.
 */
export const WEEKLY_SHARD_MULTIPLIER = 1;

/**
 * The roster verbs, with the catalogue supplied.
 *
 * Each returns the next save or **null**, which is the same contract
 * `rosterSave.ts` sets: a screen greying out a button has to be able to ask,
 * and "it worked and changed nothing" is a different answer from "it did not
 * happen".
 */
export const rosterActions = {
  spendOnHero: (save: SaveV3, uid: string, spend: HeroSpend) => spendOnHero(save, uid, spend),
  batchLevel: (save: SaveV3, uids: readonly string[], addLevels: number | 'max') =>
    batchLevelHeroes(save, CONTENT, uids, addLevels),
  recycle: (save: SaveV3, uid: string) => recycleHero(save, uid, WEEKLY_SHARD_MULTIPLIER),
  fieldTeam: (save: SaveV3, requested: readonly string[]) => fieldTeam(save, CONTENT, requested),
  place: (save: SaveV3, uid: string, role: FormationRole) => placeHero(save, CONTENT, uid, role),
  storeLoadout: (save: SaveV3, slot: number) => storeLoadout(save, slot),
  recallLoadout: (save: SaveV3, slot: number) => recallLoadout(save, CONTENT, slot),
  buySlot: (save: SaveV3) => buySlot(save),
};
