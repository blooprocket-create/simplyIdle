import { describe, expect, it } from 'vitest';
import {
  advanceTell,
  answerTell,
  beginTells,
  chipFor,
  isTellOpen,
  noTell,
  tellProgress,
  untilNextTell,
  type TellSpec,
} from './bossTells';

const FLAT: TellSpec = { cadenceMs: 3_000, windowMs: 1_000, charge: 3, chipSeconds: 2, chains: false };
const CHAINED: TellSpec = { ...FLAT, chains: true };

/** The state one cadence in, with the first tell open. */
function opened(spec: TellSpec = FLAT) {
  return advanceTell(beginTells(spec, 0), spec, spec.cadenceMs);
}

describe('a boss tell opening and closing', () => {
  it('is not open before the first cadence has passed', () => {
    const state = beginTells(FLAT, 0);
    expect(isTellOpen(state, FLAT, 0)).toBe(false);
    expect(isTellOpen(advanceTell(state, FLAT, FLAT.cadenceMs - 1), FLAT, FLAT.cadenceMs - 1)).toBe(false);
  });

  it('opens once it has', () => {
    expect(isTellOpen(opened(), FLAT, FLAT.cadenceMs)).toBe(true);
  });

  it('closes when the window runs out', () => {
    const state = opened();
    const late = FLAT.cadenceMs + FLAT.windowMs + 1;
    expect(isTellOpen(state, FLAT, late)).toBe(false);
    expect(advanceTell(state, FLAT, late).openedAtMs).toBeNull();
  });

  it('opens the next one a cadence after the last, not a cadence after it closed', () => {
    // Otherwise the rhythm the player is learning drifts by a window every
    // time they miss one, and a rhythm that drifts cannot be learned.
    const closed = advanceTell(opened(), FLAT, FLAT.cadenceMs + FLAT.windowMs + 1);
    expect(closed.nextAtMs).toBe(FLAT.cadenceMs * 2);
  });

  it('never opens at all off a boss wave', () => {
    const state = noTell();
    expect(untilNextTell(state, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(isTellOpen(advanceTell(state, FLAT, 1e9), FLAT, 1e9)).toBe(false);
  });

  it('sweeps from 0 to 1 across the window and stops there', () => {
    const state = opened();
    expect(tellProgress(state, FLAT, FLAT.cadenceMs)).toBe(0);
    expect(tellProgress(state, FLAT, FLAT.cadenceMs + FLAT.windowMs / 2)).toBeCloseTo(0.5, 5);
    expect(tellProgress(state, FLAT, FLAT.cadenceMs + FLAT.windowMs * 4)).toBe(1);
  });
});

describe('answering a tell', () => {
  it('pays inside the window', () => {
    const { payoff } = answerTell(opened(), FLAT, FLAT.cadenceMs + 100);
    expect(payoff).toEqual({ charge: FLAT.charge, chipSeconds: FLAT.chipSeconds });
  });

  it('pays nothing before one opens or after it closes', () => {
    expect(answerTell(beginTells(FLAT, 0), FLAT, 10).payoff).toBeNull();
    expect(answerTell(opened(), FLAT, FLAT.cadenceMs + FLAT.windowMs + 1).payoff).toBeNull();
  });

  it('pays once however many times the player presses', () => {
    // A verb that rewards mashing is not a timing verb, and the control is
    // a button a phone can deliver three of in the same window.
    const first = answerTell(opened(), FLAT, FLAT.cadenceMs + 100);
    expect(first.payoff).not.toBeNull();
    const second = answerTell(first.state, FLAT, FLAT.cadenceMs + 200);
    expect(second.payoff).toBeNull();
    expect(second.state.streak).toBe(first.state.streak);
  });

  it('closes the window it answered, so the sweep stops asking', () => {
    const answered = answerTell(opened(), FLAT, FLAT.cadenceMs + 100).state;
    expect(isTellOpen(answered, FLAT, FLAT.cadenceMs + 200)).toBe(false);
  });
});

describe('the chain, on the acts that have one', () => {
  /** Answers `count` tells in a row, each immediately after it opens. */
  function chain(spec: TellSpec, count: number) {
    let state = beginTells(spec, 0);
    for (let index = 1; index <= count; index += 1) {
      const at = spec.cadenceMs * index;
      state = advanceTell(state, spec, at);
      state = answerTell(state, spec, at).state;
    }
    return state;
  }

  it('pays more for each answer that follows one', () => {
    const after = chain(CHAINED, 3);
    expect(after.streak).toBe(3);
    expect(chipFor(CHAINED, after.streak)).toBeGreaterThan(CHAINED.chipSeconds);
  });

  it('stops compounding, so a long boss is not an unbounded multiplier', () => {
    const long = chipFor(CHAINED, 500);
    expect(long).toBe(chipFor(CHAINED, 4));
    expect(long / CHAINED.chipSeconds).toBeLessThanOrEqual(2);
  });

  it('is worth nothing on an act whose mechanic does not chain', () => {
    // The flag is what separates the first two acts from the rest; without
    // this the escalation across the six would be tuning and nothing else.
    expect(chipFor(FLAT, 9)).toBe(FLAT.chipSeconds);
    expect(chain(FLAT, 3).streak).toBe(3);
  });

  it('resets on a tell that lapsed, and costs nothing else', () => {
    const three = chain(CHAINED, 3);
    const lapsedAt = CHAINED.cadenceMs * 4 + CHAINED.windowMs + 1;
    const after = advanceTell(advanceTell(three, CHAINED, CHAINED.cadenceMs * 4), CHAINED, lapsedAt);
    expect(after.streak).toBe(0);
    // The fight itself is untouched: a miss is a bonus not taken, never a
    // penalty applied. An idle player has no streak to lose in the first place.
    expect(chipFor(CHAINED, after.streak)).toBe(CHAINED.chipSeconds);
  });
});
