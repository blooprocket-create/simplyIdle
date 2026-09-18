import { describe, expect, it } from 'vitest';
import fixture from '../../content/__fixtures__/shops.json';
import {
  equipmentTemplatesById,
  EQUIPMENT_CATALOG,
  EQUIPMENT_RARITIES,
  getEquipmentItem,
} from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { LOOSE_MAX_AMOUNT, LOOSE_MIN_AMOUNT, LOOSE_OFFERS, SHOP_OFFERS, shopOfferById } from '../../content/shops';
import { readSave } from '../save/v3';
import type { SaveV3 } from '../save/schema';
import { buyLoose, buyOffer, type OfferTerms } from './buyOffer';

/**
 * The shops, against what the shipped reducers were measured paying.
 *
 * The catalogue withholds half of these — coolant has no heat to clear and a
 * raid ticket has no dungeon to spend it at — so the rules for them are
 * exercised here with `available: true` supplied directly. That split is the
 * point rather than a workaround: the *rules* are ported and checked, and the
 * *catalogue* is what decides whether a button exists. When heat lands, one
 * flag moves and nothing in this file changes.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const EQUIPMENT_CONTENT = { catalog: EQUIPMENT_CATALOG, rarityTable: EQUIPMENT_RARITIES, byId: getEquipmentItem };
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const NO_UNLOCKS = { mythic: false, transcendent: false };

function save(over: Record<string, unknown> = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 40 },
      wallet: { gold: 10_000_000, diamonds: 10_000 },
      ...over,
    },
    { nowMs: NOW, content: CONTENT },
  );
}

/** The catalogue row, forced on sale, so a withheld offer's rules still run. */
function terms(id: string): OfferTerms {
  const offer = shopOfferById(id)!;
  return { ...offer, available: true };
}

const buyWith = (from: SaveV3, id: string, random = () => 0.5) =>
  buyOffer({
    save: from,
    terms: terms(id),
    content: EQUIPMENT_CONTENT,
    unlocks: NO_UNLOCKS,
    vipLevel: 0,
    random,
    nowMs: NOW,
  });

/** What a purchase moved, in the shape the fixture records it. */
function moved(before: SaveV3, after: SaveV3) {
  const items: Record<string, number> = {};
  for (const id of new Set([...Object.keys(before.usables), ...Object.keys(after.usables)])) {
    const change = (after.usables[id] ?? 0) - (before.usables[id] ?? 0);
    if (change !== 0) items[id] = change;
  }
  // Off the typed block since Phase 11 claimed it. It was
  // `legacy.riftRaidTickets` while the dungeons did not exist, and claiming a
  // key takes the writers with it as well as the readers.
  const tickets = (value: SaveV3) => value.dungeons.raidTickets;
  return {
    gold: before.wallet.gold - after.wallet.gold,
    diamonds: before.wallet.diamonds - after.wallet.diamonds,
    items,
    riftRaidTickets: tickets(after) - tickets(before),
    equipmentGained: after.equipment.inventory.length - before.equipment.inventory.length,
  };
}

const measured = [...fixture.goldShop, ...fixture.diamondShop];

describe('every offer the shipped shops sell', () => {
  it('is listed here, at the price it was measured at', () => {
    // The catalogue is data and the fixture is a measurement; this is the one
    // assertion that makes the first answerable by the second.
    expect(SHOP_OFFERS.map(offer => ({ name: offer.id, cost: offer.cost, currency: offer.currency }))).toEqual(
      measured.map(row => ({
        name: row.name,
        cost: row.gold > 0 ? row.gold : row.diamonds,
        currency: row.gold > 0 ? 'gold' : 'diamonds',
      })),
    );
  });

  it.each(measured.map(row => row.name))('pays out exactly what %s paid out', name => {
    const before = save();
    const outcome = buyWith(before, name);
    expect(outcome).not.toBeNull();
    const row = measured.find(entry => entry.name === name)!;
    expect(moved(before, outcome!.save)).toEqual({
      gold: row.gold,
      diamonds: row.diamonds,
      items: row.items,
      riftRaidTickets: row.riftRaidTickets,
      equipmentGained: row.equipmentGained,
    });
  });

  it('refuses every one of them on an empty purse, and charges nothing', () => {
    const broke = save({ wallet: { gold: 0, diamonds: 0 } });
    const refused = SHOP_OFFERS.filter(offer => buyWith(broke, offer.id) === null);
    expect(refused.map(offer => offer.id)).toEqual(SHOP_OFFERS.map(offer => offer.id));
  });

  it('refuses one the catalogue withholds, whatever the purse holds', () => {
    // The gate the fixture cannot see, because the shipped game has no such
    // idea. Six of the seven offers are withheld in this build; going through
    // the catalogue row rather than a forced one must refuse every one.
    const rich = save();
    const throughCatalogue = (id: string) =>
      buyOffer({
        save: rich,
        terms: shopOfferById(id)!,
        content: EQUIPMENT_CONTENT,
        unlocks: NO_UNLOCKS,
        vipLevel: 0,
        random: () => 0.5,
        nowMs: NOW,
      });
    const sold = SHOP_OFFERS.filter(offer => throughCatalogue(offer.id) !== null);
    // The ticket joined them in Phase 11, by flipping one flag and nothing
    // else — which is what the withholding rule was for.
    expect(sold.map(offer => offer.id)).toEqual(['exp_cache', 'potion_bundle', 'armory_crate', 'rift_raid_ticket']);
  });
});

describe('the armoury crate', () => {
  it('rolls at the buyer’s level, for the buyer’s class', () => {
    const before = save();
    const outcome = buyWith(before, 'armory_crate')!;
    expect(outcome.item).not.toBeNull();
    expect(outcome.item!.itemLevel).toBe(fixture.armoryCrate.itemLevel);
    expect(getEquipmentItem(outcome.item!.baseItemId)!.allowedClasses).toContain('warrior');
    expect(outcome.save.equipment.inventory).toContain(outcome.item!.id);
    expect(outcome.save.equipment.instances[outcome.item!.id].source).toBe('crate');
  });

  it('refuses a buyer with no class rather than rolling for nobody', () => {
    expect(buyWith(save({ identity: { name: 'P', playerClass: null, created: true } }), 'armory_crate')).toBeNull();
  });

  it('refuses a full bag rather than charging for an item it would lose', () => {
    /*
     * The one deliberate divergence in this file. The shipped crate does not
     * check the cap at all, and `grantDrops` keeps the shipped rule that a won
     * item falling into a full bag is simply lost — which is right for
     * something free. Charging 9,500 gold for an item that evaporates is not
     * the same trade.
     */
    let full = save();
    for (let index = 0; index < 250; index++) {
      const outcome = buyWith(full, 'armory_crate');
      if (outcome === null) break;
      full = outcome.save;
    }
    expect(full.equipment.inventory.length).toBe(250);
    expect(buyWith(full, 'armory_crate')).toBeNull();
    // And the refusal is free: the purse is exactly 250 crates lighter.
    expect(save().wallet.gold - full.wallet.gold).toBe(250 * 9_500);
  });
});

describe('goods sold loose, by the unit', () => {
  const loose = (amount: number, available = true) =>
    buyLoose({
      save: save(),
      itemId: 'coolant_mk1',
      unitCost: 8,
      currency: 'diamonds',
      amount,
      min: LOOSE_MIN_AMOUNT,
      max: LOOSE_MAX_AMOUNT,
      available,
    });

  it('clamps the amount before pricing it, so nobody pays for what they did not get', () => {
    expect(
      fixture.coolantAmounts.map(row => {
        const outcome = loose(Number(row.asked))!;
        return { asked: row.asked, diamondsCharged: outcome.charged, granted: outcome.bought };
      }),
    ).toEqual(fixture.coolantAmounts);
  });

  it('prices both capsules as the shipped table does', () => {
    expect(LOOSE_OFFERS.map(offer => ({ itemId: offer.itemId, unitCost: offer.unitCost }))).toEqual(
      fixture.premiumCoolant,
    );
  });

  it('refuses a purse that cannot cover the clamped amount', () => {
    const outcome = buyLoose({
      save: save({ wallet: { gold: 0, diamonds: 7 } }),
      itemId: 'coolant_mk1',
      unitCost: 8,
      currency: 'diamonds',
      amount: 1,
      min: LOOSE_MIN_AMOUNT,
      max: LOOSE_MAX_AMOUNT,
      available: true,
    });
    expect(outcome).toBeNull();
  });

  it('refuses what the catalogue withholds', () => {
    expect(loose(1, false)).toBeNull();
    expect(LOOSE_OFFERS.filter(offer => offer.available)).toEqual([]);
  });
});

describe('the dollar shop', () => {
  it('is not here, and that is the port rather than an omission', () => {
    /*
     * `SIMULATE_DOLLAR_PURCHASE` sells diamonds for simulated money and is
     * switched off in the shipped game: the flag is `false`, the reducer's
     * first line is a guard on it, and the button renders disabled. The
     * fixture measured all four packs moving nothing.
     *
     * So there is no capability to port, and four dead price tags are not one.
     * This asserts the absence so that adding a `usd_` offer has to argue with
     * a test rather than slip in beside the others.
     */
    expect(fixture.dollarShop.enabled).toBe(false);
    expect(SHOP_OFFERS.filter(offer => offer.id.startsWith('usd_'))).toEqual([]);
  });
});
