import { describe, expect, it } from 'vitest';
import type { PlayerClass } from '../../content/classes';
import { HERO_POOL } from '../../content/heroes';
import { migrateSave } from '../../engine/save/migrate';
import type { SaveContent } from '../../engine/save/schema';
import { emptyProfile, profileFromSave, rosterOrder, type RosterEntry } from './playerProfile';
import fixture from '../../engine/save/__fixtures__/v2-saves.json';

/** Mirrors the migration suite's decoder; the fixture holds NaN and Infinity. */
const SPECIAL: Record<string, number> = {
  __NaN__: Number.NaN,
  __Infinity__: Number.POSITIVE_INFINITY,
  '__-Infinity__': Number.NEGATIVE_INFINITY,
};

function decode(value: unknown): unknown {
  if (typeof value === 'string' && value in SPECIAL) return SPECIAL[value];
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decode(entry)]));
  }
  return value;
}

const CONTENT: SaveContent = {
  heroesById: new Map(
    fixture.heroTemplates.map(template => [
      template.id,
      { heroClass: template.heroClass as PlayerClass, baseTeamBoost: template.baseTeamBoost },
    ]),
  ),
};

function caseNamed(name: string) {
  const found = CASES.find(entry => entry.name === name);
  if (!found) throw new Error(`no fixture case named ${name}`);
  return found;
}

const CASES = fixture.cases.map(entry => ({
  name: entry.name,
  save: migrateSave(decode(entry.payload), { nowMs: fixture.nowMs, content: CONTENT }),
}));

function entry(over: Partial<RosterEntry> & { uid: string }): RosterEntry {
  return {
    templateId: 'h1',
    name: 'Someone',
    emoji: '🙂',
    heroClass: 'warrior',
    tier: 1,
    rarity: 'common',
    level: 1,
    rank: 0,
    teamBoost: 0.05,
    role: 'front',
    active: false,
    ...over,
  };
}

describe('player profile', () => {
  it('is built from every save the migration can produce', () => {
    // Not a smoke test. These are real v2 payloads — a hostile one carrying
    // NaN, a wallet past 2^53, an empty one — and a surface that throws on
    // any of them is a surface a dormant player cannot get past.
    expect(CASES.length).toBeGreaterThanOrEqual(9);
    for (const { name, save } of CASES) {
      expect(() => profileFromSave(save), name).not.toThrow();
    }
  });

  it('never invents a hero the catalogue does not have', () => {
    for (const { name, save } of CASES) {
      const profile = profileFromSave(save);
      for (const hero of profile.roster) {
        expect(
          HERO_POOL.some(template => template.id === hero.templateId),
          `${name}: ${hero.templateId}`,
        ).toBe(true);
        expect(hero.name.trim(), name).not.toBe('');
      }
    }
  });

  it('keeps every roster row the save carried', () => {
    // Dropping a row here would look exactly like the migration dropping a
    // retired hero, which is a thing that legitimately happens — so the
    // difference has to be asserted rather than eyeballed.
    for (const { name, save } of CASES) {
      const profile = profileFromSave(save);
      const kept = new Set(profile.roster.map(hero => hero.uid));
      for (const saved of save.roster.heroes) {
        expect(kept.has(saved.uid), `${name} lost ${saved.uid}`).toBe(true);
      }
      expect(profile.roster).toHaveLength(save.roster.heroes.length);
    }
  });

  it('marks exactly the heroes the save had on the team', () => {
    for (const { name, save } of CASES) {
      const profile = profileFromSave(save);
      const active = profile.roster
        .filter(hero => hero.active)
        .map(hero => hero.uid)
        .sort();
      expect(active, name).toEqual([...save.roster.activeUids].sort());
    }
  });

  it('puts the team first even when a benched hero outranks all of them', () => {
    // The fixtures cannot prove this on their own: their benched hero is also
    // their weakest, so it sorts last whether or not the rule exists. An
    // earlier version of this test passed with the rule deleted.
    const ordered = rosterOrder([
      entry({ uid: 'bench', tier: 5, rank: 10, level: 999, active: false }),
      entry({ uid: 'team', tier: 1, rank: 0, level: 1, active: true }),
    ]);
    expect(ordered.map(hero => hero.uid)).toEqual(['team', 'bench']);
  });

  it('ranks by tier, then rank, then level, among equals', () => {
    const ordered = rosterOrder([
      entry({ uid: 'low-tier', tier: 1, rank: 9, level: 900 }),
      entry({ uid: 'high-tier', tier: 5, rank: 0, level: 1 }),
      entry({ uid: 'mid-tier-ranked', tier: 3, rank: 5, level: 1 }),
      entry({ uid: 'mid-tier-plain', tier: 3, rank: 0, level: 999 }),
    ]);
    expect(ordered.map(hero => hero.uid)).toEqual(['high-tier', 'mid-tier-ranked', 'mid-tier-plain', 'low-tier']);
  });

  it('breaks a total tie on the uid rather than on arrival order', () => {
    // Two identical heroes must not swap places between renders.
    const a = entry({ uid: 'aaa' });
    const b = entry({ uid: 'bbb' });
    expect(rosterOrder([b, a]).map(hero => hero.uid)).toEqual(['aaa', 'bbb']);
    expect(rosterOrder([a, b]).map(hero => hero.uid)).toEqual(['aaa', 'bbb']);
  });

  it('gives the same order for the same save twice', () => {
    const veteran = caseNamed('veteran');
    expect(profileFromSave(veteran.save).roster.map(hero => hero.uid)).toEqual(
      profileFromSave(veteran.save).roster.map(hero => hero.uid),
    );
  });

  it('carries a wallet figure too large for a double without mangling it', () => {
    const rich = caseNamed('wallet-past-2-53');
    const profile = profileFromSave(rich.save);
    // The point of `break_eternity` being in the stack. The profile hands the
    // figure over as the save holds it; spelling it is the surface's job.
    expect(profile.wallet.gold).toBe(rich.save.wallet.gold);
    expect(Number.isFinite(profile.wallet.gold)).toBe(true);
  });

  it('gives every hero a formation role, stated or implied', () => {
    for (const { name, save } of CASES) {
      for (const hero of profileFromSave(save).roster) {
        expect(['front', 'mid', 'back'], `${name}: ${hero.uid}`).toContain(hero.role);
      }
    }
  });

  it('describes a player who has not made a character yet', () => {
    const empty = emptyProfile();
    expect(empty.created).toBe(false);
    expect(empty.playerClass).toBeNull();
    expect(empty.roster).toEqual([]);
    expect(empty.wave).toBeGreaterThanOrEqual(1);
  });

  it('sorts a roster deterministically whatever order it arrives in', () => {
    const veteran = caseNamed('veteran');
    const profile = profileFromSave(veteran.save);
    const shuffled = rosterOrder([...profile.roster].reverse());
    expect(shuffled.map(hero => hero.uid)).toEqual(rosterOrder(profile.roster).map(hero => hero.uid));
  });
});
