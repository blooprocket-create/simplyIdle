import { getUsableItem } from './usableItems';

/**
 * The shops, as a catalogue.
 *
 * Three of the shipped game's four selling actions are ported here.
 * `BUY_GOLD_SHOP_ITEM` and `BUY_DIAMOND_SHOP_ITEM` become `SHOP_OFFERS`, and
 * `BUY_PREMIUM_COOLANT` becomes `LOOSE_OFFERS` — the same goods sold by the
 * unit rather than by the pack, which is a different price per item and so a
 * different row rather than a flag on one.
 *
 * **`SIMULATE_DOLLAR_PURCHASE` is not ported.** It is a simulated in-app
 * purchase, `ENABLE_SIMULATED_DOLLAR_PURCHASES` is `false` in both files that
 * declare it, its reducer case is a guard on that flag, and `GameScreen`
 * renders its four buttons `disabled`. Measured in
 * `__tests__/shopsFixture.test.ts`: every pack moves nothing. A storefront
 * that cannot sell is not a capability, and reproducing four dead price tags
 * would be shipping the shopfront without the shop.
 *
 * ## Why half of this is `available: false`
 *
 * The same rule the automation catalogue follows: an offer is available when
 * **everything it hands over has an effect in this build**. Coolant reduces
 * combat heat and this engine has no heat, so a bought capsule would go in the
 * bag and be spent for nothing — `usableSave.ts` says exactly that about the
 * ones a run finds, and there the item was free. Charging diamonds for it is
 * the gold-sink mistake the skills tree was declined for.
 *
 * Raid tickets *were* the same shape with a different missing half — the
 * ticket worked and there was nowhere to spend it. Phase 11 built the two
 * dungeons, so that offer is on sale, and its row is the worked example of
 * what withholding is for: one flag, and nothing else about it changed.
 *
 * All of them stay listed, priced and described, because a shop that showed
 * three offers would be telling the player this game sells three. Each one
 * flips to `available: true` in the phase that builds what it needs, and
 * nothing else about it changes.
 */

export type ShopCurrency = 'gold' | 'diamonds';

/** One stack of consumables an offer hands over. */
export interface ShopGrant {
  itemId: string;
  count: number;
}

export interface ShopOffer {
  id: string;
  currency: ShopCurrency;
  cost: number;
  name: string;
  detail: string;
  /** Consumables handed over. Empty for the crate, which rolls instead. */
  grants: readonly ShopGrant[];
  /** Rolls one piece of gear for the buyer's class, at the buyer's level. */
  rollsEquipment?: boolean;
  /** Dungeon raid tickets, carried in `legacy` until dungeons claim them. */
  raidTickets?: number;
  /** Whether this build can honour it. False names what is missing, below. */
  available: boolean;
  /** Why not, in the player's words. Null when it is for sale. */
  unavailableBecause: string | null;
}

export const SHOP_OFFERS: readonly ShopOffer[] = [
  {
    id: 'exp_cache',
    currency: 'gold',
    cost: 2_200,
    name: 'Training Cache',
    detail: 'Six training scrolls.',
    grants: [{ itemId: 'exp_scroll', count: 6 }],
    available: true,
    unavailableBecause: null,
  },
  {
    id: 'potion_bundle',
    currency: 'gold',
    cost: 3_600,
    name: 'Field Bundle',
    detail: 'Three small potions, a grand potion and two gold caches.',
    grants: [
      { itemId: 'small_potion', count: 3 },
      { itemId: 'grand_potion', count: 1 },
      { itemId: 'gold_cache', count: 2 },
    ],
    available: true,
    unavailableBecause: null,
  },
  {
    id: 'armory_crate',
    currency: 'gold',
    cost: 9_500,
    name: 'Armoury Crate',
    detail: 'One piece of gear you can wear, rolled at your level.',
    grants: [],
    rollsEquipment: true,
    available: true,
    unavailableBecause: null,
  },
  {
    id: 'coolant_i_pack',
    currency: 'diamonds',
    cost: 18,
    name: 'Coolant Pack I',
    detail: 'Four Coolant Capsule I.',
    grants: [{ itemId: 'coolant_mk1', count: 4 }],
    available: false,
    unavailableBecause: 'Nothing in this build runs hot yet, so coolant would be bought to be wasted.',
  },
  {
    id: 'coolant_ii_pack',
    currency: 'diamonds',
    cost: 42,
    name: 'Coolant Pack II',
    detail: 'Three Coolant Capsule II.',
    grants: [{ itemId: 'coolant_mk2', count: 3 }],
    available: false,
    unavailableBecause: 'Nothing in this build runs hot yet, so coolant would be bought to be wasted.',
  },
  {
    id: 'elite_supply',
    currency: 'diamonds',
    cost: 88,
    name: 'Elite Supply',
    detail: 'Five Coolant I, three Coolant II and two grand potions.',
    grants: [
      { itemId: 'coolant_mk1', count: 5 },
      { itemId: 'coolant_mk2', count: 3 },
      { itemId: 'grand_potion', count: 2 },
    ],
    available: false,
    unavailableBecause: 'Two thirds of this crate is coolant, and nothing in this build runs hot yet.',
  },
  {
    id: 'rift_raid_ticket',
    currency: 'diamonds',
    cost: 120,
    name: 'Dungeon Raid Ticket',
    detail: 'One run at a dungeon.',
    grants: [],
    raidTickets: 1,
    // Available as of Phase 11, which built the two dungeons a ticket opens.
    // It pays the level *below* the one you are on, outright, and leaves the
    // day's free entries alone — which is what a ticket is for.
    available: true,
    unavailableBecause: null,
  },
];

/**
 * The same goods, loose, by the unit.
 *
 * The shipped `BUY_PREMIUM_COOLANT` prices a capsule at 8 and 18 against the
 * packs' 4.5 and 14 — so buying loose is dearer per capsule for the first and
 * cheaper for the second, which is not a rule anybody wrote so much as two
 * tables that drifted. Ported as measured rather than reconciled.
 */
export interface LooseOffer {
  itemId: string;
  unitCost: number;
  currency: ShopCurrency;
  available: boolean;
  unavailableBecause: string | null;
}

/** Nobody may buy more than this in one press. The shipped clamp, exactly. */
export const LOOSE_MIN_AMOUNT = 1;
export const LOOSE_MAX_AMOUNT = 99;

export const LOOSE_OFFERS: readonly LooseOffer[] = [
  {
    itemId: 'coolant_mk1',
    unitCost: 8,
    currency: 'diamonds',
    available: false,
    unavailableBecause: 'Nothing in this build runs hot yet, so coolant would be bought to be wasted.',
  },
  {
    itemId: 'coolant_mk2',
    unitCost: 18,
    currency: 'diamonds',
    available: false,
    unavailableBecause: 'Nothing in this build runs hot yet, so coolant would be bought to be wasted.',
  },
];

export function shopOfferById(id: string): ShopOffer | null {
  return SHOP_OFFERS.find(offer => offer.id === id) ?? null;
}

export function looseOfferFor(itemId: string): LooseOffer | null {
  return LOOSE_OFFERS.find(offer => offer.itemId === itemId) ?? null;
}

/** Offers whose goods all exist. What a screen actually puts a button on. */
export function availableOffers(): ShopOffer[] {
  return SHOP_OFFERS.filter(offer => offer.available);
}

/**
 * Every item id any offer hands over, so a test can check them against the
 * catalogue rather than trusting the strings above.
 */
export function offeredItemIds(): string[] {
  const ids = new Set<string>();
  for (const offer of SHOP_OFFERS) for (const grant of offer.grants) ids.add(grant.itemId);
  for (const offer of LOOSE_OFFERS) ids.add(offer.itemId);
  return [...ids].sort();
}

/** Whether every offered id has a catalogue row. Used by the catalogue test. */
export function offersWithUnknownItems(): string[] {
  return offeredItemIds().filter(id => getUsableItem(id) === null);
}
