/**
 * The away clock: how long a save was gone, and how much of that to believe.
 *
 * The shipped game answers this with `Date.now() - payload.lastActiveAt`,
 * clamped so the stored stamp cannot be in the future. That defends against a
 * *save* claiming an impossible time, and against nothing else. In particular
 * it does not defend against the device clock itself moving, which is the only
 * input a player can actually change: wind the clock forward, load, collect a
 * capped offline window, wind forward again. Each cycle is free.
 *
 * The fix here is the one evercast uses: keep a **monotonic high-water mark**
 * instead of a last-seen stamp. The mark never moves backwards, so time can
 * only ever be spent once.
 *
 * What that does and does not buy, stated plainly because the difference
 * matters:
 *
 * - A clock rolled **backwards** yields nothing. The mark stays where it was,
 *   the reading is negative, and no credit is given. The shipped code would
 *   have clamped the stamp down to the rolled-back `now` and then handed out a
 *   full window on the next honest load.
 * - A clock jumped **forwards** still yields one capped window, exactly as it
 *   does today. What changes is the price: the mark advances to the jumped-to
 *   time, so returning the clock to the truth costs the player every hour they
 *   skipped. Cheating forwards now has a bill attached.
 * - Nothing here is a substitute for a trusted server timestamp. When one is
 *   available the mark should be fed from it; `readAwayClock` takes `nowMs` as
 *   an argument precisely so the caller decides where time comes from.
 *
 * The verdict is returned rather than swallowed so the app layer can act on a
 * rollback — log it, ask the server, or simply show the player that their
 * clock disagrees with the game's.
 */

/** Matches the shipped `OFFLINE_PROGRESS_CAP_MS`. */
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;

/** Below this, the shipped reducer credits nothing and just restamps. */
export const OFFLINE_MIN_MS = 5_000;

/**
 * Forward jumps larger than this are reported as suspicious. Chosen as the
 * cap plus a day: a real player can be away for a week, but a *single* reading
 * that large means the account was dormant, which is a different case from a
 * session that went to sleep and is worth telling apart in telemetry.
 */
export const SUSPICIOUS_FORWARD_JUMP_MS = OFFLINE_CAP_MS + 24 * 60 * 60 * 1000;

export type AwayVerdict = 'ok' | 'capped' | 'below-threshold' | 'clock-rolled-back';

export interface AwayReading {
  /** Offline time to actually simulate, after the cap and the threshold. */
  creditedMs: number;
  /** Raw elapsed since the mark. Negative when the clock moved backwards. */
  observedMs: number;
  /** The mark to store. Never less than the mark passed in. */
  nextAwayAtMs: number;
  verdict: AwayVerdict;
  /** True when the reading is large enough to be worth recording. */
  suspicious: boolean;
}

export interface AwayClockOptions {
  capMs?: number;
  minMs?: number;
}

export function readAwayClock(awayAtMs: number, nowMs: number, options: AwayClockOptions = {}): AwayReading {
  const capMs = options.capMs ?? OFFLINE_CAP_MS;
  const minMs = options.minMs ?? OFFLINE_MIN_MS;

  const mark = Number.isFinite(awayAtMs) ? Math.max(0, awayAtMs) : 0;
  const now = Number.isFinite(nowMs) ? Math.max(0, nowMs) : mark;
  const observedMs = now - mark;

  // The mark is the high-water mark, so it only ever moves forward.
  const nextAwayAtMs = Math.max(mark, now);

  if (observedMs < 0) {
    return {
      creditedMs: 0,
      observedMs,
      nextAwayAtMs,
      verdict: 'clock-rolled-back',
      suspicious: true,
    };
  }

  if (observedMs < minMs) {
    return { creditedMs: 0, observedMs, nextAwayAtMs, verdict: 'below-threshold', suspicious: false };
  }

  const suspicious = observedMs > SUSPICIOUS_FORWARD_JUMP_MS;

  if (observedMs > capMs) {
    return { creditedMs: capMs, observedMs, nextAwayAtMs, verdict: 'capped', suspicious };
  }

  return { creditedMs: observedMs, observedMs, nextAwayAtMs, verdict: 'ok', suspicious };
}

/**
 * Advance the mark without crediting anything — for a periodic autosave, where
 * the point is to record that the session is still alive.
 */
export function touchAwayClock(awayAtMs: number, nowMs: number): number {
  const mark = Number.isFinite(awayAtMs) ? Math.max(0, awayAtMs) : 0;
  const now = Number.isFinite(nowMs) ? Math.max(0, nowMs) : mark;
  return Math.max(mark, now);
}
