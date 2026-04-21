import {
  ACTIVE_SKILL_COOLDOWN_MS,
  HERO_LEVEL_CAP,
  HERO_POOL,
  getHeroActiveArchetypeInfo,
  getHeroUniqueCombatModifiers,
  getHeroUniqueSkillParams,
  getHeroUniqueWeaponName,
  rarityConfig,
  type HeroActiveSkillArchetypeId,
  type HeroTemplate,
  type HeroUnit,
  type UniqueSkillType,
} from '../src/gameConfig';
import { DEFAULT_STATE, advanceCombatStep, getDpsBreakdown, type GameState } from '../src/useGameState';

const TEST_ELAPSED_MS = 10_000;
const TEST_MONSTER_MAX_HP = 100_000_000;
const TEST_TEAM_MAX_HP = 100_000_000;

function buildHero(template: HeroTemplate): HeroUnit {
  const rarity = 'legendary';
  return {
    ...template,
    uid: `${template.id}_test`,
    rarity,
    level: HERO_LEVEL_CAP,
    rank: 10,
    teamBoost: template.baseTeamBoost * rarityConfig(rarity).boostMultiplier,
    rebirthStatMult: 1,
  };
}

function buildCombatState(hero: HeroUnit, overrides: Partial<GameState> = {}): GameState {
  return {
    ...DEFAULT_STATE,
    skills: overrides.skills ?? new Set(DEFAULT_STATE.skills),
    achievements: overrides.achievements ?? new Set(DEFAULT_STATE.achievements),
    characterCreated: true,
    playerClass: hero.heroClass,
    level: 50,
    highestWaveReached: 1,
    wave: 1,
    monsterMaxHp: TEST_MONSTER_MAX_HP,
    monsterHp: TEST_MONSTER_MAX_HP * 0.9,
    teamMaxHp: TEST_TEAM_MAX_HP,
    teamHp: TEST_TEAM_MAX_HP * 0.5,
    heroRoster: [hero],
    activeTeamHeroIds: [hero.uid],
    heroFormationByUid: {},
    heroUniqueGearByHeroId: {},
    heroActiveCdMs: {},
    combatLog: [],
    rewardQueue: [],
    autoSummonEnabled: false,
    autoDismantleEnabled: false,
    autoRecycleEnabled: false,
    autoUsePotionEnabled: false,
    autoUseCoolantEnabled: false,
    autoBurstEnabled: false,
    autoTempoEnabled: false,
    autoSummonCooldownMs: 0,
    combatTempo: 1,
    ...overrides,
  };
}

function expectCombatLogToContain(state: GameState, text: string) {
  expect(state.combatLog.some(line => line.includes(text))).toBe(true);
}

function findHeroByArchetype(archetype: HeroActiveSkillArchetypeId): HeroUnit {
  const template = HERO_POOL.find(hero => hero.activeSkillArchetype === archetype);
  if (!template) throw new Error(`Missing hero template for archetype ${archetype}`);
  return buildHero(template);
}

function findHeroByUniqueSkill(type: UniqueSkillType): HeroUnit {
  const template = HERO_POOL.find(hero => getHeroUniqueSkillParams(hero.id, 1)?.type === type);
  if (!template) throw new Error(`Missing hero template for unique skill ${type}`);
  return buildHero(template);
}

describe('hero skill wiring', () => {
  it('defines an active skill and unique weapon profile for every hero template', () => {
    expect(HERO_POOL.length).toBeGreaterThan(0);

    for (const hero of HERO_POOL) {
      expect(getHeroActiveArchetypeInfo(hero.activeSkillArchetype).name).toBeTruthy();
      expect(getHeroUniqueSkillParams(hero.id, 1)).not.toBeNull();
      expect(getHeroUniqueWeaponName(hero.id)).not.toContain('Signature Relic');
    }
  });

  const genericSkillCases: Array<{
    archetype: HeroActiveSkillArchetypeId;
    assertState: (next: GameState, initial: GameState) => void;
  }> = [
    {
      archetype: 'frontline_ward',
      assertState: next => {
        expect(next.damageReductionBuffPct).toBeGreaterThan(0);
        expect(next.damageReductionBuffMs).toBeGreaterThan(0);
      },
    },
    {
      archetype: 'burst_volley',
      assertState: (next, initial) => {
        expect(next.monsterHp).toBeLessThan(initial.monsterHp);
      },
    },
    {
      archetype: 'battle_chant',
      assertState: next => {
        expect(next.damageBuffPct).toBeGreaterThan(0);
        expect(next.damageBuffMs).toBeGreaterThan(0);
      },
    },
    {
      archetype: 'mending_pulse',
      assertState: (next, initial) => {
        expect(next.teamHp).toBeGreaterThan(initial.teamHp);
      },
    },
  ];

  for (const { archetype, assertState } of genericSkillCases) {
    it(`fires the ${archetype} active skill during combat`, () => {
      const hero = findHeroByArchetype(archetype);
      const initial = buildCombatState(hero);
      const next = advanceCombatStep(initial, TEST_ELAPSED_MS);

      expect(next.heroActiveCdMs[hero.uid]).toBe(ACTIVE_SKILL_COOLDOWN_MS[archetype]);
      expectCombatLogToContain(next, getHeroActiveArchetypeInfo(archetype).name);
      assertState(next, initial);
    });
  }

  const uniqueSkillCases: Array<{
    type: UniqueSkillType;
    logSnippet: string;
    assertState: (next: GameState, initial: GameState) => void;
  }> = [
    {
      type: 'shield_wall',
      logSnippet: 'Shield Wall',
      assertState: next => {
        expect(next.damageReductionBuffPct).toBeGreaterThan(0);
        expect(next.damageReductionBuffMs).toBeGreaterThan(0);
      },
    },
    {
      type: 'execute',
      logSnippet: 'Execute!',
      assertState: (next, initial) => {
        expect(next.monsterHp).toBeLessThan(initial.monsterHp);
      },
    },
    {
      type: 'rallying_cry',
      logSnippet: 'Rallying Cry!',
      assertState: (next, initial) => {
        expect(next.damageBuffPct).toBeGreaterThan(0);
        expect(next.teamHp).toBeGreaterThan(initial.teamHp);
      },
    },
    {
      type: 'soul_drain',
      logSnippet: 'Soul Drain!',
      assertState: (next, initial) => {
        expect(next.monsterHp).toBeLessThan(initial.monsterHp);
        expect(next.teamHp).toBeGreaterThan(initial.teamHp);
      },
    },
    {
      type: 'crit_storm',
      logSnippet: 'Crit Storm!',
      assertState: (next, initial) => {
        expect(next.monsterHp).toBeLessThan(initial.monsterHp);
      },
    },
    {
      type: 'mark_prey',
      logSnippet: 'Mark Prey!',
      assertState: next => {
        expect(next.damageBuffPct).toBeGreaterThan(0);
        expect(next.damageBuffMs).toBeGreaterThan(0);
      },
    },
    {
      type: 'chain_lightning',
      logSnippet: 'Chain Lightning!',
      assertState: (next, initial) => {
        expect(next.monsterHp).toBeLessThan(initial.monsterHp);
        expect(next.damageBuffPct).toBeGreaterThan(0);
      },
    },
    {
      type: 'barrier_pulse',
      logSnippet: 'Barrier Pulse!',
      assertState: (next, initial) => {
        expect(next.teamHp).toBeGreaterThan(initial.teamHp);
        expect(next.damageReductionBuffPct).toBeGreaterThan(0);
      },
    },
    {
      type: 'armor_shred',
      logSnippet: 'Armor Shred!',
      assertState: next => {
        expect(next.damageBuffPct).toBeGreaterThan(0);
        expect(next.damageBuffMs).toBeGreaterThan(0);
      },
    },
    {
      type: 'overcharge',
      logSnippet: 'Overcharge!',
      assertState: (next, initial) => {
        expect(next.monsterHp).toBeLessThan(initial.monsterHp);
      },
    },
  ];

  for (const { type, logSnippet, assertState } of uniqueSkillCases) {
    it(`fires the ${type} unique weapon skill when equipped`, () => {
      const hero = findHeroByUniqueSkill(type);
      const uniqueSkill = getHeroUniqueSkillParams(hero.id, 1);
      if (!uniqueSkill) throw new Error(`Missing unique skill config for ${hero.id}`);

      const initial = buildCombatState(hero, {
        heroUniqueGearByHeroId: {
          [hero.id]: { rank: 1, equippedByUid: hero.uid },
        },
      });
      const next = advanceCombatStep(initial, TEST_ELAPSED_MS);

      expect(next.heroActiveCdMs[hero.uid]).toBe(uniqueSkill.cooldownMs);
      expectCombatLogToContain(next, logSnippet);
      assertState(next, initial);
    });
  }

  it('falls back to the generic active when the unique weapon is forged but not equipped', () => {
    const hero = findHeroByUniqueSkill('shield_wall');
    const genericInfo = getHeroActiveArchetypeInfo(hero.activeSkillArchetype);
    const initial = buildCombatState(hero, {
      heroUniqueGearByHeroId: {
        [hero.id]: { rank: 1, equippedByUid: null },
      },
    });
    const next = advanceCombatStep(initial, TEST_ELAPSED_MS);

    expectCombatLogToContain(next, genericInfo.name);
    expect(next.combatLog.some(line => line.includes('Shield Wall'))).toBe(false);
  });

  it('applies the equipped unique relic doctrine once in the DPS breakdown', () => {
    const hero = findHeroByUniqueSkill('shield_wall');
    const baseline = buildCombatState(hero);
    const withUnique = buildCombatState(hero, {
      heroUniqueGearByHeroId: {
        [hero.id]: { rank: 1, equippedByUid: hero.uid },
      },
    });

    const baselineBreakdown = getDpsBreakdown(baseline);
    const uniqueBreakdown = getDpsBreakdown(withUnique);

    expect(uniqueBreakdown.multipliers.heroPassives).toBeCloseTo(baselineBreakdown.multipliers.heroPassives, 8);
    expect(uniqueBreakdown.multipliers.uniqueRelics).toBeCloseTo(getHeroUniqueCombatModifiers(hero.id, 1).dpsMult, 8);
    expect(uniqueBreakdown.totalMultiplier).toBeGreaterThan(baselineBreakdown.totalMultiplier);
  });
});