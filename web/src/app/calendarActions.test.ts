import { describe, expect, it } from 'vitest';
import { heroTemplatesById } from '../content/heroes';
import { equipmentTemplatesById } from '../content/equipment';
import { WEEKLY_TRACK_MILESTONES } from '../content/weeklyTrack';
import { applyDailyLogin, applyWeeklyRollover, DAY_MS, dayNumber, weekNumber } from '../engine/progression/calendar';
import { readSave } from '../engine/save/v3';
import type { SaveV3 } from '../engine/save/schema';
import { claimableRungs, claimTrack, currentEvent, opened, weeklyTrack } from './calendarActions';

/**
 * Opening an account, and the order the two things that happen do.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const BASE = Date.UTC(2026, 0, 15, 12, 0, 0);
const OPTIONS = { nowMs: BASE, content: CONTENT };

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

describe('opening an account', () => {
  it('pays the day’s login and names a new week', () => {
    const outcome = opened(save(), BASE);
    expect(outcome.login?.streak).toBe(1);
    expect(outcome.newWeek).not.toBeNull();
    expect(outcome.save.wallet.gold).toBe(250);
  });

  it('does nothing the second time in the same day and week', () => {
    const once = opened(save(), BASE);
    const twice = opened(once.save, BASE + 60_000);
    expect({ login: twice.login, newWeek: twice.newWeek }).toEqual({ login: null, newWeek: null });
    expect(twice.save).toBe(once.save);
  });

  it('does both when both are due, and clears the week while paying the day', () => {
    // An account mid-week with two rungs taken, opened a fortnight later:
    // empty track, new week, and the streak paid and restarted.
    const settled = opened(save(), BASE).save;
    const midWeek = {
      ...settled,
      calendar: { ...settled.calendar, weeklyKills: 400, trackClaimed: [...WEEKLY_TRACK_MILESTONES.slice(0, 2)] },
    };

    const later = opened(midWeek, BASE + 14 * DAY_MS);
    expect(later.save.calendar).toMatchObject({ weeklyKills: 0, trackClaimed: [] });
    expect(later.login?.streak).toBe(1);
    expect(later.save.calendar.weeklyEventWeek).toBe(weekNumber(BASE + 14 * DAY_MS));
    expect(later.save.calendar.lastLoginDay).toBe(dayNumber(BASE + 14 * DAY_MS));
  });

  it('gets the same account either way round, because the two write disjoint fields', () => {
    /*
     * This started as a test that the rollover *must* go first, on the
     * reasoning that it clears a track the login would otherwise have moved.
     * That reasoning was wrong: the login writes the streak, the last-login
     * day, the insurance charges, the wallet and the free summons, and the
     * rollover writes the week number, the week's kills and the claimed track.
     * Nothing overlaps, and an injection swapping the order passed every
     * assertion — which is how the mistake surfaced.
     *
     * So the real property is independence, and this is what pins it. The day
     * someone makes a rollover grant something, or a login read the week, this
     * fails rather than the order silently starting to matter.
     */
    const settled = opened(save(), BASE).save;
    const midWeek = {
      ...settled,
      calendar: { ...settled.calendar, weeklyKills: 400, trackClaimed: [...WEEKLY_TRACK_MILESTONES.slice(0, 2)] },
    };
    const at = BASE + 14 * DAY_MS;

    const weekFirst = applyDailyLogin(applyWeeklyRollover(midWeek, at)!.save, at)!.save;
    const dayFirst = applyWeeklyRollover(applyDailyLogin(midWeek, at)!.save, at)!.save;
    expect(dayFirst).toEqual(weekFirst);
    expect(opened(midWeek, at).save).toEqual(weekFirst);
  });

  it('leaves an uncreated account alone entirely', () => {
    const blank = readSave({ version: 3, identity: { name: '', playerClass: null, created: false } }, OPTIONS);
    const outcome = opened(blank, BASE);
    expect({ login: outcome.login, newWeek: outcome.newWeek }).toEqual({ login: null, newWeek: null });
    expect(outcome.save).toBe(blank);
  });
});

describe('the track a screen draws', () => {
  it('shows four rungs with a fraction each, clamped at done', () => {
    const rungs = weeklyTrack(save({ calendar: { weeklyKills: 75 } }));
    expect(rungs.map(rung => rung.milestone)).toEqual([25, 75, 150, 260]);
    expect(rungs.map(rung => rung.fraction)).toEqual([1, 1, 0.5, 75 / 260]);
  });

  it('counts what is ready, and stops counting one once it is taken', () => {
    const account = save({ calendar: { weeklyKills: 100 } });
    expect(claimableRungs(account)).toBe(2);
    expect(claimableRungs(claimTrack(account, 25)!.save)).toBe(1);
  });

  it('names the event the account’s week is running', () => {
    expect(currentEvent(save({ calendar: { weeklyEventWeek: 0 } })).name).toBeTruthy();
    // Eight events on a rotation, so two weeks eight apart run the same one.
    expect(currentEvent(save({ calendar: { weeklyEventWeek: 3 } })).id).toBe(
      currentEvent(save({ calendar: { weeklyEventWeek: 11 } })).id,
    );
  });
});
