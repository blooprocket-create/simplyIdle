export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'godly' | 'transcendent';

/** How hard a rarity leans into rank scaling. */
export const RARITY_RANK_POWER: Record<Rarity, number> = {
  common: 0.9,
  uncommon: 1.0,
  rare: 1.12,
  epic: 1.28,
  legendary: 1.48,
  mythic: 1.72,
  godly: 2.05,
  transcendent: 2.45,
};

/**
 * Stat multiplier from a hero's rank. Additive growth plus an accelerating
 * term, with high-rarity power tapering after rank 5 so the top rarities do
 * not run away.
 *
 * Rounded to four decimals exactly as shipped — the rounding is part of the
 * balance, not a formatting choice, and dropping it changes every hero's
 * damage in the fourth significant digit.
 */
export function getRankStatMultiplier(rank: number, rarity: Rarity): number {
  const r = Math.max(1, rank);
  const rarityPower = RARITY_RANK_POWER[rarity] ?? 1;
  const additiveGrowth = (r - 1) * 0.015 * rarityPower;
  const diminishingFactor = rarityPower > 1.4 && r > 5 ? 1 - (rarityPower - 1.4) * 0.15 * (r - 5) : 1;
  const effectivePower = rarityPower * Math.max(0.5, diminishingFactor);
  const acceleratedGrowth = Math.pow(r - 1, 1.22) * 0.018 * effectivePower;
  return Math.round((1 + additiveGrowth + acceleratedGrowth) * 10000) / 10000;
}

/**
 * How much a rarity scales a hero's authored `baseTeamBoost`. Distinct from
 * `RARITY_RANK_POWER`: this one is applied once when the hero is summoned and
 * again as the lower bound when their save row is read back.
 */
export const RARITY_BOOST_MULTIPLIER: Record<Rarity, number> = {
  common: 1.0,
  uncommon: 1.15,
  rare: 1.35,
  epic: 1.6,
  legendary: 1.95,
  mythic: 2.35,
  godly: 3.0,
  transcendent: 3.55,
};

export const RARITY_IDS: readonly Rarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
  'godly',
  'transcendent',
];

export function isRarity(value: unknown): value is Rarity {
  return typeof value === 'string' && (RARITY_IDS as readonly string[]).includes(value);
}
