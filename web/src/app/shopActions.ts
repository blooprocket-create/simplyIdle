import { HERO_POOL } from '../content/heroes';
import { LOOSE_MAX_AMOUNT, LOOSE_MIN_AMOUNT, looseOfferFor, shopOfferById } from '../content/shops';
import type { SaveV3 } from '../engine/save/schema';
import { buyLoose, buyOffer, type BuyOutcome, type LooseOutcome } from '../engine/shop/buyOffer';
import { claimVipReward, recordEveryCodexEntry, type CodexSubject, type VipClaim } from '../engine/progression/vip';
import { EQUIPMENT_CONTENT, equipmentUnlocks } from './equipmentActions';

/**
 * The shop and VIP verbs, with the catalogue and the dice supplied.
 *
 * The same arrangement `playerActions.ts` and `equipmentActions.ts` make, and
 * for the same reason: the engine takes the offer terms, the equipment
 * catalogue and a `random` as arguments, and somebody who is not a React
 * callback has to hand it all three.
 *
 * An unknown offer id answers `null` rather than throwing. A screen asking
 * about an offer that is not on sale is a screen bug, not a crash — and the
 * same goes for one asking about an offer this build has marked unavailable,
 * which the engine refuses rather than trusting the button to have been
 * greyed out.
 */

export interface ShopAttempt {
  save: SaveV3;
  /** For the crate's instance id. Passed in, because nothing below reads a clock. */
  nowMs: number;
  random: () => number;
}

/** What one offer costs, for a screen to price a button without pressing it. */
export function priceOfOffer(id: string): { currency: 'gold' | 'diamonds'; cost: number } | null {
  const offer = shopOfferById(id);
  return offer === null ? null : { currency: offer.currency, cost: offer.cost };
}

/** Whether a press would go through, without buying anything to find out. */
export function canBuy(save: SaveV3, id: string): boolean {
  const offer = shopOfferById(id);
  if (offer === null || !offer.available) return false;
  const purse = offer.currency === 'gold' ? save.wallet.gold : save.wallet.diamonds;
  return purse >= offer.cost;
}

export function buy(attempt: ShopAttempt, id: string): BuyOutcome | null {
  const offer = shopOfferById(id);
  if (offer === null) return null;
  return buyOffer({
    save: attempt.save,
    terms: offer,
    content: EQUIPMENT_CONTENT,
    unlocks: equipmentUnlocks(attempt.save),
    // The bag's cap is the one place a VIP level reaches equipment: VIP 5
    // doubles it from 250 to 500. Read from the typed block now that Phase 10
    // has claimed it, rather than out of the legacy bag.
    vipLevel: attempt.save.vip.level,
    random: attempt.random,
    nowMs: attempt.nowMs,
  });
}

/** Buy loose goods by the unit. The amount is clamped, never refused. */
export function buyUnits(save: SaveV3, itemId: string, amount: number): LooseOutcome | null {
  const offer = looseOfferFor(itemId);
  if (offer === null) return null;
  return buyLoose({
    save,
    itemId,
    unitCost: offer.unitCost,
    currency: offer.currency,
    amount,
    min: LOOSE_MIN_AMOUNT,
    max: LOOSE_MAX_AMOUNT,
    available: offer.available,
  });
}

export function claimVip(save: SaveV3, level: number): VipClaim | null {
  return claimVipReward(save, level);
}

/**
 * Every codex entry this account can record, in one press.
 *
 * The subjects are built here rather than in the engine because they are a
 * question about the *catalogue* — which hero templates exist — crossed with
 * the save. A hero the roster carries under a template the catalogue has
 * retired is not claimable, which is the same rule the save reader applies
 * when it drops the row.
 */
export function codexSubjects(save: SaveV3): CodexSubject[] {
  const owned = new Set(save.roster.heroes.map(hero => hero.id));
  return HERO_POOL.map(hero => ({
    heroId: hero.id,
    owned: owned.has(hero.id),
    uniqueRank: save.roster.uniqueByHeroId[hero.id]?.rank ?? 0,
  }));
}

export function recordCodex(save: SaveV3): { save: SaveV3; recorded: number } {
  return recordEveryCodexEntry(save, codexSubjects(save));
}

/** How many entries a press would record, for a badge that says so. */
export function claimableCodexEntries(save: SaveV3): number {
  return recordCodex(save).recorded;
}
