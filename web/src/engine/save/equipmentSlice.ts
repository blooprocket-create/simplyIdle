import type { EquipmentRarity, EquipmentSlot } from '../../content/equipment';
import { EQUIPMENT_RARITY_IDS, EQUIPMENT_SLOTS } from '../../content/equipment';
import { EQUIPMENT_SOURCES, type EquipmentSource } from '../equipment/instance';
import { boundedInt, boundedString, isRecord, MAX_SAVE_COLLECTION, MAX_SAVE_PLAYER_LEVEL } from './guards';
import type { SaveContent, SaveEquipment, SavedEquipment, StatBlock } from './schema';
import { STAT_KEYS } from './schema';

/**
 * Reading the equipment slice, once, for both readers.
 *
 * The same arrangement `readHero` and `normalizeTeamSelection` already make:
 * `migrate.ts` reads it out of a v2 payload and `v3.ts` reads it back out of
 * our own, and they call *this* rather than each restating the bounds. "Bounded
 * as hard as the migration" is then a fact about the call graph.
 *
 * Two things here that the hero slice does not have to deal with.
 *
 * **An inventory holds two shapes at once.** A bare catalogue id and a rolled
 * instance sit in the same list, because the shipped inventory is a list of ids
 * and a separate record of instances keyed by the same ids. Both are legal and
 * the reducers read either through one fallback, so the reader keeps both
 * rather than normalising — converting them is a migration with dice in it,
 * which belongs where the dice live.
 *
 * **Slot and class are derived, never trusted.** The shipped sanitiser takes
 * them off the base item and ignores whatever the payload stored, so an
 * instance whose base item has been retired is *dropped* — the mechanism by
 * which an item leaves old saves, the same one `readHero` gives a hero. That
 * needs the catalogue, which the engine may not import, so it arrives through
 * `SaveContent` exactly as `heroesById` does.
 */

const MAX_ITEM_NAME = 80;
const MAX_ITEM_EMOJI = 4;
const MAX_ITEM_DESCRIPTION = 160;

/** The default floor, and the shipped one: a sweep takes commons. */
export const DEFAULT_AUTO_DISMANTLE_FLOOR: EquipmentRarity = 'common';

export function isEquipmentRarity(value: unknown): value is EquipmentRarity {
  return typeof value === 'string' && (EQUIPMENT_RARITY_IDS as readonly string[]).includes(value);
}

function isEquipmentSource(value: unknown): value is EquipmentSource {
  return typeof value === 'string' && (EQUIPMENT_SOURCES as readonly string[]).includes(value);
}

export function emptyEquipment(): SaveEquipment {
  return {
    inventory: [],
    instances: {},
    equipped: { weapon: null, armor: null, accessory: null },
    autoDismantleFloor: DEFAULT_AUTO_DISMANTLE_FLOOR,
  };
}

function readBonus(raw: unknown): StatBlock {
  const record = isRecord(raw) ? raw : {};
  const bonus: StatBlock = { strength: 0, vitality: 0, agility: 0, intelligence: 0, spirit: 0 };
  for (const key of STAT_KEYS) {
    // Floored at zero rather than allowed negative: a stored bonus is editable
    // by whoever owns the browser, and a negative one is a stat penalty the
    // game has no concept of — it would read as an item that makes you worse
    // and, worse, one that a dismantle then pays scrap for.
    bonus[key] = boundedInt(record[key], 0, Number.MAX_SAFE_INTEGER, 0);
  }
  return bonus;
}

/**
 * One stored instance, or null when its base item is gone.
 *
 * `fallbackLevel` is the player's level, which is what the shipped sanitiser
 * defaults an unreadable item level to — an item with no level is treated as
 * one rolled for this player rather than as a level-one item, so a corrupted
 * field does not quietly halve a deep account's gear.
 */
export function readEquipmentInstance(
  raw: unknown,
  content: SaveContent,
  fallbackLevel: number,
): SavedEquipment | null {
  if (!isRecord(raw)) return null;
  const baseItemId = typeof raw.baseItemId === 'string' ? raw.baseItemId : null;
  if (baseItemId === null) return null;
  const template = content.equipmentById.get(baseItemId);
  if (!template) return null;

  return {
    baseItemId,
    // The stored strings win when they are readable, so an item renamed in the
    // catalogue keeps the name the player earned it under — which is what the
    // shipped `clampString(entry.name, baseItem.name, 80)` does.
    name: boundedString(raw.name, template.name, MAX_ITEM_NAME) || template.name,
    emoji: boundedString(raw.emoji, template.emoji, MAX_ITEM_EMOJI) || template.emoji,
    description: boundedString(raw.description, template.description, MAX_ITEM_DESCRIPTION) || template.description,
    // Rarity is the one field an instance may legally differ from its base on:
    // an upgrade builds a new instance from a *different* base, but a stored
    // one can carry a rarity the base no longer has.
    rarity: isEquipmentRarity(raw.rarity) ? raw.rarity : template.rarity,
    bonus: readBonus(raw.bonus),
    itemLevel: boundedInt(raw.itemLevel, 1, MAX_SAVE_PLAYER_LEVEL, fallbackLevel),
    // `legacy` rather than `drop`, which matters: the source decides the scrap
    // rate, and defaulting an unreadable one to `drop` would pay full price
    // for an item nobody can account for.
    source: isEquipmentSource(raw.source) ? raw.source : 'legacy',
  };
}

export interface ReadEquipmentInput {
  inventoryItemIds: unknown;
  equipmentInventory: unknown;
  equippedItems: unknown;
  autoDismantleRarityFloor: unknown;
  content: SaveContent;
  /** The player's level, for an instance whose own is unreadable. */
  level: number;
}

/**
 * The whole slice, bounded.
 *
 * The order the checks run in is the behaviour. Instances are read first, then
 * the inventory is filtered to ids that are **either** a live instance or a
 * live catalogue row, and only then is the worn set filtered to what the
 * inventory actually holds. Doing it the other way round would leave a slot
 * pointing at an item the player does not own, which is a stat bonus from
 * nothing.
 */
export function readEquipment(input: ReadEquipmentInput): SaveEquipment {
  const { content } = input;
  const level = Math.max(1, Math.floor(input.level));

  const instances: Record<string, SavedEquipment> = {};
  if (isRecord(input.equipmentInventory)) {
    for (const [id, entry] of Object.entries(input.equipmentInventory)) {
      if (Object.keys(instances).length >= MAX_SAVE_COLLECTION) break;
      if (id.length === 0) continue;
      const instance = readEquipmentInstance(entry, content, level);
      if (instance) instances[id] = instance;
    }
  }

  const inventory: string[] = [];
  const held = new Set<string>();
  if (Array.isArray(input.inventoryItemIds)) {
    for (const id of input.inventoryItemIds) {
      if (inventory.length >= MAX_SAVE_COLLECTION) break;
      if (typeof id !== 'string' || id.length === 0) continue;
      // A duplicate id is dropped rather than kept: the inventory is keyed by
      // id everywhere downstream, so two of them is one item the player can
      // dismantle twice.
      if (held.has(id)) continue;
      if (!instances[id] && !content.equipmentById.has(id)) continue;
      held.add(id);
      inventory.push(id);
    }
  }

  // An instance nobody holds is dropped with it. Keeping it would grow the
  // save forever: every dismantle removes the id from the list, and a record
  // that outlived its list is a leak with no way to reach it.
  for (const id of Object.keys(instances)) {
    if (!held.has(id)) delete instances[id];
  }

  const equipped: Record<EquipmentSlot, string | null> = { weapon: null, armor: null, accessory: null };
  const rawEquipped = isRecord(input.equippedItems) ? input.equippedItems : {};
  for (const slot of EQUIPMENT_SLOTS) {
    const id = rawEquipped[slot];
    if (typeof id !== 'string' || !held.has(id)) continue;
    // The slot the item belongs in decides where it may be worn, not the key
    // it was stored under — a payload claiming a sword in the armour slot is
    // one the shipped reader rejects too.
    const instance = instances[id];
    const itemSlot = instance
      ? content.equipmentById.get(instance.baseItemId)?.slot
      : content.equipmentById.get(id)?.slot;
    if (itemSlot !== slot) continue;
    equipped[slot] = id;
  }

  return {
    inventory,
    instances,
    equipped,
    autoDismantleFloor: isEquipmentRarity(input.autoDismantleRarityFloor)
      ? input.autoDismantleRarityFloor
      : DEFAULT_AUTO_DISMANTLE_FLOOR,
  };
}

/** The slice, back in the shape the shipped reader expects. */
export function equipmentToLegacy(equipment: SaveEquipment): Record<string, unknown> {
  return {
    inventoryItemIds: [...equipment.inventory],
    equipmentInventory: Object.fromEntries(
      Object.entries(equipment.instances).map(([id, instance]) => [
        id,
        /*
         * `id` goes in the body as well as being the key. The shipped
         * sanitiser rebuilds it from the key on load, so it is redundant
         * there — but the shipped app's *live* state carries it in the body,
         * and a record written straight back out without a reload in between
         * would otherwise lose it.
         *
         * `slot` and `allowedClasses` are deliberately absent. The sanitiser
         * takes both off the base item and ignores whatever was stored, so
         * writing them would be writing fields nothing reads.
         */
        { id, ...instance },
      ]),
    ),
    equippedItems: { ...equipment.equipped },
    autoDismantleRarityFloor: equipment.autoDismantleFloor,
  };
}
