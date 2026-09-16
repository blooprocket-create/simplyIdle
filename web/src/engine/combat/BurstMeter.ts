import type { BurstView } from '../types';
import { burstView } from '../views';
import { chargeAfterKill, emptyBurst, lapse, spend, type BurstQuality, type BurstState } from './burst';

/**
 * The BURST meter, as a thing that owns its own rules.
 *
 * `burst.ts` holds the arithmetic — where the window's peak is, what a press
 * at a given moment pays — and this holds the state machine over it: charging,
 * the open window, and whether a lapsed one fires itself.
 *
 * It is separate from `Simulation` because the simulation is under a line cap
 * that exists to stop it absorbing subsystems, and this is a subsystem. What
 * it deliberately does *not* do is deal damage: it returns a payload and the
 * simulation lands it, so there is still exactly one path by which anything
 * gets hurt.
 */
export interface BurstPayload {
  multiplier: number;
  seconds: number;
}

export class BurstMeter {
  private state: BurstState = emptyBurst();

  /** Whether a lapsed window fires itself at the floor. Earned, not default. */
  constructor(private readonly automated: boolean) {}

  charge(boss: boolean, nowMs: number): void {
    this.state = chargeAfterKill(this.state, { boss, nowMs });
  }

  /** The player pressed. Null when there was no window to press into. */
  spend(nowMs: number): { payload: BurstPayload | null; quality: BurstQuality } {
    const result = spend(this.state, nowMs);
    this.state = result.state;
    if (!result.spent) return { payload: null, quality: result.quality };
    return { payload: { multiplier: result.multiplier, seconds: result.seconds }, quality: result.quality };
  }

  /** The step ended. Returns a payload only when automation fired one. */
  tick(nowMs: number): BurstPayload | null {
    const result = lapse(this.state, nowMs, { automated: this.automated });
    this.state = result.state;
    return result.fired ? { multiplier: result.multiplier, seconds: result.seconds } : null;
  }

  view(nowMs: number): BurstView {
    return burstView(this.state, nowMs);
  }
}
