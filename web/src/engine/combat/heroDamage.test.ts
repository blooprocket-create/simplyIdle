import { describe, expect, it } from 'vitest';
import type { PlayerClass } from '../../content/classes';
import type { Rarity } from '../../content/rarities';
import type { HeroTemplate } from '../../content/heroStats';
import {
  getHeroContribution,
  getTeamBaseDps,
  getTeamContributions,
  sumContributions,
  type HeroUnit,
} from './heroDamage';
import fixture from './__fixtures__/hero-damage.json';

/**
 * The new side of the per-hero parity contract.
 * `__tests__/heroDamageFixture.test.ts` owns the other.
 *
 * What is being proved here is the rewrite's central structural claim: that
 * heroes can stop being addends in a running total and become entities with
 * their own damage *without changing the game's numbers*. Only the id, class
 * and tier reach the formula, so the fixture carries those rather than
 * depending on a hero catalogue that has not been ported yet.
 */

/** Damage depends on id, class and tier only; the rest is presentation. */
function templateFrom(row: (typeof fixture.heroes)[number]): HeroTemplate {
  return {
    id: row.heroId,
    name: row.heroId,
    heroClass: row.heroClass as PlayerClass,
    emoji: '',
    baseTeamBoost: 0,
    tier: row.tier as HeroTemplate['tier'],
  };
}

function unitFrom(row: (typeof fixture.heroes)[number]): HeroUnit {
  return {
    uid: `${row.heroId}_fixture`,
    template: templateFrom(row),
    level: row.level,
    rank: row.rank,
    rarity: row.rarity as Rarity,
    rebirthStatMult: 1,
  };
}

describe('per-hero damage matches the shipped implementation', () => {
  it('has a fixture to check against', () => {
    expect(fixture.heroes.length).toBe(10);
    expect(fixture.generatedFrom).toBe('src/useGameState.ts getDpsBreakdown');
  });

  for (const row of fixture.heroes) {
    it(`reproduces ${row.heroId} (${row.heroClass} t${row.tier}, lvl ${row.level} rank ${row.rank} ${row.rarity})`, () => {
      const damage = getHeroContribution(unitFrom(row)).damage;
      // Same operations in the same order on the same floats, so this is
      // exact — not a tolerance. A difference here is a ported formula that
      // is wrong, not a numeric artefact.
      expect(damage).toBe(row.damage);
    });
  }
});

describe('splitting the team into entities is lossless', () => {
  const team = fixture.heroes.map(unitFrom);

  it('sums to the scalar the old code produced for the whole team', () => {
    // The claim the whole rewrite rests on: keeping heroes separate is a
    // change of structure, not of balance. Float addition order is the only
    // reason this is not exact.
    const total = getTeamBaseDps(team);
    expect(Math.abs(total - fixture.teamTotal) / fixture.teamTotal).toBeLessThanOrEqual(1e-12);
  });

  it('keeps one contribution per hero, in team order', () => {
    const contributions = getTeamContributions(team);
    expect(contributions).toHaveLength(team.length);
    expect(contributions.map(c => c.uid)).toEqual(team.map(hero => hero.uid));
  });

  it('distinguishes heroes the old scalar could not', () => {
    // Six heroes and one hero with six times the stats summed to the same
    // number before. They are now separate facts.
    const contributions = getTeamContributions(team);
    const damages = contributions.map(c => c.damage);
    expect(new Set(damages).size).toBe(damages.length);
  });

  it('describes each hit as physical and magical rather than one number', () => {
    // What a renderer needs to draw a hit differently for a mage and a
    // berserker, and what the old scalar threw away.
    for (const contribution of getTeamContributions(team)) {
      expect(contribution.physical).toBeGreaterThan(0);
      expect(contribution.magical).toBeGreaterThan(0);
      expect(contribution.stats.str).toBeGreaterThan(0);
    }
  });

  it('is unaffected by the order heroes appear in', () => {
    const forwards = sumContributions(getTeamContributions(team));
    const backwards = sumContributions(getTeamContributions([...team].reverse()));
    expect(Math.abs(forwards - backwards) / forwards).toBeLessThanOrEqual(1e-12);
  });

  it('drops to zero for an empty team rather than throwing', () => {
    expect(getTeamBaseDps([])).toBe(0);
  });
});
