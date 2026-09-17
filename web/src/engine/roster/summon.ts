import { RARITY_IDS, RARITY_SUMMON_CHANCE, type Rarity } from '../../content/rarities';

/**
 * Summoning: the rarity roll, its two pity systems, and the milestones.
 *
 * The rewrite's first system with dice in it, and the reason this file takes a
 * `random: () => number` everywhere rather than reaching for `Math.random`.
 * The engine boundary already forbids reading the clock — time is an argument,
 * not an ambient fact — and randomness is the same argument for the same
 * reason: a gacha that reaches for the global cannot be tested against a
 * recorded baseline, and a gacha nobody can test against a baseline is one
 * whose rates nobody can check.
 *
 * **The draw order is part of the behaviour.** The shipped roll consumes
 * between one and three values per pull depending on which branch it takes,
 * and `__fixtures__/summon.json` records a pull-by-pull run against a scripted
 * source. A port that produced the same distribution while drawing in a
 * different order would pass every statistical test and disagree with the
 * shipped game on every single pull. So the order below is copied, not
 * reasoned about, and the fixture is what holds it.
 */

/** Pulls without a legendary or better. At this count the next pull is forced. */
export const PITY_THRESHOLD = 30;

/** Past this, each further pull adds a cumulative chance of a legendary+ roll. */
export const SOFT_PITY_START = 20;
export const SOFT_PITY_BOOST_PER_PULL = 0.03;

/** Transcendent is out of the pool until wave 150 and one prestige. */
export const POSTGAME_WAVE = 150;
export const POSTGAME_PRESTIGE = 1;

export function isPostgameUnlocked(highestWave: number, prestigeCount: number): boolean {
  return highestWave >= POSTGAME_WAVE && prestigeCount >= POSTGAME_PRESTIGE;
}

function rarityRank(rarity: Rarity): number {
  return RARITY_IDS.indexOf(rarity);
}

const LEGENDARY_RANK = rarityRank('legendary');

/**
 * The weighted table, minus transcendent until the postgame.
 *
 * Worth knowing what that subtraction does: the full table sums to exactly 1,
 * so removing transcendent's 0.001 leaves 0.999 — and `rollRarity` walks the
 * table accumulating chances and falls through to its *first* entry when
 * nothing matches. A pre-postgame roll above 0.999 therefore returns common.
 * One pull in a thousand is silently the worst outcome rather than the best.
 *
 * Ported as-is. It is a rounding artefact rather than a design, but it is a
 * rounding artefact the shipped game has, and the fixture records it.
 */
export function summonRarityPool(postgameUnlocked: boolean): readonly { id: Rarity; chance: number }[] {
  // Built from `RARITY_IDS` so the walk order is the authored order. The table
  // is accumulated in sequence, so reordering it re-tunes every rate.
  const table = RARITY_IDS.map(id => ({ id, chance: RARITY_SUMMON_CHANCE[id] }));
  return postgameUnlocked ? table : table.filter(entry => entry.id !== 'transcendent');
}

export function rollRarity(roll: number, pool: readonly { id: Rarity; chance: number }[]): Rarity {
  let accumulated = 0;
  for (const entry of pool) {
    accumulated += entry.chance;
    if (roll <= accumulated) return entry.id;
  }
  return pool[0]?.id ?? 'common';
}

export interface PityState {
  /** Pulls since the last legendary or better. */
  counter: number;
  /** A floor promised by a milestone, spent on the next pull either way. */
  guaranteedMin: Rarity | null;
}

export interface RarityRoll {
  rarity: Rarity;
  nextCounter: number;
  pityTriggered: boolean;
}

/** The legendary-and-above table hard pity draws from. */
function hardPityRarity(roll: number, postgameUnlocked: boolean): Rarity {
  if (postgameUnlocked) {
    if (roll < 0.7) return 'legendary';
    if (roll < 0.92) return 'mythic';
    if (roll < 0.99) return 'godly';
    return 'transcendent';
  }
  if (roll < 0.75) return 'legendary';
  if (roll < 0.95) return 'mythic';
  return 'godly';
}

/**
 * The same table for soft pity, and it is *not* the same numbers.
 *
 * Soft pity is slightly kinder at the top than hard pity: 0.75/0.95/0.99
 * against 0.70/0.92/0.99 in the postgame, and 0.80/0.96 against 0.75/0.95
 * before it. Easy to read as a duplicate and collapse into one function, which
 * would shift the rarity of every soft-pity pull.
 */
function softPityRarity(roll: number, postgameUnlocked: boolean): Rarity {
  if (postgameUnlocked) {
    if (roll < 0.75) return 'legendary';
    if (roll < 0.95) return 'mythic';
    if (roll < 0.99) return 'godly';
    return 'transcendent';
  }
  if (roll < 0.8) return 'legendary';
  if (roll < 0.96) return 'mythic';
  return 'godly';
}

/**
 * Roll a rarity, honouring both pity systems and any guaranteed floor.
 *
 * The branches draw different numbers of values, and that is deliberate:
 *
 * - **Hard pity** (the counter would reach the threshold): one draw.
 * - **Soft pity window** (counter at or past the start): one draw to test the
 *   boost, then one more either way — the legendary+ table on a hit, the full
 *   table on a miss. Two draws.
 * - **Ordinary**: one draw.
 */
export function rollRarityWithPity(state: PityState, postgameUnlocked: boolean, random: () => number): RarityRoll {
  if (state.counter + 1 >= PITY_THRESHOLD) {
    return { rarity: hardPityRarity(random(), postgameUnlocked), nextCounter: 0, pityTriggered: true };
  }

  const pool = summonRarityPool(postgameUnlocked);

  let rarity: Rarity;
  if (state.counter >= SOFT_PITY_START) {
    const boost = (state.counter - SOFT_PITY_START + 1) * SOFT_PITY_BOOST_PER_PULL;
    rarity = random() < boost ? softPityRarity(random(), postgameUnlocked) : rollRarity(random(), pool);
  } else {
    rarity = rollRarity(random(), pool);
  }

  /*
   * The floor is applied after the roll, so it raises a bad pull and leaves a
   * good one alone. The caller clears it either way — see the note on
   * `spendGuarantee` — which is how a player can spend a guaranteed Epic on a
   * pull that was already going to be legendary.
   */
  if (state.guaranteedMin && rarityRank(rarity) < rarityRank(state.guaranteedMin)) {
    rarity = state.guaranteedMin;
  }

  const legendaryPlus = rarityRank(rarity) >= LEGENDARY_RANK;
  return { rarity, nextCounter: legendaryPlus ? 0 : state.counter + 1, pityTriggered: false };
}

/**
 * What a milestone guarantee is worth after one pull: nothing.
 *
 * The shipped reducer writes `state.guaranteedMinRarity ? null : <new one>`,
 * so the flag set by the pull that crossed a milestone is cleared by the very
 * next pull whether or not the floor did anything. Stated as its own function
 * because written inline it reads like a bug and is not one — it is how the
 * promise stays a single pull rather than a standing buff.
 */
export function spendGuarantee(current: Rarity | null, earned: Rarity | null): Rarity | null {
  return current ? null : earned;
}

export interface Milestone {
  threshold: number;
  freeCharges?: number;
  sparkTokens?: number;
  guaranteedRarity?: Rarity;
  grantUnique?: boolean;
}

export interface MilestoneRewards {
  claimed: number[];
  freeCharges: number;
  sparkTokens: number;
  guaranteedRarity: Rarity | null;
  grantUnique: boolean;
}

/**
 * Which milestones a summon count has just crossed.
 *
 * Every unclaimed milestone at or below the count is claimed at once, not just
 * the newest — so an account that somehow jumps past several collects all of
 * them, and a guarantee from the highest one wins because the list is walked
 * in order.
 */
export function claimMilestones(
  totalSummons: number,
  claimed: readonly number[],
  milestones: readonly Milestone[],
): MilestoneRewards {
  const rewards: MilestoneRewards = {
    claimed: [...claimed],
    freeCharges: 0,
    sparkTokens: 0,
    guaranteedRarity: null,
    grantUnique: false,
  };

  for (const milestone of milestones) {
    if (totalSummons < milestone.threshold || claimed.includes(milestone.threshold)) continue;
    rewards.claimed.push(milestone.threshold);
    if (milestone.freeCharges) rewards.freeCharges += milestone.freeCharges;
    if (milestone.sparkTokens) rewards.sparkTokens += milestone.sparkTokens;
    if (milestone.guaranteedRarity) rewards.guaranteedRarity = milestone.guaranteedRarity;
    if (milestone.grantUnique) rewards.grantUnique = true;
  }

  return rewards;
}

/**
 * Spark tokens for a pull.
 *
 * Paid only when the template is already owned, at a rate set by the rarity
 * that was *pulled* rather than the rarity already held — so a duplicate of a
 * common hero rolled at legendary pays the legendary rate.
 */
export function sparkTokensForSummon(
  isDuplicate: boolean,
  rarity: Rarity,
  rates: Readonly<Record<Rarity, number>>,
): number {
  return isDuplicate ? rates[rarity] : 0;
}

/**
 * Which slice of the catalogue a rarity draws its hero from.
 *
 * Indices into `HERO_POOL`, so the *order* of that array is part of the
 * balance and not a presentation choice. The legendary/mythic band overlaps
 * the rare/epic one by ten heroes on purpose — the shipped comment says
 * "overlaps for variety" — so the same hero can be pulled at two very
 * different rarities.
 */
export interface TierRange {
  rarities: readonly Rarity[];
  startIndex: number;
  endIndex: number;
}

export const HERO_TIER_RANGES: readonly TierRange[] = [
  { rarities: ['common', 'uncommon'], startIndex: 0, endIndex: 30 },
  { rarities: ['rare', 'epic'], startIndex: 30, endIndex: 50 },
  { rarities: ['legendary', 'mythic'], startIndex: 40, endIndex: 60 },
  { rarities: ['godly', 'transcendent'], startIndex: 50, endIndex: 65 },
];

/** The rarity band a hero tier may hold. A roll outside it is pulled to the edge. */
export const TIER_RARITY_RANGE: Readonly<Record<number, { min: Rarity; max: Rarity }>> = {
  1: { min: 'common', max: 'legendary' },
  2: { min: 'common', max: 'legendary' },
  3: { min: 'rare', max: 'godly' },
  4: { min: 'epic', max: 'transcendent' },
  5: { min: 'epic', max: 'transcendent' },
};

/**
 * Pull a rarity into the band its hero's tier allows.
 *
 * A tier-one hero cannot be mythic and a tier-four cannot be common, so a roll
 * outside the band is clamped rather than rejected — which is why a run's
 * rarities do not match its rolls one for one. Clamping rather than re-rolling
 * also means the clamp costs no random value, which matters for staying in
 * step with a recorded run.
 */
export function clampRarityToTier(rarity: Rarity, tier: number): Rarity {
  const range = TIER_RARITY_RANGE[tier];
  if (!range) return rarity;
  const index = rarityRank(rarity);
  const min = rarityRank(range.min);
  const max = rarityRank(range.max);
  if (index < min) return range.min;
  if (index > max) return range.max;
  return rarity;
}

/** The two facts a pick needs about a hero. */
export interface SummonTemplate {
  id: string;
  tier: number;
}

/**
 * Pick a hero for a rarity, from that rarity's slice of the catalogue.
 *
 * One draw, always — including the fallback for a rarity no band covers, which
 * draws from the whole pool. Keeping the draw count the same on both paths is
 * what lets a caller advance a recorded sequence without knowing which path
 * was taken.
 */
export function pickTemplateForRarity<T extends SummonTemplate>(
  rarity: Rarity,
  pool: readonly T[],
  random: () => number,
): T {
  const band = HERO_TIER_RANGES.find(entry => entry.rarities.includes(rarity));
  const slice = band ? pool.slice(band.startIndex, band.endIndex) : pool;
  return slice[Math.floor(random() * slice.length)];
}

/**
 * The same pick, with a banner's featured hero given a chance to win it.
 *
 * The rate-up check is short-circuited when there is no featured hero — the
 * shipped expression is `featuredTemplate && rateUp && Math.random() < rateUp`
 * — so a pull with no banner draws *once*, not twice. Writing the condition in
 * a different order would draw an extra value on every ordinary pull and
 * desynchronise the whole sequence.
 */
export function pickWithBanner<T extends SummonTemplate>(
  rarity: Rarity,
  featured: T | null,
  rateUpByRarity: Readonly<Partial<Record<Rarity, number>>>,
  pool: readonly T[],
  random: () => number,
): { template: T; wasFeatured: boolean } {
  const rateUp = rateUpByRarity[rarity];
  if (featured && rateUp !== undefined && random() < rateUp) {
    return { template: featured, wasFeatured: true };
  }
  return { template: pickTemplateForRarity(rarity, pool, random), wasFeatured: false };
}

export interface SummonResult {
  /** The rarity after the tier clamp, which is the one the hero is created at. */
  rarity: Rarity;
  /** The rarity the dice actually produced, before the clamp moved it. */
  rolledRarity: Rarity;
  template: SummonTemplate;
  nextCounter: number;
  pityTriggered: boolean;
}

/**
 * One pull: roll, pick, clamp — in the order the shipped action does them.
 *
 * The order is the point. The clamp reads the *template's* tier, so it can
 * only run after the pick, and the pick reads the *rolled* rarity rather than
 * the clamped one — so a hero is chosen from the band the dice named and then
 * has their rarity dragged into their own tier's band. A port that clamped
 * first would pick from a different slice of the catalogue.
 */
export function summonPull<T extends SummonTemplate>(
  state: PityState,
  postgameUnlocked: boolean,
  pool: readonly T[],
  random: () => number,
): SummonResult & { template: T } {
  const roll = rollRarityWithPity(state, postgameUnlocked, random);
  const template = pickTemplateForRarity(roll.rarity, pool, random);
  return {
    rarity: clampRarityToTier(roll.rarity, template.tier),
    rolledRarity: roll.rarity,
    template,
    nextCounter: roll.nextCounter,
    pityTriggered: roll.pityTriggered,
  };
}
