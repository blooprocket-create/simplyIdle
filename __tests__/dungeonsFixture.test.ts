import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { HERO_POOL, type PlayerClass } from '../src/gameConfig';
import { DEFAULT_STATE, getDpsBreakdown, reducer, type GameState } from '../src/useGameState';

/**
 * The two dungeons, measured.
 *
 * A rift breach and a treasury raid: one run a day against a daily cap, both
 * resolved from the player's own DPS rather than fought, and both skippable
 * with a raid ticket that pays the previous level's reward outright.
 *
 * Measured rather than read because three things in them are not visible from
 * the code: the entry cap is *counted* by running until the reducer refuses,
 * the damage curve is recorded against a DPS the fixture also records, and the
 * two ticket paths share one pool of tickets under two names.
 *
 * Regenerate deliberately:
 *   UPDATE_DUNGEONS_FIXTURE=1 npx jest __tests__/dungeonsFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'content', '__fixtures__', 'dungeons.json');

/** Pinned so the damage variance and the wipe roll are both exactly mid. */
const MID = 0.5;

function state(over: Partial<GameState> = {}): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    level: 40,
    statsAlloc: { strength: 200, vitality: 0, agility: 0, intelligence: 0, spirit: 0 },
    heroRoster: HERO_POOL.slice(0, 4).map((hero, index) => ({
      ...hero,
      uid: `u${index}`,
      rarity: 'rare' as const,
      level: 30,
      rank: 1,
      teamBoost: hero.baseTeamBoost,
      rebirthStatMult: 1,
    })),
    activeTeamHeroIds: ['u0', 'u1'],
    diamonds: 0,
    heroShards: 0,
    gold: 0,
    totalGold: 0,
    equipmentScrap: 0,
    riftDungeonLevel: 1,
    riftEntriesUsedToday: 0,
    riftEntryDay: null,
    treasureDungeonLevel: 1,
    treasureEntriesUsedToday: 0,
    treasureEntryDay: null,
    riftRaidTickets: 0,
    vipLevel: 0,
    ...over,
  };
}

function pinned<T>(body: () => T, value = MID): T {
  const real = Math.random;
  Math.random = () => value;
  try {
    return body();
  } finally {
    Math.random = real;
  }
}

const RIFT = 'RUN_RIFT_DUNGEON';
const TREASURY = 'RUN_TREASURY_RAID';

const run = (from: GameState, type: string, useRaidTicket = false) =>
  pinned(() => reducer(from, { type, useRaidTicket } as never));

/** What one entry moved. */
function moved(before: GameState, after: GameState) {
  return {
    diamonds: after.diamonds - before.diamonds,
    shards: after.heroShards - before.heroShards,
    gold: after.gold - before.gold,
    scrap: after.equipmentScrap - before.equipmentScrap,
    tickets: after.riftRaidTickets - before.riftRaidTickets,
    riftLevel: after.riftDungeonLevel,
    treasuryLevel: after.treasureDungeonLevel,
    riftEntries: after.riftEntriesUsedToday,
    treasuryEntries: after.treasureEntriesUsedToday,
  };
}

/**
 * The daily cap, **counted** rather than read: run until the reducer stops
 * changing the entry count. A cap read off a constant is a constant recorded.
 */
function countEntries(type: string, vipLevel: number): number {
  let current = state({ vipLevel });
  const used = () => (type === RIFT ? current.riftEntriesUsedToday : current.treasureEntriesUsedToday);
  for (let attempt = 0; attempt < 20; attempt++) {
    const next = run(current, type);
    const before = used();
    current = next;
    if (used() === before) break;
  }
  return used();
}

interface Fixture {
  note: string;
  generatedFrom: string;
  /** The DPS every run below was resolved against. */
  dps: number;
  /** Counted by running until refusal, for each VIP level that changes it. */
  entryCaps: { vipLevel: number; rift: number; treasury: number }[];
  /** One rule, four copies, two of them dead. */
  capDuplication: { copies: string[]; live: string[]; sameStyle: boolean; bothNamesAgree: boolean };
  runs: { name: string; type: string; level: number; result: ReturnType<typeof moved> }[];
  raids: { name: string; type: string; level: number; result: ReturnType<typeof moved> }[];
  refusals: { name: string; moved: boolean }[];
}

/**
 * Both copies of both caps.
 *
 * Deliberately **not** compared as text for the verdict. `useGameState.ts`
 * writes the rule as one ternary chain and `minigamesReducer.ts` as three
 * `if`s, so normalising whitespace and braces still reports a difference — and
 * that difference is style, not behaviour. The Phase 10 tripwire learned this
 * the same way and the lesson is the same: compare what the copies *do*.
 *
 * So `sameStyle` records the textual answer for what it is worth, and
 * `bothNamesAgree` — measured by running both dungeons at every VIP level — is
 * the one the test asserts on.
 */
function capCopies(entryCaps: { rift: number; treasury: number }[]) {
  const files = ['src/useGameState.ts', 'src/reducers/minigamesReducer.ts'];
  const names = ['getRiftDailyEntryCap', 'getTreasuryDailyEntryCap'];
  const bodies: { where: string; body: string; live: boolean }[] = [];
  for (const file of files) {
    const source = readFileSync(join(__dirname, '..', file), 'utf8');
    for (const name of names) {
      const start = source.indexOf(`function ${name}`);
      if (start < 0) continue;
      const end = source.indexOf('\n}', start);
      bodies.push({
        where: `${file}:${name}`,
        // The name is normalised out too: these differ in nothing else, which
        // is the point — two names for one rule, in two files.
        body: source.slice(start, end).replace(name, 'f').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim(),
        // Dead when *its own file* silences it with `void f;`, which is how
        // `useGameState.ts` keeps the unused warning quiet. Checked per file:
        // searching every file for the marker marked all four dead.
        live: !source.includes(`void ${name};`),
      });
    }
  }
  return {
    copies: bodies.map(entry => entry.where),
    live: bodies.filter(entry => entry.live).map(entry => entry.where),
    sameStyle: new Set(bodies.map(entry => entry.body)).size === 1,
    bothNamesAgree: entryCaps.every(row => row.rift === row.treasury),
  };
}

function build(): Fixture {
  const base = state();
  const entryCaps = [0, 1, 2, 3, 4, 5].map(vipLevel => ({
    vipLevel,
    rift: countEntries(RIFT, vipLevel),
    treasury: countEntries(TREASURY, vipLevel),
  }));

  const entry = (name: string, type: string, level: number, over: Partial<GameState> = {}) => {
    const before = state({ riftDungeonLevel: level, treasureDungeonLevel: level, ...over });
    return { name, type, level, result: moved(before, run(before, type)) };
  };

  const raid = (name: string, type: string, level: number) => {
    const before = state({ riftDungeonLevel: level, treasureDungeonLevel: level, riftRaidTickets: 2 });
    return { name, type, level, result: moved(before, run(before, type, true)) };
  };

  const refusal = (name: string, before: GameState, type: string, useRaidTicket = false) => {
    const after = run(before, type, useRaidTicket);
    const change = moved(before, after);
    return {
      name,
      moved:
        change.diamonds !== 0 ||
        change.shards !== 0 ||
        change.gold !== 0 ||
        change.scrap !== 0 ||
        change.tickets !== 0 ||
        change.riftEntries !== before.riftEntriesUsedToday ||
        change.treasuryEntries !== before.treasureEntriesUsedToday,
    };
  };

  const capped = state({ riftEntriesUsedToday: 9, riftEntryDay: Math.floor(Date.now() / 86_400_000) });

  return {
    note: 'The rift breach and the treasury raid, measured through the shipped reducer.',
    generatedFrom: 'src/reducers/minigamesReducer.ts',
    dps: getDpsBreakdown(base).finalDps,
    entryCaps,
    capDuplication: capCopies(entryCaps),
    runs: [
      entry('rift at level one', RIFT, 1),
      entry('rift at level five', RIFT, 5),
      entry('treasury at level one', TREASURY, 1),
      entry('treasury at level five', TREASURY, 5),
    ],
    raids: [raid('rift raid from level three', RIFT, 3), raid('treasury raid from level three', TREASURY, 3)],
    refusals: [
      refusal('rift raid with no ticket', state({ riftDungeonLevel: 3 }), RIFT, true),
      refusal('rift raid at level one', state({ riftRaidTickets: 2 }), RIFT, true),
      refusal('treasury raid with no ticket', state({ treasureDungeonLevel: 3 }), TREASURY, true),
      refusal('rift run past the daily cap', capped, RIFT),
    ],
  };
}

describe('the daily entry cap', () => {
  const fixture = build();

  it('is three, four at VIP two and five at VIP four', () => {
    // Counted by running until the reducer refuses, rather than read off a
    // constant — a cap recorded from its own source proves only that it was
    // copied correctly.
    expect(fixture.entryCaps).toEqual([
      { vipLevel: 0, rift: 3, treasury: 3 },
      { vipLevel: 1, rift: 3, treasury: 3 },
      { vipLevel: 2, rift: 4, treasury: 4 },
      { vipLevel: 3, rift: 4, treasury: 4 },
      { vipLevel: 4, rift: 5, treasury: 5 },
      { vipLevel: 5, rift: 5, treasury: 5 },
    ]);
  });

  it('is the same rule under two names, written out four times', () => {
    /*
     * `getRiftDailyEntryCap` and `getTreasuryDailyEntryCap` have identical
     * bodies, and each exists in both `useGameState.ts` and
     * `minigamesReducer.ts`. The two in `useGameState.ts` are **dead** —
     * silenced with `void f;` so the unused warning stays quiet — so one
     * three-line rule is written four times and called twice.
     *
     * The rewrite has one function and both dungeons use it.
     */
    expect(fixture.capDuplication.copies).toHaveLength(4);
    // Asserted on what they *do*, not on their text: the two files write the
    // rule in different styles (a ternary chain against three `if`s), so a
    // textual comparison reports a difference that is not one.
    expect(fixture.capDuplication.bothNamesAgree).toBe(true);
    expect(fixture.capDuplication.sameStyle).toBe(false);
    expect(fixture.capDuplication.live).toEqual([
      'src/reducers/minigamesReducer.ts:getRiftDailyEntryCap',
      'src/reducers/minigamesReducer.ts:getTreasuryDailyEntryCap',
    ]);
  });
});

describe('a run against the player’s own damage', () => {
  const fixture = build();

  it('resolves from a DPS the fixture records, so the port can use the same one', () => {
    expect(fixture.dps).toBeGreaterThan(0);
  });

  it('pays diamonds and shards for a rift, gold and scrap for a treasury', () => {
    const rift = fixture.runs.filter(row => row.type === 'RUN_RIFT_DUNGEON');
    const treasury = fixture.runs.filter(row => row.type === 'RUN_TREASURY_RAID');
    expect(rift.every(row => row.result.gold === 0 && row.result.scrap === 0)).toBe(true);
    expect(treasury.every(row => row.result.diamonds === 0 && row.result.shards === 0)).toBe(true);
  });

  it('spends one entry whatever the run did', () => {
    expect(
      fixture.runs.map(row => (row.type === 'RUN_RIFT_DUNGEON' ? row.result.riftEntries : row.result.treasuryEntries)),
    ).toEqual([1, 1, 1, 1]);
  });

  it('pays less at a deeper level, because the boss outgrows the damage', () => {
    // The whole shape of the ladder: the reward per level climbs and the
    // *share* of it a run earns falls faster.
    const [shallow, deep] = fixture.runs.filter(row => row.type === 'RUN_RIFT_DUNGEON');
    expect(shallow.result.diamonds).toBeGreaterThan(deep.result.diamonds);
  });
});

describe('a raid ticket', () => {
  const fixture = build();

  it('spends a ticket and no daily entry', () => {
    /*
     * Which is the point of it: a ticket buys a guaranteed haul *on top of*
     * the day's three runs rather than instead of one.
     */
    expect(
      fixture.raids.map(row => ({
        name: row.name,
        tickets: row.result.tickets,
        riftEntries: row.result.riftEntries,
        treasuryEntries: row.result.treasuryEntries,
      })),
    ).toEqual(fixture.raids.map(row => ({ name: row.name, tickets: -1, riftEntries: 0, treasuryEntries: 0 })));
  });

  it('draws on one pool of tickets for both dungeons', () => {
    // `RUN_TREASURY_RAID` guards on `state.riftRaidTickets` — the same field
    // the rift spends. One currency, two doors, and only one of them named
    // after it.
    expect(fixture.raids.map(row => row.result.tickets)).toEqual([-1, -1]);
  });

  it('never advances the level, however good the haul', () => {
    expect(fixture.raids[0].result.riftLevel).toBe(3);
    expect(fixture.raids[1].result.treasuryLevel).toBe(3);
  });
});

describe('what a dungeon refuses', () => {
  const fixture = build();

  it('takes nothing when it cannot deliver', () => {
    expect(fixture.refusals).toEqual([
      { name: 'rift raid with no ticket', moved: false },
      { name: 'rift raid at level one', moved: false },
      { name: 'treasury raid with no ticket', moved: false },
      { name: 'rift run past the daily cap', moved: false },
    ]);
  });
});

describe('the committed fixture', () => {
  it('matches what the rewrite is measured against', () => {
    const fixture = build();
    if (process.env.UPDATE_DUNGEONS_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
