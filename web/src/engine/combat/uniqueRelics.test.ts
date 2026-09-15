import { describe, expect, it } from 'vitest';
import { UNIQUE_EFFECTS, getUniqueEffectFamily, type HeroActiveSkillArchetypeId } from '../../content/uniqueEffects';
import type { HeroPassiveTraitId } from './heroPassives';
import {
  RELIC_DPS_CAP,
  RELIC_INCOMING_FLOOR,
  getRelicModifiersForHero,
  getUniqueRelicMultipliers,
  isRelicContributing,
  type RelicBearer,
} from './uniqueRelics';
import fixture from './__fixtures__/unique-relics.json';

/**
 * The new side of the unique relic contract.
 * `__tests__/uniqueRelicFixture.test.ts` owns the other, and covers all 65
 * heroes rather than a sample because the effect family is resolved per hero.
 */

const relic = (overrides: Partial<RelicBearer> = {}): RelicBearer => ({
  heroId: 'h1',
  archetype: 'burst_volley',
  trait: 'warpath_instinct',
  rank: 5,
  equipped: true,
  bearerActive: true,
  ...overrides,
});

describe('relic modifiers match the shipped implementation', () => {
  it('has a fixture covering every hero', () => {
    expect(fixture.heroes.length).toBe(fixture.heroCount);
    expect(fixture.generatedFrom).toBe('src/gameConfig.ts getHeroUniqueCombatModifiers');
  });

  it('reproduces every hero at every sampled rank', () => {
    // 65 heroes across ten ranks: asserted in one test rather than 650, since
    // a failure names the hero and rank anyway.
    for (const hero of fixture.heroes) {
      for (const [rank, expected] of Object.entries(hero.byRank)) {
        const actual = getRelicModifiersForHero(
          hero.archetype as HeroActiveSkillArchetypeId,
          hero.trait as HeroPassiveTraitId,
          Number(rank),
        );
        expect({
          hero: hero.heroId,
          rank,
          values: [actual.dpsMult, actual.goldMult, actual.expMult, actual.incomingDmgMult],
        }).toEqual({ hero: hero.heroId, rank, values: expected });
      }
    }
  });

  it('resolves a family for all sixteen matrix cells', () => {
    const archetypes: HeroActiveSkillArchetypeId[] = [
      'frontline_ward',
      'battle_chant',
      'burst_volley',
      'mending_pulse',
    ];
    const traits: HeroPassiveTraitId[] = ['bulwark_instinct', 'fortune_hunter', 'warpath_instinct', 'sage_instinct'];
    const families = new Set<string>();
    for (const archetype of archetypes) {
      for (const trait of traits) {
        const family = getUniqueEffectFamily(archetype, trait);
        expect(UNIQUE_EFFECTS[family]).toBeDefined();
        families.add(family);
      }
    }
    // Sixteen cells, fourteen families: the non-burst sage cells share one.
    expect(families.size).toBe(14);
  });
});

describe('when a relic counts', () => {
  it('needs to be equipped', () => {
    expect(isRelicContributing(relic({ equipped: false }))).toBe(false);
    expect(getUniqueRelicMultipliers([relic({ equipped: false })]).dpsMult).toBe(1);
  });

  it('needs its bearer on the active team', () => {
    // A forged, equipped relic on a benched hero does nothing — the shipped
    // rule, and an easy one to lose in a port.
    expect(isRelicContributing(relic({ bearerActive: false }))).toBe(false);
    expect(getUniqueRelicMultipliers([relic({ bearerActive: false })]).dpsMult).toBe(1);
  });

  it('needs a rank above zero', () => {
    expect(isRelicContributing(relic({ rank: 0 }))).toBe(false);
    expect(getUniqueRelicMultipliers([relic({ rank: 0 })]).dpsMult).toBe(1);
  });

  it('reports which relics contributed', () => {
    const result = getUniqueRelicMultipliers([
      relic({ heroId: 'a' }),
      relic({ heroId: 'b', bearerActive: false }),
      relic({ heroId: 'c' }),
    ]);
    expect(result.contributing).toEqual(['a', 'c']);
  });
});

describe('relic behaviour', () => {
  it('is a no-op with no relics', () => {
    const none = getUniqueRelicMultipliers([]);
    expect({
      dps: none.dpsMult,
      gold: none.goldMult,
      exp: none.expMult,
      incoming: none.incomingDmgMult,
    }).toEqual({ dps: 1, gold: 1, exp: 1, incoming: 1 });
  });

  it('multiplies relics against each other rather than adding them', () => {
    const one = getUniqueRelicMultipliers([relic({ heroId: 'a' })]).dpsMult;
    const two = getUniqueRelicMultipliers([relic({ heroId: 'a' }), relic({ heroId: 'b' })]).dpsMult;
    expect(two).toBeCloseTo(one * one, 10);
  });

  it('scales with rank', () => {
    const low = getRelicModifiersForHero('burst_volley', 'warpath_instinct', 1).dpsMult;
    const high = getRelicModifiersForHero('burst_volley', 'warpath_instinct', 10).dpsMult;
    expect(high).toBeGreaterThan(low);
  });

  it('caps dps and floors mitigation across many relics', () => {
    const many = Array.from({ length: 40 }, (_, i) => relic({ heroId: `h${i}`, rank: 10 }));
    expect(getUniqueRelicMultipliers(many).dpsMult).toBe(RELIC_DPS_CAP);

    const tanky = Array.from({ length: 40 }, (_, i) =>
      relic({ heroId: `t${i}`, archetype: 'frontline_ward', trait: 'bulwark_instinct', rank: 10 }),
    );
    expect(getUniqueRelicMultipliers(tanky).incomingDmgMult).toBe(RELIC_INCOMING_FLOOR);
  });

  it('leaves the per-relic mitigation floor unreachable, as shipped', () => {
    /*
     * The shipped code floors a single relic's mitigation at 0.5 before
     * relics compound. With the shipped family parameters nothing comes near
     * it: the strongest is phalanx at 11% + 1.8%/rank, which is 29% at rank
     * 10 and so a multiplier of 0.71.
     *
     * So the floor is dead code, and asserting it "works" would be a test
     * that passes whether or not the floor exists — an earlier version of
     * this test did exactly that. Asserting the real ceiling instead means a
     * future family strong enough to reach the floor fails here and has to be
     * a decision.
     */
    const strongest = Object.entries(UNIQUE_EFFECTS).reduce(
      (worst, [family, effect]) => {
        const mult = 1 - (effect.mitigationBasePct + effect.mitigationPerRankPct * 10) / 100;
        return mult < worst.mult ? { family, mult } : worst;
      },
      { family: '', mult: 1 },
    );

    expect(strongest.family).toBe('phalanx');
    expect(strongest.mult).toBeCloseTo(0.71, 10);
    expect(strongest.mult).toBeGreaterThan(0.5);
  });
});
