import { describe, expect, it } from 'vitest';
import { HERO_POOL, heroTemplatesById } from '../../content/heroes';
import { RARITY_BOOST_MULTIPLIER } from '../../content/rarities';
import { SPARK_TOKEN_BY_RARITY, SUMMON_MILESTONES } from '../../content/summon';
import { readSave } from '../save/v3';
import type { SaveV3 } from '../save/schema';
import fixture from './__fixtures__/summon.json';
import { UNIQUE_RELIC_DROP_CHANCE, applySummon, type SummonPoolEntry } from './summonSave';

/**
 * A pull, applied to a save, against the recorded runs.
 *
 * `summon.test.ts` replays the same runs through `summonPull` and **skips** the
 * values the port does not model — the new hero's uid and the relic chance.
 * This module draws all of them, so the replay here asserts the count matches
 * `randomDraws` **exactly**. That is the stronger claim: skipping proves the
 * port draws no more than the action did, matching proves it draws the same
 * values in the same places.
 */

const NOW = 1_700_000_000_000;
const OPTIONS = { nowMs: NOW, content: { heroesById: heroTemplatesById() } };

const POOL: SummonPoolEntry[] = HERO_POOL.map(hero => ({
  id: hero.id,
  tier: hero.tier,
  baseTeamBoost: hero.baseTeamBoost,
}));

/** A fixed list of draws, repeating the last one once exhausted. */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

/** The same mirror the fixture's own generator uses. */
function scriptedRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function emptySave(): SaveV3 {
  return readSave({ version: 3 }, OPTIONS);
}

function payingSave(over: Partial<SaveV3['summon']> = {}, progression: Partial<SaveV3['progression']> = {}): SaveV3 {
  const save = emptySave();
  return {
    ...save,
    // Enough to pay for every pull in a run, so a run never stops early for a
    // reason that has nothing to do with the roll — the fixture's own setup.
    wallet: { ...save.wallet, diamonds: 10_000_000 },
    progression: { ...save.progression, ...progression },
    summon: { ...save.summon, ...over },
  };
}

interface Pull {
  index: number;
  rarity: string;
  heroId: string;
  randomDraws: number;
  pityCounter: number;
  pityTriggered: boolean;
  sparkTokens: number;
  freeSummonCharges: number;
  totalSummons: number;
  claimedMilestones: number[];
  guaranteedMinRarity: string | null;
}

function replay(pulls: readonly Pull[], start: SaveV3) {
  const source = scriptedRandom(fixture.seed);
  let drawn = 0;
  const counted = () => {
    drawn += 1;
    return source();
  };

  const seen: Record<string, unknown>[] = [];
  let save = start;
  for (const pull of pulls) {
    const before = drawn;
    const sparkBefore = save.wallet.sparkTokens;
    const outcome = applySummon({
      save,
      pool: POOL,
      milestones: SUMMON_MILESTONES,
      sparkRates: SPARK_TOKEN_BY_RARITY,
      pay: 'diamonds',
      cost: 500,
      random: counted,
      nowMs: NOW + pull.index,
    });
    if (!outcome) throw new Error(`pull ${pull.index} was refused`);
    save = outcome.save;

    seen.push({
      index: pull.index,
      rarity: outcome.rarity,
      heroId: outcome.hero.id,
      randomDraws: drawn - before,
      pityCounter: save.summon.pityCounter,
      pityTriggered: outcome.pityTriggered,
      sparkTokens: save.wallet.sparkTokens - sparkBefore,
      freeSummonCharges: save.summon.freeCharges,
      totalSummons: save.summon.totalSummons,
      claimedMilestones: [...save.summon.claimedMilestones].sort((a, b) => a - b),
      guaranteedMinRarity: save.summon.guaranteedMinRarity,
    });
  }

  return { pulls: seen, save };
}

function recorded(pulls: readonly Pull[]): Record<string, unknown>[] {
  return pulls.map(pull => ({
    index: pull.index,
    rarity: pull.rarity,
    heroId: pull.heroId,
    randomDraws: pull.randomDraws,
    pityCounter: pull.pityCounter,
    pityTriggered: pull.pityTriggered,
    sparkTokens: pull.sparkTokens,
    freeSummonCharges: pull.freeSummonCharges,
    totalSummons: pull.totalSummons,
    claimedMilestones: pull.claimedMilestones,
    guaranteedMinRarity: pull.guaranteedMinRarity,
  }));
}

describe('replaying the recorded runs through a save', () => {
  it('matches a fresh account pull for pull, draw for draw', () => {
    const run = replay(fixture.earlyGame as Pull[], payingSave());
    expect(run.pulls).toEqual(recorded(fixture.earlyGame as Pull[]));
  });

  it('matches the postgame run, where transcendent is in the pool', () => {
    const run = replay(fixture.postgame as Pull[], payingSave({}, { highestWave: 200, prestigeCount: 2 }));
    expect(run.pulls).toEqual(recorded(fixture.postgame as Pull[]));
  });

  it('matches a run parked one pull short of hard pity', () => {
    const run = replay(fixture.hardPity as Pull[], payingSave({ pityCounter: 29 }));
    expect(run.pulls).toEqual(recorded(fixture.hardPity as Pull[]));
  });

  it('matches a run inside the soft pity window', () => {
    const run = replay(fixture.softPity as Pull[], payingSave({ pityCounter: 20 }));
    expect(run.pulls).toEqual(recorded(fixture.softPity as Pull[]));
  });

  it('is actually checking the draw count, not carrying a constant', () => {
    /*
     * The soft pity branch draws one more value than an ordinary pull, so a
     * run that exercises it has two different counts in it. Without that, a
     * port that always drew four would match every row.
     */
    const counts = new Set((fixture.softPity as Pull[]).map(pull => pull.randomDraws));
    expect(counts.size).toBeGreaterThan(1);
  });
});

describe('what a pull costs', () => {
  const pool = POOL;
  const base = {
    pool,
    milestones: SUMMON_MILESTONES,
    sparkRates: SPARK_TOKEN_BY_RARITY,
    random: () => 0.5,
    nowMs: NOW,
  } as const;

  it('spends a free charge before any currency', () => {
    const save = payingSave({ freeCharges: 2 });
    const outcome = applySummon({ ...base, save, pay: 'diamonds', cost: 500 })!;
    expect(outcome.paidWith).toBe('free');
    expect(outcome.save.wallet.diamonds).toBe(save.wallet.diamonds);
    expect(outcome.save.summon.freeCharges).toBe(1);
  });

  it('spends the currency asked for, and only that one', () => {
    const save = { ...payingSave(), wallet: { ...payingSave().wallet, bossTears: 4_000 } };
    const tears = applySummon({ ...base, save, pay: 'bossTears', cost: 500 })!;
    expect(tears.save.wallet.bossTears).toBe(3_500);
    expect(tears.save.wallet.diamonds).toBe(save.wallet.diamonds);

    const gems = applySummon({ ...base, save, pay: 'diamonds', cost: 500 })!;
    expect(gems.save.wallet.diamonds).toBe(save.wallet.diamonds - 500);
    expect(gems.save.wallet.bossTears).toBe(4_000);
  });

  it('refuses when it can pay with neither, without drawing anything', () => {
    /*
     * The draw matters as much as the refusal. A refused pull that advanced
     * the sequence would change the *next* pull's outcome, which is a player
     * losing a hero to a button that did nothing.
     */
    const save = { ...emptySave(), wallet: { ...emptySave().wallet, diamonds: 100 } };
    let drawn = 0;
    const outcome = applySummon({
      ...base,
      save,
      pay: 'diamonds',
      cost: 500,
      random: () => {
        drawn += 1;
        return 0.5;
      },
    });
    expect(outcome).toBeNull();
    expect(drawn).toBe(0);
  });

  it('pulls for nothing when the price is zero', () => {
    const save = emptySave();
    expect(applySummon({ ...base, save, pay: 'diamonds', cost: 0 })).not.toBeNull();
  });

  it('refuses when there is no pool to draw from', () => {
    expect(applySummon({ ...base, pool: [], save: payingSave(), pay: 'diamonds', cost: 500 })).toBeNull();
  });
});

describe('where the hero lands', () => {
  const base = {
    pool: POOL,
    milestones: SUMMON_MILESTONES,
    sparkRates: SPARK_TOKEN_BY_RARITY,
    pay: 'diamonds',
    cost: 500,
    nowMs: NOW,
  } as const;

  it('arrives at level one, rank one, with their rarity scaling their boost', () => {
    /*
     * Driven to a **godly** pull rather than left to the seed. The boost
     * multiplier for `common` is exactly 1, so a common pull cannot tell
     * `baseTeamBoost * multiplier` apart from `baseTeamBoost` — which is what
     * the first version of this test did, and deleting the multiplier left it
     * green.
     *
     * A roll of 0.9985 lands in godly's band (0.994 to 0.999 before the
     * postgame), and godly draws from heroes 50 to 65, every one of them tier
     * four or five — whose band runs epic to transcendent, so the clamp leaves
     * it alone.
     */
    const outcome = applySummon({ ...base, save: payingSave(), random: sequence(0.9985, 0.5, 1) })!;
    const template = HERO_POOL.find(hero => hero.id === outcome.hero.id)!;
    expect(outcome.rarity).toBe('godly');
    expect(RARITY_BOOST_MULTIPLIER[outcome.rarity]).toBeGreaterThan(1);
    expect(outcome.hero.level).toBe(1);
    expect(outcome.hero.rank).toBe(1);
    expect(outcome.hero.rebirthStatMult).toBe(1);
    expect(outcome.hero.teamBoost).toBeCloseTo(template.baseTeamBoost * RARITY_BOOST_MULTIPLIER.godly, 4);
    expect(outcome.hero.teamBoost).not.toBeCloseTo(template.baseTeamBoost, 4);
  });

  it('goes to the front of the roster, as shipped', () => {
    /*
     * Not cosmetic: `readRoster` keeps the first five hundred rows, so an
     * account at the cap loses its *oldest* hero to a new pull rather than
     * refusing the pull. Two summons, because with one row on the roster the
     * front and the back are the same place.
     */
    const first = applySummon({ ...base, save: payingSave(), random: scriptedRandom(fixture.seed) })!;
    const second = applySummon({ ...base, save: first.save, random: sequence(0.9985, 0.5, 1) })!;
    expect(second.save.roster.heroes.map(hero => hero.uid)).toEqual([second.hero.uid, first.hero.uid]);
  });

  it('never hands two heroes the same uid', () => {
    /*
     * The shipped uid is `<template>_<ms>_<0-9999>`, and two pulls in the same
     * millisecond drawing the same value collide. A duplicate uid is not
     * cosmetic — `readRoster` drops the second row outright, so the player
     * pays and receives nothing.
     */
    let save = payingSave();
    for (let pull = 0; pull < 40; pull += 1) {
      // The same clock and the same draw every time: the worst case, and the
      // one the shipped format cannot survive on its own.
      save = applySummon({ ...base, save, random: () => 0.5, nowMs: NOW })!.save;
    }
    const uids = save.roster.heroes.map(hero => hero.uid);
    expect(new Set(uids).size).toBe(uids.length);
    expect(readSave(JSON.parse(JSON.stringify(save)), OPTIONS).roster.heroes).toHaveLength(40);
  });

  it('pays spark only for a template already held, at the rarity pulled', () => {
    let save = payingSave();
    const first = applySummon({ ...base, save, random: scriptedRandom(fixture.seed) })!;
    expect(first.duplicate).toBe(false);
    expect(first.sparkGained).toBe(0);

    // Force the same template again by narrowing the pool to it.
    save = first.save;
    const entry = POOL.find(hero => hero.id === first.hero.id)!;
    const second = applySummon({ ...base, save, pool: [entry], random: scriptedRandom(fixture.seed) })!;
    expect(second.duplicate).toBe(true);
    expect(second.sparkGained).toBe(SPARK_TOKEN_BY_RARITY[second.rarity]);
    expect(second.save.wallet.sparkTokens).toBe(save.wallet.sparkTokens + second.sparkGained);
  });
});

describe('relics', () => {
  const base = {
    pool: POOL,
    milestones: SUMMON_MILESTONES,
    sparkRates: SPARK_TOKEN_BY_RARITY,
    pay: 'diamonds',
    cost: 500,
    nowMs: NOW,
  } as const;

  /** A source whose third value decides the relic drop. */
  function withDrop(dropRoll: number): () => number {
    const values = [0.5, 0.5, dropRoll];
    let index = 0;
    return () => values[Math.min(index++, values.length - 1)];
  }

  it('drops the summoned hero relic on a roll at or under the chance', () => {
    const outcome = applySummon({ ...base, save: payingSave(), random: withDrop(UNIQUE_RELIC_DROP_CHANCE) })!;
    expect(outcome.relicsGranted).toEqual([outcome.hero.id]);
    expect(outcome.save.roster.uniqueByHeroId[outcome.hero.id]).toEqual({
      rank: 1,
      equippedByUid: outcome.hero.uid,
    });
  });

  it('drops nothing on a roll above it', () => {
    const outcome = applySummon({ ...base, save: payingSave(), random: withDrop(UNIQUE_RELIC_DROP_CHANCE + 1e-9) })!;
    expect(outcome.relicsGranted).toEqual([]);
    expect(outcome.save.roster.uniqueByHeroId).toEqual({});
  });

  it('advances a rank rather than resetting one, and stops at the cap', () => {
    let save = payingSave();
    let heroId = '';
    for (let pull = 0; pull < 12; pull += 1) {
      const entry = POOL[0];
      const outcome = applySummon({ ...base, save, pool: [entry], random: withDrop(0) })!;
      save = outcome.save;
      heroId = outcome.hero.id;
    }
    expect(save.roster.uniqueByHeroId[heroId].rank).toBe(10);
  });

  it('moves the relic to a better copy when one arrives', () => {
    /*
     * The shipped action re-points a hero's relic at the preferred copy on
     * every pull of that hero, *before* the drop chance — so a pull that adds a
     * better copy hands them the relic even when the pull itself drops nothing.
     * `preferredUniqueBearer` ranks on rarity first, so a godly copy takes it
     * from a common one.
     */
    /*
     * The pool cannot be narrowed to force the pick here, because a godly roll
     * slices heroes 50 to 65 out of it and a one-entry pool slices to nothing.
     * So the draws aim at the slice instead: 0.9985 rolls godly, and 0.5 picks
     * index seven of the fifteen — `HERO_POOL[57]` — whose common copy is
     * placed on the roster by hand below.
     */
    const target = HERO_POOL[57];
    const save = payingSave();
    const held: SaveV3 = {
      ...save,
      roster: {
        ...save.roster,
        heroes: [
          { id: target.id, uid: 'old', rarity: 'common', level: 1, rank: 1, teamBoost: 0.05, rebirthStatMult: 1 },
        ],
        uniqueByHeroId: { [target.id]: { rank: 3, equippedByUid: 'old' } },
      },
    };

    // Roll, pick, uid, and a drop roll above the chance so nothing drops.
    const second = applySummon({ ...base, save: held, random: sequence(0.9985, 0.5, 1, 1) })!;
    expect(second.hero.id).toBe(target.id);
    expect(second.rarity).toBe('godly');
    expect(second.relicsGranted).toEqual([]);
    // Re-pointed at the better copy, and not re-ranked — this pull dropped
    // nothing, so only the sync ran.
    expect(second.save.roster.uniqueByHeroId[target.id]).toEqual({ rank: 3, equippedByUid: second.hero.uid });
  });

  it('grants a relic for the milestone that promises one, without disturbing a placed bearer', () => {
    /*
     * The five-hundredth summon grants a relic for a hero drawn from the whole
     * pool — which need not be one the player owns, and which `syncRelicBearer`
     * never touched, because that only runs for the hero just pulled. So this
     * is the path where keeping the stored bearer actually matters: without it
     * the milestone would yank an unrelated relic onto whichever copy ranked
     * best, or onto the hero who was just summoned.
     *
     * The draws are roll, pick, uid, drop chance, milestone hero — and the
     * fourth is set above the chance so the only relic here is the milestone's.
     */
    const save = payingSave({ totalSummons: 499, claimedMilestones: [10, 50, 100, 250] });
    const stranger = POOL[3];
    const placed: SaveV3 = {
      ...save,
      roster: {
        ...save.roster,
        heroes: [
          { id: stranger.id, uid: 'kept', rarity: 'common', level: 1, rank: 1, teamBoost: 0.05, rebirthStatMult: 1 },
          { id: stranger.id, uid: 'better', rarity: 'godly', level: 9, rank: 4, teamBoost: 0.2, rebirthStatMult: 1 },
        ],
        uniqueByHeroId: { [stranger.id]: { rank: 2, equippedByUid: 'kept' } },
      },
    };

    // The fifth draw picks the milestone's hero: index 3 of the pool.
    const pick = 3 / POOL.length + 1e-9;
    const outcome = applySummon({ ...base, save: placed, random: sequence(0.2, 0, 0, 1, pick) })!;

    expect(outcome.milestonesClaimed).toEqual([500]);
    expect(outcome.relicsGranted).toEqual([stranger.id]);
    expect(outcome.save.roster.uniqueByHeroId[stranger.id]).toEqual({ rank: 3, equippedByUid: 'kept' });
    // And the milestone's spark arrived with it.
    expect(outcome.save.wallet.sparkTokens).toBeGreaterThanOrEqual(2_000);
  });
});
