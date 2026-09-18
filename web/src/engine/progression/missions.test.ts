import { describe, expect, it } from 'vitest';
import fixture from '../../content/__fixtures__/missions.json';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { isTransient, MISSIONS, missionById } from '../../content/missions';
import { readSave } from '../save/v3';
import type { SaveV3 } from '../save/schema';
import {
  claimableMissions,
  claimMission,
  missionProgress,
  missionStanding,
  readMissions,
  type MissionSource,
} from './missions';

/**
 * The mission board, against what the shipped reducer was measured paying.
 *
 * The fixture's `drivenBy` is a *measurement* — which state field, raised
 * alone, made the shipped claim go through — so it is the thing the port's
 * source has to agree with, one metric at a time.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

/** The state field the fixture measured, as the field on our source. */
const FIELD_FOR: Record<string, keyof MissionSource> = {
  wave: 'wave',
  totalKills: 'totalKills',
  totalSummons: 'totalSummons',
  activeTeam: 'activeTeamSize',
  heroShards: 'heroShards',
  essence: 'essence',
};

const EMPTY: MissionSource = { wave: 0, totalKills: 0, totalSummons: 0, activeTeamSize: 0, heroShards: 0, essence: 0 };

const raising = (field: keyof MissionSource, value: number): MissionSource => ({ ...EMPTY, [field]: value });

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

describe('the catalogue', () => {
  it('is the sixteen the shipped game ships, at the prices it pays', () => {
    expect(
      MISSIONS.map(mission => ({
        id: mission.id,
        horizon: mission.horizon,
        title: mission.title,
        description: mission.description,
        metric: mission.metric,
        target: mission.target,
        gold: mission.reward.gold,
        shards: mission.reward.shards,
        essence: mission.reward.essence,
        diamonds: mission.reward.diamonds,
      })),
    ).toEqual(
      fixture.missions.map(row => ({
        id: row.id,
        horizon: row.horizon,
        title: row.title,
        description: row.description,
        metric: row.metric,
        target: row.target,
        gold: row.gold,
        shards: row.shards,
        essence: row.essence,
        diamonds: row.diamonds,
      })),
    );
  });
});

describe('what each goal is measured on', () => {
  it('reads the field the shipped claim was measured reading', () => {
    // One row per goal: raise its measured driver to the target and nothing
    // else, and the progress has to reach the target.
    expect(
      fixture.missions.map(row => {
        const mission = missionById(row.id)!;
        const field = FIELD_FOR[row.drivenBy[0]];
        return { id: row.id, progress: missionProgress(mission.metric, raising(field, row.target)) };
      }),
    ).toEqual(fixture.missions.map(row => ({ id: row.id, progress: row.target })));
  });

  it('is driven by that field and no other', () => {
    // The other side of it: every *wrong* field leaves the goal at nothing.
    const wrong = fixture.missions.flatMap(row => {
      const mission = missionById(row.id)!;
      const driver = FIELD_FOR[row.drivenBy[0]];
      return (Object.keys(EMPTY) as (keyof MissionSource)[])
        .filter(field => field !== driver)
        .filter(field => missionProgress(mission.metric, raising(field, row.target)) !== 0)
        .map(field => `${row.id} moved by ${field}`);
    });
    expect(wrong).toEqual([]);
  });

  it('takes the wave the fight is on, not the deepest reached', () => {
    /*
     * Measured, and the same for the three goals whose own description says
     * "highest". A source that read a record instead would make every wave
     * goal permanently claimable once passed, which is a different game.
     */
    const waveGoals = MISSIONS.filter(mission => mission.metric === 'wave');
    expect(waveGoals.length).toBeGreaterThan(0);
    expect(waveGoals.every(isTransient)).toBe(true);
    expect(MISSIONS.filter(isTransient).map(mission => mission.metric)).toEqual(waveGoals.map(() => 'wave'));
  });
});

describe('claiming one', () => {
  const first = MISSIONS[0];
  const met = raising(FIELD_FOR[fixture.missions[0].drivenBy[0]], first.target);

  it('pays exactly what the shipped claim paid, on every goal', () => {
    expect(
      fixture.missions.map(row => {
        const before = save();
        const after = claimMission(before, raising(FIELD_FOR[row.drivenBy[0]], row.target), row.id)!.save;
        return {
          id: row.id,
          gold: after.wallet.gold - before.wallet.gold,
          totalGold: after.wallet.totalGold - before.wallet.totalGold,
          shards: after.wallet.heroShards - before.wallet.heroShards,
          essence: after.wallet.essence - before.wallet.essence,
          diamonds: after.wallet.diamonds - before.wallet.diamonds,
        };
      }),
    ).toEqual(
      fixture.missions.map(row => ({
        id: row.id,
        gold: row.gold,
        totalGold: row.totalGold,
        shards: row.shards,
        essence: row.essence,
        diamonds: row.diamonds,
      })),
    );
  });

  it('refuses one short of its target, one already taken, and one nobody listed', () => {
    const short = { ...met, [FIELD_FOR[fixture.missions[0].drivenBy[0]]]: first.target - 1 } as MissionSource;
    expect(claimMission(save(), short, first.id)).toBeNull();
    const taken = claimMission(save(), met, first.id)!.save;
    expect(claimMission(taken, met, first.id)).toBeNull();
    expect(claimMission(save(), met, 'not_a_mission')).toBeNull();
  });

  it('records it, so the ledger and the button agree', () => {
    const after = claimMission(save(), met, first.id)!.save;
    expect(after.missions.claimedIds).toEqual([first.id]);
    expect(missionStanding(first, after, met)).toMatchObject({ claimed: true, claimable: false });
  });
});

describe('where a goal stands', () => {
  const shardGoal = MISSIONS.find(mission => mission.metric === 'hero_shards')!;

  it('reads a fraction between nothing and done', () => {
    const half = raising('heroShards', Math.floor(shardGoal.target / 2));
    expect(missionStanding(shardGoal, save(), half).fraction).toBeCloseTo(0.5, 3);
    expect(missionStanding(shardGoal, save(), EMPTY).fraction).toBe(0);
  });

  it('never reads past done, however far past the target the player is', () => {
    // Otherwise a meter on a lifetime tally draws off the end of its track.
    const far = raising('heroShards', shardGoal.target * 40);
    expect(missionStanding(shardGoal, save(), far).fraction).toBe(1);
  });

  it('lists what would pay out right now', () => {
    const rich = raising('heroShards', 10_000);
    const ready = claimableMissions(save(), rich, MISSIONS).map(mission => mission.id);
    expect(ready).toEqual(['m_long_shards_2000', 'm_long_shards_10k']);
  });
});

describe('the claimed list, read out of a save', () => {
  it('keeps what the catalogue still has and drops what it does not', () => {
    // The rule every other collection follows, and how a retired goal leaves
    // an old save.
    expect(readMissions({ claimedMissionIds: [MISSIONS[0].id, 'm_retired'] }).claimedIds).toEqual([MISSIONS[0].id]);
  });

  it('de-duplicates, because the shipped list appends without checking', () => {
    expect(readMissions({ claimedIds: [MISSIONS[0].id, MISSIONS[0].id] }).claimedIds).toEqual([MISSIONS[0].id]);
  });

  it('reads both spellings, so a v2 bag and a v3 block both land', () => {
    expect(readMissions({ claimedMissionIds: [MISSIONS[1].id] }).claimedIds).toEqual([MISSIONS[1].id]);
    expect(readMissions({ claimedIds: [MISSIONS[1].id] }).claimedIds).toEqual([MISSIONS[1].id]);
    expect(readMissions(null).claimedIds).toEqual([]);
  });
});
