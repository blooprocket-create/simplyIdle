import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  HERO_LEVEL_CAP,
  HERO_POOL,
  REBIRTH_BONUS,
  WEEKLY_EVENTS,
  type HeroUnit,
  type PlayerClass,
  type Rarity,
} from '../src/gameConfig';
import { DEFAULT_STATE, advanceCombatStep, type GameState } from '../src/useGameState';

/**
 * Reference values for **what a kill pays**.
 *
 * The rewrite earns gold and EXP through a `RewardRates` of `{ goldMult: 1,
 * expMult: 1 }` whose own comment says the chain "is Phase 10's". This is
 * Phase 10's. It is also the last of the five unported systems by another
 * name: seven of the nine currencies in the save are earned by nothing at all
 * in the port, so a wallet that the equipment forge, the summon pool and the
 * prestige trees all spend from has no income.
 *
 * Measured rather than read off, because every getter in the chain is private
 * to `useGameState.ts`. A kill is driven through the real `advanceCombatStep`
 * with the monster on its last sliver of health, which reaches `killMonster`
 * by the path the game uses and returns after exactly one kill.
 *
 * Two things this pins that an implementation would guess wrong:
 *
 * The gold and EXP chains are **not the same chain**. Gold carries prestige,
 * the meta economy level, the rebirth economy path and the treasury facility;
 * EXP carries none of those and carries the training facility instead. Four
 * factors apply to one and not the other, so a port with a single `rewardMult`
 * would be wrong in both directions at once.
 *
 * A kill levels **every active hero**, every time, capped at 999. Not the
 * player — the player levels off EXP — and not the bench.
 *
 * Regenerate deliberately:
 *   UPDATE_KILL_REWARD_FIXTURE=1 npx jest __tests__/killRewardFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'engine', 'combat', '__fixtures__', 'kill-rewards.json');

/** A wave that is not a boss and not a chest node, so a kill is just a kill. */
const PLAIN_WAVE = 7;
/** `wave % 10 === 0`. */
const BOSS_WAVE = 20;
/** `no_armor_week` — 1.05x gold, 1x EXP. See the note in `state`. */
const PINNED_WEEK = 0;

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    /*
     * Enough to out-damage the sliver below in one step, with no roster — so
     * the hero passive, unique and synergy factors sit at one unless a
     * scenario asks for them.
     *
     * `statsAlloc`, not a bare `strength`: my first version set a top-level
     * field that `GameState` does not have, which TypeScript caught and the
     * test runner did not. It made no difference to a single recorded number,
     * and that is the point worth keeping — nothing in the reward chain reads
     * the player's stats. Damage decides *whether* the monster dies, never
     * what it pays.
     */
    statsAlloc: { strength: 50, vitality: 0, agility: 0, intelligence: 0, spirit: 0 },
    /*
     * Pinned, and this is not housekeeping.
     *
     * `DEFAULT_STATE.weeklyEventWeek` is `weekNumberForTimestamp(Date.now())`
     * — a clock read at module load. Every gold and EXP figure below runs
     * through the current week's multipliers, so a fixture generated from the
     * default would record different numbers depending on the day it was
     * generated, and would drift under the rewrite it is supposed to measure.
     * Week zero is `no_armor_week`: 1.05x gold, 1x EXP.
     */
    weeklyEventWeek: PINNED_WEEK,
    wave: PLAIN_WAVE,
    monsterHp: 0.0001,
    monsterMaxHp: 1_000_000,
    ...overrides,
  };
}

interface Paid {
  gold: number;
  exp: number;
  essence: number;
  bossTears: number;
  seasonPoints: number;
  masteryXp: number;
  heroShards: number;
  diamonds: number;
  equipmentScrap: number;
  burstCharge: number;
  /** How many active heroes gained a level. */
  heroLevelUps: number;
  waveAfter: number;
  playerLevelAfter: number;
  unspentStatPoints: number;
}

function killOnce(from: GameState, random: () => number): Paid {
  const held = Math.random;
  Math.random = random;
  try {
    const after = advanceCombatStep(from, 100);
    const leveled = after.heroRoster.filter(hero => {
      const before = from.heroRoster.find(candidate => candidate.uid === hero.uid);
      return before !== undefined && hero.level > before.level;
    });
    return {
      gold: after.gold - from.gold,
      exp: after.totalExp - from.totalExp,
      essence: after.essence - from.essence,
      bossTears: after.bossTears - from.bossTears,
      seasonPoints: after.seasonPoints - from.seasonPoints,
      masteryXp: (after.classMasteryXp[from.playerClass!] ?? 0) - (from.classMasteryXp[from.playerClass!] ?? 0),
      heroShards: after.heroShards - from.heroShards,
      diamonds: after.diamonds - from.diamonds,
      equipmentScrap: after.equipmentScrap - from.equipmentScrap,
      burstCharge: after.burstCharge - from.burstCharge,
      heroLevelUps: leveled.length,
      waveAfter: after.wave,
      playerLevelAfter: after.level,
      unspentStatPoints: after.unspentStatPoints - from.unspentStatPoints,
    };
  } finally {
    Math.random = held;
  }
}

/** Never rolls a chest node or a drop, so a scenario measures one thing. */
const NO_DROPS = () => 0.99;

interface Fixture {
  note: string;
  generatedFrom: string;
  constants: {
    rebirthBonus: number;
    heroLevelCap: number;
    bossEvery: number;
    chestNodeEvery: number;
    campaignStageCycle: number;
    weeklyEventCount: number;
    /** The week every non-weekly row above was measured on. */
    pinnedWeek: number;
    pinnedWeekEvent: string;
  };
  /** One plain kill, and one boss kill, with everything they move. */
  baseline: { name: string; wave: number; paid: Paid }[];
  /** Each multiplier moved on its own, against the same wave. */
  chain: { name: string; field: string; gold: number; exp: number }[];
  /** The essence a boss pays, which is the only currency with a wave formula. */
  bossEssence: { wave: number; essence: number; bossTears: number }[];
  /** Chest nodes: which waves have one, and what the roll decides. */
  chestNodes: { wave: number; roll: number; bossTears: number }[];
  /** Hero levelling, which is per kill and per active hero. */
  heroLevels: { name: string; active: number; benched: number; startLevel: number; leveled: number }[];
  /** What a kill drops, and how often. */
  drops: {
    /** The two chance curves, at waves that pin both terms and the ceiling. */
    chances: { wave: number; boss: boolean; equipment: number; usable: number }[];
    /**
     * A scripted kill, and every draw it took.
     *
     * The dropped item is recorded **without its id**, which is built from
     * `Date.now()` — recording it would make this fixture drift with the
     * clock, exactly as `weeklyEventWeek` did before it was pinned. The
     * *shape* of the id is asserted instead.
     */
    scripted: {
      name: string;
      wave: number;
      draws: number;
      equipment: { slot: string; rarity: string; itemLevel: number; source: string } | null;
      usables: number;
    }[];
    /** The boundary: the roll is `<=`, so landing exactly on it drops. */
    boundary: { roll: number; dropped: boolean }[];
  };
}

function buildBaseline(): Fixture['baseline'] {
  return [
    { name: 'plain wave', wave: PLAIN_WAVE, paid: killOnce(state({ wave: PLAIN_WAVE }), NO_DROPS) },
    { name: 'boss wave', wave: BOSS_WAVE, paid: killOnce(state({ wave: BOSS_WAVE }), NO_DROPS) },
  ];
}

/**
 * One scenario per factor, each moving a single field off the same baseline.
 *
 * Recorded as gold *and* EXP for every one, including the four that move only
 * gold — those rows are the point. A reader comparing the columns can see that
 * prestige, the meta economy level, the rebirth economy path and the treasury
 * leave EXP exactly where the baseline left it.
 */
function buildChain(): Fixture['chain'] {
  const rows: { name: string; field: string; over: Partial<GameState> }[] = [
    { name: 'baseline', field: '—', over: {} },
    { name: 'prestige', field: 'prestigeCount', over: { prestigeCount: 3 } },
    { name: 'meta economy', field: 'metaEconomyLevel', over: { metaEconomyLevel: 5 } },
    { name: 'rebirth economy', field: 'rebirthEconomyPath', over: { rebirthEconomyPath: 4 } },
    {
      name: 'treasury',
      field: 'guildhallFacilities.treasury',
      over: { guildhallFacilities: { ...DEFAULT_STATE.guildhallFacilities, treasury: { level: 6 } } },
    },
    {
      name: 'training',
      field: 'guildhallFacilities.training',
      over: { guildhallFacilities: { ...DEFAULT_STATE.guildhallFacilities, training: { level: 6 } } },
    },
    { name: 'vip', field: 'vipLevel', over: { vipLevel: 5 } },
    {
      name: 'mastery',
      field: 'classMasteryXp',
      over: { classMasteryXp: { ...DEFAULT_STATE.classMasteryXp, warrior: 2_000 } },
    },
    // Mastery level 125 is the first that reaches the 25% ceiling:
    // `min(0.25, floor(level / 5) * 0.01)` with level = floor(xp / 100).
    {
      name: 'mastery at cap',
      field: 'classMasteryXp',
      over: { classMasteryXp: { ...DEFAULT_STATE.classMasteryXp, warrior: 12_500 } },
    },
    {
      name: 'mastery past cap',
      field: 'classMasteryXp',
      over: { classMasteryXp: { ...DEFAULT_STATE.classMasteryXp, warrior: 2_000_000 } },
    },
  ];

  const chain: Fixture['chain'] = [];
  for (const row of rows) {
    const paid = killOnce(state({ wave: PLAIN_WAVE, ...row.over }), NO_DROPS);
    chain.push({ name: row.name, field: row.field, gold: paid.gold, exp: paid.exp });
  }

  // Every weekly event, because two of them move gold and EXP by different
  // amounts and one moves neither.
  for (const [week, event] of WEEKLY_EVENTS.entries()) {
    const paid = killOnce(state({ wave: PLAIN_WAVE, weeklyEventWeek: week }), NO_DROPS);
    chain.push({ name: `weekly: ${event.id}`, field: 'weeklyEventWeek', gold: paid.gold, exp: paid.exp });
  }
  return chain;
}

function buildBossEssence(): Fixture['bossEssence'] {
  // Ten, thirty and every twentieth after: the formula reads the act *and*
  // `floor(wave / 20)`, so a sweep that only crossed acts would miss half of it.
  return [10, 20, 30, 40, 60, 80, 100, 140, 200].map(wave => {
    const paid = killOnce(state({ wave }), NO_DROPS);
    return { wave, essence: paid.essence, bossTears: paid.bossTears };
  });
}

function buildChestNodes(): Fixture['chestNodes'] {
  /*
   * `((wave - 1) % 20) + 1` is the stage within the campaign chapter, and a
   * chest node is a non-boss stage whose number divides by five. So stages 5
   * and 15 of every chapter — stage 10 and 20 are bosses and take the boss
   * branch instead.
   */
  const rows: Fixture['chestNodes'] = [];
  for (const wave of [4, 5, 15, 24, 25, 35, 45]) {
    for (const roll of [0.49, 0.5]) {
      rows.push({ wave, roll, bossTears: killOnce(state({ wave }), () => roll).bossTears });
    }
  }
  return rows;
}

function buildHeroLevels(): Fixture['heroLevels'] {
  const template = HERO_POOL[0];
  const hero = (uid: string, level: number): HeroUnit => ({
    ...template,
    uid,
    rarity: 'common' as Rarity,
    level,
    rank: 1,
    teamBoost: template.baseTeamBoost,
    rebirthStatMult: 1,
  });

  const rows: Fixture['heroLevels'] = [];
  const cases = [
    { name: 'three fielded', active: 3, benched: 2, startLevel: 1 },
    { name: 'none fielded', active: 0, benched: 3, startLevel: 1 },
    { name: 'at the cap', active: 2, benched: 0, startLevel: HERO_LEVEL_CAP },
    { name: 'one under the cap', active: 2, benched: 0, startLevel: HERO_LEVEL_CAP - 1 },
  ];
  for (const entry of cases) {
    const roster = [
      ...Array.from({ length: entry.active }, (_, i) => hero(`a${i}`, entry.startLevel)),
      ...Array.from({ length: entry.benched }, (_, i) => hero(`b${i}`, entry.startLevel)),
    ];
    const paid = killOnce(
      state({
        wave: PLAIN_WAVE,
        heroRoster: roster,
        activeTeamHeroIds: roster.slice(0, entry.active).map(candidate => candidate.uid),
      }),
      NO_DROPS,
    );
    rows.push({ ...entry, leveled: paid.heroLevelUps });
  }
  return rows;
}

/**
 * The two drop chances, **measured** by bisection.
 *
 * My first version computed them — `min(0.4, 0.1 + wave * 0.003 + ...)` copied
 * into this file — and that is not a measurement. Removing the usable
 * ceiling from the shipped source left every row of it green, because the rows
 * were agreeing with my transcription rather than with the game. Exactly the
 * hole the summon price fell through, one commit later.
 *
 * So each chance is found the way `prestigeFixture` finds a private cost: hand
 * the kill a scripted roll and ask whether it dropped, and bisect on the
 * answer. The comparison is `<=`, so the largest roll that still drops **is**
 * the chance.
 */
function dropChances(): Fixture['drops']['chances'] {
  const dropped = (wave: number, roll: number, usable: boolean) => {
    let draw = 0;
    const held = Math.random;
    // The equipment roll comes first, so measuring the usable chance means
    // refusing the equipment one and reading the second draw.
    Math.random = () => {
      const value = usable ? (draw === 0 ? 0.99 : draw === 1 ? roll : 0.5) : draw === 0 ? roll : 0.5;
      draw += 1;
      return value;
    };
    try {
      const before = state({ wave, level: 60 });
      const after = advanceCombatStep(before, 100);
      return usable
        ? Object.values(after.usableItemCounts).reduce((sum, count) => sum + count, 0) > 0
        : after.inventoryItemIds.length > before.inventoryItemIds.length;
    } finally {
      Math.random = held;
    }
  };

  /** The largest roll that still drops, to a millionth. */
  const threshold = (wave: number, usable: boolean) => {
    let low = 0;
    let high = 1;
    for (let step = 0; step < 40; step += 1) {
      const mid = (low + high) / 2;
      if (dropped(wave, mid, usable)) low = mid;
      else high = mid;
    }
    return Math.round(low * 1e6) / 1e6;
  };

  return [1, 10, 41, 50, 100, 200, 400].map(wave => ({
    wave,
    boss: wave % 10 === 0,
    equipment: threshold(wave, false),
    usable: threshold(wave, true),
  }));
}

/**
 * A kill with the dice scripted, and the number of draws it took.
 *
 * The draw *count* is as much of the record as the item is. A port that rolled
 * the rarity before the chance, or drew a pool index it did not need, would
 * produce a different item from the same seed on the very next kill.
 */
function buildDrops(): Fixture['drops'] {
  const scripted: Fixture['drops']['scripted'] = [];

  /**
   * A kill with the dice handed to it one at a time.
   *
   * The draw *count* is as much of the record as the item is: a port that
   * rolled the rarity before the chance, or drew a pool index it did not need,
   * would produce a different item from the same seed on the very next kill.
   * The sequence returns 0.5 once it runs out, which is above every drop
   * chance and below every ceiling, so a miscount shows up as a missing drop
   * rather than as silence.
   */
  const run = (name: string, wave: number, values: number[]) => {
    let draws = 0;
    const before = state({ wave, level: 60 });
    const held = Math.random;
    Math.random = () => {
      const value = draws < values.length ? values[draws] : 0.5;
      draws += 1;
      return value;
    };
    let after: GameState;
    try {
      after = advanceCombatStep(before, 100);
    } finally {
      Math.random = held;
    }

    const added = after.inventoryItemIds.filter(id => !before.inventoryItemIds.includes(id));
    const item = added.length > 0 ? after.equipmentInventory[added[0]] : null;
    scripted.push({
      name,
      wave,
      draws,
      equipment: item ? { slot: item.slot, rarity: item.rarity, itemLevel: item.itemLevel, source: item.source } : null,
      usables: Object.values(after.usableItemCounts).reduce((sum, count) => sum + count, 0),
    });
  };

  /*
   * Wave 41 rather than 40: not a boss, so the boss terms are out of both
   * chances and each row measures one thing. The equipment chance there is
   * 0.223 and the usable chance 0.1815.
   */
  run('nothing drops', 41, [0.99, 0.99]);
  run('equipment only', 41, [0.05, 0.5, 0.5, 0.99]);
  run('usable only', 41, [0.99, 0.05, 0.5]);
  /*
   * Both, and the shape of this list is the finding: an equipment drop costs
   * **nine** draws — the chance, the rarity, the pool index, and six inside
   * `createEquipmentInstance` — so the usable chance is the *tenth*. A list
   * that put it fourth, as my first version did, tested a kill where the
   * usable roll was whatever the sequence returned after it ran out.
   */
  run('both drop', 41, [0.05, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.05]);

  /*
   * The boss term, as a pair. A roll of 0.24 is above wave 41's 0.223 and
   * below wave 40's 0.34, so the same dice drop on the boss and miss beside
   * it — which is the only way to show the term is read at all.
   */
  run('a boss drops on a roll that misses', 40, [0.24, 0.5, 0.5]);
  run('and the wave beside it does not', 41, [0.24, 0.5, 0.5]);

  /*
   * The comparison is `Math.random() <= chance`, and the only roll that tells
   * `<=` from `<` is one landing *exactly* on it. At wave 41 the equipment
   * chance is 0.1 + 41 * 0.003 = 0.223, which is representable — so a port
   * reading the shipped `<=` as `<` fails this row and nothing else.
   */
  const exact = 0.1 + 41 * 0.003;
  const boundary = [exact, exact - Number.EPSILON, exact + 0.001].map(roll => {
    let first = true;
    const held = Math.random;
    Math.random = () => {
      if (!first) return 0.5;
      first = false;
      return roll;
    };
    try {
      const before = state({ wave: 41, level: 60 });
      const after = advanceCombatStep(before, 100);
      return { roll, dropped: after.inventoryItemIds.length > before.inventoryItemIds.length };
    } finally {
      Math.random = held;
    }
  });

  return { chances: dropChances(), scripted, boundary };
}

function build(): Fixture {
  return {
    note: 'What one kill pays, measured through advanceCombatStep on the shipped reducer.',
    generatedFrom: 'src/useGameState.ts killMonster',
    constants: {
      rebirthBonus: REBIRTH_BONUS,
      heroLevelCap: HERO_LEVEL_CAP,
      bossEvery: 10,
      chestNodeEvery: 5,
      campaignStageCycle: 20,
      weeklyEventCount: WEEKLY_EVENTS.length,
      pinnedWeek: PINNED_WEEK,
      pinnedWeekEvent: WEEKLY_EVENTS[PINNED_WEEK % WEEKLY_EVENTS.length].id,
    },
    baseline: buildBaseline(),
    chain: buildChain(),
    bossEssence: buildBossEssence(),
    chestNodes: buildChestNodes(),
    heroLevels: buildHeroLevels(),
    drops: buildDrops(),
  };
}

describe('what a kill pays', () => {
  const fixture = build();

  it('measures a fixed week rather than whichever one today is', () => {
    /*
     * The pin, asserted, because without it this whole fixture drifts with the
     * calendar: `DEFAULT_STATE.weeklyEventWeek` is `weekNumberForTimestamp(
     * Date.now())`, evaluated when the module loads, and every gold and EXP
     * figure here runs through that week's multipliers.
     *
     * One week in eight the ambient value *is* zero and removing the pin would
     * leave this green. That is the limit of what a test can say about a global
     * read; the other seven days out of eight it catches it, and the note above
     * covers the eighth.
     */
    expect(state().weeklyEventWeek).toBe(PINNED_WEEK);
    expect(fixture.constants.pinnedWeekEvent).toBe('no_armor_week');
  });

  it('pays gold and EXP for a plain kill, and nothing else but season points', () => {
    /*
     * The shape of an ordinary kill, and most of it is zeroes. Every currency
     * but gold has a *condition* — a boss, a chest roll, a drop table — which
     * is why the port earning only gold looked plausible for five phases.
     */
    const plain = fixture.baseline.find(entry => entry.name === 'plain wave')!.paid;
    expect(plain.gold).toBeGreaterThan(0);
    expect(plain.exp).toBeGreaterThan(0);
    expect(plain.seasonPoints).toBe(12);
    expect(plain.masteryXp).toBe(2);
    expect(plain.burstCharge).toBe(1);
    expect(plain.essence).toBe(0);
    expect(plain.bossTears).toBe(0);
    expect(plain.heroShards).toBe(0);
    expect(plain.diamonds).toBe(0);
    expect(plain.waveAfter).toBe(PLAIN_WAVE + 1);
  });

  it('pays a boss four things a plain kill does not', () => {
    const boss = fixture.baseline.find(entry => entry.name === 'boss wave')!.paid;
    expect(boss.essence).toBeGreaterThan(0);
    expect(boss.bossTears).toBe(1);
    // 12 + 80, and mastery 8 rather than 2.
    expect(boss.seasonPoints).toBe(92);
    expect(boss.masteryXp).toBe(8);
    // And the burst meter fills three times as fast on the fight that needs it.
    expect(boss.burstCharge).toBe(3);
  });

  it('runs gold and EXP down different chains', () => {
    /*
     * The finding this fixture exists for. Four factors move gold and leave
     * EXP where it was; one moves EXP and leaves gold. A port with a single
     * reward multiplier would be wrong on five of the nine rows.
     */
    const at = (name: string) => fixture.chain.find(entry => entry.name === name)!;
    const base = at('baseline');

    const goldOnly = ['prestige', 'meta economy', 'rebirth economy', 'treasury'];
    expect(goldOnly.map(name => [name, at(name).gold > base.gold, at(name).exp === base.exp])).toEqual(
      goldOnly.map(name => [name, true, true]),
    );

    expect(at('training').exp).toBeGreaterThan(base.exp);
    expect(at('training').gold).toBe(base.gold);

    // VIP reaches both axes; mastery reaches gold alone, through the economy
    // bonus rather than the damage one.
    expect(['vip', 'mastery at cap'].map(name => at(name).gold > base.gold)).toEqual([true, true]);
    expect(at('vip').exp).toBeGreaterThan(base.exp);

    /*
     * And a small bonus can vanish outright. Mastery level 20 is worth 4%, and
     * at wave 7 a kill pays about 18 gold — so 1.05 × 1.04 rounds to the same
     * 20 that 1.05 alone does. The whole chain is wrapped in **one** `Math.ceil`
     * rather than rounded factor by factor, which is why the loss is a single
     * fractional gold rather than one per factor. A port rounding as it went
     * would drift upward on every kill, and by wave 200 the two would be
     * different games.
     */
    expect(at('mastery').gold).toBe(base.gold);
  });

  it('caps the mastery economy bonus at a quarter', () => {
    /*
     * `1 + min(0.25, floor(level / 5) * 0.01)`. Level 125 is the first to reach
     * the ceiling, so two million mastery XP is worth **exactly** what twelve
     * and a half thousand is.
     *
     * Asserted as an equality rather than as "capped is at least as much as
     * uncapped", which is what I wrote first and which passes happily with the
     * `min` deleted — the whole failure mode being that an uncapped bonus is
     * larger, not smaller.
     */
    const at = (name: string) => fixture.chain.find(entry => entry.name === name)!;
    expect(at('mastery past cap').gold).toBe(at('mastery at cap').gold);
    // And the cap is a ceiling on something real: a mastery below it pays less.
    expect(at('mastery').gold).toBeLessThan(at('mastery at cap').gold);
  });

  it('moves gold and EXP independently across the weekly events', () => {
    /*
     * Compared against each other rather than against the baseline, because
     * **there is no un-evented kill to measure from**. Every week in the table
     * moves something, so a port treating any of them as neutral is wrong by
     * whatever that week pays — and the shipped default is whichever week
     * today falls in, which is why `state` pins one.
     */
    const weeklies = fixture.chain.filter(entry => entry.field === 'weeklyEventWeek');
    expect(weeklies).toHaveLength(WEEKLY_EVENTS.length);

    /*
     * Two axes, and the proof is an *inversion*: a pair of events where one
     * pays more gold and less EXP than the other. `double_gold_week` and
     * `hero_experience_surge` are that pair. A single event multiplier, however
     * it were derived, could not order both columns this way.
     *
     * Asserting on the richest of each column instead would not have done it —
     * `nightmare_assault` tops gold *and* EXP, which is how I first wrote this
     * and why it failed.
     */
    const inverted = weeklies.some(a => weeklies.some(b => a.gold > b.gold && a.exp < b.exp));
    expect(inverted).toBe(true);

    const goldOrder = [...weeklies].sort((a, b) => a.gold - b.gold).map(entry => entry.name);
    const expOrder = [...weeklies].sort((a, b) => a.exp - b.exp).map(entry => entry.name);
    expect(goldOrder).not.toEqual(expOrder);
  });

  it('scales boss essence with the act and the wave, never below two', () => {
    /*
     * `max(2, act.id + floor(wave / 20))` — two terms, and both matter. A port
     * reading only the act would pay the same at wave 20 and wave 39.
     */
    expect(fixture.bossEssence.map(row => [row.wave, row.essence >= 2, row.bossTears])).toEqual(
      fixture.bossEssence.map(row => [row.wave, true, 1]),
    );
    const deep = fixture.bossEssence[fixture.bossEssence.length - 1];
    const shallow = fixture.bossEssence[0];
    expect(deep.essence).toBeGreaterThan(shallow.essence);
  });

  it('drops a tear from a chest node on a roll under a half, and only there', () => {
    /*
     * Stage five and fifteen of each chapter, and the roll is strictly less
     * than 0.5 — `Math.random() < 0.5`. Exactly 0.5 is a miss, which is the
     * boundary a port reading "50% chance" as `<=` would get wrong one time
     * in every two billion and never find.
     */
    const chest = (wave: number, roll: number) =>
      fixture.chestNodes.find(entry => entry.wave === wave && entry.roll === roll)!.bossTears;

    const nodes = [5, 15, 25, 35, 45];
    expect(nodes.map(wave => [wave, chest(wave, 0.49), chest(wave, 0.5)])).toEqual(nodes.map(wave => [wave, 1, 0]));
    // A stage that is not a fifth pays nothing however the roll lands.
    expect(chest(4, 0.49)).toBe(0);
    expect(chest(24, 0.49)).toBe(0);
  });

  it('levels every fielded hero on every kill, and stops at the cap', () => {
    const at = (name: string) => fixture.heroLevels.find(entry => entry.name === name)!;
    expect(at('three fielded').leveled).toBe(3);
    expect(at('none fielded').leveled).toBe(0);
    expect(at('one under the cap').leveled).toBe(2);
    // At 999 they stop, rather than running past it.
    expect(at('at the cap').leveled).toBe(0);
  });

  it('lifts both drop chances with the wave and again on a boss, to a ceiling', () => {
    /*
     * `min(0.4, 0.1 + wave * 0.003 + boss * 0.12)` for equipment and
     * `min(0.32, 0.12 + wave * 0.0015 + boss * 0.08)` for usables. Four terms
     * each, and the rows are chosen so a port with any one of them wrong still
     * matches on some of them — which is why the ceiling rows are here at all.
     */
    const at = (wave: number) => fixture.drops.chances.find(row => row.wave === wave)!;
    expect(at(1).equipment).toBeCloseTo(0.103, 12);
    expect(at(1).usable).toBeCloseTo(0.1215, 12);

    // The boss term, and then the ceiling swallowing everything past it.
    expect(at(10).equipment).toBeGreaterThan(at(1).equipment);
    expect(at(100).equipment).toBe(0.4);
    expect(at(400).equipment).toBe(at(100).equipment);
    expect(at(100).usable).toBe(0.32);
    expect(at(400).usable).toBe(at(100).usable);
  });

  it('spends nine draws on an equipment drop and one on refusing it', () => {
    /*
     * The draw count is as much of the record as the item: a port that rolled
     * the rarity before the chance, or drew a pool index it did not need,
     * produces a different item from the same seed on the very next kill.
     *
     * A kill that drops nothing costs **two** — one chance roll each. An
     * equipment drop costs nine, so the usable chance is the tenth draw and
     * not the fourth.
     */
    const at = (name: string) => fixture.drops.scripted.find(row => row.name === name)!;
    expect(at('nothing drops').draws).toBe(2);
    expect(at('equipment only').draws).toBe(10);
    expect(at('usable only').draws).toBe(3);
    expect(at('both drop').draws).toBe(11);

    expect(at('equipment only').equipment).not.toBeNull();
    expect(at('equipment only').equipment!.source).toBe('drop');
    // Rolled against the player's level, not the item's row.
    expect(at('equipment only').equipment!.itemLevel).toBe(60);
    expect(at('usable only').usables).toBe(1);
    expect(at('both drop').usables).toBe(1);
  });

  it('reads the boss term, shown by a roll that lands on one side of it', () => {
    // 0.24 is above wave 41's 0.223 and below wave 40's 0.34. Same dice.
    expect(
      fixture.drops.scripted.find(row => row.name === 'a boss drops on a roll that misses')!.equipment,
    ).not.toBeNull();
    expect(fixture.drops.scripted.find(row => row.name === 'and the wave beside it does not')!.equipment).toBeNull();
  });

  it('drops on a roll landing exactly on the chance', () => {
    /*
     * `Math.random() <= chance`, and the only roll that tells `<=` from `<` is
     * one landing exactly on it. Every other drop and refusal in this game
     * reads `<`; this one does not, and a port that tidied it would be wrong
     * on a boundary nobody would ever reproduce by playing.
     */
    const [exact, justUnder, over] = fixture.drops.boundary;
    expect(exact.dropped).toBe(true);
    expect(justUnder.dropped).toBe(true);
    expect(over.dropped).toBe(false);
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_KILL_REWARD_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
