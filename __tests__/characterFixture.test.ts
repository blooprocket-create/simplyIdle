import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { HERO_POOL, type HeroUnit, type PlayerClass, type Rarity, type StatBlock } from '../src/gameConfig';
import { DEFAULT_STATE, advanceCombatStep, computeStats, reducer, type GameState } from '../src/useGameState';

/**
 * Reference values for the player's character: their stats, and the team
 * health those stats produce.
 *
 * The rewrite has no character at all. Its `Simulation` takes `teamMaxHp` as
 * an option and `demoRoster.ts` hands it a flat `2000` with a note saying why
 * — "nothing derives it yet". Everything downstream of that number is
 * therefore unanchored: how long a team survives, which wave is the wall,
 * where the offline sawtooth turns over. So this is the fixture the derivation
 * is built against, and it is written before the derivation exists.
 *
 * Two things about the shipped code shaped what is recorded here.
 *
 * `getTeamMaxHp` is private and the state only carries the number *after* a
 * round resolves, so a hand-built state reports the starting 100 no matter
 * what roster it holds. Each scenario is fought until one round ends, which is
 * the only way to make the engine publish it — the same technique
 * `offlineProgressFixture` uses, and for the same reason.
 *
 * Equipment is deliberately absent from every scenario. `derivedStats` sums
 * class base, allocated points and an equipment bonus, and the third of those
 * is Phase 9 — including it now would bake a term the rewrite cannot compute
 * into the baseline it is measured against. With no equipment the term is
 * zero, so the fixture is exact for the two halves that do exist and silent
 * about the one that does not.
 *
 * Regenerate deliberately:
 *   UPDATE_CHARACTER_FIXTURE=1 npx jest __tests__/characterFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'engine', 'character', '__fixtures__', 'character.json');

const FIXED_NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const CLASSES: PlayerClass[] = ['warrior', 'berserker', 'archer', 'mage', 'monk'];
const STAT_KEYS: (keyof StatBlock)[] = ['strength', 'vitality', 'agility', 'intelligence', 'spirit'];

/**
 * Pinned for the same reason `offlineProgressFixture` pins it: `DEFAULT_STATE`
 * reads the live week at import time, so without this the fixture is a
 * calendar bomb that goes off on a Thursday. `double_shard_drops` is the one
 * event that multiplies nothing this fixture measures.
 */
const NEUTRAL_EVENT_ID = 'double_shard_drops';

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
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    weeklyEventWeek: weekOfNeutralEvent(),
    weeklyEventId: NEUTRAL_EVENT_ID,
    ...overrides,
  };
}

function weekOfNeutralEvent(): number {
  // Imported lazily through `require` would be worse than recomputing: the
  // rotation is eight long and indexed by `abs(week) % 8`, so the first week
  // at or after the pinned clock that lands on the neutral event is the one.
  const { WEEKLY_EVENTS, getWeeklyEventByWeek, weekNumberForTimestamp } =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../src/gameConfig') as typeof import('../src/gameConfig');
  const from = weekNumberForTimestamp(FIXED_NOW);
  for (let offset = 0; offset < WEEKLY_EVENTS.length; offset += 1) {
    if (getWeeklyEventByWeek(from + offset).id === NEUTRAL_EVENT_ID) return from + offset;
  }
  throw new Error(`no week within one rotation maps to ${NEUTRAL_EVENT_ID}`);
}

/**
 * Fight until one round resolves, which is the only thing that makes the
 * engine write `teamMaxHp` onto the state — and report the roster level it
 * actually published for.
 *
 * Active heroes start a level low so the level the resolving kill grants lands
 * them where the scenario asks, the same correction `offlineProgressFixture`
 * makes. That correction has a hole, and it is why this returns a level rather
 * than just a number: **the lowering clamps at one**, so a scenario whose
 * heroes are already level one cannot be lowered, and the resolving kill takes
 * them to level *two*. The published health is then the health of a roster the
 * scenario does not describe.
 *
 * Found by the rewrite disagreeing with this fixture by seven health on every
 * fresh character — 238 against 245 — which is exactly one hero level. Rather
 * than dodge it by starting the scenarios at level two, the measured level is
 * recorded, so the fixture describes the roster it actually weighed and a
 * reader can see the quirk instead of inheriting it.
 */
function settledMaxHp(target: GameState): { teamMaxHp: number; heroLevel: number } {
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
    if (working.totalKills > lowered.totalKills || working.wave < lowered.wave) {
      const active = working.heroRoster.find(entry => activeUids.has(entry.uid));
      return { teamMaxHp: working.teamMaxHp, heroLevel: active?.level ?? 0 };
    }
  }
  throw new Error('scenario never resolved a round, so its team HP is still the default');
}

interface Scenario {
  name: string;
  note: string;
  state: GameState;
}

/** One hero per class at a spread of level, rank and rarity. */
const SOLO = HERO_POOL.filter(entry => entry.heroClass === 'warrior')[0].id;

function scenarios(): Scenario[] {
  const base: Scenario[] = CLASSES.map(playerClass => ({
    name: `class-${playerClass}`,
    note: `A fresh ${playerClass} with one level-one common. Isolates the class base stats.`,
    state: state({
      playerClass,
      wave: 1,
      heroRoster: [hero(SOLO, { uid: 'u0' })],
      activeTeamHeroIds: ['u0'],
    }),
  }));

  return [
    ...base,
    {
      name: 'allocated-vitality',
      note: 'Forty points into vitality, which is the stat team health is built on.',
      state: state({
        wave: 1,
        statsAlloc: { ...DEFAULT_STATE.statsAlloc, vitality: 40 },
        heroRoster: [hero(SOLO, { uid: 'u0' })],
        activeTeamHeroIds: ['u0'],
      }),
    },
    {
      name: 'allocated-spread',
      note: 'Points in every stat, so a derivation that reads the wrong key is visible.',
      state: state({
        wave: 1,
        statsAlloc: { strength: 11, vitality: 7, agility: 5, intelligence: 3, spirit: 2 },
        heroRoster: [hero(SOLO, { uid: 'u0' })],
        activeTeamHeroIds: ['u0'],
      }),
    },
    {
      name: 'six-heroes',
      note: 'A full team at rank five epic, so the per-hero rank multiplier carries weight.',
      state: state({
        wave: 1,
        level: 60,
        heroRoster: team(6, 140, 'epic', 5),
        activeTeamHeroIds: ['u0', 'u1', 'u2', 'u3', 'u4', 'u5'],
        teamSlotsUnlocked: 6,
      }),
    },
    {
      name: 'benched-heroes',
      note: 'Six owned, two active. Only the active pair may count toward health.',
      state: state({
        wave: 1,
        level: 60,
        heroRoster: team(6, 140, 'epic', 5),
        activeTeamHeroIds: ['u0', 'u1'],
        teamSlotsUnlocked: 6,
      }),
    },
    {
      name: 'meta-survival',
      note: 'Essence survival levels, a flat 5% each with no cap.',
      state: state({
        wave: 1,
        metaSurvivalLevel: 12,
        heroRoster: [hero(SOLO, { uid: 'u0' })],
        activeTeamHeroIds: ['u0'],
      }),
    },
    {
      name: 'rebirth-survival',
      note: 'The rebirth survival path, 7% each and multiplied against the essence track.',
      state: state({
        wave: 1,
        metaSurvivalLevel: 12,
        rebirthSurvivalPath: 9,
        prestigeCount: 3,
        heroRoster: [hero(SOLO, { uid: 'u0' })],
        activeTeamHeroIds: ['u0'],
      }),
    },
    {
      name: 'mastery-under-cap',
      note: 'Class mastery below its 25% ceiling, where it still grows in 2% steps of four levels.',
      state: state({
        wave: 1,
        classMasteryXp: { ...DEFAULT_STATE.classMasteryXp, warrior: 1_900 },
        heroRoster: [hero(SOLO, { uid: 'u0' })],
        activeTeamHeroIds: ['u0'],
      }),
    },
    {
      name: 'mastery-past-cap',
      note: 'Mastery far past the ceiling. The 25% cap is the point of the scenario.',
      state: state({
        wave: 1,
        classMasteryXp: { ...DEFAULT_STATE.classMasteryXp, warrior: 80_000 },
        heroRoster: [hero(SOLO, { uid: 'u0' })],
        activeTeamHeroIds: ['u0'],
      }),
    },
    {
      name: 'tactics-facility',
      note: 'The tactics facility, which multiplies health as well as damage.',
      state: state({
        wave: 1,
        guildhallFacilities: {
          ...DEFAULT_STATE.guildhallFacilities,
          tactics: { level: 14 },
        },
        heroRoster: [hero(SOLO, { uid: 'u0' })],
        activeTeamHeroIds: ['u0'],
      }),
    },
    {
      name: 'rebirth-stat-mult',
      note: 'Heroes carrying a rebirth stat multiplier, which scales their vitality before the roster sum.',
      state: state({
        wave: 1,
        level: 60,
        heroRoster: team(4, 140, 'epic', 5).map(entry => ({ ...entry, rebirthStatMult: 2.5 })),
        activeTeamHeroIds: ['u0', 'u1', 'u2', 'u3'],
        teamSlotsUnlocked: 4,
      }),
    },
    {
      name: 'everything',
      note: 'Every multiplier at once, so an omission that cancels against another cannot hide.',
      state: state({
        wave: 1,
        level: 500,
        statsAlloc: { strength: 40, vitality: 120, agility: 20, intelligence: 10, spirit: 30 },
        metaSurvivalLevel: 20,
        rebirthSurvivalPath: 12,
        prestigeCount: 10,
        classMasteryXp: { ...DEFAULT_STATE.classMasteryXp, warrior: 5_000 },
        guildhallFacilities: { ...DEFAULT_STATE.guildhallFacilities, tactics: { level: 20 } },
        heroRoster: team(6, 999, 'transcendent', 10),
        activeTeamHeroIds: ['u0', 'u1', 'u2', 'u3', 'u4', 'u5'],
        teamSlotsUnlocked: 6,
      }),
    },
  ];
}

/**
 * How the four stat actions behave, read off the reducer rather than from the
 * UI that calls them.
 *
 * The negative case is here because the reducer has no floor on it:
 * `ALLOCATE_STAT_N` computes `Math.min(amount, unspent)` and subtracts that
 * from the pool, so a negative amount *adds* points back and drives the stat
 * below zero. No screen sends one, but the reducer is the contract, and a
 * port that reproduced it faithfully would be porting a duplication bug.
 */
function allocationCases() {
  const start = state({
    unspentStatPoints: 10,
    statsAlloc: { strength: 3, vitality: 3, agility: 0, intelligence: 0, spirit: 0 },
  });

  const run = (action: unknown, from: GameState = start) => {
    const after = reducer(from, action as never);
    return { alloc: after.statsAlloc, unspent: after.unspentStatPoints };
  };

  return {
    one: run({ type: 'ALLOCATE_STAT', stat: 'vitality' }),
    n: run({ type: 'ALLOCATE_STAT_N', stat: 'vitality', amount: 4 }),
    nOverPool: run({ type: 'ALLOCATE_STAT_N', stat: 'vitality', amount: 999 }),
    nZero: run({ type: 'ALLOCATE_STAT_N', stat: 'vitality', amount: 0 }),
    nNegative: run({ type: 'ALLOCATE_STAT_N', stat: 'vitality', amount: -5 }),
    max: run({ type: 'ALLOCATE_STAT_MAX', stat: 'spirit' }),
    oneWhenEmpty: run({ type: 'ALLOCATE_STAT', stat: 'vitality' }, state({ unspentStatPoints: 0 })),
    maxWhenEmpty: run({ type: 'ALLOCATE_STAT_MAX', stat: 'vitality' }, state({ unspentStatPoints: 0 })),
  };
}

/** What `CREATE_CHARACTER` sets, minus the equipment Phase 9 owns. */
function characterCreation() {
  const blank = state({ characterCreated: false, playerName: '', playerClass: null, unspentStatPoints: 0 });
  const made = reducer(blank, { type: 'CREATE_CHARACTER', name: '  Wanderer  ', playerClass: 'mage' } as never);
  const tooLong = reducer(blank, { type: 'CREATE_CHARACTER', name: 'x'.repeat(60), playerClass: 'monk' } as never);
  const blankName = reducer(blank, { type: 'CREATE_CHARACTER', name: '   ', playerClass: 'monk' } as never);
  const again = reducer(made, { type: 'CREATE_CHARACTER', name: 'Second', playerClass: 'archer' } as never);

  return {
    created: {
      characterCreated: made.characterCreated,
      playerName: made.playerName,
      playerClass: made.playerClass,
      unspentStatPoints: made.unspentStatPoints,
    },
    nameLength: tooLong.playerName.length,
    blankNameRejected: blankName.characterCreated === false && blankName.playerName === '',
    secondAttemptIgnored: again.playerName === made.playerName && again.playerClass === made.playerClass,
  };
}

interface Fixture {
  note: string;
  generatedFrom: string;
  nowMs: number;
  scenarios: {
    name: string;
    note: string;
    playerClass: PlayerClass;
    statsAlloc: StatBlock;
    /** `derivedStats`: class base plus allocation, with no equipment. */
    combined: StatBlock;
    teamMaxHp: number;
    /** The active hero level the measurement actually ran at. See `settledMaxHp`. */
    heroLevel: number;
    teamDefense: number;
  }[];
  allocation: ReturnType<typeof allocationCases>;
  character: ReturnType<typeof characterCreation>;
}

function build(): Fixture {
  return {
    note: 'Shipped character stats and team health, measured. Owned by __tests__/characterFixture.test.ts.',
    generatedFrom: 'src/useGameState.ts derivedStats / getTeamMaxHp via computeStats and advanceCombatStep',
    nowMs: FIXED_NOW,
    scenarios: scenarios().map(entry => {
      const stats = computeStats(entry.state);
      const settled = settledMaxHp(entry.state);
      return {
        name: entry.name,
        note: entry.note,
        playerClass: entry.state.playerClass ?? 'warrior',
        statsAlloc: entry.state.statsAlloc,
        combined: stats.combined,
        teamMaxHp: settled.teamMaxHp,
        heroLevel: settled.heroLevel,
        teamDefense: stats.teamDefense,
      };
    }),
    allocation: allocationCases(),
    character: characterCreation(),
  };
}

describe('character fixture', () => {
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

  it('records the roster level it actually weighed', () => {
    /*
     * The `settledMaxHp` quirk, pinned rather than left in a comment. Every
     * scenario is resolved by a kill, and a kill levels the active heroes, so
     * the measurement is taken a level above where the lowering left them.
     * That lands on the scenario's own level everywhere except level one,
     * where the lowering clamps and the measurement runs at two.
     *
     * A fixture that recorded the asked-for level instead would be off by one
     * hero level on every fresh character, and the only symptom would be the
     * rewrite disagreeing with it by seven health.
     */
    expect(scenario('class-warrior').heroLevel).toBe(2);
    expect(scenario('six-heroes').heroLevel).toBe(140);
    expect(scenario('everything').heroLevel).toBe(999);
  });

  it('gives every class a different starting stat block', () => {
    // The base the whole derivation sits on. If two classes agreed here the
    // fixture would be unable to tell a class lookup from a hardcoded default.
    const blocks = CLASSES.map(playerClass => JSON.stringify(scenario(`class-${playerClass}`).combined));
    expect(new Set(blocks).size).toBe(CLASSES.length);
  });

  it('adds allocated points to the class base rather than replacing it', () => {
    const fresh = scenario('class-warrior');
    const allocated = scenario('allocated-vitality');
    expect(allocated.combined.vitality - fresh.combined.vitality).toBe(40);
    // And nothing else moved, so the allocation reaches exactly one stat.
    for (const key of STAT_KEYS.filter(entry => entry !== 'vitality')) {
      expect({ key, same: allocated.combined[key] === fresh.combined[key] }).toEqual({ key, same: true });
    }
  });

  it('builds team health out of vitality', () => {
    // The claim the flat 2000 in `demoRoster.ts` stands in for. Forty points
    // of vitality is worth 400 health on the player alone, before any
    // multiplier — so health is not a constant and never was.
    expect(scenario('allocated-vitality').teamMaxHp).toBeGreaterThan(scenario('class-warrior').teamMaxHp);
  });

  it('counts only the active team', () => {
    // Owning a hero is not fielding one. A derivation that summed the roster
    // would make the bench free health, which is the bug this pins.
    expect(scenario('six-heroes').teamMaxHp).toBeGreaterThan(scenario('benched-heroes').teamMaxHp);
  });

  it('caps class mastery at a quarter', () => {
    /*
     * `1 + min(0.25, floor(level / 4) * 0.02)`. Past the cap more mastery is
     * worth nothing at all, which is the kind of ceiling a port drops silently
     * — the formula still looks right and the deep game quietly runs away.
     */
    const under = scenario('mastery-under-cap');
    const over = scenario('mastery-past-cap');
    const none = scenario('class-warrior');
    expect(under.teamMaxHp).toBeGreaterThan(none.teamMaxHp);
    expect(over.teamMaxHp).toBeGreaterThan(under.teamMaxHp);
    expect(over.teamMaxHp / none.teamMaxHp).toBeLessThanOrEqual(1.25 + 1e-9);
  });

  it('has the tactics facility raise health as well as damage', () => {
    /*
     * Worth its own case because the first version of this scenario set a
     * `facilityLevels` key that does not exist — the real path is
     * `guildhallFacilities.tactics.level` — and the fixture recorded a tactics
     * scenario whose health was identical to the one without it. A scenario
     * that exercises nothing passes every test written about it.
     */
    const tactics = scenario('tactics-facility');
    const none = scenario('class-warrior');
    expect(tactics.teamMaxHp).toBeGreaterThan(none.teamMaxHp);
    expect(tactics.teamMaxHp / none.teamMaxHp).toBeCloseTo(1 + 14 * 0.025, 2);
  });

  it('multiplies the survival tracks rather than adding them', () => {
    /*
     * Essence survival is 5% a level and the rebirth path is 7%, and the two
     * are multiplied. Adding them instead would put this ratio at 1.39 rather
     * than 1.63, so three decimals is far more than enough to tell them apart
     * — the looseness is for `getTeamMaxHp`'s `Math.ceil`, which lands the
     * measured ratio a ten-thousandth off the exact one.
     *
     * The scenario also carries a prestige count the other does not, so this
     * doubles as a check that prestige does not leak into health: it feeds the
     * damage legacy multiplier and nothing here.
     */
    const meta = scenario('meta-survival');
    const both = scenario('rebirth-survival');
    expect(both.teamMaxHp / meta.teamMaxHp).toBeCloseTo(1 + 9 * 0.07, 3);
  });

  it('spends a point, the pool, and nothing it does not have', () => {
    const { one, n, nOverPool, max, oneWhenEmpty, maxWhenEmpty } = fixture.allocation;
    expect({ vitality: one.alloc.vitality, unspent: one.unspent }).toEqual({ vitality: 4, unspent: 9 });
    expect({ vitality: n.alloc.vitality, unspent: n.unspent }).toEqual({ vitality: 7, unspent: 6 });
    // Asking for more than the pool spends the pool, rather than failing.
    expect({ vitality: nOverPool.alloc.vitality, unspent: nOverPool.unspent }).toEqual({ vitality: 13, unspent: 0 });
    expect({ spirit: max.alloc.spirit, unspent: max.unspent }).toEqual({ spirit: 10, unspent: 0 });
    // An empty pool is a no-op, not a negative balance.
    expect({ vitality: oneWhenEmpty.alloc.vitality, unspent: oneWhenEmpty.unspent }).toEqual({
      vitality: 0,
      unspent: 0,
    });
    expect(maxWhenEmpty.unspent).toBe(0);
  });

  it('pins a negative allocation as the duplication bug it is', () => {
    /*
     * `ALLOCATE_STAT_N` computes `Math.min(amount, unspent)` with no floor, so
     * `amount: -5` subtracts negative five from the pool — the player gains
     * five points and the stat goes below its starting value. Repeatable
     * without limit.
     *
     * No screen sends a negative amount, so this has never cost anything. But
     * the reducer is the contract, and recording it here is what stops the
     * rewrite from porting it faithfully: `character/allocation.ts` clamps at
     * zero and its own test asserts the divergence rather than inheriting it.
     */
    const { nNegative, nZero } = fixture.allocation;
    expect(nNegative.unspent).toBe(15);
    expect(nNegative.alloc.vitality).toBe(-2);
    // Zero is the boundary and is harmless, which is why the clamp is at zero.
    expect({ vitality: nZero.alloc.vitality, unspent: nZero.unspent }).toEqual({ vitality: 3, unspent: 10 });
  });

  it('creates a character with a trimmed, capped name and ten points', () => {
    const { created, nameLength, blankNameRejected, secondAttemptIgnored } = fixture.character;
    expect(created).toEqual({
      characterCreated: true,
      playerName: 'Wanderer',
      playerClass: 'mage',
      unspentStatPoints: 10,
    });
    expect(nameLength).toBe(24);
    expect(blankNameRejected).toBe(true);
    // Creation is once. A second attempt cannot re-roll a class.
    expect(secondAttemptIgnored).toBe(true);
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_CHARACTER_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }

    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
