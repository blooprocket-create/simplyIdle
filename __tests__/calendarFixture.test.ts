import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { WEEKLY_TRACK_MILESTONES, type PlayerClass } from '../src/gameConfig';
import { DEFAULT_STATE, reducer, type GameState } from '../src/useGameState';

/**
 * The calendar: the daily login streak, the weekly rollover, and the track.
 *
 * Three actions that are the whole of "a reason to come back", and all three
 * are arithmetic on a wall clock — which is exactly the kind of rule that is
 * easy to port from reading and wrong at the boundary. So the boundaries are
 * *found* rather than assumed: the day and week edges are bisected against the
 * shipped reducer rather than derived from the divisor.
 *
 * Every case passes `nowMs` explicitly. The shipped actions take it as an
 * argument, which is the one place in this codebase where the shipped game
 * already does what the rewrite's engine boundary requires.
 *
 * Regenerate deliberately:
 *   UPDATE_CALENDAR_FIXTURE=1 npx jest __tests__/calendarFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'content', '__fixtures__', 'calendar.json');

const DAY_MS = 86_400_000;
/** A Thursday, which is what makes it a clean base for both boundaries. */
const BASE = Date.UTC(2026, 0, 15, 12, 0, 0);

function state(over: Partial<GameState> = {}): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    level: 40,
    gold: 0,
    totalGold: 0,
    heroShards: 0,
    essence: 0,
    freeSummonCharges: 0,
    dailyLoginStreak: 0,
    lastDailyLoginDay: null,
    streakInsuranceCharges: 0,
    weeklyKills: 0,
    weeklyTrackClaimed: [],
    ...over,
  };
}

const login = (from: GameState, nowMs: number) => reducer(from, { type: 'APPLY_DAILY_LOGIN', nowMs } as never);
const rollover = (from: GameState, nowMs: number) => reducer(from, { type: 'APPLY_WEEKLY_ROLLOVER', nowMs } as never);

/** Log in once a day for `days` days, and report each day's state. */
function streakOf(days: number, startMs = BASE) {
  let current = state();
  const rows: { day: number; streak: number; gold: number; shards: number; freeSummons: number; insurance: number }[] =
    [];
  for (let day = 1; day <= days; day++) {
    const before = current;
    current = login(current, startMs + (day - 1) * DAY_MS);
    rows.push({
      day,
      streak: current.dailyLoginStreak,
      gold: current.gold - before.gold,
      shards: current.heroShards - before.heroShards,
      freeSummons: current.freeSummonCharges - before.freeSummonCharges,
      insurance: current.streakInsuranceCharges,
    });
  }
  return rows;
}

/**
 * The exact instant a boundary moves, found by bisection.
 *
 * Reading the divisor would give the same answer and prove nothing: the
 * question is what the *reducer* treats as a new day, and a port that floors
 * a local timestamp instead of a UTC one is wrong by up to thirteen hours
 * without changing any divisor.
 */
function firstInstantOfNextDay(afterMs: number): number {
  let no = afterMs;
  let yes = afterMs + 2 * DAY_MS;
  const isNextDay = (at: number) =>
    login(state({ lastDailyLoginDay: Math.floor(afterMs / DAY_MS) }), at).dailyLoginStreak > 0;
  while (yes - no > 1) {
    const mid = Math.floor((no + yes) / 2);
    if (isNextDay(mid)) yes = mid;
    else no = mid;
  }
  return yes;
}

function firstInstantOfNextWeek(afterMs: number): number {
  const settled = rollover(state(), afterMs);
  let no = afterMs;
  let yes = afterMs + 14 * DAY_MS;
  const isNextWeek = (at: number) => rollover(settled, at).weeklyEventWeek !== settled.weeklyEventWeek;
  while (yes - no > 1) {
    const mid = Math.floor((no + yes) / 2);
    if (isNextWeek(mid)) yes = mid;
    else no = mid;
  }
  return yes;
}

interface Fixture {
  note: string;
  generatedFrom: string;
  /** The day boundary, as an ISO instant. Found by bisection, not by reading. */
  dayBoundary: string;
  /** The week boundary, likewise. */
  weekBoundary: string;
  weekBoundaryWeekday: string;
  /**
   * Twelve days of unbroken logins. Ten would not do: the curve is
   * `min(9, streak - 1)`, so the cap does not engage until the eleventh and a
   * ten-day table is green with the cap deleted.
   */
  streak: ReturnType<typeof streakOf>;
  /** What a gap in the streak does, with and without insurance. */
  gaps: { name: string; gapDays: number; insuranceBefore: number; streak: number; insuranceAfter: number }[];
  /** The weekly track: four milestones and what each pays. */
  track: { milestone: number; gold: number; shards: number; essence: number }[];
  /** What a rollover clears. */
  rollover: { weekMoved: boolean; weeklyKills: number; claimedCount: number };
  refusals: { name: string; moved: boolean }[];
}

function build(): Fixture {
  const gap = (name: string, gapDays: number, insuranceBefore: number) => {
    const first = login(state({ streakInsuranceCharges: insuranceBefore }), BASE);
    const primed = { ...first, dailyLoginStreak: 5 };
    const after = login(primed, BASE + gapDays * DAY_MS);
    return {
      name,
      gapDays,
      insuranceBefore,
      streak: after.dailyLoginStreak,
      insuranceAfter: after.streakInsuranceCharges,
    };
  };

  const trackRow = (milestone: number) => {
    const before = state({ weeklyKills: 1_000 });
    const after = reducer(before, { type: 'CLAIM_WEEKLY_TRACK', milestone } as never);
    return {
      milestone,
      gold: after.gold - before.gold,
      shards: after.heroShards - before.heroShards,
      essence: after.essence - before.essence,
    };
  };

  const settled = rollover(state(), BASE);
  const dirty = { ...settled, weeklyKills: 400, weeklyTrackClaimed: [25, 75] };
  const rolled = rollover(dirty, BASE + 14 * DAY_MS);

  const refusal = (name: string, before: GameState, action: unknown) => {
    const after = reducer(before, action as never);
    return {
      name,
      moved:
        after.gold !== before.gold ||
        after.heroShards !== before.heroShards ||
        after.dailyLoginStreak !== before.dailyLoginStreak ||
        after.weeklyTrackClaimed.length !== before.weeklyTrackClaimed.length,
    };
  };

  const weekBoundary = firstInstantOfNextWeek(BASE);

  return {
    note: 'The daily streak, the weekly rollover and the weekly track, measured.',
    generatedFrom: 'src/reducers/progressionReducer.ts',
    dayBoundary: new Date(firstInstantOfNextDay(BASE)).toISOString(),
    weekBoundary: new Date(weekBoundary).toISOString(),
    weekBoundaryWeekday: new Date(weekBoundary).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }),
    streak: streakOf(12),
    gaps: [
      gap('the next day', 1, 0),
      gap('a day missed, no insurance', 2, 0),
      gap('a day missed, insurance held', 2, 1),
      gap('two days missed, insurance held', 3, 1),
    ],
    track: WEEKLY_TRACK_MILESTONES.map(trackRow),
    rollover: {
      weekMoved: rolled.weeklyEventWeek !== dirty.weeklyEventWeek,
      weeklyKills: rolled.weeklyKills,
      claimedCount: rolled.weeklyTrackClaimed.length,
    },
    refusals: [
      refusal('logging in twice the same day', login(state(), BASE), { type: 'APPLY_DAILY_LOGIN', nowMs: BASE + 1 }),
      refusal('a rollover inside the same week', settled, { type: 'APPLY_WEEKLY_ROLLOVER', nowMs: BASE + 1 }),
      refusal('a track milestone not reached', state({ weeklyKills: 24 }), {
        type: 'CLAIM_WEEKLY_TRACK',
        milestone: 25,
      }),
      refusal('a track milestone already claimed', state({ weeklyKills: 1_000, weeklyTrackClaimed: [25] }), {
        type: 'CLAIM_WEEKLY_TRACK',
        milestone: 25,
      }),
      refusal('a milestone nobody listed', state({ weeklyKills: 1_000 }), {
        type: 'CLAIM_WEEKLY_TRACK',
        milestone: 26,
      }),
    ],
  };
}

describe('when a day turns over', () => {
  const fixture = build();

  it('turns at midnight UTC, not at any local midnight', () => {
    // Bisected against the reducer. A port flooring a local timestamp is wrong
    // by up to thirteen hours without changing a single divisor.
    expect(fixture.dayBoundary).toMatch(/T00:00:00\.000Z$/);
  });

  it('refuses a second login the same day', () => {
    expect(fixture.refusals[0]).toEqual({ name: 'logging in twice the same day', moved: false });
  });
});

describe('the streak, day by day', () => {
  const fixture = build();

  it('counts up while the days are consecutive', () => {
    expect(fixture.streak.map(row => row.streak)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('pays more each day, and stops climbing after the tenth', () => {
    /*
     * `250 + min(9, streak - 1) * 80`, so the tenth day is the last raise and
     * every day after it pays the same.
     *
     * The table ran to ten at first, which proved nothing: `min(9, streak - 1)`
     * is just `streak - 1` up to day ten, so deleting the cap left every row
     * green. Days eleven and twelve are what make the cap measurable.
     */
    expect(fixture.streak.map(row => row.gold)).toEqual([250, 330, 410, 490, 570, 650, 730, 810, 890, 970, 970, 970]);
    expect(fixture.streak.map(row => row.shards)).toEqual([20, 26, 32, 38, 44, 50, 56, 62, 68, 74, 74, 74]);
  });

  it('hands a free summon every third day', () => {
    expect(fixture.streak.filter(row => row.freeSummons > 0).map(row => row.day)).toEqual([3, 6, 9, 12]);
  });

  it('hands a streak insurance every seventh day', () => {
    expect(fixture.streak.map(row => row.insurance)).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
  });
});

describe('a day missed', () => {
  const fixture = build();

  it('starts again from one, unless insurance covers it', () => {
    /*
     * The whole design of the insurance charge: it covers a gap of **exactly
     * one missed day** and nothing longer. A player who misses two is back to
     * day one whatever they hold, which is worth pinning because a port that
     * spent the charge on any gap would quietly make the streak unbreakable.
     */
    expect(fixture.gaps).toEqual([
      { name: 'the next day', gapDays: 1, insuranceBefore: 0, streak: 6, insuranceAfter: 0 },
      { name: 'a day missed, no insurance', gapDays: 2, insuranceBefore: 0, streak: 1, insuranceAfter: 0 },
      { name: 'a day missed, insurance held', gapDays: 2, insuranceBefore: 1, streak: 6, insuranceAfter: 0 },
      { name: 'two days missed, insurance held', gapDays: 3, insuranceBefore: 1, streak: 1, insuranceAfter: 1 },
    ]);
  });

  it('spends the charge only when it actually saved the streak', () => {
    // The row above says it: the three-day gap keeps its charge.
    const saved = fixture.gaps.find(row => row.name === 'a day missed, insurance held')!;
    const wasted = fixture.gaps.find(row => row.name === 'two days missed, insurance held')!;
    expect(saved.insuranceAfter).toBe(0);
    expect(wasted.insuranceAfter).toBe(1);
  });
});

describe('the week', () => {
  const fixture = build();

  it('turns over on a Thursday, because the epoch was one', () => {
    /*
     * `floor(ts / 604800000)` counts weeks from the Unix epoch, and 1 January
     * 1970 was a Thursday — so the game's week starts on Thursday at midnight
     * UTC. Nobody wrote that down; it falls out of the divisor, and it is the
     * kind of thing a rewrite silently "fixes" to Monday.
     */
    expect(fixture.weekBoundaryWeekday).toBe('Thursday');
    expect(fixture.weekBoundary).toMatch(/T00:00:00\.000Z$/);
  });

  it('clears the week’s kills and its claimed track when it turns', () => {
    expect(fixture.rollover).toEqual({ weekMoved: true, weeklyKills: 0, claimedCount: 0 });
  });

  it('does nothing inside the same week', () => {
    expect(fixture.refusals[1]).toEqual({ name: 'a rollover inside the same week', moved: false });
  });
});

describe('the weekly track', () => {
  const fixture = build();

  it('has four milestones, each paying more than the last', () => {
    expect(fixture.track.map(row => row.milestone)).toEqual([25, 75, 150, 260]);
    expect(fixture.track.map(row => row.gold)).toEqual([520, 1_120, 2_020, 3_340]);
    expect(fixture.track.map(row => row.shards)).toEqual([63, 153, 288, 486]);
  });

  it('steps essence in threes and then stops, so the top milestone adds none', () => {
    /*
     * `m >= 150 ? 4 : m >= 75 ? 2 : 1`, which measured is **1, 2, 4, 4**. I
     * predicted 1, 1, 2, 4 from reading the shape rather than the thresholds.
     *
     * The flat top is the part worth keeping: the 260 milestone costs a
     * hundred and ten more kills than the 150 and pays the same essence. Gold
     * and shards still climb, so it is not a dead rung — but it is the only
     * reward on the track that stops.
     */
    expect(fixture.track.map(row => row.essence)).toEqual([1, 2, 4, 4]);
    expect(fixture.track[3].essence).toBe(fixture.track[2].essence);
  });

  it('refuses one not reached, one already taken, and one nobody listed', () => {
    expect(fixture.refusals.slice(2)).toEqual([
      { name: 'a track milestone not reached', moved: false },
      { name: 'a track milestone already claimed', moved: false },
      { name: 'a milestone nobody listed', moved: false },
    ]);
  });
});

describe('the committed fixture', () => {
  it('matches what the rewrite is measured against', () => {
    const fixture = build();
    if (process.env.UPDATE_CALENDAR_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
