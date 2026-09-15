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
import { ACTIVE_TEAM_SIZE, HERO_LEVEL_CAP, HERO_RANK_CAP, MAX_REBIRTH_STAT_MULT } from '../save/migrate';
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

describe('hero damage stays inside float range, which is why it is not Decimal', () => {
  /*
   * The progression multipliers are on `Decimal` because rebirth legacy
   * compounds without a cap and overflows a double at prestige 1,760. A hero's
   * own damage is a different shape: every input to it is bounded, so it can
   * stay a `number` and keep full double precision.
   *
   * That is an argument, not a measurement, so here is the measurement. If a
   * future change unbounds any of these inputs, this fails and the decision
   * gets made again rather than inherited.
   */

  const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'godly', 'transcendent'];
  const CLASSES: PlayerClass[] = ['warrior', 'berserker', 'archer', 'mage', 'monk'];
  const TIERS: HeroTemplate['tier'][] = [1, 2, 3, 4, 5];

  function strongestPossible(): number {
    let worst = 0;
    for (const heroClass of CLASSES) {
      for (const tier of TIERS) {
        for (const rarity of RARITIES) {
          const damage = getHeroContribution({
            uid: 'max',
            template: { id: 'max', name: 'max', heroClass, emoji: '', baseTeamBoost: 0, tier },
            level: HERO_LEVEL_CAP,
            rank: HERO_RANK_CAP,
            rarity,
            rebirthStatMult: MAX_REBIRTH_STAT_MULT,
          }).damage;
          worst = Math.max(worst, damage);
        }
      }
    }
    return worst;
  }

  it('cannot exceed 2^53 even at every cap at once', () => {
    const strongest = strongestPossible();
    expect(strongest).toBeGreaterThan(0);
    expect(Number.isFinite(strongest)).toBe(true);
    // Not "under 2^53" by a hair — orders of magnitude under it, so the
    // headroom survives a balance pass without anyone having to re-check.
    expect(strongest).toBeLessThan(Number.MAX_SAFE_INTEGER / 1e6);
  });

  it('a full team of the strongest hero is still nowhere near the ceiling', () => {
    expect(strongestPossible() * ACTIVE_TEAM_SIZE).toBeLessThan(Number.MAX_SAFE_INTEGER / 1e5);
  });

  it('depends on bounds the save reader actually enforces', () => {
    /*
     * Imported from the reader rather than restated here. An earlier draft
     * declared its own copies and then asserted they equalled the literals it
     * had just written — a test that passes for any values at all. These are
     * the real ones, so unbounding a hero's level or rebirth multiplier in the
     * reader fails this file and forces the `number` vs `Decimal` decision to
     * be made again instead of inherited.
     */
    expect(HERO_LEVEL_CAP).toBe(999);
    expect(HERO_RANK_CAP).toBe(10);
    expect(MAX_REBIRTH_STAT_MULT).toBe(20);
    expect(ACTIVE_TEAM_SIZE).toBe(6);
  });
});
