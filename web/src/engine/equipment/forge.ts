import type { EquipmentItem, EquipmentRarity, EquipmentSlot } from '../../content/equipment';
import type { EquipmentInstance } from './instance';
import { nextEquipmentRarity } from './rarity';

/**
 * What the forge charges: crafting an item, and taking one up a rarity.
 *
 * The catalogue is an argument throughout, as everywhere else in the engine.
 * The upgrade plan needs it for a reason worth stating plainly — an upgrade is
 * not "the same item at a better rarity", it is **a different item**, picked at
 * random from the class and slot's rows at the next rarity up. So the plan has
 * to search the catalogue to know whether the step is possible at all.
 */

/** Flat, and the same at every level. Weapons cost most, accessories least. */
export const EQUIPMENT_CRAFT_COST: Readonly<Record<EquipmentSlot, { scrap: number; gold: number }>> = {
  weapon: { scrap: 130, gold: 1_800 },
  armor: { scrap: 120, gold: 1_500 },
  accessory: { scrap: 100, gold: 1_200 },
};

/** How many items an account may hold. VIP 5 doubles it. */
export const CRAFT_INVENTORY_CAP = 250;
export const CRAFT_INVENTORY_CAP_VIP = 500;
export const CRAFT_INVENTORY_CAP_VIP_LEVEL = 5;

export function craftInventoryCap(vipLevel: number): number {
  return vipLevel >= CRAFT_INVENTORY_CAP_VIP_LEVEL ? CRAFT_INVENTORY_CAP_VIP : CRAFT_INVENTORY_CAP;
}

/**
 * The base price of leaving a rarity, before the step multiplier.
 *
 * Keyed by the rarity being **left**, not the one arrived at — so a common to
 * rare step costs 80 scrap and 1,400 gold whatever it lands on. Transcendent
 * has no row because nothing leaves it.
 */
export const UPGRADE_BASE_COST: Readonly<Record<string, { scrap: number; essence: number; gold: number }>> = {
  common: { scrap: 80, essence: 0, gold: 1_400 },
  rare: { scrap: 170, essence: 4, gold: 4_200 },
  epic: { scrap: 300, essence: 8, gold: 12_000 },
  legendary: { scrap: 500, essence: 14, gold: 32_000 },
  mythic: { scrap: 900, essence: 26, gold: 90_000 },
};

export interface UpgradePlan {
  canUpgrade: boolean;
  targetItemId: string | null;
  targetRarity: EquipmentRarity | null;
  scrapCost: number;
  essenceCost: number;
  goldCost: number;
  reason?: string;
}

const NO_PLAN: UpgradePlan = {
  canUpgrade: false,
  targetItemId: null,
  targetRarity: null,
  scrapCost: 0,
  essenceCost: 0,
  goldCost: 0,
};

export interface UpgradeInput {
  /** The row the owned item is built on. An instance's `baseItemId` resolves to it. */
  baseItem: EquipmentItem;
  catalog: readonly EquipmentItem[];
  purse: { scrap: number; essence: number; gold: number };
  unlocks: { mythic: boolean; transcendent: boolean };
  random: () => number;
}

/**
 * What the next rarity step would cost, and which item it would hand over.
 *
 * **It draws.** One value, for the candidate — and it draws *before* anybody
 * checks whether the player can pay, which is the difference in kind from
 * every other purchase in this game. A summon, a spark exchange and a craft
 * all refuse before touching the dice; an unaffordable upgrade press still
 * advances the sequence. Ported as it stands, because a port that refused
 * first would fall out of step with any recorded run containing one.
 *
 * The search walks *up* from the current rarity rather than taking one step,
 * so a rarity with no item for this class and slot is skipped and the step
 * counter grows — which is what the 0.55 / 0.5 / 0.75 per-step multipliers are
 * for. **That happens constantly.** Every class has five items per slot across
 * six rarities, so every class-and-slot pair is missing exactly one: the
 * warrior's weapons have no epic, the mage's armour has neither common nor
 * rare. A port that took one step and refused on an empty pool would refuse
 * the most ordinary upgrade in the game.
 */
export function upgradePlan(input: UpgradeInput): UpgradePlan {
  const { baseItem, catalog, unlocks, random } = input;

  let rarity = nextEquipmentRarity(baseItem.rarity);
  if (rarity === null) return { ...NO_PLAN, reason: 'At max rarity' };

  let step = 0;
  while (rarity !== null) {
    // The gates stop the search rather than skipping the tier: a locked mythic
    // does not fall through to transcendent, it refuses the upgrade outright.
    if (rarity === 'mythic' && !unlocks.mythic) return { ...NO_PLAN, reason: 'Mythic tier locked' };
    if (rarity === 'transcendent' && !unlocks.transcendent) return { ...NO_PLAN, reason: 'Transcendent tier locked' };

    const pool = catalog.filter(
      candidate =>
        candidate.slot === baseItem.slot &&
        candidate.rarity === rarity &&
        candidate.allowedClasses.some(cls => baseItem.allowedClasses.includes(cls)),
    );
    step += 1;
    if (pool.length > 0) {
      const base = UPGRADE_BASE_COST[baseItem.rarity] ?? { scrap: 0, essence: 0, gold: 0 };
      const scrapCost = Math.ceil(base.scrap * (1 + (step - 1) * 0.55));
      const essenceCost = Math.ceil(base.essence * (1 + (step - 1) * 0.5));
      const goldCost = Math.ceil(base.gold * (1 + (step - 1) * 0.75));
      const candidate = pool[Math.floor(random() * pool.length)];
      return {
        canUpgrade:
          input.purse.scrap >= scrapCost && input.purse.essence >= essenceCost && input.purse.gold >= goldCost,
        targetItemId: candidate.id,
        targetRarity: rarity,
        scrapCost,
        essenceCost,
        goldCost,
      };
    }
    rarity = nextEquipmentRarity(rarity);
  }

  return { ...NO_PLAN, reason: 'No higher tier candidate' };
}

/** The item level an upgrade produces: two above an instance, or the player's. */
export function upgradedItemLevel(owned: EquipmentItem | EquipmentInstance, playerLevel: number): number {
  return 'itemLevel' in owned ? owned.itemLevel + 2 : Math.max(1, playerLevel);
}

/** What refining scrap into essence costs, per unit. All three meta tracks. */
export function scrapToEssenceCost(meta: { damage: number; economy: number; survival: number }): number {
  // Forty a level each, so an account with a little of everything pays nearly
  // double. Reading it as one track prices a five-of-each account at 800.
  return 600 + meta.damage * 40 + meta.economy * 40 + meta.survival * 40;
}

/** What refining scrap into hero shards costs, per unit. Flat. */
export const SCRAP_TO_SHARD_COST = 180;
export const SHARDS_PER_REFINE = 140;

/**
 * How many units a refine actually buys.
 *
 * Clamped to what the purse covers rather than refused, with a floor of one —
 * so a "refine everything" button spends what it can instead of doing nothing
 * at exactly the moment a player presses it. Zero means the account cannot
 * afford even one, which *is* a refusal.
 */
export function refineCount(held: number, costPer: number, asked: number | undefined): number {
  if (costPer <= 0 || held < costPer) return 0;
  const affordable = Math.floor(held / costPer);
  return Math.max(1, Math.min(asked ?? 1, affordable));
}
