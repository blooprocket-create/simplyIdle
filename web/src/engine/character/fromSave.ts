import { isRarity, type Rarity } from '../../content/rarities';
import type { EconomyState } from '../combat/rewardRates';
import type { ProgressionState } from '../combat/progressionMultipliers';
import { MAX_SAVE_COLLECTION, boundedFloat, boundedInt, isRecord } from '../save/guards';
import type { SaveV3, StatBlock } from '../save/schema';
import { teamMaxHp, type HealthHero } from './stats';
import { AUTO_POTION_THRESHOLD } from '../items/autoPotion';

/**
 * Team health for a save.
 *
 * Six of the eight inputs come straight off the typed v3 slice. Two do not,
 * and that is the interesting part: **class mastery and the tactics facility
 * are still in the `legacy` bag.**
 *
 * `schema.ts` says why the bag exists — v3 types the slice the engine can act
 * on and carries every other v2 key verbatim, so a later phase can claim a
 * field "on its own schedule without a second migration event". This is the
 * first phase to need a field out of it, and it reads rather than claims.
 *
 * Reading is the right call here, not laziness. Claiming a key means adding it
 * to `CLAIMED_V2_KEYS`, which moves it out of `legacy` and into the typed
 * shape — a change to every stored save's meaning, made for two numbers that
 * their own phases are going to claim properly anyway. The facility levels
 * belong to Phase 10, which owns `UPGRADE_FACILITY`, and mastery belongs with
 * the systems that grant it. Claiming them now would mean claiming them twice.
 *
 * The cost of reading instead is that these two values are untyped, so they
 * are bounded here exactly as the migration bounds what it claims. Nothing
 * about the round trip changes: `toLegacyPayload` keeps writing the bag back
 * verbatim, so a value read here is still the value the shipped game sees.
 */

/** Mastery is capped in effect anyway; this is a bound against a hostile save. */
const MAX_MASTERY_XP = 100_000_000;

/** Matches the shipped `FACILITY_MAX_LEVEL`. */
const MAX_FACILITY_LEVEL = 999;

/** The shipped VIP track tops out at ten. */
const MAX_VIP_LEVEL = 10;
/*
 * Weeks since the epoch, bounded the way the shipped sanitiser bounds it. The
 * table wraps with a modulo, so the ceiling is about refusing a corrupt save
 * rather than about the calendar.
 */
const MAX_WEEKLY_EVENT_WEEK = 1_000_000;

/**
 * Mastery experience for the class the player is actually playing.
 *
 * `classMasteryXp` is a record keyed by class, and health only ever reads the
 * player's own — a warrior's mastery does nothing for a mage. A save with no
 * class yet reads as zero rather than as a warrior's, because an uncreated
 * character has not earned anything.
 */
export function masteryXpFromLegacy(save: SaveV3): number {
  if (save.identity.playerClass === null) return 0;
  const bag = save.legacy.classMasteryXp;
  if (!isRecord(bag)) return 0;
  return boundedInt(bag[save.identity.playerClass], 0, MAX_MASTERY_XP, 0);
}

/**
 * The tactics facility's level.
 *
 * **Typed since Phase 10**, which is the phase that can raise one. It was read
 * out of `legacy` for three phases before that, as
 * `guildhallFacilities.tactics.level` — a record of records, one level deeper
 * than it looks, which is the shape that made the Phase 7 fixture's first
 * tactics scenario silently measure nothing at all.
 *
 * The name is kept so the callers do not churn, and because it still describes
 * where the number came from.
 */
export function tacticsLevelFromLegacy(save: SaveV3): number {
  return boundedInt(save.facilities.tactics, 0, MAX_FACILITY_LEVEL, 0);
}

/**
 * VIP level, off the typed block.
 *
 * It was `save.legacy.vipLevel` until Phase 10 claimed the five VIP keys, and
 * the name is kept for the same reason `tacticsLevelFromLegacy` keeps its:
 * the callers do not churn, and it still says where the number came from.
 *
 * The level is *derived from the points* on the way in — see `vipSlice.ts` —
 * so this reads a number the save cannot contradict.
 */
export function vipLevelFromLegacy(save: SaveV3): number {
  return boundedInt(save.vip.level, 0, MAX_VIP_LEVEL, 0);
}

/**
 * How many achievements the account has unlocked.
 *
 * The bonus is three percent each with no ceiling, so the *count* is all the
 * damage stack needs — which is why this reads a length rather than claiming
 * the list. `achievements.ts` already carries the catalogue for the screen that
 * shows them.
 */
export function achievementCountFromLegacy(save: SaveV3): number {
  const unlocked = save.legacy.achievements;
  return Array.isArray(unlocked) ? Math.min(unlocked.length, MAX_SAVE_COLLECTION) : 0;
}

/** Whether act one's boss has been cleared, which is what turns the class passive on. */
export function classPassiveUnlockedFromLegacy(save: SaveV3): boolean {
  const unlocks = save.legacy.permanentUnlocks;
  return Array.isArray(unlocks) && unlocks.includes('class_passive');
}

/**
 * The progression side of the damage stack, read out of a save.
 *
 * Five of its ten fields are still in `legacy`, for the reason this file
 * already gives about mastery and tactics: each belongs to a phase that will
 * claim it properly, and claiming them here would mean claiming them twice.
 *
 * `damageBuffPct` is deliberately **not** read. It is a temporary buff that the
 * shipped game ticks down through `damageBuffMs`, and nothing in this build
 * ticks anything down — so honouring a stored one would make it permanent. A
 * buff that never expires is worse than a buff not shown, and usable items are
 * Phase 10's.
 */
export function progressionFromSave(save: SaveV3): ProgressionState {
  return {
    playerClass: save.identity.playerClass,
    prestigeCount: save.progression.prestigeCount,
    achievementCount: achievementCountFromLegacy(save),
    metaDamageLevel: save.progression.metaDamageLevel,
    rebirthDamagePath: save.progression.rebirthDamagePath,
    tacticsFacilityLevel: tacticsLevelFromLegacy(save),
    vipLevel: vipLevelFromLegacy(save),
    classMasteryXp: masteryXpFromLegacy(save),
    classPassiveUnlocked: classPassiveUnlockedFromLegacy(save),
    damageBuffPct: 0,
  };
}

/**
 * The health share below which auto-potion drinks, out of the bag.
 *
 * A player setting with no screen to change it on yet, which is exactly what
 * `legacy` is for: an account that set it in the shipped game keeps its
 * choice, and a new one gets the shipped default. The bounds are the shipped
 * sanitiser's, so a stored 0 does not turn the automation off by the back door.
 */
export function autoPotionThresholdFromLegacy(save: SaveV3): number {
  return boundedFloat(save.legacy.autoUsePotionThresholdPct, 0.1, 1, AUTO_POTION_THRESHOLD);
}

/** Which weekly event is running, out of the bag. Its rotation is Phase 11's. */
export function weeklyEventWeekFromLegacy(save: SaveV3): number {
  return boundedInt(save.calendar.weeklyEventWeek, 0, MAX_WEEKLY_EVENT_WEEK, 0);
}

/**
 * The rarity floor an automatic recycle sweeps up to, out of the bag.
 *
 * `autoRecycleMaxRarity` on the shipped state, defaulting to `uncommon` as it
 * does there — which is not the safest possible default and is the shipped
 * one, and a port that chose `common` would quietly stop recycling the rarity
 * the player's old account had been feeding on.
 */
export function autoRecycleFloorFromLegacy(save: SaveV3): Rarity {
  const stored = save.legacy.autoRecycleMaxRarity;
  return isRarity(stored) ? stored : 'uncommon';
}

/**
 * The account half of the reward chain.
 *
 * Beside `progressionFromSave` rather than inside it, because the two chains
 * share only four of their factors: gold reads the *economy* meta level and
 * rebirth path where damage reads the damage ones, and the treasury and
 * training facilities where damage reads tactics. Widening one state to serve
 * both is how a port ends up multiplying gold by the damage path.
 */
export function economyFromSave(save: SaveV3): EconomyState {
  return {
    prestigeCount: save.progression.prestigeCount,
    achievementCount: achievementCountFromLegacy(save),
    metaEconomyLevel: save.progression.metaEconomyLevel,
    rebirthEconomyPath: save.progression.rebirthEconomyPath,
    classMasteryXp: masteryXpFromLegacy(save),
    vipLevel: vipLevelFromLegacy(save),
    trainingFacilityLevel: boundedInt(save.facilities.training, 0, MAX_FACILITY_LEVEL, 0),
    treasuryFacilityLevel: boundedInt(save.facilities.treasury, 0, MAX_FACILITY_LEVEL, 0),
    weeklyEventWeek: weeklyEventWeekFromLegacy(save),
  };
}

export function teamHealthFromSave(
  save: SaveV3,
  activeHeroes: readonly HealthHero[],
  /**
   * What the player is wearing, summed. Passed in rather than read, because
   * resolving an owned id needs the catalogue and this module may not have it —
   * the same seam `derivedStats` has had since Phase 7.
   */
  equipment?: StatBlock,
): number {
  return teamMaxHp({
    playerClass: save.identity.playerClass,
    alloc: save.stats.alloc,
    equipment,
    activeHeroes,
    metaSurvivalLevel: save.progression.metaSurvivalLevel,
    rebirthSurvivalPath: save.progression.rebirthSurvivalPath,
    classMasteryXp: masteryXpFromLegacy(save),
    tacticsFacilityLevel: tacticsLevelFromLegacy(save),
  });
}
