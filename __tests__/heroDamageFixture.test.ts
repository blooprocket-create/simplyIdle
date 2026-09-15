import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { HERO_POOL, rarityConfig, type HeroTemplate, type HeroUnit, type Rarity } from '../src/gameConfig';
import { DEFAULT_STATE, getDpsBreakdown, type GameState } from '../src/useGameState';

/**
 * Reference values for the rewrite's per-hero damage model.
 *
 * The shipped code never exposes a single hero's damage — `getDpsBreakdown`
 * accumulates them with `heroDps += heroDmg` and returns only the total. But a
 * team of one makes that total *be* the one hero's damage, so the per-hero
 * reference can be read out of the old implementation without changing it.
 *
 * That is what makes the rewrite's central structural claim checkable: keeping
 * heroes as separate entities is not a rebalance, and the parts still sum to
 * the whole.
 *
 * Regenerate deliberately:
 *   UPDATE_HERO_FIXTURE=1 npx jest __tests__/heroDamageFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'engine', 'combat', '__fixtures__', 'hero-damage.json');

/** One hero per class and per tier, at a spread of levels, ranks and rarities. */
const SAMPLES: { heroId: string; level: number; rank: number; rarity: Rarity }[] = [];

function pickSamples(): void {
  const byClass = new Map<string, HeroTemplate[]>();
  for (const hero of HERO_POOL) {
    const list = byClass.get(hero.heroClass) ?? [];
    list.push(hero);
    byClass.set(hero.heroClass, list);
  }

  const levels = [1, 17, 60, 140, 400, 999];
  const ranks = [1, 3, 5, 6, 9, 10];
  const rarities: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic', 'transcendent'];

  let index = 0;
  for (const [, heroes] of [...byClass.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // Lowest and highest tier available in each class, so TIER_GROWTH_MULT and
    // the per-hero variance hash are both exercised.
    const sorted = [...heroes].sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
    for (const hero of [sorted[0], sorted[sorted.length - 1]]) {
      SAMPLES.push({
        heroId: hero.id,
        level: levels[index % levels.length],
        rank: ranks[index % ranks.length],
        rarity: rarities[index % rarities.length],
      });
      index++;
    }
  }
}
pickSamples();

function buildUnit(sample: (typeof SAMPLES)[number]): HeroUnit {
  const template = HERO_POOL.find(hero => hero.id === sample.heroId);
  if (!template) throw new Error(`Unknown hero ${sample.heroId}`);
  return {
    ...template,
    uid: `${template.id}_fixture`,
    rarity: sample.rarity,
    level: sample.level,
    rank: sample.rank,
    teamBoost: template.baseTeamBoost * rarityConfig(sample.rarity).boostMultiplier,
    rebirthStatMult: 1,
  };
}

/**
 * A state whose only damage source is the given roster. Multipliers are left
 * at their defaults so `heroBaseDps` is the raw contribution — the multiplier
 * stack is a separate concern with its own parity work.
 */
function stateWith(roster: HeroUnit[]): GameState {
  return {
    ...DEFAULT_STATE,
    skills: new Set(DEFAULT_STATE.skills),
    achievements: new Set(DEFAULT_STATE.achievements),
    characterCreated: true,
    playerClass: 'warrior',
    heroRoster: roster,
    activeTeamHeroIds: roster.map(hero => hero.uid),
    heroFormationByUid: {},
    heroUniqueGearByHeroId: {},
  };
}

interface HeroRow {
  heroId: string;
  heroClass: string;
  tier: number;
  level: number;
  rank: number;
  rarity: Rarity;
  damage: number;
}

interface Fixture {
  note: string;
  generatedFrom: string;
  heroes: HeroRow[];
  /** The old scalar for the whole sample as one team. */
  teamTotal: number;
}

function build(): Fixture {
  const heroes: HeroRow[] = SAMPLES.map(sample => {
    const unit = buildUnit(sample);
    const template = HERO_POOL.find(hero => hero.id === sample.heroId)!;
    return {
      heroId: sample.heroId,
      heroClass: template.heroClass,
      tier: template.tier,
      level: sample.level,
      rank: sample.rank,
      rarity: sample.rarity,
      // A team of one: the accumulated total is this hero's contribution.
      damage: getDpsBreakdown(stateWith([unit])).heroBaseDps,
    };
  });

  return {
    note: 'Per-hero damage from the shipped implementation, read out one hero at a time. Owned by __tests__/heroDamageFixture.test.ts.',
    generatedFrom: 'src/useGameState.ts getDpsBreakdown',
    heroes,
    teamTotal: getDpsBreakdown(stateWith(SAMPLES.map(buildUnit))).heroBaseDps,
  };
}

describe('hero damage fixture', () => {
  const fixture = build();

  it('samples every class and both tier extremes', () => {
    expect(fixture.heroes.length).toBe(10);
    expect(new Set(fixture.heroes.map(hero => hero.heroClass)).size).toBe(5);
    expect(fixture.heroes.every(hero => hero.damage > 0)).toBe(true);
  });

  it('the shipped total is the sum of its shipped parts', () => {
    // If this ever fails, the old implementation does something to the team
    // beyond accumulating per-hero damage, and the rewrite's split would be
    // dropping it. Float addition order makes exactness the wrong bar.
    const summed = fixture.heroes.reduce((total, hero) => total + hero.damage, 0);
    expect(Math.abs(summed - fixture.teamTotal) / fixture.teamTotal).toBeLessThanOrEqual(1e-12);
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_HERO_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }

    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
