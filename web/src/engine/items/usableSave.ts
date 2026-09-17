import { getUsableItem } from '../../content/usableItems';
import type { SaveV3 } from '../save/schema';
import { addUsable } from '../save/usablesSlice';
import { applyExp } from '../progression/levelUp';
import { usableExpGain, usableGoldGain, usableShardGain, type UsableScaling } from './usableGains';

/**
 * Using an item.
 *
 * Several at once, because the shipped action takes an amount and `'all'` —
 * and a player holding forty potions will not press forty times. The count is
 * clamped to what is held rather than refused, so asking for nine when two are
 * held spends two.
 *
 * The heal is the one effect this cannot apply: the team's health lives in the
 * running fight, not the save, so a potion has to reach the simulation. It is
 * reported rather than applied here — see `healFraction` on the outcome — and
 * the shell hands it to the loop.
 */

export interface UseRequest {
  save: SaveV3;
  itemId: string;
  amount: number | 'all';
  scaling: UsableScaling;
}

export interface UseOutcome {
  save: SaveV3;
  used: number;
  /**
   * A share of the team's maximum to restore, if the item heals. The save has
   * no team health; the fight does.
   */
  healFraction: number;
}

export function useUsableItem(request: UseRequest): UseOutcome | null {
  const held = request.save.usables[request.itemId] ?? 0;
  if (held <= 0) return null;

  const item = getUsableItem(request.itemId);
  if (item === null) return null;

  const asked = request.amount === 'all' ? held : Math.floor(request.amount);
  const used = Math.max(1, Math.min(held, Number.isFinite(asked) ? asked : 1));

  const save: SaveV3 = { ...request.save, usables: addUsable(request.save.usables, request.itemId, -used) };

  switch (item.effect) {
    case 'heal_team_percent':
      // Stacked rather than capped here: the fight clamps at full health, and
      // clamping twice would hide a potion that was genuinely wasted.
      return { save, used, healFraction: item.value * used };

    case 'gain_gold_flat': {
      const gain = usableGoldGain(item.value, item.itemType, request.scaling) * used;
      return {
        save: {
          ...save,
          wallet: { ...save.wallet, gold: save.wallet.gold + gain, totalGold: save.wallet.totalGold + gain },
        },
        used,
        healFraction: 0,
      };
    }

    case 'gain_exp_flat': {
      const gain = usableExpGain(item.value, item.itemType, request.scaling) * used;
      const level = applyExp(save.progression.level, save.progression.exp, gain);
      return {
        save: {
          ...save,
          progression: {
            ...save.progression,
            level: level.level,
            exp: level.exp,
            totalExp: save.progression.totalExp + gain,
          },
          stats: { ...save.stats, unspent: save.stats.unspent + level.statPoints },
        },
        used,
        healFraction: 0,
      };
    }

    case 'gain_shards_flat': {
      const gain = usableShardGain(item.value, item.itemType, request.scaling) * used;
      return {
        save: { ...save, wallet: { ...save.wallet, heroShards: save.wallet.heroShards + gain } },
        used,
        healFraction: 0,
      };
    }

    case 'reduce_heat_flat':
      /*
       * **Not ported, and the item is still spent.** This engine has no heat —
       * which is also why `tempo` and the two coolant automations stay
       * unavailable — so a coolant does nothing here. Refusing the press
       * instead would leave a player unable to clear an item they can never
       * use; spending it silently is the lesser of the two, and it is named
       * rather than left to be discovered.
       */
      return { save, used, healFraction: 0 };
  }
}

/** Grant items a run found. One id at a time, as the drop table hands them over. */
export function grantUsable(save: SaveV3, itemId: string, count = 1): SaveV3 {
  if (getUsableItem(itemId) === null) return save;
  return { ...save, usables: addUsable(save.usables, itemId, count) };
}
