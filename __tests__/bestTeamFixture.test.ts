import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { HERO_POOL, type PlayerClass, type Rarity } from '../src/gameConfig';
import { DEFAULT_STATE, reducer, type GameState } from '../src/useGameState';

/**
 * "Field my best heroes", measured — and the finding is what it *is*.
 *
 * The rewrite's automation catalogue lists `equipBest` as the ninth of nine
 * shipped `auto*` flags, keyed to `autoEquipBestHeroes`. **There is no such
 * flag.** `autoEquipBestHeroes` is the name of a `useCallback` that dispatches
 * `AUTO_EQUIP_BEST_HEROES`, wired to a button a player presses; the shipped
 * state has eight `auto*Enabled` booleans and this is not one of them.
 *
 * So it is not an automation waiting on a rule nobody ported. It is a **verb**,
 * and it has been sitting in a catalogue of automatic things being described as
 * one of them for six phases.
 *
 * Measured rather than read, because the sort has four keys and the third and
 * fourth never come up unless a roster is built to make them.
 *
 * Regenerate deliberately:
 *   UPDATE_BEST_TEAM_FIXTURE=1 npx jest __tests__/bestTeamFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'content', '__fixtures__', 'best-team.json');

interface HeroSpec {
  uid: string;
  /** Which template, which decides the class and so the default rank. */
  template: string;
  rarity: Rarity;
  level: number;
  teamBoost: number;
  rebirthStatMult?: number;
}

function hero(spec: HeroSpec) {
  const template = HERO_POOL.find(entry => entry.id === spec.template)!;
  return {
    ...template,
    uid: spec.uid,
    rarity: spec.rarity,
    level: spec.level,
    rank: 1,
    teamBoost: spec.teamBoost,
    rebirthStatMult: spec.rebirthStatMult ?? 1,
  };
}

function state(roster: HeroSpec[], over: Partial<GameState> = {}): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    level: 40,
    heroRoster: roster.map(hero),
    activeTeamHeroIds: [],
    teamSlotsUnlocked: 6,
    ...over,
  } as GameState;
}

function field(roster: HeroSpec[], over: Partial<GameState> = {}): string[] {
  return reducer(state(roster, over), { type: 'AUTO_EQUIP_BEST_HEROES' } as never).activeTeamHeroIds;
}

/**
 * One template per class, so a roster can be built without two heroes
 * colliding on the same rank or the same base id unless a case wants them to.
 */
const BY_CLASS = Object.fromEntries(
  (['warrior', 'berserker', 'archer', 'mage', 'monk'] as PlayerClass[]).map(playerClass => [
    playerClass,
    HERO_POOL.filter(entry => entry.heroClass === playerClass).map(entry => entry.id),
  ]),
) as Record<PlayerClass, string[]>;

interface Fixture {
  note: string;
  generatedFrom: string;
  /** Whether a settings flag of this name exists on the shipped state. */
  isASettingsFlag: boolean;
  /** The eight that are. */
  shippedAutoFlags: string[];
  cases: { name: string; roster: HeroSpec[]; fielded: string[] }[];
}

function build(): Fixture {
  const at = (name: string, roster: HeroSpec[], over: Partial<GameState> = {}) => ({
    name,
    roster,
    fielded: field(roster, over),
  });

  const two = (playerClass: PlayerClass) => BY_CLASS[playerClass].slice(0, 2);
  const [warriorA, warriorB, warriorC] = BY_CLASS.warrior.slice(0, 3);
  const [mageA, mageB] = two('mage');
  const [archerA] = two('archer');

  return {
    note: 'AUTO_EQUIP_BEST_HEROES, measured through the shipped reducer.',
    generatedFrom: 'src/reducers/rosterReducer.ts',
    isASettingsFlag: 'autoEquipBestHeroes' in DEFAULT_STATE,
    shippedAutoFlags: Object.keys(DEFAULT_STATE)
      .filter(
        key =>
          /^auto[A-Z]/.test(key) && typeof (DEFAULT_STATE as unknown as Record<string, unknown>)[key] === 'boolean',
      )
      .sort(),
    cases: [
      at('rarity outranks everything else', [
        { uid: 'low', template: warriorA, rarity: 'common', level: 999, teamBoost: 999, rebirthStatMult: 9 },
        { uid: 'high', template: mageA, rarity: 'legendary', level: 1, teamBoost: 1 },
      ]),
      at('then the rebirth multiplier', [
        { uid: 'plain', template: warriorA, rarity: 'rare', level: 999, teamBoost: 999 },
        { uid: 'reborn', template: mageA, rarity: 'rare', level: 1, teamBoost: 1, rebirthStatMult: 2 },
      ]),
      at('which ignores a difference below a ten-thousandth', [
        // 1.00005 against 1 is a real difference and not one this sort sees, so
        // the level below it decides instead.
        { uid: 'hair', template: warriorA, rarity: 'rare', level: 1, teamBoost: 1, rebirthStatMult: 1.00005 },
        { uid: 'levelled', template: mageA, rarity: 'rare', level: 9, teamBoost: 1 },
      ]),
      at('then the level', [
        { uid: 'junior', template: warriorA, rarity: 'rare', level: 1, teamBoost: 999 },
        { uid: 'senior', template: mageA, rarity: 'rare', level: 9, teamBoost: 1 },
      ]),
      at('then the team boost', [
        { uid: 'quiet', template: warriorA, rarity: 'rare', level: 9, teamBoost: 1 },
        { uid: 'loud', template: mageA, rarity: 'rare', level: 9, teamBoost: 2 },
      ]),
      at('skips a second copy of the same hero', [
        { uid: 'first', template: warriorA, rarity: 'legendary', level: 9, teamBoost: 9 },
        { uid: 'copy', template: warriorA, rarity: 'legendary', level: 8, teamBoost: 8 },
        { uid: 'other', template: mageA, rarity: 'common', level: 1, teamBoost: 1 },
      ]),
      at('takes only two heroes to a rank, however good the third is', [
        // Three of one class, all better than the one hero of another. The
        // third is passed over for a worse hero who fits somewhere else, with
        // four slots still free — which is the rank cap and nothing else.
        { uid: 'w1', template: warriorA, rarity: 'legendary', level: 9, teamBoost: 9 },
        { uid: 'w2', template: warriorB, rarity: 'legendary', level: 8, teamBoost: 8 },
        { uid: 'w3', template: warriorC, rarity: 'legendary', level: 7, teamBoost: 7 },
        { uid: 'm1', template: mageA, rarity: 'common', level: 1, teamBoost: 1 },
      ]),
      at(
        'fields no more than the slots the account has bought',
        [
          { uid: 'w1', template: warriorA, rarity: 'legendary', level: 9, teamBoost: 9 },
          { uid: 'w2', template: warriorB, rarity: 'legendary', level: 8, teamBoost: 8 },
          { uid: 'm1', template: mageA, rarity: 'epic', level: 7, teamBoost: 7 },
          { uid: 'm2', template: mageB, rarity: 'epic', level: 6, teamBoost: 6 },
          { uid: 'a1', template: archerA, rarity: 'rare', level: 5, teamBoost: 5 },
        ],
        { teamSlotsUnlocked: 4 },
      ),
      at('fields nobody from an empty roster', []),
    ],
  };
}

describe('what "field my best" actually is', () => {
  const fixture = build();

  it('is a button, not one of the shipped automation flags', () => {
    /*
     * The finding. `autoEquipBestHeroes` is a `useCallback` name, dispatched
     * from a `Pressable`; the shipped state has no boolean by that name and
     * the reducer case takes no flag. The rewrite's catalogue has been calling
     * it the ninth of nine automations since Phase 4.
     */
    expect(fixture.isASettingsFlag).toBe(false);
    expect(fixture.shippedAutoFlags).toEqual([
      'autoBurstEnabled',
      'autoCastHeroActivesEnabled',
      'autoDismantleEnabled',
      'autoRecycleEnabled',
      'autoSummonEnabled',
      'autoTempoEnabled',
      'autoUseCoolantEnabled',
      'autoUsePotionEnabled',
    ]);
    expect(fixture.shippedAutoFlags).toHaveLength(8);
  });
});

describe('the order it picks in', () => {
  const fixture = build();
  const fielded = (name: string) => fixture.cases.find(entry => entry.name === name)!.fielded;

  it('ranks rarity above every other key', () => {
    // A level-999 common with a 9x rebirth multiplier still loses to a
    // level-one legendary, which is the whole shape of the sort.
    expect(fielded('rarity outranks everything else')).toEqual(['high', 'low']);
  });

  it('breaks a rarity tie on the rebirth multiplier, before level', () => {
    expect(fielded('then the rebirth multiplier')).toEqual(['reborn', 'plain']);
  });

  it('treats a difference below a ten-thousandth as no difference', () => {
    // `Math.abs(statMultDiff) > 0.0001` — so 1.00005 and 1 tie and the level
    // decides. Worth pinning: a port comparing them directly would swap these.
    expect(fielded('which ignores a difference below a ten-thousandth')).toEqual(['levelled', 'hair']);
  });

  it('breaks the next tie on level, and the last on team boost', () => {
    expect(fielded('then the level')).toEqual(['senior', 'junior']);
    expect(fielded('then the team boost')).toEqual(['loud', 'quiet']);
  });
});

describe('what the selection rules do to the order', () => {
  const fixture = build();
  const fielded = (name: string) => fixture.cases.find(entry => entry.name === name)!.fielded;

  it('never fields two copies of the same hero', () => {
    expect(fielded('skips a second copy of the same hero')).toEqual(['first', 'other']);
  });

  it('never puts three heroes in one rank', () => {
    /*
     * The third-best hero in the game is passed over for the worst one, with
     * four slots still empty, because their rank is full. The sort proposes an
     * order and the formation rules decide who fits — and this is the case
     * that separates them, which the first version of it did not: it had two
     * per rank already, so raising the cap to three changed nothing and the
     * test stayed green.
     */
    expect(fielded('takes only two heroes to a rank, however good the third is')).toEqual(['w1', 'w2', 'm1']);
  });

  it('stops at the slots the account has bought', () => {
    expect(fielded('fields no more than the slots the account has bought')).toEqual(['w1', 'w2', 'm1', 'm2']);
  });

  it('fields nobody from an empty roster rather than failing', () => {
    expect(fielded('fields nobody from an empty roster')).toEqual([]);
  });
});

describe('the committed fixture', () => {
  it('matches what the rewrite is measured against', () => {
    const fixture = build();
    if (process.env.UPDATE_BEST_TEAM_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
