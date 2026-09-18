import { getUsableItem } from '../../content/usableItems';

/**
 * Which potion a team in trouble reaches for.
 *
 * Two comparisons against one ratio, and that is the whole design: below the
 * threshold it drinks, and below `threshold x PREFER_GRAND_BELOW` it reaches
 * for the grand potion rather than the small one. Reading the threshold in
 * both places would spend a grand on the first sip, every time — and would
 * still pass every test about *when* it drinks, which is why
 * `__tests__/autoPotionFixture.test.ts` injects exactly that.
 *
 * Pure, and separate from the loop that calls it, for the reason the whole
 * engine is: the trigger lives in the fight, the bag lives in the save, and
 * the rule that joins them should be answerable without either.
 */

/** Below this share of the team's maximum, a potion is drunk. */
export const AUTO_POTION_THRESHOLD = 0.35;

/** And below this share *of the threshold*, the grand one instead. */
export const PREFER_GRAND_BELOW = 0.6;

export const SMALL_POTION = 'small_potion';
export const GRAND_POTION = 'grand_potion';

export interface PotionChoice {
  /** The team's health as a share of its maximum, after the step's damage. */
  hpRatio: number;
  /** How many of each potion is held. */
  held: Readonly<Record<string, number>>;
  /** The player's setting. Defaulted rather than assumed. */
  threshold?: number;
}

/**
 * The id to drink, or null.
 *
 * Null covers three different situations on purpose — healthy, switched off
 * upstream, and an empty bag — because the caller does the same thing in all
 * three, and a caller that had to tell them apart would be a caller deciding
 * the rule for itself.
 *
 * The boundary is **inclusive**: a team at exactly the threshold drinks. Pinned
 * by probing the exact ratio a step lands on, because a case started at 35%
 * never reaches the rule at 35% — the monster's damage is dealt first.
 */
export function choosePotion(choice: PotionChoice): string | null {
  const threshold = choice.threshold ?? AUTO_POTION_THRESHOLD;
  if (!(choice.hpRatio <= threshold)) return null;

  const grand = choice.held[GRAND_POTION] ?? 0;
  const small = choice.held[SMALL_POTION] ?? 0;
  const preferGrand = choice.hpRatio <= threshold * PREFER_GRAND_BELOW;

  // Second choice rather than nothing: a team at 10% holding only smalls
  // drinks a small, and a team at 30% holding only grands drinks a grand.
  const order = preferGrand ? [GRAND_POTION, SMALL_POTION] : [SMALL_POTION, GRAND_POTION];
  const counts: Record<string, number> = { [GRAND_POTION]: grand, [SMALL_POTION]: small };
  return order.find(id => counts[id] > 0) ?? null;
}

/**
 * What that potion restores, as a share of the team's maximum.
 *
 * A share and not an amount, because that is what the item promises and what
 * `Simulation.heal` takes. The shipped rule computes the points instead —
 * `ceil(teamMaxHp * value)` — which is the same number wherever the maximum is
 * whole, and this is the side of it that survives a `Decimal` health bar.
 */
export function potionHealFraction(itemId: string): number {
  const item = getUsableItem(itemId);
  if (item === null || item.effect !== 'heal_team_percent') return 0;
  return item.value;
}
