import { describe, expect, it } from 'vitest';
import fixture from '../../content/__fixtures__/calendar.json';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { WEEKLY_TRACK_MILESTONES, weeklyTrackReward } from '../../content/weeklyTrack';
import { readSave } from '../save/v3';
import { migrateSave } from '../save/migrate';
import { toLegacyPayload } from '../save/legacyPayload';
import type { SaveV3 } from '../save/schema';
import { weeklyEventWeekFromLegacy } from '../character/fromSave';
import {
  applyDailyLogin,
  applyWeeklyRollover,
  claimWeeklyTrack,
  dayNumber,
  DAY_MS,
  readCalendar,
  weekNumber,
} from './calendar';

/**
 * The calendar, against the boundaries the shipped reducer was bisected for.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const OPTIONS = { nowMs: Date.UTC(2026, 0, 15, 12, 0, 0), content: CONTENT };
const BASE = Date.UTC(2026, 0, 15, 12, 0, 0);

function save(over: Record<string, unknown> = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 20 },
      wallet: { gold: 0, totalGold: 0, heroShards: 0, essence: 0 },
      ...over,
    },
    OPTIONS,
  );
}

describe('the two boundaries', () => {
  it('turns the day at midnight UTC', () => {
    const boundary = Date.parse(fixture.dayBoundary);
    expect(dayNumber(boundary)).toBe(dayNumber(boundary - 1) + 1);
    expect(new Date(boundary).toISOString()).toBe(fixture.dayBoundary);
  });

  it('turns the week on a Thursday at midnight UTC, because the epoch was one', () => {
    const boundary = Date.parse(fixture.weekBoundary);
    expect(weekNumber(boundary)).toBe(weekNumber(boundary - 1) + 1);
    expect(new Date(boundary).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })).toBe('Thursday');
  });
});

describe('the streak, day by day', () => {
  it('reproduces twelve days of the shipped curve', () => {
    let current = save();
    const rows = fixture.streak.map((_, index) => {
      const before = current;
      const outcome = applyDailyLogin(current, BASE + index * DAY_MS)!;
      current = outcome.save;
      return {
        day: index + 1,
        streak: outcome.streak,
        gold: current.wallet.gold - before.wallet.gold,
        shards: current.wallet.heroShards - before.wallet.heroShards,
        freeSummons: current.summon.freeCharges - before.summon.freeCharges,
        insurance: current.calendar.insuranceCharges,
      };
    });
    expect(rows).toEqual(fixture.streak);
  });

  it('refuses a second login the same day', () => {
    const first = applyDailyLogin(save(), BASE)!.save;
    expect(applyDailyLogin(first, BASE + 1)).toBeNull();
    expect(applyDailyLogin(first, BASE + DAY_MS)).not.toBeNull();
  });

  it('refuses an account that has not been created', () => {
    const blank = readSave({ version: 3, identity: { name: '', playerClass: null, created: false } }, OPTIONS);
    expect(applyDailyLogin(blank, BASE)).toBeNull();
  });
});

describe('a day missed', () => {
  const gapOf = (gapDays: number, insuranceBefore: number) => {
    const account = save({ calendar: { streak: 5, lastLoginDay: dayNumber(BASE), insuranceCharges: insuranceBefore } });
    const outcome = applyDailyLogin(account, BASE + gapDays * DAY_MS)!;
    return { streak: outcome.streak, insuranceAfter: outcome.save.calendar.insuranceCharges };
  };

  it('reproduces every gap the shipped reducer was measured on', () => {
    expect(fixture.gaps.map(row => gapOf(row.gapDays, row.insuranceBefore))).toEqual(
      fixture.gaps.map(row => ({ streak: row.streak, insuranceAfter: row.insuranceAfter })),
    );
  });

  it('covers exactly one missed day, and keeps the charge for anything longer', () => {
    /*
     * The whole design of the charge. A port spending it on any gap would make
     * the streak unbreakable, which is the opposite of what a streak is for.
     */
    expect(gapOf(2, 1)).toEqual({ streak: 6, insuranceAfter: 0 });
    expect(gapOf(3, 1)).toEqual({ streak: 1, insuranceAfter: 1 });
    expect(gapOf(9, 3)).toEqual({ streak: 1, insuranceAfter: 3 });
  });

  it('starts a first-ever login at one rather than treating day zero as yesterday', () => {
    // `lastLoginDay` is null for an account that never has, and reading that
    // as day zero would make the next login a gap of twenty thousand days.
    expect(applyDailyLogin(save(), BASE)!.streak).toBe(1);
  });
});

describe('the week turning over', () => {
  it('clears the week’s kills and its claimed track', () => {
    const settled = applyWeeklyRollover(save(), BASE)!.save;
    const dirty = { ...settled, calendar: { ...settled.calendar, weeklyKills: 400, trackClaimed: [25, 75] } };
    const rolled = applyWeeklyRollover(dirty, BASE + 14 * DAY_MS)!;
    expect(rolled.save.calendar).toMatchObject({ weeklyKills: 0, trackClaimed: [] });
    expect(rolled.week).toBe(weekNumber(BASE + 14 * DAY_MS));
  });

  it('does nothing inside the same week', () => {
    const settled = applyWeeklyRollover(save(), BASE)!.save;
    expect(applyWeeklyRollover(settled, BASE + 1)).toBeNull();
  });

  it('names the event the new week runs', () => {
    const rolled = applyWeeklyRollover(save(), BASE)!;
    expect(rolled.event.id).toBeTruthy();
    expect(rolled.save.calendar.weeklyEventWeek).toBe(rolled.week);
  });
});

describe('the weekly track', () => {
  const stocked = () => save({ calendar: { weeklyKills: 1_000 } });

  it('pays what the shipped claim paid, rung for rung', () => {
    expect(
      WEEKLY_TRACK_MILESTONES.map(milestone => {
        const before = stocked();
        const after = claimWeeklyTrack(before, milestone)!.save;
        return {
          milestone,
          gold: after.wallet.gold - before.wallet.gold,
          shards: after.wallet.heroShards - before.wallet.heroShards,
          essence: after.wallet.essence - before.wallet.essence,
        };
      }),
    ).toEqual(fixture.track);
  });

  it('stops paying more essence after the third rung', () => {
    // 1, 2, 4, 4 — the only reward here that does not climb.
    expect(WEEKLY_TRACK_MILESTONES.map(milestone => weeklyTrackReward(milestone).essence)).toEqual([1, 2, 4, 4]);
  });

  it('refuses one not reached, one already taken, and one nobody listed', () => {
    expect(claimWeeklyTrack(save({ calendar: { weeklyKills: 24 } }), 25)).toBeNull();
    const taken = claimWeeklyTrack(stocked(), 25)!.save;
    expect(claimWeeklyTrack(taken, 25)).toBeNull();
    expect(claimWeeklyTrack(stocked(), 26)).toBeNull();
  });
});

describe('the stored block', () => {
  it('reads the six v2 names off a flat bag and our own off a v3 save', () => {
    expect(
      readCalendar(
        {
          dailyLoginStreak: 4,
          lastDailyLoginDay: 20_000,
          streakInsuranceCharges: 2,
          weeklyEventWeek: 2_900,
          weeklyKills: 88,
          weeklyTrackClaimed: [75, 25, 75],
        },
        true,
      ),
    ).toEqual({
      streak: 4,
      lastLoginDay: 20_000,
      insuranceCharges: 2,
      weeklyEventWeek: 2_900,
      weeklyKills: 88,
      // Sorted and de-duplicated, as every claimed list in this save is.
      trackClaimed: [25, 75],
    });
    expect(readCalendar({ streak: 4, lastLoginDay: 20_000 })).toMatchObject({ streak: 4, lastLoginDay: 20_000 });
  });

  it('keeps null apart from zero for an account that never logged in', () => {
    expect(readCalendar({}).lastLoginDay).toBeNull();
    expect(readCalendar({ lastLoginDay: 0 }).lastLoginDay).toBe(0);
  });

  it('drops a rung that is not a rung, and caps the charges', () => {
    expect(readCalendar({ trackClaimed: [25, 26, 999] }).trackClaimed).toEqual([25]);
    expect(readCalendar({ insuranceCharges: 99 }).insuranceCharges).toBe(3);
  });
});

describe('every reader of the week, after a migration', () => {
  it('agrees, because none of them is still looking in the legacy bag', () => {
    /*
     * The regression the VIP claim taught: claiming a key **removes it**, so
     * a reader left pointing at `legacy` answers its default for every
     * migrated account. `weeklyEventWeek` picks which of the eight events
     * multiplies the gold and EXP chains, so a default there is a silent
     * balance change.
     */
    const migrated = migrateSave({ saveVersion: 2, weeklyEventWeek: 2_900, weeklyKills: 88 }, OPTIONS);
    expect(migrated.legacy.weeklyEventWeek).toBeUndefined();
    expect(migrated.calendar.weeklyEventWeek).toBe(2_900);
    expect(weeklyEventWeekFromLegacy(migrated)).toBe(2_900);
  });

  it('writes the six keys back out for the shipped game to read', () => {
    const migrated = migrateSave(
      { saveVersion: 2, dailyLoginStreak: 4, lastDailyLoginDay: 20_000, weeklyTrackClaimed: [25] },
      OPTIONS,
    );
    const payload = toLegacyPayload(migrated);
    expect({
      dailyLoginStreak: payload.dailyLoginStreak,
      lastDailyLoginDay: payload.lastDailyLoginDay,
      streakInsuranceCharges: payload.streakInsuranceCharges,
      weeklyKills: payload.weeklyKills,
      weeklyTrackClaimed: payload.weeklyTrackClaimed,
    }).toEqual({
      dailyLoginStreak: 4,
      lastDailyLoginDay: 20_000,
      streakInsuranceCharges: 0,
      weeklyKills: 0,
      weeklyTrackClaimed: [25],
    });
  });
});
