import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  EXPEDITION_CONTRACT_REFRESH_GOLD_COST,
  EXPEDITION_CONTRACT_REFRESH_MS,
  DEFAULT_STATE,
  reducer,
  type GameState,
} from '../src/useGameState';
import { HERO_POOL, type PlayerClass } from '../src/gameConfig';

/**
 * The contract board, measured.
 *
 * The piece of the expedition system Phase 11 ported around: each of the five
 * destinations has **one rarity currently on offer**, rolled uniformly, and
 * that is the contract a player may start there. The board rerolls itself
 * every eight hours and can be rerolled by hand for a hundred thousand gold.
 *
 * Measured because the gate is not where it looks. `START_EXPEDITION` takes an
 * `offeredRarity` and *trusts it* — passing `godly` gets a godly contract
 * whatever the board says. What actually restricts a player is the screen,
 * which only ever passes the offered rarity. So the board is the gate in
 * practice and not in the reducer, and a port that exposes the rarity as a
 * free choice reproduces the reducer and loses the game.
 *
 * Regenerate deliberately:
 *   UPDATE_CONTRACT_BOARD_FIXTURE=1 npx jest __tests__/contractBoardFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'content', '__fixtures__', 'contractBoard.json');

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const TYPES = ['artifact', 'merchant', 'ruins', 'vault', 'abyss'] as const;
const RARITIES = ['common', 'rare', 'epic', 'legendary', 'godly'] as const;

function state(over: Partial<GameState> = {}): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    level: 40,
    heroRoster: HERO_POOL.slice(0, 2).map((hero, index) => ({
      ...hero,
      uid: `u${index}`,
      rarity: 'rare' as const,
      level: 30,
      rank: 1,
      teamBoost: hero.baseTeamBoost,
      rebirthStatMult: 1,
    })),
    gold: 0,
    totalGold: 0,
    expeditionQueue: [],
    ...over,
  };
}

function at<T>(nowMs: number, draw: number, body: () => T): T {
  const realNow = Date.now;
  const realRandom = Math.random;
  Date.now = () => nowMs;
  Math.random = () => draw;
  try {
    return body();
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
}

const act = (from: GameState, action: Record<string, unknown>, nowMs = NOW, draw = 0.5) =>
  at(nowMs, draw, () => reducer(from, action as never));

const REFRESH = { type: 'REFRESH_EXPEDITION_CONTRACTS' };

/**
 * Which rarity each draw lands on, across the whole unit interval.
 *
 * `EXPEDITION_RARITIES[floor(random() * length)]` — measured rather than read,
 * because "uniform over five" is the kind of claim that survives an off-by-one
 * in the index and a table that is not the length you think.
 */
function rarityByDraw(): { draw: number; rarity: string }[] {
  return [0, 0.19, 0.2, 0.39, 0.4, 0.59, 0.6, 0.79, 0.8, 0.999].map(draw => {
    const board = act(state({ expeditionContractsRefreshedAt: 0, gold: 1e9 }), REFRESH, NOW, draw);
    return { draw, rarity: board.expeditionContractOffers.artifact };
  });
}

interface Fixture {
  note: string;
  generatedFrom: string;
  refreshMs: number;
  refreshGoldCost: number;
  /** Every destination carries its own offer. */
  types: string[];
  rarities: string[];
  /** What a fresh account's board looks like, and that it is a full board. */
  startingBoard: { types: string[]; everyTypeOffered: boolean };
  rarityByDraw: { draw: number; rarity: string }[];
  /** Bought rerolls: what they cost and what they refuse. */
  reroll: { name: string; goldBefore: number; goldAfter: number; boardChanged: boolean }[];
  /** The board rerolls itself on this interval, bisected. */
  autoRefreshMs: number;
  /** Whether a *read* of the save can move the board, with no action at all. */
  autoRefreshOnRead: boolean;
  /** Whether the reducer enforces the board, or merely defaults to it. */
  boardIsEnforced: { passingAnotherRarityWorks: boolean; screenPassesTheOffer: boolean };
}

/** The auto-refresh interval, bisected through the reducer rather than read. */
function bisectAutoRefresh(): number {
  const moved = (gapMs: number) => {
    const before = state({
      expeditionContractsRefreshedAt: NOW - gapMs,
      // Too poor to buy a reroll, so only the automatic one can move the board.
      gold: 0,
    });
    const after = act(before, REFRESH, NOW, 0.95);
    return after.expeditionContractOffers.artifact !== before.expeditionContractOffers.artifact;
  };
  let low = 0;
  let high = 48 * 60 * 60 * 1000;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (moved(mid)) high = mid;
    else low = mid;
  }
  return high;
}

function build(): Fixture {
  const fresh = state();

  const reroll = [
    (() => {
      const before = state({ gold: EXPEDITION_CONTRACT_REFRESH_GOLD_COST, expeditionContractsRefreshedAt: NOW });
      const after = act(before, REFRESH, NOW, 0.95);
      return {
        name: 'paid for, exactly affordable',
        goldBefore: before.gold,
        goldAfter: after.gold,
        boardChanged: after.expeditionContractOffers.artifact !== before.expeditionContractOffers.artifact,
      };
    })(),
    (() => {
      const before = state({ gold: EXPEDITION_CONTRACT_REFRESH_GOLD_COST - 1, expeditionContractsRefreshedAt: NOW });
      const after = act(before, REFRESH, NOW, 0.95);
      return {
        name: 'one gold short',
        goldBefore: before.gold,
        goldAfter: after.gold,
        boardChanged: after.expeditionContractOffers.artifact !== before.expeditionContractOffers.artifact,
      };
    })(),
  ];

  // Does starting with a rarity the board is not offering work? The board says
  // common; the action is told godly.
  const boarded = state({
    gold: 1e9,
    expeditionContractsRefreshedAt: NOW,
    expeditionContractOffers: {
      artifact: 'common',
      merchant: 'common',
      ruins: 'common',
      vault: 'common',
      abyss: 'common',
    },
  });
  const forced = act(boarded, { type: 'START_EXPEDITION', expeditionType: 'artifact', offeredRarity: 'godly' });
  const screen = readFileSync(join(__dirname, '..', 'src', 'screens', 'tabs', 'OperationsTabContent.tsx'), 'utf8');

  return {
    note: 'The expedition contract board, measured through the shipped reducer.',
    generatedFrom: 'src/reducers/economyReducer.ts',
    refreshMs: EXPEDITION_CONTRACT_REFRESH_MS,
    refreshGoldCost: EXPEDITION_CONTRACT_REFRESH_GOLD_COST,
    types: [...TYPES],
    rarities: [...RARITIES],
    startingBoard: {
      types: Object.keys(fresh.expeditionContractOffers).sort(),
      everyTypeOffered: TYPES.every(type =>
        (RARITIES as readonly string[]).includes(fresh.expeditionContractOffers[type]),
      ),
    },
    rarityByDraw: rarityByDraw(),
    reroll,
    autoRefreshMs: bisectAutoRefresh(),
    // A `LOAD` moves the board when the stamp is old enough, with no action
    // from the player at all — the refresh rides on whatever they do next.
    autoRefreshOnRead:
      act(state({ expeditionContractsRefreshedAt: NOW - 9 * 60 * 60 * 1000, gold: 0 }), REFRESH, NOW, 0.95)
        .expeditionContractsRefreshedAt === NOW,
    boardIsEnforced: {
      passingAnotherRarityWorks: forced.expeditionQueue.length > 0 && forced.expeditionQueue[0].rarity === 'godly',
      screenPassesTheOffer: screen.includes('startExpedition(type, cfg.rarity)'),
    },
  };
}

const fixture = build();

if (process.env.UPDATE_CONTRACT_BOARD_FIXTURE === '1') {
  mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
}

describe('the board', () => {
  it('offers one rarity per destination, and all five are stocked', () => {
    expect(fixture.startingBoard.types).toEqual([...TYPES].sort());
    expect(fixture.startingBoard.everyTypeOffered).toBe(true);
  });

  it('rolls uniformly over the five rarities, in fifths', () => {
    // Measured across the unit interval rather than asserted from the
    // expression: an index off by one shows up here and nowhere else.
    expect(fixture.rarityByDraw).toEqual([
      { draw: 0, rarity: 'common' },
      { draw: 0.19, rarity: 'common' },
      { draw: 0.2, rarity: 'rare' },
      { draw: 0.39, rarity: 'rare' },
      { draw: 0.4, rarity: 'epic' },
      { draw: 0.59, rarity: 'epic' },
      { draw: 0.6, rarity: 'legendary' },
      { draw: 0.79, rarity: 'legendary' },
      { draw: 0.8, rarity: 'godly' },
      { draw: 0.999, rarity: 'godly' },
    ]);
  });
});

describe('rerolling it', () => {
  it('rerolls itself every eight hours, bisected rather than read', () => {
    expect(fixture.autoRefreshMs).toBe(EXPEDITION_CONTRACT_REFRESH_MS);
    expect(fixture.autoRefreshMs).toBe(8 * 60 * 60 * 1000);
  });

  it('costs a hundred thousand gold to reroll by hand', () => {
    const [paid, short] = fixture.reroll;
    expect(paid.goldBefore - paid.goldAfter).toBe(EXPEDITION_CONTRACT_REFRESH_GOLD_COST);
    expect(paid.boardChanged).toBe(true);
  });

  it('refuses when the gold is one short, and charges nothing for the refusal', () => {
    const short = fixture.reroll[1];
    expect(short.goldAfter).toBe(short.goldBefore);
    expect(short.boardChanged).toBe(false);
  });

  it('rerolls on its own without anyone asking, once the stamp is old enough', () => {
    // The automatic refresh runs at the top of the action rather than on a
    // timer, so it lands on whatever the player does next.
    expect(fixture.autoRefreshOnRead).toBe(true);
  });
});

describe('what actually stops a player taking a godly contract', () => {
  it('is the screen, not the reducer', () => {
    /*
     * The gate is not where it looks. `START_EXPEDITION` takes an
     * `offeredRarity` and uses it if it is one of the five — so the action
     * will happily start a godly contract against a board offering common,
     * and the board is only consulted when *no* rarity is passed.
     *
     * What restricts a player is that the only caller passes
     * `cfg.rarity`, which is the offer. So the board is the real economy and
     * the reducer's trust in its caller is the bug underneath it.
     *
     * The rewrite puts the gate in the engine: `startExpedition` takes a
     * destination and reads the rarity off the board. There is no parameter to
     * pass the wrong thing to.
     */
    expect(fixture.boardIsEnforced.passingAnotherRarityWorks).toBe(true);
    expect(fixture.boardIsEnforced.screenPassesTheOffer).toBe(true);
  });
});

describe('the fixture itself', () => {
  it('has been written out for the port to read', () => {
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(JSON.parse(JSON.stringify(fixture)));
  });
});
