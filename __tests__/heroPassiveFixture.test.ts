import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { HERO_POOL, rarityConfig, type HeroPassiveTraitId, type HeroUnit } from '../src/gameConfig';
import { DEFAULT_STATE, getDpsBreakdown, type GameState } from '../src/useGameState';

/**
 * Reference values for hero passive traits.
 *
 * As with synergy, `getDpsBreakdown` reports only the dps multiplier, so one
 * of the four traits is observable here and three are not. The web-side suite
 * covers gold, exp and mitigation behaviourally; their scenarios stay here so
 * a port that leaked them into dps would still be caught.
 *
 * Regenerate deliberately:
 *   UPDATE_PASSIVE_FIXTURE=1 npx jest __tests__/heroPassiveFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'engine', 'combat', '__fixtures__', 'hero-passives.json');

function unitWithTrait(trait: HeroPassiveTraitId, index: number): HeroUnit {
  const candidates = HERO_POOL.filter(hero => hero.passiveTrait === trait);
  if (candidates.length === 0) throw new Error(`No hero carries ${trait}`);
  const template = candidates[index % candidates.length];
  return {
    ...template,
    uid: `${template.id}_p${index}`,
    rarity: 'legendary',
    level: 50,
    rank: 5,
    teamBoost: template.baseTeamBoost * rarityConfig('legendary').boostMultiplier,
    rebirthStatMult: 1,
  };
}

interface Scenario {
  name: string;
  traits: HeroPassiveTraitId[];
}

const SCENARIOS: Scenario[] = [
  { name: 'empty', traits: [] },
  { name: 'one warpath', traits: ['warpath_instinct'] },
  { name: 'three warpath stack', traits: Array(3).fill('warpath_instinct') },
  { name: 'six warpath stack', traits: Array(6).fill('warpath_instinct') },
  // The other three traits move multipliers the breakdown does not report.
  { name: 'one fortune hunter', traits: ['fortune_hunter'] },
  { name: 'one sage', traits: ['sage_instinct'] },
  { name: 'one bulwark', traits: ['bulwark_instinct'] },
  { name: 'one of each', traits: ['warpath_instinct', 'fortune_hunter', 'sage_instinct', 'bulwark_instinct'] },
];

function stateFor(scenario: Scenario): GameState {
  const roster = scenario.traits.map((trait, index) => unitWithTrait(trait, index));
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
  passiveDps: number;
}

interface Fixture {
  note: string;
  generatedFrom: string;
  rows: Row[];
}

function build(): Fixture {
  return {
    note: 'Hero passive dps multipliers from the shipped implementation. Owned by __tests__/heroPassiveFixture.test.ts.',
    generatedFrom: 'src/useGameState.ts getDpsBreakdown',
    rows: SCENARIOS.map(scenario => ({
      scenario,
      passiveDps: getDpsBreakdown(stateFor(scenario)).multipliers.heroPassives,
    })),
  };
}

describe('hero passive fixture', () => {
  const fixture = build();
  const dpsFor = (name: string) => fixture.rows.find(row => row.scenario.name === name)?.passiveDps;

  it('stacks warpath geometrically, once per hero carrying it', () => {
    expect(dpsFor('empty')).toBe(1);
    expect(dpsFor('one warpath')).toBeCloseTo(1.03, 10);
    expect(dpsFor('three warpath stack')).toBeCloseTo(1.03 ** 3, 10);
    expect(dpsFor('six warpath stack')).toBeCloseTo(1.03 ** 6, 10);
  });

  it('leaves the gold, exp and mitigation traits invisible here', () => {
    // Recorded rather than assumed. These three fire but move multipliers
    // getDpsBreakdown does not report, so the web-side suite covers them.
    expect(dpsFor('one fortune hunter')).toBe(1);
    expect(dpsFor('one sage')).toBe(1);
    expect(dpsFor('one bulwark')).toBe(1);
  });

  it('only the warpath hero contributes dps in a mixed team', () => {
    expect(dpsFor('one of each')).toBeCloseTo(1.03, 10);
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_PASSIVE_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }

    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
