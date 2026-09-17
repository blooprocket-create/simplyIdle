import { afterEach, describe, expect, it, vi } from 'vitest';
import Decimal from 'break_eternity.js';
import { GameLoop } from './GameLoop';
import { createHeroEntity } from '../engine/entities/HeroEntity';
import type { SimulationOptions } from '../engine/Simulation';

/**
 * The loop's one rule of its own: auto-potion.
 *
 * Everything else here forwards to the simulation, which has its own tests.
 * This is the only behaviour the loop *decides*, and it exists here because
 * auto-potion is the one automation that is neither purely in-fight nor purely
 * save-side — the trigger is the team's health and the cost is an item in the
 * bag, so the loop is where the two meet.
 *
 * Driven by stepping the frame callback by hand rather than by waiting on a
 * real one, so the test is about the rule and not about a scheduler.
 */

/** One hero, and a team soft enough that a frame visibly moves the bar. */
function options(): SimulationOptions {
  return {
    heroes: [createHeroEntity('h', new Decimal(50), 1_000)],
    teamMaxHp: new Decimal(1_000),
    // Enough incoming that a handful of frames leaves the bar visibly down.
    // A potion into a full bar is clamped and measures nothing.
    incomingMult: 1_000,
    startWave: 20,
  };
}

/** Runs `frames` frames of `ms` each, with the clock and rAF under control. */
function drive(loop: GameLoop, frames: number, ms = 100): void {
  // Held in a box rather than a bare `let`: the assignment happens inside a
  // callback TypeScript cannot follow, so a bare one narrows to `null`.
  const pending: { callback: FrameRequestCallback | null } = { callback: null };
  let now = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending.callback = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(performance, 'now').mockImplementation(() => now);

  loop.start();
  for (let frame = 0; frame < frames; frame++) {
    const next = pending.callback;
    if (next === null) break;
    pending.callback = null;
    now += ms;
    next(now);
  }
  loop.stop();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ratioOf = (loop: GameLoop) => loop.read().team.hp.div(loop.read().team.maxHp).toNumber();

describe('a team that drinks for itself', () => {
  it('is handed the health it has after the step, not before it', () => {
    /*
     * The shipped rule reads the health the monster's damage has already
     * taken, which is what makes a potion an answer to the hit rather than a
     * guess about the next one. So every ratio the handler sees has to be one
     * the team actually reached.
     */
    const loop = new GameLoop(options());
    const seen: number[] = [];
    loop.setAutoUsePotion(ratio => {
      seen.push(ratio);
      return 0;
    });
    drive(loop, 3);

    expect(seen).toHaveLength(3);
    expect(seen[0]).toBeLessThan(1);
    // Strictly falling, because nothing healed and the monster kept hitting.
    expect(seen).toEqual([...seen].sort((left, right) => right - left));
    expect(seen[seen.length - 1]).toBeCloseTo(ratioOf(loop), 10);
  });

  it('heals by exactly what the handler answers', () => {
    /*
     * Both loops take three frames of damage with the handler answering
     * nought, so they arrive at the same health by the same arithmetic. Only
     * the fourth frame differs. Measured against a control rather than against
     * a computed figure, because the monster's damage is the larger number and
     * would swamp the potion in a direct reading.
     */
    const drinking = new GameLoop(options());
    const control = new GameLoop(options());
    for (const loop of [drinking, control]) {
      loop.setAutoUsePotion(() => 0);
      drive(loop, 3);
    }
    expect(ratioOf(control)).toBeLessThan(0.75);

    drinking.setAutoUsePotion(() => 0.25);
    drive(drinking, 1);
    drive(control, 1);

    const gained = drinking.read().team.hp.sub(control.read().team.hp);
    expect(gained.toNumber()).toBeCloseTo(control.read().team.maxHp.mul(0.25).toNumber(), 6);
  });

  it('never drinks when no handler is set', () => {
    // The gate: `App` passes null when the automation is not active, so a
    // player who has not earned it cannot be healed by accident.
    const loop = new GameLoop(options());
    drive(loop, 2);
    const unhealed = ratioOf(loop);

    const drinking = new GameLoop(options());
    drinking.setAutoUsePotion(() => 0.5);
    drive(drinking, 2);
    expect(ratioOf(drinking)).toBeGreaterThan(unhealed);
  });

  it('stops drinking when the handler is taken away', () => {
    const loop = new GameLoop(options());
    let calls = 0;
    loop.setAutoUsePotion(() => {
      calls += 1;
      return 0;
    });
    drive(loop, 2);
    expect(calls).toBe(2);

    loop.setAutoUsePotion(null);
    drive(loop, 2);
    expect(calls).toBe(2);
  });

  it('never restores past full', () => {
    // `healTeam` clamps, and a handler answering more than the bar can hold is
    // exactly what a grand potion on a scratched team is.
    const loop = new GameLoop(options());
    loop.setAutoUsePotion(() => 10);
    drive(loop, 2);
    expect(ratioOf(loop)).toBe(1);
  });
});
