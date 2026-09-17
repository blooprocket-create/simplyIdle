import { RARITY_BOOST_MULTIPLIER, type Rarity } from '../../content/rarities';
import { roundTo4 } from '../math/safe';
import type { SaveV3, SavedHero, SavedUniqueGear } from '../save/schema';
import { clampRarityToTier, pickTemplateForRarity } from './summon';
import { syncRelicBearer, uniqueUid, type SummonPoolEntry } from './summonSave';
import { spendSpark, type SparkExchangeOption } from './team';

/**
 * One spark exchange, applied to a save.
 *
 * The same split `summonSave.ts` makes: `team.ts` holds the purse rule — find
 * the option, check the balance, subtract — and this is the half that has to
 * know where a hero lands. Spark is the currency a *duplicate* pull pays out,
 * so this is the one way a run of bad luck turns into a hero the player chose
 * the tier of.
 *
 * **An exchange is not a summon**, and that is the thing a port is most likely
 * to get wrong, because routing it through `applySummon` would look like
 * reuse. It would also move the pity counter, count towards the milestone
 * track, and pay duplicate spark back — none of which the shipped action does.
 * The free-charge option does not even grant a summon; it grants a *charge*,
 * to be spent later on a real one.
 *
 * **The draw order is the contract**, as it is for a pull:
 *
 * 1. the hero pick — one value, and **skipped entirely** when the player named
 *    a target, which is why a targeted exchange draws one value and an
 *    untargeted one draws two
 * 2. the new hero's uid
 *
 * No relic drop chance, unlike a pull: the exchange never drops a relic, so
 * the only relic work it does is re-pointing one that a better copy just
 * outclassed. `__fixtures__/team-management.json` records the draw counts.
 */

/** What an exchange needs supplied, since the engine may not read any of it. */
export interface SparkRequest {
  save: SaveV3;
  /** The catalogue, in pick order. Index decides which band a rarity draws from. */
  pool: readonly SummonPoolEntry[];
  /** The rows on offer. Content, passed in. */
  options: readonly SparkExchangeOption[];
  optionId: string;
  /**
   * The hero the player asked for, when the option lets them ask.
   *
   * The shipped screen never passes one — every purchase is a random hero from
   * the rarity's band — but the action supports it and the option labels
   * promise it ("Choose a Rare-tier Hero"). Honoured here so that a screen
   * which does offer the choice is a screen change rather than an engine one.
   */
  targetHeroId?: string;
  random: () => number;
  /** Only for the uid. Nothing here reads a clock. */
  nowMs: number;
}

export interface SparkOutcome {
  save: SaveV3;
  optionId: string;
  sparkSpent: number;
  /** Null for the free-charge option, which hands over no hero. */
  hero: SavedHero | null;
  /** The rarity after the tier clamp — what the hero actually is. */
  rarity: Rarity | null;
  /** What the option promised, before the clamp moved it. */
  askedRarity: Rarity | null;
  /** One for the free-charge option, zero otherwise. */
  freeChargesGained: number;
  /** Whether this template was already in the roster. Pays nothing either way. */
  duplicate: boolean;
}

/** The top tier a `guaranteed_transcendent` pick will reach down from. */
export const TRANSCENDENT_MAX_TIER = 5;

/**
 * Pick the hero an exchange hands over, and the rarity they arrive at.
 *
 * One draw for the pick in every branch that draws at all, which is what keeps
 * a caller able to advance a recorded sequence without knowing which branch
 * was taken — the same property `pickTemplateForRarity` is built around.
 *
 * The clamp is applied to the *picked hero's* tier, not to the option's, and
 * it runs after the pick rather than constraining it. With the shipped
 * catalogue it never bites: `spark_rare` and `spark_epic` draw from tiers 2-3,
 * whose bands run `common..legendary` and `rare..godly`, and `spark_mythic`
 * draws from tiers 3-4, which reach `godly` and `transcendent`. It is kept
 * because it is what the shipped action does and because one retiered hero
 * would make it matter, silently, on the day.
 */
function pickForExchange(
  option: SparkExchangeOption,
  request: SparkRequest,
): { template: SummonPoolEntry; rarity: Rarity; asked: Rarity } | null {
  const asked = option.minRarity;
  if (asked === undefined) return null;

  if (option.kind === 'guaranteed_transcendent') {
    const minTier = option.minTier ?? 4;
    const eligible = request.pool.filter(entry => entry.tier >= minTier && entry.tier <= TRANSCENDENT_MAX_TIER);
    if (eligible.length === 0) return null;
    const template = eligible[Math.floor(request.random() * eligible.length)];
    return { template, rarity: clampRarityToTier(asked, template.tier), asked };
  }

  // Named by the player: no draw at all. A target that is not in the pool
  // falls back to the band, which is the shipped `?? null` reading — asking
  // for a retired hero buys a random one rather than refunding the spark.
  const named = request.targetHeroId ? (request.pool.find(entry => entry.id === request.targetHeroId) ?? null) : null;
  const template = named ?? pickTemplateForRarity(asked, request.pool, request.random);
  if (!template) return null;
  return { template, rarity: clampRarityToTier(asked, template.tier), asked };
}

/**
 * Buy one exchange, or refuse.
 *
 * Returns null when the option is unknown or the account cannot pay — and
 * refuses **before drawing anything**, so a refused exchange does not advance
 * the sequence. The shipped action returns the state unchanged for the same
 * reason.
 */
export function applySparkExchange(request: SparkRequest): SparkOutcome | null {
  const { save } = request;
  const purchase = spendSpark(request.options, save.wallet.sparkTokens, request.optionId);
  if (!purchase) return null;

  const { option, left } = purchase;
  const wallet = { ...save.wallet, sparkTokens: left };
  const spent = option.sparkCost;

  if (option.kind === 'free_summon') {
    /*
     * A charge, not a summon. `firstGiven` is deliberately left alone: it
     * records that the account's one-off free hero has been handed out, and
     * buying a charge is not that — a port that set it here would cost a new
     * player their opening pull.
     */
    return {
      save: {
        ...save,
        wallet,
        summon: { ...save.summon, freeCharges: save.summon.freeCharges + 1 },
      },
      optionId: option.id,
      sparkSpent: spent,
      hero: null,
      rarity: null,
      askedRarity: null,
      freeChargesGained: 1,
      duplicate: false,
    };
  }

  const picked = pickForExchange(option, request);
  // An option that names no rarity, or a pool with nobody eligible. Refused
  // rather than charged — and refused after `spendSpark` said yes, which is
  // why the wallet above is not the one that is returned on this path.
  if (!picked) return null;

  const taken = new Set(save.roster.heroes.map(entry => entry.uid));
  const hero: SavedHero = {
    id: picked.template.id,
    // `<template>_<ms>_spark_<0-9999>`, which is not a summon's
    // `<template>_<ms>_<0-9999>`. Its own namespace, as shipped, so the two
    // routes cannot collide in the same millisecond on the same draw.
    uid: uniqueUid(
      `${picked.template.id}_${Math.floor(request.nowMs)}_spark_${Math.floor(request.random() * 10_000)}`,
      taken,
    ),
    rarity: picked.rarity,
    level: 1,
    rank: 1,
    teamBoost: roundTo4(picked.template.baseTeamBoost * RARITY_BOOST_MULTIPLIER[picked.rarity]),
    rebirthStatMult: 1,
  };

  // Measured against the roster before the hero lands, as a pull measures it.
  // It pays nothing either way here — a duplicate bought at the exchange does
  // *not* refund spark, which is what stops 150 spark from partly buying
  // itself back — so it is reported rather than acted on.
  const duplicate = save.roster.heroes.some(entry => entry.id === hero.id);

  // Prepended, as shipped and as a pull does: `readRoster` keeps the first
  // five hundred rows, so an account at the cap loses its oldest hero rather
  // than having the purchase refused.
  const heroes = [hero, ...save.roster.heroes];

  const uniqueByHeroId: Record<string, SavedUniqueGear> = { ...save.roster.uniqueByHeroId };

  return {
    save: {
      ...save,
      wallet,
      roster: {
        ...save.roster,
        heroes,
        uniqueByHeroId: syncRelicBearer(uniqueByHeroId, heroes, hero.id) ?? uniqueByHeroId,
      },
    },
    optionId: option.id,
    sparkSpent: spent,
    hero,
    rarity: picked.rarity,
    askedRarity: picked.asked,
    freeChargesGained: 0,
    duplicate,
  };
}
