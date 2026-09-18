import { missionById, type Mission, type MissionMetric } from '../../content/missions';
import { boundedStringList, MAX_SAVE_COLLECTION } from '../save/guards';
import type { SaveV3 } from '../save/schema';

/**
 * Claiming a mission.
 *
 * **One function reads progress and both callers use it**, which is the fix
 * rather than a tidy-up. The shipped game writes the rule twice — once in
 * `useGameState.ts` for the progress bars a player reads and once in
 * `progressionReducer.ts` for the button that decides whether a claim goes
 * through — and a divergence between them shows up as a goal that reads 100%
 * and refuses to be claimed. They agree today and nothing makes them; here
 * there is nothing to diverge.
 *
 * The **source** is an argument rather than read off the save, because one of
 * the six metrics is not on the save at all: `wave` is the wave the fight is
 * standing on right now, which only the running simulation knows. Handing the
 * whole source in keeps that asymmetry in one place instead of giving this
 * module a snapshot it would otherwise have no business holding.
 */

/** Every figure a goal can be measured against, gathered by the caller. */
export interface MissionSource {
  /**
   * The wave the fight is on **now**. Not the deepest reached — measured, and
   * the same for the goals whose description says "highest".
   */
  wave: number;
  /** Lifetime, not this run. Measured, and the same for the ones saying "this run". */
  totalKills: number;
  totalSummons: number;
  activeTeamSize: number;
  heroShards: number;
  essence: number;
}

export function missionProgress(metric: MissionMetric, source: MissionSource): number {
  switch (metric) {
    case 'wave':
      return source.wave;
    case 'kills':
      return source.totalKills;
    case 'summons':
      return source.totalSummons;
    case 'active_team':
      return source.activeTeamSize;
    case 'hero_shards':
      return source.heroShards;
    case 'essence':
      return source.essence;
  }
}

/** What a screen draws: where the goal stands, and whether the button is live. */
export interface MissionStanding {
  mission: Mission;
  progress: number;
  /** Nought to one. Clamped, so a goal past its target reads full and not more. */
  fraction: number;
  claimed: boolean;
  claimable: boolean;
}

export function missionStanding(mission: Mission, save: SaveV3, source: MissionSource): MissionStanding {
  const progress = missionProgress(mission.metric, source);
  const claimed = save.missions.claimedIds.includes(mission.id);
  return {
    mission,
    progress,
    fraction: mission.target <= 0 ? 1 : Math.min(1, Math.max(0, progress / mission.target)),
    claimed,
    claimable: !claimed && progress >= mission.target,
  };
}

export interface MissionClaim {
  save: SaveV3;
  mission: Mission;
}

/**
 * Collect one.
 *
 * Null for an unknown id, a goal short of its target, and one already taken —
 * one answer for all three, because a screen only needs to know whether the
 * button does anything and `missionStanding` is how it decides what to draw.
 */
export function claimMission(save: SaveV3, source: MissionSource, id: string): MissionClaim | null {
  const mission = missionById(id);
  if (mission === null) return null;
  const standing = missionStanding(mission, save, source);
  if (!standing.claimable) return null;

  const { gold, shards, essence, diamonds } = mission.reward;
  return {
    mission,
    save: {
      ...save,
      missions: { claimedIds: [...save.missions.claimedIds, mission.id] },
      wallet: {
        ...save.wallet,
        gold: save.wallet.gold + gold,
        // Lifetime gold climbs with the purse, as every other grant does.
        totalGold: save.wallet.totalGold + gold,
        heroShards: save.wallet.heroShards + shards,
        essence: save.wallet.essence + essence,
        diamonds: save.wallet.diamonds + diamonds,
      },
    },
  };
}

/**
 * Which goals are earned and unclaimed. Drives the badge on the destination.
 *
 * A count rather than a list at the call site, but a list here: a badge that
 * said three and a screen that showed four would be two answers to one
 * question.
 */
export function claimableMissions(save: SaveV3, source: MissionSource, missions: readonly Mission[]): Mission[] {
  return missions.filter(mission => missionStanding(mission, save, source).claimable);
}

/** The claimed list, read out of a save. Bounded like every other collection. */
export function readMissions(raw: unknown): { claimedIds: string[] } {
  if (typeof raw !== 'object' || raw === null) return { claimedIds: [] };
  const stored = (raw as Record<string, unknown>).claimedIds ?? (raw as Record<string, unknown>).claimedMissionIds;
  // De-duplicated on the way in: the shipped list is appended to without the
  // check, so a save can carry the same goal twice and pay it once.
  const ids = [...new Set(boundedStringList(stored, MAX_SAVE_COLLECTION))];
  // Dropped when the catalogue no longer has the goal, which is how a retired
  // mission leaves old saves — the same rule every other collection follows.
  return { claimedIds: ids.filter(id => missionById(id) !== null) };
}
