import { describe, expect, it } from 'vitest';
import { chapterStartWave } from './chapters';
import { RALLY_HEALTH_FRACTION, WIPE_DECISION_MS, hasLapsed, openWipe, remainingMs, resolveWipe } from './wipe';

describe('a wipe, as a decision', () => {
  it('offers a retreat to the start of the chapter that was being fought', () => {
    // The shipped behaviour, still here — but now as one of two options
    // rather than as something that happens to the player without asking.
    const pending = openWipe(37, 10_000);
    expect(pending.wave).toBe(37);
    expect(pending.retreatTo).toBe(chapterStartWave(37));
    expect(pending.retreatTo).toBeLessThan(37);
  });

  it('offers a rally that holds the wave at a price', () => {
    const pending = openWipe(37, 0);
    expect(pending.rallyHealth).toBe(RALLY_HEALTH_FRACTION);
    // A price, not a formality: coming back at full health would make
    // retreating strictly worse and the choice no choice at all.
    expect(pending.rallyHealth).toBeGreaterThan(0);
    expect(pending.rallyHealth).toBeLessThan(1);
  });

  it('counts down, and runs out', () => {
    const pending = openWipe(20, 5_000);
    expect(remainingMs(pending, 5_000)).toBe(WIPE_DECISION_MS);
    expect(remainingMs(pending, 5_000 + WIPE_DECISION_MS / 2)).toBeCloseTo(WIPE_DECISION_MS / 2, 5);
    expect(remainingMs(pending, 5_000 + WIPE_DECISION_MS)).toBe(0);
    // Never negative: the HUD divides by it.
    expect(remainingMs(pending, 5_000 + WIPE_DECISION_MS * 10)).toBe(0);
  });

  it('lapses only once the clock has actually run out', () => {
    const pending = openWipe(20, 0);
    expect(hasLapsed(pending, 0)).toBe(false);
    expect(hasLapsed(pending, WIPE_DECISION_MS - 1)).toBe(false);
    expect(hasLapsed(pending, WIPE_DECISION_MS)).toBe(false);
    expect(hasLapsed(pending, WIPE_DECISION_MS + 1)).toBe(true);
  });

  it('treats an unanswered offer exactly as the shipped retreat', () => {
    // The retreat has already happened by the time the offer lapses; these
    // agreeing is what lets the simulation apply it immediately and keeps it
    // in step with an offline estimator that models nothing else.
    const pending = openWipe(37, 0);
    expect(resolveWipe(pending, 'lapsed')).toEqual(resolveWipe(pending, 'retreat'));
  });

  it('sends a retreat back healed, and a rally back hurt', () => {
    const pending = openWipe(37, 0);
    const retreat = resolveWipe(pending, 'retreat');
    expect(retreat.wave).toBe(chapterStartWave(37));
    expect(retreat.healthFraction).toBe(1);

    const rally = resolveWipe(pending, 'rally');
    expect(rally.wave).toBe(37);
    expect(rally.healthFraction).toBe(RALLY_HEALTH_FRACTION);
  });

  it('never rallies onto a wave the team was not actually on', () => {
    for (const wave of [1, 2, 19, 20, 21, 100, 999]) {
      const pending = openWipe(wave, 0);
      expect(resolveWipe(pending, 'rally').wave, `wave ${wave}`).toBe(wave);
      expect(resolveWipe(pending, 'retreat').wave, `wave ${wave}`).toBeLessThanOrEqual(wave);
    }
  });

  it('keeps a first-chapter retreat on a real wave', () => {
    // `chapterStartWave(1)` must not produce wave zero or the team respawns
    // into an encounter that does not exist.
    const pending = openWipe(3, 0);
    expect(resolveWipe(pending, 'retreat').wave).toBeGreaterThanOrEqual(1);
  });
});
