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
 * Every factor here is linear in one field, which is worth stating plainly
 * because the shipped code spreads them across five hundred lines and it is
 * not obvious until they sit together that the whole progression stack is
 * `1 + level * rate`.
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
  rebirthLegacy: number;
  achievementLegacy: number;
  metaDamage: number;
  rebirthDamagePath: number;
  tacticsFacility: number;
  classPassive: number;
  mastery: number;
  vipDamage: number;
  temporaryBuff: number;
}

export function getRebirthLegacyMultiplier(prestigeCount: number): number {
  return Math.pow(REBIRTH_BONUS, prestigeCount);
}

export function getAchievementLegacyMultiplier(achievementCount: number): number {
  return 1 + achievementCount * ACHIEVEMENT_BONUS_PER_UNLOCK;
}

export function getMetaDamageMultiplier(metaDamageLevel: number): number {
  return 1 + metaDamageLevel * META_PER_LEVEL;
}

export function getRebirthDamagePathMultiplier(rebirthDamagePath: number): number {
  return 1 + rebirthDamagePath * REBIRTH_PATH_PER_LEVEL;
}

export function getTacticsPowerMultiplier(tacticsFacilityLevel: number): number {
  // Floored and clamped as shipped: the facility level reaches this from a
  // save, so it is untrusted input rather than a number the engine chose.
  const level = Math.max(0, Math.floor(tacticsFacilityLevel));
  return 1 + level * TACTICS_PER_LEVEL;
}

export function getClassPassiveDpsMultiplier(state: ProgressionState): number {
  if (!state.classPassiveUnlocked || !state.playerClass) return 1;
  return getClassPassive(state.playerClass).dpsMultiplier;
}

export function getClassMasteryLevel(classMasteryXp: number): number {
  return Math.floor(classMasteryXp / MASTERY_XP_PER_LEVEL);
}

export function getMasteryDpsMultiplier(classMasteryXp: number): number {
  const level = getClassMasteryLevel(classMasteryXp);
  return 1 + Math.min(MASTERY_DPS_CAP, level * MASTERY_DPS_PER_LEVEL);
}

export function getVipDamageMultiplier(vipLevel: number): number {
  return 1 + vipLevel * VIP_DAMAGE_PER_LEVEL;
}

export function getTemporaryBuffMultiplier(damageBuffPct: number): number {
  return 1 + damageBuffPct;
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
export function multiplyProgression(multipliers: ProgressionMultipliers): number {
  return (
    multipliers.rebirthLegacy *
    multipliers.achievementLegacy *
    multipliers.metaDamage *
    multipliers.rebirthDamagePath *
    multipliers.tacticsFacility *
    multipliers.classPassive *
    multipliers.mastery *
    multipliers.vipDamage *
    multipliers.temporaryBuff
  );
}
