import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { HERO_POOL, getMonsterMaxHp, type HeroUnit, type PlayerClass, type Rarity } from '../src/gameConfig';
import { DEFAULT_STATE, advanceCombatStep, getDpsBreakdown, reducer, type GameState } from '../src/useGameState';

/**
 * Reference behaviour for offline progress.
 *
 * The shipped `simulateOfflineProgress` steps the full combat loop until the
 * window is spent. The rewrite cannot do that — its simulation is entities and
 * timers, not one arithmetic expression — so the offline path has to become a
 * closed-form estimator, and this fixture is what the estimator is measured
 * against.
 *
 * Writing it turned up three things about the shipped behaviour that are not
 * obvious from reading the code, all pinned as assertions below:
 *
 * 1. Offline progress is a **sawtooth**, not a climb. One kill advances one
 *    wave, but when the team dies they retreat to the start of their
 *    twenty-wave chapter and climb again. A team at its ceiling oscillates.
 * 2. So a player can come back **behind where they left**. `wavesGained` is
 *    reported as `Math.max(0, …)`, which means the loss is never shown.
 * 3. A stalled team costs the most to simulate, not the fastest one. With
 *    nothing to kill and nothing killing it, the step size collapses to the
 *    one second ceiling and an eight hour window becomes 28,800 full combat
 *    steps — measured at ~17 seconds of blocking work on a desktop, and this
 *    happens on the load screen.
 *
 * Regenerate deliberately:
 *   UPDATE_OFFLINE_FIXTURE=1 npx jest __tests__/offlineProgressFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'engine', 'offline', '__fixtures__', 'offline-progress.json');

const FIXED_NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const MINUTE = 60_000;
const WINDOWS_MS = [MINUTE, 10 * MINUTE, 60 * MINUTE];
/** Short enough to catch a single death, before the climb back hides it. */
const SHORT_WINDOWS_MS = [30_000, MINUTE, 5 * MINUTE];

function hero(templateId: string, overrides: Partial<HeroUnit> = {}): HeroUnit {
  const template = HERO_POOL.find(entry => entry.id === templateId);
  if (!template) throw new Error(`no such hero template: ${templateId}`);
  return {
    ...template,
    uid: `${templateId}_u`,
    rarity: 'common' as Rarity,
    level: 1,
    rank: 1,
    teamBoost: template.baseTeamBoost,
    rebirthStatMult: 1,
    ...overrides,
  };
}

/** One hero per class, in a fixed order, so a team is reproducible. */
function team(size: number, level: number, rarity: Rarity, rank: number): HeroUnit[] {
  const classes: PlayerClass[] = ['warrior', 'berserker', 'mage', 'archer', 'monk', 'warrior'];
  return classes.slice(0, size).map((heroClass, index) =>
    hero(HERO_POOL.filter(entry => entry.heroClass === heroClass)[index % 3].id, {
      uid: `u${index}`,
      level,
      rarity,
      rank,
    }),
  );
}

function state(overrides: Partial<GameState>): GameState {
  const base = {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    ...overrides,
  };
  return { ...base, monsterHp: getMonsterMaxHp(base.wave), monsterMaxHp: getMonsterMaxHp(base.wave) };
}

const ACTIVE_6 = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5'];

/**
 * Give a hand-built state its real derived HP.
 *
 * `teamMaxHp` is computed by a private `getTeamMaxHp` and only written onto
 * the state when a fight ends, so a state assembled by spreading
 * `DEFAULT_STATE` carries the starting 100 no matter what roster it holds.
 * Measuring incoming damage against that produces nonsense — the first
 * scenario built this way reported a *negative* damage rate, because the team
 * was healed up to its true maximum inside the slice being measured.
 *
 * So each scenario is fought until one round resolves, which is the only way
 * to make the engine publish the number. Active heroes start a level low so
 * that the level the resolving kill grants lands them where the scenario asks.
 */
function settle(target: GameState): GameState {
  const activeUids = new Set(target.activeTeamHeroIds);
  const lowered: GameState = {
    ...target,
    heroRoster: target.heroRoster.map(entry =>
      activeUids.has(entry.uid) ? { ...entry, level: Math.max(1, entry.level - 1) } : entry,
    ),
  };

  let working = lowered;
  for (let step = 0; step < 5_000; step += 1) {
    working = advanceCombatStep(working, 100);
    // A kill or a defeat both end a round, and both publish the derived pair.
    if (working.totalKills > lowered.totalKills || working.wave < lowered.wave) break;
  }
  if (working.teamMaxHp === lowered.teamMaxHp) {
    throw new Error(`scenario never resolved a round, so its team HP is still the default`);
  }

  return { ...target, teamHp: working.teamMaxHp, teamMaxHp: working.teamMaxHp };
}

interface Scenario {
  name: string;
  note: string;
  state: GameState;
  windowsMs: number[];
}

function scenarios(): Scenario[] {
  return [
    {
      name: 'fresh',
      note: 'A new account: two level-one commons at wave three.',
      state: state({
        level: 5,
        wave: 3,
        heroRoster: [hero('h1', { uid: 'u0' }), hero('h7', { uid: 'u1' })],
        activeTeamHeroIds: ['u0', 'u1'],
      }),
      windowsMs: WINDOWS_MS,
    },
    {
      name: 'climbing',
      note: 'A mid-game team comfortably below their ceiling, so the window is a pure climb.',
      state: state({
        level: 60,
        wave: 40,
        heroRoster: team(4, 140, 'epic', 5),
        activeTeamHeroIds: ['u0', 'u1', 'u2', 'u3'],
        teamSlotsUnlocked: 4,
      }),
      windowsMs: WINDOWS_MS,
    },
    {
      name: 'post-rebirth',
      note: 'A maxed roster parked back at wave one — the state every prestige produces.',
      state: state({
        level: 500,
        wave: 1,
        prestigeCount: 10,
        metaDamageLevel: 200,
        heroRoster: team(6, 999, 'transcendent', 10),
        activeTeamHeroIds: ACTIVE_6,
        teamSlotsUnlocked: 6,
      }),
      windowsMs: WINDOWS_MS,
    },
    {
      name: 'at-ceiling',
      // Self-calibrating rather than a guessed wave number: whatever the maxed
      // roster reaches after an hour from wave one *is* its ceiling, so the
      // scenario cannot drift out of date when balance moves.
      note: 'A team already at the wave they cannot pass. This is the expensive case.',
      state: state({
        level: 500,
        wave: ceilingWave(),
        prestigeCount: 10,
        metaDamageLevel: 200,
        heroRoster: team(6, 999, 'transcendent', 10),
        activeTeamHeroIds: ACTIVE_6,
        teamSlotsUnlocked: 6,
      }),
      windowsMs: WINDOWS_MS,
    },
    {
      name: 'loses-ground',
      /*
       * Three waves below the ceiling, with windows short enough to catch one
       * death before the climb back hides it.
       *
       * The team clears a wave or two, dies, and retreats to the start of its
       * twenty-wave chapter — from 118 that is wave 101. A player who closed
       * the tab at 118 and reopened it thirty seconds later is seventeen waves
       * worse off, and the reward popup tells them `+0 waves` because it
       * reports `Math.max(0, delta)`.
       *
       * Over longer windows the climb papers over it, which is why the fixture
       * needed a scenario of its own rather than a shorter window on an
       * existing one.
       */
      note: 'Just below the ceiling, over windows short enough to see a single death.',
      state: state({
        level: 500,
        wave: ceilingWave() - 3,
        prestigeCount: 10,
        metaDamageLevel: 200,
        heroRoster: team(6, 999, 'transcendent', 10),
        activeTeamHeroIds: ACTIVE_6,
        teamSlotsUnlocked: 6,
      }),
      windowsMs: SHORT_WINDOWS_MS,
    },
  ];
}

/** Where a maxed roster settles after an hour, measured rather than assumed. */
function ceilingWave(): number {
  const start = settle(
    state({
      level: 500,
      wave: 1,
      prestigeCount: 10,
      metaDamageLevel: 200,
      heroRoster: team(6, 999, 'transcendent', 10),
      activeTeamHeroIds: ACTIVE_6,
      teamSlotsUnlocked: 6,
    }),
  );
  return reducer(start, { type: 'APPLY_OFFLINE_PROGRESS', elapsedMs: 60 * MINUTE } as never).wave;
}

/**
 * The inputs a closed-form estimator needs, measured off the shipped code
 * rather than recomputed from it.
 *
 * Gold and exp per kill come from stepping combat until a kill actually lands,
 * which is the only way to get the number without re-deriving the twelve
 * multiplier chain inside `killMonster`. Incoming damage is measured the same
 * way: step a known slice and read how much team HP moved.
 */
function measureInputs(source: GameState) {
  const breakdown = getDpsBreakdown(source);

  // Step until exactly one kill lands, then read what it paid.
  let working = source;
  let elapsedToKill = 0;
  for (let step = 0; step < 5_000 && working.totalKills === source.totalKills; step += 1) {
    working = advanceCombatStep(working, 100);
    elapsedToKill += 100;
  }
  const killed = working.totalKills > source.totalKills;

  // Incoming damage needs a slice with no kill in it, or the heal-to-full at
  // the end of the round shows up as negative damage.
  const sliceMs = killed ? Math.max(1, Math.min(100, Math.floor(elapsedToKill / 4))) : 100;
  const stepped = advanceCombatStep(source, sliceMs);
  const clean = stepped.totalKills === source.totalKills && stepped.wave === source.wave;
  const incomingDmgPerSec = clean ? ((source.teamHp - stepped.teamHp) * 1000) / sliceMs : null;

  return {
    wave: source.wave,
    finalDps: breakdown.finalDps,
    teamHp: source.teamHp,
    teamMaxHp: source.teamMaxHp,
    monsterMaxHp: getMonsterMaxHp(source.wave),
    incomingDmgPerSec,
    goldPerKill: killed ? working.gold - source.gold : null,
    expPerKill: killed ? working.totalExp - source.totalExp : null,
    msToFirstKill: killed ? elapsedToKill : null,
  };
}

function runWindow(source: GameState, elapsedMs: number) {
  const after = reducer(source, { type: 'APPLY_OFFLINE_PROGRESS', elapsedMs } as never);
  return {
    elapsedMs,
    kills: after.totalKills - source.totalKills,
    // Signed on purpose. The shipped reward popup clamps this at zero, which
    // is how a player loses a hundred waves and is told they gained none.
    waveDelta: after.wave - source.wave,
    endWave: after.wave,
    gold: after.gold - source.gold,
    exp: after.totalExp - source.totalExp,
    endHeroLevel: after.heroRoster[0]?.level ?? 0,
    endPlayerLevel: after.level,
  };
}

interface Fixture {
  note: string;
  generatedFrom: string;
  nowMs: number;
  tickMs: number;
  scenarios: {
    name: string;
    note: string;
    inputs: ReturnType<typeof measureInputs>;
    windows: ReturnType<typeof runWindow>[];
  }[];
}

function build(): Fixture {
  return {
    note: 'Shipped offline progress, measured. Owned by __tests__/offlineProgressFixture.test.ts.',
    generatedFrom: 'src/useGameState.ts simulateOfflineProgress via APPLY_OFFLINE_PROGRESS',
    nowMs: FIXED_NOW,
    tickMs: 100,
    scenarios: scenarios().map(entry => {
      const settled = settle(entry.state);
      return {
        name: entry.name,
        note: entry.note,
        inputs: measureInputs(settled),
        windows: entry.windowsMs.map(window => runWindow(settled, window)),
      };
    }),
  };
}

describe('offline progress fixture', () => {
  let nowSpy: jest.SpyInstance<number, []>;
  let randomSpy: jest.SpyInstance<number, []>;
  let fixture: Fixture;

  beforeAll(() => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    fixture = build();
  }, 120_000);

  afterAll(() => {
    nowSpy.mockRestore();
    randomSpy.mockRestore();
  });

  const scenario = (name: string) => {
    const found = fixture.scenarios.find(entry => entry.name === name);
    if (!found) throw new Error(`no scenario ${name}`);
    return found;
  };

  it('measures the inputs an estimator would need', () => {
    for (const entry of fixture.scenarios) {
      expect({ name: entry.name, dps: entry.inputs.finalDps > 0 }).toEqual({ name: entry.name, dps: true });
      expect({ name: entry.name, gold: entry.inputs.goldPerKill }).not.toEqual({ name: entry.name, gold: null });
    }
  });

  it('shows offline progress is a sawtooth, not a climb', () => {
    // A team at its ceiling kills thousands of monsters and ends where it
    // started. Nothing in the shipped code says this out loud.
    const ceiling = scenario('at-ceiling');
    const hour = ceiling.windows.find(window => window.elapsedMs === 60 * MINUTE)!;
    expect(hour.kills).toBeGreaterThan(400);
    expect(Math.abs(hour.waveDelta)).toBeLessThan(25);
  });

  it('shows a player can come back behind where they left', () => {
    const losses = fixture.scenarios
      .flatMap(entry => entry.windows.map(window => ({ scenario: entry.name, ...window })))
      .filter(window => window.waveDelta < 0);

    expect(losses.length).toBeGreaterThan(0);
    // The drop is a chapter retreat, so it is large rather than incidental.
    expect(Math.min(...losses.map(window => window.waveDelta))).toBeLessThan(-10);

    for (const window of losses) {
      // Monsters still died, so the window was not simply idle.
      expect({ scenario: window.scenario, kills: window.kills > 0 }).toEqual({
        scenario: window.scenario,
        kills: true,
      });
      // And this is what the shipped reward popup would have shown for it.
      expect(Math.max(0, window.waveDelta)).toBe(0);
    }
  });

  it('shows the retreat lands exactly on a chapter boundary', () => {
    /*
     * Chapters are twenty waves and a defeat retreats to the start of the
     * current one, which is why the loss above is seventeen waves rather than
     * one. The shortest window catches the retreat before any climb-back, so
     * it lands on the boundary exactly — an earlier version of this test
     * asserted `endWave > 1` as its escape hatch and would have passed for
     * any number at all.
     */
    const ground = scenario('loses-ground');
    const chapterStart = Math.floor((ground.inputs.wave - 1) / 20) * 20 + 1;

    const shortest = ground.windows.reduce((best, window) => (window.elapsedMs < best.elapsedMs ? window : best));
    expect(shortest.endWave).toBe(chapterStart);
    expect((shortest.endWave - 1) % 20).toBe(0);

    // Every longer window is the same retreat plus a partial climb back, so
    // none may finish below the boundary.
    for (const window of ground.windows) {
      expect({ ms: window.elapsedMs, aboveBoundary: window.endWave >= chapterStart }).toEqual({
        ms: window.elapsedMs,
        aboveBoundary: true,
      });
    }
  });

  it('shows a maxed roster still stalls in the low hundreds', () => {
    // Post-rebirth, a transcendent rank-ten team at wave one does not run
    // away — monster HP at 1.12^wave outruns any roster within ~120 waves.
    // That ceiling is what makes the sawtooth the normal case rather than an
    // edge case.
    const rebirth = scenario('post-rebirth');
    const hour = rebirth.windows.find(window => window.elapsedMs === 60 * MINUTE)!;
    expect(hour.endWave).toBeGreaterThan(90);
    expect(hour.endWave).toBeLessThan(200);
  });

  it('shows rewards keep accruing while the wave does not', () => {
    // The corollary, and the reason offline progress is worth anything at all
    // at the ceiling: gold and exp come per kill, not per wave.
    const ceiling = scenario('at-ceiling');
    for (const window of ceiling.windows) {
      expect({ ms: window.elapsedMs, goldPositive: window.gold > 0 }).toEqual({
        ms: window.elapsedMs,
        goldPositive: true,
      });
    }
    const [short, , long] = ceiling.windows;
    expect(long.gold).toBeGreaterThan(short.gold);
  });

  it('matches the committed fixture the estimator is measured against', () => {
    if (process.env.UPDATE_OFFLINE_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }

    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
