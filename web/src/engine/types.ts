/**
 * The read model the UI and renderer subscribe to. Everything outside
 * `src/engine` reads state through a snapshot and never reaches into
 * simulation internals, which is what lets the simulation be replaced
 * without touching a component.
 */
export interface SimulationSnapshot {
  /** Wall-clock ms the simulation has advanced since the run began. */
  elapsedMs: number;
  /** Furthest wave reached this run. Drives campaign gating. */
  wave: number;
  /** Ticks completed. Phase 1 replaces this with real combat state. */
  ticks: number;
}

export const EMPTY_SNAPSHOT: SimulationSnapshot = {
  elapsedMs: 0,
  wave: 1,
  ticks: 0,
};
