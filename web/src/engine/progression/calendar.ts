import { DEFAULT_WEEKLY_EVENT_WEEK, weeklyEventByWeek, type WeeklyEvent } from '../../content/weeklyEvents';
import { isWeeklyTrackMilestone, weeklyTrackReward } from '../../content/weeklyTrack';
import { boundedInt, boundedIntList, isRecord, SAFE_NUMBER_CAP } from '../save/guards';
import type { SaveV3 } from '../save/schema';

/**
 * The calendar: what a day turning over, and a week turning over, do.
 *
 * Both boundaries were **found by bisection** against the shipped reducer
 * rather than derived from a divisor, because the divisor is not the question:
 * a port flooring a local timestamp instead of a UTC one keeps every divisor
 * and is wrong by up to thirteen hours. See `__tests__/calendarFixture.test.ts`.
 *
 * `nowMs` is an argument here for the reason it is everywhere in this engine,
 * and unusually the shipped actions already take it that way too.
 */

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;

/** Whole UTC days since the epoch. */
export function dayNumber(nowMs: number): number {
  return Math.floor(nowMs / DAY_MS);
}

/**
 * Whole weeks since the epoch.
 *
 * Which means the game's week starts **Thursday at midnight UTC**, because
 * 1 January 1970 was a Thursday. Nobody wrote that down — it falls out of the
 * divisor — and it is exactly the sort of thing a rewrite silently moves to
 * Monday.
 */
export function weekNumber(nowMs: number): number {
  return Math.floor(nowMs / WEEK_MS);
}

/** How long a streak may keep raising the reward. */
export const STREAK_REWARD_CAP = 10;
/** One free summon every third day, one insurance charge every seventh. */
export const FREE_SUMMON_EVERY = 3;
export const INSURANCE_EVERY = 7;
export const MAX_INSURANCE_CHARGES = 3;
/** Bounds on what a stored save may claim. Generous, and finite. */
export const MAX_STREAK = 100_000;
export const MAX_WEEK_NUMBER = 1_000_000;

export interface DailyLoginOutcome {
  save: SaveV3;
  streak: number;
  gold: number;
  shards: number;
  freeSummons: number;
  /** Whether a held charge was spent to save the streak. */
  insuranceUsed: boolean;
}

/**
 * The daily login.
 *
 * Null on a second login the same day, which is what lets the shell call this
 * on every load without checking first.
 *
 * The **insurance charge covers a gap of exactly one missed day**, and is kept
 * rather than spent on anything longer. A port that spent it on any gap would
 * make the streak quietly unbreakable, which is the opposite of what a streak
 * is for.
 */
export function applyDailyLogin(save: SaveV3, nowMs: number): DailyLoginOutcome | null {
  if (!save.identity.created) return null;
  const today = dayNumber(nowMs);
  if (save.calendar.lastLoginDay === today) return null;

  const since = save.calendar.lastLoginDay === null ? null : today - save.calendar.lastLoginDay;
  const insuranceUsed = since === 2 && save.calendar.insuranceCharges > 0;
  const streak = since === 1 || insuranceUsed ? save.calendar.streak + 1 : 1;

  // Capped at the tenth day: `min(9, streak - 1)`, so day eleven pays what day
  // ten did. Measured over twelve days, because a ten-day table is green with
  // the cap deleted.
  const steps = Math.min(STREAK_REWARD_CAP - 1, streak - 1);
  const gold = 250 + steps * 80;
  const shards = 20 + steps * 6;
  const freeSummons = streak % FREE_SUMMON_EVERY === 0 ? 1 : 0;
  const earned = streak % INSURANCE_EVERY === 0 ? 1 : 0;

  return {
    streak,
    gold,
    shards,
    freeSummons,
    insuranceUsed,
    save: {
      ...save,
      calendar: {
        ...save.calendar,
        streak,
        lastLoginDay: today,
        insuranceCharges: Math.min(
          MAX_INSURANCE_CHARGES,
          save.calendar.insuranceCharges - (insuranceUsed ? 1 : 0) + earned,
        ),
      },
      wallet: {
        ...save.wallet,
        gold: save.wallet.gold + gold,
        totalGold: save.wallet.totalGold + gold,
        heroShards: save.wallet.heroShards + shards,
      },
      summon: { ...save.summon, freeCharges: save.summon.freeCharges + freeSummons },
    },
  };
}

export interface RolloverOutcome {
  save: SaveV3;
  week: number;
  event: WeeklyEvent;
}

/**
 * The week turning over.
 *
 * Null inside the same week. It clears the week's kills and its claimed
 * milestones, which is the whole of what makes the track weekly — and is why
 * the shell calls it before anything reads either.
 */
export function applyWeeklyRollover(save: SaveV3, nowMs: number): RolloverOutcome | null {
  if (!save.identity.created) return null;
  const week = weekNumber(nowMs);
  if (week === save.calendar.weeklyEventWeek) return null;
  return {
    week,
    event: weeklyEventByWeek(week),
    save: { ...save, calendar: { ...save.calendar, weeklyEventWeek: week, weeklyKills: 0, trackClaimed: [] } },
  };
}

export interface TrackClaim {
  save: SaveV3;
  milestone: number;
  reward: ReturnType<typeof weeklyTrackReward>;
}

/** Collect one rung of the weekly track. Null when it is not a rung, not */
/** reached, or already taken — one answer, because a button only needs one. */
export function claimWeeklyTrack(save: SaveV3, milestone: number): TrackClaim | null {
  if (!isWeeklyTrackMilestone(milestone)) return null;
  if (save.calendar.trackClaimed.includes(milestone)) return null;
  if (save.calendar.weeklyKills < milestone) return null;

  const reward = weeklyTrackReward(milestone);
  return {
    milestone,
    reward,
    save: {
      ...save,
      calendar: {
        ...save.calendar,
        trackClaimed: [...save.calendar.trackClaimed, milestone].sort((left, right) => left - right),
      },
      wallet: {
        ...save.wallet,
        gold: save.wallet.gold + reward.gold,
        totalGold: save.wallet.totalGold + reward.gold,
        heroShards: save.wallet.heroShards + reward.shards,
        essence: save.wallet.essence + reward.essence,
      },
    },
  };
}

export interface SavedCalendar {
  streak: number;
  /** Whole UTC days since the epoch, or null for an account that never has. */
  lastLoginDay: number | null;
  insuranceCharges: number;
  weeklyEventWeek: number;
  weeklyKills: number;
  trackClaimed: number[];
}

export function emptyCalendar(): SavedCalendar {
  return {
    streak: 0,
    lastLoginDay: null,
    insuranceCharges: 0,
    weeklyEventWeek: DEFAULT_WEEKLY_EVENT_WEEK,
    weeklyKills: 0,
    trackClaimed: [],
  };
}

/**
 * The calendar block, read out of a save.
 *
 * Both spellings, for the reason `readMissions` takes both: a v2 bag calls
 * these six things by their shipped names and a v3 save calls them by ours.
 */
export function readCalendar(raw: unknown, legacy = false): SavedCalendar {
  if (!isRecord(raw)) return emptyCalendar();
  const field = (ours: string, theirs: string) => (legacy ? raw[theirs] : raw[ours]);
  const lastDay = field('lastLoginDay', 'lastDailyLoginDay');
  return {
    streak: boundedInt(field('streak', 'dailyLoginStreak'), 0, MAX_STREAK, 0),
    // Null is meaningful and zero is not: an account that has never logged in
    // has no last day, and reading that as day zero would make its next login
    // a gap of twenty thousand days rather than a first one.
    lastLoginDay: typeof lastDay === 'number' && Number.isFinite(lastDay) ? Math.floor(lastDay) : null,
    insuranceCharges: boundedInt(field('insuranceCharges', 'streakInsuranceCharges'), 0, MAX_INSURANCE_CHARGES, 0),
    weeklyEventWeek: boundedInt(
      field('weeklyEventWeek', 'weeklyEventWeek'),
      0,
      MAX_WEEK_NUMBER,
      DEFAULT_WEEKLY_EVENT_WEEK,
    ),
    weeklyKills: boundedInt(field('weeklyKills', 'weeklyKills'), 0, SAFE_NUMBER_CAP, 0),
    trackClaimed: [...new Set(boundedIntList(field('trackClaimed', 'weeklyTrackClaimed'), 16))]
      .filter(isWeeklyTrackMilestone)
      .sort((left, right) => left - right),
  };
}

/** Back out to the six keys the shipped game reads. */
export function calendarToLegacy(calendar: SavedCalendar): Record<string, unknown> {
  return {
    dailyLoginStreak: calendar.streak,
    lastDailyLoginDay: calendar.lastLoginDay,
    streakInsuranceCharges: calendar.insuranceCharges,
    weeklyEventWeek: calendar.weeklyEventWeek,
    weeklyKills: calendar.weeklyKills,
    weeklyTrackClaimed: [...calendar.trackClaimed],
  };
}
