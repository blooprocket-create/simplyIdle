import { BURST_COST } from '../combat/burst';
import type { SimulationSnapshot } from '../types';
import { boundedInt, isRecord, MAX_SAVE_WAVE } from './guards';

/**
 * A run in progress, small enough to write on a timer.
 *
 * Separate from `SaveV3`, which is the *shipped* save — sixty-odd fields of
 * heroes, gear and currencies that live behind Firebase auth and that this
 * build has no way to fetch. This is the other half of the problem and the
 * one that was missing entirely: the shell ran on a demo roster and kept
 * nothing at all, so a refresh threw away the climb, the meter and every
 * boss streak. A verb you cannot carry across a reload is a verb nobody will
 * practise.
 *
 * What it holds is deliberately the smallest set that makes a run continue:
 * where the team is, what they have done, and what they have banked. What it
 * does not hold is anything derivable — team health resets to full on a kill
 * and on a wipe anyway, and the in-simulation clock starts at zero because
 * the BURST window and the boss cadence are both measured from it.
 *
 * Nothing here reads a clock. `awayAtMs` is passed in, which is what lets the
 * away credit be tested without stubbing a global — the fault `awayClock.ts`
 * was extracted to fix.
 */

/** Tallies are display counters; an absurd one is wrong but not dangerous. */
const MAX_TALLY = Number.MAX_SAFE_INTEGER;

export interface RunProgress {
  wave: number;
  kills: number;
  deaths: number;
  /** 0 to `BURST_COST`. Restored so a banked window survives the reload. */
  burstCharge: number;
  /** Wall-clock mark for `readAwayClock`, in epoch ms. */
  awayAtMs: number;
}

export function emptyRun(nowMs: number): RunProgress {
  return { wave: 1, kills: 0, deaths: 0, burstCharge: 0, awayAtMs: nowMs };
}

/** What to write, taken from the read model rather than from the simulation. */
export function runProgressFrom(snapshot: SimulationSnapshot, nowMs: number): RunProgress {
  return {
    wave: snapshot.wave,
    kills: snapshot.totals.kills,
    deaths: snapshot.totals.deaths,
    burstCharge: snapshot.burst.charge,
    awayAtMs: nowMs,
  };
}

/**
 * Read back what was written, from a string that may be anything at all.
 *
 * Local storage is editable by whoever owns the browser, so every field is
 * bounded rather than trusted — the same treatment `migrate.ts` gives the
 * shipped save, through the same guards. A payload that cannot be read at
 * all returns null and the caller starts a new run, because a corrupt save
 * that silently becomes a *weird* save is worse than one that becomes none.
 */
export function readRunProgress(raw: string | null): RunProgress | null {
  if (raw === null || raw === '') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const wave = boundedInt(parsed.wave, 1, MAX_SAVE_WAVE, 1);
  return {
    wave,
    kills: boundedInt(parsed.kills, 0, MAX_TALLY, 0),
    deaths: boundedInt(parsed.deaths, 0, MAX_TALLY, 0),
    burstCharge: boundedInt(parsed.burstCharge, 0, BURST_COST, 0),
    // Clamped at zero rather than defaulted to "now": this module has no
    // clock, and a mark of zero reads as "away since the epoch", which the
    // away clock already caps rather than believing.
    awayAtMs: boundedInt(parsed.awayAtMs, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

export function writeRunProgress(progress: RunProgress): string {
  return JSON.stringify(progress);
}
