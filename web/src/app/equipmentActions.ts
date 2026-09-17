import { EQUIPMENT_CATALOG, EQUIPMENT_RARITIES, getEquipmentItem } from '../content/equipment';
import type { EquipmentRarity, EquipmentSlot } from '../content/equipment';
import { boundedInt, SAFE_NUMBER_CAP } from '../engine/save/guards';
import type { SaveV3 } from '../engine/save/schema';
import {
  autoDismantle,
  craftEquipment,
  dismantleItem,
  equipItem,
  refineToEssence,
  refineToShards,
  setAutoDismantleFloor,
  unequipSlot,
  upgradeEquipment,
  type EquipmentContent,
} from '../engine/equipment/equipmentSave';
import { upgradePlan, type UpgradePlan } from '../engine/equipment/forge';
import { createEquipmentInstance } from '../engine/equipment/instance';

/**
 * The equipment verbs, with the catalogue and the dice supplied.
 *
 * The same arrangement `playerActions.ts` makes for the roster, and for the
 * same reason: the engine takes the catalogue, the rarity table and a `random`
 * as arguments, somebody has to hand it all three, and that somebody is not a
 * React callback.
 */

/** The catalogue, in the shape the equipment verbs need it. Built once. */
export const EQUIPMENT_CONTENT: EquipmentContent = {
  catalog: EQUIPMENT_CATALOG,
  rarityTable: EQUIPMENT_RARITIES,
  byId: getEquipmentItem,
};

/**
 * Which rarity tiers the account has unlocked, out of the legacy bag.
 *
 * Read rather than claimed, the same call `vipLevel` makes. Unlocks are a whole
 * system — a list of ids granted by achievements, milestones and the postgame —
 * that no phase owns yet, and claiming one flag of it now would put a lone
 * typed boolean next to the untyped rest.
 *
 * Both default to **locked**, which is the honest reading of an absent field:
 * the shipped `hasUnlock` answers false for an account whose list it cannot
 * find, and an unlock defaulted to true would hand a new player mythic crafts.
 */
export function equipmentUnlocks(save: SaveV3): { mythic: boolean; transcendent: boolean } {
  const unlocks = save.legacy.unlockedFeatures;
  const list = Array.isArray(unlocks) ? unlocks : [];
  return {
    mythic: list.includes('mythic_equipment'),
    // The shipped gate is the postgame summon unlock rather than an entry in
    // the same list, and `isPostgameSummonUnlocked` is wave 150 or one
    // prestige — which the typed slice already carries.
    transcendent: save.progression.highestWave >= 150 || save.progression.prestigeCount >= 1,
  };
}

function vipLevelOf(save: SaveV3): number {
  return boundedInt(save.legacy.vipLevel, 0, SAFE_NUMBER_CAP, 0);
}

function forgeLevelOf(save: SaveV3): number {
  const facilities = save.legacy.guildhallFacilities;
  if (typeof facilities !== 'object' || facilities === null) return 0;
  const forge = (facilities as Record<string, unknown>).forge;
  if (typeof forge !== 'object' || forge === null) return 0;
  return boundedInt((forge as Record<string, unknown>).level, 0, SAFE_NUMBER_CAP, 0);
}

export interface ForgeAttempt {
  save: SaveV3;
  /** For the new instance's id. Passed in, because nothing below reads a clock. */
  nowMs: number;
  random: () => number;
}

/**
 * What an upgrade would cost and hand over, for a screen to show.
 *
 * **It draws**, which is why this is not a pure query: the shipped plan picks
 * its target before anybody checks the purse. A screen calling it to price a
 * button is therefore advancing the sequence, exactly as the shipped screen
 * does — and the item the screen quotes need not be the one the press hands
 * over, because the press computes its own plan.
 */
export function planUpgrade(save: SaveV3, id: string, random: () => number): UpgradePlan | null {
  const instance = save.equipment.instances[id];
  const baseItem = instance ? getEquipmentItem(instance.baseItemId) : getEquipmentItem(id);
  if (!baseItem || !save.equipment.inventory.includes(id)) return null;
  return upgradePlan({
    baseItem,
    catalog: EQUIPMENT_CATALOG,
    purse: { scrap: save.wallet.equipmentScrap, essence: save.wallet.essence, gold: save.wallet.gold },
    unlocks: equipmentUnlocks(save),
    random,
  });
}

/** The equipment verbs, each answering the next save or null. */
export const equipmentActions = {
  equip: (save: SaveV3, id: string) => equipItem(save, EQUIPMENT_CONTENT, id),
  unequip: (save: SaveV3, slot: EquipmentSlot) => unequipSlot(save, slot),
  dismantle: (save: SaveV3, id: string) => dismantleItem(save, EQUIPMENT_CONTENT, id)?.save ?? null,
  sweep: (save: SaveV3) => autoDismantle(save, EQUIPMENT_CONTENT)?.save ?? null,
  setFloor: (save: SaveV3, floor: EquipmentRarity) => setAutoDismantleFloor(save, floor),
  craft: (attempt: ForgeAttempt, slot: EquipmentSlot) =>
    craftEquipment({
      save: attempt.save,
      content: EQUIPMENT_CONTENT,
      slot,
      unlocks: equipmentUnlocks(attempt.save),
      vipLevel: vipLevelOf(attempt.save),
      forgeLevel: forgeLevelOf(attempt.save),
      random: attempt.random,
      nowMs: attempt.nowMs,
    }),
  upgrade: (attempt: ForgeAttempt, id: string) =>
    upgradeEquipment({
      save: attempt.save,
      content: EQUIPMENT_CONTENT,
      id,
      unlocks: equipmentUnlocks(attempt.save),
      random: attempt.random,
      nowMs: attempt.nowMs,
    }),
  refineEssence: (save: SaveV3, count?: number) => refineToEssence(save, count)?.save ?? null,
  refineShards: (save: SaveV3, count?: number) => refineToShards(save, count)?.save ?? null,
};

/**
 * Turn every bare catalogue id in the inventory into a rolled instance.
 *
 * The shipped reader does this on **every load** — `migrateLegacyEquipmentIds`
 * — and the engine's reader deliberately does not, because it draws and reads
 * the catalogue and may do neither. So it happens here, at the same moment,
 * with both supplied.
 *
 * It is not cosmetic. A bare row carries its *authored* bonus, which is three
 * or four points; the instance it becomes is rolled against the player's level,
 * which at level 100 is an order of magnitude more. A port that skipped this
 * would show a returning player far weaker gear than the app they left.
 *
 * `source: 'legacy'`, as shipped, which prices it at nine tenths when
 * dismantled rather than the full rate a bare row would pay.
 *
 * A worn slot follows its item to the new id. A slot naming an id that neither
 * converted nor survived is emptied rather than left dangling.
 */
export function migrateLegacyEquipment(save: SaveV3, nowMs: number, random: () => number): SaveV3 {
  const bare = save.equipment.inventory.filter(id => !save.equipment.instances[id]);
  if (bare.length === 0) return save;

  const taken = new Set(save.equipment.inventory);
  const converted = new Map<string, string>();
  const instances = { ...save.equipment.instances };

  for (const id of bare) {
    const baseItem = getEquipmentItem(id);
    // Already dropped by the reader if the row is gone, so this is the guard
    // to that belt rather than a path a stored save can take.
    if (!baseItem) continue;
    const instance = createEquipmentInstance({
      baseItem,
      itemLevel: Math.max(1, save.progression.level),
      source: 'legacy',
      random,
      nowMs,
      taken,
    });
    taken.add(instance.id);
    converted.set(id, instance.id);
    instances[instance.id] = {
      baseItemId: instance.baseItemId,
      name: instance.name,
      emoji: instance.emoji,
      description: instance.description,
      rarity: instance.rarity,
      bonus: {
        strength: instance.bonus.strength ?? 0,
        vitality: instance.bonus.vitality ?? 0,
        agility: instance.bonus.agility ?? 0,
        intelligence: instance.bonus.intelligence ?? 0,
        spirit: instance.bonus.spirit ?? 0,
      },
      itemLevel: instance.itemLevel,
      source: instance.source,
    };
  }

  const equipped = { ...save.equipment.equipped };
  for (const slot of Object.keys(equipped) as EquipmentSlot[]) {
    const id = equipped[slot];
    if (id === null) continue;
    const next = converted.get(id);
    if (next !== undefined) equipped[slot] = next;
  }

  return {
    ...save,
    equipment: {
      ...save.equipment,
      inventory: save.equipment.inventory.map(id => converted.get(id) ?? id),
      instances,
      equipped,
    },
  };
}
