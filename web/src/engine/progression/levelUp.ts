import { expForLevel, HERO_LEVEL_CAP, STAT_POINTS_PER_LEVEL } from '../save/migrate';

/**
 * Levelling, for the player and for the heroes who fight beside them.
 *
 * Two of the rewrite's core progressions, and **neither of them happened**.
 * The player's level feeds the damage chain, the health chain and every unlock
 * gate, and nothing converted the EXP a run earned into it. Heroes levelled
 * only when the player paid gold, though the shipped game gives every fielded
 * hero a level on every kill.
 *
 * Both were measured before this existed. `__tests__/killRewardFixture.test.ts`
 * records a boss kill taking the player from level 1 to 3 on 212 EXP and
 * paying ten stat points for it, and records that a kill levels the *fielded*
 * heroes and stops them at 999.
 */

export interface LevelGain {
  level: number;
  /** What is left over towards the next level. */
  exp: number;
  gainedLevels: number;
  /** Five a level, and the player chooses where they go. */
  statPoints: number;
}

/**
 * Spend EXP on levels until it will not buy another.
 *
 * A loop rather than a closed form, and that is the shipped shape: each level
 * has its own price from `expForLevel`, the remainder carries, and a single
 * lump of EXP can buy several levels at once — which is what an offline window
 * or a deep boss hands over.
 *
 * `expForLevel` grows sixteen percent a level, so even an absurd lump runs out
 * of levels quickly. A price of zero would not, so the loop stops on one
 * rather than spinning: the shipped `while (remaining >= expForLevel(lvl))`
 * has no such guard and would hang on a curve that ever returned zero.
 */
export function applyExp(level: number, exp: number, gained: number): LevelGain {
  let remaining = Math.max(0, exp) + Math.max(0, gained);
  let next = Math.max(1, Math.floor(level));
  let gainedLevels = 0;

  for (;;) {
    const price = expForLevel(next);
    if (!(price > 0) || remaining < price) break;
    remaining -= price;
    next += 1;
    gainedLevels += 1;
  }

  return { level: next, exp: remaining, gainedLevels, statPoints: gainedLevels * STAT_POINTS_PER_LEVEL };
}

/**
 * A hero's level after fighting through `kills` of them.
 *
 * One a kill, capped — so a hero two short of the ceiling gains two from a
 * hundred kills rather than a hundred. Only the *fielded* gain anything, which
 * is the caller's to decide: this answers for one hero who was there.
 */
export function heroLevelAfter(level: number, kills: number): number {
  return Math.min(HERO_LEVEL_CAP, Math.max(1, Math.floor(level)) + Math.max(0, Math.floor(kills)));
}

export { HERO_LEVEL_CAP, STAT_POINTS_PER_LEVEL };
