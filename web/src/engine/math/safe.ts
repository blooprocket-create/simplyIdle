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
