import { BURST_COST, burstQuality, isWindowOpen, peakBand, windowProgress, type BurstState } from './combat/burst';
import { chipFor, isTellOpen, tellProgress, untilNextTell, type TellState } from './combat/bossTells';
import { WIPE_DECISION_MS, remainingMs, type PendingWipe } from './combat/wipe';
import type { BossMechanic } from '../content/bossMechanics';
import type Decimal from 'break_eternity.js';
import type { KillPayout } from './combat/killPayout';
import type { Purse } from './combat/rewards';
import type { BossView, BurstView, SimulationSnapshot, WipeView } from './types';

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

export function bossView(state: TellState, mechanic: BossMechanic, nowMs: number): BossView {
  return {
    name: mechanic.name,
    tell: mechanic.tell,
    open: isTellOpen(state, mechanic, nowMs),
    progress: tellProgress(state, mechanic, nowMs),
    streak: state.streak,
    // What the *next* answer is worth, so the HUD can show a chain paying off
    // rather than only reporting a count nobody can price.
    chipSeconds: chipFor(mechanic, state.streak),
    nextInMs: untilNextTell(state, nowMs),
  };
}

/**
 * The run's tallies, as a HUD reads them.
 *
 * Four counters the simulation keeps and everything the earnings module does,
 * joined. Here rather than in `Simulation.read` for this file's stated reason:
 * it is presentation of state rather than advancement of it, and the
 * coordinator has a line cap that exists to stop it absorbing exactly this.
 */
export function totalsView(
  counts: { kills: number; deaths: number; dealt: Decimal; overkill: Decimal },
  earned: Purse,
  spoils: KillPayout,
): SimulationSnapshot['totals'] {
  return {
    kills: counts.kills,
    deaths: counts.deaths,
    dealt: counts.dealt,
    overkill: counts.overkill,
    gold: earned.gold,
    exp: earned.exp,
    essence: spoils.essence,
    bossTears: spoils.bossTears,
    seasonPoints: spoils.seasonPoints,
    masteryXp: spoils.masteryXp,
  };
}
