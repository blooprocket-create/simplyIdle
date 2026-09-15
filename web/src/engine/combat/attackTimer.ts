/**
 * A recurring attack timer.
 *
 * Small enough to look like it does not need its own module, and it does: the
 * whole reason discrete attacks are hard is in the remainder.
 *
 * A timer that resets to zero when it fires loses whatever time was left over,
 * so a hero swinging every 700ms ticked at 60fps fires at 700ms but ticked at
 * 30fps fires at 733ms — damage output would quietly depend on frame rate, and
 * on a slow device the game would get *easier to lose*. Carrying the remainder
 * makes the attack count over any span depend only on the span, which is the
 * property `attackTimer.test.ts` proves by chunking the same ten seconds every
 * way it can.
 */

export interface AttackTimer {
  intervalMs: number;
  /** Time banked toward the next swing. Always less than `intervalMs`. */
  bankedMs: number;
}

/**
 * A step long enough to owe more than this many attacks has been paused,
 * backgrounded, or stepped by a debugger. Offline time is credited by the
 * offline estimator, which models the sawtooth properly; replaying it as a
 * burst of simultaneous swings would both lie about the fight and lock the
 * main thread for as long as the tab was hidden.
 */
export const MAX_ATTACKS_PER_STEP = 20;

export function createAttackTimer(intervalMs: number, bankedMs = 0): AttackTimer {
  const safeInterval = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 1_000;
  return { intervalMs: safeInterval, bankedMs: Math.max(0, Math.min(bankedMs, safeInterval)) };
}

export interface TimerStep {
  timer: AttackTimer;
  /** How many attacks came due during this step. */
  attacks: number;
  /** True when the step owed more attacks than it was allowed to fire. */
  clamped: boolean;
}

export function advanceAttackTimer(timer: AttackTimer, deltaMs: number): TimerStep {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return { timer, attacks: 0, clamped: false };
  }

  const banked = timer.bankedMs + deltaMs;
  const owed = Math.floor(banked / timer.intervalMs);
  const attacks = Math.min(owed, MAX_ATTACKS_PER_STEP);
  const clamped = owed > attacks;

  return {
    // The remainder carries. Dropping it is what makes damage frame-rate
    // dependent; a clamped step discards the excess deliberately instead.
    timer: { intervalMs: timer.intervalMs, bankedMs: clamped ? 0 : banked - attacks * timer.intervalMs },
    attacks,
    clamped,
  };
}

/** How far through the current swing, 0 to 1. What a cast bar reads. */
export function swingProgress(timer: AttackTimer): number {
  return Math.max(0, Math.min(1, timer.bankedMs / timer.intervalMs));
}
