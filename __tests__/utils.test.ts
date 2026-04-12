import { fmt, safeDivide, roundTo4, safeMultiplier, buildingCost, bulkCost } from '../src/utils';

describe('fmt', () => {
  it('formats small numbers with decimals', () => {
    expect(fmt(5)).toBe('5.0');
    expect(fmt(0)).toBe('0.0');
    expect(fmt(9.5)).toBe('9.5');
  });

  it('formats numbers >= 10 without decimals', () => {
    expect(fmt(10)).toBe('10');
    expect(fmt(999)).toBe('999');
  });

  it('formats thousands with K suffix', () => {
    expect(fmt(1000)).toBe('1.00K');
    expect(fmt(1500)).toBe('1.50K');
    expect(fmt(999_999)).toBe('1000.00K');
  });

  it('formats millions with M suffix', () => {
    expect(fmt(1_000_000)).toBe('1.00M');
    expect(fmt(2_500_000)).toBe('2.50M');
  });

  it('formats billions with B suffix', () => {
    expect(fmt(1_000_000_000)).toBe('1.00B');
  });

  it('formats trillions with T suffix', () => {
    expect(fmt(1_000_000_000_000)).toBe('1.00T');
  });

  it('formats quadrillions with Qa suffix', () => {
    expect(fmt(1_000_000_000_000_000)).toBe('1.00Qa');
  });

  it('handles NaN and Infinity', () => {
    expect(fmt(NaN)).toBe('0');
    expect(fmt(Infinity)).toBe('0');
    expect(fmt(-Infinity)).toBe('0');
  });

  it('handles negative numbers', () => {
    expect(fmt(-5)).toBe('-5.0');
    expect(fmt(-1500)).toBe('-1.50K');
  });
});

describe('safeDivide', () => {
  it('divides normally', () => {
    expect(safeDivide(10, 2)).toBe(5);
    expect(safeDivide(7, 3)).toBeCloseTo(2.333, 2);
  });

  it('returns fallback on zero divisor', () => {
    expect(safeDivide(10, 0)).toBe(0);
    expect(safeDivide(10, 0, -1)).toBe(-1);
  });

  it('returns fallback on NaN', () => {
    expect(safeDivide(NaN, 5)).toBe(0);
    expect(safeDivide(5, NaN)).toBe(0);
  });

  it('returns fallback on Infinity', () => {
    expect(safeDivide(Infinity, 5)).toBe(0);
    expect(safeDivide(5, Infinity)).toBe(0);
  });
});

describe('roundTo4', () => {
  it('rounds to 4 decimal places', () => {
    expect(roundTo4(1.23456)).toBe(1.2346);
    expect(roundTo4(1.00001)).toBe(1);
    expect(roundTo4(0.99995)).toBe(1);
  });

  it('preserves exact values', () => {
    expect(roundTo4(1)).toBe(1);
    expect(roundTo4(0.5)).toBe(0.5);
  });
});

describe('safeMultiplier', () => {
  it('returns value within cap', () => {
    expect(safeMultiplier(5)).toBe(5);
    expect(safeMultiplier(100)).toBe(100);
  });

  it('caps at limit', () => {
    expect(safeMultiplier(1e15)).toBe(1e12);
    expect(safeMultiplier(500, 100)).toBe(100);
  });

  it('returns 1 for invalid values', () => {
    expect(safeMultiplier(NaN)).toBe(1);
    expect(safeMultiplier(Infinity)).toBe(1);
    expect(safeMultiplier(-5)).toBe(1);
  });
});

describe('buildingCost', () => {
  it('calculates base cost when none owned', () => {
    expect(buildingCost(100, 0, 1.15)).toBe(100);
  });

  it('scales cost with owned count', () => {
    expect(buildingCost(100, 1, 1.15)).toBe(Math.floor(100 * Math.pow(1.15, 1)));
    expect(buildingCost(100, 10, 1.15)).toBe(Math.floor(100 * Math.pow(1.15, 10)));
  });
});

describe('bulkCost', () => {
  it('calculates cost for buying multiple buildings', () => {
    const result = bulkCost(100, 0, 1, 1.15);
    expect(result).toBe(100); // buying 1 from 0 = baseCost
  });

  it('sums correctly for small amounts', () => {
    // Buying 3 from 0 should be sum of first 3 costs
    const manual = buildingCost(100, 0, 1.15) + buildingCost(100, 1, 1.15) + buildingCost(100, 2, 1.15);
    const bulk = bulkCost(100, 0, 3, 1.15);
    // Geometric sum formula may differ by rounding, but should be close
    expect(Math.abs(bulk - manual)).toBeLessThan(3);
  });
});
