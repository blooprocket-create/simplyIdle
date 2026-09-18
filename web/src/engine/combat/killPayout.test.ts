import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/kill-rewards.json';
import {
  addPayout,
  bossEssence,
  campaignStage,
  CHEST_TEAR_CHANCE,
  EMPTY_PAYOUT,
  isChestNode,
  killPayout,
  MASTERY_XP_PER_BOSS,
  MASTERY_XP_PER_KILL,
  SEASON_POINTS_PER_BOSS,
  SEASON_POINTS_PER_KILL,
} from './killPayout';

/**
 * The four currencies a kill pays besides gold and EXP, against the values
 * measured off the shipped reducer in `__tests__/killRewardFixture.test.ts`.
 */

/** Never rolls a chest. */
const UNLUCKY = () => 0.99;
/** Always rolls one. */
const LUCKY = () => 0.49;

describe('what a kill pays besides gold', () => {
  it('reproduces the recorded plain kill', () => {
    const plain = fixture.baseline.find(entry => entry.name === 'plain wave')!;
    const paid = killPayout(plain.wave, UNLUCKY);
    expect(paid.essence).toBe(plain.paid.essence);
    expect(paid.bossTears).toBe(plain.paid.bossTears);
    expect(paid.seasonPoints).toBe(plain.paid.seasonPoints);
    expect(paid.masteryXp).toBe(plain.paid.masteryXp);
  });

  it('reproduces the recorded boss kill', () => {
    const boss = fixture.baseline.find(entry => entry.name === 'boss wave')!;
    const paid = killPayout(boss.wave, UNLUCKY);
    expect(paid.essence).toBe(boss.paid.essence);
    expect(paid.bossTears).toBe(boss.paid.bossTears);
    expect(paid.seasonPoints).toBe(boss.paid.seasonPoints);
    expect(paid.masteryXp).toBe(boss.paid.masteryXp);
  });

  it('reproduces every recorded boss essence', () => {
    // Nine bosses across six acts, which is what separates the act term from
    // the wave term — a port reading one of them passes a third of these.
    expect(fixture.bossEssence.map(row => [row.wave, bossEssence(row.wave), 1])).toEqual(
      fixture.bossEssence.map(row => [row.wave, row.essence, row.bossTears]),
    );
  });

  it('reproduces every recorded chest node, on both sides of the roll', () => {
    expect(fixture.chestNodes.map(row => killPayout(row.wave, () => row.roll).bossTears)).toEqual(
      fixture.chestNodes.map(row => row.bossTears),
    );
  });

  it('pays a boss more season points and mastery than a plain kill', () => {
    // 92 and 8, not 12 and 2 — and the boss figures are the *sum* for season
    // points but a *replacement* for mastery, which is the asymmetry a port
    // that treated them alike would flatten.
    expect(killPayout(20, UNLUCKY).seasonPoints).toBe(SEASON_POINTS_PER_KILL + SEASON_POINTS_PER_BOSS);
    expect(killPayout(20, UNLUCKY).masteryXp).toBe(MASTERY_XP_PER_BOSS);
    expect(killPayout(7, UNLUCKY).masteryXp).toBe(MASTERY_XP_PER_KILL);
  });
});

describe('where a chest is', () => {
  it('puts one on stages five and fifteen of every chapter', () => {
    expect([5, 15, 25, 35, 45, 55].map(isChestNode)).toEqual([true, true, true, true, true, true]);
  });

  it('puts none on a boss, though ten and twenty divide by five', () => {
    // The trap: a port reading "every fifth stage" pays a boss its tear twice.
    expect([10, 20, 30, 40].map(isChestNode)).toEqual([false, false, false, false]);
    expect(killPayout(20, LUCKY).bossTears).toBe(1);
  });

  it('puts none on an ordinary stage', () => {
    expect([1, 4, 6, 14, 16, 19].map(isChestNode)).toEqual([false, false, false, false, false, false]);
  });

  it('counts the stage within the chapter, not the wave', () => {
    expect([1, 20, 21, 40, 41].map(campaignStage)).toEqual([1, 20, 1, 20, 1]);
  });

  it('misses on exactly a half', () => {
    /*
     * `random() < 0.5`. A port reading "50% chance" as `<=` is wrong once in
     * every two billion rolls and would never be found in play — but a seeded
     * generator that happens to land on the boundary makes it reproducible,
     * and the fixture pins it either way.
     */
    expect(killPayout(5, () => CHEST_TEAR_CHANCE).bossTears).toBe(0);
    expect(killPayout(5, () => CHEST_TEAR_CHANCE - Number.EPSILON).bossTears).toBe(1);
  });

  it('draws both drop chances every kill, and the chest only on a node', () => {
    /*
     * The shipped order, which a seeded generator makes load-bearing:
     * equipment chance, usable chance, then the chest roll — and the chest
     * roll only on a chest node. So an ordinary kill costs **two** draws and a
     * chest node costs three, with everything missing.
     *
     * Drawing the chest on a wave that has none would advance the sequence
     * where the shipped game leaves it alone; drawing it before the two drop
     * chances would hand over three values in the wrong order.
     */
    const counted = () => {
      draws += 1;
      return 0.99;
    };
    let draws = 0;

    killPayout(7, counted);
    expect(draws).toBe(2);

    draws = 0;
    killPayout(20, counted);
    expect(draws).toBe(2);

    draws = 0;
    killPayout(5, counted);
    expect(draws).toBe(3);
  });

  it('spends the first draw on the drop and the second on the chest', () => {
    // A chest node where the first roll wins a drop and the second misses the
    // chest. Swap the two and the outcome swaps with them.
    const scripted = (values: number[]) => {
      let at = 0;
      return () => values[Math.min(at++, values.length - 1)];
    };
    // Equipment wins, usable misses, chest misses.
    const dropOnly = killPayout(5, scripted([0.01, 0.99, 0.99]));
    expect(dropOnly.equipmentDrops).toEqual([5]);
    expect(dropOnly.usableDrops).toEqual([]);
    expect(dropOnly.bossTears).toBe(0);

    // Equipment misses, usable wins — which costs a draw for the item itself,
    // so the chest roll is the *fourth* value rather than the third.
    const usableOnly = killPayout(5, scripted([0.99, 0.01, 0.5, 0.99]));
    expect(usableOnly.equipmentDrops).toEqual([]);
    expect(usableOnly.usableDrops).toHaveLength(1);
    expect(usableOnly.bossTears).toBe(0);

    // Both drop chances miss, so the chest roll is the third value.
    const chestOnly = killPayout(5, scripted([0.99, 0.99, 0.01]));
    expect(chestOnly.equipmentDrops).toEqual([]);
    expect(chestOnly.bossTears).toBe(1);
  });
});

describe('a run of kills', () => {
  it('adds up, and starts from nothing', () => {
    expect(EMPTY_PAYOUT).toEqual({
      essence: 0,
      bossTears: 0,
      seasonPoints: 0,
      masteryXp: 0,
      equipmentDrops: [],
      usableDrops: [],
    });
    const run = [7, 8, 9, 10].reduce((into, wave) => addPayout(into, killPayout(wave, UNLUCKY)), EMPTY_PAYOUT);
    // Three plain kills and one boss: 12 × 3 + 92, mastery 2 × 3 + 8.
    expect(run.seasonPoints).toBe(SEASON_POINTS_PER_KILL * 3 + SEASON_POINTS_PER_KILL + SEASON_POINTS_PER_BOSS);
    expect(run.masteryXp).toBe(MASTERY_XP_PER_KILL * 3 + MASTERY_XP_PER_BOSS);
    expect(run.bossTears).toBe(1);
    expect(run.essence).toBe(bossEssence(10));
  });
});
