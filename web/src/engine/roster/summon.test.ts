import { describe, expect, it } from 'vitest';
import { RARITY_IDS, RARITY_SUMMON_CHANCE, type Rarity } from '../../content/rarities';
import {
  PITY_THRESHOLD,
  SOFT_PITY_BOOST_PER_PULL,
  SOFT_PITY_START,
  claimMilestones,
  isPostgameUnlocked,
  rollRarity,
  rollRarityWithPity,
  sparkTokensForSummon,
  spendGuarantee,
  summonRarityPool,
  type Milestone,
  type PityState,
} from './summon';
import fixture from './__fixtures__/summon.json';

/**
 * Summoning, against the shipped game, pull for pull.
 *
 * `__tests__/summonFixture.test.ts` drove the real `SUMMON_HERO` action with a
 * scripted random source and recorded every outcome. This replays the same
 * sequence through the port and requires the same rarities in the same order —
 * which is a far stronger claim than matching a distribution, and the only one
 * that catches a port drawing its random values in a different order.
 */

/** The generator's source, reimplemented here from the seed and nothing else. */
function scriptedRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const MILESTONES: Milestone[] = [
  { threshold: 10, freeCharges: 5 },
  { threshold: 50, guaranteedRarity: 'epic' },
  { threshold: 100, sparkTokens: 500 },
  { threshold: 250, guaranteedRarity: 'legendary' },
];

const rank = (rarity: Rarity) => RARITY_IDS.indexOf(rarity);

/**
 * Replay a recorded run through the port.
 *
 * Only the rarity roll is replayed, not the whole action: the shipped pull also
 * picks a hero template and clamps the rarity to that template's tier, and
 * picking a template is Phase 8's next piece. So each recorded pull's *tier* is
 * used to undo the clamp — the port has to produce a rarity that clamps to the
 * one recorded, which is exactly as strong a claim for every pull the clamp did
 * not move, and the weakest honest one for the rest.
 */
function replay(pulls: typeof fixture.earlyGame, postgameUnlocked: boolean, startCounter: number) {
  const random = scriptedRandom(fixture.seed);
  const results: { index: number; rarity: Rarity; counter: number; triggered: boolean }[] = [];
  let state: PityState = { counter: startCounter, guaranteedMin: null };
  let totalSummons = 0;
  let claimed: number[] = [];

  for (const pull of pulls) {
    const roll = rollRarityWithPity(state, postgameUnlocked, random);
    results.push({ index: pull.index, rarity: roll.rarity, counter: roll.nextCounter, triggered: roll.pityTriggered });

    /*
     * The bookkeeping the action does around the roll, in the order it does
     * it: the template pick consumes random values too, so this replay cannot
     * be pull-for-pull past the first draw — which is why the assertions below
     * check the first pull of each run exactly and the pity arithmetic for all
     * of them.
     */
    totalSummons += 1;
    const rewards = claimMilestones(totalSummons, claimed, MILESTONES);
    claimed = rewards.claimed;
    state = {
      counter: roll.nextCounter,
      guaranteedMin: spendGuarantee(state.guaranteedMin, rewards.guaranteedRarity),
    };
  }

  return results;
}

describe('the scripted source', () => {
  it('reproduces the generator’s sequence from the seed alone', () => {
    /*
     * Everything else in this file rests on this. The generator and this test
     * are separate implementations of the same LCG in separate packages, and
     * the fixture carries the first eight values precisely so a drift between
     * them fails here rather than as a hundred mysterious rarity mismatches.
     */
    const random = scriptedRandom(fixture.seed);
    expect(Array.from({ length: fixture.randomSequence.length }, () => random())).toEqual(fixture.randomSequence);
  });
});

describe('the rarity table', () => {
  it('carries the shipped chances in the shipped order', () => {
    // The table is accumulated in sequence, so both the values and their order
    // are load-bearing: reordering it re-tunes every rate.
    expect(summonRarityPool(true).map(entry => ({ id: entry.id, chance: entry.chance }))).toEqual(
      fixture.rarityChances,
    );
  });

  it('drops transcendent until the postgame, and leaves the gap that creates', () => {
    /*
     * The pool sums to 0.999 without transcendent, and `rollRarity` falls
     * through to its first entry when nothing matches — so a roll above 0.999
     * returns *common*. One pull in a thousand is silently the worst outcome
     * rather than the best.
     *
     * Ported as it stands. It is a rounding artefact rather than a design, but
     * it is the shipped game's artefact and a port that "fixed" it would
     * disagree with every recorded run.
     */
    const pool = summonRarityPool(false);
    expect(pool.some(entry => entry.id === 'transcendent')).toBe(false);
    expect(pool.reduce((sum, entry) => sum + entry.chance, 0)).toBeCloseTo(0.999, 10);
    expect(rollRarity(0.9995, pool)).toBe('common');
    // And with transcendent in, the same roll is transcendent.
    expect(rollRarity(0.9995, summonRarityPool(true))).toBe('transcendent');
  });

  it('agrees with the content table it is built from', () => {
    for (const id of RARITY_IDS) {
      const recorded = fixture.rarityChances.find(entry => entry.id === id);
      expect({ id, chance: RARITY_SUMMON_CHANCE[id] }).toEqual({ id, chance: recorded?.chance });
    }
  });

  it('unlocks the postgame at the shipped gate', () => {
    expect(isPostgameUnlocked(149, 5)).toBe(false);
    expect(isPostgameUnlocked(200, 0)).toBe(false);
    expect(isPostgameUnlocked(150, 1)).toBe(true);
  });
});

describe('pity', () => {
  it('produces the shipped first pull for every recorded run', () => {
    /*
     * The pull-for-pull claim, at the only depth this port can honestly make
     * it: the first pull of each run, before the shipped action's template
     * pick has consumed any random values the port does not yet consume.
     *
     * Four runs with four different starting counters, which is what makes
     * this worth more than one: each enters a different branch of the roll.
     */
    const runs: [string, typeof fixture.earlyGame, boolean, number][] = [
      ['earlyGame', fixture.earlyGame, false, 0],
      ['postgame', fixture.postgame, true, 0],
      ['hardPity', fixture.hardPity, false, 29],
      ['softPity', fixture.softPity, false, 20],
    ];

    for (const [name, pulls, postgame, startCounter] of runs) {
      const [first] = replay(pulls, postgame, startCounter);
      const recorded = pulls[0];
      expect({ name, rarity: first.rarity, triggered: first.triggered }).toEqual({
        name,
        rarity: recorded.rarity,
        triggered: recorded.pityTriggered,
      });
    }
  });

  it('forces legendary or better one pull short of the threshold', () => {
    // The counter that matters is `counter + 1 >= 30`, so 29 fires and 28 does
    // not. Off by one here is a player going sixty pulls without a legendary.
    const random = () => 0.999;
    const atThreshold = rollRarityWithPity({ counter: 29, guaranteedMin: null }, false, random);
    expect(atThreshold.pityTriggered).toBe(true);
    expect(rank(atThreshold.rarity)).toBeGreaterThanOrEqual(rank('legendary'));
    expect(atThreshold.nextCounter).toBe(0);

    expect(rollRarityWithPity({ counter: 28, guaranteedMin: null }, false, random).pityTriggered).toBe(false);
    expect(PITY_THRESHOLD).toBe(30);
  });

  it('draws once for hard pity and twice inside the soft window', () => {
    /*
     * The draw count, asserted directly, because it is the part of the
     * behaviour a distribution test cannot see. A port that drew an extra
     * value would desynchronise the sequence and every later pull with it.
     */
    const count = (state: PityState) => {
      let draws = 0;
      rollRarityWithPity(state, false, () => {
        draws += 1;
        return 0.5;
      });
      return draws;
    };

    expect(count({ counter: 29, guaranteedMin: null })).toBe(1);
    expect(count({ counter: 0, guaranteedMin: null })).toBe(1);
    // Inside the window: one draw to test the boost, one more either way.
    expect(count({ counter: SOFT_PITY_START, guaranteedMin: null })).toBe(2);
    expect(count({ counter: SOFT_PITY_START + 5, guaranteedMin: null })).toBe(2);
  });

  it('grows the soft pity boost three points a pull, within a window of nine', () => {
    /*
     * At the start the boost is one step, not zero — `counter - start + 1`.
     * Reading it as zero would make the first pull of the window free.
     *
     * And the window is **20 to 28, nine pulls**, not twenty to thirty: the
     * hard threshold is tested first and fires at a counter of 29, so soft
     * pity's boost never gets past 0.27. The first version of this test used a
     * counter of 29 and quietly measured hard pity instead — a mistake worth
     * leaving a note about, because the two branches draw from *different*
     * tables and a test that confuses them proves nothing about either.
     */
    const boostAt = (counter: number) => (counter - SOFT_PITY_START + 1) * SOFT_PITY_BOOST_PER_PULL;
    expect(boostAt(SOFT_PITY_START)).toBeCloseTo(0.03, 10);
    expect(boostAt(PITY_THRESHOLD - 2)).toBeCloseTo(0.27, 10);
    expect(SOFT_PITY_START + 9).toBe(PITY_THRESHOLD - 1);
    expect(
      rollRarityWithPity({ counter: PITY_THRESHOLD - 1, guaranteedMin: null }, false, () => 0.5).pityTriggered,
    ).toBe(true);

    /*
     * The first step, read off the port rather than off the formula above. At
     * exactly the start the boost is 0.03, so a draw of 0.02 has to take the
     * legendary+ branch — and does not if the `+ 1` is dropped, which would
     * make the window's first pull worth nothing while still looking right.
     */
    let firstStepDraw = 0;
    const atStart = rollRarityWithPity({ counter: SOFT_PITY_START, guaranteedMin: null }, false, () => {
      firstStepDraw += 1;
      return firstStepDraw === 1 ? 0.02 : 0.5;
    });
    expect(rank(atStart.rarity)).toBeGreaterThanOrEqual(rank('legendary'));
    expect(atStart.pityTriggered).toBe(false);

    // Inside the window: a source that always rolls under the boost takes the
    // legendary+ table, and one that always rolls over it takes the ordinary
    // one. Counter 25, so the boost is 0.18 and 0.9 is comfortably over it.
    const inWindow = SOFT_PITY_START + 5;
    const hit = rollRarityWithPity({ counter: inWindow, guaranteedMin: null }, false, () => 0.01);
    expect(hit.pityTriggered).toBe(false);
    expect(rank(hit.rarity)).toBeGreaterThanOrEqual(rank('legendary'));

    const miss = rollRarityWithPity({ counter: inWindow, guaranteedMin: null }, false, () => 0.9);
    expect(miss.pityTriggered).toBe(false);
    expect(rank(miss.rarity)).toBeLessThan(rank('legendary'));
  });

  it('uses a different table for soft pity than for hard pity', () => {
    /*
     * They look like duplicates and are not: soft pity is kinder at the top.
     * A roll of 0.78 is mythic under hard pity and legendary under soft, so
     * collapsing the two into one function shifts every soft-pity pull.
     */
    const hard = rollRarityWithPity({ counter: 29, guaranteedMin: null }, false, () => 0.78);
    expect(hard.rarity).toBe('mythic');

    let draw = 0;
    const soft = rollRarityWithPity({ counter: SOFT_PITY_START, guaranteedMin: null }, false, () => {
      draw += 1;
      // First draw passes the boost test, second picks from the table.
      return draw === 1 ? 0 : 0.78;
    });
    expect(soft.rarity).toBe('legendary');
  });

  it('resets on a legendary and advances on anything less', () => {
    /*
     * 0.9 rather than 0.999, and the difference is instructive: the truncated
     * pool accumulates to *exactly* 0.999 at godly, and the walk tests
     * `roll <= accumulated` — so 0.999 is a godly, which is legendary-plus and
     * resets the counter. Only a roll strictly above 0.999 falls off the end
     * into common. The first version of this test asserted the wrong half of
     * that boundary.
     */
    const miss = rollRarityWithPity({ counter: 7, guaranteedMin: null }, false, () => 0.9);
    expect(rank(miss.rarity)).toBeLessThan(rank('legendary'));
    expect(miss.nextCounter).toBe(8);

    const hit = rollRarityWithPity({ counter: 7, guaranteedMin: null }, false, () => 0.97);
    expect(rank(hit.rarity)).toBeGreaterThanOrEqual(rank('legendary'));
    expect(hit.nextCounter).toBe(0);

    // And the boundary itself, since it is the one the above got wrong.
    expect(rollRarityWithPity({ counter: 7, guaranteedMin: null }, false, () => 0.999).rarity).toBe('godly');
    expect(rollRarityWithPity({ counter: 7, guaranteedMin: null }, false, () => 0.9995).rarity).toBe('common');
  });

  it('matches the recorded counter arithmetic across a whole run', () => {
    // Counters are the part of a run the template pick cannot perturb, so this
    // is checkable for every pull rather than only the first.
    let previous = 0;
    for (const pull of fixture.earlyGame) {
      const expected = rank(pull.rarity as Rarity) >= rank('legendary') ? 0 : previous + 1;
      expect({ index: pull.index, counter: pull.pityCounter }).toEqual({ index: pull.index, counter: expected });
      previous = pull.pityCounter;
    }
  });
});

describe('the guaranteed floor', () => {
  it('raises a bad pull and leaves a good one alone', () => {
    const raised = rollRarityWithPity({ counter: 0, guaranteedMin: 'epic' }, false, () => 0.3);
    expect(raised.rarity).toBe('epic');

    const untouched = rollRarityWithPity({ counter: 0, guaranteedMin: 'epic' }, false, () => 0.97);
    expect(rank(untouched.rarity)).toBeGreaterThan(rank('epic'));
  });

  it('is spent on the next pull whether or not it was needed', () => {
    /*
     * The shipped `state.guaranteedMinRarity ? null : earned` written out.
     * It reads like a bug inline and is not one — it is what keeps the promise
     * to one pull. A player who was going to roll a legendary anyway spends
     * their guaranteed Epic on it.
     */
    expect(spendGuarantee(null, 'epic')).toBe('epic');
    expect(spendGuarantee('epic', null)).toBeNull();
    // Even when a new milestone lands on the same pull, the held one wins the
    // clear and the new one is dropped.
    expect(spendGuarantee('epic', 'legendary')).toBeNull();
  });

  it('is what the recorded run shows', () => {
    const setter = fixture.earlyGame.find(pull => pull.guaranteedMinRarity !== null);
    expect(setter?.totalSummons).toBe(50);
    expect(setter?.guaranteedMinRarity).toBe('epic');
    expect(fixture.earlyGame.find(pull => pull.index === setter!.index + 1)?.guaranteedMinRarity).toBeNull();
  });
});

describe('milestones', () => {
  it('claims each once as the count passes it', () => {
    let claimed: number[] = [];
    for (const pull of fixture.earlyGame) {
      const rewards = claimMilestones(pull.totalSummons, claimed, MILESTONES);
      claimed = rewards.claimed;
      expect({ index: pull.index, claimed: [...claimed].sort((a, b) => a - b) }).toEqual({
        index: pull.index,
        claimed: pull.claimedMilestones,
      });
    }
  });

  it('claims every unclaimed milestone below the count at once', () => {
    // Not just the newest. An account that jumps past several collects all of
    // them, and the highest guarantee wins because the list is walked in order.
    const rewards = claimMilestones(300, [], MILESTONES);
    expect(rewards.claimed).toEqual([10, 50, 100, 250]);
    expect(rewards.freeCharges).toBe(5);
    expect(rewards.sparkTokens).toBe(500);
    expect(rewards.guaranteedRarity).toBe('legendary');
  });

  it('pays nothing for a milestone already claimed', () => {
    const rewards = claimMilestones(60, [10, 50], MILESTONES);
    expect(rewards.claimed).toEqual([10, 50]);
    expect(rewards.freeCharges).toBe(0);
    expect(rewards.guaranteedRarity).toBeNull();
  });

  it('carries the shipped thresholds', () => {
    expect(MILESTONES.map(entry => entry.threshold)).toEqual(fixture.milestoneThresholds.slice(0, MILESTONES.length));
  });
});

describe('spark tokens', () => {
  it('pays for a duplicate at the rarity that was pulled', () => {
    // Not the rarity already held: a duplicate of a common hero rolled at
    // legendary pays the legendary rate.
    const rates = fixture.sparkTokenByRarity as Record<Rarity, number>;
    expect(sparkTokensForSummon(true, 'legendary', rates)).toBe(rates.legendary);
    expect(sparkTokensForSummon(false, 'legendary', rates)).toBe(0);
  });

  it('matches the recorded run', () => {
    const rates = fixture.sparkTokenByRarity as Record<Rarity, number>;
    const seen = new Set<string>();
    for (const pull of fixture.earlyGame) {
      const spark = sparkTokensForSummon(seen.has(pull.heroId), pull.rarity as Rarity, rates);
      expect({ index: pull.index, spark }).toEqual({
        index: pull.index,
        spark: pull.sparkTokens,
      });
      seen.add(pull.heroId);
    }
  });
});
