/**
 * BURST, as a timing window rather than a button.
 *
 * The shipped verb was not one. Charge filled on kills, and at fifteen the
 * player pressed a button that always paid the same 1.8x — or `autoBurst`
 * pressed it for them the instant it filled, which is the same outcome with
 * nobody in the chair. REVAMP's Phase 4 asks for a verb the player can be
 * good at, and line 178 says why it matters: the offline estimator is up to
 * 4x off across a climb precisely because "a mean cannot spend a cooldown at
 * the right moment". A verb with no right moment has nothing to model.
 *
 * So the window sweeps. It opens when the meter fills, the payout rises to a
 * peak and falls away again, and the player is aiming at the peak. Everything
 * here is a pure function of how long the window has been open, because a
 * timing mechanic that can only be exercised by waiting in a browser is a
 * timing mechanic nobody can test.
 *
 * Two departures from the shipped version, both deliberate:
 *
 *   - **No crit.** The shipped burst rolled a 20% chance of a further 1.8x.
 *     A random multiplier on top of a timing verb breaks the feedback the
 *     timing depends on: the player cannot tell a well-timed press from a
 *     lucky one, so there is nothing to learn. The variance moves into the
 *     part the player controls.
 *   - **A missed window costs the opportunity, not the meter.** This is
 *     still an idle game. A player who is not watching keeps their charge
 *     and gets another window; they simply never collect the peak.
 */

/** Ported from the shipped game. Balance is not what Phase 4 is changing. */
export const BURST_COST = 15;
export const BURST_KILL_CHARGE = 1;
export const BURST_BOSS_CHARGE = 3;

/**
 * How long the window stays open. Long enough to react to on a phone, short
 * enough that hitting the peak is a decision rather than a formality.
 */
export const BURST_WINDOW_MS = 2_400;

/** Seconds of team damage a burst is worth, before the multiplier. */
export const BURST_SECONDS = 5;

export const FLOOR_MULTIPLIER = 1;
export const PEAK_MULTIPLIER = 3;

/**
 * Where the peak sits in the window, as fractions of it.
 *
 * Deliberately past the middle: a player who mashes the instant the window
 * opens should get the floor, or the verb is "press immediately" with extra
 * steps. The band is a fifth of the window — about 480ms — which is a
 * reaction, not a frame-perfect input.
 */
const PEAK_START = 0.55;
const PEAK_END = 0.75;

export interface BurstState {
  /** 0 to `BURST_COST`. */
  charge: number;
  /** When the current window opened, or null when none is open. */
  windowOpenedAtMs: number | null;
}

export function emptyBurst(): BurstState {
  return { charge: 0, windowOpenedAtMs: null };
}

export function chargeAfterKill(state: BurstState, event: { boss: boolean; nowMs: number }): BurstState {
  const gained = event.boss ? BURST_BOSS_CHARGE : BURST_KILL_CHARGE;
  const charge = Math.min(BURST_COST, state.charge + gained);
  // A kill that lands mid-window must not restart it: sliding the peak out
  // from under a press in progress is the one thing a timing verb cannot do.
  if (state.windowOpenedAtMs !== null) return { ...state, charge };
  return { charge, windowOpenedAtMs: charge >= BURST_COST ? event.nowMs : null };
}

export function isWindowOpen(state: BurstState, nowMs: number): boolean {
  if (state.windowOpenedAtMs === null || state.charge < BURST_COST) return false;
  const held = nowMs - state.windowOpenedAtMs;
  return held >= 0 && held <= BURST_WINDOW_MS;
}

/**
 * The payout for a press this far into the window.
 *
 * Ramps from the floor to the peak, holds across the band, falls back. A
 * press outside the window — or before it, or on a NaN clock — pays the
 * floor rather than throwing: the caller is a render loop.
 */
export function burstMultiplier(heldMs: number): number {
  if (!Number.isFinite(heldMs) || heldMs <= 0 || heldMs >= BURST_WINDOW_MS) return FLOOR_MULTIPLIER;
  const t = heldMs / BURST_WINDOW_MS;
  const span = PEAK_MULTIPLIER - FLOOR_MULTIPLIER;
  if (t < PEAK_START) return FLOOR_MULTIPLIER + span * (t / PEAK_START);
  if (t <= PEAK_END) return PEAK_MULTIPLIER;
  return FLOOR_MULTIPLIER + span * ((1 - t) / (1 - PEAK_END));
}

export type BurstQuality = 'early' | 'good' | 'perfect' | 'late' | 'missed';

/** The same moment, in a word the HUD can show without quoting a number. */
export function burstQuality(heldMs: number): BurstQuality {
  if (!Number.isFinite(heldMs) || heldMs < 0 || heldMs > BURST_WINDOW_MS) return 'missed';
  const t = heldMs / BURST_WINDOW_MS;
  if (t >= PEAK_START && t <= PEAK_END) return 'perfect';
  // "Good" is the shoulder either side of the peak, where the payout is
  // already most of the way up. Without it every near-miss reads as a
  // failure, which is not what a near-miss should feel like.
  if (t >= PEAK_START * 0.6 && t < PEAK_START) return 'good';
  if (t > PEAK_END && t <= PEAK_END + (1 - PEAK_END) * 0.5) return 'good';
  return t < PEAK_START ? 'early' : 'late';
}

/** 0 to 1 across the window, for drawing the sweep. Clamped and always finite. */
export function windowProgress(heldMs: number): number {
  if (!Number.isFinite(heldMs) || heldMs <= 0) return 0;
  if (heldMs >= BURST_WINDOW_MS) return 1;
  return heldMs / BURST_WINDOW_MS;
}

/** Where the peak band sits, so the HUD can mark it rather than guess. */
export function peakBand(): { start: number; end: number } {
  return { start: PEAK_START, end: PEAK_END };
}

export interface BurstResult {
  state: BurstState;
  spent: boolean;
  multiplier: number;
  seconds: number;
  quality: BurstQuality;
}

/** The player pressed. */
export function spend(state: BurstState, nowMs: number): BurstResult {
  if (!isWindowOpen(state, nowMs)) {
    return { state, spent: false, multiplier: FLOOR_MULTIPLIER, seconds: 0, quality: 'missed' };
  }
  const held = nowMs - (state.windowOpenedAtMs ?? nowMs);
  return {
    state: { charge: 0, windowOpenedAtMs: null },
    spent: true,
    multiplier: burstMultiplier(held),
    seconds: BURST_SECONDS,
    quality: burstQuality(held),
  };
}

export interface LapseResult {
  state: BurstState;
  fired: boolean;
  multiplier: number;
  seconds: number;
}

/**
 * The window closed with nobody pressing.
 *
 * Unautomated, the charge survives and a fresh window opens: missing costs
 * the opportunity, not the meter. Automated — which Phase 4 makes something
 * the player unlocks rather than something on by default — it fires at the
 * floor. That is precisely what the unlock buys: never missing. It does not
 * buy playing well, so a hand-played burst stays worth up to three times an
 * automated one.
 */
export function lapse(state: BurstState, nowMs: number, options: { automated: boolean }): LapseResult {
  const opened = state.windowOpenedAtMs;
  if (opened === null || state.charge < BURST_COST) {
    return { state, fired: false, multiplier: FLOOR_MULTIPLIER, seconds: 0 };
  }
  if (nowMs - opened <= BURST_WINDOW_MS) {
    return { state, fired: false, multiplier: FLOOR_MULTIPLIER, seconds: 0 };
  }
  if (!options.automated) {
    return { state: { ...state, windowOpenedAtMs: nowMs }, fired: false, multiplier: FLOOR_MULTIPLIER, seconds: 0 };
  }
  return {
    state: { charge: 0, windowOpenedAtMs: null },
    fired: true,
    multiplier: FLOOR_MULTIPLIER,
    seconds: BURST_SECONDS,
  };
}

/**
 * The uid a burst's damage is attributed to.
 *
 * A burst is the whole team at once, so it borrows no hero's id: the renderer
 * places floating numbers by hashing the uid, and borrowing one would stack
 * the burst's number exactly on top of that hero's own.
 */
export const BURST_HIT_UID = 'burst';
