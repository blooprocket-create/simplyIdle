import Decimal from 'break_eternity.js';

/**
 * Guards ported from the shipped `src/utils.ts`. They exist because an idle
 * game multiplies a dozen unbounded numbers together every tick, and one NaN
 * anywhere poisons a save permanently — a player whose gold became NaN has no
 * way back.
 */

/** Clamps a multiplier product and turns a non-finite or negative one into 1. */
export function safeMultiplier(value: number, cap: number = Number.MAX_VALUE): number {
  if (!Number.isFinite(value) || value < 0) return 1;
  return Math.min(value, cap);
}

/** Division that yields `fallback` rather than NaN or Infinity. */
export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (!denominator || !Number.isFinite(denominator) || !Number.isFinite(numerator)) return fallback;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

/**
 * Four-decimal rounding, ported from `src/utils.ts`.
 *
 * Applied to hero team-boost and rebirth multipliers on both the summon path
 * and the save-read path in the shipped game, which means the rounding is part
 * of the stored value rather than a display concern: reading a save without it
 * produces a hero that differs from the same hero re-summoned.
 */
export function roundTo4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * The `Decimal` sibling of `safeMultiplier`.
 *
 * Needed because the progression stack is the one place a multiplier can run
 * out of float range: rebirth legacy is `1.5^prestigeCount`, and `Math.pow`
 * returns `Infinity` from prestige 1,760 on. Handed that, `safeMultiplier`
 * does exactly what it was written to do and returns 1 — which silently
 * deletes every rebirth the player ever did. Keeping the stack on `Decimal`
 * means the guard never has to fire for range alone.
 */
export function safeDecimalMultiplier(value: Decimal, cap?: Decimal): Decimal {
  if (value.isNan() || value.lt(0)) return new Decimal(1);
  return cap && value.gt(cap) ? cap : value;
}
