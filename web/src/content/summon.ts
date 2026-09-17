import type { Rarity } from './rarities';
import type { Milestone } from '../engine/roster/summon';
import type { SparkExchangeOption } from '../engine/roster/team';

/**
 * What summoning costs, what it promises, and what it shows.
 *
 * The rules live in `engine/roster/summon.ts` and take every one of these as an
 * argument — the milestone list, the spark rates, the hero pool — because the
 * engine may not read the catalogue. This is the catalogue side of that seam,
 * and `summon.test.ts` checks every figure here against the fixture generated
 * from the shipped source rather than trusting the transcription.
 */

/**
 * Boss tears for one pull. **One**, and the constant that says otherwise is
 * dead.
 *
 * `gameConfig.GACHA_SUMMON_COST` is exported as 500 and used by nothing: both
 * `SUMMON_HERO` implementations guard on `bossTears < 1` and charge
 * `bossTears - 1`. This port read the constant and charged five hundred — five
 * hundred times the shipped price on the game's main gacha — because the
 * Phase 8 fixture *recorded the constant* rather than measuring a pull, and a
 * recorded constant agrees with itself perfectly.
 *
 * `summonFixture` now drives a pull through the reducer and records what it
 * takes out of the wallet. It takes one.
 */
export const GACHA_SUMMON_COST = 1;

/** The dead constant, kept because the fixture records it and names it dead. */
export const SHIPPED_GACHA_COST_CONSTANT = 500;

/** Diamonds for one pull. This one is real, and is charged. */
export const DIAMOND_SUMMON_COST = 500;

/**
 * VIP 3 and above takes a tenth off the **diamond** price.
 *
 * Not off the tear price, which is a guard rather than a cost: the tear path
 * does no arithmetic at all, so there is nothing there to discount. Measured
 * both ways — a VIP pays 450 diamonds and still pays exactly one tear.
 */
export const VIP_SUMMON_DISCOUNT_LEVEL = 3;
export const VIP_SUMMON_DISCOUNT = 0.1;

/**
 * What a pull costs after VIP.
 *
 * `Math.floor`, as shipped — a tenth off 500 is exactly 450, so the rounding
 * never bites at the shipped prices and would the moment either changes.
 */
export function summonCost(base: number, vipLevel: number): number {
  const discount = vipLevel >= VIP_SUMMON_DISCOUNT_LEVEL ? VIP_SUMMON_DISCOUNT : 0;
  return Math.floor(base * (1 - discount));
}

/** Spark tokens paid for a duplicate, at the rarity that was *pulled*. */
export const SPARK_TOKEN_BY_RARITY: Readonly<Record<Rarity, number>> = {
  common: 1,
  uncommon: 3,
  rare: 8,
  epic: 20,
  legendary: 50,
  mythic: 120,
  godly: 300,
  transcendent: 600,
};

/**
 * What crossing a summon count is worth.
 *
 * Six rows that differ in one field each, which is exactly the shape a
 * hand-copy gets wrong quietly. `rewardLabel` is carried as authored rather
 * than rebuilt from the fields, because it is the string the player reads and
 * the two apps share accounts.
 */
export interface SummonMilestone extends Milestone {
  rewardLabel: string;
}

export const SUMMON_MILESTONES: readonly SummonMilestone[] = [
  { threshold: 10, rewardLabel: '5 Free Summon Charges', freeCharges: 5 },
  { threshold: 50, rewardLabel: 'Next summon guaranteed Epic+', guaranteedRarity: 'epic' },
  { threshold: 100, rewardLabel: '500 Spark Tokens', sparkTokens: 500 },
  { threshold: 250, rewardLabel: 'Next summon guaranteed Legendary+', guaranteedRarity: 'legendary' },
  { threshold: 500, rewardLabel: '2000 Spark Tokens + Unique Gear', sparkTokens: 2000, grantUnique: true },
  { threshold: 1000, rewardLabel: 'Next summon guaranteed Mythic+', guaranteedRarity: 'mythic' },
];

/**
 * A spark exchange row, with the line the player reads.
 *
 * `label` is carried as authored rather than built from the fields, for the
 * same reason `rewardLabel` is: it is the string on the button, both apps
 * share accounts, and "Choose a Mythic+ Hero" is not something a formatter
 * would arrive at from `{ kind: 'targeted_hero', minRarity: 'mythic' }`.
 *
 * The labels overpromise slightly, and are kept anyway. "Choose" is what the
 * option is *for* — the action takes a `targetHeroId` — but the shipped screen
 * never passes one, so every purchase is a random hero from that rarity's
 * band. Rewording it here would make the two apps' buttons disagree.
 */
export interface SparkExchange extends SparkExchangeOption {
  label: string;
}

export const SPARK_EXCHANGE_OPTIONS: readonly SparkExchange[] = [
  { id: 'spark_free_charge', label: '1 Free Summon Charge', sparkCost: 50, kind: 'free_summon' },
  { id: 'spark_rare', label: 'Choose a Rare-tier Hero', sparkCost: 150, kind: 'targeted_hero', minRarity: 'rare' },
  { id: 'spark_epic', label: 'Choose an Epic-tier Hero', sparkCost: 500, kind: 'targeted_hero', minRarity: 'epic' },
  {
    id: 'spark_legendary',
    label: 'Choose a Legendary-tier Hero',
    sparkCost: 1_500,
    kind: 'targeted_hero',
    minRarity: 'legendary',
  },
  { id: 'spark_mythic', label: 'Choose a Mythic+ Hero', sparkCost: 5_000, kind: 'targeted_hero', minRarity: 'mythic' },
  {
    id: 'spark_transcendent_t4t5',
    label: 'Guaranteed Tier 4/5 Transcendent Hero',
    sparkCost: 75_000,
    kind: 'guaranteed_transcendent',
    minRarity: 'transcendent',
    minTier: 4,
  },
];

/**
 * A banner's chance of winning a legendary-or-better pull outright.
 *
 * Only the top four rarities appear, which is what makes `pickWithBanner`'s
 * short-circuit matter: an ordinary pull finds no rate-up and draws once.
 */
export const BANNER_RATE_UP_BY_RARITY: Readonly<Partial<Record<Rarity, number>>> = {
  legendary: 0.35,
  mythic: 0.45,
  godly: 0.55,
  transcendent: 0.65,
};

export interface FeaturedBanner {
  id: string;
  title: string;
  description: string;
  featuredHeroId: string;
  artEmoji: string;
}

/**
 * Seven banners the shipped game never selects.
 *
 * `pickHeroWithBanner` is only ever called with an undefined featured hero, so
 * the rate-up table above has no caller either — the whole banner system is
 * authored content that nothing reaches. Ported anyway, and for the same reason
 * the untracked achievements were: the list is what a screen would show, and a
 * Summon screen that offered one banner would be telling the player this game
 * has one.
 */
export const FEATURED_SUMMON_BANNERS: readonly FeaturedBanner[] = [
  {
    id: 'astral-vanguard',
    title: 'Astral Vanguard',
    description: 'Void command mobilized for precision warfront strikes.',
    featuredHeroId: 'h64',
    artEmoji: '🌌',
  },
  {
    id: 'worldrend-ascendant',
    title: 'Worldrend Ascendant',
    description: 'Frontline cataclysm specialists break siege lines.',
    featuredHeroId: 'h61',
    artEmoji: '🗻',
  },
  {
    id: 'abyssal-tide',
    title: 'Abyssal Tide',
    description: 'Berserker leviathans surge through fractured gates.',
    featuredHeroId: 'h62',
    artEmoji: '🌊',
  },
  {
    id: 'sunflame-flight',
    title: 'Sunflame Flight',
    description: 'Skyborn marksmen dominate extreme-range execution.',
    featuredHeroId: 'h63',
    artEmoji: '🦅',
  },
  {
    id: 'eternal-cycle',
    title: 'Eternal Cycle',
    description: 'Monastic avatars reset fate with impossible tempo.',
    featuredHeroId: 'h65',
    artEmoji: '♾️',
  },
  {
    id: 'time-hegemony',
    title: 'Time Hegemony',
    description: 'Chrono-casters lock timelines around elite targets.',
    featuredHeroId: 'h57',
    artEmoji: '⏰',
  },
  {
    id: 'imperial-fall',
    title: 'Imperial Fall',
    description: 'Crown-era warlords reclaim ruined dynastic thrones.',
    featuredHeroId: 'h52',
    artEmoji: '👑',
  },
];

export function bannerById(id: string): FeaturedBanner | undefined {
  return FEATURED_SUMMON_BANNERS.find(banner => banner.id === id);
}
