import { EMPTY_SNAPSHOT, type SimulationSnapshot } from './types';

/**
 * The coordinator. It owns the clock and delegates every rule to a subsystem —
 * it does not implement any of them itself.
 *
 * `architecture.test.ts` caps this file's length, because the reason this
 * rewrite exists is that the previous simulation reached 5,901 lines without
 * anything objecting. The cap is the objection.
 */
export class Simulation {
  private snapshot: SimulationSnapshot = EMPTY_SNAPSHOT;

  /** Advances the simulation by `elapsedMs`. Pure with respect to the clock. */
  advance(elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
    this.snapshot = {
      ...this.snapshot,
      elapsedMs: this.snapshot.elapsedMs + elapsedMs,
      ticks: this.snapshot.ticks + 1,
    };
  }

  /** The current read model. Callers must treat it as immutable. */
  read(): SimulationSnapshot {
    return this.snapshot;
  }
}
