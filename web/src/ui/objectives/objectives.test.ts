import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { emptySnapshot, type SimulationSnapshot } from '../../engine/types';
import { OBJECTIVES, currentObjective, objectiveProblems, trackOf } from './objectives';

function at(overrides: Partial<SimulationSnapshot>): SimulationSnapshot {
  return { ...emptySnapshot(), ...overrides };
}

function withTotals(totals: Partial<SimulationSnapshot['totals']>): SimulationSnapshot {
  const base = emptySnapshot();
  return { ...base, totals: { ...base.totals, ...totals } };
}

describe('objectives', () => {
  it('holds together as a set', () => {
    // Duplicate ids, an unreachable goal, a track that runs backwards: all
    // things a hand-written list acquires and none of them visible by eye.
    expect(objectiveProblems(OBJECTIVES)).toEqual([]);
  });

  it('shows the first thing the player has not done', () => {
    const fresh = currentObjective(emptySnapshot());
    expect(fresh).not.toBeNull();
    expect(fresh?.done).toBe(false);
    expect(fresh?.fraction).toBe(0);
  });

  it('moves on once one is finished', () => {
    const first = currentObjective(emptySnapshot());
    expect(first).not.toBeNull();
    // Satisfy the first objective outright and the ticker should be showing
    // something else, not a completed line nobody needs to read again.
    const beyond = currentObjective(withTotals({ kills: 10_000 }));
    expect(beyond?.id).not.toBe(first?.id);
  });

  it('reports a fraction between nothing and done, never outside it', () => {
    for (const snapshot of [
      emptySnapshot(),
      withTotals({ kills: 1 }),
      withTotals({ kills: 1e9 }),
      withTotals({ dealt: new Decimal('1e400') }),
      at({ wave: 10_000 }),
    ]) {
      for (const objective of OBJECTIVES) {
        const track = trackOf(objective, snapshot);
        expect(track.fraction).toBeGreaterThanOrEqual(0);
        expect(track.fraction).toBeLessThanOrEqual(1);
        expect(Number.isFinite(track.fraction)).toBe(true);
      }
    }
  });

  it('survives a figure past what a double can hold', () => {
    // `dealt` is a Decimal because this game goes well past 1e308. An
    // objective that divides its way to Infinity would render a NaN bar.
    const huge = withTotals({ dealt: new Decimal('1e4000') });
    for (const objective of OBJECTIVES) {
      const track = trackOf(objective, huge);
      expect(Number.isNaN(track.fraction)).toBe(false);
      expect(track.detail).not.toContain('NaN');
      expect(track.detail).not.toContain('Infinity');
    }
  });

  it('returns nothing once every objective is done', () => {
    // The ticker shows nothing rather than looping back to the first, which
    // would read as progress being lost.
    const done = at({
      wave: 1e9,
      totals: { kills: 1e9, deaths: 0, dealt: new Decimal('1e100'), overkill: new Decimal(0) },
    });
    expect(currentObjective(done)).toBeNull();
  });

  it('says what is left in words a player can act on', () => {
    const track = trackOf(OBJECTIVES[0], withTotals({ kills: 3 }));
    expect(track.detail).toMatch(/\d/);
    expect(track.label.length).toBeGreaterThan(0);
  });

  it('never goes backwards as the run goes on', () => {
    // Every objective reads a monotonic total, so a player who walks away and
    // comes back should never find a bar shorter than they left it.
    for (const objective of OBJECTIVES) {
      let previous = -1;
      for (const kills of [0, 1, 10, 100, 1000]) {
        const fraction = trackOf(objective, withTotals({ kills, dealt: new Decimal(kills) })).fraction;
        expect(fraction).toBeGreaterThanOrEqual(previous);
        previous = fraction;
      }
    }
  });
});

describe('the objective list check', () => {
  // Asserting `objectiveProblems(OBJECTIVES)` is empty says nothing on its
  // own: a check that found nothing ever would pass it just as well. These
  // hand the check a list that is definitely broken.
  const sound = OBJECTIVES[0];

  it('catches two objectives sharing an id', () => {
    expect(objectiveProblems([sound, sound])).toHaveLength(1);
    expect(objectiveProblems([sound, sound])[0]).toContain(sound.id);
  });

  it('catches a goal that is met before the game starts', () => {
    const problems = objectiveProblems([{ ...sound, id: 'free', goal: new Decimal(0) }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('free');
  });

  it('catches an objective with nothing to show in the ticker', () => {
    const problems = objectiveProblems([{ ...sound, id: 'mute', label: '   ' }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('mute');
  });

  it('reports every problem rather than stopping at the first', () => {
    expect(objectiveProblems([sound, sound, { ...sound, id: 'bad', label: '', goal: new Decimal(-1) }])).toHaveLength(
      3,
    );
  });

  it('passes a list that is actually sound', () => {
    expect(objectiveProblems([sound])).toEqual([]);
  });
});
