import { RARITY_BOOST_MULTIPLIER, type Rarity } from '../../content/rarities';
import { roundTo4 } from '../math/safe';
import { preferredUniqueBearer, UNIQUE_RANK_CAP } from '../save/migrate';
import type { SaveV3, SavedHero, SavedUniqueGear } from '../save/schema';
import {
  claimMilestones,
  isPostgameUnlocked,
  spendGuarantee,
  summonPull,
  type Milestone,
  type SummonTemplate,
} from './summon';

/**
 * One pull, applied to a save.
 *
 * `summon.ts` holds the dice and knows nothing about a save; this is the other
 * half — what a pull costs, where the hero lands, and which counters move. Kept
 * apart because the dice are the part with a recorded baseline and the save is
 * the part with a schema, and one file doing both would need the catalogue and
 * the storage shape at once.
 *
 * **The draw order is the contract.** The shipped action draws in a fixed
 * sequence and `__fixtures__/summon.json` records how many values each pull
 * consumed, so the order here is copied rather than reasoned about:
 *
 * 1. the roll, and the hero pick — one to three values, in `summonPull`
 * 2. the new hero's uid, which the shipped game builds from `Math.random()`
 * 3. the six-percent chance of the hero's unique relic dropping
 * 4. a random hero for the milestone relic, only when a milestone grants one
 *
 * `summon.test.ts` replays the recorded runs through `summonPull` and *skips*
 * the values the port does not model. This module draws all of them, so its
 * own replay can assert the count matches exactly instead — which is the
 * stronger claim, and the one that catches a draw happening in the wrong place.
 */

/** A pull needs the hero's tier to clamp by, and their boost to scale. */
export interface SummonPoolEntry extends SummonTemplate {
  baseTeamBoost: number;
}

/** The chance a pull also drops the summoned hero's unique relic. */
export const UNIQUE_RELIC_DROP_CHANCE = 0.06;

/** What a pull is paid with when no free charge is held. */
export type SummonPayment = 'bossTears' | 'diamonds';

export interface SummonRequest {
  save: SaveV3;
  pool: readonly SummonPoolEntry[];
  milestones: readonly Milestone[];
  sparkRates: Readonly<Record<Rarity, number>>;
  pay: SummonPayment;
  /** The price after any VIP discount. The caller owns that arithmetic. */
  cost: number;
  random: () => number;
  /** Only for the uid. Nothing here reads a clock. */
  nowMs: number;
}

export interface SummonOutcome {
  save: SaveV3;
  hero: SavedHero;
  /** The rarity after the tier clamp — what the hero actually is. */
  rarity: Rarity;
  /** What the dice said, before the clamp moved it. */
  rolledRarity: Rarity;
  pityTriggered: boolean;
  /** Whether this template was already in the roster. Decides the spark. */
  duplicate: boolean;
  sparkGained: number;
  /** Thresholds crossed by this pull. Empty on almost every pull. */
  milestonesClaimed: number[];
  paidWith: 'free' | SummonPayment;
  /** Template ids whose relic advanced a rank on this pull. */
  relicsGranted: string[];
}

/**
 * A uid for the new hero.
 *
 * The shipped format, `<template>_<ms>_<0-9999>`, kept because the uid is the
 * roster key and both apps read each other's saves. What is *not* shipped is
 * the collision guard: two pulls in the same millisecond that draw the same
 * value produce the same uid, and a duplicate uid is not a cosmetic problem —
 * `readRoster` drops the second row outright, so the player pays for a hero and
 * receives nothing.
 */
function freshUid(templateId: string, nowMs: number, roll: number, taken: ReadonlySet<string>): string {
  return uniqueUid(`${templateId}_${Math.floor(nowMs)}_${Math.floor(roll * 10_000)}`, taken);
}

/**
 * The collision guard on its own, because the spark exchange builds a uid in
 * its own namespace — `<template>_<ms>_spark_<n>` — and needs the same
 * protection. Only the base differs; what happens when it is already taken
 * does not.
 */
export function uniqueUid(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let suffix = 1; ; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Advance a hero's unique relic by one rank, and decide who carries it.
 *
 * A relic already at the cap is not advanced and not re-pointed — the shipped
 * guard returns the state untouched — so a player at rank ten stops gaining
 * from the drop rather than having their bearer quietly reassigned.
 */
function grantRelic(
  uniqueByHeroId: Readonly<Record<string, SavedUniqueGear>>,
  heroes: readonly SavedHero[],
  templateId: string,
  fallbackUid: string,
): Record<string, SavedUniqueGear> | null {
  const current = uniqueByHeroId[templateId]?.rank ?? 0;
  if (current >= UNIQUE_RANK_CAP) return null;

  const bearer = preferredUniqueBearer(heroes, templateId);
  return {
    ...uniqueByHeroId,
    [templateId]: {
      rank: Math.max(1, current + 1),
      // The stored bearer wins when there is one, so a drop does not move a
      // relic the player placed. Only a relic with no bearer picks one.
      equippedByUid: uniqueByHeroId[templateId]?.equippedByUid ?? bearer?.uid ?? fallbackUid,
    },
  };
}

/**
 * Re-point a relic at the best copy of its hero, now that a new one exists.
 *
 * Draws nothing. Runs before the drop chance, as shipped: a pull that adds a
 * better copy hands them the relic even when the pull itself drops nothing.
 */
export function syncRelicBearer(
  uniqueByHeroId: Readonly<Record<string, SavedUniqueGear>>,
  heroes: readonly SavedHero[],
  templateId: string,
): Record<string, SavedUniqueGear> | null {
  const progress = uniqueByHeroId[templateId];
  if (!progress || progress.rank <= 0 || progress.equippedByUid === null) return null;

  const bearer = preferredUniqueBearer(heroes, templateId);
  if (!bearer || bearer.uid === progress.equippedByUid) return null;
  return { ...uniqueByHeroId, [templateId]: { ...progress, equippedByUid: bearer.uid } };
}

/**
 * Pull once, or refuse.
 *
 * Returns null when the account can pay with neither a free charge nor the
 * currency asked for — and refuses **before drawing anything**, so a refused
 * pull does not advance the sequence. The shipped action returns the state
 * unchanged for the same reason.
 */
export function applySummon(request: SummonRequest): SummonOutcome | null {
  const { save, pool, random } = request;
  if (pool.length === 0) return null;

  const useFree = save.summon.freeCharges > 0;
  const held = request.pay === 'diamonds' ? save.wallet.diamonds : save.wallet.bossTears;
  const cost = Math.max(0, Math.floor(request.cost));
  if (!useFree && held < cost) return null;

  const postgame = isPostgameUnlocked(save.progression.highestWave, save.progression.prestigeCount);
  const pull = summonPull(
    { counter: save.summon.pityCounter, guaranteedMin: save.summon.guaranteedMinRarity },
    postgame,
    pool,
    random,
  );

  const taken = new Set(save.roster.heroes.map(entry => entry.uid));
  const hero: SavedHero = {
    id: pull.template.id,
    uid: freshUid(pull.template.id, request.nowMs, random(), taken),
    rarity: pull.rarity,
    level: 1,
    rank: 1,
    teamBoost: roundTo4(pull.template.baseTeamBoost * RARITY_BOOST_MULTIPLIER[pull.rarity]),
    rebirthStatMult: 1,
  };

  // Measured against the roster *before* the pull lands, or every hero is
  // their own duplicate.
  const duplicate = save.roster.heroes.some(entry => entry.id === hero.id);
  const sparkGained = duplicate ? (request.sparkRates[pull.rarity] ?? 0) : 0;

  // Prepended, as shipped. It matters at the far end: `readRoster` keeps the
  // first five hundred rows, so an account at the cap loses its *oldest* hero
  // to a new pull rather than refusing the pull.
  const heroes = [hero, ...save.roster.heroes];

  const totalSummons = save.summon.totalSummons + 1;
  const rewards = claimMilestones(totalSummons, save.summon.claimedMilestones, request.milestones);

  let uniqueByHeroId: Record<string, SavedUniqueGear> = { ...save.roster.uniqueByHeroId };
  const relicsGranted: string[] = [];
  uniqueByHeroId = syncRelicBearer(uniqueByHeroId, heroes, hero.id) ?? uniqueByHeroId;

  if (random() <= UNIQUE_RELIC_DROP_CHANCE) {
    const dropped = grantRelic(uniqueByHeroId, heroes, hero.id, hero.uid);
    if (dropped) {
      uniqueByHeroId = dropped;
      relicsGranted.push(hero.id);
    }
  }

  if (rewards.grantUnique) {
    // A relic for a hero drawn from the whole pool, which need not be one the
    // player owns — the shipped reward builds a stand-in unit to grant it.
    const lucky = pool[Math.floor(random() * pool.length)];
    const granted = lucky && grantRelic(uniqueByHeroId, heroes, lucky.id, hero.uid);
    if (granted) {
      uniqueByHeroId = granted;
      relicsGranted.push(lucky.id);
    }
  }

  return {
    save: {
      ...save,
      wallet: {
        ...save.wallet,
        diamonds: !useFree && request.pay === 'diamonds' ? save.wallet.diamonds - cost : save.wallet.diamonds,
        bossTears: !useFree && request.pay === 'bossTears' ? save.wallet.bossTears - cost : save.wallet.bossTears,
        sparkTokens: save.wallet.sparkTokens + sparkGained + rewards.sparkTokens,
      },
      summon: {
        pityCounter: pull.nextCounter,
        totalSummons,
        freeCharges: (useFree ? save.summon.freeCharges - 1 : save.summon.freeCharges) + rewards.freeCharges,
        claimedMilestones: rewards.claimed,
        guaranteedMinRarity: spendGuarantee(save.summon.guaranteedMinRarity, rewards.guaranteedRarity),
        firstGiven: true,
      },
      roster: { ...save.roster, heroes, uniqueByHeroId },
    },
    hero,
    rarity: pull.rarity,
    rolledRarity: pull.rolledRarity,
    pityTriggered: pull.pityTriggered,
    duplicate,
    sparkGained,
    milestonesClaimed: rewards.claimed.filter(entry => !save.summon.claimedMilestones.includes(entry)),
    paidWith: useFree ? 'free' : request.pay,
    relicsGranted,
  };
}
