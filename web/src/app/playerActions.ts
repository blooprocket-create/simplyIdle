import { HERO_POOL, heroTemplatesById } from '../content/heroes';
import { equipmentTemplatesById } from '../content/equipment';
import type { FormationRole } from '../engine/combat/formation';
import {
  DIAMOND_SUMMON_COST,
  GACHA_SUMMON_COST,
  SPARK_EXCHANGE_OPTIONS,
  SPARK_TOKEN_BY_RARITY,
  SUMMON_MILESTONES,
  summonCost,
} from '../content/summon';
import { boundedInt, SAFE_NUMBER_CAP } from '../engine/save/guards';
import type { SaveContent, SaveV3 } from '../engine/save/schema';
import { useUsableItem } from '../engine/items/usableSave';
import type { UsableScaling } from '../engine/items/usableGains';
import { weeklyEventByWeek } from '../content/weeklyEvents';
import { VIP_EXP_PER_LEVEL, VIP_GOLD_PER_LEVEL } from '../engine/combat/rewardRates';
import { getAchievementLegacyMultiplier } from '../engine/combat/progressionMultipliers';
import { achievementCountFromLegacy, weeklyEventWeekFromLegacy } from '../engine/character/fromSave';
import { applySummon, type SummonOutcome, type SummonPayment, type SummonPoolEntry } from '../engine/roster/summonSave';
import { applySparkExchange, type SparkOutcome } from '../engine/roster/sparkSave';
import {
  batchLevelHeroes,
  buySlot,
  fieldTeam,
  placeHero,
  recallLoadout,
  recycleHero,
  spendOnHero,
  storeLoadout,
  toggleUniqueRelic,
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
  // The tear price is a flat one and takes no VIP discount — the shipped tear
  // path has no cost arithmetic to discount. Only the diamond price does.
  return pay === 'diamonds' ? summonCost(DIAMOND_SUMMON_COST, vipLevel(save)) : GACHA_SUMMON_COST;
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

export interface SparkAttempt {
  save: SaveV3;
  optionId: string;
  /** The hero the player named, when a screen offers the choice. */
  targetHeroId?: string;
  /** For the new hero's uid. Passed in, because nothing below reads a clock. */
  nowMs: number;
  random: () => number;
}

/**
 * Whether an exchange would go through, without drawing anything to find out.
 *
 * Priced off the option table rather than off a copy of the numbers, so a
 * button that looks affordable is one the engine will honour. An unknown id
 * answers `false` rather than throwing — a screen asking about an option that
 * is not on offer is a screen bug, not a crash.
 */
export function canAffordSpark(save: SaveV3, optionId: string): boolean {
  const option = SPARK_EXCHANGE_OPTIONS.find(entry => entry.id === optionId);
  return option !== undefined && save.wallet.sparkTokens >= option.sparkCost;
}

/** Buy one exchange. Null when the option is unknown or unaffordable. */
export function sparkExchange(attempt: SparkAttempt): SparkOutcome | null {
  return applySparkExchange({
    save: attempt.save,
    pool: SUMMON_POOL,
    options: SPARK_EXCHANGE_OPTIONS,
    optionId: attempt.optionId,
    ...(attempt.targetHeroId ? { targetHeroId: attempt.targetHeroId } : {}),
    random: attempt.random,
    nowMs: attempt.nowMs,
  });
}

/** The catalogue, as the save reader and the selection rules need it. */
/** Exported so the automation runner reads one catalogue rather than a second. */
export const SAVE_CONTENT: SaveContent = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const CONTENT = SAVE_CONTENT;

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
  toggleRelic: (save: SaveV3, uid: string) => toggleUniqueRelic(save, uid),
};

/**
 * The scaling an item's gain is measured against, read off a save.
 *
 * Assembled here rather than inside the engine's item rules for the reason
 * every chain in this port is: the multipliers come from four different
 * places — VIP out of the legacy bag, achievements out of a count, the weekly
 * event out of a table — and a rule module that reached for all four would be
 * reading the save it was handed a scalar to avoid.
 */
export function usableScalingFor(save: SaveV3): UsableScaling {
  const vip = vipLevel(save);
  return {
    level: save.progression.level,
    highestWave: save.progression.highestWave,
    prestigeCount: save.progression.prestigeCount,
    vipGoldMult: 1 + vip * VIP_GOLD_PER_LEVEL,
    achievementMult: getAchievementLegacyMultiplier(achievementCountFromLegacy(save)).toNumber(),
    vipExpMult: 1 + vip * VIP_EXP_PER_LEVEL,
    weeklyShardMult: weeklyEventByWeek(weeklyEventWeekFromLegacy(save)).shardMultiplier,
  };
}

/**
 * Use an item, and say what the fight still has to do about it.
 *
 * The heal cannot be applied to a save — the team's health is in the running
 * simulation — so it comes back as a fraction for the shell to hand to the
 * loop. Everything else is already in the save this returns.
 */
export function useItem(save: SaveV3, itemId: string, amount: number | 'all') {
  return useUsableItem({ save, itemId, amount, scaling: usableScalingFor(save) });
}
