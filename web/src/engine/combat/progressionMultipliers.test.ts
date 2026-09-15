import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import type { PlayerClass } from '../../content/classes';
import { safeDecimalMultiplier, safeMultiplier } from '../math/safe';
import {
  MASTERY_DPS_CAP,
  REBIRTH_BONUS,
  REBIRTH_FLOAT_CEILING,
  getClassMasteryLevel,
  getProgressionMultipliers,
  getRebirthLegacyMultiplier,
  getTacticsPowerMultiplier,
  multiplyProgression,
  type ProgressionMultipliers,
  type ProgressionState,
} from './progressionMultipliers';
import fixture from './__fixtures__/progression-multipliers.json';

/**
 * The new side of the progression multiplier contract.
 * `__tests__/progressionMultiplierFixture.test.ts` owns the other.
 */

/** The fixture stores plain JSON numbers; unwrap for an exact comparison. */
function asNumbers(multipliers: ProgressionMultipliers): Record<string, number> {
  return Object.fromEntries(Object.entries(multipliers).map(([key, value]) => [key, (value as Decimal).toNumber()]));
}

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

  it('stays inside the range where Decimal is exact', () => {
    // The fixture compares with `toEqual` above. That is only legitimate while
    // every value is under 2^53; past it a Decimal keeps ~13 significant
    // digits rather than 16 and exact comparison would be the wrong test.
    for (const row of fixture.rows) {
      for (const [key, value] of Object.entries(asNumbers(getProgressionMultipliers(stateFrom(row.scenario))))) {
        expect({ row: row.scenario.name, key, exact: Math.abs(value) < Number.MAX_SAFE_INTEGER }).toEqual({
          row: row.scenario.name,
          key,
          exact: true,
        });
      }
    }
  });

  for (const row of fixture.rows) {
    it(`reproduces "${row.scenario.name}"`, () => {
      // Still exact, not a tolerance. Every value here is below 2^53, where a
      // `Decimal` is layer 0 and its arithmetic is bit-identical to a double's
      // — asserted just below, so this claim cannot quietly stop being true.
      expect(asNumbers(getProgressionMultipliers(stateFrom(row.scenario)))).toEqual(row.multipliers);
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
    expect(multiplyProgression(getProgressionMultipliers(fresh)).toNumber()).toBe(1);
  });

  it('gates the class passive behind its unlock', () => {
    // Berserker's passive is the largest, so the gate is visible.
    const locked = { ...fresh, playerClass: 'berserker' as PlayerClass };
    const unlocked = { ...locked, classPassiveUnlocked: true };
    expect(getProgressionMultipliers(locked).classPassive.toNumber()).toBe(1);
    expect(getProgressionMultipliers(unlocked).classPassive.toNumber()).toBe(1.18);
  });

  it('ignores the unlock when no class is chosen yet', () => {
    const noClass = { ...fresh, playerClass: null, classPassiveUnlocked: true };
    expect(getProgressionMultipliers(noClass).classPassive.toNumber()).toBe(1);
  });

  it('caps mastery however much xp is banked', () => {
    for (const xp of [4_000, 40_000, 4_000_000]) {
      expect(getProgressionMultipliers({ ...fresh, classMasteryXp: xp }).mastery.toNumber()).toBe(1 + MASTERY_DPS_CAP);
    }
  });

  it('floors mastery xp into whole levels', () => {
    // 99 xp is not a level, and 100 is exactly one.
    expect(getClassMasteryLevel(99)).toBe(0);
    expect(getClassMasteryLevel(100)).toBe(1);
    expect(getProgressionMultipliers({ ...fresh, classMasteryXp: 99 }).mastery.toNumber()).toBe(1);
  });

  it('treats a fractional or negative facility level as untrusted save input', () => {
    // These reach the engine from a save file rather than from the engine, so
    // the shipped floor-and-clamp is a guard, not a formality.
    expect(getTacticsPowerMultiplier(4.9).toNumber()).toBe(getTacticsPowerMultiplier(4).toNumber());
    expect(getTacticsPowerMultiplier(-12).toNumber()).toBe(1);
  });

  it('compounds rebirths rather than adding them', () => {
    const three = getProgressionMultipliers({ ...fresh, prestigeCount: 3 }).rebirthLegacy;
    expect(three.toNumber()).toBe(1.5 ** 3);
  });

  it('survives a poisoned buff without returning NaN', () => {
    // The guard is what stands between one bad field and a permanently broken
    // save, so the product it guards is asserted, not assumed.
    const poisoned = { ...fresh, damageBuffPct: Number.NaN };
    const product = multiplyProgression(getProgressionMultipliers(poisoned));
    expect(product.isNan()).toBe(true);
    expect(safeDecimalMultiplier(product).toNumber()).toBe(1);
  });
});

describe('the rebirth multiplier past the float ceiling', () => {
  /*
   * The reason this module is on `Decimal` at all.
   *
   * `1.5^prestigeCount` has no cap. `Math.pow` returns a finite double up to
   * prestige 1,759 and `Infinity` from 1,760 — and the shipped guard for a
   * non-finite multiplier returns **1**. So on the float path a deep prestige
   * account does not merely lose precision, it loses the entire rebirth
   * legacy bonus, silently, in the one number the prestige loop exists to grow.
   */

  /** Worst round-trip error measured below the float ceiling. */
  const DECIMAL_RELATIVE_ERROR = 4e-14;

  const baseline: ProgressionState = {
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

  it('is bit-exact with Math.pow while the value fits in 2^53', () => {
    for (let prestige = 0; prestige <= 90; prestige += 1) {
      expect({ prestige, value: getRebirthLegacyMultiplier(prestige).toNumber() }).toEqual({
        prestige,
        value: Math.pow(REBIRTH_BONUS, prestige),
      });
    }
    // 90 is the last exponent under 2^53, and 91 is the first over it.
    expect(Math.pow(REBIRTH_BONUS, 90)).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(Math.pow(REBIRTH_BONUS, 91)).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
  });

  it('keeps thirteen significant digits between 2^53 and the float ceiling', () => {
    // Every exponent, not a sample: a hybrid that picked the wrong branch
    // anywhere would be a silent balance change.
    let worst = 0;
    for (let prestige = 91; prestige < REBIRTH_FLOAT_CEILING; prestige += 1) {
      const expected = Math.pow(REBIRTH_BONUS, prestige);
      if (!Number.isFinite(expected)) continue;
      const actual = getRebirthLegacyMultiplier(prestige).toNumber();
      worst = Math.max(worst, Math.abs(actual - expected) / expected);
    }
    expect(worst).toBeLessThan(DECIMAL_RELATIVE_ERROR);
    // And it really is lossy up here — if this ever becomes exact, the
    // reasoning in the module comment has gone stale and should be revisited.
    expect(worst).toBeGreaterThan(0);
  });

  it('keeps going where Math.pow gives up', () => {
    expect(Math.pow(REBIRTH_BONUS, REBIRTH_FLOAT_CEILING)).toBe(Number.POSITIVE_INFINITY);

    for (const prestige of [REBIRTH_FLOAT_CEILING, 5_000, 100_000]) {
      const value = getRebirthLegacyMultiplier(prestige);
      expect({ prestige, finite: value.isFinite(), positive: value.gt(0) }).toEqual({
        prestige,
        finite: true,
        positive: true,
      });
    }
    // And it still grows rather than saturating at a ceiling of its own.
    expect(getRebirthLegacyMultiplier(5_000).gt(getRebirthLegacyMultiplier(4_999))).toBe(true);
  });

  it('is what stops a deep prestige account losing every rebirth it earned', () => {
    // The old behaviour, reproduced so the failure this replaces is legible
    // rather than described: an overflowed float multiplier handed to the
    // shipped guard comes back as 1x — no bonus at all.
    expect(safeMultiplier(Math.pow(REBIRTH_BONUS, 5_000))).toBe(1);

    const deep = multiplyProgression(getProgressionMultipliers({ ...baseline, prestigeCount: 5_000 }));
    expect(deep.isFinite()).toBe(true);
    expect(safeDecimalMultiplier(deep).gt(new Decimal(Number.MAX_VALUE))).toBe(true);
  });

  it('carries the whole stack past the ceiling, not just the one factor', () => {
    const product = multiplyProgression(
      getProgressionMultipliers({
        ...baseline,
        prestigeCount: 3_000,
        achievementCount: 40,
        metaDamageLevel: 500,
        rebirthDamagePath: 200,
        vipLevel: 10,
      }),
    );
    expect(product.isFinite()).toBe(true);
    // Larger than any double can hold, which is the whole point.
    expect(product.gt(new Decimal(Number.MAX_VALUE))).toBe(true);
  });
});
