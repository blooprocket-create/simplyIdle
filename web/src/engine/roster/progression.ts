import type { Rarity } from '../../content/rarities';

/**
 * What a player does to a hero once they own them: level, rank, rebirth,
 * recycle.
 *
 * No dice here — every number is a pure function of the hero and their rarity,
 * which is why this file is measured against `__fixtures__/hero-progression.json`
 * across the whole range of each formula rather than against a replayed run.
 *
 * Three shipped behaviours are ported deliberately rather than tidied. Each is
 * called out where it lives, because each is the kind of thing a clean-room
 * implementation would get "right" and thereby get wrong.
 */

export const HERO_LEVEL_CAP = 999;
export const HERO_RANK_CAP = 10;

/** Gold to take a hero from `level` to `level + 1`. */
export function heroGoldLevelCost(level: number): number {
  return Math.floor(100 * Math.pow(1.08, level - 1));
}

/** How hard a rarity leans on rank-up shard costs. */
export const RARITY_RANK_COST: Record<Rarity, number> = {
  common: 1.0,
  uncommon: 1.25,
  rare: 1.7,
  epic: 2.45,
  legendary: 3.7,
  mythic: 5.3,
  godly: 7.8,
  transcendent: 11.4,
};

export interface RankConfig {
  rankNumber: number;
  shardCostToRankUp: number;
  statMultiplier: number;
}

export const RANK_CONFIGS: readonly RankConfig[] = [
  { rankNumber: 1, shardCostToRankUp: 0, statMultiplier: 1.0 },
  { rankNumber: 2, shardCostToRankUp: 10, statMultiplier: 1.05 },
  { rankNumber: 3, shardCostToRankUp: 25, statMultiplier: 1.1 },
  { rankNumber: 4, shardCostToRankUp: 50, statMultiplier: 1.15 },
  { rankNumber: 5, shardCostToRankUp: 100, statMultiplier: 1.2 },
  { rankNumber: 6, shardCostToRankUp: 200, statMultiplier: 1.25 },
  { rankNumber: 7, shardCostToRankUp: 350, statMultiplier: 1.3 },
  { rankNumber: 8, shardCostToRankUp: 525, statMultiplier: 1.35 },
  { rankNumber: 9, shardCostToRankUp: 750, statMultiplier: 1.4 },
  { rankNumber: 10, shardCostToRankUp: 1000, statMultiplier: 1.45 },
];

/**
 * Shards to reach `targetRank`.
 *
 * Returns `Number.MAX_SAFE_INTEGER` for a rank the table does not have, which
 * is a sentinel and not a price — and note that it is *finite*, so the shipped
 * reducer's `Number.isFinite` guard lets it through. What actually stops a
 * rank-eleven attempt is the separate `rank >= 10` check. Ported with the same
 * sentinel so a caller that checks affordability behaves identically.
 */
export function rankUpShardCost(rarity: Rarity, targetRank: number): number {
  const config = RANK_CONFIGS.find(entry => entry.rankNumber === targetRank);
  if (!config) return Number.MAX_SAFE_INTEGER;
  const rarityMult = RARITY_RANK_COST[rarity] ?? 1;
  const progressiveMult = 1 + Math.pow(Math.max(0, targetRank - 1), 1.15) * 0.08;
  return Math.ceil(config.shardCostToRankUp * rarityMult * progressiveMult);
}

/** Total shards to walk a hero from one rank to another. */
export function rankUpCostToTarget(rarity: Rarity, currentRank: number, targetRank: number): number {
  const from = Math.max(1, Math.min(HERO_RANK_CAP, Math.floor(currentRank)));
  const to = Math.max(from, Math.min(HERO_RANK_CAP, Math.floor(targetRank)));
  let total = 0;
  for (let rank = from + 1; rank <= to; rank += 1) total += rankUpShardCost(rarity, rank);
  return total;
}

const RECYCLE_BASE_BY_RARITY: Record<Rarity, number> = {
  common: 5,
  uncommon: 15,
  rare: 40,
  epic: 100,
  legendary: 250,
  mythic: 600,
  godly: 1500,
  transcendent: 3200,
};

/**
 * Shards from recycling a hero.
 *
 * **The level term is `Math.max(1, level - 1)`, not `Math.max(0, level - 1)`.**
 * The floor is on the wrong side of the subtraction to be a guard against
 * zero, so a level-one hero is paid the level-two rate — the first level a
 * hero gains is worth nothing when recycling them.
 *
 * Ported as it stands. A port that "fixed" it would pay *less* for a level-one
 * hero than the shipped game does, which is a refund a player would notice,
 * and the two apps share accounts.
 */
export function calculateShardReward(rarity: Rarity, level: number): number {
  const base = RECYCLE_BASE_BY_RARITY[rarity] ?? 5;
  const levelMultiplier = 1 + Math.max(1, level - 1) * 0.15;
  return Math.floor(base * levelMultiplier);
}

const REBIRTH_REFERENCE_MULT = 1.15;
const REBIRTH_SHARD_BASE_COST = 320;
const REBIRTH_SHARD_COST_MULT = 1.4;
const REBIRTH_SHARD_GROWTH_PER_REBIRTH = 0.22;
/** Rebirth is priced as if the hero were this level, however deep they are. */
const REBIRTH_SHARD_LEVEL_REFERENCE = 80;
const REBIRTH_ESSENCE_BASE_COST = 1;
const REBIRTH_ESSENCE_STEP = 2;
const REBIRTH_GAIN_BASE = 0.75;
const REBIRTH_GAIN_DECAY = 0.84;
const REBIRTH_GAIN_FLOOR = 0.04;

export interface RebirthPlan {
  estimatedRebirths: number;
  shardCost: number;
  essenceCost: number;
  nextStatMultiplier: number;
  statGainPct: number;
}

/**
 * What a rebirth costs and grants.
 *
 * **How many times a hero has been reborn is never stored.** The count is
 * recovered from their stat multiplier by logarithm —
 * `floor(log(mult) / log(1.15) + 1e-6)` — and every cost below is built on it.
 *
 * The epsilon guards the float: `Math.log(1.15 ** 3) / Math.log(1.15)` lands a
 * hair *below* 3, so `floor` would return 2 and charge a thrice-reborn hero the
 * twice-reborn price. Measured rather than assumed — it changes the answer at
 * exactly two of the first twelve powers, 3 and 4.
 *
 * It does **not** guard the rounding, which is what it looks like it is for.
 * `nextStatMultiplier` is rounded to four decimals, and across the first twelve
 * rebirths the rounded values reconstruct identically with the epsilon and
 * without it. So the guard sits on a case the game's own stored values never
 * quite reach — but a port that dropped it would still diverge the moment a
 * multiplier arrived unrounded, and the shipped code is what defines the
 * answer here.
 *
 * Either way the reconstruction is a number a port has to reproduce exactly
 * rather than approximately, which is why the fixture walks it across six
 * multipliers including ones that are not powers of 1.15.
 *
 * The shard cost is measured at `min(level, 80)`. A hero at the cap is priced
 * as an eighty — which is what keeps rebirth priced by rarity rather than by a
 * level every candidate necessarily shares, since rank ten requires the cap.
 */
export function heroRebirthPlan(rarity: Rarity, level: number, rebirthStatMult: number): RebirthPlan {
  const statMult = Math.max(1, rebirthStatMult);
  const estimatedRebirths = Math.max(0, Math.floor(Math.log(statMult) / Math.log(REBIRTH_REFERENCE_MULT) + 1e-6));

  const baseShardCost = Math.max(
    REBIRTH_SHARD_BASE_COST,
    Math.floor(calculateShardReward(rarity, Math.min(level, REBIRTH_SHARD_LEVEL_REFERENCE)) * REBIRTH_SHARD_COST_MULT),
  );
  const shardCost = Math.floor(baseShardCost * (1 + estimatedRebirths * REBIRTH_SHARD_GROWTH_PER_REBIRTH));
  const essenceCost = REBIRTH_ESSENCE_BASE_COST + Math.floor(estimatedRebirths / REBIRTH_ESSENCE_STEP);

  const gainPct = Math.max(REBIRTH_GAIN_FLOOR, REBIRTH_GAIN_BASE * Math.pow(REBIRTH_GAIN_DECAY, estimatedRebirths));

  return {
    estimatedRebirths,
    shardCost,
    essenceCost,
    // Rounded to four decimals, which is what makes the reconstruction above
    // need its epsilon. The two are a pair; changing either breaks the other.
    nextStatMultiplier: Number((statMult * (1 + gainPct)).toFixed(4)),
    statGainPct: Number((gainPct * 100).toFixed(2)),
  };
}

export interface RosterHero {
  uid: string;
  rarity: Rarity;
  level: number;
  rank: number;
  rebirthStatMult: number;
}

export interface Wallet {
  gold: number;
  heroShards: number;
  essence: number;
}

/**
 * The four actions, as pure functions returning null when they cannot happen.
 *
 * Null rather than the unchanged input, which is what the shipped reducer
 * returns. A caller cannot tell "nothing happened" from "it worked and changed
 * nothing" when both come back as the same object, and these are engine
 * functions rather than one component's private handlers — the refusal is
 * something a caller should be able to see and say something about.
 */
export interface Applied {
  hero: RosterHero;
  wallet: Wallet;
}

export function levelUpWithGold(hero: RosterHero, wallet: Wallet): Applied | null {
  if (hero.level >= HERO_LEVEL_CAP) return null;
  const cost = heroGoldLevelCost(hero.level);
  if (wallet.gold < cost) return null;
  return { hero: { ...hero, level: hero.level + 1 }, wallet: { ...wallet, gold: wallet.gold - cost } };
}

export function rankUp(hero: RosterHero, wallet: Wallet): Applied | null {
  if (hero.rank >= HERO_RANK_CAP) return null;
  const cost = rankUpShardCost(hero.rarity, hero.rank + 1);
  if (wallet.heroShards < cost) return null;
  return { hero: { ...hero, rank: hero.rank + 1 }, wallet: { ...wallet, heroShards: wallet.heroShards - cost } };
}

export function rankUpToMax(hero: RosterHero, wallet: Wallet): Applied | null {
  if (hero.rank >= HERO_RANK_CAP) return null;
  const cost = rankUpCostToTarget(hero.rarity, hero.rank, HERO_RANK_CAP);
  if (wallet.heroShards < cost) return null;
  return { hero: { ...hero, rank: HERO_RANK_CAP }, wallet: { ...wallet, heroShards: wallet.heroShards - cost } };
}

/**
 * Rebirth, which is gated on *both* caps.
 *
 * Rank ten and level 999 — a hero at the level cap but rank nine cannot be
 * reborn, and neither can the reverse. Checking only one is the obvious
 * mistake and would let a player reset a hero they had not finished.
 */
export function rebirth(hero: RosterHero, wallet: Wallet): (Applied & { plan: RebirthPlan }) | null {
  if (hero.rank < HERO_RANK_CAP || hero.level < HERO_LEVEL_CAP) return null;
  const plan = heroRebirthPlan(hero.rarity, hero.level, hero.rebirthStatMult);
  if (wallet.heroShards < plan.shardCost || wallet.essence < plan.essenceCost) return null;
  return {
    hero: { ...hero, level: 1, rank: 1, rebirthStatMult: plan.nextStatMultiplier },
    wallet: {
      ...wallet,
      heroShards: wallet.heroShards - plan.shardCost,
      essence: wallet.essence - plan.essenceCost,
    },
    plan,
  };
}

/**
 * Recycle, paid at the weekly event's shard rate.
 *
 * The multiplier is an argument rather than read from anywhere: this is the
 * one place in the roster where the rotating weekly event reaches, and an
 * engine that looked the event up for itself would be reading a clock.
 */
export function recycleShards(hero: RosterHero, weeklyShardMultiplier: number): number {
  return Math.ceil(calculateShardReward(hero.rarity, hero.level) * weeklyShardMultiplier);
}
