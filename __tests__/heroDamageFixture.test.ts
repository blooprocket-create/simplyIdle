import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  HERO_POOL,
  rarityConfig,
  type HeroTemplate,
  type HeroUnit,
  type PlayerClass,
  type Rarity,
} from '../src/gameConfig';
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

interface PlayerRow {
  playerClass: PlayerClass;
  level: number;
  alloc: { strength: number; vitality: number; agility: number; intelligence: number; spirit: number };
  damage: number;
}

interface Fixture {
  note: string;
  generatedFrom: string;
  heroes: HeroRow[];
  /** The old scalar for the whole sample as one team. */
  teamTotal: number;
  /**
   * The **player's own** damage contribution.
   *
   * `getDpsBreakdown` returns it as `playerBaseDps` and adds it to the hero
   * total before any multiplier: `(playerDps + heroDps) * totalMultiplier`. The
   * rewrite had no port of it at all — `app/roster.ts` sums heroes and stops —
   * so a character's class, level and spent stat points did nothing to the
   * damage the player actually deals.
   *
   * Sampled per class, because the formula reads `physWeight` and `magicWeight`
   * four times between them and a port that dropped one would still look right
   * for a warrior.
   */
  players: PlayerRow[];
  /**
   * The whole fourteen-factor damage stack, from complete states.
   *
   * The individual multipliers each have their own fixture already. What none
   * of them records is the **product**, and the product is where a port goes
   * wrong in ways the parts cannot show: a factor left out, a factor applied
   * twice, or — because float multiplication is not associative — the shipped
   * sequence reproduced in a different order.
   */
  stacks: StackRow[];
}

interface StackRow {
  name: string;
  note: string;
  multipliers: Record<string, number>;
  totalMultiplier: number;
  playerBaseDps: number;
  heroBaseDps: number;
  finalDps: number;
}

const NOTHING = { strength: 0, vitality: 0, agility: 0, intelligence: 0, spirit: 0 };

/** One state per class, at a spread of levels and allocations. */
const PLAYER_SAMPLES: { playerClass: PlayerClass; level: number; alloc: typeof NOTHING }[] = [
  { playerClass: 'warrior', level: 1, alloc: NOTHING },
  { playerClass: 'warrior', level: 90, alloc: { ...NOTHING, strength: 120, agility: 40 } },
  { playerClass: 'berserker', level: 30, alloc: { ...NOTHING, strength: 60 } },
  { playerClass: 'mage', level: 45, alloc: { ...NOTHING, intelligence: 80, spirit: 25 } },
  { playerClass: 'archer', level: 12, alloc: { ...NOTHING, agility: 30 } },
  { playerClass: 'monk', level: 250, alloc: { strength: 50, vitality: 50, agility: 50, intelligence: 50, spirit: 50 } },
];

/**
 * Complete states whose damage stack is worth recording.
 *
 * Each one turns on a different part: the ones a fresh account never sees are
 * exactly the ones a port can drop without any early test noticing.
 */
const STACK_SAMPLES: { name: string; note: string; state: () => GameState }[] = [
  {
    name: 'fresh',
    note: 'A new account: every factor at its identity, so the product is 1.',
    state: () => stateWith([]),
  },
  {
    name: 'one-hero',
    note: 'A single fielded hero, which is enough to move formation and the team boost.',
    state: () => stateWith([buildUnit(SAMPLES[0])]),
  },
  {
    name: 'full-team',
    note: 'Six heroes across classes, so synergy and the formation ranks both fire.',
    state: () => stateWith(SAMPLES.slice(0, 6).map(buildUnit)),
  },
  {
    name: 'deep-progression',
    note: 'Rebirths, meta levels, achievements, mastery, VIP, the tactics facility and a buff.',
    state: () => ({
      ...stateWith(SAMPLES.slice(0, 6).map(buildUnit)),
      prestigeCount: 7,
      metaDamageLevel: 24,
      rebirthDamagePath: 5,
      achievements: new Set(['a', 'b', 'c', 'd', 'e']) as unknown as GameState['achievements'],
      permanentUnlocks: ['class_passive'] as GameState['permanentUnlocks'],
      classMasteryXp: { warrior: 5_200 } as GameState['classMasteryXp'],
      vipLevel: 6,
      damageBuffPct: 0.35,
      guildhallFacilities: {
        ...DEFAULT_STATE.guildhallFacilities,
        tactics: { ...DEFAULT_STATE.guildhallFacilities.tactics, level: 12 },
      },
    }),
  },
  {
    name: 'relics-equipped',
    note: 'Unique relics on fielded heroes, the loosest cap in the game at 40x.',
    state: () => {
      const team = SAMPLES.slice(0, 3).map(buildUnit);
      return {
        ...stateWith(team),
        heroUniqueGearByHeroId: Object.fromEntries(
          team.map(hero => [hero.id, { rank: 7, equippedByUid: hero.uid }]),
        ) as GameState['heroUniqueGearByHeroId'],
      };
    },
  },
];

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

  const players: PlayerRow[] = PLAYER_SAMPLES.map(sample => ({
    ...sample,
    // An empty roster, so the breakdown's player half stands alone.
    damage: getDpsBreakdown({
      ...stateWith([]),
      playerClass: sample.playerClass,
      level: sample.level,
      statsAlloc: sample.alloc,
    }).playerBaseDps,
  }));

  const stacks: StackRow[] = STACK_SAMPLES.map(sample => {
    const breakdown = getDpsBreakdown(sample.state());
    return {
      name: sample.name,
      note: sample.note,
      multipliers: { ...breakdown.multipliers },
      totalMultiplier: breakdown.totalMultiplier,
      playerBaseDps: breakdown.playerBaseDps,
      heroBaseDps: breakdown.heroBaseDps,
      finalDps: breakdown.finalDps,
    };
  });

  return {
    note: 'Per-hero damage from the shipped implementation, read out one hero at a time. Owned by __tests__/heroDamageFixture.test.ts.',
    generatedFrom: 'src/useGameState.ts getDpsBreakdown',
    heroes,
    teamTotal: getDpsBreakdown(stateWith(SAMPLES.map(buildUnit))).heroBaseDps,
    players,
    stacks,
  };
}

describe('hero damage fixture', () => {
  const fixture = build();

  it('samples every class and both tier extremes', () => {
    expect(fixture.heroes.length).toBe(10);
    expect(new Set(fixture.heroes.map(hero => hero.heroClass)).size).toBe(5);
    expect(fixture.heroes.every(hero => hero.damage > 0)).toBe(true);
  });

  it("records the player's own damage for every class", () => {
    /*
     * The player is a combatant and the rewrite forgot them: `playerDps` is
     * added to the hero total *before* any multiplier, and nothing in the port
     * computed it. A character's class, level and spent points did nothing.
     */
    expect(new Set(fixture.players.map(entry => entry.playerClass)).size).toBe(5);
    expect(fixture.players.every(entry => entry.damage > 0)).toBe(true);
    // A level-one warrior with nothing spent still deals something, which is
    // what makes "the player is a combatant" true from the first wave.
    expect(fixture.players[0].damage).toBeGreaterThan(0);
  });

  it('separates the player from the team, so neither absorbs the other', () => {
    // If `playerBaseDps` moved with the roster, sampling it against an empty
    // one would be measuring the wrong thing.
    const solo = getDpsBreakdown(stateWith([])).playerBaseDps;
    const withTeam = getDpsBreakdown(stateWith(SAMPLES.map(buildUnit))).playerBaseDps;
    expect(withTeam).toBe(solo);
  });

  it('records a stack where every factor is doing something', () => {
    /*
     * The guard on the stacks below. A sample set where the interesting
     * multipliers all sat at 1 would let a port that dropped them pass, which
     * is the exact failure the whole section exists to catch.
     */
    const deep = fixture.stacks.find(entry => entry.name === 'deep-progression')!;
    const idle = Object.entries(deep.multipliers).filter(([, value]) => value === 1);
    expect(idle.map(([name]) => name).sort()).toEqual(['uniqueRelics']);
    expect(deep.totalMultiplier).toBeGreaterThan(10);

    // And the relics have their own sample, because the deep one has none.
    const relics = fixture.stacks.find(entry => entry.name === 'relics-equipped')!;
    expect(relics.multipliers.uniqueRelics).toBeGreaterThan(1);
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
