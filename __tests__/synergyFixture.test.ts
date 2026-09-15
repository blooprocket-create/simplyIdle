import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { HERO_POOL, rarityConfig, type HeroUnit, type PlayerClass } from '../src/gameConfig';
import { DEFAULT_STATE, getDpsBreakdown, type GameState } from '../src/useGameState';

/**
 * Reference values for team synergy.
 *
 * `getDpsBreakdown` exposes synergy as one number — its dpsMult — so only two
 * of the five rules are visible here: Spellshot Link and Grand Coalition.
 * Vanguard Wall moves hp, Iron Mandala moves incoming, and Warband Focus moves
 * gold, none of which the breakdown reports. The web-side suite covers those
 * behaviourally, and the scenarios below still include them so a port that
 * fired them *when it should not* shows up in the dps column.
 *
 * Regenerate deliberately:
 *   UPDATE_SYNERGY_FIXTURE=1 npx jest __tests__/synergyFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'engine', 'combat', '__fixtures__', 'synergy.json');

function unitOfClass(heroClass: PlayerClass, index: number): HeroUnit {
  const candidates = HERO_POOL.filter(hero => hero.heroClass === heroClass);
  const template = candidates[index % candidates.length];
  return {
    ...template,
    uid: `${template.id}_s${index}`,
    rarity: 'legendary',
    level: 50,
    rank: 5,
    teamBoost: template.baseTeamBoost * rarityConfig('legendary').boostMultiplier,
    rebirthStatMult: 1,
  };
}

interface Scenario {
  name: string;
  classes: PlayerClass[];
}

const SCENARIOS: Scenario[] = [
  { name: 'empty', classes: [] },
  { name: 'lone warrior', classes: ['warrior'] },
  // Vanguard Wall: two heavies. Not visible in dps, included anyway.
  { name: 'two vanguard', classes: ['warrior', 'berserker'] },
  // Spellshot Link: a ranger and an arcanum together. Visible in dps.
  { name: 'spellshot pair', classes: ['archer', 'mage'] },
  { name: 'archer alone is no link', classes: ['archer'] },
  // Iron Mandala: steel plus a monk. Not visible in dps.
  { name: 'iron mandala', classes: ['warrior', 'monk'] },
  // Grand Coalition: four distinct classes. Visible in dps.
  { name: 'four classes', classes: ['warrior', 'archer', 'mage', 'monk'] },
  { name: 'three classes is not a coalition', classes: ['warrior', 'archer', 'mage'] },
  { name: 'all five classes', classes: ['warrior', 'berserker', 'archer', 'mage', 'monk'] },
  // Warband Focus: three or more, all one class. Not visible in dps.
  { name: 'mono trio', classes: ['archer', 'archer', 'archer'] },
  { name: 'mono pair is too few', classes: ['archer', 'archer'] },
  // Several at once.
  { name: 'stacked', classes: ['warrior', 'berserker', 'archer', 'mage', 'monk', 'archer'] },
];

function stateFor(scenario: Scenario): GameState {
  const roster = scenario.classes.map((heroClass, index) => unitOfClass(heroClass, index));
  return {
    ...DEFAULT_STATE,
    skills: new Set(DEFAULT_STATE.skills),
    achievements: new Set(DEFAULT_STATE.achievements),
    characterCreated: true,
    playerClass: 'warrior',
    heroRoster: roster,
    activeTeamHeroIds: roster.map(hero => hero.uid),
    heroFormationByUid: {},
    heroUniqueGearByHeroId: {},
  };
}

interface Row {
  scenario: Scenario;
  synergyDps: number;
}

interface Fixture {
  note: string;
  generatedFrom: string;
  rows: Row[];
}

function build(): Fixture {
  return {
    note: 'Team synergy dps multipliers from the shipped implementation. Owned by __tests__/synergyFixture.test.ts.',
    generatedFrom: 'src/useGameState.ts getDpsBreakdown',
    rows: SCENARIOS.map(scenario => ({
      scenario,
      synergyDps: getDpsBreakdown(stateFor(scenario)).multipliers.synergy,
    })),
  };
}

describe('synergy fixture', () => {
  const fixture = build();

  const dpsFor = (name: string) => fixture.rows.find(row => row.scenario.name === name)?.synergyDps;

  it('has no synergy on an empty or lone team', () => {
    expect(dpsFor('empty')).toBe(1);
    expect(dpsFor('lone warrior')).toBe(1);
  });

  it('fires Spellshot Link only when both halves are present', () => {
    expect(dpsFor('spellshot pair')).toBeCloseTo(1.1, 10);
    expect(dpsFor('archer alone is no link')).toBe(1);
  });

  it('fires Grand Coalition at four distinct classes, not three', () => {
    expect(dpsFor('three classes is not a coalition')).toBeCloseTo(1.1, 10);
    // Four classes adds the 1.08 coalition on top of the 1.1 spellshot.
    expect(dpsFor('four classes')).toBeCloseTo(1.1 * 1.08, 10);
  });

  it('leaves the hp, incoming and gold synergies invisible here', () => {
    // Recorded rather than assumed: these three fire in the shipped code but
    // move multipliers getDpsBreakdown does not report, so their scenarios
    // read as 1 and the web-side suite is what actually covers them.
    expect(dpsFor('two vanguard')).toBe(1);
    expect(dpsFor('iron mandala')).toBe(1);
    expect(dpsFor('mono trio')).toBe(1);
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_SYNERGY_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }

    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
