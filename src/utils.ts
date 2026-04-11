/**
 * Format large numbers into readable K / M / B / T / Qa / Qi notation.
 */
export function fmt(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '0';
  const abs = Math.abs(n);
  if (abs < 1_000) return n.toFixed(abs < 10 ? 1 : 0);
  if (abs < 1_000_000) return (n / 1_000).toFixed(2) + 'K';
  if (abs < 1_000_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (abs < 1_000_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (abs < 1_000_000_000_000_000) return (n / 1_000_000_000_000).toFixed(2) + 'T';
  return (n / 1_000_000_000_000_000).toFixed(2) + 'Qa';
}

/**
 * Safe division that returns `fallback` when the divisor is zero, NaN, or non-finite.
 */
export function safeDivide(numerator: number, denominator: number, fallback: number = 0): number {
  if (!denominator || !Number.isFinite(denominator) || !Number.isFinite(numerator)) return fallback;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

/**
 * Round to 4 decimal places without floating-point string conversion.
 */
export function roundTo4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Clamp a multiplier product to a safe range and guard against NaN/Infinity.
 */
export function safeMultiplier(value: number, cap: number = 1e12): number {
  if (!Number.isFinite(value) || value < 0) return 1;
  return Math.min(value, cap);
}

/**
 * Calculate the cost to buy the next N of a building given current owned count.
 */
export function buildingCost(baseCost: number, owned: number, scale: number): number {
  return Math.floor(baseCost * Math.pow(scale, owned));
}

/**
 * Calculate bulk cost for buying `amount` buildings starting from `owned`.
 */
export function bulkCost(baseCost: number, owned: number, amount: number, scale: number): number {
  // geometric sum: baseCost * scale^owned * (scale^amount - 1) / (scale - 1)
  return Math.floor(baseCost * Math.pow(scale, owned) * (Math.pow(scale, amount) - 1) / (scale - 1));
}
