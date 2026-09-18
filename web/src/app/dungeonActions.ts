import { DUNGEONS, dailyEntryCap, type Dungeon, type DungeonId } from '../content/dungeons';
import {
  entriesLeftToday,
  raidDungeon,
  runDungeon,
  type DungeonOutcome,
  type DungeonState,
} from '../engine/dungeons/run';
import type { SaveV3 } from '../engine/save/schema';

/**
 * The dungeon verbs, with the player's damage supplied.
 *
 * Neither dungeon is a fight: both are resolved from the player's DPS against
 * a wall of HP, in one step. So the shell hands over the same number the
 * running fight is built on rather than either of them deriving one — the
 * alternative is a dungeon that disagrees with the fight about how hard the
 * player hits, which is the kind of divergence nobody notices until the
 * numbers stop making sense.
 */

export interface DungeonAttempt {
  save: SaveV3;
  /** The team's damage per second, as the fight computes it. */
  dps: number;
  nowMs: number;
  random: () => number;
}

export interface DungeonRow {
  dungeon: Dungeon;
  level: number;
  entriesLeft: number;
  entryCap: number;
  /** Whether a free entry is available right now. */
  canRun: boolean;
  /** Whether a ticket would be spent — needs one held, and a level to drop to. */
  canRaid: boolean;
  /** The level a ticket would raid, or null when there is none below. */
  raidLevel: number | null;
}

export function dungeonRows(save: SaveV3, nowMs: number): DungeonRow[] {
  const cap = dailyEntryCap(save.vip.level);
  return DUNGEONS.map(dungeon => {
    const state: DungeonState = dungeon.id === 'rift' ? save.dungeons.rift : save.dungeons.treasury;
    const left = entriesLeftToday(save, dungeon.id, nowMs);
    const level = Math.max(1, state.level);
    return {
      dungeon,
      level,
      entriesLeft: left,
      entryCap: cap,
      canRun: left > 0,
      canRaid: save.dungeons.raidTickets > 0 && level > 1,
      raidLevel: level > 1 ? level - 1 : null,
    };
  });
}

export function run(attempt: DungeonAttempt, id: DungeonId): DungeonOutcome | null {
  return runDungeon({ save: attempt.save, id, dps: attempt.dps, nowMs: attempt.nowMs, random: attempt.random });
}

export function raid(save: SaveV3, id: DungeonId, nowMs: number): DungeonOutcome | null {
  return raidDungeon({ save, id, nowMs });
}

/** How many entries are left across both, for a badge that says so. */
export function entriesLeft(save: SaveV3, nowMs: number): number {
  return dungeonRows(save, nowMs).reduce((sum, row) => sum + row.entriesLeft, 0);
}
