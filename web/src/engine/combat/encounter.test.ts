import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { getMonsterAffixModifiers } from '../../content/affixes';
import { getMonsterMaxHp } from '../waves/curves';
import { applyHit, spawnEnemy } from './encounter';

describe('spawning a monster', () => {
  it('uses the wave curve crossed with the wave affix', () => {
    for (const wave of [1, 10, 37, 120]) {
      const enemy = spawnEnemy(wave);
      const expected = getMonsterMaxHp(wave).mul(getMonsterAffixModifiers(wave).hpMult);
      expect({ wave, hp: enemy.hp.toNumber() }).toEqual({ wave, hp: expected.toNumber() });
      expect(enemy.hp.eq(enemy.maxHp)).toBe(true);
    }
  });

  it('applies affixes here rather than leaving them to the caller', () => {
    // So the live simulation and the offline estimator face the same monster.
    // A boss carries two affixes, so its multiplier is the larger one.
    expect(getMonsterAffixModifiers(10).hpMult).toBeGreaterThan(getMonsterAffixModifiers(11).hpMult);
    expect(spawnEnemy(10).hp.gt(getMonsterMaxHp(10))).toBe(true);
  });

  it('refuses a nonsense wave rather than producing a nonsense monster', () => {
    for (const wave of [0, -5, 1.7]) {
      expect(spawnEnemy(wave).wave).toBe(1);
    }
  });

  it('scales with the weekly event multiplier it is given', () => {
    expect(spawnEnemy(50, 2).hp.toNumber()).toBeCloseTo(spawnEnemy(50, 1).hp.mul(2).toNumber(), 6);
  });
});

describe('landing a hit', () => {
  const enemy = spawnEnemy(1);

  it('takes the damage off when the monster survives', () => {
    const result = applyHit(enemy, new Decimal(5));
    expect(result.killed).toBe(false);
    expect(result.dealt.toNumber()).toBe(5);
    expect(result.overkill.toNumber()).toBe(0);
    expect(result.enemy.hp.toNumber()).toBe(enemy.hp.toNumber() - 5);
  });

  it('kills exactly on the last point of health, with nothing wasted', () => {
    const result = applyHit(enemy, enemy.hp);
    expect(result.killed).toBe(true);
    expect(result.overkill.toNumber()).toBe(0);
    expect(result.enemy.hp.toNumber()).toBe(0);
  });

  it('wastes whatever the killing blow carried past zero', () => {
    /*
     * The whole reason this is a module and not a subtraction. Continuous
     * damage stops at exactly zero; a whole swing cannot. What it carries past
     * is gone, and saying so is what stops the discrete model being quietly
     * stronger than the one it replaces.
     */
    const overshoot = enemy.hp.add(17);
    const result = applyHit(enemy, overshoot);
    expect(result.killed).toBe(true);
    expect(result.dealt.toNumber()).toBe(enemy.hp.toNumber());
    expect(result.overkill.toNumber()).toBe(17);
    // Dealt plus overkill is always what was swung for.
    expect(result.dealt.add(result.overkill).toNumber()).toBe(overshoot.toNumber());
  });

  it('never credits more damage than the monster had', () => {
    const result = applyHit(enemy, new Decimal('1e50'));
    expect(result.dealt.eq(enemy.hp)).toBe(true);
    expect(result.dealt.lte(enemy.maxHp)).toBe(true);
  });

  it('ignores a zero, negative or non-finite hit', () => {
    for (const amount of [new Decimal(0), new Decimal(-5), new Decimal(Number.NaN)]) {
      const result = applyHit(enemy, amount);
      expect({ amount: amount.toString(), killed: result.killed, dealt: result.dealt.toNumber() }).toEqual({
        amount: amount.toString(),
        killed: false,
        dealt: 0,
      });
      // And it leaves the monster exactly as it was.
      expect(result.enemy).toBe(enemy);
    }
  });

  it('does not mutate the monster it was given', () => {
    const before = enemy.hp.toNumber();
    applyHit(enemy, new Decimal(3));
    expect(enemy.hp.toNumber()).toBe(before);
  });
});
