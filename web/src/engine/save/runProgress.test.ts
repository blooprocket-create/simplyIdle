import { describe, expect, it } from 'vitest';
import Decimal from 'break_eternity.js';
import { BURST_COST } from '../combat/burst';
import { emptySnapshot } from '../types';
import { MAX_SAVE_WAVE } from './guards';
import { emptyRun, readRunProgress, runProgressFrom, writeRunProgress } from './runProgress';

describe('a run written down and read back', () => {
  it('survives the round trip unchanged', () => {
    const run = {
      wave: 137,
      kills: 4_211,
      deaths: 19,
      burstCharge: 9,
      gold: new Decimal('4.2e17'),
      exp: new Decimal(88_104),
      awayAtMs: 1_700_000_000_000,
    };
    expect(readRunProgress(writeRunProgress(run))).toEqual(run);
  });

  it('carries a purse past the point a JSON number stops working', () => {
    /*
     * Gold is written as text and read back with `boundedDecimal`. Written as a
     * JSON *number* it would be `Infinity` by 1e309, and `JSON.stringify` turns
     * that into `null` — so the field would not merely lose precision, it would
     * vanish and read back as zero.
     *
     * 1e400 is not a hypothetical: the wave curve is explicitly built to outlive
     * doubles, and the shipped save clamps gold against `Number.MAX_VALUE`
     * rather than `MAX_SAFE_INTEGER`, so accounts are allowed to get there.
     */
    const rich = { ...emptyRun(0), gold: new Decimal('1e400') };
    expect(JSON.parse(writeRunProgress(rich)).gold).toBe('1e400');
    expect(readRunProgress(writeRunProgress(rich))?.gold.toString()).toBe('1e400');
  });

  it('is taken from the read model rather than the simulation', () => {
    // The snapshot is the contract every other reader already uses. Reaching
    // into `Simulation` for these would be a second way to ask the same
    // question, and the two would drift.
    const snapshot = {
      ...emptySnapshot(),
      wave: 42,
      burst: { ...emptySnapshot().burst, charge: 7 },
      totals: {
        ...emptySnapshot().totals,
        kills: 300,
        deaths: 5,
        dealt: new Decimal(1),
        overkill: new Decimal(0),
        gold: new Decimal(91_500),
        exp: new Decimal(12_400),
      },
    };
    expect(runProgressFrom(snapshot, 1_234)).toEqual({
      wave: 42,
      kills: 300,
      deaths: 5,
      burstCharge: 7,
      gold: new Decimal(91_500),
      exp: new Decimal(12_400),
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
    expect(partial).toEqual({
      wave: 12,
      kills: 0,
      deaths: 0,
      burstCharge: 0,
      gold: new Decimal(0),
      exp: new Decimal(0),
      awayAtMs: 0,
    });
  });

  it('refuses a purse that is negative or not a number at all', () => {
    /*
     * `new Decimal(Infinity)` and `new Decimal(NaN)` are both constructible and
     * neither throws — they propagate through every sum after them instead, so
     * one edited field would turn the whole run's earnings into `NaN` with
     * nothing to show where it came from.
     */
    expect(readRunProgress('{"gold":-1}')?.gold.toString()).toBe('0');
    expect(readRunProgress('{"gold":"Infinity"}')?.gold.toString()).toBe('0');
    expect(readRunProgress('{"gold":null}')?.gold.toString()).toBe('0');
    expect(readRunProgress('{"gold":{"big":true}}')?.gold.toString()).toBe('0');
    // A plain number still reads, because a save written before the purse was
    // text has them.
    expect(readRunProgress('{"gold":4200}')?.gold.toString()).toBe('4200');
  });

  it('treats a missing mark as long ago rather than as now', () => {
    // This module has no clock, so it cannot default to "now" — and it must
    // not, because a mark of zero is what the away clock already caps.
    expect(readRunProgress('{}')?.awayAtMs).toBe(0);
    expect(emptyRun(5_000).awayAtMs).toBe(5_000);
  });
});
