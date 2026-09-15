import { describe, expect, it } from 'vitest';
import type { PlayerClass } from '../../content/classes';
import { countFactions, factionForClass, getTeamSynergy } from './synergy';
import fixture from './__fixtures__/synergy.json';

/**
 * The new side of the synergy contract.
 * `__tests__/synergyFixture.test.ts` owns the other.
 *
 * The fixture can only see the dps multiplier, so three of the five rules —
 * Vanguard Wall (hp), Iron Mandala (incoming) and Warband Focus (gold) — are
 * covered here behaviourally instead. That split is deliberate and recorded on
 * both sides rather than left as a silent gap.
 */

const team = (...classes: PlayerClass[]) => classes.map(heroClass => ({ heroClass }));

describe('synergy matches the shipped implementation', () => {
  it('has a fixture to check against', () => {
    expect(fixture.rows.length).toBeGreaterThan(8);
    expect(fixture.generatedFrom).toBe('src/useGameState.ts getDpsBreakdown');
  });

  for (const row of fixture.rows) {
    it(`reproduces "${row.scenario.name}"`, () => {
      const dps = getTeamSynergy(team(...(row.scenario.classes as PlayerClass[]))).dpsMult;
      expect(dps).toBe(row.synergyDps);
    });
  }
});

describe('the synergies the breakdown cannot see', () => {
  it('Vanguard Wall needs two heavies', () => {
    expect(getTeamSynergy(team('warrior')).hpMult).toBe(1);
    expect(getTeamSynergy(team('warrior', 'berserker')).hpMult).toBe(1.12);
    // Two of the same heavy class still counts — it is a faction rule.
    expect(getTeamSynergy(team('warrior', 'warrior')).hpMult).toBe(1.12);
  });

  it('Iron Mandala needs steel and a monk together', () => {
    expect(getTeamSynergy(team('warrior', 'monk')).incomingMult).toBe(0.93);
    expect(getTeamSynergy(team('berserker', 'monk')).incomingMult).toBe(0.93);
    expect(getTeamSynergy(team('monk', 'monk')).incomingMult).toBe(1);
    expect(getTeamSynergy(team('warrior', 'warrior')).incomingMult).toBe(1);
  });

  it('Warband Focus needs three or more of a single class', () => {
    expect(getTeamSynergy(team('archer', 'archer')).goldMult).toBe(1);
    expect(getTeamSynergy(team('archer', 'archer', 'archer')).goldMult).toBe(1.18);
    // One outsider breaks it.
    expect(getTeamSynergy(team('archer', 'archer', 'mage')).goldMult).toBe(1);
  });

  it('Grand Coalition also pays exp, which the dps column hides', () => {
    expect(getTeamSynergy(team('warrior', 'archer', 'mage', 'monk')).expMult).toBe(1.08);
    expect(getTeamSynergy(team('warrior', 'archer', 'mage')).expMult).toBe(1);
  });
});

describe('synergy behaviour', () => {
  it('is a no-op for an empty team', () => {
    expect(getTeamSynergy([])).toEqual({
      dpsMult: 1,
      hpMult: 1,
      incomingMult: 1,
      goldMult: 1,
      expMult: 1,
      active: [],
    });
  });

  it('reports which synergies fired, so a UI can name them', () => {
    const stacked = getTeamSynergy(team('warrior', 'berserker', 'archer', 'mage', 'monk'));
    expect(stacked.active).toEqual(['vanguard_wall', 'spellshot', 'iron_mandala', 'grand_coalition']);
  });

  it('maps every class to a faction', () => {
    const classes: PlayerClass[] = ['warrior', 'berserker', 'archer', 'mage', 'monk'];
    expect(classes.map(factionForClass)).toEqual(['vanguard', 'vanguard', 'ranger', 'arcanum', 'aegis']);
  });

  it('counts factions rather than classes for the vanguard rule', () => {
    // Warrior and berserker are one faction, which is why one of each fires
    // Vanguard Wall while neither alone does.
    expect(countFactions(team('warrior', 'berserker')).vanguard).toBe(2);
  });

  it('cannot fire Warband Focus and Grand Coalition together', () => {
    // Mono-class and four-distinct-classes are mutually exclusive by
    // construction; asserting it stops a future rule change making both
    // reachable without anyone noticing.
    for (const size of [3, 4, 5, 6]) {
      const mono = getTeamSynergy(team(...(Array(size).fill('archer') as PlayerClass[])));
      expect(mono.active.includes('warband_focus')).toBe(true);
      expect(mono.active.includes('grand_coalition')).toBe(false);
    }
  });
});
