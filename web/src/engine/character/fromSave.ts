import { boundedInt, isRecord } from '../save/guards';
import type { SaveV3 } from '../save/schema';
import { teamMaxHp, type HealthHero } from './stats';

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
 * Stored as `guildhallFacilities.tactics.level` — a record of records, one
 * level deeper than it looks, which is the shape that made the fixture's first
 * tactics scenario silently do nothing when it was written as a flat map.
 */
export function tacticsLevelFromLegacy(save: SaveV3): number {
  const facilities = save.legacy.guildhallFacilities;
  if (!isRecord(facilities)) return 0;
  const tactics = facilities.tactics;
  if (!isRecord(tactics)) return 0;
  return boundedInt(tactics.level, 0, MAX_FACILITY_LEVEL, 0);
}

export function teamHealthFromSave(save: SaveV3, activeHeroes: readonly HealthHero[]): number {
  return teamMaxHp({
    playerClass: save.identity.playerClass,
    alloc: save.stats.alloc,
    activeHeroes,
    metaSurvivalLevel: save.progression.metaSurvivalLevel,
    rebirthSurvivalPath: save.progression.rebirthSurvivalPath,
    classMasteryXp: masteryXpFromLegacy(save),
    tacticsFacilityLevel: tacticsLevelFromLegacy(save),
  });
}
