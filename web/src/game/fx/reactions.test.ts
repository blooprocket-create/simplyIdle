import { describe, expect, it } from 'vitest';
import { REACTION_MS, RECOIL_METRES, TELEGRAPH_PERIOD_MS, hitFlash, hitRecoil, telegraphPulse } from './reactions';

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
