import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { barFraction } from './ratio';

const d = (value: string | number) => new Decimal(value);

describe('bar fraction', () => {
  it('reads the obvious cases', () => {
    expect(barFraction(d(50), d(100))).toBeCloseTo(0.5);
    expect(barFraction(d(100), d(100))).toBe(1);
    expect(barFraction(d(0), d(100))).toBe(0);
  });

  it('never divides by a maximum of zero', () => {
    // An empty snapshot carries a max of zero, and every frame before the
    // first wave spawns would otherwise scale a mesh by NaN — which neither
    // throws nor draws, so nothing would point at the cause.
    expect(barFraction(d(0), d(0))).toBe(0);
    expect(barFraction(d(10), d(0))).toBe(0);
    expect(barFraction(d(10), d(-5))).toBe(0);
  });

  it('clamps rather than overflowing the bar', () => {
    expect(barFraction(d(150), d(100))).toBe(1);
    expect(barFraction(d(-20), d(100))).toBe(0);
  });

  it('survives magnitudes a double cannot divide', () => {
    // Both of these are reachable: break_eternity is in the stack so the
    // numbers can keep going, and a bar still has to be a fraction.
    expect(barFraction(d('1e400'), d('2e400'))).toBeCloseTo(0.5);
    expect(barFraction(d('1e400'), d('1e4000'))).toBe(0);
    expect(barFraction(d('1e4000'), d('1e400'))).toBe(1);
  });

  it('always returns something a mesh can be scaled by', () => {
    const samples = ['0', '1', '1e9', '1e400', '1e4000'];
    for (const value of samples) {
      for (const max of samples) {
        const fraction = barFraction(d(value), d(max));
        expect(Number.isFinite(fraction), `${value}/${max}`).toBe(true);
        expect(fraction, `${value}/${max}`).toBeGreaterThanOrEqual(0);
        expect(fraction, `${value}/${max}`).toBeLessThanOrEqual(1);
      }
    }
  });
});
