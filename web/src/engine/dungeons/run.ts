import type Decimal from 'break_eternity.js';
import { dailyEntryCap, dungeonById, type Dungeon, type DungeonId, type DungeonReward } from '../../content/dungeons';
import { getMonsterMaxHp } from '../waves/curves';
import { dayNumber } from '../progression/calendar';
import { boundedInt, isRecord } from '../save/guards';
import type { SaveV3 } from '../save/schema';

/**
 * Running a dungeon.
 *
 * Neither of these is a fight: the shipped game resolves both from the
 * player's current DPS against a wall of HP, in one step, and pays a share of
 * the reward for the share of the wall it got through. So the only things this
 * needs are a DPS, a level, a generator and a clock — and all four are
 * arguments, as everywhere else in this engine.
 *
 * The **daily entry** and the **raid ticket** are two different things and the
 * distinction is the whole design: a ticket buys a guaranteed haul at the
 * level *below* the current one, on top of the day's free entries rather than
 * instead of one. Measured, because nothing says so.
 */

/** How long each dungeon is modelled as lasting, in seconds of the player's DPS. */
export const RIFT_SECONDS = 120;
export const TREASURY_SECONDS = 90;

export interface DungeonState {
  level: number;
  entriesUsedToday: number;
  /** The day those entries were used, so a new day resets them. */
  entryDay: number | null;
}

export interface DungeonRequest {
  save: SaveV3;
  id: DungeonId;
  /** The player's damage per second, as the fight computes it. */
  dps: number;
  nowMs: number;
  random: () => number;
}

export interface DungeonOutcome {
  save: SaveV3;
  dungeon: Dungeon;
  /** The level that was attempted, which a raid takes one below the current. */
  level: number;
  /** Nought to one: the share of the wall that fell. */
  progress: number;
  cleared: boolean;
  /** Only a treasury raid can wipe, and only when it did not clear. */
  wiped: boolean;
  reward: DungeonReward;
  /** True when a raid ticket paid for it rather than a daily entry. */
  ticketed: boolean;
}

function stateOf(save: SaveV3, id: DungeonId): DungeonState {
  return id === 'rift' ? save.dungeons.rift : save.dungeons.treasury;
}

function withState(save: SaveV3, id: DungeonId, next: DungeonState): SaveV3 {
  return { ...save, dungeons: { ...save.dungeons, [id]: next } };
}

function paid(save: SaveV3, reward: DungeonReward): SaveV3 {
  return {
    ...save,
    wallet: {
      ...save.wallet,
      diamonds: save.wallet.diamonds + reward.diamonds,
      heroShards: save.wallet.heroShards + reward.shards,
      gold: save.wallet.gold + reward.gold,
      // Lifetime gold climbs with the purse, as every other grant does.
      totalGold: save.wallet.totalGold + reward.gold,
      equipmentScrap: save.wallet.equipmentScrap + reward.scrap,
    },
  };
}

function scaled(reward: DungeonReward, share: number): DungeonReward {
  const cut = (value: number) => Math.max(0, Math.floor(value * share));
  return {
    diamonds: cut(reward.diamonds),
    shards: cut(reward.shards),
    gold: cut(reward.gold),
    scrap: cut(reward.scrap),
  };
}

/** Entries used today, which is nought on a day the account has not played. */
export function entriesUsedToday(state: DungeonState, nowMs: number): number {
  return state.entryDay === dayNumber(nowMs) ? state.entriesUsedToday : 0;
}

export function entriesLeftToday(save: SaveV3, id: DungeonId, nowMs: number): number {
  return Math.max(0, dailyEntryCap(save.vip.level) - entriesUsedToday(stateOf(save, id), nowMs));
}

/** How much damage the wall at this level can take before it falls. */
export function dungeonWallHp(id: DungeonId, level: number): Decimal {
  return id === 'rift'
    ? getMonsterMaxHp(level * 10)
        .mul(6 + level * 0.35)
        .floor()
        .max(1)
    : getMonsterMaxHp(level * 8)
        .mul(2 + level * 0.2)
        .floor()
        .max(1);
}

/** How many waves a treasury vault holds at this level. */
export function vaultWaves(level: number): number {
  return level * 2 + 3;
}

/**
 * Spend a daily entry.
 *
 * Null when the day's entries are gone, which is the one refusal a screen has
 * to draw differently from the rest — the others are "not yet", this one is
 * "come back tomorrow".
 */
export function runDungeon(request: DungeonRequest): DungeonOutcome | null {
  const dungeon = dungeonById(request.id);
  if (dungeon === null) return null;

  const state = stateOf(request.save, request.id);
  const used = entriesUsedToday(state, request.nowMs);
  if (used >= dailyEntryCap(request.save.vip.level)) return null;

  const level = Math.max(1, state.level);
  const dps = Math.max(1, request.dps);
  const resolved =
    request.id === 'rift' ? resolveRift(level, dps, request.random) : resolveTreasury(level, dps, request.random);

  const full = dungeon.fullReward(level);
  const reward = resolved.cleared ? full : scaled(full, resolved.share);

  const next: DungeonState = {
    level: resolved.cleared ? level + 1 : level,
    entriesUsedToday: used + 1,
    entryDay: dayNumber(request.nowMs),
  };

  return {
    dungeon,
    level,
    progress: resolved.progress,
    cleared: resolved.cleared,
    wiped: resolved.wiped,
    reward,
    ticketed: false,
    save: paid(withState(request.save, request.id, next), reward),
  };
}

function resolveRift(level: number, dps: number, random: () => number) {
  // 0.9 to 1.1, so a run is within a tenth of its expected damage either way.
  const variance = 0.9 + random() * 0.2;
  const done = dps * RIFT_SECONDS * variance;
  const share = Math.max(0, Math.min(1, done / dungeonWallHp('rift', level).toNumber()));
  return { progress: share, share, cleared: share >= 1, wiped: false };
}

function resolveTreasury(level: number, dps: number, random: () => number) {
  const waves = vaultWaves(level);
  const variance = 0.88 + random() * 0.24;
  const done = dps * TREASURY_SECONDS * variance;
  const clearedWaves = Math.min(waves, Math.floor(done / dungeonWallHp('treasury', level).toNumber()));
  const cleared = clearedWaves >= waves;
  const haul = clearedWaves / waves;

  /*
   * A wipe costs half the haul, and gets likelier the worse the run went:
   * `1 - haul * 1.5`, so it is certain below a third cleared and impossible
   * above two thirds. The roll is taken **after** the damage roll, which is
   * why the generator is threaded rather than sampled twice independently.
   */
  const wiped = !cleared && random() < Math.max(0, 1 - haul * 1.5);
  return { progress: haul, share: cleared ? 1 : wiped ? haul * 0.5 : haul, cleared, wiped };
}

/**
 * Spend a raid ticket instead of an entry.
 *
 * Pays the level **below** the current one, outright, and leaves the day's
 * free entries untouched — that is what the ticket buys. Null at level one
 * (there is nothing below it) and with no ticket held.
 *
 * Never advances the level: a ticket is a haul, not a clear.
 */
export function raidDungeon(request: Omit<DungeonRequest, 'dps' | 'random'>): DungeonOutcome | null {
  const dungeon = dungeonById(request.id);
  if (dungeon === null) return null;
  if (request.save.dungeons.raidTickets <= 0) return null;

  const level = Math.max(1, stateOf(request.save, request.id).level);
  if (level <= 1) return null;

  const target = level - 1;
  const reward = dungeon.fullReward(target);
  const spent: SaveV3 = {
    ...request.save,
    dungeons: { ...request.save.dungeons, raidTickets: request.save.dungeons.raidTickets - 1 },
  };

  return {
    dungeon,
    level: target,
    progress: 1,
    cleared: true,
    wiped: false,
    reward,
    ticketed: true,
    save: paid(spent, reward),
  };
}

export interface SavedDungeons {
  rift: DungeonState;
  treasury: DungeonState;
  /**
   * One pool for both doors. The shipped state calls it `riftRaidTickets` and
   * `RUN_TREASURY_RAID` spends the same field — one currency, two doors, and
   * only one of them named after it. Named for what it is here.
   */
  raidTickets: number;
}

const MAX_DUNGEON_LEVEL = 1_000_000;
const MAX_TICKETS = 1_000_000;

function readOne(raw: unknown, keys: { level: string; used: string; day: string }): DungeonState {
  const record = isRecord(raw) ? raw : {};
  const day = record[keys.day];
  return {
    level: Math.max(1, boundedInt(record[keys.level], 1, MAX_DUNGEON_LEVEL, 1)),
    entriesUsedToday: boundedInt(record[keys.used], 0, 99, 0),
    // Null is meaningful: an account that has never entered has no entry day,
    // and reading that as day zero makes today's entries look already spent.
    entryDay: typeof day === 'number' && Number.isFinite(day) ? Math.floor(day) : null,
  };
}

/** From a v2 bag (its six flat keys) or a v3 save (our two blocks). */
export function readDungeons(raw: unknown, legacy = false): SavedDungeons {
  if (!isRecord(raw)) return emptyDungeons();
  if (legacy) {
    return {
      rift: readOne(raw, { level: 'riftDungeonLevel', used: 'riftEntriesUsedToday', day: 'riftEntryDay' }),
      treasury: readOne(raw, {
        level: 'treasureDungeonLevel',
        used: 'treasureEntriesUsedToday',
        day: 'treasureEntryDay',
      }),
      raidTickets: boundedInt(raw.riftRaidTickets, 0, MAX_TICKETS, 0),
    };
  }
  return {
    rift: readOne(raw.rift, { level: 'level', used: 'entriesUsedToday', day: 'entryDay' }),
    treasury: readOne(raw.treasury, { level: 'level', used: 'entriesUsedToday', day: 'entryDay' }),
    raidTickets: boundedInt(raw.raidTickets, 0, MAX_TICKETS, 0),
  };
}

export function emptyDungeons(): SavedDungeons {
  const blank = (): DungeonState => ({ level: 1, entriesUsedToday: 0, entryDay: null });
  return { rift: blank(), treasury: blank(), raidTickets: 0 };
}

/** Back out to the seven keys the shipped game reads. */
export function dungeonsToLegacy(dungeons: SavedDungeons): Record<string, unknown> {
  return {
    riftDungeonLevel: dungeons.rift.level,
    riftEntriesUsedToday: dungeons.rift.entriesUsedToday,
    riftEntryDay: dungeons.rift.entryDay,
    treasureDungeonLevel: dungeons.treasury.level,
    treasureEntriesUsedToday: dungeons.treasury.entriesUsedToday,
    treasureEntryDay: dungeons.treasury.entryDay,
    riftRaidTickets: dungeons.raidTickets,
  };
}

/** Grant tickets, which is what the shop's Dungeon Raid Ticket offer buys. */
export function grantRaidTickets(save: SaveV3, count: number): SaveV3 {
  const gained = Math.max(0, Math.floor(count));
  if (gained === 0) return save;
  return {
    ...save,
    dungeons: { ...save.dungeons, raidTickets: Math.min(MAX_TICKETS, save.dungeons.raidTickets + gained) },
  };
}
