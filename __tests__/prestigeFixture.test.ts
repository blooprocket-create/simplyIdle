import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { REBIRTH_BONUS, REBIRTH_WAVE_THRESHOLD, getRebirthWaveRequirement, type PlayerClass } from '../src/gameConfig';
import { DEFAULT_STATE, reducer, type GameState } from '../src/useGameState';

/**
 * Reference behaviour for prestige and the two upgrade trees it feeds: the
 * rebirth itself, the cores it pays out, the rebirth paths those cores buy,
 * the essence meta levels, and the guildhall facilities.
 *
 * This is the phase where the numbers the rewrite has *already been reading*
 * become reachable. `prestigeCount`, `rebirthDamagePath`, `metaSurvivalLevel`
 * and the tactics and forge facility levels are all in the damage, defence and
 * health chains today — and nothing in the port could move any of them, so
 * every one of them has sat at whatever a migrated save happened to carry.
 *
 * Driven through the real reducer, because the interesting half is what a
 * rebirth **does not** reset. A prestige that cleared the wallet, the roster or
 * the meta levels would be a very different game, and an implementation reading
 * the word "prestige" would guess wrong about all three.
 *
 * Regenerate deliberately:
 *   UPDATE_PRESTIGE_FIXTURE=1 npx jest __tests__/prestigeFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'engine', 'prestige', '__fixtures__', 'prestige.json');

const FIXED_NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

function state(overrides: Partial<GameState>): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    ...overrides,
  };
}

function apply(from: GameState, action: unknown): GameState {
  return reducer(from, action as never);
}

type Path = 'damage' | 'economy' | 'survival';
type FacilityId = 'training' | 'treasury' | 'forge' | 'tactics';

const PATHS: Path[] = ['damage', 'economy', 'survival'];
const FACILITIES: FacilityId[] = ['training', 'treasury', 'forge', 'tactics'];

interface Fixture {
  note: string;
  generatedFrom: string;
  constants: { rebirthBonus: number; rebirthWaveThreshold: number };
  /** What wave a rebirth asks for, by prestige count. */
  waveRequirement: { prestigeCount: number; requirement: number }[];
  /** A rebirth, and everything it does and does not touch. */
  rebirths: {
    name: string;
    prestigeCount: number;
    highestWave: number;
    /** Null when the rebirth was refused. */
    coresGained: number | null;
    prestigeAfter: number;
    levelAfter: number;
    waveAfter: number;
    expAfter: number;
    /** The fields a prestige leaves alone, read back afterwards. */
    kept: {
      gold: number;
      heroes: number;
      unspentStatPoints: number;
      strength: number;
      essence: number;
      metaDamageLevel: number;
      rebirthDamagePath: number;
      equipmentScrap: number;
      activeTeam: string[];
    };
    seasonPointsAfter: number;
  }[];
  /** What a rebirth path costs at each level, and what it buys. */
  rebirthPaths: {
    name: string;
    path: string;
    fromLevel: number;
    cores: number;
    cost: number;
    /** Null when refused. */
    levelAfter: number | null;
    coresAfter: number;
  }[];
  /** The cost curve, read off the reducer one level at a time. */
  rebirthPathCosts: { level: number; cost: number }[];
  essenceCosts: { level: number; cost: number }[];
  essenceUpgrades: {
    name: string;
    path: string;
    fromLevel: number;
    essence: number;
    levelAfter: number | null;
    essenceAfter: number;
  }[];
  facilityCosts: { facilityId: string; level: number; cost: number }[];
  facilityUpgrades: {
    name: string;
    facilityId: string;
    fromLevel: number;
    gold: number;
    levelAfter: number;
    goldAfter: number;
  }[];
}

/**
 * The cost of one step, measured rather than computed.
 *
 * Every cost formula here is private. The public path is the reducer: give the
 * account exactly enough and watch what it spends. Binary search would be
 * cleverer; walking up from the known floor is what a reader can check.
 */
function costOfStep(
  build: (purse: number) => GameState,
  spend: (from: GameState) => GameState,
  read: (s: GameState) => number,
): number {
  // Doubling to find an upper bound, then stepping down to the exact figure:
  // the curves reach the millions, and a linear walk from one would take all
  // day at level twenty.
  let upper = 1;
  while (read(spend(build(upper))) === read(build(upper))) {
    upper *= 2;
    if (upper > 1e15) throw new Error('no affordable step found');
  }
  let lower = Math.floor(upper / 2);
  while (lower + 1 < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (read(spend(build(middle))) === read(build(middle))) lower = middle;
    else upper = middle;
  }
  return upper;
}

function build(): Fixture {
  const waveRequirement = [0, 1, 2, 5, 10, 25, 50].map(prestigeCount => ({
    prestigeCount,
    requirement: getRebirthWaveRequirement(prestigeCount),
  }));

  const rebirths: Fixture['rebirths'] = [];
  for (const [name, prestigeCount, highestWave] of [
    ['first-exactly-at-the-wall', 0, 100],
    ['first-well-past-it', 0, 400],
    ['first-one-short', 0, 99],
    ['fifth', 5, 400],
    ['twentieth', 20, 4_000],
  ] as const) {
    const before = state({
      prestigeCount,
      highestWaveReached: highestWave,
      wave: Math.min(highestWave, 50),
      level: 60,
      exp: 500,
      unspentStatPoints: 7,
      statsAlloc: { ...DEFAULT_STATE.statsAlloc, strength: 31 },
      gold: 9_000_000,
      essence: 44,
      metaDamageLevel: 6,
      rebirthDamagePath: 3,
      equipmentScrap: 2_100,
      seasonPoints: 40,
    });
    const after = apply(before, { type: 'REBIRTH' });
    const refused = after.prestigeCount === before.prestigeCount;
    rebirths.push({
      name,
      prestigeCount,
      highestWave,
      coresGained: refused ? null : after.rebirthCores - before.rebirthCores,
      prestigeAfter: after.prestigeCount,
      levelAfter: after.level,
      waveAfter: after.wave,
      expAfter: after.exp,
      kept: {
        gold: after.gold,
        heroes: after.heroRoster.length,
        unspentStatPoints: after.unspentStatPoints,
        strength: after.statsAlloc.strength,
        essence: after.essence,
        metaDamageLevel: after.metaDamageLevel,
        rebirthDamagePath: after.rebirthDamagePath,
        equipmentScrap: after.equipmentScrap,
        activeTeam: [...after.activeTeamHeroIds],
      },
      seasonPointsAfter: after.seasonPoints,
    });
  }

  const pathLevel = (s: GameState, path: Path) =>
    path === 'damage' ? s.rebirthDamagePath : path === 'economy' ? s.rebirthEconomyPath : s.rebirthSurvivalPath;
  const withPath = (path: Path, level: number, cores: number) =>
    state({
      rebirthCores: cores,
      rebirthDamagePath: path === 'damage' ? level : 0,
      rebirthEconomyPath: path === 'economy' ? level : 0,
      rebirthSurvivalPath: path === 'survival' ? level : 0,
    });

  const rebirthPathCosts = [0, 1, 2, 3, 4, 5, 8, 12, 20, 40].map(level => ({
    level,
    cost: costOfStep(
      cores => withPath('damage', level, cores),
      from => apply(from, { type: 'SPEND_REBIRTH_CORE', path: 'damage' }),
      s => s.rebirthDamagePath,
    ),
  }));

  const rebirthPaths: Fixture['rebirthPaths'] = [];
  for (const path of PATHS) {
    for (const [name, fromLevel, cores] of [
      ['affordable', 4, 1_000],
      ['exact', 4, rebirthPathCosts.find(entry => entry.level === 4)?.cost ?? 0],
      ['one-short', 4, (rebirthPathCosts.find(entry => entry.level === 4)?.cost ?? 1) - 1],
    ] as const) {
      const before = withPath(path, fromLevel, cores);
      const after = apply(before, { type: 'SPEND_REBIRTH_CORE', path });
      const moved = pathLevel(after, path) !== pathLevel(before, path);
      rebirthPaths.push({
        name: `${path}-${name}`,
        path,
        fromLevel,
        cores,
        cost: before.rebirthCores - after.rebirthCores,
        levelAfter: moved ? pathLevel(after, path) : null,
        coresAfter: after.rebirthCores,
      });
    }
  }

  const metaLevel = (s: GameState, path: Path) =>
    path === 'damage' ? s.metaDamageLevel : path === 'economy' ? s.metaEconomyLevel : s.metaSurvivalLevel;
  const withMeta = (path: Path, level: number, essence: number) =>
    state({
      essence,
      metaDamageLevel: path === 'damage' ? level : 0,
      metaEconomyLevel: path === 'economy' ? level : 0,
      metaSurvivalLevel: path === 'survival' ? level : 0,
    });

  const essenceCosts = [0, 1, 2, 5, 10, 25, 50].map(level => ({
    level,
    cost: costOfStep(
      essence => withMeta('damage', level, essence),
      from => apply(from, { type: 'SPEND_ESSENCE_UPGRADE', path: 'damage' }),
      s => s.metaDamageLevel,
    ),
  }));

  const essenceUpgrades: Fixture['essenceUpgrades'] = [];
  for (const path of PATHS) {
    const cost = essenceCosts.find(entry => entry.level === 2)!.cost;
    for (const [name, essence] of [
      ['exact', cost],
      ['one-short', cost - 1],
    ] as const) {
      const before = withMeta(path, 2, essence);
      const after = apply(before, { type: 'SPEND_ESSENCE_UPGRADE', path });
      const moved = metaLevel(after, path) !== metaLevel(before, path);
      essenceUpgrades.push({
        name: `${path}-${name}`,
        path,
        fromLevel: 2,
        essence,
        levelAfter: moved ? metaLevel(after, path) : null,
        essenceAfter: after.essence,
      });
    }
  }

  const withFacility = (facilityId: FacilityId, level: number, gold: number) =>
    state({
      gold,
      guildhallFacilities: {
        ...DEFAULT_STATE.guildhallFacilities,
        [facilityId]: { ...DEFAULT_STATE.guildhallFacilities[facilityId], level },
      },
    });

  const facilityCosts: Fixture['facilityCosts'] = [];
  for (const facilityId of FACILITIES) {
    for (const level of [0, 1, 2, 3, 4, 5, 6, 7, 10]) {
      facilityCosts.push({
        facilityId,
        level,
        cost: costOfStep(
          gold => withFacility(facilityId, level, gold),
          from => apply(from, { type: 'UPGRADE_FACILITY', facilityId }),
          s => s.guildhallFacilities[facilityId].level,
        ),
      });
    }
  }

  const facilityUpgrades: Fixture['facilityUpgrades'] = [];
  for (const facilityId of FACILITIES) {
    const cost = facilityCosts.find(entry => entry.facilityId === facilityId && entry.level === 0)!.cost;
    for (const [name, gold] of [
      ['exact', cost],
      ['one-short', cost - 1],
    ] as const) {
      const before = withFacility(facilityId, 0, gold);
      const after = apply(before, { type: 'UPGRADE_FACILITY', facilityId });
      facilityUpgrades.push({
        name: `${facilityId}-${name}`,
        facilityId,
        fromLevel: 0,
        gold,
        levelAfter: after.guildhallFacilities[facilityId].level,
        goldAfter: after.gold,
      });
    }
  }

  return {
    note: 'Shipped prestige, the rebirth and essence trees, and the guildhall facilities. Owned by __tests__/prestigeFixture.test.ts.',
    generatedFrom: 'src/reducers/progressionReducer.ts and economyReducer.ts via the exported reducer',
    constants: { rebirthBonus: REBIRTH_BONUS, rebirthWaveThreshold: REBIRTH_WAVE_THRESHOLD },
    waveRequirement,
    rebirths,
    rebirthPaths,
    rebirthPathCosts,
    essenceCosts,
    essenceUpgrades,
    facilityCosts,
    facilityUpgrades,
  };
}

describe('prestige fixture', () => {
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

  const rebirth = (name: string) => fixture.rebirths.find(entry => entry.name === name)!;

  it('asks for twelve percent more wave each time — and the ceil bites at once', () => {
    /*
     * 100 to start, compounding, ceiled. The ceiling is not a rounding detail
     * here: **the very first step is 113, not 112.** `100 * 1.12` is
     * 112.00000000000001 as a double, and `Math.ceil` takes that to 113.
     *
     * My first version of this asserted 112 on the arithmetic. A port that
     * computed the requirement any other way — accumulating 1.12 a step, or
     * rounding instead of ceiling — would put the first wall a wave lower, and
     * a player who reached exactly 112 would be offered a rebirth the shipped
     * game refuses.
     */
    const at = (prestigeCount: number) =>
      fixture.waveRequirement.find(entry => entry.prestigeCount === prestigeCount)!.requirement;
    expect(at(0)).toBe(100);
    expect(at(1)).toBe(113);
    expect(at(1)).toBeGreaterThan(Math.round(100 * 1.12));

    const growth = fixture.waveRequirement.map(entry => entry.requirement);
    expect(growth).toEqual([...growth].sort((a, b) => a - b));
  });

  it('refuses a rebirth one wave short of the wall', () => {
    expect(rebirth('first-one-short').coresGained).toBeNull();
    expect(rebirth('first-one-short').prestigeAfter).toBe(0);
  });

  it('pays one core plus a quarter per prestige, plus one per surplus stride', () => {
    /*
     * `1 + floor(prestige * 0.25) + floor(surplus / stride)`, where the stride
     * is `max(15, floor(requirement * 0.05))`. So a first rebirth exactly at
     * the wall pays **one**, and the same rebirth three hundred waves past it
     * pays twenty-one — the surplus term is most of the reward, which is what
     * makes pushing deeper before resetting worth doing.
     */
    expect(rebirth('first-exactly-at-the-wall').coresGained).toBe(1);
    expect(rebirth('first-well-past-it').coresGained).toBeGreaterThan(
      rebirth('first-exactly-at-the-wall').coresGained!,
    );
    // The base term grows a quarter per prestige, floored: five prestiges is
    // one extra core before any surplus.
    expect(rebirth('fifth').coresGained).toBeGreaterThan(0);
    expect(rebirth('twentieth').coresGained).toBeGreaterThan(rebirth('fifth').coresGained!);
  });

  it('resets the run and nothing else', () => {
    /*
     * The half an implementation guesses wrong. A rebirth clears the *run* —
     * level, exp, wave — and leaves the account: the gold, the heroes, the
     * spent and unspent stat points, the essence, the meta levels, the rebirth
     * paths already bought and the equipment scrap all survive.
     *
     * A prestige that cleared the wallet would be a different game, and one
     * that cleared the meta levels would delete the thing the cores are spent
     * on.
     */
    const after = rebirth('first-well-past-it');
    expect({ level: after.levelAfter, wave: after.waveAfter, exp: after.expAfter }).toEqual({
      level: 1,
      wave: 1,
      exp: 0,
    });
    expect(after.kept).toMatchObject({
      gold: 9_000_000,
      unspentStatPoints: 7,
      strength: 31,
      essence: 44,
      metaDamageLevel: 6,
      rebirthDamagePath: 3,
      equipmentScrap: 2_100,
    });
  });

  it('pays two hundred and fifty season points for the reset', () => {
    expect(rebirth('first-well-past-it').seasonPointsAfter).toBe(40 + 250);
  });

  it('prices a rebirth path off the level being left', () => {
    /*
     * `1 + floor(level * 0.8) + floor(level² / 8)`, so the first step is free
     * in all but name — one core — and the fortieth costs 233. The quadratic
     * term is what stops a deep account buying out a path in one rebirth.
     */
    const byLevel = Object.fromEntries(fixture.rebirthPathCosts.map(entry => [entry.level, entry.cost]));
    expect(byLevel[0]).toBe(1);
    expect(byLevel[1]).toBe(1);
    expect(byLevel[8]).toBe(15);
    expect(byLevel[40]).toBe(233);
  });

  it('charges every path the same, and refuses one core short', () => {
    for (const path of PATHS) {
      const exact = fixture.rebirthPaths.find(entry => entry.name === `${path}-exact`)!;
      const short = fixture.rebirthPaths.find(entry => entry.name === `${path}-one-short`)!;
      expect({ path, level: exact.levelAfter, left: exact.coresAfter }).toEqual({ path, level: 5, left: 0 });
      expect({ path, level: short.levelAfter, spent: short.cost }).toEqual({ path, level: null, spent: 0 });
    }
  });

  it('prices an essence upgrade as a square, not a curve', () => {
    // `20 + (level + 1)² × 12`, so level zero is 32 and level fifty is 31,232.
    const byLevel = Object.fromEntries(fixture.essenceCosts.map(entry => [entry.level, entry.cost]));
    expect(byLevel[0]).toBe(32);
    expect(byLevel[1]).toBe(68);
    expect(byLevel[50]).toBe(20 + 51 * 51 * 12);
  });

  it('charges every meta path the same, and refuses one essence short', () => {
    for (const path of PATHS) {
      const exact = fixture.essenceUpgrades.find(entry => entry.name === `${path}-exact`)!;
      const short = fixture.essenceUpgrades.find(entry => entry.name === `${path}-one-short`)!;
      expect({ path, level: exact.levelAfter, left: exact.essenceAfter }).toEqual({ path, level: 3, left: 0 });
      expect({ path, level: short.levelAfter }).toEqual({ path, level: null });
    }
  });

  it('walks a facility up an authored curve and then doubles forever', () => {
    /*
     * Six authored steps per facility, then `last × 2^n`. The doubling is
     * closed-form rather than iterative, which the shipped comment says is to
     * avoid overflowing before `MAX_SAFE_INTEGER` — so a port that multiplied
     * in a loop would disagree only at the very deep end, where nobody would
     * notice until somebody did.
     */
    const forge = fixture.facilityCosts.filter(entry => entry.facilityId === 'forge');
    expect(forge.slice(0, 6).map(entry => entry.cost)).toEqual([6_000, 15_000, 40_000, 90_000, 180_000, 350_000]);
    expect(forge.find(entry => entry.level === 6)!.cost).toBe(700_000);
    expect(forge.find(entry => entry.level === 7)!.cost).toBe(1_400_000);
    expect(forge.find(entry => entry.level === 10)!.cost).toBe(350_000 * 2 ** 5);
  });

  it('prices the four facilities differently', () => {
    // The forge is dearest and the treasury cheapest, which is the shape of
    // the choice: the facility that makes gold costs least to raise.
    const at = (facilityId: string) =>
      fixture.facilityCosts.find(e => e.facilityId === facilityId && e.level === 0)!.cost;
    expect(at('forge')).toBeGreaterThan(at('training'));
    expect(at('training')).toBe(at('tactics'));
    expect(at('treasury')).toBeLessThan(at('training'));
  });

  it('charges gold for a facility, and refuses one short', () => {
    for (const facilityId of FACILITIES) {
      const exact = fixture.facilityUpgrades.find(entry => entry.name === `${facilityId}-exact`)!;
      const short = fixture.facilityUpgrades.find(entry => entry.name === `${facilityId}-one-short`)!;
      expect({ facilityId, level: exact.levelAfter, gold: exact.goldAfter }).toEqual({ facilityId, level: 1, gold: 0 });
      expect({ facilityId, level: short.levelAfter, gold: short.goldAfter }).toEqual({
        facilityId,
        level: 0,
        gold: short.gold,
      });
    }
  });

  it('has two copies of each cost formula, and they agree today', () => {
    /*
     * A finding, not a rule. `getEssenceUpgradeCost` and `getRebirthPathCost`
     * exist **twice** in the shipped tree: once in `progressionReducer.ts`,
     * which is what actually charges the player, and once in `useGameState.ts`,
     * which is what the screen quotes them. Nothing keeps the pair in step.
     *
     * They are character-identical today, which is what makes this a tripwire
     * rather than a bug report — and it is worth having, because a divergence
     * would show up as a button quoting one price and taking another, which is
     * the hardest kind of report to act on.
     *
     * The port has one copy of each, measured against the *reducer's* — the
     * one that decides what a player is actually charged. This is also why the
     * injections that verify this fixture have to patch the reducer's copy:
     * patching the display copy changes nothing the reducer reads.
     */
    const bodyOf = (file: string, name: string) => {
      const source = readFileSync(join(__dirname, '..', 'src', file), 'utf8');
      const match = source.match(new RegExp(`function ${name}\\(level: number\\): number \\{\\n([^}]*)\\n\\}`));
      if (!match) throw new Error(`no ${name} in ${file}`);
      return match[1].trim();
    };

    for (const name of ['getEssenceUpgradeCost', 'getRebirthPathCost']) {
      expect({ name, reducer: bodyOf('reducers/progressionReducer.ts', name) }).toEqual({
        name,
        reducer: bodyOf('useGameState.ts', name),
      });
    }
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_PRESTIGE_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }

    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
