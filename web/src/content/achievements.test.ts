import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENT_COUNT, TRACKED_SIGNALS, isTracked, trackedAchievements } from './achievements';

describe('achievement catalogue', () => {
  it('carries the whole shipped list', () => {
    expect(ACHIEVEMENTS).toHaveLength(ACHIEVEMENT_COUNT);
    expect(ACHIEVEMENT_COUNT).toBe(91);
  });

  it('never repeats an id or a name', () => {
    expect(new Set(ACHIEVEMENTS.map(entry => entry.id)).size).toBe(ACHIEVEMENTS.length);
    expect(new Set(ACHIEVEMENTS.map(entry => entry.name)).size).toBe(ACHIEVEMENTS.length);
  });

  it('gives every achievement something to show', () => {
    for (const entry of ACHIEVEMENTS) {
      expect(entry.name.trim(), entry.id).not.toBe('');
      expect(entry.description.trim(), entry.id).not.toBe('');
      expect(entry.emoji.trim(), entry.id).not.toBe('');
    }
  });

  it('pairs a signal with a goal, or has neither', () => {
    // A signal with no goal can never complete and a goal with no signal can
    // never start. Either would sit in the ledger forever looking like a bug
    // in the player's save rather than in the catalogue.
    for (const entry of ACHIEVEMENTS) {
      expect(entry.signal === null, entry.id).toBe(entry.goal === null);
      if (entry.goal !== null) {
        expect(entry.goal, entry.id).toBeGreaterThan(0);
        expect(Number.isFinite(entry.goal), entry.id).toBe(true);
      }
    }
  });

  it('keeps the compound ones rather than dropping them', () => {
    // Three shipped conditions are compound — "wave 100 with exactly one hero
    // equipped" — and carry no single signal. Omitting them would tell the
    // player the game has eighty-eight achievements when it has ninety-one.
    const compound = ACHIEVEMENTS.filter(entry => entry.signal === null);
    expect(compound).toHaveLength(3);
    for (const entry of compound) expect(isTracked(entry)).toBe(false);
  });

  it('only advertises signals the catalogue actually uses', () => {
    // A tracked signal no achievement watches is a measurement nothing reads,
    // which is how the two lists drift apart unnoticed.
    const used = new Set(ACHIEVEMENTS.map(entry => entry.signal).filter(signal => signal !== null));
    for (const signal of TRACKED_SIGNALS) {
      expect(used.has(signal), `${signal} is tracked but unused`).toBe(true);
    }
  });

  it('can measure a majority of them in this build', () => {
    // Not a target — a statement of where the port has got to. If this drops
    // sharply, a signal has been renamed out from under the tracked set.
    const tracked = trackedAchievements();
    expect(tracked.length).toBeGreaterThanOrEqual(50);
    expect(tracked.length).toBeLessThanOrEqual(ACHIEVEMENT_COUNT);
    for (const entry of tracked) expect(isTracked(entry)).toBe(true);
  });

  it('agrees with itself about what is tracked', () => {
    const tracked = new Set(trackedAchievements().map(entry => entry.id));
    for (const entry of ACHIEVEMENTS) {
      expect(isTracked(entry), entry.id).toBe(tracked.has(entry.id));
    }
  });
});
