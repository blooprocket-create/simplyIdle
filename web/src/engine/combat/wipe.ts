import { chapterStartWave } from './chapters';

/**
 * A wipe, as a decision.
 *
 * The shipped game teleported the team to the start of their chapter without
 * a word — REVAMP calls it "a silent teleport to the chapter start", and the
 * only trace it left was a counter going up. A player could lose twenty waves
 * of progress and never be told it had happened.
 *
 * So it offers. The retreat happens immediately — the shipped behaviour,
 * unchanged — and for a few seconds afterwards the player may *rally*
 * instead: back to the wave they fell on, at half health.
 *
 * The retreat being immediate is the important part, and it was not the
 * first design. Pausing the fight to ask cost eight seconds of doing nothing
 * per wipe, which an idle player pays over and over while not even looking;
 * worse, it made the live simulation and the offline estimator describe
 * different games, which the parity test caught within a minute. An offer
 * costs nothing and still gives the player a real decision, so it is both
 * the kinder design and the honest one.
 */

/** How long the team waits to be told what to do. */
export const WIPE_DECISION_MS = 8_000;

/**
 * What a rally costs: the team holds its ground on this fraction of its
 * health. A rally at full health would make retreating strictly worse and
 * the choice no choice at all.
 */
export const RALLY_HEALTH_FRACTION = 0.5;

export interface PendingWipe {
  /** The wave the team fell on. */
  wave: number;
  /** Where a retreat puts them. */
  retreatTo: number;
  /** The health a rally comes back on. */
  rallyHealth: number;
  /** Simulation time the wipe happened. */
  openedAtMs: number;
}

export type WipeChoice = 'retreat' | 'rally' | 'lapsed';

export function openWipe(wave: number, nowMs: number): PendingWipe {
  return {
    wave,
    // Never below the first wave: a retreat onto wave zero would respawn the
    // team into an encounter that does not exist.
    retreatTo: Math.max(1, chapterStartWave(wave)),
    rallyHealth: RALLY_HEALTH_FRACTION,
    openedAtMs: nowMs,
  };
}

/** Milliseconds left to decide. Clamped at zero; the HUD divides by this. */
export function remainingMs(pending: PendingWipe, nowMs: number): number {
  const spent = nowMs - pending.openedAtMs;
  if (!Number.isFinite(spent) || spent <= 0) return WIPE_DECISION_MS;
  return Math.max(0, WIPE_DECISION_MS - spent);
}

export function hasLapsed(pending: PendingWipe, nowMs: number): boolean {
  return nowMs - pending.openedAtMs > WIPE_DECISION_MS;
}

export interface WipeOutcome {
  wave: number;
  /** Fraction of maximum health the team comes back on. */
  healthFraction: number;
}

export function resolveWipe(pending: PendingWipe, choice: WipeChoice): WipeOutcome {
  if (choice === 'rally') return { wave: pending.wave, healthFraction: pending.rallyHealth };
  // `lapsed` and `retreat` are the same outcome on purpose: the thing that
  // happens when nobody answers is the thing the shipped game always did.
  return { wave: pending.retreatTo, healthFraction: 1 };
}
