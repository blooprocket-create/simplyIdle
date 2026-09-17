import { describe, expect, it } from 'vitest';
import { CLASS_PROFILES, type PlayerClass } from '../../content/classes';
import { HERO_POOL, heroTemplatesById } from '../../content/heroes';
import type { Rarity } from '../../content/rarities';
import type { StatBlock } from '../save/schema';
import {
  MAX_PLAYER_NAME_LENGTH,
  STARTING_STAT_POINTS,
  allocateMax,
  allocateN,
  allocateOne,
  createCharacter,
  statPointsForLevel,
  statPointsSpent,
  type StatPool,
} from './allocation';
import { MASTERY_HP_CAP, derivedStats, getMasteryHpMultiplier, heroVitality, teamMaxHp } from './stats';
import fixture from './__fixtures__/character.json';

/**
 * The character, against the shipped game.
 *
 * `__tests__/characterFixture.test.ts` generated every number below out of
 * `useGameState` before any of this existed, which is what makes it a port
 * rather than a reimplementation that happens to look similar.
 */

const CLASSES: PlayerClass[] = ['warrior', 'berserker', 'archer', 'mage', 'monk'];
const TEMPLATES = heroTemplatesById();

function scenario(name: string) {
  const found = fixture.scenarios.find(entry => entry.name === name);
  if (!found) throw new Error(`no scenario ${name}`);
  return found;
}

/**
 * Rebuild a scenario's active team from the fixture's own description of it.
 *
 * The fixture records the result, not the roster, so the rosters are rebuilt
 * here the same way the generator built them — one hero per class in a fixed
 * order, taken from the shared catalogue. Both sides read `HERO_POOL`, so a
 * hero leaving the catalogue breaks this loudly rather than quietly changing a
 * number.
 */
function team(size: number, level: number, rarity: Rarity, rank: number, rebirthStatMult = 1) {
  const classes: PlayerClass[] = ['warrior', 'berserker', 'mage', 'archer', 'monk', 'warrior'];
  return classes.slice(0, size).map((heroClass, index) => {
    const template = HERO_POOL.filter(entry => entry.heroClass === heroClass)[index % 3];
    return { uid: `u${index}`, heroClass: template.heroClass, level, rarity, rank, rebirthStatMult };
  });
}

/**
 * The level a scenario's measurement actually ran at.
 *
 * Not the level the scenario asks for. The generator resolves a round to make
 * the shipped engine publish `teamMaxHp`, and resolving it by a kill levels
 * every active hero — so a scenario written at level one is weighed at level
 * two. It records what it weighed, and this reads that rather than the ask.
 * Building at the asked-for level instead is off by one hero level on every
 * fresh character, which is seven health and was the first thing this file
 * got wrong.
 */
const measuredLevel = (name: string) => scenario(name).heroLevel;

const SOLO_TEMPLATE = HERO_POOL.filter(entry => entry.heroClass === 'warrior')[0];
const solo = (level: number) => [
  { uid: 'u0', heroClass: SOLO_TEMPLATE.heroClass, level, rank: 1, rarity: 'common' as Rarity, rebirthStatMult: 1 },
];

const NO_ALLOC: StatBlock = { strength: 0, vitality: 0, agility: 0, intelligence: 0, spirit: 0 };

interface Override {
  playerClass?: PlayerClass;
  soloLevel?: number;
  alloc?: StatBlock;
  activeHeroes?: ReturnType<typeof team>;
  metaSurvivalLevel?: number;
  rebirthSurvivalPath?: number;
  classMasteryXp?: number;
  tacticsFacilityLevel?: number;
}

function health(overrides: Override = {}): number {
  return teamMaxHp({
    playerClass: overrides.playerClass ?? 'warrior',
    alloc: overrides.alloc ?? NO_ALLOC,
    activeHeroes: overrides.activeHeroes ?? solo(overrides.soloLevel ?? 2),
    metaSurvivalLevel: overrides.metaSurvivalLevel ?? 0,
    rebirthSurvivalPath: overrides.rebirthSurvivalPath ?? 0,
    classMasteryXp: overrides.classMasteryXp ?? 0,
    tacticsFacilityLevel: overrides.tacticsFacilityLevel ?? 0,
  });
}

describe('the player stat block', () => {
  it('matches the shipped block for every class', () => {
    for (const playerClass of CLASSES) {
      const expected = scenario(`class-${playerClass}`).combined;
      expect({ playerClass, stats: derivedStats(playerClass, NO_ALLOC) }).toEqual({ playerClass, stats: expected });
    }
  });

  it('adds allocated points on top of the class base', () => {
    const entry = scenario('allocated-spread');
    expect(derivedStats('warrior', entry.statsAlloc)).toEqual(entry.combined);
  });

  it('reads a character with no class as a warrior, not as a blank', () => {
    // The shipped `derivedStats` defaults a null class to warrior, so a save
    // caught mid-creation reports warrior stats rather than zeroes. Zeroes
    // would give that character no health at all.
    expect(derivedStats(null, NO_ALLOC)).toEqual(CLASS_PROFILES.warrior.baseStats);
  });
});

describe('team health', () => {
  it('matches the shipped number for every fixture scenario', () => {
    /*
     * The whole point of the phase. Each of these was measured out of the
     * shipped engine by fighting a state until it published `teamMaxHp`, and
     * the rewrite has to land on the same integer — `Math.ceil` included,
     * which at low levels is the difference between 244 and 245.
     */
    for (const playerClass of CLASSES) {
      expect({ playerClass, hp: health({ playerClass, soloLevel: measuredLevel(`class-${playerClass}`) }) }).toEqual({
        playerClass,
        hp: scenario(`class-${playerClass}`).teamMaxHp,
      });
    }

    const cases: [string, Override][] = [
      ['allocated-vitality', { alloc: scenario('allocated-vitality').statsAlloc }],
      ['allocated-spread', { alloc: scenario('allocated-spread').statsAlloc }],
      ['six-heroes', { activeHeroes: team(6, measuredLevel('six-heroes'), 'epic', 5) }],
      ['benched-heroes', { activeHeroes: team(6, measuredLevel('benched-heroes'), 'epic', 5).slice(0, 2) }],
      ['meta-survival', { metaSurvivalLevel: 12 }],
      ['rebirth-survival', { metaSurvivalLevel: 12, rebirthSurvivalPath: 9 }],
      ['mastery-under-cap', { classMasteryXp: 1_900 }],
      ['mastery-past-cap', { classMasteryXp: 80_000 }],
      ['tactics-facility', { tacticsFacilityLevel: 14 }],
      ['rebirth-stat-mult', { activeHeroes: team(4, measuredLevel('rebirth-stat-mult'), 'epic', 5, 2.5) }],
      [
        'everything',
        {
          alloc: scenario('everything').statsAlloc,
          activeHeroes: team(6, measuredLevel('everything'), 'transcendent', 10),
          metaSurvivalLevel: 20,
          rebirthSurvivalPath: 12,
          classMasteryXp: 5_000,
          tacticsFacilityLevel: 20,
        },
      ],
    ];

    for (const [name, override] of cases) {
      expect({ name, hp: health(override) }).toEqual({ name, hp: scenario(name).teamMaxHp });
    }
  });

  it('counts a hero by their class vitality, not their template profile', () => {
    /*
     * The detail that is easy to get wrong by reading the shipped code too
     * quickly. `computeStats` builds per-hero *display* stats from
     * `getHeroStatProfile` when a template exists and falls back to the class;
     * `getTeamMaxHp` does no such thing and always uses the class.
     *
     * Two heroes of the same class with different templates therefore
     * contribute identical health, however different their damage. Following
     * the display path instead would be wrong on every hero that has a
     * template — which is all of them.
     */
    const warriors = HERO_POOL.filter(entry => entry.heroClass === 'warrior').slice(0, 2);
    expect(warriors).toHaveLength(2);
    expect(warriors[0].id).not.toBe(warriors[1].id);
    expect(TEMPLATES.has(warriors[0].id) && TEMPLATES.has(warriors[1].id)).toBe(true);

    const hero = (id: string) => ({
      uid: id,
      heroClass: 'warrior' as PlayerClass,
      level: 60,
      rank: 3,
      rarity: 'rare' as Rarity,
      rebirthStatMult: 1,
    });
    expect(heroVitality(hero(warriors[0].id))).toBe(heroVitality(hero(warriors[1].id)));
  });

  it('refuses to let a rebirth multiplier below one reduce anything', () => {
    // The shipped code floors it at 1. A stored multiplier below one is a save
    // that has been edited, and the floor is what stops the edit from being
    // worth anything.
    const base = health({ activeHeroes: team(4, 140, 'epic', 5, 1) });
    expect(health({ activeHeroes: team(4, 140, 'epic', 5, 0.1) })).toBe(base);
    expect(health({ activeHeroes: team(4, 140, 'epic', 5, 2.5) })).toBeGreaterThan(base);
  });

  it('caps mastery health at a quarter', () => {
    expect(getMasteryHpMultiplier(0)).toBe(1);
    // Four mastery levels per 2% step, and 100 xp per level.
    expect(getMasteryHpMultiplier(400)).toBeCloseTo(1.02, 10);
    expect(getMasteryHpMultiplier(1_900)).toBeCloseTo(1.08, 10);
    expect(getMasteryHpMultiplier(5_200)).toBeCloseTo(1 + MASTERY_HP_CAP, 10);
    // And past the ceiling, more mastery buys nothing at all.
    expect(getMasteryHpMultiplier(1_000_000)).toBe(1 + MASTERY_HP_CAP);
  });

  it('multiplies its factors rather than adding them', () => {
    /*
     * Six separate multipliers. Adding any pair stays within a few percent at
     * low levels and is wrong by a lot in the deep game, so the check is on
     * the product: switching two on has to cost the product of switching each
     * on alone.
     */
    const none = health();
    const meta = health({ metaSurvivalLevel: 12 });
    const rebirth = health({ rebirthSurvivalPath: 9 });
    const both = health({ metaSurvivalLevel: 12, rebirthSurvivalPath: 9 });
    expect(both / none / ((meta / none) * (rebirth / none))).toBeCloseTo(1, 2);
  });
});

describe('spending stat points', () => {
  const pool = (): StatPool => ({
    alloc: { strength: 3, vitality: 3, agility: 0, intelligence: 0, spirit: 0 },
    unspent: 10,
  });

  it('matches the shipped reducer on every case it is safe to match', () => {
    const cases = fixture.allocation;
    expect(allocateOne(pool(), 'vitality')).toEqual({ alloc: cases.one.alloc, unspent: cases.one.unspent });
    expect(allocateN(pool(), 'vitality', 4)).toEqual({ alloc: cases.n.alloc, unspent: cases.n.unspent });
    // Asking for more than the pool spends the pool rather than failing.
    expect(allocateN(pool(), 'vitality', 999)).toEqual({
      alloc: cases.nOverPool.alloc,
      unspent: cases.nOverPool.unspent,
    });
    expect(allocateN(pool(), 'vitality', 0)).toEqual({ alloc: cases.nZero.alloc, unspent: cases.nZero.unspent });
    expect(allocateMax(pool(), 'spirit')).toEqual({ alloc: cases.max.alloc, unspent: cases.max.unspent });
  });

  it('does nothing on an empty pool', () => {
    const empty: StatPool = { alloc: { ...pool().alloc }, unspent: 0 };
    expect(allocateOne(empty, 'vitality')).toEqual(empty);
    expect(allocateMax(empty, 'vitality')).toEqual(empty);
    expect(allocateN(empty, 'vitality', 5)).toEqual(empty);
  });

  it('diverges from the shipped reducer on a negative amount, on purpose', () => {
    /*
     * The one place this port refuses to be faithful.
     *
     * The shipped reducer computes `Math.min(amount, unspent)` with no floor,
     * so `-5` subtracts negative five: the pool *grows* by five and the stat
     * drops below where it started, repeatable without limit. The fixture
     * records that — a pool of ten becomes fifteen and vitality goes to `-2` —
     * which is why this test can assert the divergence rather than assume it.
     *
     * Nothing in the shipped UI sends a negative amount, so it has never cost
     * anyone anything. But these are engine functions now rather than one
     * component's private handler, and a duplication bug is not a behaviour
     * worth preserving for compatibility with a caller that does not exist.
     */
    expect(fixture.allocation.nNegative).toEqual({
      alloc: { strength: 3, vitality: -2, agility: 0, intelligence: 0, spirit: 0 },
      unspent: 15,
    });
    expect(allocateN(pool(), 'vitality', -5)).toEqual(pool());
  });

  it('spends whole points only', () => {
    // A fractional amount would put a fraction of a point into a stat and take
    // a fraction out of the pool, leaving a pool that can never reach zero.
    expect(allocateN(pool(), 'vitality', 2.9)).toEqual({
      alloc: { strength: 3, vitality: 5, agility: 0, intelligence: 0, spirit: 0 },
      unspent: 8,
    });
  });

  it('never loses or invents a point', () => {
    // The invariant underneath all of the above: spending moves points, it
    // does not create them. Checked across every operation in sequence.
    const start = pool();
    const total = statPointsSpent(start.alloc) + start.unspent;
    let current = start;
    for (const step of [
      () => allocateOne(current, 'strength'),
      () => allocateN(current, 'agility', 3),
      () => allocateN(current, 'spirit', -4),
      () => allocateN(current, 'intelligence', 100),
      () => allocateMax(current, 'vitality'),
    ]) {
      current = step();
      expect(statPointsSpent(current.alloc) + current.unspent).toBe(total);
    }
  });

  it('gives five points a level', () => {
    expect(statPointsForLevel(1)).toBe(0);
    expect(statPointsForLevel(2)).toBe(5);
    expect(statPointsForLevel(100)).toBe(495);
    // A level below one is a save that has been edited, not a debt.
    expect(statPointsForLevel(0)).toBe(0);
    expect(statPointsForLevel(-40)).toBe(0);
  });
});

describe('creating a character', () => {
  it('matches the shipped result', () => {
    const made = createCharacter(null, '  Wanderer  ', 'mage');
    expect(made).toEqual({
      name: fixture.character.created.playerName,
      playerClass: fixture.character.created.playerClass,
      created: true,
      unspent: fixture.character.created.unspentStatPoints,
    });
    expect(STARTING_STAT_POINTS).toBe(fixture.character.created.unspentStatPoints);
  });

  it('caps the name at the length the shipped game caps it', () => {
    const made = createCharacter(null, 'x'.repeat(60), 'monk');
    expect(made?.name).toHaveLength(fixture.character.nameLength);
    expect(MAX_PLAYER_NAME_LENGTH).toBe(fixture.character.nameLength);
  });

  it('refuses a blank name and a second character', () => {
    /*
     * The shipped reducer refuses both by returning the state unchanged, which
     * a caller cannot tell from success. Null makes the refusal visible — a
     * caller that ignored it would otherwise believe it had re-rolled a class.
     */
    expect(fixture.character.blankNameRejected).toBe(true);
    expect(fixture.character.secondAttemptIgnored).toBe(true);

    expect(createCharacter(null, '   ', 'monk')).toBeNull();
    const made = createCharacter(null, 'Wanderer', 'mage');
    expect(createCharacter(made, 'Second', 'archer')).toBeNull();
  });
});
