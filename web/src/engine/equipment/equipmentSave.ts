import type { EquipmentItem, EquipmentRarity, EquipmentRarityConfig, EquipmentSlot } from '../../content/equipment';
import type { PlayerClass } from '../../content/classes';
import type { SaveEquipment, SaveV3, SavedEquipment, StatBlock } from '../save/schema';
import { STAT_KEYS } from '../save/schema';
import {
  EQUIPMENT_CRAFT_COST,
  craftInventoryCap,
  refineCount,
  scrapToEssenceCost,
  upgradePlan,
  upgradedItemLevel,
  SCRAP_TO_SHARD_COST,
  SHARDS_PER_REFINE,
} from './forge';
import {
  atOrBelowRarity,
  createEquipmentInstance,
  equipmentScrapGain,
  forgeStatMultiplier,
  type EquipmentInstance,
} from './instance';
import { rollEquipmentRarityByTier } from './rarity';

/**
 * The equipment verbs, applied to a save.
 *
 * The other half of `forge.ts` and `instance.ts`, the same split
 * `summonSave.ts` and `rosterSave.ts` make: the rules are the part with a
 * recorded baseline, the save is the part with a schema. Every verb returns the
 * next save or **null**, never the unchanged save — a screen greying out a
 * button has to be able to ask, and "it worked and changed nothing" is a
 * different answer from "it did not happen".
 *
 * Everything the catalogue knows arrives as an argument, including the lookup
 * itself: an owned id may be a rolled instance *or* a bare catalogue row, and
 * resolving which is the one thing every verb here has to do first.
 */

/** What an owned id resolves to. Either shape is legal; see `SaveEquipment`. */
export type OwnedEquipment =
  | { kind: 'instance'; id: string; instance: SavedEquipment; base: EquipmentItem }
  | { kind: 'row'; id: string; base: EquipmentItem };

export interface EquipmentContent {
  catalog: readonly EquipmentItem[];
  /**
   * The weights a craft rolls against. Handed over with the rows they weight,
   * because a table and a catalogue that disagree about which rarities exist
   * is a craft that rolls a rarity nothing can be found at.
   */
  rarityTable: readonly EquipmentRarityConfig[];
  byId: (id: string) => EquipmentItem | undefined;
}

/** Resolve an owned id, or null when the player does not hold it. */
export function ownedEquipment(save: SaveV3, content: EquipmentContent, id: string): OwnedEquipment | null {
  if (!save.equipment.inventory.includes(id)) return null;
  const instance = save.equipment.instances[id];
  if (instance) {
    const base = content.byId(instance.baseItemId);
    return base ? { kind: 'instance', id, instance, base } : null;
  }
  const base = content.byId(id);
  return base ? { kind: 'row', id, base } : null;
}

/** The slot an owned item is worn in, and the rarity it counts as. */
function slotOf(owned: OwnedEquipment): EquipmentSlot {
  return owned.base.slot;
}

function rarityOf(owned: OwnedEquipment): EquipmentRarity {
  // An instance's own rarity wins: an upgrade builds from a different base, so
  // a stored rarity is not always its base item's.
  return owned.kind === 'instance' ? owned.instance.rarity : owned.base.rarity;
}

/** What an owned item is worth taken apart, whichever shape it is. */
export function scrapValueOf(owned: OwnedEquipment): number {
  if (owned.kind === 'row') return equipmentScrapGain(owned.base);
  return equipmentScrapGain({
    ...owned.base,
    id: owned.id,
    baseItemId: owned.instance.baseItemId,
    rarity: owned.instance.rarity,
    itemLevel: owned.instance.itemLevel,
    source: owned.instance.source,
    bonus: owned.instance.bonus,
  });
}

/** The stat block an owned item contributes while worn. */
export function bonusOf(owned: OwnedEquipment): Partial<StatBlock> {
  return owned.kind === 'instance' ? owned.instance.bonus : owned.base.bonus;
}

/**
 * What the worn set adds to the player's stats.
 *
 * The term `derivedStats` has taken as an argument since Phase 7. A slot
 * pointing at nothing, or at an item whose base row is gone, contributes
 * nothing rather than throwing — the reader already refuses to store either,
 * so this is the belt to that braces.
 */
export function wornStats(save: SaveV3, content: EquipmentContent): StatBlock {
  const total: StatBlock = { strength: 0, vitality: 0, agility: 0, intelligence: 0, spirit: 0 };
  for (const id of Object.values(save.equipment.equipped)) {
    if (id === null) continue;
    const owned = ownedEquipment(save, content, id);
    if (!owned) continue;
    const bonus = bonusOf(owned);
    for (const key of STAT_KEYS) total[key] += bonus[key] ?? 0;
  }
  return total;
}

function withEquipment(save: SaveV3, equipment: SaveEquipment): SaveV3 {
  return { ...save, equipment };
}

/**
 * Wear an item, or refuse.
 *
 * Three refusals, all shipped: an item the player does not own, an item their
 * class may not wear, and — implicitly — a player with no class at all. What it
 * does **not** do is move the replaced item anywhere: equipping is not a swap,
 * the old item stays in the inventory and simply stops being worn.
 */
export function equipItem(save: SaveV3, content: EquipmentContent, id: string): SaveV3 | null {
  const playerClass = save.identity.playerClass;
  if (playerClass === null) return null;
  const owned = ownedEquipment(save, content, id);
  if (!owned) return null;
  if (!owned.base.allowedClasses.includes(playerClass)) return null;

  const slot = slotOf(owned);
  if (save.equipment.equipped[slot] === id) return null;
  return withEquipment(save, { ...save.equipment, equipped: { ...save.equipment.equipped, [slot]: id } });
}

/** Take an item off. Null when the slot is already empty. */
export function unequipSlot(save: SaveV3, slot: EquipmentSlot): SaveV3 | null {
  if (save.equipment.equipped[slot] === null) return null;
  return withEquipment(save, { ...save.equipment, equipped: { ...save.equipment.equipped, [slot]: null } });
}

function removeItems(equipment: SaveEquipment, ids: ReadonlySet<string>): SaveEquipment {
  const instances = { ...equipment.instances };
  for (const id of ids) delete instances[id];
  return {
    ...equipment,
    inventory: equipment.inventory.filter(entry => !ids.has(entry)),
    instances,
  };
}

export interface DismantleOutcome {
  save: SaveV3;
  /** Ids that were taken apart, in inventory order. */
  dismantled: string[];
  scrapGained: number;
}

/**
 * Take one item apart, or refuse.
 *
 * **A worn item is refused outright**, which is why a screen should offer the
 * button only for something on the bench: offering it for what the player is
 * wearing is a button the engine will always say no to.
 *
 * A hero's unique relic is refused too. It is not an inventory item in this
 * build — relics live on `roster.uniqueByHeroId` — so the guard is here for the
 * day one arrives rather than because one can today, and it is cheaper to keep
 * than to remember.
 */
export function dismantleItem(save: SaveV3, content: EquipmentContent, id: string): DismantleOutcome | null {
  const owned = ownedEquipment(save, content, id);
  if (!owned) return null;
  if (Object.values(save.equipment.equipped).includes(id)) return null;
  if (owned.kind === 'instance' && owned.instance.source === 'hero_unique') return null;

  const scrapGained = scrapValueOf(owned);
  return {
    save: {
      ...withEquipment(save, removeItems(save.equipment, new Set([id]))),
      wallet: { ...save.wallet, equipmentScrap: save.wallet.equipmentScrap + scrapGained },
    },
    dismantled: [id],
    scrapGained,
  };
}

/**
 * Take apart everything at or below the stored floor, sparing what is worn.
 *
 * **At or below, not below.** Read as strictly-below, a floor of `common` —
 * which is the default — sweeps nothing and the button does nothing at all.
 *
 * Refuses when there is nothing to take, rather than succeeding with an empty
 * sweep: a sweep that found nothing and one that did are different answers, and
 * a screen that reported "+0 scrap" would be reporting a success.
 */
export function autoDismantle(save: SaveV3, content: EquipmentContent): DismantleOutcome | null {
  const worn = new Set(Object.values(save.equipment.equipped).filter((id): id is string => id !== null));
  const dismantled: string[] = [];
  let scrapGained = 0;

  for (const id of save.equipment.inventory) {
    if (worn.has(id)) continue;
    const owned = ownedEquipment(save, content, id);
    if (!owned) continue;
    if (owned.kind === 'instance' && owned.instance.source === 'hero_unique') continue;
    if (!atOrBelowRarity({ ...owned.base, rarity: rarityOf(owned) }, save.equipment.autoDismantleFloor)) continue;
    dismantled.push(id);
    scrapGained += scrapValueOf(owned);
  }

  if (dismantled.length === 0) return null;
  return {
    save: {
      ...withEquipment(save, removeItems(save.equipment, new Set(dismantled))),
      wallet: { ...save.wallet, equipmentScrap: save.wallet.equipmentScrap + scrapGained },
    },
    dismantled,
    scrapGained,
  };
}

/** Change the rarity an automatic sweep takes at or below. */
export function setAutoDismantleFloor(save: SaveV3, floor: EquipmentRarity): SaveV3 | null {
  if (save.equipment.autoDismantleFloor === floor) return null;
  return withEquipment(save, { ...save.equipment, autoDismantleFloor: floor });
}

export interface CraftRequest {
  save: SaveV3;
  content: EquipmentContent;
  slot: EquipmentSlot;
  unlocks: { mythic: boolean; transcendent: boolean };
  vipLevel: number;
  forgeLevel: number;
  random: () => number;
  /** Only for the instance id. Nothing here reads a clock. */
  nowMs: number;
}

export interface CraftOutcome {
  save: SaveV3;
  item: EquipmentInstance;
  /** The rarity the dice gave, which is not always the item's. */
  rolledRarity: EquipmentRarity;
}

/**
 * Forge one item, or refuse.
 *
 * Eight values, in a fixed order: the rarity, the pick, the instance id, then
 * one per stat. Refused **before drawing anything**, so a press the account
 * cannot pay for does not advance the sequence.
 *
 * The rolled rarity is a *preference*, not a promise. If the class and slot has
 * no item at that rarity the pick falls back to **every** item of that class
 * and slot — so a craft can hand over something better or worse than the roll,
 * and with this catalogue it does: every class-and-slot pair is missing exactly
 * one rarity. A port that refused when the rarity pool was empty would refuse
 * one craft in six.
 */
export function craftEquipment(request: CraftRequest): CraftOutcome | null {
  const { save, content, slot, random } = request;
  const playerClass = save.identity.playerClass;
  if (playerClass === null) return null;

  const cost = EQUIPMENT_CRAFT_COST[slot];
  if (save.wallet.equipmentScrap < cost.scrap || save.wallet.gold < cost.gold) return null;
  if (save.equipment.inventory.length >= craftInventoryCap(request.vipLevel)) return null;

  const classSlotItems = content.catalog.filter(
    item => item.slot === slot && item.allowedClasses.includes(playerClass),
  );
  if (classSlotItems.length === 0) return null;

  const rolledRarity = rollEquipmentRarityByTier(random(), content.rarityTable, request.unlocks);
  const atRarity = classSlotItems.filter(item => item.rarity === rolledRarity);
  const source = atRarity.length > 0 ? atRarity : classSlotItems;
  const baseItem = source[Math.floor(random() * source.length)];

  const item = createEquipmentInstance({
    baseItem,
    itemLevel: Math.max(1, save.progression.level),
    source: 'craft',
    random,
    nowMs: request.nowMs,
    statMultiplier: forgeStatMultiplier(request.forgeLevel),
    taken: new Set(save.equipment.inventory),
  });

  return {
    save: {
      ...withEquipment(save, addInstance(save.equipment, item)),
      wallet: {
        ...save.wallet,
        equipmentScrap: save.wallet.equipmentScrap - cost.scrap,
        gold: save.wallet.gold - cost.gold,
      },
    },
    item,
    rolledRarity,
  };
}

export interface DropRequest {
  save: SaveV3;
  content: EquipmentContent;
  /** The waves at which drops were won, in the order they were won. */
  waves: readonly number[];
  unlocks: { mythic: boolean; transcendent: boolean };
  vipLevel: number;
  forgeLevel: number;
  random: () => number;
  /** Only for the instance ids. Nothing here reads a clock. */
  nowMs: number;
}

/**
 * Items a run won, built and put in the bag.
 *
 * The same shape as a craft and deliberately not the same function: a craft
 * picks a **slot** and a drop takes any slot the class can wear, a craft is
 * paid for and a drop is not, and a craft refuses when the bag is full where a
 * drop is simply lost. That last one is the shipped behaviour and reads as a
 * bug until you notice the alternative is a bag that grows without limit.
 *
 * The rarity is a *preference* rather than a promise, exactly as it is for a
 * craft: every class is missing some rarities in some slots, so a roll with no
 * item behind it falls back to the whole class pool. Phase 9 found that the
 * hard way.
 *
 * Whoever won it, the instance rolls against the player's level — a drop at
 * wave 400 on a level-20 account is a level-20 item.
 */
export function grantDrops(request: DropRequest): { save: SaveV3; items: EquipmentInstance[] } {
  const playerClass = request.save.identity.playerClass;
  if (playerClass === null || request.waves.length === 0) return { save: request.save, items: [] };

  const wearable = request.content.catalog.filter(item => item.allowedClasses.includes(playerClass));
  if (wearable.length === 0) return { save: request.save, items: [] };

  const cap = craftInventoryCap(request.vipLevel);
  let save = request.save;
  const items: EquipmentInstance[] = [];

  for (const _wave of request.waves) {
    // Lost rather than queued when the bag is full, as shipped. The roll is
    // not taken either, which keeps a full bag from advancing the sequence.
    if (save.equipment.inventory.length >= cap) break;

    const rolledRarity = rollEquipmentRarityByTier(request.random(), request.content.rarityTable, request.unlocks);
    const atRarity = wearable.filter(item => item.rarity === rolledRarity);
    const pool = atRarity.length > 0 ? atRarity : wearable;
    const baseItem = pool[Math.floor(request.random() * pool.length)];

    const item = createEquipmentInstance({
      baseItem,
      itemLevel: Math.max(1, save.progression.level),
      source: 'drop',
      random: request.random,
      nowMs: request.nowMs,
      statMultiplier: forgeStatMultiplier(request.forgeLevel),
      taken: new Set(save.equipment.inventory),
    });

    save = withEquipment(save, addInstance(save.equipment, item));
    items.push(item);
  }

  return { save, items };
}

/**
 * Put a rolled item in the bag.
 *
 * Exported for the shop, which buys one the same way a run wins one. The
 * alternative was a second copy of the instance-to-stored conversion, and two
 * copies of `fullBonus` is how a shop-bought item ends up missing a stat.
 */
export function addInstance(equipment: SaveEquipment, item: EquipmentInstance): SaveEquipment {
  return {
    ...equipment,
    inventory: [...equipment.inventory, item.id],
    instances: {
      ...equipment.instances,
      [item.id]: {
        baseItemId: item.baseItemId,
        name: item.name,
        emoji: item.emoji,
        description: item.description,
        rarity: item.rarity,
        bonus: fullBonus(item.bonus),
        itemLevel: item.itemLevel,
        source: item.source,
      },
    },
  };
}

function fullBonus(bonus: Partial<StatBlock>): StatBlock {
  const full: StatBlock = { strength: 0, vitality: 0, agility: 0, intelligence: 0, spirit: 0 };
  for (const key of STAT_KEYS) full[key] = bonus[key] ?? 0;
  return full;
}

export interface UpgradeRequest {
  save: SaveV3;
  content: EquipmentContent;
  id: string;
  unlocks: { mythic: boolean; transcendent: boolean };
  random: () => number;
  nowMs: number;
}

export interface UpgradeOutcome {
  save: SaveV3;
  item: EquipmentInstance;
  from: string;
  cost: { scrap: number; essence: number; gold: number };
}

/**
 * Take an item up a rarity, or refuse.
 *
 * Seven values: one for the target and six for the new instance — and **the
 * first is drawn before anybody checks the purse**, which is the difference in
 * kind from every other purchase in this game. Ported as it stands, because a
 * port that refused first would fall out of step with any recorded run
 * containing an unaffordable press.
 *
 * The upgraded item is a **new instance with a new id**, so anything pointing
 * at the old one has to be re-pointed — which the shipped action does for the
 * worn slot and for nothing else. There is nothing else in this build that
 * points at an inventory id, and if there ever is, this is where it joins.
 */
export function upgradeEquipment(request: UpgradeRequest): UpgradeOutcome | null {
  const { save, content, random } = request;
  const owned = ownedEquipment(save, content, request.id);
  if (!owned) return null;

  const plan = upgradePlan({
    baseItem: owned.base,
    catalog: content.catalog,
    purse: { scrap: save.wallet.equipmentScrap, essence: save.wallet.essence, gold: save.wallet.gold },
    unlocks: request.unlocks,
    random,
  });
  if (!plan.canUpgrade || plan.targetItemId === null) return null;

  const target = content.byId(plan.targetItemId);
  if (!target) return null;

  const itemLevel =
    owned.kind === 'instance'
      ? upgradedItemLevel(
          {
            ...owned.base,
            id: owned.id,
            baseItemId: owned.instance.baseItemId,
            itemLevel: owned.instance.itemLevel,
            source: owned.instance.source,
          },
          save.progression.level,
        )
      : upgradedItemLevel(owned.base, save.progression.level);

  const item = createEquipmentInstance({
    baseItem: target,
    itemLevel,
    source: 'upgrade',
    random,
    nowMs: request.nowMs,
    taken: new Set(save.equipment.inventory),
  });

  const withoutOld = removeItems(save.equipment, new Set([request.id]));
  const equipment = addInstance(withoutOld, item);
  // The worn slot follows the item. Without this an upgrade silently unequips
  // whatever the player was wearing, which reads as the upgrade destroying it.
  const equipped = { ...equipment.equipped };
  for (const slot of Object.keys(equipped) as EquipmentSlot[]) {
    if (equipped[slot] === request.id) equipped[slot] = item.id;
  }

  return {
    save: {
      ...withEquipment(save, { ...equipment, equipped }),
      wallet: {
        ...save.wallet,
        equipmentScrap: save.wallet.equipmentScrap - plan.scrapCost,
        essence: save.wallet.essence - plan.essenceCost,
        gold: save.wallet.gold - plan.goldCost,
      },
    },
    item,
    from: request.id,
    cost: { scrap: plan.scrapCost, essence: plan.essenceCost, gold: plan.goldCost },
  };
}

export interface RefineOutcome {
  save: SaveV3;
  /** How many units were bought, which is not always how many were asked for. */
  count: number;
  scrapSpent: number;
}

/** Refine scrap into essence. Null when the account cannot afford even one. */
export function refineToEssence(save: SaveV3, asked?: number): RefineOutcome | null {
  const costPer = scrapToEssenceCost({
    damage: save.progression.metaDamageLevel,
    economy: save.progression.metaEconomyLevel,
    survival: save.progression.metaSurvivalLevel,
  });
  const count = refineCount(save.wallet.equipmentScrap, costPer, asked);
  if (count === 0) return null;
  const scrapSpent = costPer * count;
  return {
    save: {
      ...save,
      wallet: {
        ...save.wallet,
        equipmentScrap: save.wallet.equipmentScrap - scrapSpent,
        essence: save.wallet.essence + count,
      },
    },
    count,
    scrapSpent,
  };
}

/** Refine scrap into hero shards, at a flat price and 140 a unit. */
export function refineToShards(save: SaveV3, asked?: number): RefineOutcome | null {
  const count = refineCount(save.wallet.equipmentScrap, SCRAP_TO_SHARD_COST, asked);
  if (count === 0) return null;
  const scrapSpent = SCRAP_TO_SHARD_COST * count;
  return {
    save: {
      ...save,
      wallet: {
        ...save.wallet,
        equipmentScrap: save.wallet.equipmentScrap - scrapSpent,
        heroShards: save.wallet.heroShards + SHARDS_PER_REFINE * count,
      },
    },
    count,
    scrapSpent,
  };
}

/** Everything the player can wear right now, for a screen to list. */
export function wearableFor(
  save: SaveV3,
  content: EquipmentContent,
  playerClass: PlayerClass | null,
): OwnedEquipment[] {
  if (playerClass === null) return [];
  const owned: OwnedEquipment[] = [];
  for (const id of save.equipment.inventory) {
    const entry = ownedEquipment(save, content, id);
    if (entry && entry.base.allowedClasses.includes(playerClass)) owned.push(entry);
  }
  return owned;
}
