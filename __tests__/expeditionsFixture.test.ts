import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { PlayerClass } from '../src/gameConfig';
import { DEFAULT_STATE, reducer, type GameState } from '../src/useGameState';

/**
 * Expeditions, measured.
 *
 * Five contract tiers, five destinations, gold up front and a reward after a
 * wait — the only system in the game whose payoff is a *timer* rather than a
 * fight or a purchase. Which makes one thing worth checking before anything
 * else, and it is the finding: **nothing checks the timer**.
 *
 * Measured rather than read throughout, because a duration that is stored and
 * never compared against is exactly the shape a reading mistakes for a rule.
 *
 * Regenerate deliberately:
 *   UPDATE_EXPEDITIONS_FIXTURE=1 npx jest __tests__/expeditionsFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'content', '__fixtures__', 'expeditions.json');

const RARITIES = ['common', 'rare', 'epic', 'legendary', 'godly'] as const;
const TYPES = ['artifact', 'merchant', 'ruins', 'vault', 'abyss'] as const;

function state(over: Partial<GameState> = {}): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    level: 40,
    gold: 50_000_000,
    diamonds: 0,
    heroShards: 0,
    essence: 0,
    expeditionQueue: [],
    ...over,
  };
}

const start = (from: GameState, expeditionType: string, offeredRarity: string) =>
  reducer(from, { type: 'START_EXPEDITION', expeditionType, offeredRarity } as never);

const complete = (from: GameState, expeditionId: string) =>
  reducer(from, { type: 'COMPLETE_EXPEDITION', expeditionId } as never);

interface Fixture {
  note: string;
  generatedFrom: string;
  /** The five tiers: what each costs, how long it runs, what it returns. */
  tiers: {
    rarity: string;
    goldCost: number;
    durationMs: number;
    reward: { diamonds: number; shards: number; essence: number; artifacts: number };
  }[];
  /** Five destinations, all taking the same contracts. */
  types: string[];
  /**
   * The finding: completing one the instant it started.
   *
   * `waitedMs` is how long the expedition had been running when it was
   * completed, and `paid` is what it handed over anyway.
   */
  completedImmediately: {
    waitedMs: number;
    durationMs: number;
    paid: { diamonds: number; shards: number; essence: number };
  };
  /** Whether `artifacts` — stored on every reward — is ever handed over. */
  artifactsPaid: boolean;
  /** What a refresh costs. */
  refreshGoldCost: number;
  refusals: { name: string; goldSpent: number; queued: number }[];
}

function build(): Fixture {
  const tiers = RARITIES.map(rarity => {
    const before = state();
    const after = start(before, 'ruins', rarity);
    const queued = after.expeditionQueue[after.expeditionQueue.length - 1];
    return {
      rarity,
      goldCost: before.gold - after.gold,
      durationMs: queued.durationMs,
      reward: { ...queued.reward },
    };
  });

  // Started and completed in the same breath, with no clock moved between.
  const beforeStart = state();
  const started = start(beforeStart, 'ruins', 'godly');
  const running = started.expeditionQueue[0];
  const finished = complete(started, running.id);

  const refreshed = reducer(state(), { type: 'REFRESH_EXPEDITION_CONTRACTS' } as never);

  const refusal = (name: string, from: GameState, action: unknown) => {
    const after = reducer(from, action as never);
    return {
      name,
      goldSpent: from.gold - after.gold,
      queued: after.expeditionQueue.length - from.expeditionQueue.length,
    };
  };

  return {
    note: 'Expeditions, measured through the shipped reducer.',
    generatedFrom: 'src/reducers/economyReducer.ts',
    tiers,
    types: [...TYPES],
    completedImmediately: {
      waitedMs: 0,
      durationMs: running.durationMs,
      paid: {
        diamonds: finished.diamonds - started.diamonds,
        shards: finished.heroShards - started.heroShards,
        essence: finished.essence - started.essence,
      },
    },
    // Every reward carries an artifact count. Nothing on the state receives it.
    artifactsPaid: Object.keys(finished).some(
      key => key.toLowerCase().includes('artifact') && (finished as never)[key] !== (started as never)[key],
    ),
    refreshGoldCost: state().gold - refreshed.gold,
    refusals: [
      refusal('cannot afford the contract', state({ gold: 0 }), {
        type: 'START_EXPEDITION',
        expeditionType: 'ruins',
        offeredRarity: 'godly',
      }),
      refusal('completing one that is not queued', started, {
        type: 'COMPLETE_EXPEDITION',
        expeditionId: 'exp_nothing',
      }),
      refusal('completing the same one twice', finished, { type: 'COMPLETE_EXPEDITION', expeditionId: running.id }),
    ],
  };
}

describe('the five contract tiers', () => {
  const fixture = build();

  it('costs more, runs longer and pays more at every step', () => {
    expect(fixture.tiers.map(tier => tier.rarity)).toEqual(['common', 'rare', 'epic', 'legendary', 'godly']);
    const rising = (values: number[]) => values.every((value, index) => index === 0 || value > values[index - 1]);
    expect(rising(fixture.tiers.map(tier => tier.goldCost))).toBe(true);
    expect(rising(fixture.tiers.map(tier => tier.durationMs))).toBe(true);
    expect(rising(fixture.tiers.map(tier => tier.reward.diamonds))).toBe(true);
    expect(rising(fixture.tiers.map(tier => tier.reward.shards))).toBe(true);
  });

  it('runs from five minutes to eight hours, at 25,000 gold to a million', () => {
    // The ends pinned as well as the shape: "rises at every step" stays green
    // with a tier retuned, and the price of the top contract is the number the
    // whole exchange below turns on.
    expect(fixture.tiers[0]).toMatchObject({ durationMs: 5 * 60 * 1000, goldCost: 25_000 });
    expect(fixture.tiers[4]).toMatchObject({ durationMs: 8 * 60 * 60 * 1000, goldCost: 1_000_000 });
  });

  it('is offered at five destinations, all taking the same contracts', () => {
    expect(fixture.types).toEqual(['artifact', 'merchant', 'ruins', 'vault', 'abyss']);
  });
});

describe('the timer', () => {
  const fixture = build();

  it('is stored, and never checked', () => {
    /*
     * **The finding.** `COMPLETE_EXPEDITION` looks the expedition up by id and
     * pays it out. It does not compare `startTime + durationMs` against
     * anything — there is no clock in that case at all — so an eight-hour
     * godly contract completes the instant it is started, for its full
     * reward.
     *
     * Measured by doing exactly that: start one and complete it with no time
     * passed. It pays 400 diamonds and 2,400 shards.
     *
     * So an expedition is not a timer, it is a **gold-to-diamonds exchange**
     * with an unenforced delay: 1,000,000 gold buys 400 diamonds and 2,400
     * shards, as fast as a player can press twice.
     */
    expect(fixture.completedImmediately.waitedMs).toBe(0);
    expect(fixture.completedImmediately.durationMs).toBe(8 * 60 * 60 * 1000);
    expect(fixture.completedImmediately.paid).toEqual({ diamonds: 400, shards: 2400, essence: 4 });
  });
});

describe('what a completed expedition hands over', () => {
  const fixture = build();

  it('pays the diamonds, shards and essence it promised', () => {
    const godly = fixture.tiers[4];
    expect(fixture.completedImmediately.paid).toEqual({
      diamonds: godly.reward.diamonds,
      shards: godly.reward.shards,
      essence: godly.reward.essence,
    });
  });

  it('never pays the artifacts every reward carries', () => {
    /*
     * The second dead field of the phase. Every tier stores an `artifacts`
     * count — up to eight on a godly contract — the save reader validates it,
     * and `COMPLETE_EXPEDITION` pays diamonds, shards and essence. There is no
     * artifact anywhere on the shipped state to receive them.
     */
    expect(fixture.tiers.map(tier => tier.reward.artifacts)).toEqual([0, 1, 2, 4, 8]);
    expect(fixture.artifactsPaid).toBe(false);
  });
});

describe('what an expedition refuses', () => {
  const fixture = build();

  it('takes nothing and queues nothing', () => {
    expect(fixture.refusals).toEqual([
      { name: 'cannot afford the contract', goldSpent: 0, queued: 0 },
      { name: 'completing one that is not queued', goldSpent: 0, queued: 0 },
      { name: 'completing the same one twice', goldSpent: 0, queued: 0 },
    ]);
  });

  it('charges a hundred thousand to reroll the contracts on offer', () => {
    expect(fixture.refreshGoldCost).toBe(100_000);
  });
});

describe('the committed fixture', () => {
  it('matches what the rewrite is measured against', () => {
    const fixture = build();
    if (process.env.UPDATE_EXPEDITIONS_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
