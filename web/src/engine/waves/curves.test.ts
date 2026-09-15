import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { getActForWave } from '../../content/acts';
import { getMonsterForWave } from '../../content/monsters';
import { expForLevel, getMonsterDamage, getMonsterExp, getMonsterGold, getMonsterMaxHp } from './curves';
import fixture from './__fixtures__/wave-curves.json';

/**
 * The new side of the parity contract. `__tests__/waveCurveFixture.test.ts` in
 * the Expo app owns the other: it asserts this fixture still describes what
 * `src/gameConfig.ts` actually does, so the two cannot drift apart silently.
 *
 * Porting a live game's balance is the one place a rewrite cannot be
 * "approximately right" — a curve that is 2% steep is a different game by
 * wave 200.
 */

describe('wave curves match the shipped game', () => {
  it('has a fixture to check against', () => {
    expect(fixture.waves.length).toBeGreaterThan(20);
    expect(fixture.generatedFrom).toBe('src/gameConfig.ts');
  });

  for (const row of fixture.waves) {
    it(`reproduces wave ${row.wave}`, () => {
      // The integer curves must land on the same integer. No tolerance: a
      // rewards curve that is one gold out is a different economy.
      expect({
        hp: getMonsterMaxHp(row.wave).toNumber(),
        gold: getMonsterGold(row.wave).toNumber(),
        exp: getMonsterExp(row.wave).toNumber(),
        monster: getMonsterForWave(row.wave).name,
        emoji: getMonsterForWave(row.wave).emoji,
        act: getActForWave(row.wave).id,
      }).toEqual({
        hp: row.hp,
        gold: row.gold,
        exp: row.exp,
        monster: row.monster,
        emoji: row.emoji,
        act: row.act,
      });

      // Damage is the one fractional curve — floor(...)/10, then 2.5x on a
      // boss — so the two numeric systems round its last bit differently
      // (1.5 against 1.5000000000000002). Measured across every sampled wave
      // the worst relative difference is 2.17e-16, inside one float ULP, so
      // agreement to Number.EPSILON is the strictest bar that means anything
      // here rather than a tolerance chosen to make a failure pass.
      const damage = getMonsterDamage(row.wave).toNumber();
      expect(Math.abs(damage - row.damage) / Math.abs(row.damage)).toBeLessThanOrEqual(Number.EPSILON);
    });
  }

  /*
   * Past wave ~231 the shipped curves and these disagree by a few integer
   * units on values near 1e14 — Math.pow and Decimal.pow are both float-backed
   * and differ in their last ULP, and flooring turns that into an integer
   * difference. Neither answer is the more correct one, so the bar here is
   * relative rather than exact. Observed worst case is ~5e-15; 1e-12 leaves
   * room without being loose enough to hide a real balance change, which would
   * show up as a difference many orders of magnitude larger.
   */
  const DEEP_WAVE_TOLERANCE = 1e-12;

  for (const row of fixture.deepWaves) {
    it(`tracks wave ${row.wave} to within a float ULP`, () => {
      const actual = {
        hp: getMonsterMaxHp(row.wave).toNumber(),
        gold: getMonsterGold(row.wave).toNumber(),
        exp: getMonsterExp(row.wave).toNumber(),
      };
      for (const field of ['hp', 'gold', 'exp'] as const) {
        const expected = row[field];
        expect(Math.abs(actual[field] - expected) / Math.abs(expected)).toBeLessThanOrEqual(DEEP_WAVE_TOLERANCE);
      }
      expect(getMonsterForWave(row.wave).name).toBe(row.monster);
      expect(getActForWave(row.wave).id).toBe(row.act);
    });
  }

  it('reproduces the level curve', () => {
    for (const row of fixture.levels) {
      expect(expForLevel(row.level).toNumber()).toBe(row.exp);
    }
  });
});

describe('wave curves past the float ceiling', () => {
  /*
   * The reason for Decimal. The shipped curves are JS floats, so gold stops
   * being an exact integer at wave 260, HP at 290 and EXP at 300, and all
   * three reach Infinity between waves 5,390 and 6,240 — in a game whose save
   * schema permits a wave of 1,000,000.
   */

  it('stays an exact integer where the float curves stop being one', () => {
    for (const wave of [260, 290, 300, 1_000, 10_000]) {
      for (const value of [getMonsterMaxHp(wave), getMonsterGold(wave), getMonsterExp(wave)]) {
        // `floor()` is a no-op on a value that is already integral, so a
        // difference here is precision that was silently lost.
        expect(value.sub(value.floor()).eq(0)).toBe(true);
      }
    }
  });

  it('stays finite where the float curve reaches Infinity', () => {
    // The shipped HP curve, inline, so the comparison is against what the
    // game actually computes. Math.pow(1.12, 6219) is itself still finite —
    // it is the 30x that tips it over, which is why the ceiling has to be
    // measured on the whole expression rather than on the exponent.
    const shippedHp = (wave: number) => {
      const base = Math.floor(30 * Math.pow(1.12, wave - 1));
      return wave % 10 === 0 ? base * 5 : base;
    };

    for (const wave of [6_220, 10_000, 100_000, 1_000_000]) {
      expect(Number.isFinite(shippedHp(wave))).toBe(false);

      const hp = getMonsterMaxHp(wave);
      expect(hp.isFinite()).toBe(true);
      expect(hp.gt(0)).toBe(true);
    }
  });

  it('keeps growing monotonically across the float ceiling', () => {
    // The failure a ceiling produces is not a crash but a curve that flattens
    // or reverses, which reads as a balance bug rather than a numeric one.
    let previous = new Decimal(0);
    for (let wave = 6_000; wave <= 6_400; wave += 20) {
      // Compare like with like: bosses carry a 5x multiplier.
      if (wave % 10 === 0) continue;
      const hp = getMonsterMaxHp(wave);
      expect(hp.gt(previous)).toBe(true);
      previous = hp;
    }
  });
});
