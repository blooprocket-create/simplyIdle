import { describe, expect, it } from 'vitest';
import { ACTS } from './acts';
import { BOSS_MECHANICS, actForMechanic, bossMechanicForAct, bossMechanicForWave } from './bossMechanics';
import { isBossWave } from './monsters';

describe('one mechanic per act', () => {
  it('covers every act and invents none', () => {
    // "One mechanic per act" is the phase's wording. A seventh mechanic with
    // no act, or an act with no mechanic, is the drift this catches.
    expect(BOSS_MECHANICS.map(mechanic => mechanic.actId)).toEqual(ACTS.map(act => act.id));
  });

  it('resolves back to the act it belongs to', () => {
    for (const mechanic of BOSS_MECHANICS) {
      expect(actForMechanic(mechanic).id).toBe(mechanic.actId);
    }
  });

  it('names each one and says what the boss is doing', () => {
    // The tell line is the telegraph in words. A mechanic the HUD can only
    // show as a bar is one the player has to learn by dying to it.
    for (const mechanic of BOSS_MECHANICS) {
      expect(mechanic.name.length).toBeGreaterThan(0);
      expect(mechanic.tell.length).toBeGreaterThan(10);
    }
    expect(new Set(BOSS_MECHANICS.map(m => m.name)).size).toBe(BOSS_MECHANICS.length);
  });
});

describe('the escalation across the six', () => {
  it('narrows the window and tightens the cadence, act by act', () => {
    for (let index = 1; index < BOSS_MECHANICS.length; index += 1) {
      const previous = BOSS_MECHANICS[index - 1];
      const current = BOSS_MECHANICS[index];
      expect(current.windowMs, `act ${current.actId} window`).toBeLessThan(previous.windowMs);
      expect(current.cadenceMs, `act ${current.actId} cadence`).toBeLessThan(previous.cadenceMs);
    }
  });

  it('pays more as it asks more', () => {
    // An act that asked for a tighter answer and paid the same would just be
    // a worse version of the act before it.
    for (let index = 1; index < BOSS_MECHANICS.length; index += 1) {
      expect(BOSS_MECHANICS[index].chipSeconds).toBeGreaterThan(BOSS_MECHANICS[index - 1].chipSeconds);
      expect(BOSS_MECHANICS[index].charge).toBeGreaterThanOrEqual(BOSS_MECHANICS[index - 1].charge);
    }
  });

  it('keeps every window reactable on a phone', () => {
    // The narrowest is the sixth act's, and it still has to be a reaction
    // rather than a frame-perfect input. 250ms is roughly a human reaction;
    // nothing here goes near it.
    for (const mechanic of BOSS_MECHANICS) {
      expect(mechanic.windowMs, `act ${mechanic.actId}`).toBeGreaterThanOrEqual(600);
      // And the window must fit inside the cadence, or tells would overlap.
      expect(mechanic.windowMs).toBeLessThan(mechanic.cadenceMs);
    }
  });

  it('starts chaining partway in rather than from the first boss', () => {
    // The first two acts teach the press. Compounding it is what the third
    // act adds, so the escalation is a rule change and not only tuning.
    expect(BOSS_MECHANICS.filter(mechanic => mechanic.chains).map(m => m.actId)).toEqual([3, 4, 5, 6]);
  });
});

describe('which mechanic a boss runs', () => {
  it('gives each act boss its own act', () => {
    expect(bossMechanicForWave(10).actId).toBe(1);
    expect(bossMechanicForWave(20).actId).toBe(2);
    expect(bossMechanicForWave(30).actId).toBe(3);
    expect(bossMechanicForWave(40).actId).toBe(4);
    expect(bossMechanicForWave(50).actId).toBe(5);
    expect(bossMechanicForWave(60).actId).toBe(6);
  });

  it('keeps the sixth act running past the last wave the shipped data names', () => {
    /*
     * The shipped acts stop naming boss waves at 60 and the campaign does
     * not stop at 60 — act six runs to the end of the run. Keying off the
     * act rather than the boss wave is what keeps wave 4,000 a boss fight
     * with a mechanic instead of a boss fight with nothing to do.
     */
    for (const wave of [70, 130, 1_000, 4_000]) {
      expect(isBossWave(wave)).toBe(true);
      expect(bossMechanicForWave(wave).actId, `wave ${wave}`).toBe(6);
    }
  });
});

describe('looking a mechanic up by act', () => {
  it('gives each act its own', () => {
    for (const act of ACTS) {
      expect(bossMechanicForAct(act.id).actId, `act ${act.id}`).toBe(act.id);
    }
  });

  it('agrees with the wave lookup on every act boss', () => {
    // The two are different questions — "what does act 3 do" and "what does
    // the thing on wave 30 do" — and they must never answer differently.
    for (const act of ACTS) {
      expect(bossMechanicForWave(act.bossWave)).toEqual(bossMechanicForAct(act.id));
    }
  });

  it('falls back to the open-ended act rather than throwing on an unknown id', () => {
    expect(bossMechanicForAct(99).actId).toBe(BOSS_MECHANICS[BOSS_MECHANICS.length - 1].actId);
  });
});
