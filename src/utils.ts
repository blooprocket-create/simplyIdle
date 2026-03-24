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
