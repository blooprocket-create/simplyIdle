import { describe, expect, it } from 'vitest';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { MISSIONS, missionById } from '../../content/missions';
import { missionStanding } from '../../engine/progression/missions';
import { readSave } from '../../engine/save/v3';
import type { SaveV3 } from '../../engine/save/schema';
import { emptySnapshot, type SimulationSnapshot } from '../../engine/types';
import { boardByHorizon, hintFor } from './MissionsSurface';

/**
 * The Missions surface's two decisions: how the board is grouped, and what a
 * row says under its title.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };

function save(over: Record<string, unknown> = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 20 },
      wallet: { gold: 0, heroShards: 0, essence: 0 },
      ...over,
    },
    { nowMs: 0, content: CONTENT },
  );
}

const at = (wave: number): SimulationSnapshot => ({ ...emptySnapshot(), wave });

describe('how the board is grouped', () => {
  it('shows three horizons, in the order they take', () => {
    expect(boardByHorizon(save(), emptySnapshot()).map(group => group.horizon)).toEqual(['short', 'medium', 'long']);
  });

  it('puts every goal in exactly one group', () => {
    const grouped = boardByHorizon(save(), emptySnapshot()).flatMap(group =>
      group.standings.map(standing => standing.mission.id),
    );
    expect(grouped.sort()).toEqual(MISSIONS.map(mission => mission.id).sort());
    expect(new Set(grouped).size).toBe(MISSIONS.length);
  });

  it('counts what is ready in each group rather than across the board', () => {
    // So a player can see which horizon is worth opening, and the two wave
    // goals at wave 60 both sit in the short group.
    const groups = boardByHorizon(save(), at(60));
    expect(groups.map(group => ({ horizon: group.horizon, claimable: group.claimable }))).toEqual([
      { horizon: 'short', claimable: 2 },
      { horizon: 'medium', claimable: 0 },
      { horizon: 'long', claimable: 0 },
    ]);
  });
});

describe('what a row says under its title', () => {
  const standingFor = (id: string, over: Record<string, unknown> = {}, wave = 0) => {
    const account = save(over);
    return missionStanding(missionById(id)!, account, {
      wave,
      totalKills: 0,
      totalSummons: 0,
      activeTeamSize: 0,
      heroShards: 0,
      essence: 0,
    });
  };

  it('lists only the currencies a goal actually pays', () => {
    // Two of the sixteen pay no gold and two pay no diamonds; a row reading
    // "0 gold" is a row a player has to decode.
    expect(hintFor(standingFor('m_short_wave_20'))).toContain('1.20K gold');
    expect(hintFor(standingFor('m_long_shards_2000'))).not.toContain('gold');
    expect(hintFor(standingFor('m_medium_kills_250'))).not.toContain('💎');
  });

  it('warns on a wave goal that the claim does not wait', () => {
    /*
     * The measured metric is the wave the fight is *on*, so a goal passed and
     * not claimed is a goal lost until the player climbs back. Saying so is
     * the fix that costs nobody a claim — it is on the row whether or not the
     * goal is currently reachable.
     */
    expect(hintFor(standingFor('m_long_wave_500'))).toContain('claim while you are there');
    expect(hintFor(standingFor('m_short_kills_100'))).not.toContain('while you are there');
  });

  it('says so once it has been collected, and stops quoting a price', () => {
    const claimed = save({ missions: { claimedIds: ['m_short_wave_20'] } });
    const standing = missionStanding(missionById('m_short_wave_20')!, claimed, {
      wave: 60,
      totalKills: 0,
      totalSummons: 0,
      activeTeamSize: 0,
      heroShards: 0,
      essence: 0,
    });
    expect(hintFor(standing)).toBe('Collected');
  });
});
