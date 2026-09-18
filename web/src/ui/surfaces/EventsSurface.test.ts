import { describe, expect, it } from 'vitest';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { WEEKLY_EVENTS } from '../../content/weeklyEvents';
import { readSave } from '../../engine/save/v3';
import type { SaveV3 } from '../../engine/save/schema';
import { rungHint, weekView } from './EventsSurface';

/**
 * The Events surface's two decisions: what the week reads as, and what a rung
 * says under its title.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };

function save(calendar: Record<string, unknown> = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 20 },
      calendar,
    },
    { nowMs: 0, content: CONTENT },
  );
}

describe('what the week reads as', () => {
  it('names the event the account is actually in', () => {
    const view = weekView(save({ weeklyEventWeek: 3 }));
    expect(view.eventName).toBe(WEEKLY_EVENTS[3].name);
    expect(view.eventDescription).toBe(WEEKLY_EVENTS[3].description);
  });

  it('carries the streak and the charges through', () => {
    expect(weekView(save({ streak: 7, insuranceCharges: 2 }))).toMatchObject({ streak: 7, insurance: 2 });
  });

  it('counts the rungs that are ready', () => {
    expect(weekView(save({ weeklyKills: 0 })).claimable).toBe(0);
    expect(weekView(save({ weeklyKills: 100 })).claimable).toBe(2);
    expect(weekView(save({ weeklyKills: 100, trackClaimed: [25] })).claimable).toBe(1);
  });

  it('shows all four rungs however far along the week is', () => {
    // A track that hid the rungs out of reach would stop a player seeing what
    // the week is worth, which is the whole point of showing them a track.
    expect(weekView(save({ weeklyKills: 0 })).rungs).toHaveLength(4);
    expect(weekView(save({ weeklyKills: 9_999 })).rungs).toHaveLength(4);
  });
});

describe('what a rung says under its title', () => {
  it('quotes all three currencies while it is open', () => {
    const rung = weekView(save({ weeklyKills: 0 })).rungs[0];
    expect(rungHint(rung)).toBe('520 gold · 63 shards · 1 essence');
  });

  it('says so once it has been collected, and stops quoting a price', () => {
    const rung = weekView(save({ weeklyKills: 1_000, trackClaimed: [25] })).rungs[0];
    expect(rungHint(rung)).toBe('Collected');
  });
});
