import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { SKILLS, type PlayerClass } from '../src/gameConfig';
import { DEFAULT_STATE, computeStats, getDpsBreakdown, reducer, type GameState } from '../src/useGameState';

/**
 * The skills tree, measured — and the answer is that there is not one.
 *
 * `SKILLS` lists three upgrades with a `multiplier` and a `targetId: 'click'`,
 * `BUY_SKILL` charges for them and records them, and the save round-trips
 * them. **Nothing reads them.** No damage path consumes the multiplier, no
 * screen dispatches the action, and there is no click or tap attack in the
 * game for `'click'` to refer to.
 *
 * So this fixture exists to stop a future phase "porting" it. A parity plan
 * that lists `BUY_SKILL` alongside `SUMMON_HERO` invites someone to build a
 * screen for it, and the result would be a gold sink that charges a quarter of
 * a million and hands back nothing — reproducing a defect faithfully is still
 * shipping the defect.
 *
 * Measured rather than asserted from reading, because "nothing reads it" is
 * exactly the claim a grep can get wrong.
 *
 * Regenerate deliberately:
 *   UPDATE_SKILLS_FIXTURE=1 npx jest __tests__/skillsFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'content', '__fixtures__', 'skills.json');

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    level: 50,
    gold: 10_000_000,
    statsAlloc: { strength: 100, vitality: 0, agility: 0, intelligence: 0, spirit: 0 },
    ...overrides,
  };
}

interface Fixture {
  note: string;
  generatedFrom: string;
  /** The catalogue, verbatim. */
  skills: { id: string; name: string; description: string; cost: number; targetId: string; multiplier: number }[];
  /** Buying every one of them, and what it changed. */
  buyingEverything: {
    owned: number;
    goldSpent: number;
    /** Each of these is the same before and after. That is the finding. */
    finalDpsMoved: boolean;
    totalMultiplierMoved: boolean;
    playerBaseDpsMoved: boolean;
    computedStatsMoved: boolean;
  };
  /** Refusals, which are the only behaviour `BUY_SKILL` actually has. */
  refusals: { name: string; owned: number; goldSpent: number }[];
}

function build(): Fixture {
  const base = state();
  let bought = base;
  for (const skill of SKILLS) bought = reducer(bought, { type: 'BUY_SKILL', id: skill.id } as never);

  const before = getDpsBreakdown(base);
  const after = getDpsBreakdown(bought);

  const refusal = (name: string, from: GameState, id: string) => {
    const next = reducer(from, { type: 'BUY_SKILL', id } as never);
    return { name, owned: next.skills.size, goldSpent: from.gold - next.gold };
  };

  return {
    note: 'The skills tree, and the measurement showing it does nothing.',
    generatedFrom: 'src/gameConfig.ts SKILLS, src/reducers/economyReducer.ts BUY_SKILL',
    skills: SKILLS.map(skill => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      cost: skill.cost,
      targetId: skill.targetId,
      multiplier: skill.multiplier,
    })),
    buyingEverything: {
      owned: bought.skills.size,
      goldSpent: base.gold - bought.gold,
      finalDpsMoved: before.finalDps !== after.finalDps,
      totalMultiplierMoved: before.totalMultiplier !== after.totalMultiplier,
      playerBaseDpsMoved: before.playerBaseDps !== after.playerBaseDps,
      computedStatsMoved: JSON.stringify(computeStats(base)) !== JSON.stringify(computeStats(bought)),
    },
    refusals: [
      refusal('already owned', bought, SKILLS[0].id),
      refusal('cannot afford', state({ gold: 0 }), SKILLS[0].id),
      refusal('no such skill', base, 'not_a_skill'),
    ],
  };
}

describe('the skills tree', () => {
  const fixture = build();

  it('lists three upgrades, each with a multiplier and a target', () => {
    expect(fixture.skills).toHaveLength(3);
    expect(fixture.skills.every(skill => skill.targetId === 'click')).toBe(true);
    expect(fixture.skills.every(skill => skill.multiplier > 1)).toBe(true);
  });

  it('charges for every one of them', () => {
    expect(fixture.buyingEverything.owned).toBe(3);
    expect(fixture.buyingEverything.goldSpent).toBe(fixture.skills.reduce((sum, skill) => sum + skill.cost, 0));
  });

  it('changes nothing at all in return', () => {
    /*
     * The finding, and the whole reason this file exists. A quarter of a
     * million gold buys every skill in the game and moves no number anywhere:
     * not the player's damage, not the multiplier stack, not their stats.
     *
     * `multiplier` and `targetId: 'click'` are read by nothing, and there is
     * no click or tap attack for `'click'` to mean. Measured rather than
     * grepped, because "nothing reads it" is the claim a grep gets wrong.
     */
    expect(fixture.buyingEverything).toMatchObject({
      finalDpsMoved: false,
      totalMultiplierMoved: false,
      playerBaseDpsMoved: false,
      computedStatsMoved: false,
    });
  });

  it('refuses a second purchase, an empty purse and an unknown id', () => {
    // The only behaviour `BUY_SKILL` actually has, and all three are refusals.
    expect(fixture.refusals).toEqual([
      { name: 'already owned', owned: 3, goldSpent: 0 },
      { name: 'cannot afford', owned: 0, goldSpent: 0 },
      { name: 'no such skill', owned: 0, goldSpent: 0 },
    ]);
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_SKILLS_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
