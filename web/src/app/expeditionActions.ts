import {
  CONTRACT_REFRESH_GOLD_COST,
  EXPEDITION_CONTRACTS,
  EXPEDITION_TYPES,
  contractFor,
  type ExpeditionContract,
  type ExpeditionRarity,
  type ExpeditionType,
} from '../content/expeditions';
import {
  boardRefreshInMs,
  completeDue,
  completeExpedition,
  isDue,
  MAX_RUNNING,
  offeredAt,
  refreshBoard,
  remainingMs,
  settleBoard,
  startExpedition,
  type CompleteOutcome,
  type RunningExpedition,
} from '../engine/expeditions/contracts';
import type { SaveV3 } from '../engine/save/schema';

/**
 * The expedition verbs, with the clock supplied.
 *
 * Everything here turns on `nowMs`, which is the whole point of the port: the
 * shipped completion never looks at one, so an eight-hour contract finishes
 * the instant it starts. See `engine/expeditions/contracts.ts`.
 */

export interface RunningRow {
  expedition: RunningExpedition;
  contract: ExpeditionContract;
  due: boolean;
  remainingMs: number;
  /** Nought to one. What the meter draws. */
  fraction: number;
}

export function runningRows(save: SaveV3, nowMs: number): RunningRow[] {
  return save.expeditions.queue.map(expedition => {
    const left = remainingMs(expedition, nowMs);
    return {
      expedition,
      contract: contractFor(expedition.rarity)!,
      due: isDue(expedition, nowMs),
      remainingMs: left,
      fraction: expedition.durationMs <= 0 ? 1 : Math.min(1, Math.max(0, 1 - left / expedition.durationMs)),
    };
  });
}

/**
 * The board, as a row per destination.
 *
 * One row per *destination* rather than one per contract tier, which is the
 * correction this phase needed: the shipped screen draws the five
 * destinations and each shows whatever it is offering today. A list of the
 * five tiers would be a menu, and the board is not a menu.
 */
export interface BoardRow {
  type: ExpeditionType;
  rarity: ExpeditionRarity;
  contract: ExpeditionContract;
  affordable: boolean;
  /** False when the queue is full, whatever the purse holds. */
  hasRoom: boolean;
}

/**
 * Settles the free reroll before reading, so the screen and the verb agree.
 *
 * Without this a board eight hours stale would draw yesterday's offers and
 * then send today's — the player pressing a common contract and getting a
 * godly one, or the reverse. The settle is pure and idempotent, so asking
 * twice is free.
 */
export function boardRows(save: SaveV3, nowMs: number, random: () => number): BoardRow[] {
  const settled = settleBoard(save, nowMs, random);
  const hasRoom = settled.expeditions.queue.length < MAX_RUNNING;
  return EXPEDITION_TYPES.map(type => {
    const rarity = offeredAt(settled, type);
    const contract = contractFor(rarity)!;
    return { type, rarity, contract, affordable: settled.wallet.gold >= contract.goldCost, hasRoom };
  });
}

/** Every tier, for a screen that wants to show what the board *could* offer. */
export interface ContractRow {
  contract: ExpeditionContract;
  affordable: boolean;
  hasRoom: boolean;
}

export function contractRows(save: SaveV3): ContractRow[] {
  const hasRoom = save.expeditions.queue.length < MAX_RUNNING;
  return EXPEDITION_CONTRACTS.map(contract => ({
    contract,
    affordable: save.wallet.gold >= contract.goldCost,
    hasRoom,
  }));
}

/**
 * Send to a destination, on whatever terms it is offering.
 *
 * No rarity argument: see `startExpedition`. This is the signature change that
 * makes the board a gate rather than a suggestion.
 */
export function send(save: SaveV3, type: ExpeditionType, nowMs: number, random: () => number) {
  return startExpedition({ save, type, nowMs, random });
}

/** Reroll the board by hand. Null when the hundred thousand is not there. */
export function refresh(save: SaveV3, nowMs: number, random: () => number) {
  return refreshBoard(save, nowMs, random);
}

/** How long until the board rerolls itself. */
export function refreshInMs(save: SaveV3, nowMs: number): number {
  return boardRefreshInMs(save, nowMs);
}

export function collect(save: SaveV3, id: string, nowMs: number): CompleteOutcome | null {
  return completeExpedition(save, id, nowMs);
}

/** Bring home everything that is due. One press, however many are out. */
export function collectDue(save: SaveV3, nowMs: number) {
  return completeDue(save, nowMs);
}

/** How many are ready, for a badge and a disabled button to share an answer. */
export function dueCount(save: SaveV3, nowMs: number): number {
  return save.expeditions.queue.filter(expedition => isDue(expedition, nowMs)).length;
}

export const REFRESH_COST = CONTRACT_REFRESH_GOLD_COST;
export const DESTINATIONS = EXPEDITION_TYPES;
