import type Decimal from 'break_eternity.js';
import type { BankedRun } from '../combat/rewards';
import { applyExp, heroLevelAfter } from '../progression/levelUp';
import type { SaveV3 } from './schema';

/**
 * Put a run's earnings into the account's wallet.
 *
 * The half that was missing from the run/wallet split. `RunEarnings` is "what
 * the run has earned" and the save's wallet is "what the account holds", and
 * the player's spendable balance was read as the sum of the two — correctly,
 * right up until something spent it. Purchases deducted from the wallet alone
 * and floored it at zero, and nothing ever reduced the run's tally.
 *
 * Measured: an empty wallet with a million unbanked gold bought **seven**
 * facility levels and still read a million. Banking is what makes a coin
 * belong to one of the two rather than to both.
 *
 * Gold comes in as a `Decimal` and the wallet holds a `number`, which is a
 * narrowing the save format already makes everywhere. `totalGold` climbs with
 * it because it is a lifetime tally that unlocks achievements, and a player
 * whose earnings were banked in a hundred instalments must reach the same
 * figure as one whose were banked in one.
 *
 * **Levelling rides on the same moment**, for that same reason: the player off
 * the EXP curve and every fielded hero once per kill. Doing it here rather
 * than per kill is what keeps the arithmetic instalment-proof — `applyExp`
 * carries its remainder and `heroLevelAfter` takes a count, so a hundred small
 * banks and one large one land in the same place.
 */
export function bankRun(save: SaveV3, banked: BankedRun): SaveV3 {
  const gold = toNumber(banked.gold);
  const gain = applyExp(save.progression.level, save.progression.exp, toNumber(banked.exp));
  const fielded = new Set(save.roster.activeUids);

  return {
    ...save,
    wallet: {
      ...save.wallet,
      gold: save.wallet.gold + gold,
      totalGold: save.wallet.totalGold + gold,
      essence: save.wallet.essence + banked.essence,
      bossTears: save.wallet.bossTears + banked.bossTears,
    },
    /*
     * The player levels off the EXP curve, and the stat points come with it —
     * five a level, unspent, because where they go is the player's decision
     * and not this function's.
     */
    progression: {
      ...save.progression,
      level: gain.level,
      exp: gain.exp,
      totalExp: save.progression.totalExp + toNumber(banked.exp),
    },
    stats: { ...save.stats, unspent: save.stats.unspent + gain.statPoints },
    roster: {
      ...save.roster,
      /*
       * And every *fielded* hero gains a level per kill. The bench gains
       * nothing, which is the shipped rule and also the only one that makes
       * the choice of who to field a choice at all.
       */
      heroes: save.roster.heroes.map(hero =>
        fielded.has(hero.uid) ? { ...hero, level: heroLevelAfter(hero.level, banked.kills) } : hero,
      ),
    },
  };
}

/** Whether there is anything to move. Saves a render for a run that idled. */
export function worthBanking(banked: BankedRun): boolean {
  return (
    banked.gold.gt(0) ||
    banked.exp.gt(0) ||
    banked.essence > 0 ||
    banked.bossTears > 0 ||
    banked.kills > 0 ||
    banked.equipmentDrops.length > 0 ||
    banked.usableDrops.length > 0
  );
}

/**
 * A `Decimal` as the save's `number`, never past what a double can hold.
 *
 * The wallet is a JSON number and gold outgrows one on a deep account, so the
 * clamp is the honest bound rather than a guard against the impossible. Past
 * `MAX_SAFE_INTEGER` a stored balance stops counting single coins anyway.
 */
function toNumber(value: Decimal): number {
  const asNumber = value.toNumber();
  return Number.isFinite(asNumber) ? Math.min(asNumber, Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
}
