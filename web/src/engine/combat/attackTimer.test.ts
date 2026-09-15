import { describe, expect, it } from 'vitest';
import {
  MAX_ATTACKS_PER_STEP,
  advanceAttackTimer,
  createAttackTimer,
  swingProgress,
  type AttackTimer,
} from './attackTimer';

/** Run a whole span through a timer in the given chunk sizes. */
function attacksOver(intervalMs: number, chunks: readonly number[]): number {
  let timer = createAttackTimer(intervalMs);
  let attacks = 0;
  for (const chunk of chunks) {
    const step = advanceAttackTimer(timer, chunk);
    timer = step.timer;
    attacks += step.attacks;
  }
  return attacks;
}

function evenChunks(totalMs: number, chunkMs: number): number[] {
  const chunks: number[] = [];
  for (let remaining = totalMs; remaining > 0; remaining -= chunkMs) {
    chunks.push(Math.min(chunkMs, remaining));
  }
  return chunks;
}

describe('the attack count depends on the span, not the frame rate', () => {
  const TEN_SECONDS = 10_000;

  it('gives the same answer at 120fps, 60fps, 30fps and 10fps', () => {
    // The property the remainder exists for. A timer that reset to zero on
    // firing would drop part of every frame and quietly make a slow device
    // deal less damage.
    const interval = 700;
    const expected = Math.floor(TEN_SECONDS / interval);

    for (const fps of [120, 60, 30, 10]) {
      const chunk = 1_000 / fps;
      expect({ fps, attacks: attacksOver(interval, evenChunks(TEN_SECONDS, chunk)) }).toEqual({
        fps,
        attacks: expected,
      });
    }
  });

  it('gives the same answer in one step as in a thousand', () => {
    for (const interval of [700, 800, 900, 1_200, 1_600]) {
      const oneGo = attacksOver(interval, [TEN_SECONDS]);
      const manySteps = attacksOver(interval, evenChunks(TEN_SECONDS, 10));
      expect({ interval, oneGo, manySteps }).toEqual({ interval, oneGo: manySteps, manySteps });
    }
  });

  it('gives the same answer under a jittering frame time', () => {
    // Real frames are not evenly spaced. A deterministic stutter pattern
    // rather than Math.random, so a failure is reproducible.
    const interval = 900;
    const jitter: number[] = [];
    let produced = 0;
    for (let i = 0; produced < TEN_SECONDS; i += 1) {
      const chunk = Math.min([3, 47, 8, 120, 16, 31][i % 6], TEN_SECONDS - produced);
      jitter.push(chunk);
      produced += chunk;
    }
    expect(jitter.reduce((sum, chunk) => sum + chunk, 0)).toBe(TEN_SECONDS);
    expect(attacksOver(interval, jitter)).toBe(attacksOver(interval, [TEN_SECONDS]));
  });

  it('carries the remainder rather than discarding it', () => {
    // Directly, so the mechanism is asserted and not just its consequence.
    const step = advanceAttackTimer(createAttackTimer(1_000), 1_400);
    expect(step.attacks).toBe(1);
    expect(step.timer.bankedMs).toBe(400);
  });
});

describe('a single step', () => {
  it('fires nothing before the interval is up', () => {
    const step = advanceAttackTimer(createAttackTimer(1_000), 999);
    expect(step.attacks).toBe(0);
    expect(step.timer.bankedMs).toBe(999);
  });

  it('fires exactly on the interval', () => {
    expect(advanceAttackTimer(createAttackTimer(1_000), 1_000).attacks).toBe(1);
  });

  it('fires more than once when a step is long', () => {
    const step = advanceAttackTimer(createAttackTimer(100), 550);
    expect(step.attacks).toBe(5);
    expect(step.timer.bankedMs).toBe(50);
  });

  it('ignores a zero, negative or non-finite step', () => {
    const timer = createAttackTimer(1_000, 250);
    for (const delta of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const step = advanceAttackTimer(timer, delta);
      expect({ delta: String(delta), attacks: step.attacks, banked: step.timer.bankedMs }).toEqual({
        delta: String(delta),
        attacks: 0,
        banked: 250,
      });
    }
  });
});

describe('a step long enough to mean the tab was hidden', () => {
  it('clamps instead of replaying an hour of swings at once', () => {
    /*
     * Offline time is credited by the offline estimator, which models the
     * sawtooth — deaths, chapter retreats and all. Replaying it here as a
     * burst of simultaneous attacks would both lie about the fight and block
     * the main thread for as long as the tab was hidden.
     */
    const step = advanceAttackTimer(createAttackTimer(700), 60 * 60 * 1_000);
    expect(step.attacks).toBe(MAX_ATTACKS_PER_STEP);
    expect(step.clamped).toBe(true);
  });

  it('does not bank the discarded time, so the clamp is not just deferred', () => {
    const step = advanceAttackTimer(createAttackTimer(700), 60 * 60 * 1_000);
    expect(step.timer.bankedMs).toBe(0);
    // The very next ordinary frame owes one attack at most, not thousands.
    expect(advanceAttackTimer(step.timer, 16).attacks).toBe(0);
  });

  it('does not clamp a step that is merely slow', () => {
    // A dropped frame or two must not be mistaken for a hidden tab.
    const step = advanceAttackTimer(createAttackTimer(700), 2_000);
    expect(step.clamped).toBe(false);
    expect(step.attacks).toBe(2);
  });
});

describe('what a cast bar reads', () => {
  it('runs zero to one across the swing', () => {
    const timer = createAttackTimer(1_000);
    expect(swingProgress(timer)).toBe(0);
    expect(swingProgress(advanceAttackTimer(timer, 250).timer)).toBe(0.25);
    expect(swingProgress(advanceAttackTimer(timer, 999).timer)).toBeCloseTo(0.999, 10);
    // Firing resets the bar rather than leaving it full.
    expect(swingProgress(advanceAttackTimer(timer, 1_000).timer)).toBe(0);
  });

  it('never leaves the bar outside its track', () => {
    for (const banked of [-500, 0, 500, 5_000]) {
      const timer: AttackTimer = { intervalMs: 1_000, bankedMs: banked };
      const progress = swingProgress(timer);
      expect({ banked, inRange: progress >= 0 && progress <= 1 }).toEqual({ banked, inRange: true });
    }
  });
});

describe('constructing a timer', () => {
  it('refuses a nonsense interval rather than dividing by it', () => {
    for (const interval of [0, -700, Number.NaN, Number.POSITIVE_INFINITY]) {
      const timer = createAttackTimer(interval);
      expect({ interval: String(interval), intervalMs: timer.intervalMs }).toEqual({
        interval: String(interval),
        intervalMs: 1_000,
      });
    }
  });

  it('starts a hero part-way through a swing when asked, within the interval', () => {
    // Staggering start offsets is what stops six heroes swinging in lockstep.
    expect(createAttackTimer(1_000, 400).bankedMs).toBe(400);
    expect(createAttackTimer(1_000, 4_000).bankedMs).toBe(1_000);
    expect(createAttackTimer(1_000, -400).bankedMs).toBe(0);
  });
});
