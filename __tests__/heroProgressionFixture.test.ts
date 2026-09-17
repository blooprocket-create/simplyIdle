import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  HERO_LEVEL_CAP,
  HERO_POOL,
  RANK_CONFIGS,
  calculateShardReward,
  getHeroRebirthPlan,
  getRankUpShardCost,
  type HeroUnit,
  type Rarity,
} from '../src/gameConfig';
import { getHeroGoldLevelCost } from '../src/reducers/rosterReducer';

/**
 * Reference costs and rewards for everything a player does to a hero after
 * they own them: levelling, ranking, rebirth and recycling.
 *
 * Unlike the summon fixture, none of this has dice in it — every number is a
 * pure function of the hero and their rarity — so what is recorded is the
 * functions themselves across their whole range, rather than a replayed run.
 *
 * Two things the shipped formulas do that a clean-room implementation would
 * not, both recorded here so the port inherits them on purpose:
 *
 * 1. `calculateShardReward` multiplies level by `Math.max(1, level - 1)`, so a
 *    level-one hero recycles for exactly what a level-two does. The floor is
 *    on the *wrong side* of the subtraction to be a guard against zero.
 * 2. `getHeroRebirthPlan` recovers how many times a hero has been reborn by
 *    taking a logarithm of their stat multiplier, because the count itself is
 *    never stored. A multiplier that was ever rounded reconstructs a count
 *    that may be one short.
 *
 * Regenerate deliberately:
 *   UPDATE_HERO_PROGRESSION_FIXTURE=1 npx jest __tests__/heroProgressionFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'engine', 'roster', '__fixtures__', 'hero-progression.json');

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'godly', 'transcendent'];
const LEVELS = [1, 2, 3, 10, 50, 80, 81, 200, 998, 999];
const RANKS = [1, 2, 3, 5, 6, 9, 10];

function hero(overrides: Partial<HeroUnit>): HeroUnit {
  const [template] = HERO_POOL;
  return {
    ...template,
    uid: 'u0',
    rarity: 'common' as Rarity,
    level: 1,
    rank: 1,
    teamBoost: template.baseTeamBoost,
    rebirthStatMult: 1,
    ...overrides,
  };
}

interface Fixture {
  note: string;
  generatedFrom: string;
  heroLevelCap: number;
  /** Gold to take a hero from `level` to `level + 1`. */
  goldLevelCost: { level: number; cost: number }[];
  /** Shards to reach `targetRank`, per rarity. */
  rankUpShardCost: { rarity: Rarity; targetRank: number; cost: number }[];
  /** Authored rank table, so a reordering is visible. */
  rankConfigs: { rankNumber: number; shardCostToRankUp: number; statMultiplier: number }[];
  /** Shards from recycling a hero at a rarity and level. */
  shardReward: { rarity: Rarity; level: number; shards: number }[];
  /** What a rebirth costs and grants, at a spread of stat multipliers. */
  rebirthPlans: {
    rarity: Rarity;
    level: number;
    rebirthStatMult: number;
    estimatedRebirths: number;
    shardCost: number;
    essenceCost: number;
    nextStatMultiplier: number;
    statGainPct: number;
  }[];
}

function build(): Fixture {
  const goldLevelCost = LEVELS.map(level => ({ level, cost: getHeroGoldLevelCost(level) }));

  const rankUpShardCost: Fixture['rankUpShardCost'] = [];
  for (const rarity of RARITIES) {
    for (const targetRank of [...RANKS, 11]) {
      rankUpShardCost.push({ rarity, targetRank, cost: getRankUpShardCost(rarity, targetRank) });
    }
  }

  const shardReward: Fixture['shardReward'] = [];
  for (const rarity of RARITIES) {
    for (const level of LEVELS) {
      shardReward.push({ rarity, level, shards: calculateShardReward(rarity, level) });
    }
  }

  const rebirthPlans: Fixture['rebirthPlans'] = [];
  for (const rarity of ['common', 'epic', 'transcendent'] as Rarity[]) {
    for (const level of [1, 80, 200, 999]) {
      // A spread that walks the reconstructed rebirth count from zero upward:
      // the count is `log(mult) / log(1.15)`, so these are 1.15^n.
      for (const rebirthStatMult of [1, 1.15, 1.3225, 1.75, 3.05, 8]) {
        const plan = getHeroRebirthPlan(hero({ rarity, level, rank: 10, rebirthStatMult }));
        rebirthPlans.push({ rarity, level, rebirthStatMult, ...plan });
      }
    }
  }

  return {
    note: 'Shipped hero progression costs and rewards. Owned by __tests__/heroProgressionFixture.test.ts.',
    generatedFrom: 'src/gameConfig.ts and src/reducers/rosterReducer.ts',
    heroLevelCap: HERO_LEVEL_CAP,
    goldLevelCost,
    rankUpShardCost,
    rankConfigs: RANK_CONFIGS.map(entry => ({ ...entry })),
    shardReward,
    rebirthPlans,
  };
}

describe('hero progression fixture', () => {
  const fixture = build();

  it('prices a level from the level being left, not the one being reached', () => {
    // `100 * 1.08^(level-1)`, so the first level up costs exactly 100.
    expect(fixture.goldLevelCost.find(entry => entry.level === 1)?.cost).toBe(100);
    expect(fixture.goldLevelCost.find(entry => entry.level === 2)?.cost).toBe(108);
    // And it rises without bound rather than capping, which is what makes gold
    // levelling stop being the way to level a hero long before the cap.
    const deep = fixture.goldLevelCost.find(entry => entry.level === 999)!.cost;
    expect(deep).toBeGreaterThan(1e30);
  });

  it('charges more per rank for a rarer hero, and more for a later rank', () => {
    const cost = (rarity: Rarity, targetRank: number) =>
      fixture.rankUpShardCost.find(entry => entry.rarity === rarity && entry.targetRank === targetRank)!.cost;

    // Rarity multiplies, so the same rank costs 11.4x more at the top.
    expect(cost('transcendent', 5) / cost('common', 5)).toBeCloseTo(11.4, 1);
    // And the progressive multiplier compounds on top of the authored table, so
    // each sampled rank costs more than the one sampled before it.
    for (const rarity of RARITIES) {
      for (let index = 2; index < RANKS.length; index += 1) {
        const rank = RANKS[index];
        const previous = RANKS[index - 1];
        expect({ rarity, rank, rising: cost(rarity, rank) > cost(rarity, previous) }).toEqual({
          rarity,
          rank,
          rising: true,
        });
      }
    }
  });

  it('returns a sentinel rather than a price for a rank that does not exist', () => {
    // Rank eleven has no config, so the cost is `Number.MAX_SAFE_INTEGER` and
    // the reducer's `Number.isFinite` check lets it through — the guard that
    // actually stops it is `hero.rank >= 10`.
    for (const rarity of RARITIES) {
      const cost = fixture.rankUpShardCost.find(entry => entry.rarity === rarity && entry.targetRank === 11)!.cost;
      expect({ rarity, cost }).toEqual({ rarity, cost: Number.MAX_SAFE_INTEGER });
    }
  });

  it('pays a level-one hero the same recycle value as a level-two', () => {
    /*
     * `1 + Math.max(1, level - 1) * 0.15`. The floor is on the wrong side of
     * the subtraction to be a guard against zero — at level one it returns the
     * level-two multiplier rather than 1.0 — so the first level a hero gains
     * is worth nothing at all when recycling them.
     *
     * Recorded rather than corrected: a port that "fixed" it would pay less
     * for a level-one hero than the shipped game does, which is a refund a
     * player would notice.
     */
    for (const rarity of RARITIES) {
      const atOne = fixture.shardReward.find(entry => entry.rarity === rarity && entry.level === 1)!.shards;
      const atTwo = fixture.shardReward.find(entry => entry.rarity === rarity && entry.level === 2)!.shards;
      const atThree = fixture.shardReward.find(entry => entry.rarity === rarity && entry.level === 3)!.shards;
      expect({ rarity, same: atOne === atTwo }).toEqual({ rarity, same: true });
      expect({ rarity, rises: atThree > atTwo }).toEqual({ rarity, rises: true });
    }
  });

  it('reconstructs the rebirth count from the stat multiplier', () => {
    /*
     * The count is never stored. `getHeroRebirthPlan` recovers it as
     * `floor(log(mult) / log(1.15) + 1e-6)` — which is why the epsilon is
     * there at all, and why a multiplier that has been rounded anywhere can
     * reconstruct a count one short of the truth.
     *
     * Every cost the plan quotes is built on that count, so it is the number
     * the port has to reproduce exactly rather than approximately.
     */
    const plan = (mult: number) =>
      fixture.rebirthPlans.find(
        entry => entry.rarity === 'epic' && entry.level === 200 && entry.rebirthStatMult === mult,
      )!;

    expect(plan(1).estimatedRebirths).toBe(0);
    expect(plan(1.15).estimatedRebirths).toBe(1);
    expect(plan(1.3225).estimatedRebirths).toBe(2);
    // 1.75 is not a power of 1.15; the count is the floor, so it is 4 rather
    // than 4-point-something.
    expect(plan(1.75).estimatedRebirths).toBe(4);
  });

  it('charges more and grants less with each rebirth', () => {
    const plans = fixture.rebirthPlans.filter(entry => entry.rarity === 'epic' && entry.level === 200);
    const ordered = [...plans].sort((a, b) => a.rebirthStatMult - b.rebirthStatMult);

    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      expect({ mult: current.rebirthStatMult, costsMore: current.shardCost >= previous.shardCost }).toEqual({
        mult: current.rebirthStatMult,
        costsMore: true,
      });
      expect({ mult: current.rebirthStatMult, grantsLess: current.statGainPct <= previous.statGainPct }).toEqual({
        mult: current.rebirthStatMult,
        grantsLess: true,
      });
    }

    // And the gain has a floor, so a heavily reborn hero still gains something.
    expect(ordered[ordered.length - 1].statGainPct).toBeGreaterThanOrEqual(4);
  });

  it('caps the level a rebirth cost is measured at', () => {
    /*
     * The shard cost reads `calculateShardReward(rarity, min(level, 80))`, so
     * a hero at 999 is priced as an 80. Without the cap the cost would rise
     * with the level it takes to reach rank ten, which is the same level for
     * everyone — the cap is what keeps rebirth priced by rarity rather than by
     * a number every candidate shares.
     */
    const epic = (level: number) =>
      fixture.rebirthPlans.find(
        entry => entry.rarity === 'epic' && entry.level === level && entry.rebirthStatMult === 1,
      )!.shardCost;
    expect(epic(80)).toBe(epic(200));
    expect(epic(200)).toBe(epic(999));
    // And below the cap it does move.
    expect(epic(1)).toBeLessThan(epic(80));
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_HERO_PROGRESSION_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }

    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
