import {
  CONTRACT_REFRESH_GOLD_COST,
  CONTRACT_REFRESH_MS,
  EXPEDITION_RARITIES,
  EXPEDITION_TYPES,
  contractFor,
  isExpeditionRarity,
  isExpeditionType,
  type ExpeditionContract,
  type ExpeditionRarity,
  type ExpeditionType,
} from '../../content/expeditions';
import { boundedInt, isRecord, MAX_SAVE_COLLECTION, SAFE_NUMBER_CAP } from '../save/guards';
import type { SaveV3 } from '../save/schema';

/**
 * Sending an expedition, and bringing it home.
 *
 * **The wait is enforced, and in the shipped game it is not.** That is the one
 * deliberate divergence in this module and the largest in the rewrite so far,
 * so it is stated rather than buried: `COMPLETE_EXPEDITION` looks the
 * expedition up by id and pays out, with no comparison against
 * `startTime + durationMs` anywhere in the case. Measured in
 * `__tests__/expeditionsFixture.test.ts`: an eight-hour godly contract
 * completes the instant it starts, for 400 diamonds and 2,400 shards.
 *
 * Reproducing that would not be reproducing a feature. Every tier's price,
 * duration and reward is built around a wait, the UI describes a wait, and
 * the only thing missing is the comparison — so the honest port is the rule
 * as written, not the rule as skipped. It also matters to the economy: Phase
 * 10 measured the dollar shop switched off, which leaves expeditions as one
 * of the few diamond sources, and an unbounded one is not a source but a tap.
 *
 * The same shape as the crate refusing a full bag in Phase 10: reproduce
 * behaviour, and diverge where the shipped behaviour makes the rewrite worse
 * — deliberately, once, and with the measurement recorded beside it.
 */

export interface RunningExpedition {
  id: string;
  type: ExpeditionType;
  rarity: ExpeditionRarity;
  /** When it left, in ms. Passed in; nothing here reads a clock. */
  startedAtMs: number;
  durationMs: number;
}

/** One rarity per destination: the contract that destination is offering now. */
export type ContractBoard = Record<ExpeditionType, ExpeditionRarity>;

export interface SavedExpeditions {
  queue: RunningExpedition[];
  /**
   * What each destination is offering.
   *
   * The real gate on the expedition economy, and it took a second measurement
   * to find: `START_EXPEDITION` takes an `offeredRarity` and **trusts it**, so
   * the reducer will start a godly contract against a board offering common.
   * What actually restricts a player is that the only caller passes the offer.
   *
   * So the board lives in the engine here and `startExpedition` takes a
   * destination rather than a rarity — there is no parameter to pass the wrong
   * thing to. A gate that depends on every caller remembering is not a gate.
   */
  board: ContractBoard;
  /** When the board last rerolled. Null for an account that has never had one. */
  boardRolledAtMs: number | null;
}

export function emptyExpeditions(): SavedExpeditions {
  return { queue: [], board: blankBoard(), boardRolledAtMs: null };
}

function blankBoard(): ContractBoard {
  return { artifact: 'common', merchant: 'common', ruins: 'common', vault: 'common', abyss: 'common' };
}

/**
 * Roll a fresh board: one rarity per destination, uniform over the five.
 *
 * Uniform is not a detail — a godly contract pays 400 diamonds for 1,000,000
 * gold and a common one 35 for 25,000, and they are equally likely. Measured
 * across the unit interval in `__tests__/contractBoardFixture.test.ts` rather
 * than read off the expression, because an off-by-one in the index is exactly
 * the sort of thing that reads correctly.
 */
export function rollBoard(random: () => number): ContractBoard {
  const board = blankBoard();
  for (const type of EXPEDITION_TYPES) {
    board[type] = EXPEDITION_RARITIES[Math.floor(random() * EXPEDITION_RARITIES.length)];
  }
  return board;
}

/** Whether the board is old enough to reroll itself. */
export function boardIsStale(save: SaveV3, nowMs: number): boolean {
  const rolled = save.expeditions.boardRolledAtMs;
  if (rolled === null) return true;
  return nowMs - rolled >= CONTRACT_REFRESH_MS;
}

/** How long until the board rerolls itself. Nought once it is due. */
export function boardRefreshInMs(save: SaveV3, nowMs: number): number {
  const rolled = save.expeditions.boardRolledAtMs;
  if (rolled === null) return 0;
  return Math.max(0, rolled + CONTRACT_REFRESH_MS - nowMs);
}

/**
 * The free reroll the board gives itself every eight hours.
 *
 * The shipped game runs this at the top of `START_EXPEDITION` and
 * `REFRESH_EXPEDITION_CONTRACTS`, so a stale board refreshes on whatever the
 * player does next rather than on a timer. Kept that way, and called by both
 * verbs below — a board that only refreshed when the player pressed *refresh*
 * would charge them for something they are owed.
 */
export function settleBoard(save: SaveV3, nowMs: number, random: () => number): SaveV3 {
  if (!boardIsStale(save, nowMs)) return save;
  return {
    ...save,
    expeditions: { ...save.expeditions, board: rollBoard(random), boardRolledAtMs: nowMs },
  };
}

/**
 * Reroll the board by hand, for a hundred thousand gold.
 *
 * Settles the free reroll first, exactly as shipped — so an account whose
 * board was already due gets the new board and keeps its gold, rather than
 * paying for a reroll it had coming. Null when the purse is short, and it
 * charges nothing for the refusal.
 */
export function refreshBoard(
  save: SaveV3,
  nowMs: number,
  random: () => number,
): { save: SaveV3; paid: boolean } | null {
  const settled = settleBoard(save, nowMs, random);
  if (settled !== save) return { save: settled, paid: false };
  if (settled.wallet.gold < CONTRACT_REFRESH_GOLD_COST) return null;
  return {
    paid: true,
    save: {
      ...settled,
      wallet: { ...settled.wallet, gold: settled.wallet.gold - CONTRACT_REFRESH_GOLD_COST },
      expeditions: { ...settled.expeditions, board: rollBoard(random), boardRolledAtMs: nowMs },
    },
  };
}

/** What a destination is offering right now. */
export function offeredAt(save: SaveV3, type: ExpeditionType): ExpeditionRarity {
  return save.expeditions.board[type];
}

/** How many may be out at once. The shipped queue has no cap; this one does. */
export const MAX_RUNNING = 5;

export interface StartRequest {
  save: SaveV3;
  type: ExpeditionType;
  nowMs: number;
  random: () => number;
}

/**
 * Send one, on the terms the board is offering.
 *
 * **There is no rarity parameter**, and that is the point. The shipped action
 * takes one and uses it, so the board is a suggestion the caller may ignore;
 * here the destination is the whole request and the rarity is read off the
 * board, which makes the gate a property of the engine rather than of every
 * caller remembering to pass the right thing.
 *
 * Settles the free reroll first, so a player arriving after eight hours away
 * is offered today's board rather than yesterday's.
 *
 * Null when the purse is short or the queue is full. The queue cap is ours:
 * the shipped queue is unbounded, which is harmless there only because nothing
 * waits.
 */
export function startExpedition(request: StartRequest): { save: SaveV3; expedition: RunningExpedition } | null {
  if (!isExpeditionType(request.type)) return null;
  const save = settleBoard(request.save, request.nowMs, request.random);
  const rarity = offeredAt(save, request.type);
  const contract = contractFor(rarity);
  if (contract === null) return null;
  if (save.expeditions.queue.length >= MAX_RUNNING) return null;
  if (save.wallet.gold < contract.goldCost) return null;

  const expedition: RunningExpedition = {
    // Built from the departure time and the destination rather than a counter,
    // so two sent in the same millisecond to the same place would collide —
    // which they cannot, because the second is refused while the first is out.
    id: `${request.type}_${rarity}_${request.nowMs}`,
    type: request.type,
    rarity,
    startedAtMs: request.nowMs,
    durationMs: contract.durationMs,
  };

  return {
    expedition,
    save: {
      ...save,
      wallet: { ...save.wallet, gold: save.wallet.gold - contract.goldCost },
      expeditions: { ...save.expeditions, queue: [...save.expeditions.queue, expedition] },
    },
  };
}

/** Whether an expedition has been out long enough to come home. */
export function isDue(expedition: RunningExpedition, nowMs: number): boolean {
  return nowMs >= expedition.startedAtMs + expedition.durationMs;
}

/** How long is left, in ms. Nought once it is due. */
export function remainingMs(expedition: RunningExpedition, nowMs: number): number {
  return Math.max(0, expedition.startedAtMs + expedition.durationMs - nowMs);
}

export interface CompleteOutcome {
  save: SaveV3;
  expedition: RunningExpedition;
  contract: ExpeditionContract;
}

/**
 * Bring one home.
 *
 * Null for an id nobody queued and — **the divergence** — for one that is not
 * due yet.
 */
export function completeExpedition(save: SaveV3, id: string, nowMs: number): CompleteOutcome | null {
  const expedition = save.expeditions.queue.find(entry => entry.id === id);
  if (expedition === undefined) return null;
  if (!isDue(expedition, nowMs)) return null;

  const contract = contractFor(expedition.rarity);
  if (contract === null) return null;

  return {
    expedition,
    contract,
    save: {
      ...save,
      wallet: {
        ...save.wallet,
        diamonds: save.wallet.diamonds + contract.reward.diamonds,
        heroShards: save.wallet.heroShards + contract.reward.shards,
        essence: save.wallet.essence + contract.reward.essence,
      },
      expeditions: { ...save.expeditions, queue: save.expeditions.queue.filter(entry => entry.id !== id) },
    },
  };
}

/** Bring home everything that is due, in the order it was sent. */
export function completeDue(save: SaveV3, nowMs: number): { save: SaveV3; completed: RunningExpedition[] } {
  let current = save;
  const completed: RunningExpedition[] = [];
  for (const expedition of save.expeditions.queue) {
    const outcome = completeExpedition(current, expedition.id, nowMs);
    if (outcome === null) continue;
    current = outcome.save;
    completed.push(outcome.expedition);
  }
  return { save: current, completed };
}

/** What a reroll of the offered contracts costs, and whether it is affordable. */
export function canRefreshContracts(save: SaveV3): boolean {
  return save.wallet.gold >= CONTRACT_REFRESH_GOLD_COST;
}

/**
 * The board, off a save.
 *
 * A destination whose stored offer is not a rarity the catalogue still has
 * falls back to `common` rather than dropping the destination — a board with a
 * hole in it is a destination a player cannot visit at all, which is a worse
 * answer than the cheapest contract.
 */
function readBoard(raw: unknown): ContractBoard {
  const record = isRecord(raw) ? raw : {};
  const board = blankBoard();
  for (const type of EXPEDITION_TYPES) {
    const offered = record[type];
    if (isExpeditionRarity(offered)) board[type] = offered;
  }
  return board;
}

export function readExpeditions(raw: unknown, legacy = false): SavedExpeditions {
  const record = isRecord(raw) ? raw : {};
  const board = readBoard(legacy ? record.expeditionContractOffers : record.board);
  const stamp = legacy ? record.expeditionContractsRefreshedAt : record.boardRolledAtMs;
  const boardRolledAtMs = typeof stamp === 'number' && Number.isFinite(stamp) && stamp > 0 ? Math.floor(stamp) : null;

  const source = legacy ? (isRecord(raw) ? raw.expeditionQueue : null) : isRecord(raw) ? raw.queue : null;
  if (!Array.isArray(source)) return { ...emptyExpeditions(), board, boardRolledAtMs };

  const queue: RunningExpedition[] = [];
  for (const entry of source.slice(0, MAX_SAVE_COLLECTION)) {
    if (!isRecord(entry)) continue;
    const rarity = typeof entry.rarity === 'string' ? contractFor(entry.rarity) : null;
    // Dropped when the catalogue no longer has the contract or the
    // destination, which is how a retired tier leaves an old save.
    if (rarity === null || !isExpeditionType(entry.type)) continue;
    const id = typeof entry.id === 'string' ? entry.id : null;
    if (id === null) continue;
    queue.push({
      id,
      type: entry.type,
      rarity: rarity.rarity,
      startedAtMs: boundedInt(entry.startedAtMs ?? entry.startTime, 0, SAFE_NUMBER_CAP, 0),
      // Taken from the catalogue rather than the save: a stored duration is a
      // number a hand-edited save could set to zero, and the whole point of
      // this port is that the wait is real.
      durationMs: rarity.durationMs,
    });
  }
  return { queue: queue.slice(0, MAX_RUNNING), board, boardRolledAtMs };
}

/** Back out to the shape the shipped game reads. */
export function expeditionsToLegacy(expeditions: SavedExpeditions): Record<string, unknown> {
  return {
    expeditionContractOffers: { ...expeditions.board },
    // The shipped auto-refresh reads this with `Number.isFinite`, so a null
    // would leave the board frozen there forever. Nought is the value that
    // reads as "due", which is the honest answer for a board never rolled.
    expeditionContractsRefreshedAt: expeditions.boardRolledAtMs ?? 0,
    expeditionQueue: expeditions.queue.map(entry => {
      const contract = contractFor(entry.rarity);
      return {
        id: entry.id,
        type: entry.type,
        rarity: entry.rarity,
        startTime: entry.startedAtMs,
        durationMs: entry.durationMs,
        // The artifact count goes back out as the shipped reward carries it,
        // because `legacy` writes what the shipped game reads — this rewrite
        // not paying them is a decision about *this* game, not licence to
        // damage a save on the way through.
        reward: { ...(contract?.reward ?? { diamonds: 0, shards: 0, essence: 0 }), artifacts: 0 },
      };
    }),
  };
}
