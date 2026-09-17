import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { HERO_POOL, SPARK_EXCHANGE_OPTIONS, type HeroUnit, type PlayerClass, type Rarity } from '../src/gameConfig';
import { DEFAULT_STATE, reducer, type GameState } from '../src/useGameState';

/**
 * Reference behaviour for managing a team: who is fielded, where they stand,
 * the saved loadouts, unlocking a sixth slot, batch levelling and the spark
 * exchange.
 *
 * Driven through the real reducer, because most of what is interesting here is
 * a refusal rather than a formula — a role the class may not hold, a slot the
 * account has not earned, a hero who is already in the line. A fixture of
 * formulas would record none of it.
 *
 * Regenerate deliberately:
 *   UPDATE_TEAM_FIXTURE=1 npx jest __tests__/teamManagementFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'engine', 'roster', '__fixtures__', 'team-management.json');

const FIXED_NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const NEUTRAL_EVENT_ID = 'double_shard_drops';

function weekOfNeutralEvent(): number {
  const { WEEKLY_EVENTS, getWeeklyEventByWeek, weekNumberForTimestamp } =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../src/gameConfig') as typeof import('../src/gameConfig');
  const from = weekNumberForTimestamp(FIXED_NOW);
  for (let offset = 0; offset < WEEKLY_EVENTS.length; offset += 1) {
    if (getWeeklyEventByWeek(from + offset).id === NEUTRAL_EVENT_ID) return from + offset;
  }
  throw new Error(`no week within one rotation maps to ${NEUTRAL_EVENT_ID}`);
}

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

/** Two of each class, so the per-rank cap and the duplicate rule both bite. */
function roster(): HeroUnit[] {
  const classes: PlayerClass[] = ['warrior', 'berserker', 'archer', 'mage', 'monk'];
  const out: HeroUnit[] = [];
  for (const heroClass of classes) {
    const templates = HERO_POOL.filter(entry => entry.heroClass === heroClass).slice(0, 2);
    templates.forEach((template, index) => out.push(hero(template.id, `${heroClass}${index}`)));
  }
  return out;
}

function state(overrides: Partial<GameState>): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    weeklyEventWeek: weekOfNeutralEvent(),
    weeklyEventId: NEUTRAL_EVENT_ID,
    heroRoster: roster(),
    ...overrides,
  };
}

const ALL_UIDS = roster().map(entry => entry.uid);

function apply(from: GameState, action: unknown): GameState {
  return reducer(from, action as never);
}

interface Fixture {
  note: string;
  generatedFrom: string;
  rosterUids: string[];
  slotUnlockRules: { targetSlots: number; requiredWave: number; goldCost: number; shardCost: number }[];
  sparkOptions: { id: string; sparkCost: number; kind: string; minRarity?: string; minTier?: number }[];
  /** Setting a team: what the selection rules keep and drop. */
  selections: { name: string; requested: string[]; slotsUnlocked: number; accepted: string[] }[];
  /** Setting a formation role, and the refusals. */
  formations: { name: string; uid: string; role: string; accepted: boolean; roleAfter: string | null }[];
  /** Saving and loading a loadout. */
  loadouts: { name: string; slot: number; activeBefore: string[]; savedSlot: string[]; activeAfterLoad: string[] }[];
  /** Unlocking the fifth and sixth slots. */
  slotUnlocks: {
    name: string;
    from: number;
    highestWave: number;
    gold: number;
    shards: number;
    slotsAfter: number;
    goldAfter: number;
    shardsAfter: number;
  }[];
  /** Batch levelling, in both of its modes. */
  batchLevels: {
    name: string;
    mode: string;
    gold: number;
    /** The order the caller asked in, which is not the order spending follows. */
    requested: string[];
    levelsAfter: Record<string, number>;
    goldAfter: number;
  }[];
}

function build(): Fixture {
  const slotUnlockRules = [
    { targetSlots: 5, requiredWave: 50, goldCost: 125_000, shardCost: 450 },
    { targetSlots: 6, requiredWave: 100, goldCost: 550_000, shardCost: 1_600 },
  ];

  const selections: Fixture['selections'] = [
    { name: 'plain', requested: ['warrior0', 'mage0', 'archer0'], slotsUnlocked: 4, accepted: [] },
    { name: 'over-slots', requested: ALL_UIDS, slotsUnlocked: 4, accepted: [] },
    { name: 'six-slots', requested: ALL_UIDS, slotsUnlocked: 6, accepted: [] },
    { name: 'duplicate-uid', requested: ['warrior0', 'warrior0', 'mage0'], slotsUnlocked: 4, accepted: [] },
    { name: 'unknown-uid', requested: ['nobody', 'mage0'], slotsUnlocked: 4, accepted: [] },
    { name: 'empty', requested: [], slotsUnlocked: 4, accepted: [] },
  ];
  for (const entry of selections) {
    const after = apply(state({ teamSlotsUnlocked: entry.slotsUnlocked }), {
      type: 'SET_ACTIVE_TEAM',
      heroIds: entry.requested,
    });
    entry.accepted = [...after.activeTeamHeroIds];
  }

  const formations: Fixture['formations'] = [
    { name: 'legal-role', uid: 'monk0', role: 'mid', accepted: false, roleAfter: null },
    { name: 'illegal-for-class', uid: 'mage0', role: 'front', accepted: false, roleAfter: null },
    { name: 'unknown-hero', uid: 'nobody', role: 'front', accepted: false, roleAfter: null },
    { name: 'benched-hero', uid: 'monk1', role: 'mid', accepted: false, roleAfter: null },
  ];
  for (const entry of formations) {
    const base = state({ teamSlotsUnlocked: 4 });
    const withTeam = apply(base, { type: 'SET_ACTIVE_TEAM', heroIds: ['warrior0', 'berserker0', 'monk0', 'mage0'] });
    const after = apply(withTeam, { type: 'SET_HERO_FORMATION', uid: entry.uid, role: entry.role });
    entry.roleAfter = after.heroFormationByUid[entry.uid] ?? null;
    entry.accepted = entry.roleAfter === entry.role;
  }

  const loadouts: Fixture['loadouts'] = [];
  {
    const base = apply(state({ teamSlotsUnlocked: 4 }), {
      type: 'SET_ACTIVE_TEAM',
      heroIds: ['warrior0', 'mage0'],
    });
    const saved = apply(base, { type: 'SAVE_TEAM_LOADOUT', slot: 1 });
    const changed = apply(saved, { type: 'SET_ACTIVE_TEAM', heroIds: ['berserker0', 'archer0'] });
    const loaded = apply(changed, { type: 'LOAD_TEAM_LOADOUT', slot: 1 });
    loadouts.push({
      name: 'save-then-load',
      slot: 1,
      activeBefore: [...base.activeTeamHeroIds],
      savedSlot: [...(saved.teamLoadouts[1] ?? [])],
      activeAfterLoad: [...loaded.activeTeamHeroIds],
    });

    // A slot index out of range is clamped rather than rejected.
    const clamped = apply(base, { type: 'SAVE_TEAM_LOADOUT', slot: 99 });
    loadouts.push({
      name: 'slot-clamped',
      slot: 99,
      activeBefore: [...base.activeTeamHeroIds],
      savedSlot: [...(clamped.teamLoadouts[2] ?? [])],
      activeAfterLoad: [...apply(clamped, { type: 'LOAD_TEAM_LOADOUT', slot: 99 }).activeTeamHeroIds],
    });
  }

  const slotUnlocks: Fixture['slotUnlocks'] = [
    { name: 'too-early', from: 4, highestWave: 49, gold: 1e9, shards: 1e9 },
    { name: 'too-poor', from: 4, highestWave: 100, gold: 1000, shards: 1e9 },
    { name: 'fifth', from: 4, highestWave: 60, gold: 1e9, shards: 1e9 },
    { name: 'sixth-needs-wave-100', from: 5, highestWave: 60, gold: 1e9, shards: 1e9 },
    { name: 'sixth', from: 5, highestWave: 150, gold: 1e9, shards: 1e9 },
  ].map(entry => {
    const after = apply(
      state({
        teamSlotsUnlocked: entry.from,
        highestWaveReached: entry.highestWave,
        gold: entry.gold,
        heroShards: entry.shards,
      }),
      { type: 'UNLOCK_TEAM_SLOT' },
    );
    return {
      ...entry,
      slotsAfter: after.teamSlotsUnlocked,
      goldAfter: after.gold,
      shardsAfter: after.heroShards,
    };
  });

  /*
   * Deliberately *not* roster order — the roster runs warrior, berserker,
   * archer, mage, monk, so asking in warrior/mage/archer order is what makes
   * the divergence below visible.
   */
  const batchTargets = ['warrior0', 'mage0', 'archer0'];
  const batchLevels: Fixture['batchLevels'] = [
    { name: 'one-each', mode: '1', gold: 1_000 },
    { name: 'five-each', mode: '5', gold: 10_000 },
    { name: 'five-each-short', mode: '5', gold: 250 },
    { name: 'max', mode: 'max', gold: 10_000 },
    { name: 'max-broke', mode: 'max', gold: 50 },
  ].map(entry => {
    const after = apply(state({ gold: entry.gold }), {
      type: 'BATCH_LEVEL_HEROES',
      heroIds: batchTargets,
      addLevels: entry.mode === 'max' ? 'max' : Number(entry.mode),
    });
    const levelsAfter: Record<string, number> = {};
    for (const uid of batchTargets) {
      levelsAfter[uid] = after.heroRoster.find(candidate => candidate.uid === uid)!.level;
    }
    return { ...entry, requested: [...batchTargets], levelsAfter, goldAfter: after.gold };
  });

  return {
    note: 'Shipped team management, batch levelling and spark exchange. Owned by __tests__/teamManagementFixture.test.ts.',
    generatedFrom: 'src/reducers/rosterReducer.ts via the exported reducer',
    rosterUids: ALL_UIDS,
    slotUnlockRules,
    sparkOptions: SPARK_EXCHANGE_OPTIONS.map(option => ({
      id: option.id,
      sparkCost: option.sparkCost,
      kind: option.kind,
      ...(option.minRarity ? { minRarity: option.minRarity } : {}),
      ...(option.minTier ? { minTier: option.minTier } : {}),
    })),
    selections,
    formations,
    loadouts,
    slotUnlocks,
    batchLevels,
  };
}

describe('team management fixture', () => {
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

  const selection = (name: string) => fixture.selections.find(entry => entry.name === name)!;

  it('keeps a team within the slots the account has unlocked', () => {
    expect(selection('over-slots').accepted).toHaveLength(4);
    expect(selection('six-slots').accepted).toHaveLength(6);
  });

  it('drops a duplicate and a hero who is not there', () => {
    expect(selection('duplicate-uid').accepted).toEqual(['warrior0', 'mage0']);
    expect(selection('unknown-uid').accepted).toEqual(['mage0']);
  });

  it('accepts an empty team rather than substituting one', () => {
    // A player may field nobody. Filling the gap would be inventing a choice.
    expect(selection('empty').accepted).toEqual([]);
  });

  it('refuses a role the class may not hold', () => {
    const find = (name: string) => fixture.formations.find(entry => entry.name === name)!;
    expect(find('legal-role').accepted).toBe(true);
    // Mages are mid-only, so front is refused and nothing is written.
    expect(find('illegal-for-class')).toEqual({
      name: 'illegal-for-class',
      uid: 'mage0',
      role: 'front',
      accepted: false,
      roleAfter: null,
    });
    expect(find('unknown-hero').accepted).toBe(false);
  });

  it('lets a benched hero take any role their class allows', () => {
    /*
     * The per-rank cap is only checked for a hero who is *on the team* — a
     * benched monk can be set to mid even when both mid places are taken,
     * because the check runs against the active line they are not in.
     */
    expect(fixture.formations.find(entry => entry.name === 'benched-hero')!.accepted).toBe(true);
  });

  it('saves the team that is fielded and restores it', () => {
    const entry = fixture.loadouts.find(candidate => candidate.name === 'save-then-load')!;
    expect(entry.savedSlot).toEqual(entry.activeBefore);
    expect(entry.activeAfterLoad).toEqual(entry.activeBefore);
  });

  it('clamps a loadout slot instead of rejecting it', () => {
    // Slot 99 writes slot 2, and loading 99 reads slot 2 back. A rejection
    // would be safer; the shipped behaviour is a clamp, so it is recorded.
    const entry = fixture.loadouts.find(candidate => candidate.name === 'slot-clamped')!;
    expect(entry.savedSlot).toEqual(entry.activeBefore);
    expect(entry.activeAfterLoad).toEqual(entry.activeBefore);
  });

  it('unlocks one slot at a time, gated on wave and on both currencies', () => {
    const find = (name: string) => fixture.slotUnlocks.find(entry => entry.name === name)!;
    expect(find('too-early').slotsAfter).toBe(4);
    expect(find('too-poor').slotsAfter).toBe(4);
    expect(find('fifth').slotsAfter).toBe(5);
    // The sixth needs wave 100 even though the fifth only needed 50.
    expect(find('sixth-needs-wave-100').slotsAfter).toBe(5);
    expect(find('sixth').slotsAfter).toBe(6);
  });

  it('charges for a slot only when it grants one', () => {
    const find = (name: string) => fixture.slotUnlocks.find(entry => entry.name === name)!;
    for (const name of ['too-early', 'too-poor', 'sixth-needs-wave-100']) {
      const entry = find(name);
      expect({ name, spent: entry.gold - entry.goldAfter }).toEqual({ name, spent: 0 });
    }
    const fifth = find('fifth');
    expect(fifth.gold - fifth.goldAfter).toBe(125_000);
    expect(fifth.shards - fifth.shardsAfter).toBe(450);
  });

  it('levels a batch round-robin, skipping who it cannot afford rather than stopping', () => {
    /*
     * With a number, the shipped loop walks every hero once per step and
     * `continue`s past one it cannot pay for. So a short purse does not stop
     * the batch — it just means the heroes that stay cheap keep levelling
     * while the expensive one stalls. `break` would be the obvious reading and
     * would leave the cheap heroes unlevelled.
     */
    const short = fixture.batchLevels.find(entry => entry.name === 'five-each-short')!;
    const levels = Object.values(short.levelsAfter);
    expect(Math.max(...levels)).toBeGreaterThan(1);
    // Gold ran out partway, so not everyone reached five.
    expect(Math.min(...levels)).toBeLessThan(6);
  });

  it('spends in roster order, not the order the caller asked in', () => {
    /*
     * The shipped loop builds its working set by walking `state.heroRoster`
     * and keeping the selected uids, so the insertion order is the *roster's*
     * — not `action.heroIds`. When gold runs out partway, who got the last
     * level is therefore decided by where a hero sits in the roster and not by
     * where the player put them in the request.
     *
     * A port that iterated `heroIds` would spend the same total and give the
     * levels to different heroes, which is invisible until a player notices
     * the wrong one moved.
     */
    const short = fixture.batchLevels.find(entry => entry.name === 'five-each-short')!;
    expect(short.requested).toEqual(['warrior0', 'mage0', 'archer0']);

    // Roster order puts archer0 ahead of mage0, and that is who got the level.
    const rosterOrder = fixture.rosterUids.filter(uid => short.requested.includes(uid));
    expect(rosterOrder).toEqual(['warrior0', 'archer0', 'mage0']);
    expect(short.levelsAfter.archer0).toBeGreaterThan(short.levelsAfter.mage0);
  });

  it('spends a max batch cheapest-first', () => {
    /*
     * `'max'` repeatedly finds the cheapest next level across the selection
     * and buys that one. It maximises total levels bought rather than levels
     * for any one hero, which is why the three end up within one of each other
     * rather than one of them running away.
     */
    const max = fixture.batchLevels.find(entry => entry.name === 'max')!;
    const levels = Object.values(max.levelsAfter);
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(1);
    expect(Math.min(...levels)).toBeGreaterThan(1);
  });

  it('buys nothing when it cannot afford the first level', () => {
    const broke = fixture.batchLevels.find(entry => entry.name === 'max-broke')!;
    expect(Object.values(broke.levelsAfter)).toEqual([1, 1, 1]);
    expect(broke.goldAfter).toBe(broke.gold);
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_TEAM_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }

    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
