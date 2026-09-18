import { describe, expect, it } from 'vitest';
import fixture from '../../content/__fixtures__/best-team.json';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import type { Rarity } from '../../content/rarities';
import { readSave } from '../save/v3';
import type { SaveV3, SavedHero } from '../save/schema';
import { byStrength, fieldBestHeroes, REBIRTH_MULT_EPSILON, strongestFirst } from './bestTeam';

/**
 * "Field my best", against what the shipped button was measured fielding.
 *
 * Every case runs through `readSave`, so the roster these sort is one the
 * reader produced rather than a literal — which matters here more than usual,
 * because the reader floors `teamBoost` at the template's own base boost and a
 * test that wrote 1 and 2 by hand would be sorting on numbers no save can hold.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

type Spec = (typeof fixture.cases)[number]['roster'][number];

function save(roster: readonly Spec[], slotsUnlocked = 6): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 40 },
      roster: {
        heroes: roster.map(spec => ({
          id: spec.template,
          uid: spec.uid,
          rarity: spec.rarity,
          level: spec.level,
          rank: 1,
          teamBoost: spec.teamBoost,
          rebirthStatMult: spec.rebirthStatMult ?? 1,
        })),
        activeUids: [],
        slotsUnlocked,
      },
    },
    { nowMs: NOW, content: CONTENT },
  );
}

/** The slot cap a case was measured under. Only one case moves it. */
const slotsFor = (name: string) => (name.includes('slots the account has bought') ? 4 : 6);

describe('the order it picks in', () => {
  it('reproduces every case the shipped button was measured on', () => {
    expect(
      fixture.cases.map(entry => ({
        name: entry.name,
        fielded: fieldBestHeroes(save(entry.roster, slotsFor(entry.name)), CONTENT)?.roster.activeUids ?? [],
      })),
    ).toEqual(fixture.cases.map(entry => ({ name: entry.name, fielded: entry.fielded })));
  });

  it('proposes an order even where nothing can be fielded', () => {
    // `strongestFirst` is the sort alone, for a screen that wants to show the
    // ranking rather than act on it. It has no idea about ranks or slots.
    const crowded = fixture.cases.find(entry => entry.name.includes('two heroes to a rank'))!;
    expect(strongestFirst(save(crowded.roster)).map(hero => hero.uid)).toEqual(['w1', 'w2', 'w3', 'm1']);
    expect(crowded.fielded).toEqual(['w1', 'w2', 'm1']);
  });
});

describe('the four keys, one at a time', () => {
  const hero = (over: Partial<SavedHero>): SavedHero => ({
    id: 'h1',
    uid: 'u',
    rarity: 'rare' as Rarity,
    level: 1,
    rank: 1,
    teamBoost: 1,
    rebirthStatMult: 1,
    ...over,
  });

  it('puts rarity above everything', () => {
    const common = hero({ rarity: 'common', level: 999, teamBoost: 999, rebirthStatMult: 9 });
    const legendary = hero({ rarity: 'legendary' });
    expect(byStrength(common, legendary)).toBeGreaterThan(0);
  });

  it('puts the rebirth multiplier above level', () => {
    expect(byStrength(hero({ rebirthStatMult: 2 }), hero({ level: 999 }))).toBeLessThan(0);
  });

  it('ignores a rebirth difference below a ten-thousandth', () => {
    /*
     * `Math.abs(diff) > 0.0001`, so 1.00005 and 1 tie and the level decides. A
     * port comparing them directly swaps those two heroes — a difference
     * nobody would notice, which is exactly why it is pinned.
     */
    const hair = hero({ rebirthStatMult: 1 + REBIRTH_MULT_EPSILON / 2, level: 1 });
    const levelled = hero({ rebirthStatMult: 1, level: 9 });
    expect(byStrength(hair, levelled)).toBeGreaterThan(0);
    // And a difference above it does decide, so the tolerance is a tolerance
    // and not an accidental equality.
    const clear = hero({ rebirthStatMult: 1 + REBIRTH_MULT_EPSILON * 2, level: 1 });
    expect(byStrength(clear, levelled)).toBeLessThan(0);
  });

  it('puts level above team boost, and team boost last', () => {
    expect(byStrength(hero({ level: 9 }), hero({ teamBoost: 999 }))).toBeLessThan(0);
    expect(byStrength(hero({ teamBoost: 2 }), hero({ teamBoost: 1 }))).toBeLessThan(0);
    expect(byStrength(hero({}), hero({}))).toBe(0);
  });
});

describe('what it answers when there is nothing to do', () => {
  it('refuses when the best team is the one already fielded', () => {
    // The same answer `fieldTeam` gives, so a button can grey out on it.
    const crowded = fixture.cases.find(entry => entry.name.includes('two heroes to a rank'))!;
    const fielded = fieldBestHeroes(save(crowded.roster), CONTENT)!;
    expect(fieldBestHeroes(fielded, CONTENT)).toBeNull();
  });

  it('refuses an empty roster rather than fielding nobody twice', () => {
    expect(fieldBestHeroes(save([]), CONTENT)).toBeNull();
  });
});
