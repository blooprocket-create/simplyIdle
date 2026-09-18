import { describe, expect, it } from 'vitest';
import { RECON_OUTCOMES, LOCKPICK_ATTEMPTS, LOCKPICK_MAX_CODE, LOCKPICK_MIN_CODE } from '../content/miniOps';
import {
  TARGET_METER_START,
  dealRecon,
  lockpickCode,
  lockpickGuess,
  rollDice,
  targetMeterStart,
  targetMeterTick,
  targetScore,
} from './miniOpActions';

/**
 * Setting up a round, which happens at the shell because it needs a generator.
 *
 * The engine may not read one, and the shipped screens never let it: they roll
 * the dice, deal the cards and pick the code, then tell the reducer how it
 * went. So this is where the randomness lives, and it is tested here with a
 * scripted generator rather than a pinned constant — a constant generator
 * cannot tell a shuffle from a no-op.
 */

/** Draws in order, then repeats the last. */
function scripted(values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

describe('the dice', () => {
  it('rolls one to twenty, both ends included', () => {
    expect(rollDice(() => 0)).toBe(1);
    expect(rollDice(() => 0.999999)).toBe(20);
    expect(rollDice(() => 0.5)).toBe(11);
  });

  it('covers every face and no others', () => {
    const faces = new Set<number>();
    for (let step = 0; step < 20; step++) faces.add(rollDice(() => step / 20));
    expect([...faces].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });
});

describe('the recon deal', () => {
  it('lays out three of the four, so one outcome is always absent', () => {
    const dealt = dealRecon(scripted([0, 0, 0]));
    expect(dealt).toHaveLength(3);
    expect(new Set(dealt).size).toBe(3);
    expect(RECON_OUTCOMES.filter(outcome => !dealt.includes(outcome))).toHaveLength(1);
  });

  it('draws without replacement, so no card is dealt twice', () => {
    // A scripted generator that would repeat an index if the pool were not
    // shrinking: drawing 0 three times from a shrinking pool gives three
    // different cards, and from a fixed one would give the same card thrice.
    expect(dealRecon(scripted([0, 0, 0]))).toEqual(['intel_gold', 'intel_shards', 'intel_buff']);
    expect(dealRecon(scripted([0.99, 0.99, 0.99]))).toEqual(['ambush', 'intel_buff', 'intel_shards']);
  });

  it('can leave any of the four out, depending on the draw', () => {
    const absent = new Set<string>();
    for (let step = 0; step < 4; step++) {
      const dealt = dealRecon(scripted([step / 4, step / 4, step / 4]));
      for (const outcome of RECON_OUTCOMES) if (!dealt.includes(outcome)) absent.add(outcome);
    }
    // Every outcome can be the missing one, which is what stops the deal from
    // quietly guaranteeing a card.
    expect(absent.size).toBeGreaterThan(1);
  });
});

describe('the lockpick', () => {
  it('picks a two-digit code, both ends included', () => {
    expect(lockpickCode(() => 0)).toBe(LOCKPICK_MIN_CODE);
    expect(lockpickCode(() => 0.999999)).toBe(LOCKPICK_MAX_CODE);
  });

  it('hints on each digit separately, which is what makes three guesses enough', () => {
    /*
     * The discriminating case is **same tens, different ones** — and my first
     * three cases were not it. 47 against 62, 37 and 47 all have a tens digit
     * that points the same way the whole number does, so an injection
     * comparing whole numbers instead of digits passed all three. A rule
     * tested only where two rules agree is a rule that is not tested.
     *
     * 47 against 43 is where they part: the tens are correct and the ones are
     * low, while the whole number is simply low.
     */
    expect(lockpickGuess(47, 43, 0)).toMatchObject({ tens: 'correct', ones: 'higher' });
    expect(lockpickGuess(47, 49, 0)).toMatchObject({ tens: 'correct', ones: 'lower' });

    expect(lockpickGuess(47, 62, 0)).toMatchObject({ cracked: false, tens: 'lower', ones: 'higher' });
    expect(lockpickGuess(47, 37, 0)).toMatchObject({ tens: 'higher', ones: 'correct' });
    expect(lockpickGuess(47, 47, 0)).toMatchObject({ cracked: true, tens: 'correct', ones: 'correct' });
  });

  it('jams on the third wrong guess and not before', () => {
    expect(lockpickGuess(47, 11, 0).jammed).toBe(false);
    expect(lockpickGuess(47, 11, 1).jammed).toBe(false);
    expect(lockpickGuess(47, 11, LOCKPICK_ATTEMPTS - 1).jammed).toBe(true);
    // A third guess that is right is not a jam.
    expect(lockpickGuess(47, 47, LOCKPICK_ATTEMPTS - 1).jammed).toBe(false);
  });

  it('counts the guesses down to nought', () => {
    expect(lockpickGuess(47, 11, 0).attemptsLeft).toBe(2);
    expect(lockpickGuess(47, 11, 2).attemptsLeft).toBe(0);
  });
});

describe('target practice', () => {
  it('scores a hundred dead centre and nought only at the very ends', () => {
    // A tent over the whole track rather than a window in the middle: I had
    // predicted the outer quarter scored nothing and the arithmetic says
    // otherwise — at 25 the meter is 25 steps out, which is 50 points.
    expect(targetScore(50)).toBe(100);
    expect(targetScore(25)).toBe(50);
    expect(targetScore(75)).toBe(50);
    expect(targetScore(0)).toBe(0);
    expect(targetScore(100)).toBe(0);
  });

  it('falls two points a step, so the bands sit at fixed distances', () => {
    expect(targetScore(45)).toBe(90);
    expect(targetScore(55)).toBe(90);
    // The 85 band is within seven and a half steps, the 60 band within twenty.
    expect(targetScore(42)).toBe(84);
    expect(targetScore(43)).toBe(86);
    expect(targetScore(30)).toBe(60);
  });

  it('is symmetric about the centre', () => {
    for (let offset = 0; offset <= 30; offset++) {
      expect(targetScore(50 - offset)).toBe(targetScore(50 + offset));
    }
  });
});

describe('the meter target practice is played on', () => {
  /** Every position the meter visits, in order, for as many ticks as asked. */
  function sweep(ticks: number): number[] {
    let meter = targetMeterStart();
    const seen = [meter.position];
    for (let step = 0; step < ticks; step++) {
      meter = targetMeterTick(meter);
      seen.push(meter.position);
    }
    return seen;
  }

  it('starts at eight and climbs in threes', () => {
    expect(sweep(3)).toEqual([TARGET_METER_START, 11, 14, 17]);
  });

  it('bounces off both walls, landing exactly on them', () => {
    const path = sweep(80);
    expect(path).toContain(100);
    expect(path).toContain(0);
    expect(Math.max(...path)).toBe(100);
    expect(Math.min(...path)).toBe(0);
  });

  it('offers a perfect hundred on the first pass and never again', () => {
    /*
     * The bounce clamps to the wall instead of reflecting the overshoot, which
     * shifts the phase: up from eight in threes lands on fifty exactly, down
     * from a hundred does not. So the centre is reachable once and then the
     * meter straddles it forever — 52 and 49 on the way down, 48 and 51 on the
     * way back up, which score 96 and 98.
     *
     * Shipped behaviour, reproduced. Pinned here because it is invisible and a
     * future tweak to the step or the start would silently change it.
     */
    const path = sweep(200);
    const first = path.indexOf(TARGET_CENTRE_POSITION);
    expect(first).toBeGreaterThan(0);
    expect(path.indexOf(TARGET_CENTRE_POSITION, first + 1)).toBe(-1);

    // And the best still clears the top band comfortably, which is why this is
    // a curiosity rather than a defect.
    const best = Math.max(...path.slice(first + 1).map(position => targetScore(position)));
    expect(best).toBe(98);
  });
});

const TARGET_CENTRE_POSITION = 50;
