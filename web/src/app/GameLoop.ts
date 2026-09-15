import { Simulation, type SimulationOptions } from '../engine/Simulation';
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
      this.simulation.advance(now - this.lastFrameAt);
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
