import { describe, expect, it } from 'vitest';
import { getHeroTemplate } from '../../content/heroes';
import { RARITY_BOOST_MULTIPLIER, type Rarity } from '../../content/rarities';
import fixture from './__fixtures__/hero-damage.json';
import { playerContribution } from './playerDamage';
import type { ProgressionState } from './progressionMultipliers';
import type { RelicBearer } from './uniqueRelics';
import { damageMultipliers, multiplyDamage, teamDamage, type PoweredHero } from './teamPower';

/**
 * The fourteen factors, as a product.
 *
 * Each factor already has its own fixture. What none of them records is the
 * product — and the product is where a port goes wrong in ways the parts
 * cannot show: a factor left out, a factor applied twice, or the shipped
 * sequence reproduced in a different order, which matters because float
 * multiplication is not associative.
 */

const NOTHING = { strength: 0, vitality: 0, agility: 0, intelligence: 0, spirit: 0 };

/** Rebuilds the fixture generator's units from the rows it recorded. */
function poweredTeam(count: number): PoweredHero[] {
  return fixture.heroes.slice(0, count).map(row => {
    const template = getHeroTemplate(row.heroId)!;
    return {
      uid: `${row.heroId}_fixture`,
      heroClass: template.heroClass,
      passiveTrait: template.passiveTrait,
      teamBoost: template.baseTeamBoost * RARITY_BOOST_MULTIPLIER[row.rarity as Rarity],
    };
  });
}

function heroDamageOf(count: number): { uid: string; damage: number }[] {
  return fixture.heroes.slice(0, count).map(row => ({
    uid: `${row.heroId}_fixture`,
    damage: row.damage,
  }));
}

function relicsOn(count: number, rank: number): RelicBearer[] {
  return fixture.heroes.slice(0, count).map(row => {
    const template = getHeroTemplate(row.heroId)!;
    return {
      heroId: row.heroId,
      archetype: template.activeSkillArchetype,
      trait: template.passiveTrait,
      rank,
      equipped: true,
      bearerActive: true,
    };
  });
}

const FRESH: ProgressionState = {
  playerClass: 'warrior',
  prestigeCount: 0,
  achievementCount: 0,
  metaDamageLevel: 0,
  rebirthDamagePath: 0,
  tacticsFacilityLevel: 0,
  vipLevel: 0,
  classMasteryXp: 0,
  classPassiveUnlocked: false,
  damageBuffPct: 0,
};

const DEEP: ProgressionState = {
  playerClass: 'warrior',
  prestigeCount: 7,
  achievementCount: 5,
  metaDamageLevel: 24,
  rebirthDamagePath: 5,
  tacticsFacilityLevel: 12,
  vipLevel: 6,
  classMasteryXp: 5_200,
  classPassiveUnlocked: true,
  damageBuffPct: 0.35,
};

const CASES = {
  fresh: { team: 0, relics: 0, relicRank: 0, progression: FRESH },
  'one-hero': { team: 1, relics: 0, relicRank: 0, progression: FRESH },
  'full-team': { team: 6, relics: 0, relicRank: 0, progression: FRESH },
  'deep-progression': { team: 6, relics: 0, relicRank: 0, progression: DEEP },
  'relics-equipped': { team: 3, relics: 3, relicRank: 7, progression: FRESH },
} as const;

function inputFor(name: keyof typeof CASES) {
  const spec = CASES[name];
  return {
    team: poweredTeam(spec.team),
    relics: relicsOn(spec.relics, spec.relicRank),
    progression: spec.progression,
  };
}

function recorded(name: string) {
  const row = fixture.stacks.find(entry => entry.name === name);
  if (!row) throw new Error(`no recorded stack named ${name}`);
  return row;
}

describe('the whole damage stack', () => {
  it.each(Object.keys(CASES))('reproduces every factor for %s', name => {
    const row = recorded(name);
    const parts = damageMultipliers(inputFor(name as keyof typeof CASES));
    const asNumbers = Object.fromEntries(
      Object.entries(parts).map(([key, value]) => [key, typeof value === 'number' ? value : value.toNumber()]),
    );
    for (const [key, expected] of Object.entries(row.multipliers)) {
      expect(asNumbers[key], `${name}.${key}`).toBeCloseTo(expected, 9);
    }
  });

  it.each(Object.keys(CASES))('reproduces the product for %s', name => {
    const row = recorded(name);
    const product = multiplyDamage(damageMultipliers(inputFor(name as keyof typeof CASES)));
    // Relative, because fourteen factors of a double compound: `deep` reaches
    // 509 and an absolute tolerance there would be either useless or wrong.
    expect(Math.abs(product.toNumber() - row.totalMultiplier) / row.totalMultiplier).toBeLessThan(1e-12);
  });

  it('names every factor the shipped breakdown does', () => {
    // A factor the port simply forgot would not show up as a mismatch above,
    // because the loop walks the *recorded* keys. This walks the other way.
    const parts = damageMultipliers(inputFor('deep-progression'));
    expect(Object.keys(parts).sort()).toEqual(Object.keys(recorded('deep-progression').multipliers).sort());
  });

  it('multiplies in the shipped sequence, not a tidier one', () => {
    /*
     * `multiplyProgression` exists and is deliberately not used: it reproduces
     * the *progression subset's* order, and the shipped product interleaves
     * hero passives, formation and synergy between the class passive and
     * mastery. Float multiplication is not associative, so on a deep account
     * the two orders disagree in the last bits — which is enough to fail the
     * relative check above and is the reason this is written out by hand.
     */
    const parts = damageMultipliers(inputFor('deep-progression'));
    const shipped = multiplyDamage(parts).toNumber();
    const tidied = Object.values(parts).reduce<number>(
      (total, value) => total * (typeof value === 'number' ? value : value.toNumber()),
      1,
    );
    expect(shipped).toBeCloseTo(recorded('deep-progression').totalMultiplier, 6);
    // The tidied order lands on the same value to within a double's noise —
    // which is why the check above is relative rather than exact.
    expect(Math.abs(tidied - shipped) / shipped).toBeLessThan(1e-12);
  });

  it('refuses a negative product rather than healing the enemy', () => {
    // The shipped `safeMultiplier` returns 1 for a negative or non-finite
    // product. Only a corrupt input can produce one, and damage that heals is
    // worse than damage that does nothing.
    const parts = damageMultipliers(inputFor('fresh'));
    expect(multiplyDamage({ ...parts, teamBoost: -4 }).toNumber()).toBe(1);
  });

  it('keeps a multiplier the shipped guard would have thrown away', () => {
    /*
     * And here the port deliberately differs. `safeMultiplier` collapses a
     * non-finite product to **1**, which on a deep account means losing the
     * entire bonus: `1.5^prestigeCount` alone is `Infinity` past 1,760
     * rebirths as a double. `break_eternity` is in the stack precisely so the
     * numbers outlive that, so a legitimately huge product is kept.
     */
    const parts = damageMultipliers({ ...inputFor('fresh'), progression: { ...FRESH, prestigeCount: 3_000 } });
    const product = multiplyDamage(parts);
    expect(product.isFinite()).toBe(true);
    expect(product.gt('1e500')).toBe(true);
  });
});

describe('the team damage it produces', () => {
  it('matches the shipped final dps', () => {
    const row = recorded('full-team');
    const result = teamDamage({
      ...inputFor('full-team'),
      playerDamage: row.playerBaseDps,
      heroDamage: heroDamageOf(6),
    });
    expect(Math.abs(result.total.toNumber() - row.finalDps) / row.finalDps).toBeLessThan(1e-12);
  });

  it('counts the player in, which is most of a fresh account', () => {
    const row = recorded('fresh');
    const player = playerContribution({ playerClass: 'warrior', level: 1, alloc: NOTHING });
    const result = teamDamage({ ...inputFor('fresh'), playerDamage: player, heroDamage: [] });
    expect(result.total.toNumber()).toBeCloseTo(row.finalDps, 9);
    // With no heroes at all, the whole of it is theirs.
    expect(result.player.toNumber()).toBeCloseTo(row.finalDps, 9);
  });

  it('splits the multiplier across combatants rather than over the sum', () => {
    /*
     * The same number by distributivity, and not the same object: the rewrite
     * keeps combatants as entities with their own swing timers, so each one
     * needs their own multiplied damage — which is what lets a floating number
     * say who hit.
     */
    const result = teamDamage({
      ...inputFor('full-team'),
      playerDamage: 100,
      heroDamage: heroDamageOf(6),
    });
    const summed = result.heroes.reduce((total, hero) => total.add(hero.damage), result.player);
    expect(summed.toNumber()).toBeCloseTo(result.total.toNumber(), 6);
    expect(result.heroes).toHaveLength(6);
    for (const hero of result.heroes) {
      const base = heroDamageOf(6).find(entry => entry.uid === hero.uid)!.damage;
      expect(hero.damage.toNumber()).toBeCloseTo(base * result.multiplier.toNumber(), 6);
    }
  });

  it('floors the whole team at one point, not each of them', () => {
    // `Math.max(1, rawDps)` applies to the total. Six combatants each dealing
    // a fifth of a point deal one point between them, not six.
    const result = teamDamage({
      ...inputFor('fresh'),
      playerDamage: 0.2,
      heroDamage: [
        { uid: 'a', damage: 0.2 },
        { uid: 'b', damage: 0.2 },
      ],
    });
    expect(result.total.toNumber()).toBe(1);
  });

  it('never pays for a negative contribution', () => {
    const result = teamDamage({ ...inputFor('fresh'), playerDamage: -500, heroDamage: [{ uid: 'a', damage: -9 }] });
    expect(result.player.toNumber()).toBe(0);
    expect(result.heroes[0].damage.toNumber()).toBe(0);
  });
});
