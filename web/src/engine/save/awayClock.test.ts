import { describe, expect, it } from 'vitest';
import { OFFLINE_CAP_MS, OFFLINE_MIN_MS, SUSPICIOUS_FORWARD_JUMP_MS, readAwayClock, touchAwayClock } from './awayClock';

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);

describe('crediting honest time away', () => {
  it('credits the full gap when it is under the cap', () => {
    const reading = readAwayClock(T0, T0 + 3 * HOUR);
    expect(reading).toEqual({
      creditedMs: 3 * HOUR,
      observedMs: 3 * HOUR,
      nextAwayAtMs: T0 + 3 * HOUR,
      verdict: 'ok',
      suspicious: false,
    });
  });

  it('caps a long absence at eight hours, matching the shipped cap', () => {
    const reading = readAwayClock(T0, T0 + 30 * HOUR);
    expect(reading.creditedMs).toBe(OFFLINE_CAP_MS);
    expect(reading.observedMs).toBe(30 * HOUR);
    expect(reading.verdict).toBe('capped');
    expect(OFFLINE_CAP_MS).toBe(8 * HOUR);
  });

  it('credits nothing for a gap below the threshold, but still advances', () => {
    const reading = readAwayClock(T0, T0 + 1_000);
    expect(reading.creditedMs).toBe(0);
    expect(reading.verdict).toBe('below-threshold');
    // The mark still moves: a page refresh is not free offline time, but it is
    // also not a reason to keep re-crediting the same second.
    expect(reading.nextAwayAtMs).toBe(T0 + 1_000);
    expect(OFFLINE_MIN_MS).toBe(5_000);
  });

  it('credits exactly at the threshold', () => {
    expect(readAwayClock(T0, T0 + OFFLINE_MIN_MS).verdict).toBe('ok');
    expect(readAwayClock(T0, T0 + OFFLINE_MIN_MS - 1).verdict).toBe('below-threshold');
  });

  it('credits exactly at the cap without calling it capped', () => {
    expect(readAwayClock(T0, T0 + OFFLINE_CAP_MS).verdict).toBe('ok');
    expect(readAwayClock(T0, T0 + OFFLINE_CAP_MS + 1).verdict).toBe('capped');
  });
});

describe('a clock that moves backwards', () => {
  it('credits nothing and refuses to rewind the mark', () => {
    const reading = readAwayClock(T0, T0 - 5 * HOUR);
    expect(reading.creditedMs).toBe(0);
    expect(reading.verdict).toBe('clock-rolled-back');
    expect(reading.suspicious).toBe(true);
    // The high-water mark is the whole mechanism: it stays where it was.
    expect(reading.nextAwayAtMs).toBe(T0);
  });

  it('gives no free window on the next honest load', () => {
    /*
     * This is the case the shipped reader gets wrong. It stores
     * `clampInt(lastActiveAt, 0, now, now)`, so a rolled-back clock drags the
     * stamp down with it — and then the next honest load sees a gap running
     * from the rolled-back time to the real one and pays out a full window.
     *
     * With a high-water mark the rollback simply costs the player the time
     * they rewound, which is the correct answer.
     */
    const rolledBack = readAwayClock(T0, T0 - 5 * HOUR);
    const backToReality = readAwayClock(rolledBack.nextAwayAtMs, T0 + 30_000);
    expect(backToReality.creditedMs).toBe(30_000);

    // What the shipped rule would have done with the same two readings.
    const shippedStamp = Math.min(T0 - 5 * HOUR, T0 - 5 * HOUR);
    expect(T0 + 30_000 - shippedStamp).toBe(5 * HOUR + 30_000);
  });
});

describe('a clock jumped forwards', () => {
  it('still pays one capped window, exactly as the shipped game does', () => {
    // The mark is not a fix for forward tampering and this test says so. What
    // it changes is the price, asserted below.
    const jumped = readAwayClock(T0, T0 + 400 * HOUR);
    expect(jumped.creditedMs).toBe(OFFLINE_CAP_MS);
    expect(jumped.suspicious).toBe(true);
  });

  it('charges the skipped time back when the clock returns to the truth', () => {
    const jumped = readAwayClock(T0, T0 + 400 * HOUR);
    expect(jumped.nextAwayAtMs).toBe(T0 + 400 * HOUR);

    // Sixteen honest days later, the mark is still ahead of real time, so
    // there is nothing to collect. Cheating forwards now has a bill.
    const honest = readAwayClock(jumped.nextAwayAtMs, T0 + 16 * 24 * HOUR);
    expect(honest.creditedMs).toBe(0);
    expect(honest.verdict).toBe('clock-rolled-back');
  });

  it('flags a jump larger than the cap plus a day', () => {
    expect(readAwayClock(T0, T0 + SUSPICIOUS_FORWARD_JUMP_MS).suspicious).toBe(false);
    expect(readAwayClock(T0, T0 + SUSPICIOUS_FORWARD_JUMP_MS + 1).suspicious).toBe(true);
    // A normal overnight absence is not flagged, so the signal stays useful.
    expect(readAwayClock(T0, T0 + 10 * HOUR).suspicious).toBe(false);
  });
});

describe('the mark under garbage input', () => {
  it('treats a non-finite or negative mark as zero', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const reading = readAwayClock(bad, T0);
      expect(reading.creditedMs).toBe(OFFLINE_CAP_MS);
      expect(reading.nextAwayAtMs).toBe(T0);
    }
  });

  it('treats a non-finite now as no time having passed', () => {
    const reading = readAwayClock(T0, Number.NaN);
    expect(reading.creditedMs).toBe(0);
    expect(reading.nextAwayAtMs).toBe(T0);
  });
});

describe('touching the mark without crediting', () => {
  it('advances on a normal autosave', () => {
    expect(touchAwayClock(T0, T0 + 60_000)).toBe(T0 + 60_000);
  });

  it('never moves backwards', () => {
    expect(touchAwayClock(T0, T0 - 60_000)).toBe(T0);
  });

  it('is what an autosave should call, so time is never credited twice', () => {
    // Autosave every thirty seconds for five minutes, then read.
    let mark = T0;
    for (let i = 1; i <= 10; i += 1) mark = touchAwayClock(mark, T0 + i * 30_000);
    expect(mark).toBe(T0 + 300_000);
    // The session was live throughout, so there is nothing to credit.
    expect(readAwayClock(mark, T0 + 300_000).creditedMs).toBe(0);
  });
});
