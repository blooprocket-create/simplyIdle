/**
 * The weekly track: four milestones on the week's kill count.
 *
 * Measured in `__tests__/calendarFixture.test.ts` rather than read, because
 * the rewards are computed from the milestone rather than tabled — gold and
 * shards are linear in it and essence is not.
 *
 * **The top rung pays no more essence than the third.** 260 kills costs a
 * hundred and ten more than 150 and hands over the same 4; gold and shards
 * still climb, so it is not a dead rung, but it is the only reward here that
 * stops. Ported as measured.
 */

export const WEEKLY_TRACK_MILESTONES: readonly number[] = [25, 75, 150, 260];

export interface WeeklyTrackReward {
  gold: number;
  shards: number;
  essence: number;
}

export function weeklyTrackReward(milestone: number): WeeklyTrackReward {
  return {
    gold: 220 + milestone * 12,
    shards: 18 + Math.floor(milestone * 1.8),
    essence: milestone >= 150 ? 4 : milestone >= 75 ? 2 : 1,
  };
}

export function isWeeklyTrackMilestone(milestone: number): boolean {
  return WEEKLY_TRACK_MILESTONES.includes(milestone);
}
