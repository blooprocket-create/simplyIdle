import { describe, expect, it } from 'vitest';
import { AUTOMATIONS, automationById } from '../../content/automation';
import { emptySnapshot, type SimulationSnapshot } from '../../engine/types';
import { emptyProfile, type PlayerProfile } from '../profile/playerProfile';
import { automationProgress, isUnlocked } from './unlocks';

const profileWith = (over: Partial<PlayerProfile>): PlayerProfile => ({ ...emptyProfile(), ...over });
const killedThisRun = (kills: number): SimulationSnapshot => ({
  ...emptySnapshot(),
  totals: { ...emptySnapshot().totals, kills },
});

describe('earning an automation', () => {
  it('is locked at the start of a new game', () => {
    for (const entry of AUTOMATIONS) {
      expect(isUnlocked(entry.id, emptyProfile(), emptySnapshot()), entry.id).toBe(false);
    }
  });

  it('opens once the signal reaches the goal', () => {
    const burst = automationById('burst');
    expect(burst).toBeDefined();
    if (!burst) return;
    expect(isUnlocked('burst', profileWith({ totalKills: burst.goal - 1 }), emptySnapshot())).toBe(false);
    expect(isUnlocked('burst', profileWith({ totalKills: burst.goal }), emptySnapshot())).toBe(true);
  });

  it('counts this run towards it, not just the save', () => {
    // Otherwise the unlock could not be earned in the session that earns it.
    const burst = automationById('burst');
    if (!burst) return;
    expect(isUnlocked('burst', profileWith({ totalKills: burst.goal - 10 }), killedThisRun(10))).toBe(true);
  });

  it('never reports one this build cannot honour, however far past the goal', () => {
    // Telling a player they earned something that does nothing is worse than
    // telling them it is not ready.
    const rich = profileWith({
      level: 9_999,
      totalKills: 1e9,
      wallet: { ...emptyProfile().wallet, totalGold: 1e12, equipmentScrap: 1e6, bossTears: 1e6 },
    });
    for (const entry of AUTOMATIONS.filter(candidate => !candidate.available)) {
      expect(isUnlocked(entry.id, rich, emptySnapshot()), entry.id).toBe(false);
    }
  });
});

describe('progress towards an automation', () => {
  it('reports every one, unlocked or not', () => {
    const progress = automationProgress(emptyProfile(), emptySnapshot());
    expect(progress).toHaveLength(AUTOMATIONS.length);
    for (const entry of progress) {
      expect(entry.fraction).toBeGreaterThanOrEqual(0);
      expect(entry.fraction).toBeLessThanOrEqual(1);
      expect(entry.detail).toMatch(/\d+ \/ \d+/);
    }
  });

  it('fills as the signal climbs, and stops at full', () => {
    const burst = automationById('burst');
    if (!burst) return;
    const at = (kills: number) =>
      automationProgress(profileWith({ totalKills: kills }), emptySnapshot()).find(
        entry => entry.automation.id === 'burst',
      );
    expect(at(0)?.fraction).toBe(0);
    expect(at(burst.goal / 2)?.fraction).toBeCloseTo(0.5, 5);
    expect(at(burst.goal)?.fraction).toBe(1);
    expect(at(burst.goal * 10)?.fraction).toBe(1);
    // And the figure shown never runs past what was asked for.
    expect(at(burst.goal * 10)?.detail).toBe(`${burst.goal} / ${burst.goal}`);
  });

  it('has stopped holding hero abilities back', () => {
    /*
     * This test used `castHeroActives` as its example of an automation the
     * build cannot honour, and that stopped being true the moment abilities
     * got a bar. The example moved to `useCoolant`; this is the note saying
     * why, so the next reader does not have to diff two files to find out.
     */
    const cast = automationById('castHeroActives');
    expect(cast?.available).toBe(true);
    expect(isUnlocked('castHeroActives', profileWith({ level: cast?.goal ?? 25 }), emptySnapshot())).toBe(true);
  });

  it('marks progress on an unavailable one without calling it unlocked', () => {
    // The bar can fill; the automation still does not apply. Both facts are
    // true and the screen has to be able to say both.
    const rich = profileWith({ level: 9_999, wallet: { ...emptyProfile().wallet, bossTears: 1e6 } });
    const coolant = automationProgress(rich, emptySnapshot()).find(entry => entry.automation.id === 'useCoolant');
    expect(coolant?.fraction).toBe(1);
    expect(coolant?.unlocked).toBe(true);
    expect(coolant?.automation.available).toBe(false);
    expect(isUnlocked('useCoolant', rich, emptySnapshot())).toBe(false);
  });
});
