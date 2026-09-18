import { describe, expect, it } from 'vitest';
import fixture from '../../content/__fixtures__/dungeons.json';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { dailyEntryCap, dungeonById } from '../../content/dungeons';
import { readSave } from '../save/v3';
import { migrateSave } from '../save/migrate';
import { toLegacyPayload } from '../save/legacyPayload';
import type { SaveV3 } from '../save/schema';
import { DAY_MS } from '../progression/calendar';
import { entriesLeftToday, grantRaidTickets, raidDungeon, readDungeons, runDungeon } from './run';

/**
 * The two dungeons, against what the shipped reducer was measured doing.
 *
 * Every run below uses the DPS the fixture recorded, which is what makes the
 * damage curve checkable without reproducing the whole damage chain.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const OPTIONS = { nowMs: NOW, content: CONTENT };
/** Pinned so the damage variance and the wipe roll are both exactly mid. */
const MID = () => 0.5;

function save(over: Record<string, unknown> = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 40 },
      wallet: { gold: 0, totalGold: 0, diamonds: 0, heroShards: 0, essence: 0, equipmentScrap: 0 },
      ...over,
    },
    OPTIONS,
  );
}

const atLevel = (level: number, over: Record<string, unknown> = {}) =>
  save({ dungeons: { rift: { level }, treasury: { level }, ...over } });

const KEY = { RUN_RIFT_DUNGEON: 'rift', RUN_TREASURY_RAID: 'treasury' } as const;

/** What one entry moved, in the shape the fixture records it. */
function moved(before: SaveV3, after: SaveV3) {
  return {
    diamonds: after.wallet.diamonds - before.wallet.diamonds,
    shards: after.wallet.heroShards - before.wallet.heroShards,
    gold: after.wallet.gold - before.wallet.gold,
    scrap: after.wallet.equipmentScrap - before.wallet.equipmentScrap,
    tickets: after.dungeons.raidTickets - before.dungeons.raidTickets,
    riftLevel: after.dungeons.rift.level,
    treasuryLevel: after.dungeons.treasury.level,
    riftEntries: after.dungeons.rift.entriesUsedToday,
    treasuryEntries: after.dungeons.treasury.entriesUsedToday,
  };
}

describe('the daily entry cap', () => {
  it('is the one the shipped reducer was counted at, for every VIP level', () => {
    expect(fixture.entryCaps.map(row => dailyEntryCap(row.vipLevel))).toEqual(fixture.entryCaps.map(row => row.rift));
  });

  it('is one rule for both dungeons rather than two identical ones', () => {
    // Four copies under two names in the shipped game, two of them dead. Here
    // both doors call the same function, so there is nothing to diverge.
    expect(fixture.entryCaps.every(row => row.rift === row.treasury)).toBe(true);
    // And there is one function to call, so "both doors agree" is a fact about
    // the code rather than a coincidence two tables happen to share.
    expect([0, 1, 2, 3, 4, 5].map(dailyEntryCap)).toEqual([3, 3, 4, 4, 5, 5]);
  });

  it('counts down as entries are spent, and resets the next day', () => {
    let current = atLevel(1);
    for (let entry = 0; entry < 3; entry++) {
      expect(entriesLeftToday(current, 'rift', NOW)).toBe(3 - entry);
      current = runDungeon({ save: current, id: 'rift', dps: fixture.dps, nowMs: NOW, random: MID })!.save;
    }
    expect(entriesLeftToday(current, 'rift', NOW)).toBe(0);
    expect(runDungeon({ save: current, id: 'rift', dps: fixture.dps, nowMs: NOW, random: MID })).toBeNull();
    // A new day, and the entries are back without anything resetting them.
    expect(entriesLeftToday(current, 'rift', NOW + DAY_MS)).toBe(3);
  });

  it('spends the two dungeons\u2019 entries separately', () => {
    /*
     * One cap each, not one between them: a player who ran three rifts still
     * has three vaults. Checked by actually spending them — an earlier version
     * ran a single rift and read `entriesLeftToday`, which reports on a
     * different code path from the gate inside `runDungeon`, so an injection
     * making the gate sum both dungeons passed it.
     */
    let current = atLevel(1);
    const enter = (id: 'rift' | 'treasury') => {
      const outcome = runDungeon({ save: current, id, dps: fixture.dps, nowMs: NOW, random: MID });
      if (outcome !== null) current = outcome.save;
      return outcome !== null;
    };

    // Three each, alternating, so a shared cap of three refuses the fourth.
    const taken = ['rift', 'treasury', 'rift', 'treasury', 'rift', 'treasury'] as const;
    expect(taken.map(enter)).toEqual([true, true, true, true, true, true]);
    expect(current.dungeons.rift.entriesUsedToday).toBe(3);
    expect(current.dungeons.treasury.entriesUsedToday).toBe(3);
    // And the seventh is refused on both, because each cap is now spent.
    expect([enter('rift'), enter('treasury')]).toEqual([false, false]);
  });
});

describe('a run against the recorded damage', () => {
  it('reproduces every run the shipped reducer was measured on', () => {
    expect(
      fixture.runs.map(row => {
        const before = atLevel(row.level);
        const id = KEY[row.type as keyof typeof KEY];
        const after = runDungeon({ save: before, id, dps: fixture.dps, nowMs: NOW, random: MID })!.save;
        return { name: row.name, result: moved(before, after) };
      }),
    ).toEqual(fixture.runs.map(row => ({ name: row.name, result: row.result })));
  });

  it('advances the level on a clear and holds it otherwise', () => {
    const cleared = runDungeon({ save: atLevel(1), id: 'rift', dps: fixture.dps, nowMs: NOW, random: MID })!;
    expect({ cleared: cleared.cleared, level: cleared.save.dungeons.rift.level }).toEqual({ cleared: true, level: 2 });

    const failed = runDungeon({ save: atLevel(5), id: 'rift', dps: fixture.dps, nowMs: NOW, random: MID })!;
    expect({ cleared: failed.cleared, level: failed.save.dungeons.rift.level }).toEqual({ cleared: false, level: 5 });
  });

  it('pays a share of the reward for the share of the wall that fell', () => {
    const partial = runDungeon({ save: atLevel(5), id: 'rift', dps: fixture.dps, nowMs: NOW, random: MID })!;
    const full = dungeonById('rift')!.fullReward(5);
    expect(partial.progress).toBeGreaterThan(0);
    expect(partial.progress).toBeLessThan(1);
    expect(partial.reward.diamonds).toBe(Math.floor(full.diamonds * partial.progress));
  });

  it('costs a treasury wipe half its haul', () => {
    /*
     * The wipe roll is `1 - haul * 1.5`: certain below a third of the vault
     * cleared, impossible above two thirds, and a coin toss between. So the
     * case is **found** rather than picked, over levels *and* damage — at the
     * recorded DPS every level either clears outright or falls so far short
     * that it wipes whatever the roll says, and a guessed case passes while
     * measuring nothing. The first attempt guessed level nine and did exactly
     * that; the second scanned levels alone and found no case at all.
     *
     * Damage is an input here, so scaling it is not contrivance: the rule
     * under test is what a half-cleared vault costs, not what this account
     * can clear.
     */
    const levels = [1, 2, 3, 4, 5, 6, 7, 8];
    const multipliers = [1, 2, 3, 4, 6, 8, 12];
    const contested = levels
      .flatMap(level => multipliers.map(multiplier => ({ level, dps: fixture.dps * multiplier })))
      .find(candidate => {
        const attempt = runDungeon({
          save: atLevel(candidate.level),
          id: 'treasury',
          dps: candidate.dps,
          nowMs: NOW,
          random: () => 0.5,
        });
        return attempt !== null && !attempt.cleared && attempt.progress > 1 / 3 && attempt.progress < 2 / 3;
      });
    expect(contested).toBeDefined();

    /*
     * Two draws, scripted rather than constant: the variance comes first and
     * the wipe roll second. A constant generator moves both at once, so the
     * two runs came out with different hauls and the comparison below measured
     * the damage roll instead of the wipe — which is what a constant `0` and
     * `0.999` did on the first attempt.
     */
    const at = (wipeRoll: number) => {
      const draws = [0.5, wipeRoll];
      let index = 0;
      return runDungeon({
        save: atLevel(contested!.level),
        id: 'treasury',
        dps: contested!.dps,
        nowMs: NOW,
        random: () => draws[Math.min(index++, draws.length - 1)],
      })!;
    };
    const wiped = at(0);
    const survived = at(0.999);
    expect({ wiped: wiped.wiped, survived: survived.wiped }).toEqual({ wiped: true, survived: false });
    // And the wipe costs exactly half: the same haul, half the gold.
    expect(wiped.progress).toBeCloseTo(survived.progress, 10);
    expect(wiped.reward.gold).toBe(Math.floor(survived.reward.gold / 2));
  });

  it('never wipes a run that cleared', () => {
    const cleared = runDungeon({ save: atLevel(1), id: 'treasury', dps: fixture.dps, nowMs: NOW, random: () => 0 })!;
    expect({ cleared: cleared.cleared, wiped: cleared.wiped }).toEqual({ cleared: true, wiped: false });
  });
});

describe('a raid ticket', () => {
  const ticketed = (level: number) => atLevel(level, { raidTickets: 2 });

  it('pays what the shipped raid paid, from the level below', () => {
    expect(
      fixture.raids.map(row => {
        const before = ticketed(row.level);
        const after = raidDungeon({ save: before, id: KEY[row.type as keyof typeof KEY], nowMs: NOW })!.save;
        return { name: row.name, result: moved(before, after) };
      }),
    ).toEqual(fixture.raids.map(row => ({ name: row.name, result: row.result })));
  });

  it('draws on one pool for both doors', () => {
    // `RUN_TREASURY_RAID` guards on `riftRaidTickets` in the shipped game —
    // one currency, two doors. Named for what it is here.
    const once = raidDungeon({ save: ticketed(3), id: 'rift', nowMs: NOW })!.save;
    expect(once.dungeons.raidTickets).toBe(1);
    const twice = raidDungeon({ save: once, id: 'treasury', nowMs: NOW })!.save;
    expect(twice.dungeons.raidTickets).toBe(0);
    expect(raidDungeon({ save: twice, id: 'rift', nowMs: NOW })).toBeNull();
  });

  it('leaves the day’s free entries alone', () => {
    const after = raidDungeon({ save: ticketed(3), id: 'rift', nowMs: NOW })!.save;
    expect(entriesLeftToday(after, 'rift', NOW)).toBe(3);
  });

  it('refuses at level one, where there is nothing below', () => {
    expect(raidDungeon({ save: ticketed(1), id: 'rift', nowMs: NOW })).toBeNull();
    expect(raidDungeon({ save: atLevel(5), id: 'rift', nowMs: NOW })).toBeNull();
  });
});

describe('the stored block', () => {
  it('reads the seven v2 names off a flat bag and our own off a v3 save', () => {
    const fromV2 = readDungeons(
      {
        riftDungeonLevel: 4,
        riftEntriesUsedToday: 2,
        riftEntryDay: 20_000,
        treasureDungeonLevel: 7,
        treasureEntriesUsedToday: 1,
        treasureEntryDay: 20_001,
        riftRaidTickets: 5,
      },
      true,
    );
    expect(fromV2).toEqual({
      rift: { level: 4, entriesUsedToday: 2, entryDay: 20_000 },
      treasury: { level: 7, entriesUsedToday: 1, entryDay: 20_001 },
      raidTickets: 5,
    });
    expect(readDungeons({ rift: { level: 4 }, raidTickets: 5 })).toMatchObject({ raidTickets: 5 });
  });

  it('floors a level at one and keeps a missing entry day null', () => {
    // Null is meaningful: an account that has never entered has no entry day,
    // and reading it as day zero makes today's entries look already spent.
    expect(readDungeons({ rift: { level: 0 } }).rift).toEqual({ level: 1, entriesUsedToday: 0, entryDay: null });
  });

  it('grants tickets, which is what the shop’s offer buys', () => {
    expect(grantRaidTickets(save(), 3).dungeons.raidTickets).toBe(3);
    expect(grantRaidTickets(save(), 0).dungeons.raidTickets).toBe(0);
    expect(grantRaidTickets(save(), -5).dungeons.raidTickets).toBe(0);
  });

  it('round-trips through a migration and back out', () => {
    const migrated = migrateSave({ saveVersion: 2, riftDungeonLevel: 4, riftRaidTickets: 5 }, OPTIONS);
    expect(migrated.legacy.riftRaidTickets).toBeUndefined();
    expect(migrated.dungeons.rift.level).toBe(4);
    const payload = toLegacyPayload(migrated);
    expect({ level: payload.riftDungeonLevel, tickets: payload.riftRaidTickets }).toEqual({ level: 4, tickets: 5 });
  });
});
