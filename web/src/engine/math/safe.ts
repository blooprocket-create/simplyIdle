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
