import { describe, expect, it } from 'vitest';
import {
  BURST_BOSS_CHARGE,
  BURST_COST,
  BURST_KILL_CHARGE,
  BURST_SECONDS,
  BURST_WINDOW_MS,
  FLOOR_MULTIPLIER,
  PEAK_MULTIPLIER,
  burstQuality,
  burstMultiplier,
  chargeAfterAwayKills,
  chargeAfterKill,
  peakBand,
  emptyBurst,
  isWindowOpen,
  lapse,
  spend,
  windowProgress,
  type BurstState,
} from './burst';

const full: BurstState = { charge: BURST_COST, windowOpenedAtMs: 1_000 };

describe('charging a burst', () => {
  it('fills on kills, faster on a boss, and stops at full', () => {
    // The shipped numbers, ported: one per kill, three for a boss, full at
    // fifteen. Balance is not what Phase 4 is changing.
    let state = emptyBurst();
    expect(state.charge).toBe(0);
    state = chargeAfterKill(state, { boss: false, nowMs: 0 });
    expect(state.charge).toBe(BURST_KILL_CHARGE);
    state = chargeAfterKill(state, { boss: true, nowMs: 0 });
    expect(state.charge).toBe(BURST_KILL_CHARGE + BURST_BOSS_CHARGE);

    for (let kill = 0; kill < 100; kill += 1) state = chargeAfterKill(state, { boss: true, nowMs: 0 });
    expect(state.charge).toBe(BURST_COST);
  });

  it('opens the window the moment it fills, and not before', () => {
    let state = emptyBurst();
    for (let kill = 0; kill < BURST_COST - 1; kill += 1) {
      state = chargeAfterKill(state, { boss: false, nowMs: kill * 100 });
      expect(isWindowOpen(state, kill * 100), `after ${kill + 1} kills`).toBe(false);
    }
    state = chargeAfterKill(state, { boss: false, nowMs: 5_000 });
    expect(state.charge).toBe(BURST_COST);
    expect(isWindowOpen(state, 5_000)).toBe(true);
  });

  it('does not restart the window on a kill that lands while it is open', () => {
    // Otherwise a kill during the window would slide the peak out from under
    // the player mid-press, which is the one thing a timing verb must not do.
    const state = chargeAfterKill(full, { boss: true, nowMs: 1_500 });
    expect(state.windowOpenedAtMs).toBe(full.windowOpenedAtMs);
    expect(state.charge).toBe(BURST_COST);
  });
});

describe('the timing window', () => {
  const at = (ms: number) => burstMultiplier(ms);

  it('is worth the least at both edges and the most in the middle band', () => {
    expect(at(0)).toBeCloseTo(FLOOR_MULTIPLIER, 5);
    expect(at(BURST_WINDOW_MS)).toBeCloseTo(FLOOR_MULTIPLIER, 5);
    expect(at(BURST_WINDOW_MS * 0.65)).toBeCloseTo(PEAK_MULTIPLIER, 5);
  });

  it('never pays more than the peak or less than the floor, anywhere inside', () => {
    for (let ms = 0; ms <= BURST_WINDOW_MS; ms += 10) {
      expect(at(ms), `${ms}ms`).toBeGreaterThanOrEqual(FLOOR_MULTIPLIER);
      expect(at(ms), `${ms}ms`).toBeLessThanOrEqual(PEAK_MULTIPLIER);
    }
  });

  it('actually sweeps, rather than paying the same everywhere inside', () => {
    /*
     * The test that matters, and the one this file did not have at first.
     * Making `burstMultiplier` return the peak unconditionally — which is the
     * flat shipped behaviour Phase 4 exists to replace — passed every other
     * assertion here: the edges are caught by the guard clause before the
     * curve is consulted, and "never dips" is trivially true of a constant.
     */
    expect(at(BURST_WINDOW_MS * 0.1)).toBeLessThan(at(BURST_WINDOW_MS * 0.65));
    expect(at(BURST_WINDOW_MS * 0.95)).toBeLessThan(at(BURST_WINDOW_MS * 0.65));
    // A press straight after the window opens is worth nearer the floor than
    // the peak, or "wait for it" is not advice.
    expect(at(BURST_WINDOW_MS * 0.05)).toBeLessThan((FLOOR_MULTIPLIER + PEAK_MULTIPLIER) / 2);
  });

  it('rises strictly to the peak, then falls strictly away from it', () => {
    // Strictly, not merely without dipping — see above.
    let previous = at(1);
    for (let ms = 10; ms <= BURST_WINDOW_MS * 0.54; ms += 10) {
      expect(at(ms), `rising at ${ms}ms`).toBeGreaterThan(previous);
      previous = at(ms);
    }
    previous = at(BURST_WINDOW_MS * 0.76);
    for (let ms = BURST_WINDOW_MS * 0.77; ms < BURST_WINDOW_MS; ms += 10) {
      expect(at(ms), `falling at ${ms}ms`).toBeLessThan(previous);
      previous = at(ms);
    }
  });

  it('holds the peak flat across the band, so it is hittable', () => {
    // The band is the thing being aimed at; if it were a single instant the
    // verb would be a reflex test rather than a timing one.
    const band = peakBand();
    for (let t = band.start; t <= band.end; t += 0.01) {
      expect(at(BURST_WINDOW_MS * t), `t=${t.toFixed(2)}`).toBeCloseTo(PEAK_MULTIPLIER, 5);
    }
    expect(band.end - band.start).toBeGreaterThan(0.1);
  });

  it('pays the floor for a press outside the window entirely', () => {
    expect(at(-50)).toBeCloseTo(FLOOR_MULTIPLIER, 5);
    expect(at(BURST_WINDOW_MS + 1)).toBeCloseTo(FLOOR_MULTIPLIER, 5);
    expect(at(Number.NaN)).toBeCloseTo(FLOOR_MULTIPLIER, 5);
  });

  it('names the moment in words the HUD can show', () => {
    expect(burstQuality(BURST_WINDOW_MS * 0.65)).toBe('perfect');
    expect(burstQuality(0)).toBe('early');
    expect(burstQuality(BURST_WINDOW_MS)).toBe('late');
    expect(burstQuality(BURST_WINDOW_MS + 1)).toBe('missed');
    // 'good' has to be reachable, or the word is a lie in the UI.
    const labels = new Set<string>();
    for (let ms = 0; ms <= BURST_WINDOW_MS; ms += 5) labels.add(burstQuality(ms));
    expect(labels).toContain('good');
  });

  it('reports a bar position the HUD can draw, clamped', () => {
    expect(windowProgress(0)).toBe(0);
    expect(windowProgress(BURST_WINDOW_MS / 2)).toBeCloseTo(0.5, 5);
    expect(windowProgress(BURST_WINDOW_MS)).toBe(1);
    expect(windowProgress(BURST_WINDOW_MS * 5)).toBe(1);
    expect(windowProgress(-100)).toBe(0);
    expect(windowProgress(Number.NaN)).toBe(0);
  });
});

describe('spending a burst', () => {
  it('pays out the multiplier for when it was pressed', () => {
    const peak = spend(full, 1_000 + BURST_WINDOW_MS * 0.65);
    expect(peak.spent).toBe(true);
    expect(peak.multiplier).toBeCloseTo(PEAK_MULTIPLIER, 5);
    expect(peak.seconds).toBe(BURST_SECONDS);

    const sloppy = spend(full, 1_000);
    expect(sloppy.multiplier).toBeCloseTo(FLOOR_MULTIPLIER, 5);
  });

  it('empties the charge and shuts the window', () => {
    const after = spend(full, 1_000 + BURST_WINDOW_MS * 0.65).state;
    expect(after.charge).toBe(0);
    expect(after.windowOpenedAtMs).toBeNull();
    expect(isWindowOpen(after, 2_000)).toBe(false);
  });

  it('refuses when there is no window to spend into', () => {
    const half: BurstState = { charge: 7, windowOpenedAtMs: null };
    const result = spend(half, 500);
    expect(result.spent).toBe(false);
    expect(result.state).toEqual(half);
  });

  it('refuses a second press in the same window', () => {
    const first = spend(full, 1_000 + BURST_WINDOW_MS * 0.6);
    const second = spend(first.state, 1_000 + BURST_WINDOW_MS * 0.7);
    expect(second.spent).toBe(false);
  });
});

describe('a window nobody answered', () => {
  it('keeps the charge, so an idle player is never worse off than not playing', () => {
    // Losing the charge would make ignoring the verb a punishment, and this
    // is still an idle game. Missing costs the *opportunity*, not the meter.
    const after = lapse(full, 1_000 + BURST_WINDOW_MS + 1, { automated: false });
    expect(after.fired).toBe(false);
    expect(after.state.charge).toBe(BURST_COST);
  });

  it('reopens so the next kill is not needed to try again', () => {
    const after = lapse(full, 1_000 + BURST_WINDOW_MS + 1, { automated: false });
    expect(after.state.windowOpenedAtMs).toBe(1_000 + BURST_WINDOW_MS + 1);
    expect(isWindowOpen(after.state, 1_000 + BURST_WINDOW_MS + 1)).toBe(true);
  });

  it('fires at the floor once automation is unlocked, never at the peak', () => {
    // This is what the unlock buys: never missing. It does not buy playing
    // well, so hand-played bursts stay strictly better than automated ones.
    const after = lapse(full, 1_000 + BURST_WINDOW_MS + 1, { automated: true });
    expect(after.fired).toBe(true);
    expect(after.multiplier).toBeCloseTo(FLOOR_MULTIPLIER, 5);
    expect(after.multiplier).toBeLessThan(PEAK_MULTIPLIER);
    expect(after.state.charge).toBe(0);
  });

  it('does nothing at all while the window is still open', () => {
    const early = lapse(full, 1_000 + BURST_WINDOW_MS / 2, { automated: true });
    expect(early.fired).toBe(false);
    expect(early.state).toEqual(full);
  });
});

describe('charge for time the player was away', () => {
  it('charges the meter at all, which the offline path did not', () => {
    /*
     * `creditAway` credited kills, deaths and the wave and left the meter
     * untouched, so an hour in a background tab returned the player a longer
     * climb and an empty BURST. The one reward the verb pays was the one
     * thing the bridge dropped.
     */
    const after = chargeAfterAwayKills(emptyBurst(), { kills: 4, nowMs: 1_000 });
    expect(after.charge).toBe(4 * BURST_KILL_CHARGE);
  });

  it('pays the same as living through those kills', () => {
    let lived = emptyBurst();
    for (let kill = 0; kill < 9; kill += 1) lived = chargeAfterKill(lived, { boss: false, nowMs: 1_000 });
    const away = chargeAfterAwayKills(emptyBurst(), { kills: 9, nowMs: 1_000 });
    expect(away.charge).toBe(lived.charge);
  });

  it('opens one window and only one, however long the player was gone', () => {
    // The clamp is what makes this safe: an overnight absence cannot be
    // banked into a queue of windows to detonate on arrival.
    const brief = chargeAfterAwayKills(emptyBurst(), { kills: BURST_COST, nowMs: 5_000 });
    const overnight = chargeAfterAwayKills(emptyBurst(), { kills: 400_000, nowMs: 5_000 });
    expect(overnight.charge).toBe(BURST_COST);
    expect(overnight).toEqual(brief);
    expect(isWindowOpen(overnight, 5_000)).toBe(true);
  });

  it('opens that window at the moment the player returned', () => {
    // Opening it at a timestamp that passed while the tab was hidden would
    // hand the player a window that had already lapsed.
    const after = chargeAfterAwayKills(emptyBurst(), { kills: BURST_COST, nowMs: 90_000 });
    expect(after.windowOpenedAtMs).toBe(90_000);
  });

  it('leaves a window already open where it is', () => {
    // Same rule as a live kill: nothing slides the peak out from under a
    // press in progress, and a returning player may be mid-window.
    const open: BurstState = { charge: BURST_COST, windowOpenedAtMs: 1_000 };
    const after = chargeAfterAwayKills(open, { kills: 30, nowMs: 90_000 });
    expect(after.windowOpenedAtMs).toBe(1_000);
  });

  it('does nothing for a gap that credited no kills', () => {
    const empty = emptyBurst();
    expect(chargeAfterAwayKills(empty, { kills: 0, nowMs: 1_000 })).toEqual(empty);
    expect(chargeAfterAwayKills(empty, { kills: -3, nowMs: 1_000 })).toEqual(empty);
    expect(chargeAfterAwayKills(empty, { kills: Number.NaN, nowMs: 1_000 })).toEqual(empty);
  });
});
