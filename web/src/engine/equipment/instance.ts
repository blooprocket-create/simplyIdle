import { getClassProfile, type PlayerClass } from '../../content/classes';
import type { EquipmentItem, EquipmentRarity, EquipmentSlot } from '../../content/equipment';
import { STAT_KEYS, type StatBlock } from '../save/schema';
import { equipmentRarityRank } from './rarity';

/**
 * Turning a catalogue row into an item somebody owns.
 *
 * A catalogue row is a *template*: a name, a slot, a rarity and an authored
 * stat bonus. What a player holds is an **instance** — the same row rolled for
 * a budget that depends on their level and their forge, with its own id. The
 * two are not interchangeable and the shipped code keeps both in the same
 * inventory, which is why `scrapGain` has to ask which it is looking at.
 *
 * Five values are drawn per roll, one per stat, in `STAT_KEYS` order. The count
 * and the order are the contract: the fixture records eight draws for a craft,
 * and the five here are the last five of them.
 */

/** Where an instance came from. Decides what it is worth taken apart. */
export const EQUIPMENT_SOURCES = ['starter', 'drop', 'craft', 'crate', 'upgrade', 'legacy', 'hero_unique'] as const;
export type EquipmentSource = (typeof EQUIPMENT_SOURCES)[number];

export interface EquipmentInstance {
  id: string;
  baseItemId: string;
  name: string;
  emoji: string;
  slot: EquipmentSlot;
  rarity: EquipmentRarity;
  allowedClasses: readonly PlayerClass[];
  description: string;
  bonus: Partial<StatBlock>;
  itemLevel: number;
  source: EquipmentSource;
}

/** What an item is worth in scrap before any source discount. */
export const EQUIPMENT_SCRAP_VALUE: Readonly<Record<EquipmentRarity, number>> = {
  common: 10,
  rare: 24,
  epic: 60,
  legendary: 160,
  mythic: 360,
  transcendent: 760,
};

/**
 * How much of an item's scrap value its origin returns.
 *
 * A dropped item pays full; everything else is discounted, most severely a
 * hero's unique relic at a twentieth. The rates are why farming beats crafting
 * for scrap, which is presumably the point.
 */
export const EQUIPMENT_SOURCE_SCRAP_MULTIPLIER: Readonly<Record<EquipmentSource, number>> = {
  starter: 0.2,
  drop: 1,
  craft: 0.42,
  crate: 0.58,
  upgrade: 0.5,
  legacy: 0.9,
  hero_unique: 0.05,
};

const RARITY_BUDGET_MULTIPLIER: Readonly<Record<EquipmentRarity, number>> = {
  common: 1,
  rare: 1.25,
  epic: 1.6,
  legendary: 2,
  mythic: 2.55,
  transcendent: 3.1,
};

const SLOT_BUDGET_MULTIPLIER: Readonly<Record<EquipmentSlot, number>> = {
  weapon: 1.18,
  armor: 1.08,
  accessory: 1,
};

function sumBonus(bonus: Partial<StatBlock>): number {
  let total = 0;
  for (const key of STAT_KEYS) total += bonus[key] ?? 0;
  return total;
}

/**
 * How many stat points an instance carries.
 *
 * Seven percent per item level over the first, on top of the rarity and slot
 * multipliers — and the item level a craft uses is the **player's** level, not
 * anything about the item. So the same base row crafted at 200 is far stronger
 * than one crafted at 1, and an item already owned does not grow.
 */
export function equipmentBudget(baseItem: EquipmentItem, itemLevel: number): number {
  const levelMultiplier = 1 + Math.max(0, itemLevel - 1) * 0.07;
  return Math.max(
    2,
    Math.round(
      sumBonus(baseItem.bonus) *
        RARITY_BUDGET_MULTIPLIER[baseItem.rarity] *
        SLOT_BUDGET_MULTIPLIER[baseItem.slot] *
        levelMultiplier,
    ),
  );
}

/** Three percent a level. Applied to the budget, so the split can move too. */
export function forgeStatMultiplier(forgeLevel: number): number {
  return 1 + Math.max(0, Math.floor(forgeLevel)) * 0.03;
}

/**
 * How a slot wants its budget spent, for one class.
 *
 * Every weight is floored at 0.15 rather than allowed to reach zero, which is
 * what stops a mage's weapon from rolling no strength at all — the roll is a
 * share of a total, so a zero weight is a stat that can never appear.
 */
export function equipmentStatWeights(playerClass: PlayerClass, slot: EquipmentSlot): Record<keyof StatBlock, number> {
  const cls = getClassProfile(playerClass);
  const offense = slot === 'weapon' ? 1.2 : slot === 'accessory' ? 1 : 0.82;
  const defense = slot === 'armor' ? 1.2 : slot === 'accessory' ? 0.95 : 0.8;
  const utility = slot === 'accessory' ? 1.15 : 0.9;
  return {
    strength: Math.max(0.15, cls.physWeight * offense),
    vitality: Math.max(0.15, cls.teamWeight * defense),
    // The archer is the exception written into the formula rather than into a
    // table: their agility is worth nearly double every other class's.
    agility: Math.max(0.15, (playerClass === 'archer' ? cls.physWeight * 1.18 : cls.physWeight * 0.62) * utility),
    intelligence: Math.max(0.15, cls.magicWeight * offense),
    spirit: Math.max(0.15, (cls.magicWeight * 0.72 + cls.teamWeight * 0.38) * utility),
  };
}

/**
 * Roll a budget across the five stats.
 *
 * Five draws, one per stat, each jittering that stat's weight by 0.82 to 1.27.
 * Three things here are easy to get subtly wrong:
 *
 * - **The last key takes the remainder**, not its share. Rounding each share
 *   independently would lose or gain a point or two, and would never spend the
 *   budget exactly.
 * - **Every assignment is capped at what is left**, so an early stat rounding
 *   up cannot overspend.
 * - **The authored bonus's stats are floored at one afterwards**, which can
 *   push the total *above* the budget. That floor is why an item always shows
 *   the stats its description implies, even when the roll gave them nothing.
 *
 * The class the weights come from is the item's own first allowed class, not
 * the player's — so an item rolls the way its class wants it rolled whoever
 * crafted it.
 */
export function rollEquipmentBonus(
  baseItem: EquipmentItem,
  itemLevel: number,
  random: () => number,
  statMultiplier = 1,
): Partial<StatBlock> {
  const playerClass = baseItem.allowedClasses[0] ?? 'warrior';
  const weights = equipmentStatWeights(playerClass, baseItem.slot);
  const budget = Math.max(2, Math.round(equipmentBudget(baseItem, itemLevel) * Math.max(1, statMultiplier)));

  const rolled: Record<keyof StatBlock, number> = {
    strength: 0,
    vitality: 0,
    agility: 0,
    intelligence: 0,
    spirit: 0,
  };
  for (const key of STAT_KEYS) rolled[key] = weights[key] * (0.82 + random() * 0.45);
  const totalWeight = STAT_KEYS.reduce((sum, key) => sum + rolled[key], 0);

  const bonus: Partial<StatBlock> = {};
  let assigned = 0;
  STAT_KEYS.forEach((key, index) => {
    const remaining = budget - assigned;
    if (remaining <= 0) return;
    const raw =
      index === STAT_KEYS.length - 1 ? remaining : Math.max(0, Math.round((budget * rolled[key]) / totalWeight));
    const value = Math.min(remaining, raw);
    if (value > 0) {
      bonus[key] = value;
      assigned += value;
    }
  });

  for (const key of STAT_KEYS) {
    if ((baseItem.bonus[key] ?? 0) > 0) bonus[key] = Math.max(1, bonus[key] ?? 0);
  }
  return bonus;
}

/**
 * Build an owned copy of a catalogue row.
 *
 * **The id is drawn first**, before the bonus. That ordering is the whole
 * reason this is one function rather than two calls at the seam: a port that
 * rolled the stats and then built the id would produce the same item under a
 * different id and the same id over a different item, and every recorded run
 * after that point would disagree.
 *
 * The shipped id is `eq_<source>_<ms>_<six base-36 characters>`. The collision
 * guard is ours, as it was for a summoned hero's uid, and for the same reason:
 * two crafts in the same millisecond on the same draw produce one id, and an
 * inventory keyed by id loses the second item outright.
 */
export function createEquipmentInstance(input: {
  baseItem: EquipmentItem;
  itemLevel: number;
  source: EquipmentSource;
  random: () => number;
  nowMs: number;
  statMultiplier?: number;
  taken?: ReadonlySet<string>;
}): EquipmentInstance {
  const { baseItem, source, random } = input;
  const clampedLevel = Math.max(1, Math.floor(input.itemLevel));
  const suffix = random().toString(36).slice(2, 8);
  const base = `eq_${source}_${Math.floor(input.nowMs)}_${suffix}`;
  const id = uniqueEquipmentId(base, input.taken ?? new Set());
  return {
    id,
    baseItemId: baseItem.id,
    name: baseItem.name,
    emoji: baseItem.emoji,
    slot: baseItem.slot,
    rarity: baseItem.rarity,
    allowedClasses: [...baseItem.allowedClasses],
    description: baseItem.description,
    bonus: rollEquipmentBonus(baseItem, clampedLevel, random, input.statMultiplier ?? 1),
    itemLevel: clampedLevel,
    source,
  };
}

function uniqueEquipmentId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let suffix = 1; ; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * What an item is worth taken apart.
 *
 * A **catalogue row pays the undiscounted rate**, because the shipped guard is
 * `'source' in item` and a row has no source — a rate no owned item ever
 * actually gets. A pre-instance save's inventory *is* a list of catalogue ids,
 * but `migrateLegacyEquipmentIds` turns every one of them into an instance at
 * `source: 'legacy'` on load, so a returning player's items pay 0.9 rather
 * than 1. (My first note here said the opposite; the loader is what makes it
 * wrong.) The branch is ported anyway, because both apps' reducers reach it
 * through the same fallback and a port that gave everything a source would
 * quietly pay 42% for a crafted item.
 */
export function equipmentScrapGain(item: EquipmentItem | EquipmentInstance): number {
  const baseValue = EQUIPMENT_SCRAP_VALUE[item.rarity] ?? EQUIPMENT_SCRAP_VALUE.common;
  if (!('source' in item)) return baseValue;
  return Math.max(1, Math.floor(baseValue * EQUIPMENT_SOURCE_SCRAP_MULTIPLIER[item.source]));
}

/** Whether one item outranks another for the auto-dismantle floor. */
export function atOrBelowRarity(item: EquipmentItem | EquipmentInstance, floor: EquipmentRarity): boolean {
  // At or below, not below. Read as `<`, a floor of common sweeps nothing and
  // the setting's default does nothing at all.
  return equipmentRarityRank(item.rarity) <= equipmentRarityRank(floor);
}
