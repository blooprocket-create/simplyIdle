import { describe, expect, it } from 'vitest';
import {
  QUALITY_TIERS,
  detectCapabilities,
  profileFor,
  qualityFor,
  scoreCapabilities,
  tierFor,
  type CapabilitySource,
  type DeviceCapabilities,
} from './DeviceProfile';

const DESKTOP: DeviceCapabilities = {
  memoryGb: 16,
  cores: 12,
  pixelRatio: 1,
  longestEdgePx: 1920,
  touch: false,
  reducedMotion: false,
};

const caps = (over: Partial<DeviceCapabilities>): DeviceCapabilities => ({ ...DESKTOP, ...over });

describe('device profile', () => {
  it('puts a workstation on high and a weak phone on low', () => {
    expect(tierFor(DESKTOP)).toBe('high');
    expect(tierFor(caps({ memoryGb: 2, cores: 4, pixelRatio: 3, longestEdgePx: 900, touch: true }))).toBe('low');
  });

  it('does not decide a tier on one signal', () => {
    // Safari reports neither deviceMemory nor hardwareConcurrency. A scheme
    // keyed off either alone would put every iPhone in the wrong bucket, so
    // the absence of both must not by itself read as a powerful machine.
    const safari = caps({ memoryGb: undefined, cores: undefined, touch: true, pixelRatio: 3, longestEdgePx: 844 });
    expect(tierFor(safari)).toBe('low');
    expect(tierFor(caps({ memoryGb: undefined, cores: undefined }))).toBe('low');
  });

  it('counts fragments rather than CSS size', () => {
    // Same CSS surface, three times the pixel ratio: nine times the work.
    const lean = caps({ pixelRatio: 1, longestEdgePx: 1280 });
    const dense = caps({ pixelRatio: 3, longestEdgePx: 1280 });
    expect(scoreCapabilities(dense)).toBeLessThan(scoreCapabilities(lean));
  });

  it('never asks for a backbuffer denser than the display', () => {
    // Rendering above the device pixel ratio is fragments nobody can see.
    for (const ratio of [1, 1.25, 2, 3]) {
      const profile = profileFor(caps({ pixelRatio: ratio }));
      expect(profile.renderScale).toBeLessThanOrEqual(ratio);
    }
  });

  it('carries reduced-motion through instead of folding it into the tier', () => {
    // A capable machine can still be asked not to animate. Collapsing the two
    // would drop shadows and actor budget for an accessibility preference
    // that says nothing about what the GPU can do.
    const profile = profileFor(caps({ reducedMotion: true }));
    expect(profile.tier).toBe('high');
    expect(profile.reducedMotion).toBe(true);
  });

  it('reads the platform through an injectable source', () => {
    const source: CapabilitySource = {
      devicePixelRatio: 2,
      innerWidth: 1180,
      innerHeight: 820,
      navigator: { deviceMemory: 4, hardwareConcurrency: 8, maxTouchPoints: 5 },
      matchMedia: () => ({ matches: true }),
    };
    expect(detectCapabilities(source)).toEqual({
      memoryGb: 4,
      cores: 8,
      pixelRatio: 2,
      longestEdgePx: 1180,
      touch: true,
      reducedMotion: true,
    });
  });

  it('makes every tier cost less than the one above it', () => {
    // Dropping a tier has to actually buy something back. If two tiers asked
    // for the same work the governor could decide it was struggling, give up
    // fidelity, and change nothing about the frame it was trying to save.
    const [low, medium, high] = QUALITY_TIERS.map(qualityFor);
    expect(low.renderScale).toBeLessThan(medium.renderScale);
    expect(medium.renderScale).toBeLessThan(high.renderScale);
    expect(low.maxDamageNumbers).toBeLessThan(medium.maxDamageNumbers);
    expect(medium.maxDamageNumbers).toBeLessThan(high.maxDamageNumbers);
    expect(low.maxActors).toBeLessThan(high.maxActors);
    expect(low.shadows).toBe(false);
  });

  it('hands out a copy of a tier rather than the tier itself', () => {
    // A caller that adjusted one of these in place would change what every
    // future device of that tier receives.
    const first = qualityFor('high');
    first.maxDamageNumbers = 1;
    expect(qualityFor('high').maxDamageNumbers).toBeGreaterThan(1);
  });

  it('describes a usable profile for every tier', () => {
    for (const tier of QUALITY_TIERS) {
      expect(qualityFor(tier).targetFps, tier).toBeGreaterThan(0);
      expect(qualityFor(tier).maxActors, tier).toBeGreaterThan(0);
    }
  });

  it('survives a platform that reports nothing', () => {
    // Every field here is optional in some shipping browser.
    const detected = detectCapabilities({});
    expect(detected.pixelRatio).toBe(1);
    expect(detected.touch).toBe(false);
    expect(detected.reducedMotion).toBe(false);
    expect(() => profileFor(detected)).not.toThrow();
  });
});
