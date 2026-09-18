import { MISSIONS, type Mission } from '../content/missions';
import {
  claimableMissions,
  claimMission,
  missionStanding,
  type MissionClaim,
  type MissionSource,
  type MissionStanding,
} from '../engine/progression/missions';
import type { SaveV3 } from '../engine/save/schema';
import type { SimulationSnapshot } from '../engine/types';

/**
 * The mission board, with the live fight supplied.
 *
 * The one destination whose data comes from two places. Five of the six
 * metrics are on the save; `wave` is the wave the fight is standing on right
 * now, which only the snapshot knows — so this is where the two are put
 * together, and the engine takes the result rather than a snapshot it would
 * have no business holding.
 *
 * Kills read the **save alone**, and that is a correction rather than an
 * omission: `snapshot.totals.kills` is the whole run and does not reset when
 * the purse does, so adding it to a banked figure counts every banked kill
 * twice. It lags by at most one bank tick, which is what `totalGold` has
 * always done.
 */
export function missionSource(save: SaveV3, snapshot: SimulationSnapshot): MissionSource {
  return {
    wave: Math.max(snapshot.wave, save.progression.wave),
    totalKills: save.progression.totalKills,
    totalSummons: save.summon.totalSummons,
    activeTeamSize: save.roster.activeUids.length,
    heroShards: save.wallet.heroShards,
    essence: save.wallet.essence,
  };
}

/** Every goal and where it stands, in catalogue order. */
export function missionBoard(save: SaveV3, snapshot: SimulationSnapshot): MissionStanding[] {
  const source = missionSource(save, snapshot);
  return MISSIONS.map(mission => missionStanding(mission, save, source));
}

/** How many would pay out right now. Drives the badge on the destination. */
export function claimableCount(save: SaveV3, snapshot: SimulationSnapshot): number {
  return claimableMissions(save, missionSource(save, snapshot), MISSIONS).length;
}

export function claim(save: SaveV3, snapshot: SimulationSnapshot, id: string): MissionClaim | null {
  return claimMission(save, missionSource(save, snapshot), id);
}

/**
 * Collect everything outstanding in one press.
 *
 * Sixteen goals is sixteen buttons, and a returning account can arrive with
 * eight of them already satisfied. The same correction `useUsableItem` makes
 * by taking an amount and the codex sweep makes by taking the whole roster.
 */
export function claimAll(save: SaveV3, snapshot: SimulationSnapshot): { save: SaveV3; claimed: Mission[] } {
  const claimed: Mission[] = [];
  let current = save;
  // The source is rebuilt each time on purpose: a claim pays shards and
  // essence, and two of the goals are measured on exactly those. Reusing a
  // stale source would miss a goal this sweep itself just completed.
  for (const mission of MISSIONS) {
    const outcome = claim(current, snapshot, mission.id);
    if (outcome === null) continue;
    current = outcome.save;
    claimed.push(outcome.mission);
  }
  return { save: current, claimed };
}
