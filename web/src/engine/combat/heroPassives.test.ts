import { describe, expect, it } from 'vitest';
import {
  PASSIVE_DPS_CAP,
  PASSIVE_GOLD_CAP,
  PASSIVE_INCOMING_FLOOR,
  getHeroPassiveMultipliers,
  type HeroPassiveTraitId,
} from './heroPassives';
import fixture from './__fixtures__/hero-passives.json';

/**
 * The new side of the hero passive contract.
 * `__tests__/heroPassiveFixture.test.ts` owns the other.
 *
 * Only warpath_instinct moves dps, so it is the only trait the fixture can
 * see. Gold, exp and mitigation are covered here.
 */

const team = (...traits: HeroPassiveTraitId[]) => traits.map(passiveTrait => ({ passiveTrait }));

describe('hero passives match the shipped implementation', () => {
  it('has a fixture to check against', () => {
    expect(fixture.rows.length).toBeGreaterThan(5);
    expect(fixture.generatedFrom).toBe('src/useGameState.ts getDpsBreakdown');
  });

  for (const row of fixture.rows) {
    it(`reproduces "${row.scenario.name}"`, () => {
      const traits = row.scenario.traits as HeroPassiveTraitId[];
      expect(getHeroPassiveMultipliers(team(...traits)).dpsMult).toBe(row.passiveDps);
    });
  }
});

describe('the traits the breakdown cannot see', () => {
  it('fortune_hunter pays gold, once per carrier', () => {
    expect(getHeroPassiveMultipliers(team('fortune_hunter')).goldMult).toBe(1.04);
    expect(getHeroPassiveMultipliers(team('fortune_hunter', 'fortune_hunter')).goldMult).toBeCloseTo(1.04 ** 2, 10);
  });

  it('sage_instinct pays exp', () => {
    expect(getHeroPassiveMultipliers(team('sage_instinct')).expMult).toBe(1.03);
  });

  it('bulwark_instinct cuts incoming damage', () => {
    expect(getHeroPassiveMultipliers(team('bulwark_instinct')).incomingDmgMult).toBe(0.98);
    expect(getHeroPassiveMultipliers(team('bulwark_instinct', 'bulwark_instinct')).incomingDmgMult).toBeCloseTo(
      0.98 ** 2,
      10,
    );
  });

  it('keeps each trait in its own lane', () => {
    // A gold hero must not move dps, and so on — the bug a careless port
    // would introduce, and one the dps-only fixture would half-catch.
    const gold = getHeroPassiveMultipliers(team('fortune_hunter'));
    expect({ dps: gold.dpsMult, exp: gold.expMult, incoming: gold.incomingDmgMult }).toEqual({
      dps: 1,
      exp: 1,
      incoming: 1,
    });
  });
});

describe('hero passive behaviour', () => {
  it('is a no-op for an empty team', () => {
    expect(getHeroPassiveMultipliers([])).toEqual({
      dpsMult: 1,
      goldMult: 1,
      expMult: 1,
      incomingDmgMult: 1,
    });
  });

  it('caps geometric dps stacking', () => {
    // 1.03^n passes 12 around n = 85 — unreachable with six team slots, but
    // the cap is in the shipped code and a roster is not bounded by the slots
    // a future version might allow.
    const many = Array(200).fill('warpath_instinct') as HeroPassiveTraitId[];
    expect(getHeroPassiveMultipliers(team(...many)).dpsMult).toBe(PASSIVE_DPS_CAP);
  });

  it('caps gold and floors mitigation', () => {
    const goldy = Array(200).fill('fortune_hunter') as HeroPassiveTraitId[];
    expect(getHeroPassiveMultipliers(team(...goldy)).goldMult).toBe(PASSIVE_GOLD_CAP);

    const tanky = Array(200).fill('bulwark_instinct') as HeroPassiveTraitId[];
    expect(getHeroPassiveMultipliers(team(...tanky)).incomingDmgMult).toBe(PASSIVE_INCOMING_FLOOR);
  });

  it('depends only on which traits are present, not on their order', () => {
    // The trait is the whole input, which is what makes this cheap enough to
    // run every tick and safe to memoise on team composition later. Compares
    // two genuinely different arrangements rather than the same call twice.
    const forwards = getHeroPassiveMultipliers(
      team('warpath_instinct', 'fortune_hunter', 'bulwark_instinct', 'sage_instinct'),
    );
    const backwards = getHeroPassiveMultipliers(
      team('sage_instinct', 'bulwark_instinct', 'fortune_hunter', 'warpath_instinct'),
    );
    expect(forwards).toEqual(backwards);
  });

  it('counts duplicates rather than de-duplicating them', () => {
    const one = getHeroPassiveMultipliers(team('warpath_instinct')).dpsMult;
    const two = getHeroPassiveMultipliers(team('warpath_instinct', 'warpath_instinct')).dpsMult;
    expect(two).toBeGreaterThan(one);
  });
});
