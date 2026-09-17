import { EQUIPMENT_RARITY_IDS, type EquipmentRarity, type EquipmentRarityConfig } from '../../content/equipment';

/**
 * Which rarity a roll produces, and how the tier gates change that.
 *
 * The table is an argument rather than an import, like every other content the
 * engine works on. It matters more here than usual: the roll's answer depends
 * on the *whole* table, because the weights are summed and then subtracted in
 * order, so a caller handing over a filtered table is not making a small
 * change to the odds — it is redistributing everything above the cut.
 */

/** The comparison order for a rarity: its index in the authored table. */
export function equipmentRarityRank(rarity: EquipmentRarity): number {
  const index = EQUIPMENT_RARITY_IDS.indexOf(rarity);
  return index < 0 ? 0 : index;
}

/**
 * Walk the table, subtracting each weight from a scaled roll.
 *
 * Ported as the loop rather than as a precomputed threshold list, and that is
 * not a style choice. At `roll === 1` the subtractions leave a residue of about
 * 7e-15 above zero for the full table, so nothing matches and the trailing
 * `common` fires — **the best possible roll gives the worst item.** A
 * cumulative-threshold implementation answers `transcendent` there instead.
 *
 * Unreachable in play, because `Math.random()` never returns exactly 1. Kept
 * because the fixture records it and because "unreachable" is a property of
 * today's callers, not of the function.
 */
export function rollEquipmentRarity(roll: number, table: readonly EquipmentRarityConfig[]): EquipmentRarity {
  const total = table.reduce((sum, entry) => sum + entry.dropWeight, 0);
  let cursor = roll * total;
  for (const entry of table) {
    cursor -= entry.dropWeight;
    if (cursor <= 0) return entry.id;
  }
  return 'common';
}

/**
 * The same roll, against only the tiers an account has unlocked.
 *
 * The filter runs on the **pool**, before the weights are summed — so locking
 * mythic does not make a high roll fail, it makes it legendary. A port that
 * kept the full total and fell through would hand out commons at the *top* of
 * the range, which is the opposite of what the gate is for.
 *
 * It also pushes every boundary up rather than down: removing weight shrinks
 * the denominator, so legendary starts at 0.97 with mythic locked against
 * 0.9566 without. Then it runs to the ceiling, which is the actual effect.
 */
export function rollEquipmentRarityByTier(
  roll: number,
  table: readonly EquipmentRarityConfig[],
  unlocks: { mythic: boolean; transcendent: boolean },
): EquipmentRarity {
  const pool = table.filter(entry => {
    if (!unlocks.mythic && (entry.id === 'mythic' || entry.id === 'transcendent')) return false;
    if (!unlocks.transcendent && entry.id === 'transcendent') return false;
    return true;
  });
  return rollEquipmentRarity(roll, pool);
}

/** The rarity one step up, or null at the top. */
export function nextEquipmentRarity(rarity: EquipmentRarity): EquipmentRarity | null {
  const index = EQUIPMENT_RARITY_IDS.indexOf(rarity);
  if (index < 0 || index >= EQUIPMENT_RARITY_IDS.length - 1) return null;
  return EQUIPMENT_RARITY_IDS[index + 1];
}
