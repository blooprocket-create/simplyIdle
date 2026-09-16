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

export interface GameLoopOptions extends SimulationOptions {
  /**
   * Time the player was away, already capped and thresholded by
   * `readAwayClock`. Credited once, before anything subscribes, so the first
   * snapshot a subscriber sees is the one that already includes it — a
   * player who returns to eleven waves of progress should not watch it
   * arrive a frame after the screen paints.
   */
  awayMs?: number;
}

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
  constructor(options: GameLoopOptions = { heroes: [] }) {
    this.simulation = new Simulation(options);
    if (options.awayMs !== undefined && options.awayMs > 0) this.simulation.creditAway(options.awayMs);
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.simulation.read());
    return () => this.listeners.delete(listener);
  }

  read(): SimulationSnapshot {
    return this.simulation.read();
  }

  /**
   * The player pressed BURST.
   *
   * Publishes immediately rather than waiting for the next frame: the press
   * is the player's own input and the HUD showing it a frame late is the
   * difference between a verb that feels answered and one that feels ignored.
   */
  /** Whether a lapsed BURST window fires itself. */
  setAutoBurst(on: boolean): void {
    this.simulation.setAutoBurst(on);
  }

  /** The player answered a wipe offer. Publishes for the same reason. */
  decideWipe(choice: 'retreat' | 'rally'): boolean {
    const decided = this.simulation.decideWipe(choice);
    if (decided) {
      const snapshot = this.simulation.read();
      for (const listener of this.listeners) listener(snapshot);
    }
    return decided;
  }

  /** The player answered a boss tell. Publishes for the same reason. */
  answerTell(): boolean {
    const answered = this.simulation.answerTell();
    if (answered) {
      const snapshot = this.simulation.read();
      for (const listener of this.listeners) listener(snapshot);
    }
    return answered;
  }

  spendBurst(): ReturnType<Simulation['spendBurst']> {
    const result = this.simulation.spendBurst();
    if (result.spent) {
      const snapshot = this.simulation.read();
      for (const listener of this.listeners) listener(snapshot);
    }
    return result;
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
