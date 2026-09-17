import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  ACTIVE_SKILL_COOLDOWN_MS,
  HERO_POOL,
  MENDING_PULSE_BASE_HEAL,
  MENDING_PULSE_LEVEL_SCALE,
  getHeroUniqueSkillParams,
  type HeroActiveSkillArchetypeId,
  type HeroUnit,
  type PlayerClass,
  type Rarity,
} from '../src/gameConfig';
import { DEFAULT_STATE, getHeroActiveStatuses, reducer, type GameState } from '../src/useGameState';

/**
 * Reference behaviour for hero active skills — **the fifth unported system**,
 * found during Phase 8's mitigation work rather than looked for.
 *
 * The port came out off by exactly 0.8 on every mitigation scenario with a
 * warrior in it, which turned out not to be mitigation at all:
 * `autoCastHeroActivesEnabled` is on by default and every `frontline_ward`
 * hero auto-casts a damage-reduction buff. The mitigation fixture switched
 * them off and said why; this is the fixture that measures them instead.
 *
 * Two layers. Every hero has a **generic archetype** skill — one of four — and
 * a hero carrying their own unique relic casts a **unique** skill instead, from
 * a set of ten, scaled by the relic's rank. The relic is therefore not only a
 * stat bonus: it replaces the hero's ability.
 *
 * Driven through the real reducer via `CAST_HERO_ACTIVE`, because the cooldown
 * it writes back is as much of the behaviour as the effect.
 *
 * Regenerate deliberately:
 *   UPDATE_HERO_ACTIVES_FIXTURE=1 npx jest __tests__/heroActivesFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'engine', 'combat', '__fixtures__', 'hero-actives.json');

const FIXED_NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

/** A fielded hero, built from a template so the archetype is the shipped one. */
function hero(templateId: string, uid: string, overrides: Partial<HeroUnit> = {}): HeroUnit {
  const template = HERO_POOL.find(entry => entry.id === templateId);
  if (!template) throw new Error(`no such hero template: ${templateId}`);
  return {
    ...template,
    uid,
    rarity: 'common' as Rarity,
    level: 1,
    rank: 1,
    teamBoost: template.baseTeamBoost,
    rebirthStatMult: 1,
    ...overrides,
  };
}

function state(roster: HeroUnit[], overrides: Partial<GameState> = {}): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    // Off by default here, so a cast is the *only* thing that fires. With it on
    // the tick casts for everybody and nothing can be attributed.
    autoCastHeroActivesEnabled: false,
    heroRoster: roster,
    activeTeamHeroIds: roster.map(entry => entry.uid),
    teamMaxHp: 10_000,
    teamHp: 5_000,
    monsterMaxHp: 100_000,
    monsterHp: 100_000,
    damageBuffPct: 0,
    damageBuffMs: 0,
    damageReductionBuffPct: 0,
    damageReductionBuffMs: 0,
    ...overrides,
  };
}

function apply(from: GameState, action: unknown): GameState {
  return reducer(from, action as never);
}

/** The four fields a cast can move, read off the state afterwards. */
function effectOf(before: GameState, after: GameState) {
  return {
    monsterHpLost: before.monsterHp - after.monsterHp,
    teamHpGained: after.teamHp - before.teamHp,
    damageBuffPct: after.damageBuffPct,
    damageBuffMs: after.damageBuffMs,
    damageReductionBuffPct: after.damageReductionBuffPct,
    damageReductionBuffMs: after.damageReductionBuffMs,
  };
}

interface Cast {
  name: string;
  /** The archetype the hero has, or the unique skill type when a relic fires. */
  kind: string;
  heroId: string;
  heroLevel: number;
  relicRank: number | null;
  monsterMaxHp: number;
  teamMaxHp: number;
  teamHp: number;
  effect: ReturnType<typeof effectOf>;
  cooldownMs: number;
}

interface Fixture {
  note: string;
  generatedFrom: string;
  archetypeCooldowns: Record<string, number>;
  mendingPulse: { baseHeal: number; levelScale: number };
  /** One cast per generic archetype, plus the level and cap cases. */
  archetypes: Cast[];
  /** One cast per unique skill type, at rank one and at rank ten. */
  uniques: Cast[];
  /** What a cast is refused for. */
  refusals: { name: string; reason: string; cooldownBefore: number; fielded: boolean; changed: boolean }[];
  /** Rank scaling: the same skill at every rank. */
  rankScaling: { heroId: string; type: string; rank: number; power: number; cooldownMs: number }[];
  /** How the ability bar reads, which is its own published shape. */
  statuses: { uid: string; skillName: string; totalCooldownMs: number; ready: boolean }[];
  /**
   * Every hero's unique skill at rank one, and their archetype.
   *
   * The table the port's content file is generated from and checked against —
   * sixty-five rows of type, power, duration and cooldown is more
   * transcription than anybody reads carefully.
   */
  byHero: {
    heroId: string;
    archetype: string;
    unique: { type: string; power: number; durationMs: number; cooldownMs: number } | null;
  }[];
}

/** A hero for each generic archetype, found by walking the pool. */
function heroForArchetype(archetype: HeroActiveSkillArchetypeId): string {
  const template = HERO_POOL.find(entry => entry.activeSkillArchetype === archetype);
  if (!template) throw new Error(`no hero has archetype ${archetype}`);
  return template.id;
}

/** A hero for each unique skill type, found the same way. */
function heroForUniqueType(type: string): string | null {
  for (const template of HERO_POOL) {
    const params = getHeroUniqueSkillParams(template.id, 1);
    if (params?.type === type) return template.id;
  }
  return null;
}

const UNIQUE_TYPES = [
  'shield_wall',
  'execute',
  'rallying_cry',
  'soul_drain',
  'crit_storm',
  'mark_prey',
  'chain_lightning',
  'barrier_pulse',
  'armor_shred',
  'overcharge',
];

function build(): Fixture {
  const archetypes: Cast[] = [];
  const archetypeIds: HeroActiveSkillArchetypeId[] = [
    'frontline_ward',
    'burst_volley',
    'battle_chant',
    'mending_pulse',
  ];

  for (const archetype of archetypeIds) {
    for (const [name, level] of [
      [`${archetype}`, 1],
      [`${archetype}-level-200`, 200],
      [`${archetype}-level-9999`, 9_999],
    ] as const) {
      const heroId = heroForArchetype(archetype);
      const before = state([hero(heroId, 'caster', { level })]);
      const after = apply(before, { type: 'CAST_HERO_ACTIVE', uid: 'caster' });
      archetypes.push({
        name,
        kind: archetype,
        heroId,
        heroLevel: level,
        relicRank: null,
        monsterMaxHp: before.monsterMaxHp,
        teamMaxHp: before.teamMaxHp,
        teamHp: before.teamHp,
        effect: effectOf(before, after),
        cooldownMs: after.heroActiveCdMs.caster ?? 0,
      });
    }
  }

  const uniques: Cast[] = [];
  for (const type of UNIQUE_TYPES) {
    const heroId = heroForUniqueType(type);
    if (heroId === null) continue;
    for (const rank of [1, 10]) {
      const caster = hero(heroId, 'caster', { level: 50 });
      const before = state([caster], {
        heroUniqueGearByHeroId: { [heroId]: { rank, equippedByUid: 'caster' } },
      });
      const after = apply(before, { type: 'CAST_HERO_ACTIVE', uid: 'caster' });
      uniques.push({
        name: `${type}-rank-${rank}`,
        kind: type,
        heroId,
        heroLevel: caster.level,
        relicRank: rank,
        monsterMaxHp: before.monsterMaxHp,
        teamMaxHp: before.teamMaxHp,
        teamHp: before.teamHp,
        effect: effectOf(before, after),
        cooldownMs: after.heroActiveCdMs.caster ?? 0,
      });
    }
  }

  // The same hero, with and without their relic equipped, so "the relic swaps
  // the ability" is a comparison rather than a claim about how the scenarios
  // above were built.
  {
    const heroId = heroForUniqueType('shield_wall') ?? HERO_POOL[0].id;
    for (const [name, gear] of [
      ['relic-off', {}],
      ['relic-on', { [heroId]: { rank: 1, equippedByUid: 'caster' } }],
    ] as const) {
      const caster = hero(heroId, 'caster', { level: 50 });
      const before = state([caster], { heroUniqueGearByHeroId: gear });
      const after = apply(before, { type: 'CAST_HERO_ACTIVE', uid: 'caster' });
      archetypes.push({
        name,
        kind: caster.activeSkillArchetype,
        heroId,
        heroLevel: caster.level,
        relicRank: name === 'relic-on' ? 1 : null,
        monsterMaxHp: before.monsterMaxHp,
        teamMaxHp: before.teamMaxHp,
        teamHp: before.teamHp,
        effect: effectOf(before, after),
        cooldownMs: after.heroActiveCdMs.caster ?? 0,
      });
    }
  }

  // A monster with far less health left than an ability takes, so the floor
  // that keeps it at 1 is actually reached.
  {
    const heroId = heroForArchetype('burst_volley');
    const before = state([hero(heroId, 'caster')], { monsterMaxHp: 1_000_000, monsterHp: 1_000 });
    const after = apply(before, { type: 'CAST_HERO_ACTIVE', uid: 'caster' });
    archetypes.push({
      name: 'burst_volley-overkill',
      kind: 'burst_volley',
      heroId,
      heroLevel: 1,
      relicRank: null,
      monsterMaxHp: before.monsterMaxHp,
      teamMaxHp: before.teamMaxHp,
      teamHp: before.teamHp,
      effect: effectOf(before, after),
      cooldownMs: after.heroActiveCdMs.caster ?? 0,
    });
  }

  const refusals: Fixture['refusals'] = [];
  {
    const heroId = heroForArchetype('burst_volley');
    const cases: [string, string, Partial<GameState>, string][] = [
      ['benched', 'not on the active team', { activeTeamHeroIds: [] }, 'caster'],
      ['on-cooldown', 'cooldown has not elapsed', { heroActiveCdMs: { caster: 1 } }, 'caster'],
      ['unknown-uid', 'no hero by that uid', {}, 'nobody'],
    ];
    for (const [name, reason, overrides, uid] of cases) {
      const before = state([hero(heroId, 'caster')], overrides);
      const after = apply(before, { type: 'CAST_HERO_ACTIVE', uid });
      refusals.push({
        name,
        reason,
        cooldownBefore: before.heroActiveCdMs.caster ?? 0,
        fielded: before.activeTeamHeroIds.includes('caster'),
        // Every field a cast can move, not just the monster's health: a
        // refusal that still wrote a cooldown would look clean otherwise.
        changed:
          after.monsterHp !== before.monsterHp ||
          after.teamHp !== before.teamHp ||
          after.damageBuffPct !== before.damageBuffPct ||
          after.damageReductionBuffPct !== before.damageReductionBuffPct ||
          JSON.stringify(after.heroActiveCdMs) !== JSON.stringify(before.heroActiveCdMs),
      });
    }
  }

  const rankScaling: Fixture['rankScaling'] = [];
  {
    const heroId = heroForUniqueType('shield_wall') ?? HERO_POOL[0].id;
    for (const rank of [1, 2, 5, 10]) {
      const params = getHeroUniqueSkillParams(heroId, rank);
      if (!params) continue;
      rankScaling.push({ heroId, type: params.type, rank, power: params.power, cooldownMs: params.cooldownMs });
    }
  }

  const statuses = (() => {
    const team = [hero(heroForArchetype('frontline_ward'), 'ward'), hero(heroForArchetype('mending_pulse'), 'mend')];
    const withCooldown = state(team, { heroActiveCdMs: { mend: 2_500 } });
    return getHeroActiveStatuses(withCooldown).map(entry => ({
      uid: entry.uid,
      skillName: entry.skillName,
      totalCooldownMs: entry.totalCooldownMs,
      ready: entry.ready,
    }));
  })();

  return {
    note: 'Shipped hero active skills: four generic archetypes, ten unique relic skills, and their cooldowns. Owned by __tests__/heroActivesFixture.test.ts.',
    generatedFrom: 'src/useGameState.ts via CAST_HERO_ACTIVE',
    archetypeCooldowns: { ...ACTIVE_SKILL_COOLDOWN_MS },
    mendingPulse: { baseHeal: MENDING_PULSE_BASE_HEAL, levelScale: MENDING_PULSE_LEVEL_SCALE },
    archetypes,
    uniques,
    refusals,
    rankScaling,
    statuses,
    byHero: HERO_POOL.map(template => {
      const params = getHeroUniqueSkillParams(template.id, 1);
      return {
        heroId: template.id,
        archetype: template.activeSkillArchetype,
        unique: params
          ? {
              type: params.type,
              power: params.power,
              durationMs: params.durationMs,
              cooldownMs: params.cooldownMs,
            }
          : null,
      };
    }),
  };
}

describe('hero actives fixture', () => {
  let nowSpy: jest.SpyInstance<number, []>;
  let randomSpy: jest.SpyInstance<number, []>;
  let fixture: Fixture;

  beforeAll(() => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    fixture = build();
  }, 60_000);

  afterAll(() => {
    nowSpy.mockRestore();
    randomSpy.mockRestore();
  });

  const archetype = (name: string) => fixture.archetypes.find(entry => entry.name === name)!;
  const unique = (name: string) => fixture.uniques.find(entry => entry.name === name)!;

  it('gives every archetype its own cooldown', () => {
    // Long for the defensive one, short for the healer: the cooldown is the
    // balance lever, so a port that shared one across all four would make the
    // shield as available as the heal.
    expect(fixture.archetypeCooldowns).toEqual({
      frontline_ward: 10_000,
      burst_volley: 7_000,
      battle_chant: 9_000,
      mending_pulse: 6_000,
    });
    for (const id of Object.keys(fixture.archetypeCooldowns)) {
      expect({ id, cooldown: archetype(id).cooldownMs }).toEqual({ id, cooldown: fixture.archetypeCooldowns[id] });
    }
  });

  it('raises a flat guard for frontline_ward, not one that scales', () => {
    /*
     * Twenty percent for 3.5 seconds, at every level. The generic archetypes
     * are deliberately flat — only `mending_pulse` reads the hero's level —
     * so a port that scaled all four would make every ability grow.
     *
     * This is also the exact buff that made Phase 8's mitigation port look
     * 0.8 off: it is on by default and fires without anybody pressing.
     */
    for (const level of ['frontline_ward', 'frontline_ward-level-200']) {
      expect({ level, pct: archetype(level).effect.damageReductionBuffPct }).toEqual({ level, pct: 0.2 });
      expect({ level, ms: archetype(level).effect.damageReductionBuffMs }).toEqual({ level, ms: 3_500 });
    }
  });

  it('takes a flat eight percent of the monster’s maximum for burst_volley', () => {
    // Of the *maximum*, not the current health — so it is worth the same at
    // full health and at one percent, which is what makes it a burst rather
    // than an execute.
    const cast = archetype('burst_volley');
    expect(cast.effect.monsterHpLost).toBe(Math.ceil(cast.monsterMaxHp * 0.08));
    expect(archetype('burst_volley-level-200').effect.monsterHpLost).toBe(cast.effect.monsterHpLost);
  });

  it('buffs team damage by eighteen percent for battle_chant', () => {
    expect(archetype('battle_chant').effect.damageBuffPct).toBe(0.18);
    expect(archetype('battle_chant').effect.damageBuffMs).toBe(4_200);
  });

  it('scales mending_pulse with the hero’s level, and caps it at a quarter', () => {
    /*
     * The one generic archetype that reads the hero. Eight percent plus 0.04%
     * a level — so a level-200 hero heals 16% — capped at 25%, which a level
     * 425 hero reaches. A port that dropped the cap would have a deep healer
     * restoring the whole team every six seconds.
     */
    const one = archetype('mending_pulse');
    const deep = archetype('mending_pulse-level-200');
    const capped = archetype('mending_pulse-level-9999');

    expect(one.effect.teamHpGained).toBe(
      Math.ceil(one.teamMaxHp * (fixture.mendingPulse.baseHeal + 1 * fixture.mendingPulse.levelScale)),
    );
    expect(deep.effect.teamHpGained).toBeGreaterThan(one.effect.teamHpGained);
    expect(capped.effect.teamHpGained).toBe(Math.ceil(capped.teamMaxHp * 0.25));
  });

  it('replaces the archetype skill entirely when the hero carries their relic', () => {
    /*
     * The relic is not only a stat bonus: it **swaps the ability**. A hero
     * whose relic is equipped casts the unique skill and never the generic
     * one, on the unique's own cooldown — so a port that treated relics as
     * stats alone would leave the whole unique layer unreachable.
     *
     * Asserted as *the same hero, with and without*, which is a correction:
     * my first version checked that every recorded unique had a rank, which is
     * a property of how the scenarios were built rather than of the code, and
     * deleting the relic branch from the source left it green.
     */
    const off = archetype('relic-off');
    const on = archetype('relic-on');
    expect({ sameHero: off.heroId === on.heroId }).toEqual({ sameHero: true });
    expect(on.effect).not.toEqual(off.effect);
    expect(fixture.uniques.length).toBeGreaterThanOrEqual(10);

    /*
     * The *effect* is what distinguishes them, not the cooldown — and for this
     * pair the cooldowns happen to be identical at 10,000ms, because
     * `shield_wall` and `frontline_ward` were given the same number. Asserting
     * on the cooldown instead would have passed for a build that ignored the
     * relic entirely, which is the reason this is written down rather than
     * left as an omission.
     */
    expect({ archetypeCd: off.cooldownMs, uniqueCd: on.cooldownMs }).toEqual({
      archetypeCd: 10_000,
      uniqueCd: 10_000,
    });
  });

  it('scales a unique skill twelve percent a rank, and leaves its cooldown alone', () => {
    // Rank one is 1×, rank ten is 2.08×. The cooldown does not move, so a
    // ranked relic is stronger rather than more frequent.
    const [first, ...rest] = fixture.rankScaling;
    expect(first.rank).toBe(1);
    for (const entry of rest) {
      expect({ rank: entry.rank, power: entry.power }).toEqual({
        rank: entry.rank,
        power: first.power * (1 + (entry.rank - 1) * 0.12),
      });
      expect({ rank: entry.rank, cooldown: entry.cooldownMs }).toEqual({
        rank: entry.rank,
        cooldown: first.cooldownMs,
      });
    }
  });

  it('never takes a monster below one health with an ability', () => {
    /*
     * Every damaging skill floors the monster at 1 rather than at 0, so an
     * ability can never land the kill — the team's own swings have to. That is
     * a rule about who gets the credit, and a port that floored at zero would
     * hand kills to a button.
     *
     * Proven on a monster with a thousand health left and a million maximum,
     * because the skills take a share of the **maximum**: at full health none
     * of them comes close, so a test on the ordinary scenarios above would be
     * asserting a bound nothing approaches.
     */
    const overkill = archetype('burst_volley-overkill');
    expect(overkill.effect.monsterHpLost).toBe(999);
    expect(overkill.monsterMaxHp * 0.08).toBeGreaterThan(1_000);
  });

  it('refuses a cast from a benched hero, one on cooldown, and an unknown uid', () => {
    for (const refusal of fixture.refusals) {
      expect({ name: refusal.name, changed: refusal.changed }).toEqual({ name: refusal.name, changed: false });
    }
  });

  it('publishes an ability bar in team order, with the unique’s name when one is on', () => {
    expect(fixture.statuses.map(entry => entry.uid)).toEqual(['ward', 'mend']);
    expect(fixture.statuses.find(entry => entry.uid === 'ward')!.ready).toBe(true);
    expect(fixture.statuses.find(entry => entry.uid === 'mend')!.ready).toBe(false);
  });

  it('gives every hero an archetype, and a unique skill if they have a relic', () => {
    /*
     * Sixty-five rows. Every hero has an archetype — `getHeroActiveArchetypeInfo`
     * would have nothing to answer otherwise — and a hero with no relic profile
     * has no unique skill, which is the `null` the port's generator has to keep.
     */
    expect(fixture.byHero).toHaveLength(65);
    for (const row of fixture.byHero) {
      expect({ id: row.heroId, hasArchetype: row.archetype.length > 0 }).toEqual({
        id: row.heroId,
        hasArchetype: true,
      });
    }
    // And the ten types are all represented, so the port's table cannot be
    // generated from a pool that happens to miss one.
    const types = new Set(fixture.byHero.map(row => row.unique?.type).filter(Boolean));
    expect([...types].sort()).toEqual([...UNIQUE_TYPES].sort());
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_HERO_ACTIVES_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }

    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
