import { RARITY_IDS, type Rarity } from '../../content/rarities';
import type { SaveContent, SaveV3, SavedHero } from '../save/schema';
import { fieldTeam } from './rosterSave';

/**
 * "Field my best heroes."
 *
 * A **verb**, and that is the finding rather than a detail. The automation
 * catalogue carried this as `equipBest`, the ninth of nine shipped `auto*`
 * flags, keyed to `autoEquipBestHeroes` — and there is no such flag. That name
 * belongs to a `useCallback` dispatching a one-shot action from a button; the
 * shipped state has eight `auto*Enabled` booleans and this is not one of them.
 * Enumerated in `__tests__/bestTeamFixture.test.ts` rather than argued.
 *
 * So it never belonged among the automatic things, and every note since Phase
 * 4 saying "no rule has been ported or measured" was looking for a rule in the
 * wrong shape.
 *
 * The sort only **proposes**. `fieldTeam` decides who fits, and it refuses a
 * second copy of the same hero, a third hero in a rank and anyone past the
 * slots the account has bought — so the third-best hero in the game can be
 * passed over for the worst one with four slots still empty.
 */

/**
 * How close two rebirth multipliers have to be to count as equal.
 *
 * The shipped comparison is `Math.abs(diff) > 0.0001`, so 1.00005 and 1 tie
 * and the level below them decides. A port comparing them directly swaps those
 * two heroes — which is the kind of difference nobody would ever notice and
 * the fixture injects anyway.
 */
export const REBIRTH_MULT_EPSILON = 0.0001;

function rarityRank(rarity: Rarity): number {
  return RARITY_IDS.indexOf(rarity);
}

/** Best first: rarity, then the rebirth multiplier, then level, then boost. */
export function byStrength(left: SavedHero, right: SavedHero): number {
  const rarity = rarityRank(right.rarity) - rarityRank(left.rarity);
  if (rarity !== 0) return rarity;

  const rebirth = right.rebirthStatMult - left.rebirthStatMult;
  if (Math.abs(rebirth) > REBIRTH_MULT_EPSILON) return rebirth;

  if (right.level !== left.level) return right.level - left.level;
  return right.teamBoost - left.teamBoost;
}

/** The order this roster would be offered in. Exported so a screen can show it. */
export function strongestFirst(save: SaveV3): SavedHero[] {
  return [...save.roster.heroes].sort(byStrength);
}

/**
 * Field them. Null when the team it arrives at is the one already fielded,
 * which is the same answer `fieldTeam` gives and what lets a button grey out.
 */
export function fieldBestHeroes(save: SaveV3, content: SaveContent): SaveV3 | null {
  return fieldTeam(
    save,
    content,
    strongestFirst(save).map(hero => hero.uid),
  );
}
