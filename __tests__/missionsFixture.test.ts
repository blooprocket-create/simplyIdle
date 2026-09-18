import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { MISSION_BOARD_GOALS, type MissionBoardGoal, type PlayerClass } from '../src/gameConfig';
import { DEFAULT_STATE, reducer, type GameState } from '../src/useGameState';

/**
 * The mission board, measured.
 *
 * Sixteen goals across three horizons, each gated on one of six metrics. The
 * catalogue is easy to read and the *metrics* are not: `getMissionProgressValue`
 * maps a metric name to a state field, and two of those six do not mean what
 * the mission's own description says they mean.
 *
 * So the metrics are measured rather than read — one field moved at a time,
 * against a state where every other candidate is zero, so the table below says
 * which field actually drives each goal rather than which one the title
 * implies.
 *
 * Regenerate deliberately:
 *   UPDATE_MISSIONS_FIXTURE=1 npx jest __tests__/missionsFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'content', '__fixtures__', 'missions.json');

/** Every state field a metric might plausibly be reading. */
const CANDIDATES = [
  'wave',
  'highestWaveReached',
  'totalKills',
  'totalSummons',
  'activeTeam',
  'heroShards',
  'essence',
] as const;
type Candidate = (typeof CANDIDATES)[number];

function state(over: Partial<GameState> = {}): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    level: 40,
    // Every candidate starts at nothing, so a claim that goes through says
    // exactly which one was raised.
    wave: 0,
    highestWaveReached: 0,
    totalKills: 0,
    totalSummons: 0,
    activeTeamHeroIds: [],
    heroShards: 0,
    essence: 0,
    gold: 0,
    totalGold: 0,
    diamonds: 0,
    ...over,
  };
}

/** One candidate raised to `value`, the rest left at nothing. */
function raising(candidate: Candidate, value: number): Partial<GameState> {
  if (candidate === 'activeTeam') {
    return { activeTeamHeroIds: Array.from({ length: Math.max(0, value) }, (_, index) => `u${index}`) };
  }
  return { [candidate]: value } as Partial<GameState>;
}

function claim(from: GameState, missionId: string) {
  const after = reducer(from, { type: 'CLAIM_MISSION', missionId } as never);
  return {
    claimed: after.claimedMissionIds.includes(missionId),
    gold: after.gold - from.gold,
    totalGold: after.totalGold - from.totalGold,
    diamonds: after.diamonds - from.diamonds,
    shards: after.heroShards - from.heroShards,
    essence: after.essence - from.essence,
  };
}

/**
 * Which field drives a mission, found by raising one at a time.
 *
 * A metric measured on a currency is a special case worth naming: raising
 * `heroShards` to the target both satisfies the goal *and* is a reward the
 * goal pays, so the claim moves a field it was measured on. That is the
 * shipped behaviour and the reason those two rows read as they do.
 */
function drivenBy(mission: MissionBoardGoal): Candidate[] {
  return CANDIDATES.filter(candidate => claim(state(raising(candidate, mission.target)), mission.id).claimed);
}

interface Fixture {
  note: string;
  generatedFrom: string;
  missions: {
    id: string;
    horizon: string;
    title: string;
    description: string;
    metric: string;
    target: number;
    /** Which state fields, measured, let this one be claimed. */
    drivenBy: string[];
    gold: number;
    totalGold: number;
    diamonds: number;
    shards: number;
    essence: number;
  }[];
  /** Every way a claim is refused. */
  refusals: { name: string; claimed: boolean; gold: number; shards: number }[];
  /** `getMissionProgressValue` exists twice. Found by an injection that missed. */
  duplication: { copies: string[]; bodiesAgree: boolean; gatesTheClaim: string };
}

/**
 * Both copies of `getMissionProgressValue`, normalised and compared.
 *
 * Found the hard way: an injection into `useGameState.ts` — changing the wave
 * metric to read the deepest wave instead of the current one — left this
 * fixture entirely green, because `CLAIM_MISSION` calls a *second* copy in
 * `progressionReducer.ts`. The first drives the progress bars a player reads;
 * the second decides whether the button works. They agree today and nothing
 * makes them.
 *
 * Whitespace and braces are normalised out, for the reason the Phase 10
 * tripwire needed it: two copies that differ only in formatting are not a
 * divergence, and reporting them as one makes the check useless.
 */
function progressCopies(): { copies: string[]; bodiesAgree: boolean } {
  const files = ['src/useGameState.ts', 'src/reducers/progressionReducer.ts'];
  const bodies = files.map(file => {
    const source = readFileSync(join(__dirname, '..', file), 'utf8');
    const start = source.indexOf('function getMissionProgressValue');
    if (start < 0) return null;
    const end = source.indexOf('\n}', start);
    return source.slice(start, end).replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  });
  const found = files.filter((_, index) => bodies[index] !== null);
  return { copies: found, bodiesAgree: bodies[0] !== null && bodies[0] === bodies[1] };
}

function build(): Fixture {
  const paid = (mission: MissionBoardGoal) => {
    const driver = drivenBy(mission)[0] ?? 'wave';
    return claim(state(raising(driver, mission.target)), mission.id);
  };

  const refusal = (name: string, from: GameState, missionId: string) => {
    const moved = claim(from, missionId);
    return { name, claimed: moved.claimed, gold: moved.gold, shards: moved.shards };
  };

  const first = MISSION_BOARD_GOALS[0];
  const met = state(raising(drivenBy(first)[0], first.target));

  return {
    note: 'The mission board, measured through the shipped reducer.',
    generatedFrom: 'src/gameConfig.ts MISSION_BOARD_GOALS, src/reducers/progressionReducer.ts CLAIM_MISSION',
    missions: MISSION_BOARD_GOALS.map(mission => {
      const reward = paid(mission);
      return {
        id: mission.id,
        horizon: mission.horizon,
        title: mission.title,
        description: mission.description,
        metric: mission.metric,
        target: mission.target,
        drivenBy: drivenBy(mission),
        gold: reward.gold,
        totalGold: reward.totalGold,
        diamonds: reward.diamonds,
        shards: reward.shards,
        essence: reward.essence,
      };
    }),
    duplication: { ...progressCopies(), gatesTheClaim: 'src/reducers/progressionReducer.ts' },
    refusals: [
      refusal('short of the target', state(raising('wave', first.target - 1)), first.id),
      refusal('already claimed', reducer(met, { type: 'CLAIM_MISSION', missionId: first.id } as never), first.id),
      refusal('no such mission', met, 'not_a_mission'),
    ],
  };
}

describe('the mission board', () => {
  const fixture = build();

  it('lists sixteen goals across three horizons', () => {
    expect(fixture.missions).toHaveLength(16);
    expect([...new Set(fixture.missions.map(mission => mission.horizon))].sort()).toEqual(['long', 'medium', 'short']);
  });

  it('gates every one on exactly one state field', () => {
    // A goal driven by two fields would be claimable by a route its
    // description does not describe; one driven by none is unreachable.
    expect(fixture.missions.filter(mission => mission.drivenBy.length !== 1).map(mission => mission.id)).toEqual([]);
  });

  it('pays gold, shards, essence and diamonds, and raises lifetime gold with the purse', () => {
    const paying = fixture.missions.filter(mission => mission.gold > 0);
    expect(paying.length).toBeGreaterThan(0);
    // Lifetime gold moves with the purse, as every other grant in the game
    // does — a reward that did not would make `totalGold` goals cheaper.
    expect(paying.map(mission => mission.totalGold)).toEqual(paying.map(mission => mission.gold));
    expect(fixture.missions.some(mission => mission.diamonds > 0)).toBe(true);
    expect(fixture.missions.some(mission => mission.essence > 0)).toBe(true);
  });

  it('pays more for a longer horizon than a shorter one', () => {
    const best = (horizon: string) =>
      Math.max(...fixture.missions.filter(mission => mission.horizon === horizon).map(mission => mission.gold));
    expect(best('short')).toBeLessThan(best('medium'));
    expect(best('medium')).toBeLessThan(best('long'));
  });
});

describe('what a goal is actually measured on', () => {
  const fixture = build();
  const driverOf = (id: string) => fixture.missions.find(mission => mission.id === id)!.drivenBy[0];
  const saying = (needle: string) => fixture.missions.filter(mission => mission.description.includes(needle));

  it('reads the wave the player is on, not the deepest they have reached', () => {
    /*
     * `state.wave`, not `state.highestWaveReached`. So "Reach Wave 20 this
     * run" is claimable only *while* standing at 20 or beyond: a player who
     * reached wave 60, wiped back to 41 and came here finds it locked, and a
     * rebirth takes it away entirely.
     *
     * Ported as measured. It is also the reason the rewrite's mission screen
     * has to read a live snapshot rather than the save.
     */
    for (const mission of fixture.missions.filter(entry => entry.metric === 'wave')) {
      expect(mission.drivenBy).toEqual(['wave']);
    }
  });

  it('counts kills for all time, whatever the description says', () => {
    /*
     * The second divergence, and the one a player would notice: every
     * kill-metric goal says "this run", and the metric is `state.totalKills`
     * — lifetime. A returning account with 50,000 kills behind it can claim
     * all of them without fighting anything.
     *
     * There is no per-run kill counter on the shipped state to read instead,
     * which is why this is a description bug rather than a metric bug.
     */
    const runWording = saying('this run').filter(mission => mission.metric === 'kills');
    expect(runWording.length).toBeGreaterThan(0);
    for (const mission of runWording) {
      expect(mission.drivenBy).toEqual(['totalKills']);
    }
  });

  it('reads the fields the other four name', () => {
    expect(driverOf('m_short_team_4')).toBe('activeTeam');
    const byMetric = Object.fromEntries(fixture.missions.map(mission => [mission.metric, mission.drivenBy[0]]));
    expect(byMetric).toMatchObject({
      summons: 'totalSummons',
      hero_shards: 'heroShards',
      essence: 'essence',
    });
  });
});

describe('what a claim refuses', () => {
  const fixture = build();

  it('takes nothing and grants nothing', () => {
    expect(fixture.refusals).toEqual([
      { name: 'short of the target', claimed: false, gold: 0, shards: 0 },
      { name: 'already claimed', claimed: true, gold: 0, shards: 0 },
      { name: 'no such mission', claimed: false, gold: 0, shards: 0 },
    ]);
  });
});

describe('the same rule, written twice', () => {
  const fixture = build();

  it('is written twice, and the screen reads the copy the button does not', () => {
    /*
     * Found by an injection that did not bite. Changing the wave metric in
     * `useGameState.ts` left every test here green, because `CLAIM_MISSION`
     * calls its own copy in `progressionReducer.ts`. The first drives the
     * progress bar a player reads; the second decides whether the button
     * works, and a divergence shows up as a mission that reads 100% and
     * refuses to be claimed.
     *
     * The rewrite has one function and both callers use it, which is the fix
     * rather than a tidy-up. This records the shipped arrangement so the
     * claim "they agree" is checked rather than assumed.
     */
    expect(fixture.duplication.copies).toEqual(['src/useGameState.ts', 'src/reducers/progressionReducer.ts']);
    expect(fixture.duplication.bodiesAgree).toBe(true);
  });
});

describe('the committed fixture', () => {
  it('matches what the rewrite is measured against', () => {
    const fixture = build();
    if (process.env.UPDATE_MISSIONS_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
