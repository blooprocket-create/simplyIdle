import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  HERO_POOL,
  getWeeklyEventByWeek,
  weekNumberForTimestamp,
  type HeroUnit,
  type PlayerClass,
  type Rarity,
} from '../src/gameConfig';
import { DEFAULT_STATE, sanitizeSaveData, serialize, type GameState, type SaveData } from '../src/useGameState';

/**
 * Reference behaviour for reading a v2 save.
 *
 * This is the one fixture in the parity suite that is not about a number being
 * right. It is about not losing anything: there are dormant accounts holding
 * real v2 saves, and the rewrite's reader is the only thing standing between
 * those saves and a silent wipe. So the cases here are deliberately nasty —
 * pre-v2 field names, stat allocations that exceed what the account's level
 * would justify today, wallets past 2^53, rosters full of heroes that no
 * longer exist.
 *
 * `web/src/engine/save/saveMigration.test.ts` owns the other side and asserts
 * that `migrateSave` reproduces every expectation recorded here.
 *
 * Regenerate deliberately:
 *   UPDATE_SAVE_FIXTURE=1 npx jest __tests__/saveMigrationFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'engine', 'save', '__fixtures__', 'v2-saves.json');

/**
 * `sanitizeSaveData` reads the wall clock for `lastActiveAt`, the weekly
 * rollover and the daily rollover, so the fixture is only reproducible with
 * the clock pinned. The web side is handed this same value as `nowMs`.
 */
const FIXED_NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

/**
 * The real clock, read at import time before any spy exists. The guard below
 * measures against this rather than against `FIXED_NOW`, because "came from
 * the live clock" is the thing being detected and the live clock is the only
 * value that identifies it.
 */
const REAL_NOW_AT_IMPORT = Date.now();

function hero(templateId: string, overrides: Partial<HeroUnit> = {}): HeroUnit {
  const template = HERO_POOL.find(entry => entry.id === templateId);
  if (!template) throw new Error(`no such hero template: ${templateId}`);
  return {
    ...template,
    uid: `${templateId}_a`,
    rarity: 'common' as Rarity,
    level: 1,
    rank: 1,
    teamBoost: template.baseTeamBoost,
    rebirthStatMult: 1,
    ...overrides,
  };
}

/** One hero of each class, so formation rules have something to bite on. */
function firstOfClass(heroClass: PlayerClass): string {
  const template = HERO_POOL.find(entry => entry.heroClass === heroClass);
  if (!template) throw new Error(`no hero of class ${heroClass}`);
  return template.id;
}

const WARRIOR = firstOfClass('warrior');
const BERSERKER = firstOfClass('berserker');
const MAGE = firstOfClass('mage');
const ARCHER = firstOfClass('archer');
const MONK = firstOfClass('monk');

function veteranState(): GameState {
  const roster: HeroUnit[] = [
    hero(WARRIOR, { uid: 'w1', rarity: 'legendary', level: 300, rank: 8, teamBoost: 0.4, rebirthStatMult: 3.5 }),
    hero(WARRIOR, { uid: 'w2', rarity: 'rare', level: 40, rank: 2, teamBoost: 0.1 }),
    hero(BERSERKER, { uid: 'b1', rarity: 'mythic', level: 500, rank: 10, teamBoost: 0.6 }),
    hero(MAGE, { uid: 'm1', rarity: 'epic', level: 210, rank: 6, teamBoost: 0.25 }),
    hero(ARCHER, { uid: 'a1', rarity: 'godly', level: 700, rank: 9, teamBoost: 0.8 }),
    hero(MONK, { uid: 'k1', rarity: 'uncommon', level: 90, rank: 3, teamBoost: 0.12 }),
  ];

  return {
    ...DEFAULT_STATE,
    playerName: 'Vetted',
    playerClass: 'archer',
    characterCreated: true,
    gold: 918_273_645,
    totalGold: 4_000_000_000,
    diamonds: 1_240,
    exp: 500,
    totalExp: 88_000_000,
    level: 120,
    wave: 341,
    highestWaveReached: 512,
    totalKills: 190_004,
    prestigeCount: 7,
    unspentStatPoints: 13,
    statsAlloc: { strength: 210, vitality: 140, agility: 90, intelligence: 40, spirit: 66 },
    heroShards: 14_500,
    bossTears: 320,
    essence: 9_100,
    rebirthCores: 22,
    rebirthDamagePath: 5,
    rebirthEconomyPath: 3,
    rebirthSurvivalPath: 2,
    equipmentScrap: 7_777,
    sparkTokens: 45,
    metaDamageLevel: 18,
    metaEconomyLevel: 11,
    metaSurvivalLevel: 9,
    heroRoster: roster,
    // Deliberately over-long and out of order: the reader has to apply the
    // per-rank cap and the one-copy-per-template rule, not just truncate.
    activeTeamHeroIds: ['w1', 'w2', 'b1', 'a1', 'm1', 'k1'],
    teamSlotsUnlocked: 6,
    teamLoadouts: [['a1', 'm1'], [], ['b1', 'w1', 'k1']],
    heroFormationByUid: { w1: 'front', b1: 'front', m1: 'mid', a1: 'back', k1: 'mid' },
    heroUniqueGearByHeroId: {
      [WARRIOR]: { rank: 6, equippedByUid: 'w2' },
      [ARCHER]: { rank: 10, equippedByUid: 'a1' },
    },
    lastActiveAt: FIXED_NOW - 3 * 60 * 60 * 1000,
  };
}

/**
 * `DEFAULT_STATE` is a module-level constant, so it captures the real clock and
 * `Math.random` when `useGameState` is *imported* — before any spy in this file
 * can be installed. Four of its fields come out live, and a fixture carrying
 * them would differ on every run and silently rot when the week rolled over.
 *
 * They are re-pinned to the fixed clock rather than deleted: they are real v2
 * fields, and the point of this fixture is that the migration carries them
 * through. `no field smuggles in the live clock` below is what stops a fifth
 * one appearing unnoticed.
 */
function pinLiveClockFields(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    ...payload,
    expeditionContractOffers: { artifact: 'rare', merchant: 'rare', ruins: 'rare', vault: 'rare', abyss: 'rare' },
    expeditionContractsRefreshedAt: FIXED_NOW - 60_000,
    weeklyEventWeek: weekNumberForTimestamp(FIXED_NOW),
    weeklyEventId: getWeeklyEventByWeek(weekNumberForTimestamp(FIXED_NOW)).id,
  };
}

interface Case {
  name: string;
  note: string;
  payload: Record<string, unknown>;
}

/**
 * JSON cannot hold NaN or Infinity — `JSON.stringify` turns both into `null`.
 * That matters here because `null` and `NaN` are different inputs to the
 * reader: one fails the `typeof value === 'number'` check, the other fails
 * `Number.isFinite`. A fixture that quietly flattened them would test the
 * wrong thing, and a save really can contain either.
 *
 * So the committed payloads encode them as sentinel strings. Both sides carry
 * a decoder, and both sides test it against a value that round-trips.
 */
const SPECIAL_NUMBERS: Record<string, number> = {
  __NaN__: Number.NaN,
  __Infinity__: Number.POSITIVE_INFINITY,
  '__-Infinity__': Number.NEGATIVE_INFINITY,
};

export function encodeSpecials(value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    if (Number.isNaN(value)) return '__NaN__';
    return value > 0 ? '__Infinity__' : '__-Infinity__';
  }
  if (Array.isArray(value)) return value.map(encodeSpecials);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encodeSpecials(entry)]));
  }
  return value;
}

export function decodeSpecials(value: unknown): unknown {
  if (typeof value === 'string' && value in SPECIAL_NUMBERS) return SPECIAL_NUMBERS[value];
  if (Array.isArray(value)) return value.map(decodeSpecials);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decodeSpecials(entry)]));
  }
  return value;
}

function buildCases(): Case[] {
  const veteranSave = pinLiveClockFields(serialize(veteranState()) as unknown as Record<string, unknown>);

  return [
    {
      name: 'pristine',
      note: 'A brand-new save straight out of serialize(DEFAULT_STATE).',
      payload: pinLiveClockFields(serialize(DEFAULT_STATE) as unknown as Record<string, unknown>),
    },
    {
      name: 'veteran',
      note: 'A long-played account written by the shipped serialize.',
      payload: veteranSave,
    },
    {
      name: 'pre-v2-field-names',
      note: 'No saveVersion at all, and the pre-v2 highestLevelReached spelling.',
      payload: {
        playerName: 'Ancient',
        playerClass: 'mage',
        characterCreated: true,
        level: 44,
        wave: 60,
        highestLevelReached: 175,
        gold: 1_000,
        statsAlloc: { strength: 5, vitality: 5, agility: 5, intelligence: 5, spirit: 5 },
        unspentStatPoints: 0,
        heroRoster: [{ id: MAGE, uid: 'old_m', rarity: 'rare', level: 20, rank: 2 }],
        activeTeamHeroIds: ['old_m'],
        lastActiveAt: FIXED_NOW - 60_000,
      },
    },
    {
      name: 'pre-v2-unique-gear-number',
      note: 'heroUniqueGearByHeroId stored a bare rank number before it stored a record.',
      payload: {
        playerName: 'Relicless',
        playerClass: 'warrior',
        characterCreated: true,
        level: 10,
        wave: 12,
        heroRoster: [
          { id: WARRIOR, uid: 'r1', rarity: 'common', level: 5, rank: 1 },
          { id: WARRIOR, uid: 'r2', rarity: 'epic', level: 5, rank: 1 },
        ],
        activeTeamHeroIds: ['r1'],
        heroUniqueGearByHeroId: { [WARRIOR]: 7 },
      },
    },
    {
      name: 'unique-gear-unequipped-flag',
      note: 'The intermediate shape: a record with an `equipped` boolean and no bearer uid.',
      payload: {
        playerName: 'Benched',
        playerClass: 'warrior',
        characterCreated: true,
        level: 10,
        wave: 3,
        heroRoster: [{ id: WARRIOR, uid: 'q1', rarity: 'common', level: 2, rank: 1 }],
        heroUniqueGearByHeroId: {
          [WARRIOR]: { rank: 4, equipped: false },
          [MAGE]: { rank: 2, equipped: true },
        },
      },
    },
    {
      name: 'over-allocated-stats',
      note: 'A dormant account whose spent stat points exceed what its level would grant today.',
      payload: {
        playerName: 'Grandfathered',
        playerClass: 'berserker',
        characterCreated: true,
        level: 12,
        wave: 20,
        // 12 levels grants 55 points; this save holds 900 spent plus 40 unspent.
        statsAlloc: { strength: 400, vitality: 300, agility: 100, intelligence: 50, spirit: 50 },
        unspentStatPoints: 40,
      },
    },
    {
      name: 'wallet-past-2-53',
      note: 'Currency beyond exact integer range, to pin that the shipped cap does not cap.',
      payload: {
        playerName: 'Rich',
        playerClass: 'mage',
        characterCreated: true,
        level: 900,
        wave: 4_000,
        gold: 1e30,
        totalGold: 1e20,
        diamonds: 2 ** 53 + 2,
        essence: 1e40,
      },
    },
    {
      name: 'mid-gacha',
      note: 'An account part way through the summon systems, so the counters are not all zero.',
      payload: {
        playerName: 'Puller',
        playerClass: 'archer',
        characterCreated: true,
        level: 60,
        wave: 140,
        highestWaveReached: 152,
        bossTears: 9_400,
        diamonds: 2_100,
        sparkTokens: 780,
        gachaPityCounter: 17,
        totalSummons: 137,
        freeSummonCharges: 3,
        claimedSummonMilestones: [10, 50, 100],
        guaranteedMinRarity: 'epic',
        firstSummonGiven: true,
        // Unclaimed, so it has to survive in `legacy` untouched — including
        // the hero names the typed slice deliberately does not learn how to
        // rebuild.
        summonHistory: [
          { id: 'hist_a', heroName: 'Ashen Vanguard', heroEmoji: '🛡️', rarity: 'epic', ts: 1, pityTriggered: false },
          { id: 'hist_b', heroName: 'Tidecaller', heroEmoji: '🌊', rarity: 'rare', ts: 2, pityTriggered: false },
        ],
      },
    },
    {
      name: 'hostile',
      note: 'Every field wrong at once: NaN, Infinity, negatives, wrong types, unknown ids, duplicate uids.',
      payload: {
        saveVersion: 99,
        playerName: '   an extremely long player name that goes well past the limit   ',
        playerClass: 'necromancer',
        characterCreated: true,
        level: Number.NaN,
        exp: Number.POSITIVE_INFINITY,
        totalExp: -5,
        wave: -300,
        highestWaveReached: 'eleven',
        totalKills: 12.9,
        gold: -1,
        totalGold: 10,
        statsAlloc: { strength: '40', vitality: -10, agility: 7.9, intelligence: null, spirit: Number.NaN },
        unspentStatPoints: -3,
        heroRoster: [
          { id: 'does_not_exist', uid: 'x1' },
          { id: WARRIOR, uid: 'dup', rarity: 'not_a_rarity', level: 99_999, rank: 400 },
          { id: BERSERKER, uid: 'dup', level: 3 },
          { id: MAGE, uid: 'm9', teamBoost: 0.000_001, rebirthStatMult: 900 },
          null,
          'nonsense',
        ],
        // Three front-rank heroes where two fit, plus a uid that is not in the roster.
        activeTeamHeroIds: ['dup', 'ghost', 'm9', 'dup'],
        teamSlotsUnlocked: 99,
        teamLoadouts: [['m9', 'm9'], 'not-an-array', ['ghost']],
        // A mage cannot hold `front`; the role is dropped rather than coerced.
        heroFormationByUid: { m9: 'front', dup: 'mid', ghost: 'back' },
        heroUniqueGearByHeroId: { [WARRIOR]: { rank: 900 }, never_existed: { rank: 3 } },
        lastActiveAt: FIXED_NOW + 10 * 365 * 24 * 60 * 60 * 1000,
      },
    },
    {
      name: 'empty',
      note: 'An empty object, which is what a corrupt or truncated payload looks like.',
      payload: {},
    },
  ];
}

/** The v3 typed slice, projected out of whatever `sanitizeSaveData` returns. */
function project(payload: Record<string, unknown>) {
  const restored = sanitizeSaveData(payload as Partial<SaveData>);
  return {
    identity: {
      name: restored.playerName,
      playerClass: restored.playerClass,
      created: restored.characterCreated,
    },
    progression: {
      level: restored.level,
      exp: restored.exp,
      totalExp: restored.totalExp,
      wave: restored.wave,
      highestWave: restored.highestWaveReached,
      totalKills: restored.totalKills,
      prestigeCount: restored.prestigeCount,
      rebirthDamagePath: restored.rebirthDamagePath,
      rebirthEconomyPath: restored.rebirthEconomyPath,
      rebirthSurvivalPath: restored.rebirthSurvivalPath,
      metaDamageLevel: restored.metaDamageLevel,
      metaEconomyLevel: restored.metaEconomyLevel,
      metaSurvivalLevel: restored.metaSurvivalLevel,
    },
    stats: { alloc: restored.statsAlloc, unspent: restored.unspentStatPoints },
    summon: {
      pityCounter: restored.gachaPityCounter,
      totalSummons: restored.totalSummons,
      freeCharges: restored.freeSummonCharges,
      claimedMilestones: restored.claimedSummonMilestones,
      guaranteedMinRarity: restored.guaranteedMinRarity ?? null,
      firstGiven: restored.firstSummonGiven,
    },
    wallet: {
      gold: restored.gold,
      totalGold: restored.totalGold,
      diamonds: restored.diamonds,
      heroShards: restored.heroShards,
      bossTears: restored.bossTears,
      essence: restored.essence,
      rebirthCores: restored.rebirthCores,
      equipmentScrap: restored.equipmentScrap,
      sparkTokens: restored.sparkTokens,
    },
    roster: {
      heroes: restored.heroRoster.map(entry => ({
        id: entry.id,
        uid: entry.uid,
        rarity: entry.rarity,
        level: entry.level,
        rank: entry.rank,
        teamBoost: entry.teamBoost,
        rebirthStatMult: entry.rebirthStatMult ?? 1,
      })),
      activeUids: restored.activeTeamHeroIds,
      loadouts: restored.teamLoadouts,
      slotsUnlocked: restored.teamSlotsUnlocked,
      formationByUid: restored.heroFormationByUid,
      uniqueByHeroId: restored.heroUniqueGearByHeroId,
    },
    lastActiveAt: restored.lastActiveAt,
  };
}

interface Fixture {
  note: string;
  generatedFrom: string;
  nowMs: number;
  heroTemplates: { id: string; heroClass: PlayerClass; baseTeamBoost: number }[];
  cases: (Case & { expected: ReturnType<typeof project> })[];
}

function build(): Fixture {
  return {
    note: 'v2 save payloads and what the shipped reader makes of them. Owned by __tests__/saveMigrationFixture.test.ts.',
    generatedFrom: 'src/useGameState.ts serialize + sanitizeSaveData',
    nowMs: FIXED_NOW,
    heroTemplates: HERO_POOL.map(template => ({
      id: template.id,
      heroClass: template.heroClass,
      baseTeamBoost: template.baseTeamBoost,
    })),
    cases: buildCases().map(entry => ({
      ...entry,
      payload: encodeSpecials(entry.payload) as Record<string, unknown>,
      expected: project(entry.payload),
    })),
  };
}

describe('v2 save fixture', () => {
  let nowSpy: jest.SpyInstance<number, []>;
  let randomSpy: jest.SpyInstance<number, []>;
  let fixture: Fixture;

  beforeAll(() => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    // Only expedition contract offers use it, and those live in `legacy`, but
    // pinning it keeps the whole payload reproducible rather than mostly so.
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    fixture = build();
  });

  afterAll(() => {
    nowSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it('round-trips the numbers JSON cannot hold', () => {
    const original = { a: Number.NaN, b: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY], c: 1, d: null };
    const encoded = encodeSpecials(original);
    // The encoded form is what survives JSON.
    expect(JSON.parse(JSON.stringify(encoded))).toEqual(encoded);
    expect(decodeSpecials(JSON.parse(JSON.stringify(encoded)))).toEqual(original);
    // And without the codec the information really is lost, which is why it exists.
    expect(JSON.parse(JSON.stringify(original))).toEqual({ a: null, b: [null, null], c: 1, d: null });
  });

  it('no field smuggles in the live clock', () => {
    /*
     * A payload field that captured the real `Date.now()` would make this
     * fixture differ on every run — which is how the four fields
     * `pinLiveClockFields` handles were found. This catches the fifth.
     *
     * The test is that no timestamp in the fixture is anywhere *near* the real
     * clock. An earlier version compared against `FIXED_NOW` with an eleven
     * year tolerance, which was wide enough to swallow the very drift it was
     * written to catch; un-pinning a field left it green.
     */
    const timestamps: { case: string; path: string; value: number; daysFromRealNow: number }[] = [];
    const walk = (value: unknown, path: string, caseName: string) => {
      if (typeof value === 'number' && value > 1.5e12 && value < 4e12) {
        timestamps.push({
          case: caseName,
          path,
          value,
          daysFromRealNow: Math.abs(value - REAL_NOW_AT_IMPORT) / 86_400_000,
        });
      } else if (Array.isArray(value)) {
        value.forEach((entry, index) => walk(entry, `${path}[${index}]`, caseName));
      } else if (value && typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`, caseName);
      }
    };
    for (const entry of fixture.cases) walk(entry.payload, `${entry.name}`, entry.name);

    // The pinned clock is months behind the real one and real time only moves
    // further away, so a ninety day exclusion zone can never catch an honest
    // value — only one that was read from the live clock.
    const live = timestamps.filter(entry => entry.daysFromRealNow < 90);
    expect(live).toEqual([]);
    expect(Math.abs(FIXED_NOW - REAL_NOW_AT_IMPORT) / 86_400_000).toBeGreaterThan(90);
    // And there must be timestamps to check, or the walk proves nothing.
    expect(timestamps.length).toBeGreaterThan(3);

    // The week number is derived from the clock but is far too small to look
    // like a timestamp, so it needs naming directly — otherwise an unpinned
    // one would only surface as a mystery fixture diff the week it rolls over.
    const pinnedWeek = weekNumberForTimestamp(FIXED_NOW);
    expect(pinnedWeek).not.toBe(weekNumberForTimestamp(REAL_NOW_AT_IMPORT));
    for (const entry of fixture.cases) {
      if (!('weeklyEventWeek' in entry.payload)) continue;
      expect({ case: entry.name, week: entry.payload.weeklyEventWeek }).toEqual({
        case: entry.name,
        week: pinnedWeek,
      });
    }
  });

  it('covers every hero template, so the rewrite migrates against the real roster', () => {
    expect(fixture.heroTemplates.length).toBe(HERO_POOL.length);
    expect(fixture.heroTemplates.length).toBeGreaterThan(60);
    expect(new Set(fixture.heroTemplates.map(template => template.heroClass)).size).toBe(5);
  });

  it('includes payloads the shipped serialize actually wrote', () => {
    const written = fixture.cases.filter(entry => entry.payload.saveVersion === 2);
    expect(written.length).toBeGreaterThanOrEqual(2);
  });

  it('includes payloads no serialize could write, because old saves exist', () => {
    // `serialize` has emitted the modern field names for years. The pre-v2
    // shapes below only ever arrive from a save written before it did.
    const legacyNames = fixture.cases.find(entry => entry.name === 'pre-v2-field-names');
    expect(legacyNames?.payload.saveVersion).toBeUndefined();
    expect(legacyNames?.payload.highestLevelReached).toBe(175);

    const legacyGear = fixture.cases.find(entry => entry.name === 'pre-v2-unique-gear-number');
    expect(typeof (legacyGear?.payload.heroUniqueGearByHeroId as Record<string, unknown>)[WARRIOR]).toBe('number');
  });

  it('records that the version marker is decorative', () => {
    // `sanitizeSaveData` reads `saveVersion` once, logs it, and never consults
    // it again — every migration it performs is driven by the shape of a
    // field. The rewrite's reader is shape-driven for the same reason, and
    // this is the assertion that says so out loud.
    const source = readFileSync(join(__dirname, '..', 'src', 'useGameState.ts'), 'utf8');
    const uses = [...source.matchAll(/incomingVersion/g)];
    // One declaration, one comparison, one interpolation into the log line.
    expect(uses.length).toBe(3);

    const hostile = fixture.cases.find(entry => entry.name === 'hostile');
    const pristine = fixture.cases.find(entry => entry.name === 'pristine');
    // A save claiming v99 is read exactly like a save claiming v2.
    expect(hostile?.payload.saveVersion).toBe(99);
    expect(pristine?.payload.saveVersion).toBe(2);
  });

  it('keeps stat points a dormant account over-allocated', () => {
    const over = fixture.cases.find(entry => entry.name === 'over-allocated-stats');
    const spent = Object.values(over!.expected.stats.alloc).reduce((sum, value) => sum + value, 0);
    // Level 12 grants 55 points. The save holds 900 spent, and all 900 survive.
    expect((over!.payload.level as number) - 1).toBe(11);
    expect(spent).toBe(900);
    expect(over!.expected.stats.unspent).toBe(40);
  });

  it('records that the currency cap does not cap', () => {
    const rich = fixture.cases.find(entry => entry.name === 'wallet-past-2-53');
    // SAFE_INTEGER_CAP is Number.MAX_VALUE, so 1e30 gold survives intact.
    expect(rich!.expected.wallet.gold).toBe(1e30);
    expect(rich!.expected.wallet.essence).toBe(1e40);
    // And lifetime gold is floored at current gold, so it is raised to match.
    expect(rich!.expected.wallet.totalGold).toBe(1e30);
  });

  it('records that lifetime exp is not floored at current exp, unlike gold', () => {
    const veteran = fixture.cases.find(entry => entry.name === 'veteran')!;
    const raised = project({
      ...(decodeSpecials(veteran.payload) as Record<string, unknown>),
      gold: 500,
      totalGold: 1,
      exp: 50,
      totalExp: 1,
    });
    expect(raised.wallet.totalGold).toBe(500);
    // The asymmetry: totalExp stays at 1 even though exp is 50.
    expect(raised.progression.totalExp).toBe(1);
    expect(raised.progression.exp).toBe(50);
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_SAVE_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }

    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
