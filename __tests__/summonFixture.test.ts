import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  HERO_POOL,
  RARITIES,
  SPARK_TOKEN_BY_RARITY,
  SUMMON_MILESTONES,
  clampRarityToTier,
  type PlayerClass,
  type Rarity,
} from '../src/gameConfig';
import { DEFAULT_STATE, reducer, type GameState } from '../src/useGameState';

/**
 * Reference behaviour for summoning.
 *
 * The rewrite has no gacha at all — summoning is one of the eighty-one
 * reducer actions it does not have — so this is the baseline the port is
 * measured against, generated before the port exists.
 *
 * **What makes this fixture different from the others is the randomness.**
 * `rollRarityWithPity` calls `Math.random()` inline, between three and four
 * times per pull depending on which branch it takes, and the *order* it
 * consumes them in is as much a part of the behaviour as the thresholds are.
 * A port that computed the same distribution while drawing in a different
 * order would pass any statistical test and disagree with this on every
 * single pull.
 *
 * So the generator scripts the source. `Math.random` is replaced with a
 * counter-driven sequence, the whole run is deterministic, and what is
 * recorded is the exact pull-by-pull outcome. The rewrite injects its random
 * source rather than reaching for the global — engine code may not read the
 * clock and has no more business reading the dice — and feeding it the same
 * sequence has to produce the same pulls.
 *
 * Regenerate deliberately:
 *   UPDATE_SUMMON_FIXTURE=1 npx jest __tests__/summonFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'engine', 'roster', '__fixtures__', 'summon.json');

const FIXED_NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const NEUTRAL_EVENT_ID = 'double_shard_drops';

/**
 * A scripted random source.
 *
 * A plain 32-bit LCG rather than anything clever: it has to be reproducible in
 * two languages' worth of distance — this file and the rewrite's test — from
 * one seed and nothing else, which rules out anything with hidden state. The
 * constants are Numerical Recipes'.
 */
function scriptedRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function weekOfNeutralEvent(): number {
  const { WEEKLY_EVENTS, getWeeklyEventByWeek, weekNumberForTimestamp } =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../src/gameConfig') as typeof import('../src/gameConfig');
  const from = weekNumberForTimestamp(FIXED_NOW);
  for (let offset = 0; offset < WEEKLY_EVENTS.length; offset += 1) {
    if (getWeeklyEventByWeek(from + offset).id === NEUTRAL_EVENT_ID) return from + offset;
  }
  throw new Error(`no week within one rotation maps to ${NEUTRAL_EVENT_ID}`);
}

function state(overrides: Partial<GameState>): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    weeklyEventWeek: weekOfNeutralEvent(),
    weeklyEventId: NEUTRAL_EVENT_ID,
    // Enough to pay for every pull in a run, so a run never stops early for a
    // reason that has nothing to do with the roll.
    diamonds: 10_000_000,
    ...overrides,
  };
}

interface Pull {
  index: number;
  rarity: Rarity;
  heroId: string;
  tier: number;
  /** The pity counter *after* the pull. */
  pityCounter: number;
  pityTriggered: boolean;
  sparkTokens: number;
  freeSummonCharges: number;
  totalSummons: number;
  claimedMilestones: number[];
  guaranteedMinRarity: Rarity | null;
}

/**
 * Summon `count` times from one state with one scripted source, recording
 * every pull.
 *
 * Driven through the real `SUMMON_HERO` action rather than by reaching for the
 * roll function, because the action is what a player does and the bookkeeping
 * around the roll — the pity counter, the milestone claims, the duplicate
 * spark award — is as much of the behaviour as the roll itself.
 */
function run(start: GameState, count: number, seed: number): Pull[] {
  const random = scriptedRandom(seed);
  const randomSpy = jest.spyOn(Math, 'random').mockImplementation(random);
  try {
    const pulls: Pull[] = [];
    let current = start;
    for (let index = 0; index < count; index += 1) {
      const before = current;
      current = reducer(current, { type: 'SUMMON_HERO', payWithDiamonds: true } as never);
      // The newest hero is pushed onto the front of the roster.
      const [hero] = current.heroRoster;
      const template = HERO_POOL.find(entry => entry.id === hero.id);
      pulls.push({
        index,
        rarity: hero.rarity,
        heroId: hero.id,
        tier: template?.tier ?? 0,
        pityCounter: current.gachaPityCounter,
        pityTriggered: current.summonHistory[0]?.pityTriggered ?? false,
        sparkTokens: current.sparkTokens - before.sparkTokens,
        freeSummonCharges: current.freeSummonCharges,
        totalSummons: current.totalSummons,
        claimedMilestones: [...current.claimedSummonMilestones].sort((a, b) => a - b),
        guaranteedMinRarity: current.guaranteedMinRarity,
      });
    }
    return pulls;
  } finally {
    randomSpy.mockRestore();
  }
}

interface Fixture {
  note: string;
  generatedFrom: string;
  seed: number;
  /** The first values the scripted source yields, so a port can check its own. */
  randomSequence: number[];
  rarityChances: { id: Rarity; chance: number }[];
  milestoneThresholds: number[];
  sparkTokenByRarity: Record<string, number>;
  /** A long run from a fresh account: natural rolls and the milestones. */
  earlyGame: Pull[];
  /** The same, with the postgame pool unlocked, which adds transcendent. */
  postgame: Pull[];
  /**
   * A run parked one pull short of the hard threshold.
   *
   * Needed because a natural run does not get there: soft pity starts at
   * twenty and adds three percent a pull, so it resolves the drought first —
   * the sixty-pull run above tops out at a counter of twenty-four. Hoping a
   * long enough run stumbles into hard pity would make every claim about it
   * vacuously true, which is what the first version of this fixture did.
   */
  hardPity: Pull[];
  /** A run parked at the soft pity start, so that branch is exercised too. */
  softPity: Pull[];
  /** Rarity clamped into each tier's allowed band. */
  tierClamp: { rarity: Rarity; tier: number; clamped: Rarity }[];
}

const SEED = 20260115;

function build(): Fixture {
  const source = scriptedRandom(SEED);
  const randomSequence = Array.from({ length: 8 }, () => source());

  const tierClamp: Fixture['tierClamp'] = [];
  for (const tier of [1, 2, 3, 4, 5]) {
    for (const rarity of RARITIES.map(entry => entry.id)) {
      tierClamp.push({ rarity, tier, clamped: clampRarityToTier(rarity, tier) });
    }
  }

  return {
    note: 'Shipped summoning, measured against a scripted random source. Owned by __tests__/summonFixture.test.ts.',
    generatedFrom: 'src/reducers/rosterReducer.ts SUMMON_HERO via the exported reducer',
    seed: SEED,
    randomSequence,
    rarityChances: RARITIES.map(entry => ({ id: entry.id, chance: entry.chance })),
    milestoneThresholds: SUMMON_MILESTONES.map(entry => entry.threshold),
    sparkTokenByRarity: { ...SPARK_TOKEN_BY_RARITY },
    // Long enough to cross the soft pity start at 20 and reach the first two
    // milestones at 10 and 50. It does *not* reach the hard threshold — soft
    // pity resolves the drought first — which is what `hardPity` is for.
    earlyGame: run(state({}), 60, SEED),
    postgame: run(state({ highestWaveReached: 200, prestigeCount: 2 }), 40, SEED),
    hardPity: run(state({ gachaPityCounter: 29 }), 6, SEED),
    softPity: run(state({ gachaPityCounter: 20 }), 12, SEED),
    tierClamp,
  };
}

describe('summon fixture', () => {
  let nowSpy: jest.SpyInstance<number, []>;
  let fixture: Fixture;

  beforeAll(() => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    fixture = build();
  }, 120_000);

  afterAll(() => {
    nowSpy.mockRestore();
  });

  it('draws a reproducible sequence from one seed', () => {
    // The whole fixture rests on this. A source that drifted would re-roll
    // every pull below and the only symptom would be a port that cannot match
    // a baseline nobody changed.
    const again = scriptedRandom(fixture.seed);
    expect(Array.from({ length: 8 }, () => again())).toEqual(fixture.randomSequence);
    for (const value of fixture.randomSequence) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('advances the pity counter on a miss and resets it on legendary or better', () => {
    const rank = (rarity: Rarity) => RARITIES.findIndex(entry => entry.id === rarity);
    const legendary = rank('legendary');

    let previous = 0;
    for (const pull of fixture.earlyGame) {
      if (rank(pull.rarity) >= legendary) {
        expect({ index: pull.index, counter: pull.pityCounter }).toEqual({ index: pull.index, counter: 0 });
      } else {
        expect({ index: pull.index, counter: pull.pityCounter }).toEqual({
          index: pull.index,
          counter: previous + 1,
        });
      }
      previous = pull.pityCounter;
    }
  });

  it('never lets the counter pass the hard pity threshold', () => {
    // Thirty is a ceiling, not a target: the pull that would take the counter
    // to thirty is forced to legendary or better and the counter resets. A
    // player cannot go more than thirty pulls without one.
    for (const pull of fixture.earlyGame) expect(pull.pityCounter).toBeLessThan(30);
  });

  it('forces legendary or better at the hard threshold', () => {
    /*
     * Asserted on a run parked at twenty-nine rather than hoped for in a long
     * one. The first version of this fixture expected a sixty-pull run to
     * reach thirty and it never did — soft pity starts at twenty and adds
     * three percent a pull, so it resolves the drought first and the run tops
     * out at a counter of twenty-four. Every claim about hard pity would have
     * been vacuously true.
     */
    const first = fixture.hardPity[0];
    expect(first.pityTriggered).toBe(true);
    const rank = (rarity: Rarity) => RARITIES.findIndex(entry => entry.id === rarity);
    expect(rank(first.rarity)).toBeGreaterThanOrEqual(rank('legendary'));
    expect(first.pityCounter).toBe(0);

    // And it is the threshold that fired, not the roll: the pulls after it
    // are ordinary again.
    expect(fixture.hardPity.slice(1).every(pull => pull.pityTriggered === false)).toBe(true);
  });

  it('exercises the soft pity branch at all', () => {
    // A run parked at the start of soft pity, for the same reason as above:
    // the branch has to be reached by construction rather than by luck.
    const rank = (rarity: Rarity) => RARITIES.findIndex(entry => entry.id === rarity);
    expect(fixture.softPity[0].pityTriggered).toBe(false);
    // Twelve pulls from a counter of twenty carries the boost from 3% to 36%,
    // so a legendary or better inside the window is near certain and the
    // branch is demonstrably live.
    expect(fixture.softPity.some(pull => rank(pull.rarity) >= rank('legendary'))).toBe(true);
    expect(fixture.softPity.every(pull => pull.pityCounter < 30)).toBe(true);
  });

  it('keeps transcendent out of the pool until the postgame', () => {
    /*
     * `getSummonRarityPool` filters transcendent out until wave 150 and one
     * prestige. Two consequences, and the second is the interesting one: the
     * remaining chances sum to 0.999 rather than 1, so a roll above 0.999
     * falls off the end of the table and `rollRarity` returns its first entry
     * — common. A one-in-a-thousand pull is silently the *worst* outcome
     * rather than the best.
     */
    expect(fixture.earlyGame.every(pull => pull.rarity !== 'transcendent')).toBe(true);
    const total = fixture.rarityChances.reduce((sum, entry) => sum + entry.chance, 0);
    const withoutTranscendent = fixture.rarityChances
      .filter(entry => entry.id !== 'transcendent')
      .reduce((sum, entry) => sum + entry.chance, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(withoutTranscendent).toBeCloseTo(0.999, 10);
  });

  it('clamps a rarity into the band its tier allows', () => {
    // A tier-one hero cannot be mythic and a tier-four cannot be common, so a
    // roll outside the band is pulled to its edge rather than rejected. That
    // is why a run's rarities do not match its rolls one for one.
    const find = (rarity: Rarity, tier: number) =>
      fixture.tierClamp.find(entry => entry.rarity === rarity && entry.tier === tier)?.clamped;
    expect(find('mythic', 1)).toBe('legendary');
    expect(find('transcendent', 3)).toBe('godly');
    expect(find('common', 4)).toBe('epic');
    expect(find('epic', 2)).toBe('epic');

    // And every recorded pull obeys it, which is the claim that matters.
    for (const pull of [...fixture.earlyGame, ...fixture.postgame]) {
      expect({ index: pull.index, rarity: pull.rarity }).toEqual({
        index: pull.index,
        rarity: clampRarityToTier(pull.rarity, pull.tier),
      });
    }
  });

  it('pays spark tokens for a duplicate and nothing for a new hero', () => {
    /*
     * The dupe rule: tokens are awarded when the template is *already* in the
     * roster, at a rate set by the rarity that was pulled. A first copy pays
     * nothing, which is what makes the early run mostly zeroes.
     */
    const seen = new Set<string>();
    for (const pull of fixture.earlyGame) {
      const expected = seen.has(pull.heroId) ? SPARK_TOKEN_BY_RARITY[pull.rarity] : 0;
      expect({ index: pull.index, spark: pull.sparkTokens }).toEqual({ index: pull.index, spark: expected });
      seen.add(pull.heroId);
    }
  });

  it('claims each milestone once, in order, as the count passes it', () => {
    const thresholds = fixture.milestoneThresholds;
    expect(thresholds[0]).toBe(10);

    for (const pull of fixture.earlyGame) {
      const expected = thresholds.filter(threshold => threshold <= pull.totalSummons);
      expect({ index: pull.index, claimed: pull.claimedMilestones }).toEqual({
        index: pull.index,
        claimed: expected,
      });
    }

    // The ten-pull milestone is five free charges, so the count rises there
    // and nowhere else in this run.
    const atTen = fixture.earlyGame.find(pull => pull.totalSummons === 10)!;
    const atNine = fixture.earlyGame.find(pull => pull.totalSummons === 9)!;
    expect(atTen.freeSummonCharges - atNine.freeSummonCharges).toBe(5);
  });

  it('spends a guaranteed rarity on the very next pull', () => {
    /*
     * The fifty-pull milestone promises "next summon guaranteed Epic+", and
     * the reducer sets it with `state.guaranteedMinRarity ? null : ...` — so
     * the flag is cleared by the pull after the one that set it, whether or
     * not that pull needed the floor. A player who was going to pull a
     * legendary anyway spends the guarantee on it.
     */
    const setter = fixture.earlyGame.find(pull => pull.guaranteedMinRarity !== null);
    expect(setter).toBeDefined();
    expect(setter!.totalSummons).toBe(50);
    expect(setter!.guaranteedMinRarity).toBe('epic');

    const next = fixture.earlyGame.find(pull => pull.index === setter!.index + 1);
    expect(next).toBeDefined();
    expect(next!.guaranteedMinRarity).toBeNull();
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_SUMMON_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }

    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
