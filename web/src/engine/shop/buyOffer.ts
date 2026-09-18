import type { SaveV3 } from '../save/schema';
import { addUsable } from '../save/usablesSlice';
import { createEquipmentInstance, type EquipmentInstance } from '../equipment/instance';
import { craftInventoryCap } from '../equipment/forge';
import { rollEquipmentRarityByTier } from '../equipment/rarity';
import { addInstance, type EquipmentContent } from '../equipment/equipmentSave';
import { grantRaidTickets } from '../dungeons/run';

/**
 * Buying from a shop.
 *
 * One function for both currencies, because the shipped pair differ in
 * nothing but which purse they read: the same affordability test, the same
 * grant loop, the same refusal. Two reducer cases that agree on everything
 * except a field name are one function with the field as a parameter.
 *
 * Every refusal answers `null` and **charges nothing**, which is the property
 * the fixture checks across all eight of them: a shop that takes the money and
 * hands back the state it was given is the worst bug a storefront can have.
 */

export type ShopCurrency = 'gold' | 'diamonds';

export interface OfferTerms {
  currency: ShopCurrency;
  cost: number;
  grants: readonly { itemId: string; count: number }[];
  rollsEquipment?: boolean;
  raidTickets?: number;
  available: boolean;
}

export interface BuyRequest {
  save: SaveV3;
  terms: OfferTerms;
  /** Only the crate uses these two, and only to build the item it rolls. */
  content: EquipmentContent;
  unlocks: { mythic: boolean; transcendent: boolean };
  vipLevel: number;
  random: () => number;
  /** For the new instance's id. Nothing here reads a clock. */
  nowMs: number;
}

export interface BuyOutcome {
  save: SaveV3;
  /** The gear a crate rolled, when the offer rolls one. */
  item: EquipmentInstance | null;
}

function held(save: SaveV3, currency: ShopCurrency): number {
  return currency === 'gold' ? save.wallet.gold : save.wallet.diamonds;
}

function charge(save: SaveV3, currency: ShopCurrency, cost: number): SaveV3 {
  const wallet =
    currency === 'gold'
      ? { ...save.wallet, gold: save.wallet.gold - cost }
      : { ...save.wallet, diamonds: save.wallet.diamonds - cost };
  return { ...save, wallet };
}

export function buyOffer(request: BuyRequest): BuyOutcome | null {
  const { save, terms } = request;
  if (!terms.available) return null;
  if (terms.cost < 0) return null;
  if (held(save, terms.currency) < terms.cost) return null;

  if (terms.rollsEquipment === true) return buyCrate(request);

  let next = charge(save, terms.currency, terms.cost);
  let usables = next.usables;
  for (const grant of terms.grants) usables = addUsable(usables, grant.itemId, grant.count);
  next = { ...next, usables };

  if (terms.raidTickets !== undefined && terms.raidTickets > 0) {
    /*
     * Tickets had no typed home when this was written, so they went into the
     * `legacy` bag with a note saying flipping `available` would be the only
     * change the dungeons phase had to make. It was not quite: Phase 11
     * *claimed* `riftRaidTickets`, which removes it from the bag, so the write
     * moved too. That is the same lesson the VIP claim taught — a claim takes
     * the readers *and* the writers with it.
     */
    next = grantRaidTickets(next, terms.raidTickets);
  }

  return { save: next, item: null };
}

/**
 * The crate, which rolls rather than grants.
 *
 * **It refuses on a full bag where a drop is simply lost.** `grantDrops` keeps
 * the shipped behaviour of dropping a won item into a bag that cannot hold it,
 * and that is right for something free. Charging 9,500 gold for an item that
 * evaporates is not the same trade, and the shipped crate does not check at
 * all — so this is a deliberate divergence rather than a port, and the only
 * one in this file.
 *
 * The rarity is a *preference* rather than a promise, as everywhere else: a
 * class missing that rarity in every slot falls back to its whole pool.
 */
function buyCrate(request: BuyRequest): BuyOutcome | null {
  const { save, terms } = request;
  const playerClass = save.identity.playerClass;
  if (playerClass === null) return null;

  const wearable = request.content.catalog.filter(item => item.allowedClasses.includes(playerClass));
  if (wearable.length === 0) return null;
  if (save.equipment.inventory.length >= craftInventoryCap(request.vipLevel)) return null;

  const rolled = rollEquipmentRarityByTier(request.random(), request.content.rarityTable, request.unlocks);
  const atRarity = wearable.filter(item => item.rarity === rolled);
  const pool = atRarity.length > 0 ? atRarity : wearable;
  const baseItem = pool[Math.floor(request.random() * pool.length)];

  const item = createEquipmentInstance({
    baseItem,
    // The buyer's level, not the wave they are on. A crate bought at wave 400
    // on a level-20 account is a level-20 item, exactly as a drop is.
    itemLevel: Math.max(1, save.progression.level),
    source: 'crate',
    random: request.random,
    nowMs: request.nowMs,
    taken: new Set(save.equipment.inventory),
  });

  const charged = charge(save, terms.currency, terms.cost);
  // Put in the bag by the same function a won drop uses, rather than by a
  // second copy of the conversion. Two copies is how a bought item loses a stat.
  return { save: { ...charged, equipment: addInstance(charged.equipment, item) }, item };
}

/**
 * Buying loose goods by the unit.
 *
 * The clamp runs **before** the price, which is the shipped order and the one
 * that matters: asking for five hundred capsules buys ninety-nine and is
 * charged for ninety-nine. Pricing first and clamping after would take money
 * for coolant nobody received.
 */
export interface LooseRequest {
  save: SaveV3;
  itemId: string;
  unitCost: number;
  currency: ShopCurrency;
  amount: number;
  min: number;
  max: number;
  available: boolean;
}

export interface LooseOutcome {
  save: SaveV3;
  bought: number;
  charged: number;
}

export function buyLoose(request: LooseRequest): LooseOutcome | null {
  if (!request.available) return null;
  const asked = Number.isFinite(request.amount) ? Math.floor(request.amount) : request.min;
  const amount = Math.min(request.max, Math.max(request.min, asked));
  const cost = request.unitCost * amount;
  if (held(request.save, request.currency) < cost) return null;

  const charged = charge(request.save, request.currency, cost);
  return {
    save: { ...charged, usables: addUsable(charged.usables, request.itemId, amount) },
    bought: amount,
    charged: cost,
  };
}
