import { describe, expect, it } from 'vitest';
import { profileFor, type DeviceCapabilities } from './DeviceProfile';
import { DOWNGRADE_FRAMES, FrameGovernor, MAX_STEP_MS, STALL_MS, UPGRADE_FRAMES } from './FrameGovernor';

const STRONG: DeviceCapabilities = {
  memoryGb: 16,
  cores: 12,
  pixelRatio: 1,
  longestEdgePx: 1920,
  touch: false,
  reducedMotion: false,
};

/** Runs `frames` at a fixed cost, returning the last decision. */
function run(governor: FrameGovernor, frames: number, frameMs: number, startMs = 0) {
  let now = startMs;
  let decision = governor.frame(now);
  let drawn = 0;
  for (let i = 0; i < frames; i += 1) {
    now += frameMs;
    decision = governor.frame(now);
    if (decision.draw) drawn += 1;
  }
  return { decision, drawn, now };
}

describe('frame governor', () => {
  it('draws every frame when the target matches the display', () => {
    const governor = new FrameGovernor(profileFor(STRONG));
    expect(run(governor, 120, 1000 / 60).drawn).toBe(120);
  });

  it('halves drawing when the target is half the display rate', () => {
    // A 30fps target on a 60Hz display: draw every other frame rather than
    // ask the GPU for 60 and receive 24.
    const profile = { ...profileFor(STRONG), targetFps: 30 };
    const { drawn } = run(new FrameGovernor(profile), 120, 1000 / 60);
    expect(drawn).toBeGreaterThanOrEqual(59);
    expect(drawn).toBeLessThanOrEqual(61);
  });

  it('gives up a tier when the device is sustainedly behind', () => {
    const governor = new FrameGovernor(profileFor(STRONG));
    expect(governor.tier).toBe('high');
    run(governor, DOWNGRADE_FRAMES + 12, 40);
    expect(governor.tier).toBe('medium');
  });

  it('keeps stepping down while the device stays behind', () => {
    // One tier is a concession; a device still 2.4x over budget after it has
    // to keep giving ground, or the governor holds a setting the hardware has
    // already refused.
    const governor = new FrameGovernor(profileFor(STRONG));
    run(governor, DOWNGRADE_FRAMES * 6, 40);
    expect(governor.tier).toBe('low');
  });

  it('does not drop a tier for a brief spike', () => {
    const governor = new FrameGovernor(profileFor(STRONG));
    let now = 0;
    governor.frame(now);
    for (let i = 0; i < 5; i += 1) governor.frame((now += 60));
    for (let i = 0; i < 60; i += 1) governor.frame((now += 1000 / 60));
    expect(governor.tier).toBe('high');
  });

  it('restores a tier when headroom returns, and never past the device ceiling', () => {
    const governor = new FrameGovernor(profileFor(STRONG));
    const after = run(governor, DOWNGRADE_FRAMES + 12, 40);
    expect(governor.tier).toBe('medium');
    run(governor, UPGRADE_FRAMES * 4, 6, after.now);
    expect(governor.tier).toBe('high');
    run(governor, UPGRADE_FRAMES * 4, 6);
    expect(governor.tier).toBe('high');
  });

  it('does not oscillate once it has settled', () => {
    // Symmetric thresholds flap: the frame after an upgrade is the most
    // expensive one there is. Running right at the budget must stay put.
    const governor = new FrameGovernor(profileFor(STRONG));
    run(governor, DOWNGRADE_FRAMES + 12, 40);
    const settled = governor.tier;
    for (let i = 0; i < 12; i += 1) {
      run(governor, 200, 1000 / 60);
      expect(governor.tier).toBe(settled);
    }
  });

  it('treats a hidden tab as a stall rather than a slow frame', () => {
    // One enormous delta on return would otherwise read as catastrophic load
    // and drop a returning player to the lowest tier on their first frame.
    const governor = new FrameGovernor(profileFor(STRONG));
    run(governor, 60, 1000 / 60);
    const resumed = governor.frame(STALL_MS * 40);
    expect(resumed.stepMs).toBeLessThanOrEqual(MAX_STEP_MS);
    expect(governor.tier).toBe('high');
    run(governor, 120, 1000 / 60, STALL_MS * 40);
    expect(governor.tier).toBe('high');
  });

  it('never hands the simulation more than one clamped step', () => {
    const governor = new FrameGovernor(profileFor(STRONG));
    governor.frame(0);
    for (const gap of [0, 16, 100, 249, 250, 5_000, 86_400_000]) {
      expect(governor.frame(gap).stepMs).toBeLessThanOrEqual(MAX_STEP_MS);
    }
  });

  it('cannot fall below the lowest tier', () => {
    const governor = new FrameGovernor(profileFor({ ...STRONG, memoryGb: 2, cores: 2, touch: true }));
    expect(governor.tier).toBe('low');
    run(governor, DOWNGRADE_FRAMES * 20, 400);
    expect(governor.tier).toBe('low');
  });
});
