import { Simulation, type SimulationOptions } from '../engine/Simulation';
import { AWAY_THRESHOLD_MS } from '../engine/offline/awayCredit';
import type { SimulationSnapshot } from '../engine/types';

/**
 * Owns the clock and the publish. The simulation does not know about frames
 * and the renderer does not know about time — this is the only place the two
 * meet.
 *
 * Subscribers receive a snapshot, which is why a component can subscribe to
 * one field instead of re-rendering on every tick the way the old reducer
 * forced all eight tabs to.
 */
export type SnapshotListener = (snapshot: SimulationSnapshot) => void;

export class GameLoop {
  private readonly simulation: Simulation;
  private readonly listeners = new Set<SnapshotListener>();
  private frame: number | null = null;
  private lastFrameAt = 0;

  /**
   * The roster comes in from outside. The loop builds no heroes of its own —
   * they are assembled from content and the save by the caller, which is what
   * keeps the clock ignorant of the catalogue.
   */
  constructor(options: SimulationOptions = { heroes: [] }) {
    this.simulation = new Simulation(options);
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.simulation.read());
    return () => this.listeners.delete(listener);
  }

  read(): SimulationSnapshot {
    return this.simulation.read();
  }

  start(): void {
    if (this.frame !== null) return;
    this.lastFrameAt = performance.now();
    const step = () => {
      const now = performance.now();
      const gap = now - this.lastFrameAt;
      /*
       * A frame that took five seconds is not a slow frame, it is a tab that
       * was hidden. Handing that to `advance` would clamp it to twenty swings
       * per hero and discard the rest, so the player would lose the time
       * entirely; the estimator credits it as the sawtooth it actually was.
       */
      if (gap >= AWAY_THRESHOLD_MS) this.simulation.creditAway(gap);
      else this.simulation.advance(gap);
      this.lastFrameAt = now;
      const snapshot = this.simulation.read();
      for (const listener of this.listeners) listener(snapshot);
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  stop(): void {
    if (this.frame === null) return;
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}
