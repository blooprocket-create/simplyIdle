/**
 * The two dungeons.
 *
 * A rift breach pays diamonds and shards; a treasury raid pays gold and
 * scrap. Otherwise they are the same shape — a daily entry against a level
 * that advances when you clear it — and the shipped game says so by giving
 * them the same three-line entry cap under two names, in two files, twice.
 * Here it is one rule and one table.
 *
 * Every number measured in `__tests__/dungeonsFixture.test.ts`.
 */

export type DungeonId = 'rift' | 'treasury';

export interface DungeonReward {
  diamonds: number;
  shards: number;
  gold: number;
  scrap: number;
}

export interface Dungeon {
  id: DungeonId;
  name: string;
  /** What a player is buying into, in their words. */
  detail: string;
  /** The reward for clearing this level outright. */
  fullReward: (level: number) => DungeonReward;
}

const NOTHING: DungeonReward = { diamonds: 0, shards: 0, gold: 0, scrap: 0 };

export const DUNGEONS: readonly Dungeon[] = [
  {
    id: 'rift',
    name: 'Rift Breach',
    detail: 'One boss, two minutes of your damage. Diamonds and shards.',
    fullReward: level => ({
      ...NOTHING,
      diamonds: Math.max(10, Math.floor(12 + level * 5.5)),
      shards: Math.max(80, Math.floor(140 + level * 130)),
    }),
  },
  {
    id: 'treasury',
    name: 'Treasury Raid',
    detail: 'A vault of waves, ninety seconds. Gold and scrap — and a wipe costs half the haul.',
    fullReward: level => ({
      ...NOTHING,
      gold: Math.max(500, Math.floor(800 + level * 600)),
      scrap: Math.max(2, Math.floor(3 + level * 1.5)),
    }),
  },
];

export function dungeonById(id: string): Dungeon | null {
  return DUNGEONS.find(dungeon => dungeon.id === id) ?? null;
}

/**
 * How many free entries a day, by VIP level.
 *
 * **One function, not four.** The shipped game writes this rule twice under
 * two names — `getRiftDailyEntryCap` and `getTreasuryDailyEntryCap`, identical
 * bodies — in each of two files, and the two in `useGameState.ts` are dead,
 * silenced with `void f;`. Measured by counting entries until the reducer
 * refuses, at every VIP level, and both names give the same answer.
 */
export const BASE_DAILY_ENTRIES = 3;
export const VIP_ENTRY_STEPS: readonly { atVip: number; entries: number }[] = [
  { atVip: 4, entries: 5 },
  { atVip: 2, entries: 4 },
];

export function dailyEntryCap(vipLevel: number): number {
  for (const step of VIP_ENTRY_STEPS) {
    if (vipLevel >= step.atVip) return step.entries;
  }
  return BASE_DAILY_ENTRIES;
}
