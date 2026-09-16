import { BURST_COST, burstQuality, isWindowOpen, peakBand, windowProgress, type BurstState } from './combat/burst';
import { WIPE_DECISION_MS, remainingMs, type PendingWipe } from './combat/wipe';
import type { BurstView, WipeView } from './types';

/**
 * Turning the fight's internal state into what a HUD reads.
 *
 * Kept out of `Simulation` because it is presentation of state rather than
 * advancement of it, and because the simulation is under a line cap that
 * exists precisely to stop it absorbing work like this. It is also easier to
 * test here: both of these are pure, and neither needs a fight to have
 * happened.
 */

export function burstView(state: BurstState, nowMs: number): BurstView {
  // Derived rather than stored: the window is a function of how long it has
  // been open, so the snapshot reports where the sweep is *now* instead of
  // asking the HUD to run a second clock alongside the simulation's.
  const held = state.windowOpenedAtMs === null ? null : nowMs - state.windowOpenedAtMs;
  return {
    charge: state.charge,
    cost: BURST_COST,
    ready: state.charge >= BURST_COST,
    windowOpen: isWindowOpen(state, nowMs),
    progress: held === null ? 0 : windowProgress(held),
    quality: held === null ? 'missed' : burstQuality(held),
    peak: peakBand(),
  };
}

export function wipeView(pending: PendingWipe | null, nowMs: number): WipeView | null {
  if (pending === null) return null;
  const left = remainingMs(pending, nowMs);
  return {
    wave: pending.wave,
    retreatTo: pending.retreatTo,
    rallyHealth: pending.rallyHealth,
    remainingMs: left,
    urgency: 1 - left / WIPE_DECISION_MS,
  };
}
