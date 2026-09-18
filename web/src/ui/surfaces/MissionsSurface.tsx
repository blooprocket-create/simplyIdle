import { isTransient, MISSION_HORIZONS, type MissionHorizon } from '../../content/missions';
import { missionBoard } from '../../app/missionActions';
import type { MissionStanding } from '../../engine/progression/missions';
import type { SaveV3 } from '../../engine/save/schema';
import type { SimulationSnapshot } from '../../engine/types';
import { formatDamage } from '../../format/bigNumber';
import type { SurfaceProps } from './SurfaceProps';
import { Meter, Row, Rows, Section } from './parts/parts';

/**
 * The mission board: sixteen goals, grouped by how long they take.
 *
 * A `ledger` — a list to spend down.
 *
 * **The only surface whose data comes from two places.** Five of the six
 * metrics are on the save; `wave` is the wave the fight is standing on right
 * now. So a wave goal is claimable only *while the player is there*, which the
 * hint says out loud rather than leaving them to discover by losing a claim.
 */

export interface HorizonGroup {
  horizon: MissionHorizon;
  standings: MissionStanding[];
  claimable: number;
}

export function boardByHorizon(save: SaveV3, snapshot: SimulationSnapshot): HorizonGroup[] {
  const board = missionBoard(save, snapshot);
  return MISSION_HORIZONS.map(horizon => {
    const standings = board.filter(standing => standing.mission.horizon === horizon);
    return { horizon, standings, claimable: standings.filter(standing => standing.claimable).length };
  });
}

const HORIZON_LABEL: Record<MissionHorizon, string> = {
  short: 'This run',
  medium: 'This week',
  long: 'The long haul',
};

/** What a row says under its title. The reward, or why it is not claimable. */
export function hintFor(standing: MissionStanding): string {
  if (standing.claimed) return 'Collected';
  const reward = standing.mission.reward;
  const parts = [
    reward.gold > 0 ? `${formatDamage(reward.gold)} gold` : null,
    reward.shards > 0 ? `${reward.shards} shards` : null,
    reward.essence > 0 ? `${reward.essence} essence` : null,
    reward.diamonds > 0 ? `${reward.diamonds} 💎` : null,
  ].filter((part): part is string => part !== null);
  // Named on every wave goal, claimed or not, because the cost of not saying
  // it is a player who reaches wave 250 once and never gets the reward.
  const caveat = isTransient(standing.mission) ? ' · claim while you are there' : '';
  return `${parts.join(' · ')}${caveat}`;
}

export function MissionsSurface({ save, snapshot, actions }: SurfaceProps) {
  const groups = boardByHorizon(save, snapshot);
  const outstanding = groups.reduce((sum, group) => sum + group.claimable, 0);

  return (
    <>
      <Section title="Missions">
        <Rows>
          <Row
            label="Collect everything earned"
            hint={outstanding === 0 ? 'Nothing is ready yet' : `${outstanding} ready`}
          >
            <button type="button" disabled={outstanding === 0} onClick={() => actions.claimAllMissions()}>
              {outstanding === 0 ? 'Nothing ready' : `Claim ${outstanding}`}
            </button>
          </Row>
        </Rows>
      </Section>

      {groups.map(group => (
        <Section key={group.horizon} title={HORIZON_LABEL[group.horizon]}>
          <Rows>
            {group.standings.map(standing => (
              <Row key={standing.mission.id} label={standing.mission.title} hint={hintFor(standing)}>
                {standing.claimable ? (
                  <button type="button" onClick={() => actions.claimMission(standing.mission.id)}>
                    Claim
                  </button>
                ) : (
                  <Meter
                    fraction={standing.fraction}
                    label={`${formatDamage(standing.progress)} / ${formatDamage(standing.mission.target)}`}
                  />
                )}
              </Row>
            ))}
          </Rows>
        </Section>
      ))}
    </>
  );
}
