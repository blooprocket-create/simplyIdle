import { readAwayClock, type AwayVerdict } from '../engine/save/awayClock';
import { readRunProgress, runProgressFrom, writeRunProgress, type RunProgress } from '../engine/save/runProgress';
import type { SimulationSnapshot } from '../engine/types';
import type { PreferenceStore } from '../ui/prefs/store';

/**
 * Where a run is kept between visits.
 *
 * The engine is not allowed to touch storage or read a clock — both are
 * pinned by `engine/architecture.test.ts`, and for good reason: the shipped
 * save reader called `Date.now()` inline, which is why it could not be tested
 * without stubbing a global and why the offline window could be moved by the
 * device clock with nothing able to observe it. So the shape and its
 * validation live in `engine/save/runProgress.ts`, the away arithmetic lives
 * in `engine/save/awayClock.ts`, and *this* is the only place that owns a key,
 * a store and a wall clock.
 *
 * `awayClock.ts` was written, tested and then called by nothing at all. This
 * is what finally calls it.
 */

/** Versioned in the key: a shape change starts a fresh run rather than guessing. */
export const RUN_KEY = 'simplyidle.run.v1';

/** How often a running game writes itself down. */
export const SAVE_INTERVAL_MS = 5_000;

export interface RestoredRun {
  /** Null when there was nothing to read, or nothing readable. */
  resume: RunProgress | null;
  /** Already capped and thresholded; hand straight to the loop. */
  awayMs: number;
  verdict: AwayVerdict;
}

/**
 * Read the stored run and work out how long the player was gone.
 *
 * It restamps the mark as part of reading, which is what `nextAwayAtMs` is
 * for. Without that, a second read moments later — a re-mounted loop, a
 * device-profile change, React's development double-invoke — would credit the
 * same absence twice and hand out the progress twice with it.
 */
export function loadRun(store: PreferenceStore, nowMs: number): RestoredRun {
  const stored = readRunProgress(store.read(RUN_KEY));
  if (stored === null) return { resume: null, awayMs: 0, verdict: 'below-threshold' };

  const reading = readAwayClock(stored.awayAtMs, nowMs);
  const resume: RunProgress = { ...stored, awayAtMs: reading.nextAwayAtMs };
  store.write(RUN_KEY, writeRunProgress(resume));
  return { resume, awayMs: reading.creditedMs, verdict: reading.verdict };
}

/**
 * Writes the run down, at most once per interval.
 *
 * Throttled because the alternative is a `localStorage` write on every one of
 * sixty frames a second, which is a synchronous main-thread call and would
 * cost more than the fight it is recording.
 */
export class RunSaver {
  private lastWriteAtMs: number | null = null;

  constructor(
    private readonly store: PreferenceStore,
    private readonly intervalMs: number = SAVE_INTERVAL_MS,
  ) {}

  /** Called every frame. Returns whether this one actually wrote. */
  tick(snapshot: SimulationSnapshot, nowMs: number): boolean {
    if (this.lastWriteAtMs !== null && nowMs - this.lastWriteAtMs < this.intervalMs) return false;
    this.write(snapshot, nowMs);
    return true;
  }

  /**
   * Called when the page is going away, and on teardown. Always writes.
   *
   * The throttle is what makes this necessary: without it the last up-to-five
   * seconds of a session would be lost every time, which on a boss wave is
   * the whole fight.
   */
  flush(snapshot: SimulationSnapshot, nowMs: number): void {
    this.write(snapshot, nowMs);
  }

  private write(snapshot: SimulationSnapshot, nowMs: number): void {
    this.store.write(RUN_KEY, writeRunProgress(runProgressFrom(snapshot, nowMs)));
    this.lastWriteAtMs = nowMs;
  }
}
