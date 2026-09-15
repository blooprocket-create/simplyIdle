import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { HERO_POOL, rarityConfig, type HeroUnit, type PlayerClass } from '../src/gameConfig';
import { DEFAULT_STATE, getDpsBreakdown, type GameState } from '../src/useGameState';

/**
 * Reference values for formation and team-boost multipliers.
 *
 * One scenario here exists to pin a bug rather than a feature. The shipped
 * `getFormationRoleForHero` never reads `state.heroFormationByUid`, so a monk
 * the player placed in `mid` still fights as `front`. Recording that means a
 * later fix has to regenerate this fixture deliberately, which is the point —
 * the fix is a balance change and should not be able to happen by accident.
 *
 * Regenerate deliberately:
 *   UPDATE_FORMATION_FIXTURE=1 npx jest __tests__/formationFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'engine', 'combat', '__fixtures__', 'formation.json');

function unitOfClass(heroClass: PlayerClass, index: number): HeroUnit {
  const candidates = HERO_POOL.filter(hero => hero.heroClass === heroClass);
  const template = candidates[index % candidates.length];
  return {
    ...template,
    uid: `${template.id}_f${index}`,
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
  /** Stored formation choices, keyed by position in `classes`. */
  storedRoles?: Record<number, 'front' | 'mid' | 'back'>;
}

const SCENARIOS: Scenario[] = [
  { name: 'empty team', classes: [] },
  { name: 'one warrior', classes: ['warrior'] },
  { name: 'one mage', classes: ['mage'] },
  { name: 'one archer', classes: ['archer'] },
  { name: 'one monk', classes: ['monk'] },
  // The rank cap is 2, so the third hero in a rank contributes nothing.
  //
  // Warriors alone cannot prove that here: they are tanks, so the cap moves
  // only hpMult and incomingMult, and getDpsBreakdown exposes neither. Three
  // archers make the cap visible in the one multiplier that is observable —
  // 1.192 at a cap of two against 1.302 at three.
  { name: 'three warriors hits the front cap', classes: ['warrior', 'warrior', 'warrior'] },
  { name: 'three archers hits the back cap', classes: ['archer', 'archer', 'archer'] },
  { name: 'balanced line', classes: ['warrior', 'monk', 'mage', 'archer'] },
  { name: 'full six', classes: ['warrior', 'berserker', 'monk', 'mage', 'archer', 'archer'] },
  {
    name: 'monk stored as mid — shipped code ignores it',
    classes: ['monk'],
    storedRoles: { 0: 'mid' },
  },
];

function stateFor(scenario: Scenario): GameState {
  const roster = scenario.classes.map((heroClass, index) => unitOfClass(heroClass, index));
  const heroFormationByUid: Record<string, 'front' | 'mid' | 'back'> = {};
  for (const [index, role] of Object.entries(scenario.storedRoles ?? {})) {
    const hero = roster[Number(index)];
    if (hero) heroFormationByUid[hero.uid] = role;
  }

  return {
    ...DEFAULT_STATE,
    skills: new Set(DEFAULT_STATE.skills),
    achievements: new Set(DEFAULT_STATE.achievements),
    characterCreated: true,
    playerClass: 'warrior',
    heroRoster: roster,
    activeTeamHeroIds: roster.map(hero => hero.uid),
    heroFormationByUid,
    heroUniqueGearByHeroId: {},
  };
}

interface Row {
  scenario: Scenario;
  /** The formation dps multiplier, as the breakdown reports it. */
  formationDps: number;
  teamBoost: number;
  teamBoostValues: number[];
}

interface Fixture {
  note: string;
  generatedFrom: string;
  rows: Row[];
}

function build(): Fixture {
  return {
    note: 'Formation and team-boost multipliers from the shipped implementation. Owned by __tests__/formationFixture.test.ts.',
    generatedFrom: 'src/useGameState.ts getDpsBreakdown',
    rows: SCENARIOS.map(scenario => {
      const state = stateFor(scenario);
      const breakdown = getDpsBreakdown(state);
      return {
        scenario,
        formationDps: breakdown.multipliers.formation,
        teamBoost: breakdown.multipliers.teamBoost,
        teamBoostValues: state.heroRoster.map(hero => hero.teamBoost),
      };
    }),
  };
}

describe('formation fixture', () => {
  const fixture = build();

  it('covers an empty team, each rank, the rank cap and a full line', () => {
    expect(fixture.rows.length).toBe(SCENARIOS.length);
    expect(fixture.rows[0].formationDps).toBe(1);
    expect(fixture.rows.some(row => row.formationDps !== 1)).toBe(true);
  });

  it('caps a rank at two contributing heroes', () => {
    // A third archer changes nothing, which is what the cap means — and
    // archers are the composition where that is visible in the dps
    // multiplier rather than hidden in the hp one.
    const two = getDpsBreakdown(stateFor({ name: 'two', classes: ['archer', 'archer'] }));
    const three = fixture.rows.find(row => row.scenario.name.startsWith('three archers'));
    expect(three?.formationDps).toBe(two.multipliers.formation);
  });

  it('only observes the dps multiplier, and says so', () => {
    // getDpsBreakdown exposes formation as a single number — its dpsMult.
    // hpMult and incomingMult are real and ported, but nothing here pins
    // them, so the web-side suite covers them behaviourally instead.
    expect(Object.keys(fixture.rows[0])).toEqual(['scenario', 'formationDps', 'teamBoost', 'teamBoostValues']);
  });

  it('records that a stored monk formation does not reach combat', () => {
    // Pinning the bug, not endorsing it. A monk in `mid` would be worth
    // 1.03x team dps; the shipped code counts them as `front` and gives 1.
    const stored = fixture.rows.find(row => row.scenario.name.startsWith('monk stored as mid'));
    const plain = fixture.rows.find(row => row.scenario.name === 'one monk');
    expect(stored?.formationDps).toBe(plain?.formationDps);
    expect(stored?.formationDps).toBe(1);
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_FORMATION_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }

    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
