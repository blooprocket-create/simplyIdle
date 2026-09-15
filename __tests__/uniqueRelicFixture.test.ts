import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { HERO_POOL, getHeroUniqueCombatModifiers } from '../src/gameConfig';

/**
 * Reference values for unique weapon relics.
 *
 * Unlike the other multipliers this one is read from `gameConfig`'s public
 * `getHeroUniqueCombatModifiers` rather than through `getDpsBreakdown`, which
 * lets it cover **every hero** instead of a sample — the effect family is
 * resolved per hero, so a sample could miss a cell of the matrix entirely.
 *
 * It also records something worth knowing: 28 heroes carry an `effectFamily`
 * override, and every one of them is a *legacy* value ('arcane', 'monk',
 * 'ranger') that `isModernHeroUniqueEffectFamily` rejects. The override branch
 * therefore never fires, and the archetype-by-trait matrix decides all 65.
 *
 * Regenerate deliberately:
 *   UPDATE_RELIC_FIXTURE=1 npx jest __tests__/uniqueRelicFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'engine', 'combat', '__fixtures__', 'unique-relics.json');

/** Both clamp edges, plus ranks in between. */
const RANKS = [0, 1, 2, 3, 5, 9, 10, 11, 3.7, -4];

interface HeroRow {
  heroId: string;
  archetype: string;
  trait: string;
  byRank: Record<string, [number, number, number, number]>;
}

interface Fixture {
  note: string;
  generatedFrom: string;
  heroCount: number;
  heroes: HeroRow[];
}

function build(): Fixture {
  return {
    note: 'Unique relic modifiers from the shipped implementation, for every hero. Owned by __tests__/uniqueRelicFixture.test.ts.',
    generatedFrom: 'src/gameConfig.ts getHeroUniqueCombatModifiers',
    heroCount: HERO_POOL.length,
    heroes: HERO_POOL.map(hero => {
      const byRank: HeroRow['byRank'] = {};
      for (const rank of RANKS) {
        const m = getHeroUniqueCombatModifiers(hero.id, rank);
        byRank[String(rank)] = [m.dpsMult, m.goldMult, m.expMult, m.incomingDmgMult];
      }
      return {
        heroId: hero.id,
        archetype: hero.activeSkillArchetype,
        trait: hero.passiveTrait,
        byRank,
      };
    }),
  };
}

describe('unique relic fixture', () => {
  const fixture = build();

  it('covers every hero, not a sample', () => {
    expect(fixture.heroes.length).toBe(HERO_POOL.length);
    expect(fixture.heroes.length).toBeGreaterThan(60);
  });

  it('covers every archetype and trait combination present in the roster', () => {
    const combos = new Set(fixture.heroes.map(hero => `${hero.archetype}+${hero.trait}`));
    // The matrix is 4x4; the roster need not populate all sixteen, but it
    // should populate enough that no archetype or trait is untested.
    expect(new Set(fixture.heroes.map(hero => hero.archetype)).size).toBe(4);
    expect(new Set(fixture.heroes.map(hero => hero.trait)).size).toBe(4);
    expect(combos.size).toBeGreaterThanOrEqual(14);
  });

  it('clamps rank to 1-10 at both ends', () => {
    for (const hero of fixture.heroes) {
      // 0, -4 and fractional ranks floor into the clamp; 11 saturates at 10.
      expect(hero.byRank['0']).toEqual(hero.byRank['1']);
      expect(hero.byRank['-4']).toEqual(hero.byRank['1']);
      // 3.7 floors to 3. Rank 3 is sampled so this compares two different
      // entries rather than, as it did at first, one entry with itself.
      expect(hero.byRank['3.7']).toEqual(hero.byRank['3']);
      expect(hero.byRank['11']).toEqual(hero.byRank['10']);
    }
  });

  it('records that every effectFamily override in the data is legacy and inert', () => {
    const source = readFileSync(join(__dirname, '..', 'src', 'gameConfig.ts'), 'utf8');
    const overrides = [...source.matchAll(/effectFamily: '([a-z]+)'/g)].map(match => match[1]);
    const modern = [
      'bastion',
      'convoy',
      'onslaught',
      'phalanx',
      'command',
      'cataclysm',
      'judgment',
      'ambush',
      'execution',
      'oracle',
      'sanctuary',
      'harvest',
      'spellfire',
      'chronicle',
    ];

    expect(overrides.length).toBeGreaterThan(0);
    // If this ever fails, someone gave a hero a modern family override and the
    // rewrite's matrix-only resolver would stop matching for that hero.
    expect(overrides.filter(value => modern.includes(value))).toEqual([]);
  });

  it('gives every hero sharing a combination the same modifiers', () => {
    // The corollary of the overrides being inert: the combination is the only
    // input, so the rewrite can resolve from it alone.
    const byCombo = new Map<string, HeroRow['byRank']>();
    for (const hero of fixture.heroes) {
      const key = `${hero.archetype}+${hero.trait}`;
      const seen = byCombo.get(key);
      if (seen) expect(hero.byRank).toEqual(seen);
      else byCombo.set(key, hero.byRank);
    }
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_RELIC_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }

    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
