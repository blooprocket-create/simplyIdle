import { getActForWave } from '../../content/acts';
import { isBossWave } from '../../content/monsters';

/**
 * What a kill pays that is not gold or EXP.
 *
 * `rewards.ts` has earned gold and EXP since Phase 8 and said so: "not the
 * other seven currencies". This is those — or the four of them a kill can
 * produce. The rest are spent rather than earned, or come from elsewhere.
 *
 * Every one of them has a **condition**, which is why a port earning only gold
 * looked plausible for five phases: a plain kill really does pay nothing but
 * gold, EXP, season points and mastery. Essence and tears need a boss or a
 * chest, and neither shows up in the first nine waves of a new game.
 *
 * Randomness is an argument, as everywhere else in this engine — the chest
 * roll is the only one here, and a `Math.random()` reached for directly would
 * make the away estimator and the live loop disagree about a wave they both
 * modelled.
 */

/** A kill is worth this many season points; a boss is worth the sum of both. */
export const SEASON_POINTS_PER_KILL = 12;
export const SEASON_POINTS_PER_BOSS = 80;

/** Class mastery, which is a flat 2 a kill and 8 a boss rather than 2 + 8. */
export const MASTERY_XP_PER_KILL = 2;
export const MASTERY_XP_PER_BOSS = 8;

/** Waves per campaign chapter, and which stage of one carries a chest. */
export const CAMPAIGN_STAGE_CYCLE = 20;
export const CHEST_NODE_EVERY = 5;
/** `random() < this`. Strictly less: exactly a half is a miss. */
export const CHEST_TEAR_CHANCE = 0.5;

/** No boss pays less than this, however shallow the act. */
export const MIN_BOSS_ESSENCE = 2;

export interface KillPayout {
  essence: number;
  bossTears: number;
  seasonPoints: number;
  masteryXp: number;
}

/** Which stage of the twenty-wave chapter this is. One-based. */
export function campaignStage(wave: number): number {
  return ((Math.max(1, Math.floor(wave)) - 1) % CAMPAIGN_STAGE_CYCLE) + 1;
}

/**
 * Whether this wave carries a chest.
 *
 * Stages five and fifteen of each chapter — a stage divisible by five that is
 * **not** a boss. Ten and twenty divide by five too and take the boss branch
 * instead, so a port reading only "every fifth stage" would pay a boss its
 * tear twice.
 */
export function isChestNode(wave: number): boolean {
  return !isBossWave(wave) && campaignStage(wave) % CHEST_NODE_EVERY === 0;
}

/**
 * The essence a boss pays.
 *
 * `max(2, act + floor(wave / 20))`, and both terms are live: the act alone
 * would pay the same at wave 20 and wave 39, and the wave term alone would pay
 * nothing for the first act's boss. The floor covers wave 10, where the act is
 * 1 and the wave term is 0.
 */
export function bossEssence(wave: number): number {
  const safeWave = Math.max(1, Math.floor(wave));
  return Math.max(MIN_BOSS_ESSENCE, getActForWave(safeWave).id + Math.floor(safeWave / CAMPAIGN_STAGE_CYCLE));
}

/**
 * Everything one kill at `wave` pays besides gold and EXP.
 *
 * The chest roll is drawn **only on a chest node**, which matters beyond
 * tidiness: a port that drew unconditionally and then discarded the result
 * would advance a seeded generator on waves the shipped game leaves it alone,
 * and every roll after the first chest would differ.
 */
export function killPayout(wave: number, random: () => number): KillPayout {
  const boss = isBossWave(wave);
  const chest = !boss && isChestNode(wave) && random() < CHEST_TEAR_CHANCE;
  return {
    essence: boss ? bossEssence(wave) : 0,
    bossTears: (boss ? 1 : 0) + (chest ? 1 : 0),
    seasonPoints: SEASON_POINTS_PER_KILL + (boss ? SEASON_POINTS_PER_BOSS : 0),
    masteryXp: boss ? MASTERY_XP_PER_BOSS : MASTERY_XP_PER_KILL,
  };
}

export const EMPTY_PAYOUT: KillPayout = { essence: 0, bossTears: 0, seasonPoints: 0, masteryXp: 0 };

/** Two payouts, added. What a run accumulates across its kills. */
export function addPayout(into: KillPayout, next: KillPayout): KillPayout {
  return {
    essence: into.essence + next.essence,
    bossTears: into.bossTears + next.bossTears,
    seasonPoints: into.seasonPoints + next.seasonPoints,
    masteryXp: into.masteryXp + next.masteryXp,
  };
}
