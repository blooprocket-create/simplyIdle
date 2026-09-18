/**
 * The eight usable items. Authored data, ported verbatim.
 *
 * `value` is a **base**, not a payout. Every gain is the larger of a scaled
 * base and a wave floor, so a Gold Cache's 350 is what a brand-new account
 * gets and nothing else does — see `engine/items/usableGains.ts`, which owns
 * that arithmetic because the engine may not read this file's prices.
 *
 * The two coolants have a drop weight of **zero** and can never be found. They
 * are shop stock, and a port treating every row here as droppable would give
 * away what the game sells. Their effect is heat, which this engine does not
 * have — they are carried so the catalogue is whole and so the shop has
 * something to sell when it arrives.
 */

export type UsableItemType = 'basic' | 'advanced';
export type UsableEffect =
  | 'heal_team_percent'
  | 'gain_gold_flat'
  | 'gain_exp_flat'
  | 'gain_shards_flat'
  | 'reduce_heat_flat';

export interface UsableItem {
  id: string;
  name: string;
  emoji: string;
  description: string;
  itemType: UsableItemType;
  effect: UsableEffect;
  value: number;
  dropWeight: number;
}

export const USABLE_ITEMS: readonly UsableItem[] = [
  {
    id: 'small_potion',
    name: 'Small Vital Potion',
    emoji: '🧪',
    description: 'Restore 35% team HP instantly.',
    itemType: 'basic',
    effect: 'heal_team_percent',
    value: 0.35,
    dropWeight: 45,
  },
  {
    id: 'gold_cache',
    name: 'Gold Cache',
    emoji: '💰',
    description: 'Instantly grants 350 gold.',
    itemType: 'basic',
    effect: 'gain_gold_flat',
    value: 350,
    dropWeight: 28,
  },
  {
    id: 'exp_scroll',
    name: 'Training Scroll',
    emoji: '📜',
    description: 'Instantly grants 220 EXP.',
    itemType: 'basic',
    effect: 'gain_exp_flat',
    value: 220,
    dropWeight: 20,
  },
  {
    id: 'shard_cluster',
    name: 'Shard Cluster',
    emoji: '💠',
    description: 'Instantly grants 60 hero shards.',
    itemType: 'basic',
    effect: 'gain_shards_flat',
    value: 60,
    dropWeight: 7,
  },
  {
    id: 'grand_potion',
    name: 'Grand Vital Elixir',
    emoji: '🧴',
    description: 'Restore 65% team HP instantly.',
    itemType: 'advanced',
    effect: 'heal_team_percent',
    value: 0.65,
    dropWeight: 26,
  },
  {
    id: 'vault_cache',
    name: 'Imperial Vault Cache',
    emoji: '🏦',
    description: 'Instantly grants 1200 gold.',
    itemType: 'advanced',
    effect: 'gain_gold_flat',
    value: 1200,
    dropWeight: 14,
  },
  {
    id: 'coolant_mk1',
    name: 'Coolant Capsule I',
    emoji: '🧊',
    description: 'Premium: reduce combat heat by 35.',
    itemType: 'advanced',
    effect: 'reduce_heat_flat',
    value: 35,
    dropWeight: 0,
  },
  {
    id: 'coolant_mk2',
    name: 'Coolant Capsule II',
    emoji: '❄️',
    description: 'Premium: reduce combat heat by 75.',
    itemType: 'advanced',
    effect: 'reduce_heat_flat',
    value: 75,
    dropWeight: 0,
  },
];

export function getUsableItem(id: string): UsableItem | null {
  return USABLE_ITEMS.find(item => item.id === id) ?? null;
}

/**
 * Which item a roll finds.
 *
 * A cumulative walk returning on `cursor <= 0`, as shipped. A zero-weight row
 * can never be returned by it, which is how the coolants stay out of the drop
 * table while staying in the catalogue.
 *
 * The advanced pool is the whole table; the basic pool is the four rows a
 * player has before `advanced_consumables` unlocks.
 */
export function rollUsableItem(roll: number, advancedUnlocked: boolean): UsableItem {
  const pool = advancedUnlocked ? USABLE_ITEMS : USABLE_ITEMS.filter(item => item.itemType === 'basic');
  const total = pool.reduce((sum, item) => sum + item.dropWeight, 0);
  let cursor = roll * total;
  for (const item of pool) {
    cursor -= item.dropWeight;
    if (cursor <= 0) return item;
  }
  return pool[0];
}
