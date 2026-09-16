import { describe, expect, it } from 'vitest';
import {
  REACTION_MS,
  RECOIL_METRES,
  RISE_METRES,
  TELEGRAPH_DEPTH,
  TELEGRAPH_PERIOD_MS,
  hitFlash,
  hitRecoil,
  recoilOffset,
  riseOffset,
  telegraphPulse,
  telegraphStrength,
} from './reactions';

describe('reaction curves', () => {
  it('flashes hardest at the moment of impact', () => {
    // A flash that ramps up reads as a glow rather than as a blow.
    expect(hitFlash(0)).toBe(1);
    expect(hitFlash(REACTION_MS * 0.25)).toBeGreaterThan(hitFlash(REACTION_MS * 0.5));
    expect(hitFlash(REACTION_MS)).toBe(0);
  });

  it('never flashes outside its window', () => {
    for (const age of [-100, REACTION_MS, REACTION_MS * 10, 1e9]) {
      expect(hitFlash(age), `${age}`).toBeLessThanOrEqual(1);
      expect(hitFlash(age), `${age}`).toBeGreaterThanOrEqual(0);
    }
    expect(hitFlash(-1)).toBe(1);
  });

  it('returns a struck actor exactly where it found them', () => {
    // Keeping a fraction of every recoil walks an actor off the battlefield
    // over a few hundred hits, and nothing in a render would show it until
    // the enemy was somewhere absurd.
    expect(hitRecoil(0)).toBeCloseTo(0);
    expect(hitRecoil(REACTION_MS)).toBeCloseTo(0);
    expect(hitRecoil(REACTION_MS * 5)).toBeCloseTo(0);
    let drift = 0;
    for (let hit = 0; hit < 500; hit += 1) drift += hitRecoil(REACTION_MS);
    expect(drift).toBeCloseTo(0);
  });

  it('recoils by a visible but bounded amount', () => {
    expect(hitRecoil(REACTION_MS / 2)).toBeCloseTo(RECOIL_METRES);
    for (let age = 0; age <= REACTION_MS; age += 5) {
      expect(hitRecoil(age)).toBeLessThanOrEqual(RECOIL_METRES + 1e-9);
      expect(hitRecoil(age)).toBeGreaterThanOrEqual(0);
    }
  });

  it('pulses a telegraph smoothly and on period', () => {
    expect(telegraphPulse(0)).toBeCloseTo(0);
    expect(telegraphPulse(TELEGRAPH_PERIOD_MS / 2)).toBeCloseTo(1);
    expect(telegraphPulse(TELEGRAPH_PERIOD_MS)).toBeCloseTo(0);
    // Same value one period later, so it never jumps.
    for (const at of [137, 400, 999]) {
      expect(telegraphPulse(at)).toBeCloseTo(telegraphPulse(at + TELEGRAPH_PERIOD_MS));
    }
  });

  it('keeps the telegraph inside its range for any elapsed time', () => {
    for (const at of [0, 1, 12_345, 8 * 60 * 60 * 1000]) {
      expect(telegraphPulse(at)).toBeGreaterThanOrEqual(0);
      expect(telegraphPulse(at)).toBeLessThanOrEqual(1);
    }
  });
});

describe('reduced motion', () => {
  it('stops the telegraph breathing but keeps the boss legible', () => {
    // Silencing it entirely would make a boss indistinguishable from a
    // Goblin for exactly the players least able to tell them apart.
    const still = [0, 400, 800, 1200, 1599].map(ms => telegraphStrength(ms, true));
    expect(new Set(still).size).toBe(1);
    expect(still[0]).toBeGreaterThan(0);
    // And it sits inside the range the moving version covers, so it never
    // reads as brighter than a real telegraph at its peak.
    expect(still[0]).toBeLessThanOrEqual(telegraphStrength(TELEGRAPH_PERIOD_MS / 2, false));
  });

  it('still breathes when motion is allowed', () => {
    const moving = [0, 400, 800, 1200].map(ms => telegraphStrength(ms, false));
    expect(new Set(moving).size).toBeGreaterThan(1);
    expect(Math.max(...moving)).toBeLessThanOrEqual(TELEGRAPH_DEPTH);
  });

  it('stops the recoil outright, because a recoil is nothing but movement', () => {
    for (const ms of [0, 55, 110, 165, 220]) {
      expect(recoilOffset(ms, true)).toBe(0);
    }
    // Unstopped, it still moves.
    expect(recoilOffset(REACTION_MS / 2, false)).toBeCloseTo(RECOIL_METRES, 5);
  });
});

describe('damage number rise', () => {
  it('climbs over its life and stops dead when motion is off', () => {
    expect(riseOffset(0, false)).toBe(0);
    expect(riseOffset(1, false)).toBeCloseTo(RISE_METRES, 5);
    expect(riseOffset(0.5, false)).toBeLessThan(riseOffset(0.75, false));
    for (const t of [0, 0.25, 0.5, 1]) expect(riseOffset(t, true)).toBe(0);
  });

  it('does not keep climbing past the end of its life', () => {
    // `update` can overshoot t = 1 on a long step before it retires the slot.
    expect(riseOffset(1.6, false)).toBe(riseOffset(1, false));
  });
});
