import { describe, expect, it } from 'vitest';
import type { Rarity } from '../../content/rarities';
import {
  HERO_LEVEL_CAP,
  HERO_RANK_CAP,
  RANK_CONFIGS,
  calculateShardReward,
  heroGoldLevelCost,
  heroRebirthPlan,
  levelUpWithGold,
  rankUp,
  rankUpCostToTarget,
  rankUpShardCost,
  rankUpToMax,
  rebirth,
  recycleShards,
  type RosterHero,
  type Wallet,
} from './progression';
import fixture from './__fixtures__/hero-progression.json';

/**
 * Hero progression, against the shipped game.
 *
 * `__tests__/heroProgressionFixture.test.ts` recorded every formula across its
 * whole sampled range before this existed. There are no dice here, so the
 * claim is simply that every sampled point agrees — and then that the three
 * shipped oddities the fixture found are reproduced rather than tidied away.
 */

const RICH: Wallet = { gold: 1e12, heroShards: 1e12, essence: 1e12 };

function hero(overrides: Partial<RosterHero> = {}): RosterHero {
  return { uid: 'u0', rarity: 'common', level: 1, rank: 1, rebirthStatMult: 1, ...overrides };
}

describe('the recorded formulas', () => {
  it('prices a gold level exactly as shipped', () => {
    for (const entry of fixture.goldLevelCost) {
      expect({ level: entry.level, cost: heroGoldLevelCost(entry.level) }).toEqual(entry);
    }
  });

  it('prices a rank exactly as shipped, sentinel included', () => {
    for (const entry of fixture.rankUpShardCost) {
      expect({ ...entry, got: rankUpShardCost(entry.rarity as Rarity, entry.targetRank) }).toEqual({
        ...entry,
        got: entry.cost,
      });
    }
  });

  it('carries the authored rank table unreordered', () => {
    // The table is looked up by `rankNumber` rather than by index, so a
    // reordering would not break the lookup — it would silently re-price every
    // rank. Compared as a whole rather than by membership for that reason.
    expect(RANK_CONFIGS.map(entry => ({ ...entry }))).toEqual(fixture.rankConfigs);
  });

  it('pays a recycle exactly as shipped', () => {
    for (const entry of fixture.shardReward) {
      expect({ ...entry, got: calculateShardReward(entry.rarity as Rarity, entry.level) }).toEqual({
        ...entry,
        got: entry.shards,
      });
    }
  });

  it('plans a rebirth exactly as shipped', () => {
    for (const entry of fixture.rebirthPlans) {
      const plan = heroRebirthPlan(entry.rarity as Rarity, entry.level, entry.rebirthStatMult);
      expect({ ...entry, plan }).toEqual({
        ...entry,
        plan: {
          estimatedRebirths: entry.estimatedRebirths,
          shardCost: entry.shardCost,
          essenceCost: entry.essenceCost,
          nextStatMultiplier: entry.nextStatMultiplier,
          statGainPct: entry.statGainPct,
        },
      });
    }
  });

  it('sums a walk of ranks out of the same per-rank prices', () => {
    // Not recorded directly — it is a fold over prices that are — so it is
    // checked against them rather than against a second recorded list.
    for (const rarity of ['common', 'epic', 'transcendent'] as Rarity[]) {
      let expected = 0;
      for (let rank = 2; rank <= HERO_RANK_CAP; rank += 1) expected += rankUpShardCost(rarity, rank);
      expect({ rarity, total: rankUpCostToTarget(rarity, 1, HERO_RANK_CAP) }).toEqual({ rarity, total: expected });
    }

    // A target at or below the current rank costs nothing rather than refunding.
    expect(rankUpCostToTarget('epic', 5, 5)).toBe(0);
    expect(rankUpCostToTarget('epic', 5, 2)).toBe(0);
    // And a target past the cap is clamped to it rather than reaching the
    // sentinel, which would make the whole walk unaffordable.
    expect(rankUpCostToTarget('epic', 1, 99)).toBe(rankUpCostToTarget('epic', 1, HERO_RANK_CAP));
  });
});

describe('the three oddities, reproduced on purpose', () => {
  it('pays a level-one hero the level-two recycle rate', () => {
    /*
     * `1 + Math.max(1, level - 1) * 0.15`. The floor is on the wrong side of
     * the subtraction to be a guard against zero, so the first level a hero
     * gains is worth nothing when recycling them.
     *
     * A port that "fixed" it would pay less for a level-one hero than the
     * shipped game does — and the two apps share accounts, so that is a refund
     * a player would notice going missing.
     */
    for (const rarity of ['common', 'rare', 'transcendent'] as Rarity[]) {
      expect(calculateShardReward(rarity, 1)).toBe(calculateShardReward(rarity, 2));
      expect(calculateShardReward(rarity, 3)).toBeGreaterThan(calculateShardReward(rarity, 2));
    }
  });

  it('lets a rank past the table return a finite sentinel', () => {
    /*
     * `Number.MAX_SAFE_INTEGER`, which is *finite* — so the shipped reducer's
     * `Number.isFinite(cost)` guard passes it. What actually stops a
     * rank-eleven attempt is the separate `rank >= 10` check, and a port that
     * returned `Infinity` here would be relying on the guard that does not do
     * the work.
     */
    expect(rankUpShardCost('common', HERO_RANK_CAP + 1)).toBe(Number.MAX_SAFE_INTEGER);
    expect(Number.isFinite(rankUpShardCost('common', HERO_RANK_CAP + 1))).toBe(true);
    // And the check that really guards it.
    expect(rankUp(hero({ rank: HERO_RANK_CAP, level: HERO_LEVEL_CAP }), RICH)).toBeNull();
  });

  it('reconstructs the rebirth count by logarithm, epsilon and all', () => {
    /*
     * The count is never stored; it comes back as
     * `floor(log(mult) / log(1.15) + 1e-6)`.
     *
     * The first version of this test did not check the epsilon at all —
     * deleting it from the port left every assertion green, which is how I
     * found out that the reason I had written in the comment was wrong. The
     * epsilon does not guard the four-decimal rounding: across the first
     * twelve rebirths the rounded multipliers reconstruct identically with it
     * and without it.
     *
     * What it guards is the float. `1.15 ** 3` is not exactly 1.520875, so its
     * logarithm lands a hair below 3 and `floor` returns 2 — a thrice-reborn
     * hero charged the twice-reborn price. It changes the answer at exactly
     * two of the first twelve powers.
     */
    expect(heroRebirthPlan('epic', 200, 1).estimatedRebirths).toBe(0);
    expect(heroRebirthPlan('epic', 200, 1.15).estimatedRebirths).toBe(1);
    expect(heroRebirthPlan('epic', 200, 1.3225).estimatedRebirths).toBe(2);

    // The cases the epsilon actually decides: exact computed powers, not the
    // rounded literals above. Without it these return 2 and 3.
    expect(heroRebirthPlan('epic', 200, 1.15 ** 3).estimatedRebirths).toBe(3);
    expect(heroRebirthPlan('epic', 200, 1.15 ** 4).estimatedRebirths).toBe(4);

    /*
     * And the walk the game itself performs, through the rounding the plan
     * applies. The count is an *estimate*: each rebirth grants far more than
     * 15%, so it usually runs ahead of the rebirths actually performed, and the
     * rounding can leave it one behind — at the fourth exact power the rounded
     * multiplier reconstructs as 3. Asserted as monotonic rather than exact,
     * which is the strongest thing that is true.
     */
    let mult = 1;
    let previous = 0;
    for (let rebirths = 1; rebirths <= 6; rebirths += 1) {
      mult = heroRebirthPlan('epic', HERO_LEVEL_CAP, mult).nextStatMultiplier;
      const count = heroRebirthPlan('epic', HERO_LEVEL_CAP, mult).estimatedRebirths;
      expect({ rebirths, rising: count >= previous }).toEqual({ rebirths, rising: true });
      previous = count;
    }
    expect(previous).toBeGreaterThan(6);
  });
});

describe('the actions', () => {
  it('refuses rather than silently doing nothing', () => {
    /*
     * The shipped reducer returns the unchanged state for every refusal, which
     * a caller cannot tell from success. Null makes the refusal visible, which
     * matters more here than it did in the reducer: these are engine functions
     * a UI, an automation and a test all call.
     */
    expect(levelUpWithGold(hero({ level: HERO_LEVEL_CAP }), RICH)).toBeNull();
    expect(levelUpWithGold(hero(), { ...RICH, gold: 0 })).toBeNull();
    expect(rankUp(hero(), { ...RICH, heroShards: 0 })).toBeNull();
    expect(rankUpToMax(hero({ rank: HERO_RANK_CAP }), RICH)).toBeNull();
  });

  it('spends exactly what it charges', () => {
    const start = hero({ rarity: 'epic', level: 10 });
    const wallet: Wallet = { gold: 1000, heroShards: 1000, essence: 10 };

    const levelled = levelUpWithGold(start, wallet)!;
    expect(levelled.hero.level).toBe(11);
    expect(wallet.gold - levelled.wallet.gold).toBe(heroGoldLevelCost(10));

    const ranked = rankUp(start, wallet)!;
    expect(ranked.hero.rank).toBe(2);
    expect(wallet.heroShards - ranked.wallet.heroShards).toBe(rankUpShardCost('epic', 2));
  });

  it('takes a hero all the way to rank ten for the walk price', () => {
    const start = hero({ rarity: 'epic', rank: 3 });
    const maxed = rankUpToMax(start, RICH)!;
    expect(maxed.hero.rank).toBe(HERO_RANK_CAP);
    expect(RICH.heroShards - maxed.wallet.heroShards).toBe(rankUpCostToTarget('epic', 3, HERO_RANK_CAP));
  });

  it('gates rebirth on both caps, not either', () => {
    /*
     * Rank ten *and* level 999. Checking one would let a player reset a hero
     * they had not finished — and since rebirth returns them to level one,
     * that is progress destroyed rather than progress deferred.
     */
    expect(rebirth(hero({ rank: HERO_RANK_CAP, level: HERO_LEVEL_CAP - 1 }), RICH)).toBeNull();
    expect(rebirth(hero({ rank: HERO_RANK_CAP - 1, level: HERO_LEVEL_CAP }), RICH)).toBeNull();

    const done = rebirth(hero({ rank: HERO_RANK_CAP, level: HERO_LEVEL_CAP }), RICH)!;
    expect({ level: done.hero.level, rank: done.hero.rank }).toEqual({ level: 1, rank: 1 });
    expect(done.hero.rebirthStatMult).toBeGreaterThan(1);
  });

  it('refuses a rebirth it cannot pay for in either currency', () => {
    const ready = hero({ rank: HERO_RANK_CAP, level: HERO_LEVEL_CAP });
    const plan = heroRebirthPlan(ready.rarity, ready.level, ready.rebirthStatMult);
    expect(rebirth(ready, { gold: 0, heroShards: plan.shardCost - 1, essence: plan.essenceCost })).toBeNull();
    expect(rebirth(ready, { gold: 0, heroShards: plan.shardCost, essence: plan.essenceCost - 1 })).toBeNull();
    expect(rebirth(ready, { gold: 0, heroShards: plan.shardCost, essence: plan.essenceCost })).not.toBeNull();
  });

  it('pays a recycle at the weekly rate, rounded up', () => {
    // The multiplier is an argument because this is the one place the rotating
    // weekly event reaches the roster, and an engine that looked it up itself
    // would be reading a clock.
    const target = hero({ rarity: 'epic', level: 50 });
    const base = calculateShardReward('epic', 50);
    expect(recycleShards(target, 1)).toBe(base);
    expect(recycleShards(target, 2)).toBe(base * 2);
    // Ceil, not floor: a 1.5x event never pays less than the flat rate.
    expect(recycleShards(hero({ rarity: 'common', level: 1 }), 1.5)).toBe(
      Math.ceil(calculateShardReward('common', 1) * 1.5),
    );
  });
});
