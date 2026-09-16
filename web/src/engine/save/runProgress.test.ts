import { describe, expect, it } from 'vitest';
import Decimal from 'break_eternity.js';
import { BURST_COST } from '../combat/burst';
import { emptySnapshot } from '../types';
import { MAX_SAVE_WAVE } from './guards';
import { emptyRun, readRunProgress, runProgressFrom, writeRunProgress } from './runProgress';

describe('a run written down and read back', () => {
  it('survives the round trip unchanged', () => {
    const run = { wave: 137, kills: 4_211, deaths: 19, burstCharge: 9, awayAtMs: 1_700_000_000_000 };
    expect(readRunProgress(writeRunProgress(run))).toEqual(run);
  });

  it('is taken from the read model rather than the simulation', () => {
    // The snapshot is the contract every other reader already uses. Reaching
    // into `Simulation` for these would be a second way to ask the same
    // question, and the two would drift.
    const snapshot = {
      ...emptySnapshot(),
      wave: 42,
      burst: { ...emptySnapshot().burst, charge: 7 },
      totals: { kills: 300, deaths: 5, dealt: new Decimal(1), overkill: new Decimal(0) },
    };
    expect(runProgressFrom(snapshot, 1_234)).toEqual({
      wave: 42,
      kills: 300,
      deaths: 5,
      burstCharge: 7,
      awayAtMs: 1_234,
    });
  });
});

describe('a payload that is not what we wrote', () => {
  it('reads nothing from nothing', () => {
    expect(readRunProgress(null)).toBeNull();
    expect(readRunProgress('')).toBeNull();
  });

  it('reads nothing from something that is not JSON, rather than throwing', () => {
    // The caller is a React effect on mount. A throw here is a blank screen.
    expect(readRunProgress('{ not json')).toBeNull();
    expect(readRunProgress('null')).toBeNull();
    expect(readRunProgress('[1,2,3]')).toBeNull();
    expect(readRunProgress('"a string"')).toBeNull();
  });

  it('bounds a tampered wave instead of trusting it', () => {
    /*
     * Local storage belongs to whoever owns the browser. The wave is the one
     * field here that is not merely a counter — it drives the enemy health
     * curve — so an edited one has to be clamped rather than believed.
     */
    expect(readRunProgress('{"wave":1e30}')?.wave).toBe(MAX_SAVE_WAVE);
    expect(readRunProgress('{"wave":-5}')?.wave).toBe(1);
    expect(readRunProgress('{"wave":"tomorrow"}')?.wave).toBe(1);
  });

  it('bounds a tampered meter to what the meter can hold', () => {
    // Otherwise a hand-edited save hands out a permanent open window.
    expect(readRunProgress(`{"burstCharge":${BURST_COST * 100}}`)?.burstCharge).toBe(BURST_COST);
    expect(readRunProgress('{"burstCharge":-1}')?.burstCharge).toBe(0);
  });

  it('fills in every field a partial payload is missing', () => {
    const partial = readRunProgress('{"wave":12}');
    expect(partial).toEqual({ wave: 12, kills: 0, deaths: 0, burstCharge: 0, awayAtMs: 0 });
  });

  it('treats a missing mark as long ago rather than as now', () => {
    // This module has no clock, so it cannot default to "now" — and it must
    // not, because a mark of zero is what the away clock already caps.
    expect(readRunProgress('{}')?.awayAtMs).toBe(0);
    expect(emptyRun(5_000).awayAtMs).toBe(5_000);
  });
});
