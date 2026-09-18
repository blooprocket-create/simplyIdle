import { WEEKLY_TRACK_MILESTONES, weeklyTrackReward } from '../content/weeklyTrack';
import { weeklyEventByWeek, type WeeklyEvent } from '../content/weeklyEvents';
import {
  applyDailyLogin,
  applyWeeklyRollover,
  claimWeeklyTrack,
  type DailyLoginOutcome,
  type TrackClaim,
} from '../engine/progression/calendar';
import type { SaveV3 } from '../engine/save/schema';

/**
 * The calendar verbs.
 *
 * Two of the three are not verbs the player presses: the daily login and the
 * weekly rollover happen *to* an account when it is opened. Both answer null
 * when nothing was due, which is what lets the shell call them
 * unconditionally instead of doing the date arithmetic itself.
 *
 * **They write disjoint fields, so the order between them is free.** The login
 * moves the streak, the last-login day, the insurance charges, the wallet and
 * the free summons; the rollover moves the week number, the week's kills and
 * the claimed track. That is worth stating because it is not obvious and
 * because it is the kind of property a later change quietly breaks — a
 * rollover that granted something, or a login measured on the week, would make
 * the order matter without anybody noticing. `calendarActions.test.ts` pins it
 * by running both orders and comparing.
 */

export interface OpenedOutcome {
  save: SaveV3;
  /** What the login paid, or null when it was already claimed today. */
  login: DailyLoginOutcome | null;
  /** The event the new week runs, or null inside the same week. */
  newWeek: WeeklyEvent | null;
}

/**
 * Everything that happens because an account was opened.
 *
 * The rollover is applied first, which reads as significant and is not: see
 * the note above. It is first because the week is the larger unit, and the
 * test that says so is the one that would fail if it stopped being free.
 */
export function opened(save: SaveV3, nowMs: number): OpenedOutcome {
  const rolled = applyWeeklyRollover(save, nowMs);
  const afterWeek = rolled?.save ?? save;
  const login = applyDailyLogin(afterWeek, nowMs);
  return { save: login?.save ?? afterWeek, login, newWeek: rolled?.event ?? null };
}

export interface TrackRung {
  milestone: number;
  reward: ReturnType<typeof weeklyTrackReward>;
  claimed: boolean;
  claimable: boolean;
  /** Nought to one, clamped, for the meter. */
  fraction: number;
}

/** The four rungs and where the week stands on each. */
export function weeklyTrack(save: SaveV3): TrackRung[] {
  return WEEKLY_TRACK_MILESTONES.map(milestone => {
    const claimed = save.calendar.trackClaimed.includes(milestone);
    return {
      milestone,
      reward: weeklyTrackReward(milestone),
      claimed,
      claimable: !claimed && save.calendar.weeklyKills >= milestone,
      fraction: Math.min(1, Math.max(0, save.calendar.weeklyKills / milestone)),
    };
  });
}

/** Which of the eight events this account's week is running. */
export function currentEvent(save: SaveV3): WeeklyEvent {
  return weeklyEventByWeek(save.calendar.weeklyEventWeek);
}

export function claimTrack(save: SaveV3, milestone: number): TrackClaim | null {
  return claimWeeklyTrack(save, milestone);
}

/** How many rungs would pay out right now. */
export function claimableRungs(save: SaveV3): number {
  return weeklyTrack(save).filter(rung => rung.claimable).length;
}
