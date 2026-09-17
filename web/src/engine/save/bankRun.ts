import type Decimal from 'break_eternity.js';
import type { BankedRun } from '../combat/rewards';
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
 */
export function bankRun(save: SaveV3, banked: BankedRun): SaveV3 {
  const gold = toNumber(banked.gold);
  return {
    ...save,
    wallet: {
      ...save.wallet,
      gold: save.wallet.gold + gold,
      totalGold: save.wallet.totalGold + gold,
      essence: save.wallet.essence + banked.essence,
      bossTears: save.wallet.bossTears + banked.bossTears,
    },
  };
}

/** Whether there is anything to move. Saves a render for a run that idled. */
export function worthBanking(banked: BankedRun): boolean {
  return banked.gold.gt(0) || banked.essence > 0 || banked.bossTears > 0;
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
