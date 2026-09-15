import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { ACHIEVEMENTS, type PlayerClass } from '../src/gameConfig';
import { DEFAULT_STATE, getDpsBreakdown, type GameState } from '../src/useGameState';

/**
 * Reference values for the progression half of the damage multiplier stack.
 *
 * `getDpsBreakdown` already returns its multipliers individually, so unlike
 * per-hero damage these can be read off directly — no single-element team
 * trick needed. What this fixture pins is that the rewrite computes the same
 * nine numbers from the same state.
 *
 * Regenerate deliberately:
 *   UPDATE_MULTIPLIER_FIXTURE=1 npx jest __tests__/progressionMultiplierFixture.test.ts
 */

const FIXTURE_PATH = join(
  __dirname,
  '..',
  'web',
  'src',
  'engine',
  'combat',
  '__fixtures__',
  'progression-multipliers.json',
);

interface Scenario {
  name: string;
  playerClass: PlayerClass;
  prestigeCount: number;
  achievementCount: number;
  metaDamageLevel: number;
  rebirthDamagePath: number;
  tacticsFacilityLevel: number;
  vipLevel: number;
  classMasteryXp: number;
  classPassiveUnlocked: boolean;
  damageBuffPct: number;
}

/**
 * Chosen to move each factor independently and then all at once, plus the two
 * edges that are not linear: the class passive gate, and the mastery cap.
 */
const SCENARIOS: Scenario[] = [
  {
    name: 'fresh',
    playerClass: 'warrior',
    prestigeCount: 0,
    achievementCount: 0,
    metaDamageLevel: 0,
    rebirthDamagePath: 0,
    tacticsFacilityLevel: 0,
    vipLevel: 0,
    classMasteryXp: 0,
    classPassiveUnlocked: false,
    damageBuffPct: 0,
  },
  {
    name: 'class passive unlocked',
    playerClass: 'berserker',
    prestigeCount: 0,
    achievementCount: 0,
    metaDamageLevel: 0,
    rebirthDamagePath: 0,
    tacticsFacilityLevel: 0,
    vipLevel: 0,
    classMasteryXp: 0,
    classPassiveUnlocked: true,
    damageBuffPct: 0,
  },
  {
    name: 'mage passive is a small dps gain',
    playerClass: 'mage',
    prestigeCount: 0,
    achievementCount: 0,
    metaDamageLevel: 0,
    rebirthDamagePath: 0,
    tacticsFacilityLevel: 0,
    vipLevel: 0,
    classMasteryXp: 0,
    classPassiveUnlocked: true,
    damageBuffPct: 0,
  },
  {
    name: 'three rebirths',
    playerClass: 'warrior',
    prestigeCount: 3,
    achievementCount: 0,
    metaDamageLevel: 0,
    rebirthDamagePath: 0,
    tacticsFacilityLevel: 0,
    vipLevel: 0,
    classMasteryXp: 0,
    classPassiveUnlocked: false,
    damageBuffPct: 0,
  },
  {
    name: 'achievements only',
    playerClass: 'archer',
    prestigeCount: 0,
    achievementCount: 12,
    metaDamageLevel: 0,
    rebirthDamagePath: 0,
    tacticsFacilityLevel: 0,
    vipLevel: 0,
    classMasteryXp: 0,
    classPassiveUnlocked: false,
    damageBuffPct: 0,
  },
  {
    name: 'mastery below the cap',
    playerClass: 'monk',
    prestigeCount: 0,
    achievementCount: 0,
    metaDamageLevel: 0,
    rebirthDamagePath: 0,
    tacticsFacilityLevel: 0,
    vipLevel: 0,
    classMasteryXp: 1_500,
    classPassiveUnlocked: false,
    damageBuffPct: 0,
  },
  {
    name: 'mastery past the cap',
    playerClass: 'monk',
    prestigeCount: 0,
    achievementCount: 0,
    metaDamageLevel: 0,
    rebirthDamagePath: 0,
    tacticsFacilityLevel: 0,
    vipLevel: 0,
    classMasteryXp: 90_000,
    classPassiveUnlocked: false,
    damageBuffPct: 0,
  },
  {
    name: 'everything at once',
    playerClass: 'mage',
    prestigeCount: 7,
    achievementCount: 40,
    metaDamageLevel: 25,
    rebirthDamagePath: 9,
    tacticsFacilityLevel: 30,
    vipLevel: 10,
    classMasteryXp: 4_200,
    classPassiveUnlocked: true,
    damageBuffPct: 0.35,
  },
];

function stateFor(scenario: Scenario): GameState {
  // `achievements` is a Set of ids; only its size feeds the multiplier, so any
  // real ids of the right count give the shipped value.
  const achievementIds = ACHIEVEMENTS.slice(0, scenario.achievementCount).map(achievement => achievement.id);

  return {
    ...DEFAULT_STATE,
    skills: new Set(DEFAULT_STATE.skills),
    achievements: new Set(achievementIds),
    characterCreated: true,
    playerClass: scenario.playerClass,
    prestigeCount: scenario.prestigeCount,
    metaDamageLevel: scenario.metaDamageLevel,
    rebirthDamagePath: scenario.rebirthDamagePath,
    guildhallFacilities: {
      ...DEFAULT_STATE.guildhallFacilities,
      tactics: { level: scenario.tacticsFacilityLevel },
    },
    vipLevel: scenario.vipLevel,
    classMasteryXp: {
      ...DEFAULT_STATE.classMasteryXp,
      [scenario.playerClass]: scenario.classMasteryXp,
    },
    permanentUnlocks: scenario.classPassiveUnlocked ? ['class_passive'] : [],
    damageBuffPct: scenario.damageBuffPct,
    heroRoster: [],
    activeTeamHeroIds: [],
  };
}

interface Row {
  scenario: Scenario;
  multipliers: {
    rebirthLegacy: number;
    achievementLegacy: number;
    metaDamage: number;
    rebirthDamagePath: number;
    tacticsFacility: number;
    classPassive: number;
    mastery: number;
    vipDamage: number;
    temporaryBuff: number;
  };
}

interface Fixture {
  note: string;
  generatedFrom: string;
  rows: Row[];
}

function build(): Fixture {
  return {
    note: 'Progression damage multipliers from the shipped implementation. Owned by __tests__/progressionMultiplierFixture.test.ts.',
    generatedFrom: 'src/useGameState.ts getDpsBreakdown',
    rows: SCENARIOS.map(scenario => {
      const m = getDpsBreakdown(stateFor(scenario)).multipliers;
      return {
        scenario,
        multipliers: {
          rebirthLegacy: m.rebirthLegacy,
          achievementLegacy: m.achievementLegacy,
          metaDamage: m.metaDamage,
          rebirthDamagePath: m.rebirthDamagePath,
          tacticsFacility: m.tacticsFacility,
          classPassive: m.classPassive,
          mastery: m.mastery,
          vipDamage: m.vipDamage,
          temporaryBuff: m.temporaryBuff,
        },
      };
    }),
  };
}

describe('progression multiplier fixture', () => {
  const fixture = build();

  it('covers every factor and the two non-linear edges', () => {
    expect(fixture.rows.length).toBe(SCENARIOS.length);
    // Each factor is 1 somewhere and not 1 somewhere else, so a port that
    // hardcoded any of them to 1 would fail rather than coincidentally pass.
    const keys = Object.keys(fixture.rows[0].multipliers) as (keyof Row['multipliers'])[];
    for (const key of keys) {
      const values = fixture.rows.map(row => row.multipliers[key]);
      expect(values.some(value => value === 1)).toBe(true);
      expect(values.some(value => value !== 1)).toBe(true);
    }
  });

  it('holds the mastery cap at its shipped ceiling', () => {
    const capped = fixture.rows.find(row => row.scenario.name === 'mastery past the cap');
    expect(capped?.multipliers.mastery).toBe(1.4);
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_MULTIPLIER_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }

    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
