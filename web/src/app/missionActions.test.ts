import { describe, expect, it } from 'vitest';
import { heroTemplatesById } from '../content/heroes';
import { equipmentTemplatesById } from '../content/equipment';
import { MISSIONS } from '../content/missions';
import { emptySnapshot } from '../engine/types';
import type { SimulationSnapshot } from '../engine/types';
import { readSave } from '../engine/save/v3';
import type { SaveV3 } from '../engine/save/schema';
import { claim, claimableCount, claimAll, missionBoard, missionSource } from './missionActions';

/**
 * The seam that joins the save to the running fight.
 *
 * The mission board is the only destination whose data comes from two places,
 * so this is where the joining is tested — without React, for the reason
 * `playerActions.test.ts` gives.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

function save(over: Record<string, unknown> = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 20 },
      wallet: { gold: 0, totalGold: 0, diamonds: 0, heroShards: 0, essence: 0 },
      ...over,
    },
    { nowMs: NOW, content: CONTENT },
  );
}

const at = (wave: number, kills = 0): SimulationSnapshot => ({
  ...emptySnapshot(),
  wave,
  totals: { ...emptySnapshot().totals, kills },
});

describe('where the six figures come from', () => {
  it('takes the wave from the fight and the rest from the save', () => {
    const account = save({
      progression: { level: 20, totalKills: 900, wave: 3 },
      wallet: { gold: 0, heroShards: 77, essence: 12 },
      summon: { totalSummons: 31 },
      roster: { activeUids: [], heroes: [] },
    });
    expect(missionSource(account, at(214))).toEqual({
      wave: 214,
      totalKills: 900,
      totalSummons: 31,
      activeTeamSize: 0,
      heroShards: 77,
      essence: 12,
    });
  });

  it('falls back to the save’s wave before a run has started', () => {
    // A fresh session has a zero snapshot, and a player who resumed at wave 41
    // should not watch their wave goals reset while the first frame lands.
    const resumed = save({ progression: { level: 20, wave: 41 } });
    expect(missionSource(resumed, emptySnapshot()).wave).toBe(41);
    expect(missionSource(resumed, at(60)).wave).toBe(60);
  });

  it('counts kills off the save alone, never adding the run on top', () => {
    /*
     * `snapshot.totals.kills` is the whole run and does not reset when the
     * purse does, so adding it to a banked figure counts every banked kill
     * twice — the same correction `measure.ts` needed once `bankRun` started
     * crediting them.
     */
    const account = save({ progression: { level: 20, totalKills: 1_000 } });
    expect(missionSource(account, at(1, 250)).totalKills).toBe(1_000);
  });
});

describe('the board a screen draws', () => {
  it('reports every goal, in catalogue order', () => {
    expect(missionBoard(save(), emptySnapshot()).map(standing => standing.mission.id)).toEqual(
      MISSIONS.map(mission => mission.id),
    );
  });

  it('counts what is ready, and stops counting one once it is taken', () => {
    const deep = at(60);
    const before = save();
    expect(claimableCount(before, deep)).toBe(2);
    const after = claim(before, deep, 'm_short_wave_20')!.save;
    expect(claimableCount(after, deep)).toBe(1);
  });

  it('locks a wave goal again when the run falls back below it', () => {
    /*
     * The consequence of the measured metric, and the reason the screen says
     * "claim while you are there". A player who reached 60 and wiped back to
     * 41 has the wave-50 goal locked again.
     */
    const account = save();
    expect(claimableCount(account, at(60))).toBe(2);
    expect(claimableCount(account, at(41))).toBe(1);
    expect(claim(account, at(41), 'm_short_wave_50')).toBeNull();
  });
});

describe('collecting everything outstanding', () => {
  it('takes them all in one press', () => {
    const swept = claimAll(save(), at(60));
    expect(swept.claimed.map(mission => mission.id)).toEqual(['m_short_wave_20', 'm_short_wave_50']);
    expect(claimableCount(swept.save, at(60))).toBe(0);
  });

  it('collects a goal that an earlier claim in the same sweep completed', () => {
    /*
     * Two goals are measured on shards and two on essence, and a claim pays
     * both — so a sweep that priced every goal against one source read at the
     * start would miss whichever goal it had just made reachable.
     *
     * At 9,800 shards the 2,000 goal is ready and the 10,000 one is not.
     * Claiming the first pays 300, which takes the account to 10,100 and puts
     * the second in reach *within the same press*.
     */
    const almost = save({ wallet: { gold: 0, heroShards: 9_800 } });
    expect(claimableCount(almost, emptySnapshot())).toBe(1);

    const swept = claimAll(almost, emptySnapshot());
    expect(swept.claimed.map(mission => mission.id)).toEqual(['m_long_shards_2000', 'm_long_shards_10k']);
    expect(swept.save.wallet.heroShards).toBe(11_100);
  });

  it('claims nothing, and changes nothing, when nothing is ready', () => {
    const empty = save();
    const swept = claimAll(empty, emptySnapshot());
    expect(swept.claimed).toEqual([]);
    expect(swept.save).toBe(empty);
  });
});
