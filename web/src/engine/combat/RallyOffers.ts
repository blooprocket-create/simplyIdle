import type { WipeView } from '../types';
import { wipeView } from '../views';
import { hasLapsed, openWipe, resolveWipe, type PendingWipe, type WipeOutcome } from './wipe';

/**
 * The standing offer to rally after a wipe.
 *
 * `wipe.ts` holds the rules — where a retreat goes, what a rally costs, how
 * long the offer stands — and this holds the state machine over them, the same
 * way `BurstMeter` sits over `burst.ts`. Both verbs own their own state so the
 * simulation stays a coordinator; it is under a line cap that exists to stop
 * it absorbing subsystems, and two verbs is exactly when that starts to bite.
 *
 * It never moves the fight itself. `open` reports where the retreat goes and
 * `take` reports where a rally lands, and the simulation does the moving —
 * so there is still one place enemies are spawned and health is set.
 */
export class RallyOffers {
  private pending: PendingWipe | null = null;

  /** The team fell. Returns where the retreat puts them, applied by the caller. */
  open(wave: number, nowMs: number): number {
    this.pending = openWipe(wave, nowMs);
    return this.pending.retreatTo;
  }

  /** Closes an offer nobody took. The retreat already happened when they fell. */
  tick(nowMs: number): void {
    if (this.pending !== null && hasLapsed(this.pending, nowMs)) this.pending = null;
  }

  /**
   * The player answered.
   *
   * Retreating is what already happened, so it only dismisses the offer and
   * returns null. Rallying is the one that moves anything.
   */
  take(choice: 'retreat' | 'rally'): { answered: boolean; outcome: WipeOutcome | null } {
    const pending = this.pending;
    if (pending === null) return { answered: false, outcome: null };
    this.pending = null;
    return { answered: true, outcome: choice === 'rally' ? resolveWipe(pending, 'rally') : null };
  }

  /** Drops the offer without answering. For a stretch nobody was present for. */
  clear(): void {
    this.pending = null;
  }

  view(nowMs: number): WipeView | null {
    return wipeView(this.pending, nowMs);
  }
}
