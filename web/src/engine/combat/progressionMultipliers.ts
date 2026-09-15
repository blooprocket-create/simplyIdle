import Decimal from 'break_eternity.js';
import { getClassPassive } from '../../content/classPassives';
import type { PlayerClass } from '../../content/classes';

/**
 * The half of the damage multiplier stack driven by *player progression* —
 * rebirths, achievements, meta upgrades, facilities, VIP, mastery, and the
 * temporary buff.
 *
 * The other half is driven by *team shape*: formation, synergy, hero passives,
 * team boost and unique relics all depend on who is standing where, so they
 * belong with the roster model and land in the next slice. The shipped code
 * multiplies all fourteen together in one expression; splitting them along
 * that seam is what makes each half independently checkable.
 *
 * Every factor here is linear in one field *except one*, which is worth
 * stating plainly because the shipped code spreads them across five hundred
 * lines and it is not obvious until they sit together that the whole
 * progression stack is `1 + level * rate` — apart from rebirth legacy, which
 * compounds.
 *
 * **Why these are `Decimal` and the team-shape multipliers are not.** Rebirth
 * legacy is `1.5^prestigeCount` with no cap, so `Math.pow` returns `Infinity`
 * from prestige 1,760 on. The shipped guard for a non-finite multiplier is
 * `safeMultiplier`, which returns 1 — so past that point a player's entire
 * rebirth legacy silently becomes *no bonus at all*, which is the worst
 * possible failure for the one number a prestige loop exists to grow. The
 * team-shape multipliers all carry hard caps (relic 40x, formation 1.95x,
 * passives 12x) and cannot leave float range, so they stay `number`;
 * `progressionMultipliers.test.ts` pins that distinction rather than leaving
 * it to taste.
 *
 * `Decimal` buys **range at the cost of a few digits**, and it is worth being
 * exact about where the line falls, because it is not where it first appears.
 *
 * Below 2^53 a `Decimal` is layer 0: the magnitude *is* the double, so adds and
 * multiplies are bit-identical to float arithmetic and nothing is lost. Above
 * 2^53 it switches to layer 1 and stores log10 of the magnitude as a double
 * instead — unlimited range, but the mantissa thins out. Measured across every
 * prestige count below the float ceiling, the worst relative error is
 * **3.7e-14**, so roughly thirteen significant digits survive where a double
 * would have kept sixteen. For a multiplier a player reads to three digits
 * that is invisible; losing the whole bonus to an `Infinity` is not. That is
 * the trade, made deliberately.
 *
 * `Decimal.pow` is a separate matter: it routes through log/exp and disagrees
 * with `Math.pow` on 284 of the first 301 integer exponents. So the float
 * answer is preferred wherever one exists, and `pow` is reached only past the
 * point where there is no float answer to be faithful to.
 */

export const REBIRTH_BONUS = 1.5;
export const ACHIEVEMENT_BONUS_PER_UNLOCK = 0.03;
export const META_PER_LEVEL = 0.05;
export const REBIRTH_PATH_PER_LEVEL = 0.07;
export const TACTICS_PER_LEVEL = 0.025;
export const VIP_DAMAGE_PER_LEVEL = 0.03;
export const MASTERY_XP_PER_LEVEL = 100;
export const MASTERY_DPS_PER_LEVEL = 0.01;
export const MASTERY_DPS_CAP = 0.4;

/** The progression state the damage stack reads. Nothing about the team. */
export interface ProgressionState {
  playerClass: PlayerClass | null;
  prestigeCount: number;
  achievementCount: number;
  metaDamageLevel: number;
  rebirthDamagePath: number;
  tacticsFacilityLevel: number;
  vipLevel: number;
  classMasteryXp: number;
  /** Whether the class passive has been unlocked by clearing act 1's boss. */
  classPassiveUnlocked: boolean;
  /** Active temporary damage buff, as a fraction. */
  damageBuffPct: number;
}

export interface ProgressionMultipliers {
  rebirthLegacy: Decimal;
  achievementLegacy: Decimal;
  metaDamage: Decimal;
  rebirthDamagePath: Decimal;
  tacticsFacility: Decimal;
  classPassive: Decimal;
  mastery: Decimal;
  vipDamage: Decimal;
  temporaryBuff: Decimal;
}

/** The exponent past which `Math.pow(1.5, n)` stops returning a finite double. */
export const REBIRTH_FLOAT_CEILING = 1_760;

/**
 * `1.5^prestigeCount`, the one factor that compounds.
 *
 * Uses the double while a double exists, because `Math.pow` is exact to its
 * 53 bits there and `Decimal.pow` is not. Beyond that there is no float answer
 * to be faithful to, so range wins.
 */
export function getRebirthLegacyMultiplier(prestigeCount: number): Decimal {
  const asDouble = Math.pow(REBIRTH_BONUS, prestigeCount);
  if (Number.isFinite(asDouble)) return new Decimal(asDouble);
  return new Decimal(REBIRTH_BONUS).pow(prestigeCount);
}

export function getAchievementLegacyMultiplier(achievementCount: number): Decimal {
  return new Decimal(1 + achievementCount * ACHIEVEMENT_BONUS_PER_UNLOCK);
}

export function getMetaDamageMultiplier(metaDamageLevel: number): Decimal {
  return new Decimal(1 + metaDamageLevel * META_PER_LEVEL);
}

export function getRebirthDamagePathMultiplier(rebirthDamagePath: number): Decimal {
  return new Decimal(1 + rebirthDamagePath * REBIRTH_PATH_PER_LEVEL);
}

export function getTacticsPowerMultiplier(tacticsFacilityLevel: number): Decimal {
  // Floored and clamped as shipped: the facility level reaches this from a
  // save, so it is untrusted input rather than a number the engine chose.
  const level = Math.max(0, Math.floor(tacticsFacilityLevel));
  return new Decimal(1 + level * TACTICS_PER_LEVEL);
}

export function getClassPassiveDpsMultiplier(state: ProgressionState): Decimal {
  if (!state.classPassiveUnlocked || !state.playerClass) return new Decimal(1);
  return new Decimal(getClassPassive(state.playerClass).dpsMultiplier);
}

export function getClassMasteryLevel(classMasteryXp: number): number {
  return Math.floor(classMasteryXp / MASTERY_XP_PER_LEVEL);
}

export function getMasteryDpsMultiplier(classMasteryXp: number): Decimal {
  const level = getClassMasteryLevel(classMasteryXp);
  return new Decimal(1 + Math.min(MASTERY_DPS_CAP, level * MASTERY_DPS_PER_LEVEL));
}

export function getVipDamageMultiplier(vipLevel: number): Decimal {
  return new Decimal(1 + vipLevel * VIP_DAMAGE_PER_LEVEL);
}

export function getTemporaryBuffMultiplier(damageBuffPct: number): Decimal {
  return new Decimal(1 + damageBuffPct);
}

/** Every progression factor, kept apart so a UI can explain where power came from. */
export function getProgressionMultipliers(state: ProgressionState): ProgressionMultipliers {
  return {
    rebirthLegacy: getRebirthLegacyMultiplier(state.prestigeCount),
    achievementLegacy: getAchievementLegacyMultiplier(state.achievementCount),
    metaDamage: getMetaDamageMultiplier(state.metaDamageLevel),
    rebirthDamagePath: getRebirthDamagePathMultiplier(state.rebirthDamagePath),
    tacticsFacility: getTacticsPowerMultiplier(state.tacticsFacilityLevel),
    classPassive: getClassPassiveDpsMultiplier(state),
    mastery: getMasteryDpsMultiplier(state.classMasteryXp),
    vipDamage: getVipDamageMultiplier(state.vipLevel),
    temporaryBuff: getTemporaryBuffMultiplier(state.damageBuffPct),
  };
}

/**
 * Their product, in the shipped order.
 *
 * Order matters for the last bits of the float even though multiplication is
 * mathematically commutative, and the parity suite compares against the
 * shipped value, so this reproduces the sequence rather than reducing over an
 * object whose key order is incidental.
 */
export function multiplyProgression(multipliers: ProgressionMultipliers): Decimal {
  return multipliers.rebirthLegacy
    .mul(multipliers.achievementLegacy)
    .mul(multipliers.metaDamage)
    .mul(multipliers.rebirthDamagePath)
    .mul(multipliers.tacticsFacility)
    .mul(multipliers.classPassive)
    .mul(multipliers.mastery)
    .mul(multipliers.vipDamage)
    .mul(multipliers.temporaryBuff);
}
