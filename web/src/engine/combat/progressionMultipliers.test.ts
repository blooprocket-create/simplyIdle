import { describe, expect, it } from 'vitest';
import type { PlayerClass } from '../../content/classes';
import { safeMultiplier } from '../math/safe';
import {
  MASTERY_DPS_CAP,
  getClassMasteryLevel,
  getProgressionMultipliers,
  getTacticsPowerMultiplier,
  multiplyProgression,
  type ProgressionState,
} from './progressionMultipliers';
import fixture from './__fixtures__/progression-multipliers.json';

/**
 * The new side of the progression multiplier contract.
 * `__tests__/progressionMultiplierFixture.test.ts` owns the other.
 */

function stateFrom(scenario: (typeof fixture.rows)[number]['scenario']): ProgressionState {
  return {
    playerClass: scenario.playerClass as PlayerClass,
    prestigeCount: scenario.prestigeCount,
    achievementCount: scenario.achievementCount,
    metaDamageLevel: scenario.metaDamageLevel,
    rebirthDamagePath: scenario.rebirthDamagePath,
    tacticsFacilityLevel: scenario.tacticsFacilityLevel,
    vipLevel: scenario.vipLevel,
    classMasteryXp: scenario.classMasteryXp,
    classPassiveUnlocked: scenario.classPassiveUnlocked,
    damageBuffPct: scenario.damageBuffPct,
  };
}

describe('progression multipliers match the shipped implementation', () => {
  it('has a fixture to check against', () => {
    expect(fixture.rows.length).toBeGreaterThan(5);
    expect(fixture.generatedFrom).toBe('src/useGameState.ts getDpsBreakdown');
  });

  for (const row of fixture.rows) {
    it(`reproduces "${row.scenario.name}"`, () => {
      // Same arithmetic on the same floats: exact, not a tolerance.
      expect(getProgressionMultipliers(stateFrom(row.scenario))).toEqual(row.multipliers);
    });
  }
});

describe('progression multiplier behaviour', () => {
  const fresh: ProgressionState = {
    playerClass: 'warrior',
    prestigeCount: 0,
    achievementCount: 0,
    metaDamageLevel: 0,
    rebirthDamagePath: 0,
    tacticsFacilityLevel: 0,
    vipLevel: 0,
    classMasteryXp: 0,
    classPassiveUnlocked: false,
    damageBuffPct: 0,
  };

  it('is a no-op product on a fresh character', () => {
    expect(multiplyProgression(getProgressionMultipliers(fresh))).toBe(1);
  });

  it('gates the class passive behind its unlock', () => {
    // Berserker's passive is the largest, so the gate is visible.
    const locked = { ...fresh, playerClass: 'berserker' as PlayerClass };
    const unlocked = { ...locked, classPassiveUnlocked: true };
    expect(getProgressionMultipliers(locked).classPassive).toBe(1);
    expect(getProgressionMultipliers(unlocked).classPassive).toBe(1.18);
  });

  it('ignores the unlock when no class is chosen yet', () => {
    const noClass = { ...fresh, playerClass: null, classPassiveUnlocked: true };
    expect(getProgressionMultipliers(noClass).classPassive).toBe(1);
  });

  it('caps mastery however much xp is banked', () => {
    for (const xp of [4_000, 40_000, 4_000_000]) {
      expect(getProgressionMultipliers({ ...fresh, classMasteryXp: xp }).mastery).toBe(1 + MASTERY_DPS_CAP);
    }
  });

  it('floors mastery xp into whole levels', () => {
    // 99 xp is not a level, and 100 is exactly one.
    expect(getClassMasteryLevel(99)).toBe(0);
    expect(getClassMasteryLevel(100)).toBe(1);
    expect(getProgressionMultipliers({ ...fresh, classMasteryXp: 99 }).mastery).toBe(1);
  });

  it('treats a fractional or negative facility level as untrusted save input', () => {
    // These reach the engine from a save file rather than from the engine, so
    // the shipped floor-and-clamp is a guard, not a formality.
    expect(getTacticsPowerMultiplier(4.9)).toBe(getTacticsPowerMultiplier(4));
    expect(getTacticsPowerMultiplier(-12)).toBe(1);
  });

  it('compounds rebirths rather than adding them', () => {
    const three = getProgressionMultipliers({ ...fresh, prestigeCount: 3 }).rebirthLegacy;
    expect(three).toBe(1.5 ** 3);
  });

  it('survives a poisoned buff without returning NaN', () => {
    // safeMultiplier is what stands between one bad field and a permanently
    // broken save, so the product it guards is asserted, not assumed.
    const poisoned = { ...fresh, damageBuffPct: Number.NaN };
    const product = multiplyProgression(getProgressionMultipliers(poisoned));
    expect(Number.isNaN(product)).toBe(true);
    expect(safeMultiplier(product)).toBe(1);
  });
});
