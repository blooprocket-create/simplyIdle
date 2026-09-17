import { describe, expect, it } from 'vitest';
import fixture from '../combat/__fixtures__/kill-rewards.json';
import { expForLevel } from '../save/migrate';
import { applyExp, heroLevelAfter, HERO_LEVEL_CAP, STAT_POINTS_PER_LEVEL } from './levelUp';

/**
 * The two levellings, against the shipped measurements.
 */

describe('the player levelling off EXP', () => {
  it('reproduces the recorded boss kill', () => {
    /*
     * The fixture drove one boss kill through the shipped reducer from level
     * one: 212 EXP, ending at level 3 with ten unspent stat points. Two levels
     * bought, five points each.
     */
    const boss = fixture.baseline.find(entry => entry.name === 'boss wave')!.paid;
    const gain = applyExp(1, 0, boss.exp);
    expect(gain.level).toBe(boss.playerLevelAfter);
    expect(gain.statPoints).toBe(boss.unspentStatPoints);
  });

  it('reproduces the recorded plain kill, which buys nothing', () => {
    // Ten EXP against a first level priced at eighty. The remainder carries.
    const plain = fixture.baseline.find(entry => entry.name === 'plain wave')!.paid;
    const gain = applyExp(1, 0, plain.exp);
    expect(gain.level).toBe(plain.playerLevelAfter);
    expect(gain.gainedLevels).toBe(0);
    expect(gain.exp).toBe(plain.exp);
  });

  it('buys several levels from one lump', () => {
    // What an offline window or a deep boss hands over. A closed form off the
    // total would be wrong, because each level has its own price.
    const price = expForLevel(1) + expForLevel(2) + expForLevel(3);
    const gain = applyExp(1, 0, price);
    expect(gain.level).toBe(4);
    expect(gain.gainedLevels).toBe(3);
    expect(gain.exp).toBe(0);
    expect(gain.statPoints).toBe(3 * STAT_POINTS_PER_LEVEL);
  });

  it('carries the remainder rather than dropping it', () => {
    /*
     * The instalment property, and the reason banking can happen on any
     * cadence: EXP arriving in two halves has to buy the same level as EXP
     * arriving in one lump.
     */
    const price = expForLevel(1);
    const half = Math.floor(price / 2);
    const once = applyExp(1, 0, price);

    const first = applyExp(1, 0, half);
    const second = applyExp(first.level, first.exp, price - half);
    expect(second.level).toBe(once.level);
    expect(second.exp).toBe(once.exp);
    expect(first.statPoints + second.statPoints).toBe(once.statPoints);
  });

  it('stops one EXP short', () => {
    const price = expForLevel(1);
    expect(applyExp(1, 0, price - 1).level).toBe(1);
    expect(applyExp(1, 0, price).level).toBe(2);
  });

  it('treats a nonsense level or a negative gain as the floor', () => {
    expect(applyExp(0, 0, 0).level).toBe(1);
    expect(applyExp(1, -50, -50).exp).toBe(0);
  });
});

describe('heroes levelling off kills', () => {
  it('reproduces the recorded kill', () => {
    // Every fielded hero gains one; the bench gains nothing. The fixture
    // records which of the two a hero was, and this is the arithmetic.
    const at = (name: string) => fixture.heroLevels.find(entry => entry.name === name)!;
    expect(heroLevelAfter(at('three fielded').startLevel, 1)).toBe(at('three fielded').startLevel + 1);
  });

  it('gains one a kill', () => {
    expect(heroLevelAfter(1, 0)).toBe(1);
    expect(heroLevelAfter(1, 1)).toBe(2);
    expect(heroLevelAfter(40, 12)).toBe(52);
  });

  it('stops at the cap however many kills arrive', () => {
    /*
     * The fixture's own two cases: a hero *at* 999 gains nothing from a kill,
     * and one at 998 gains the single level left. A count rather than a loop
     * is what makes a thousand banked kills land on the ceiling rather than
     * past it.
     */
    expect(heroLevelAfter(HERO_LEVEL_CAP, 1)).toBe(HERO_LEVEL_CAP);
    expect(heroLevelAfter(HERO_LEVEL_CAP - 1, 1)).toBe(HERO_LEVEL_CAP);
    expect(heroLevelAfter(HERO_LEVEL_CAP - 2, 1_000)).toBe(HERO_LEVEL_CAP);
  });

  it('never drops a hero below one', () => {
    expect(heroLevelAfter(0, 0)).toBe(1);
    expect(heroLevelAfter(5, -10)).toBe(5);
  });
});
