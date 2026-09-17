/**
 * VIP, as ten rungs and what each pays.
 *
 * The shipped game earns VIP points two ways: ten for recording a hero's lore
 * in the codex, ten for recording their unique weapon, and a hundredth of a
 * cent-price for a simulated dollar purchase. The third is switched off —
 * `ENABLE_SIMULATED_DOLLAR_PURCHASES` is `false` and the button renders
 * disabled — which leaves the codex as the only source in the game.
 *
 * That has a consequence the shipped tables do not state, and
 * `__tests__/shopsFixture.test.ts` measures it: 65 heroes means 130 claims
 * worth 1,300 points, and **VIP 5 costs 1,500**. So four of these ten rungs
 * are reachable by playing and six are reachable by nothing at all.
 *
 * They are all listed anyway, for the same reason the unavailable automations
 * are: a screen that showed four would be telling the player this game has
 * four. The rewrite's answer to the ceiling is not to delete the rungs — it is
 * that a later phase adds a second way to earn points, and the table above it
 * does not have to change when it does.
 */

/** Points needed for each level, indexed by level. Ten rungs plus a zero. */
export const VIP_LEVEL_THRESHOLDS: readonly number[] = [0, 50, 150, 350, 700, 1500, 3000, 6500, 15000, 35000, 100000];

export const MAX_VIP_LEVEL = VIP_LEVEL_THRESHOLDS.length - 1;

/** What one codex entry is worth, either kind. */
export const CODEX_VIP_POINTS = 10;

export interface VipMilestone {
  level: number;
  diamonds: number;
  gold: number;
  shards: number;
  essence: number;
}

export const VIP_MILESTONES: readonly VipMilestone[] = [
  { level: 1, diamonds: 50, gold: 1_200, shards: 50, essence: 0 },
  { level: 2, diamonds: 100, gold: 2_800, shards: 90, essence: 1 },
  { level: 3, diamonds: 180, gold: 5_200, shards: 140, essence: 1 },
  { level: 4, diamonds: 300, gold: 9_200, shards: 220, essence: 2 },
  { level: 5, diamonds: 500, gold: 16_000, shards: 340, essence: 3 },
  { level: 6, diamonds: 800, gold: 30_000, shards: 500, essence: 4 },
  { level: 7, diamonds: 1_250, gold: 52_000, shards: 760, essence: 6 },
  { level: 8, diamonds: 2_000, gold: 90_000, shards: 1_100, essence: 9 },
  { level: 9, diamonds: 3_200, gold: 145_000, shards: 1_550, essence: 13 },
  { level: 10, diamonds: 5_000, gold: 220_000, shards: 2_200, essence: 20 },
];

export function vipMilestone(level: number): VipMilestone | null {
  return VIP_MILESTONES.find(milestone => milestone.level === level) ?? null;
}

/**
 * The level a point total buys, counted from the top.
 *
 * Counted downward rather than upward on purpose: the thresholds are the
 * shipped ones and a total above the last rung has to answer 10 rather than
 * running off the end of the table.
 */
export function vipLevelFromPoints(points: number): number {
  const safe = Math.max(0, Math.floor(points));
  for (let level = MAX_VIP_LEVEL; level >= 1; level--) {
    if (safe >= VIP_LEVEL_THRESHOLDS[level]) return level;
  }
  return 0;
}

/** Points still owed for the next rung, or null at the top. */
export function pointsToNextVipLevel(points: number): number | null {
  const level = vipLevelFromPoints(points);
  if (level >= MAX_VIP_LEVEL) return null;
  return VIP_LEVEL_THRESHOLDS[level + 1] - Math.max(0, Math.floor(points));
}
