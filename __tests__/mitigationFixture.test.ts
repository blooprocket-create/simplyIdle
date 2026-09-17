import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  HERO_POOL,
  WEEKLY_EVENTS,
  getMonsterAffixes,
  getMonsterDamage,
  getMonsterMaxHp,
  getWeeklyEventByWeek,
  rarityConfig,
  weekNumberForTimestamp,
  type HeroUnit,
  type PlayerClass,
  type Rarity,
} from '../src/gameConfig';
import { DEFAULT_STATE, advanceCombatStep, computeStats, type GameState } from '../src/useGameState';

/**
 * Reference values for **mitigation** — everything between a monster's damage
 * and the health the team actually loses.
 *
 * The rewrite has none of it. `demoSimulationOptions` hands the loop a flat
 * `incomingMult: 1`, so the team takes the monster's damage raw: no defence,
 * no formation bonus, no synergy, no hero passives, no relics. The shipped
 * chain reduces by up to **80%** from defence alone, so the port's team takes
 * as much as five times what it should — the fight is harder than the game,
 * not easier, and the wall arrives early.
 *
 * Nothing anchors that chain today. The other multiplier fixtures all read
 * through `getDpsBreakdown`, which reports only damage — the synergy fixture's
 * own note says "Iron Mandala moves incoming… none of which the breakdown
 * reports". So this measures it the way `offlineProgressFixture` measures the
 * same scalar: step the real combat loop by a slice with no kill in it and
 * divide the health lost by what the monster would have dealt unmitigated.
 *
 * **Hero active skills are switched off in every scenario**, and the shipped
 * default is on. They are a separate system that no phase has ported — see the
 * note on `autoCastHeroActivesEnabled` below — and leaving them running folds
 * one system into the other with no way to tell them apart. It is not a small
 * fold: a `frontline_ward` hero auto-casts a damage-reduction buff, so a single
 * warrior on the team multiplies incoming damage by **0.8**.
 *
 * Regenerate deliberately:
 *   UPDATE_MITIGATION_FIXTURE=1 npx jest __tests__/mitigationFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'engine', 'combat', '__fixtures__', 'mitigation.json');

/** Same instant and same neutral week as the offline fixture; see its note. */
const FIXED_NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const NEUTRAL_EVENT_ID = 'double_shard_drops';

const FIXED_WEEK = (() => {
  const from = weekNumberForTimestamp(FIXED_NOW);
  for (let offset = 0; offset < WEEKLY_EVENTS.length; offset += 1) {
    if (getWeeklyEventByWeek(from + offset).id === NEUTRAL_EVENT_ID) return from + offset;
  }
  throw new Error(`no week within one rotation of FIXED_NOW maps to ${NEUTRAL_EVENT_ID}`);
})();

const NOTHING = { strength: 0, vitality: 0, agility: 0, intelligence: 0, spirit: 0 };

interface HeroSpec {
  templateId: string;
  uid: string;
  level: number;
  rank: number;
  rarity: Rarity;
}

function unit(spec: HeroSpec): HeroUnit {
  const template = HERO_POOL.find(hero => hero.id === spec.templateId);
  if (!template) throw new Error(`unknown hero ${spec.templateId}`);
  return {
    ...template,
    uid: spec.uid,
    rarity: spec.rarity,
    level: spec.level,
    rank: spec.rank,
    teamBoost: template.baseTeamBoost * rarityConfig(spec.rarity).boostMultiplier,
    rebirthStatMult: 1,
  };
}

interface Scenario {
  name: string;
  note: string;
  playerClass: PlayerClass;
  level: number;
  alloc: typeof NOTHING;
  wave: number;
  heroes: HeroSpec[];
  metaSurvivalLevel?: number;
  rebirthSurvivalPath?: number;
  tacticsLevel?: number;
  classPassiveUnlocked?: boolean;
  relicRank?: number;
  damageReductionBuffPct?: number;
}

/**
 * One scenario per part of the chain, because the fixture records a single
 * composed number and a sample where a factor sat at its identity would let a
 * port drop it.
 */
const SCENARIOS: Scenario[] = [
  {
    name: 'bare',
    note: 'A level-one warrior alone: defence from their own stats and nothing else.',
    playerClass: 'warrior',
    level: 1,
    alloc: NOTHING,
    wave: 3,
    heroes: [],
  },
  {
    name: 'one-hero',
    note: 'A single fielded hero, which adds their vitality and spirit and turns formation on.',
    playerClass: 'warrior',
    level: 20,
    alloc: NOTHING,
    wave: 12,
    heroes: [{ templateId: 'h1', uid: 'u0', level: 30, rank: 2, rarity: 'rare' }],
  },
  {
    name: 'full-team',
    note: 'Six across classes, so synergy and every formation rank are live.',
    playerClass: 'mage',
    level: 60,
    alloc: { ...NOTHING, vitality: 40, spirit: 20 },
    wave: 45,
    heroes: [
      { templateId: 'h1', uid: 'u0', level: 60, rank: 3, rarity: 'epic' },
      { templateId: 'h3', uid: 'u1', level: 55, rank: 2, rarity: 'rare' },
      { templateId: 'h5', uid: 'u2', level: 70, rank: 4, rarity: 'legendary' },
      { templateId: 'h7', uid: 'u3', level: 50, rank: 1, rarity: 'uncommon' },
      { templateId: 'h9', uid: 'u4', level: 65, rank: 3, rarity: 'epic' },
      { templateId: 'h6', uid: 'u5', level: 58, rank: 2, rarity: 'rare' },
    ],
  },
  {
    name: 'deep-survival',
    note: 'Meta survival, the rebirth path and the tactics facility, which scale defence rather than reduce damage.',
    playerClass: 'warrior',
    level: 200,
    alloc: { ...NOTHING, vitality: 300 },
    wave: 140,
    heroes: [
      { templateId: 'h1', uid: 'u0', level: 200, rank: 6, rarity: 'legendary' },
      { templateId: 'h9', uid: 'u1', level: 190, rank: 5, rarity: 'epic' },
    ],
    metaSurvivalLevel: 20,
    rebirthSurvivalPath: 8,
    tacticsLevel: 15,
    classPassiveUnlocked: true,
  },
  {
    name: 'relics-and-buff',
    note: 'Unique relics on fielded heroes and an active damage-reduction buff.',
    playerClass: 'monk',
    level: 80,
    alloc: { ...NOTHING, vitality: 60 },
    wave: 66,
    heroes: [
      { templateId: 'h9', uid: 'u0', level: 90, rank: 4, rarity: 'legendary' },
      { templateId: 'h10', uid: 'u1', level: 85, rank: 3, rarity: 'epic' },
    ],
    relicRank: 8,
    damageReductionBuffPct: 0.25,
  },
];

function stateFor(scenario: Scenario): GameState {
  const roster = scenario.heroes.map(unit);
  const base: GameState = {
    ...DEFAULT_STATE,
    skills: new Set(DEFAULT_STATE.skills),
    achievements: new Set(DEFAULT_STATE.achievements),
    playerName: 'Ref',
    playerClass: scenario.playerClass,
    characterCreated: true,
    level: scenario.level,
    statsAlloc: scenario.alloc,
    wave: scenario.wave,
    heroRoster: roster,
    activeTeamHeroIds: roster.map(hero => hero.uid),
    heroFormationByUid: {},
    heroUniqueGearByHeroId: scenario.relicRank
      ? (Object.fromEntries(
          roster.map(hero => [hero.id, { rank: scenario.relicRank, equippedByUid: hero.uid }]),
        ) as GameState['heroUniqueGearByHeroId'])
      : {},
    metaSurvivalLevel: scenario.metaSurvivalLevel ?? 0,
    rebirthSurvivalPath: scenario.rebirthSurvivalPath ?? 0,
    permanentUnlocks: (scenario.classPassiveUnlocked ? ['class_passive'] : []) as GameState['permanentUnlocks'],
    guildhallFacilities: {
      ...DEFAULT_STATE.guildhallFacilities,
      tactics: { ...DEFAULT_STATE.guildhallFacilities.tactics, level: scenario.tacticsLevel ?? 0 },
    },
    damageReductionBuffPct: scenario.damageReductionBuffPct ?? 0,
    damageReductionBuffMs: scenario.damageReductionBuffPct ? 60_000 : 0,
    /*
     * **Off, and the shipped default is on.**
     *
     * This measures the *mitigation chain*. Hero active skills are a separate
     * system and an unported one — `applyHeroActiveSkill`, four archetypes and
     * their cooldowns, listed under Phase 10 — and leaving them running would
     * fold one into the other with no way to tell them apart afterwards.
     *
     * It is not a small fold. Every `frontline_ward` hero auto-casts a damage
     * reduction buff, so a single warrior on the team silently multiplies
     * incoming damage by **0.8** — which is exactly how this was found: the
     * port matched `bare` and every scenario with a warrior in it was off by
     * that factor and no other.
     */
    autoCastHeroActivesEnabled: false,
    weeklyEventWeek: FIXED_WEEK,
    weeklyEventId: getWeeklyEventByWeek(FIXED_WEEK).id,
  };

  return settle({
    ...base,
    monsterHp: getMonsterMaxHp(scenario.wave),
    monsterMaxHp: getMonsterMaxHp(scenario.wave),
  });
}

/**
 * Give a hand-built state its real derived HP.
 *
 * `getTeamMaxHp` is private and its result is only written onto the state when
 * a round ends, so a state assembled by spreading `DEFAULT_STATE` carries the
 * starting **100** whatever roster it holds — and `computeStats` does not
 * report it either. A team measured against that dies inside the slice being
 * measured, which is not a mitigation reading at all.
 *
 * So each scenario is fought until one round resolves, which is the only way to
 * make the engine publish the number. Active heroes start a level low so the
 * level that resolving kill grants lands them exactly where the scenario says.
 * The same helper, and the same reasoning, as `offlineProgressFixture`'s.
 */
function settle(target: GameState): GameState {
  const activeUids = new Set(target.activeTeamHeroIds);
  const lowered: GameState = {
    ...target,
    heroRoster: target.heroRoster.map(entry =>
      activeUids.has(entry.uid) ? { ...entry, level: Math.max(1, entry.level - 1) } : entry,
    ),
  };

  let working = lowered;
  let resolved = false;
  for (let step = 0; step < 5_000; step += 1) {
    working = advanceCombatStep(working, 100);
    // A kill or a defeat both end a round, and both publish the derived pair.
    if (working.totalKills > lowered.totalKills || working.wave < lowered.wave) {
      resolved = true;
      break;
    }
  }
  if (!resolved) throw new Error('scenario never resolved a round, so its team HP is still the default');

  return { ...target, teamHp: working.teamMaxHp, teamMaxHp: working.teamMaxHp };
}

function affixDamageMult(wave: number): number {
  return getMonsterAffixes(wave).reduce((total, entry) => total * entry.enemyDamageMultiplier, 1);
}

/**
 * The composed mitigation multiplier, measured off the real combat step.
 *
 * The slice has to contain no kill, or the heal-to-full at the end of a round
 * reads as negative damage. It shrinks until the round is still in progress,
 * exactly as the offline fixture's does.
 */
function measure(state: GameState): { incomingMult: number; sliceMs: number } {
  let sliceMs = 10;
  let stepped = advanceCombatStep(state, sliceMs);
  let clean = stepped.totalKills === state.totalKills && stepped.wave === state.wave;
  for (let attempt = 0; attempt < 12 && !clean; attempt += 1) {
    sliceMs /= 10;
    stepped = advanceCombatStep(state, sliceMs);
    clean = stepped.totalKills === state.totalKills && stepped.wave === state.wave;
  }
  if (!clean) throw new Error('no slice short enough to measure without a kill');

  const lostPerSecond = ((state.teamHp - stepped.teamHp) * 1000) / sliceMs;
  const unmitigated = getMonsterDamage(state.wave) * affixDamageMult(state.wave);
  return { incomingMult: lostPerSecond / unmitigated, sliceMs };
}

interface Row extends Scenario {
  /** What `computeStats` reports, which is the whole defence stack. */
  teamDefense: number;
  /** `defense / (defense + 100)`, capped at 0.8, as the reducer computes it. */
  damageReduction: number;
  /** The whole chain: what fraction of a monster's damage actually lands. */
  incomingMult: number;
  teamMaxHp: number;
  sliceMs: number;
}

interface Fixture {
  note: string;
  generatedFrom: string;
  nowMs: number;
  weeklyEventId: string;
  rows: Row[];
}

function build(): Fixture {
  const rows = SCENARIOS.map((scenario): Row => {
    const state = stateFor(scenario);
    const stats = computeStats(state);
    const defense = stats.teamDefense;
    return {
      ...scenario,
      teamDefense: defense,
      damageReduction: Math.min(0.8, defense / (defense + 100)),
      teamMaxHp: state.teamMaxHp,
      ...measure(state),
    };
  });

  return {
    note: 'Mitigation from the shipped implementation, measured off advanceCombatStep. Owned by __tests__/mitigationFixture.test.ts.',
    generatedFrom: 'src/useGameState.ts advanceCombatStep and computeStats',
    nowMs: FIXED_NOW,
    weeklyEventId: NEUTRAL_EVENT_ID,
    rows,
  };
}

describe('mitigation fixture', () => {
  let nowSpy: jest.SpyInstance;
  beforeAll(() => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
  });
  afterAll(() => {
    nowSpy.mockRestore();
  });

  const fixture = build();

  it('measures a week with no damage modifier of its own', () => {
    // A week that scaled enemy damage would be folded into every measurement
    // and read as mitigation. The offline fixture pins the same one.
    const event = getWeeklyEventByWeek(FIXED_WEEK);
    expect(event.id).toBe(NEUTRAL_EVENT_ID);
    expect(event.enemyDamageMultiplier).toBe(1);
  });

  it('measures teams with their real health, not the default hundred', () => {
    /*
     * `DEFAULT_STATE.teamHp` is 100, and a team on that dies inside the slice
     * being measured — which reads as a wipe rather than as mitigation. Every
     * scenario here should be far above it.
     */
    for (const row of fixture.rows) {
      expect({ name: row.name, real: row.teamMaxHp > 100 }).toEqual({ name: row.name, real: true });
    }
  });

  it('measures a slice with no kill and no wipe in it', () => {
    // The whole measurement rests on that: a kill heals the team to full and
    // reads as negative damage, and a wipe resets it. The slice shrinks until
    // neither has happened, so a scenario needing a tiny one is a scenario
    // where something is wrong.
    for (const row of fixture.rows) {
      expect({ name: row.name, slice: row.sliceMs }).toEqual({ name: row.name, slice: 10 });
    }
  });

  it('records a chain that actually reduces damage', () => {
    /*
     * The headline. The rewrite passes `incomingMult: 1` — the team taking a
     * monster's damage raw — and every scenario here lands well under that.
     * A fixture whose rows all read 1 would be recording the bug.
     */
    // Reported as a map, because jest's `expect` takes no message argument and
    // a bare number in a failure would not say which scenario produced it.
    const reduced = Object.fromEntries(
      fixture.rows.map(row => [row.name, row.incomingMult > 0 && row.incomingMult < 1]),
    );
    expect(reduced).toEqual(Object.fromEntries(fixture.rows.map(row => [row.name, true])));
  });

  it('separates the scenarios rather than measuring one thing five times', () => {
    // Each scenario turns on a different part, so no two should agree.
    const values = fixture.rows.map(row => row.incomingMult);
    expect(new Set(values.map(value => value.toFixed(9))).size).toBe(values.length);
  });

  it('measures the chain with hero actives out of it', () => {
    /*
     * The guard on that decision. If auto-cast came back on, a warrior's
     * `frontline_ward` would fold a 0.8 buff into the measurement and the
     * rewrite would be held to a system it does not have — so a scenario with
     * a warrior on the team must read the same as one without a caster.
     *
     * Checked by construction rather than by value: every state this fixture
     * measures has the flag off.
     */
    for (const scenario of SCENARIOS) {
      expect(stateFor(scenario).autoCastHeroActivesEnabled).toBe(false);
    }
  });

  it('caps the defence reduction at four fifths', () => {
    // `Math.min(0.8, …)`. The deep scenario is meant to reach it; without a
    // sample that does, a port that dropped the cap would pass.
    const deep = fixture.rows.find(row => row.name === 'deep-survival')!;
    expect(deep.damageReduction).toBe(0.8);
    expect(fixture.rows.some(row => row.damageReduction < 0.8)).toBe(true);
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_MITIGATION_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }

    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
