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
  completeDue,
  completeExpedition,
  isDue,
  MAX_RUNNING,
  remainingMs,
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

export interface ContractRow {
  contract: ExpeditionContract;
  affordable: boolean;
  /** False when the queue is full, whatever the purse holds. */
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

export function send(save: SaveV3, type: ExpeditionType, rarity: ExpeditionRarity, nowMs: number) {
  return startExpedition({ save, type, rarity, nowMs });
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
