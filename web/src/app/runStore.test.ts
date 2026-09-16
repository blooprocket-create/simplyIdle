import { describe, expect, it } from 'vitest';
import Decimal from 'break_eternity.js';
import { OFFLINE_CAP_MS, OFFLINE_MIN_MS } from '../engine/save/awayClock';
import { writeRunProgress } from '../engine/save/runProgress';
import { emptySnapshot, type SimulationSnapshot } from '../engine/types';
import type { PreferenceStore } from '../ui/prefs/store';
import { loadRun, RunSaver, RUN_KEY, SAVE_INTERVAL_MS } from './runStore';

/** A store that remembers, and can be asked what it was told. */
function fakeStore(seed?: string) {
  const cells = new Map<string, string>();
  if (seed !== undefined) cells.set(RUN_KEY, seed);
  let writes = 0;
  const store: PreferenceStore = {
    read: key => cells.get(key) ?? null,
    write: (key, value) => {
      writes += 1;
      cells.set(key, value);
    },
  };
  return { store, cells, writes: () => writes };
}

function snapshotAt(wave: number, kills = 0): SimulationSnapshot {
  return {
    ...emptySnapshot(),
    wave,
    totals: { kills, deaths: 0, dealt: new Decimal(0), overkill: new Decimal(0) },
  };
}

const NOW = 1_700_000_000_000;

describe('loading a run', () => {
  it('starts a new one when there is nothing stored', () => {
    const { store } = fakeStore();
    expect(loadRun(store, NOW)).toEqual({ resume: null, awayMs: 0, verdict: 'below-threshold' });
  });

  it('starts a new one rather than half a one when the payload is corrupt', () => {
    const { store } = fakeStore('{{{');
    expect(loadRun(store, NOW).resume).toBeNull();
  });

  it('credits the time between the mark and now', () => {
    const away = 90 * 60 * 1000;
    const { store } = fakeStore(
      writeRunProgress({ wave: 60, kills: 9, deaths: 2, burstCharge: 4, awayAtMs: NOW - away }),
    );

    const restored = loadRun(store, NOW);
    expect(restored.resume?.wave).toBe(60);
    expect(restored.awayMs).toBe(away);
    expect(restored.verdict).toBe('ok');
  });

  it('caps an absence rather than simulating a fortnight', () => {
    const { store } = fakeStore(
      writeRunProgress({ wave: 60, kills: 0, deaths: 0, burstCharge: 0, awayAtMs: NOW - OFFLINE_CAP_MS * 40 }),
    );
    expect(loadRun(store, NOW).awayMs).toBe(OFFLINE_CAP_MS);
    expect(loadRun(store, NOW).verdict).toBe('below-threshold');
  });

  it('credits a refresh with nothing', () => {
    const { store } = fakeStore(
      writeRunProgress({ wave: 60, kills: 0, deaths: 0, burstCharge: 0, awayAtMs: NOW - OFFLINE_MIN_MS / 2 }),
    );
    expect(loadRun(store, NOW).awayMs).toBe(0);
  });

  it('credits the same absence once, however many times it is read', () => {
    /*
     * The one that matters. This effect can run twice — a device profile
     * change, React's development double-invoke — and without restamping the
     * mark as part of reading, the second run would hand out the same hour
     * of progress a second time. `readAwayClock` returns `nextAwayAtMs` for
     * exactly this, and reading is what advances it.
     */
    const away = 2 * 60 * 60 * 1000;
    const { store } = fakeStore(
      writeRunProgress({ wave: 60, kills: 0, deaths: 0, burstCharge: 0, awayAtMs: NOW - away }),
    );

    expect(loadRun(store, NOW).awayMs).toBe(away);
    expect(loadRun(store, NOW).awayMs).toBe(0);
    expect(loadRun(store, NOW + 1_000).awayMs).toBe(0);
  });

  it('keeps the run when a rolled-back clock makes the absence negative', () => {
    // A device clock moved backwards credits nothing, but must not throw the
    // climb away — the player did not do anything wrong.
    const { store } = fakeStore(
      writeRunProgress({ wave: 77, kills: 3, deaths: 1, burstCharge: 2, awayAtMs: NOW + 60_000 }),
    );
    const restored = loadRun(store, NOW);
    expect(restored.verdict).toBe('clock-rolled-back');
    expect(restored.awayMs).toBe(0);
    expect(restored.resume?.wave).toBe(77);
  });
});

describe('saving a run while it plays', () => {
  it('writes the first frame it is given', () => {
    const { store, cells } = fakeStore();
    expect(new RunSaver(store).tick(snapshotAt(4), NOW)).toBe(true);
    expect(cells.get(RUN_KEY)).toContain('"wave":4');
  });

  it('then writes at most once per interval, not once per frame', () => {
    // Sixty synchronous `localStorage` writes a second would cost more than
    // the fight they are recording.
    const { store, writes } = fakeStore();
    const saver = new RunSaver(store);
    saver.tick(snapshotAt(1), NOW);
    for (let frame = 1; frame <= 120; frame += 1) saver.tick(snapshotAt(1), NOW + frame * 16);
    expect(writes()).toBe(1);
  });

  it('writes again once the interval has passed', () => {
    const { store, cells } = fakeStore();
    const saver = new RunSaver(store);
    saver.tick(snapshotAt(1), NOW);
    expect(saver.tick(snapshotAt(9), NOW + SAVE_INTERVAL_MS)).toBe(true);
    expect(cells.get(RUN_KEY)).toContain('"wave":9');
  });

  it('flushes regardless, because the throttle is what loses the last five seconds', () => {
    // On a boss wave that is the whole fight.
    const { store, cells } = fakeStore();
    const saver = new RunSaver(store);
    saver.tick(snapshotAt(1), NOW);
    saver.flush(snapshotAt(31, 500), NOW + 10);
    expect(cells.get(RUN_KEY)).toContain('"wave":31');
    expect(cells.get(RUN_KEY)).toContain('"kills":500');
  });

  it('survives a store that refuses to keep anything', () => {
    // A private window, or blocked site data. The game still has to run.
    const hostile: PreferenceStore = { read: () => null, write: () => {} };
    const saver = new RunSaver(hostile);
    expect(() => saver.tick(snapshotAt(3), NOW)).not.toThrow();
    expect(() => saver.flush(snapshotAt(3), NOW)).not.toThrow();
    expect(loadRun(hostile, NOW).resume).toBeNull();
  });
});
