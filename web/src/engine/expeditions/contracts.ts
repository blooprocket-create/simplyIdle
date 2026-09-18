import {
  CONTRACT_REFRESH_GOLD_COST,
  contractFor,
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

export interface SavedExpeditions {
  queue: RunningExpedition[];
}

export function emptyExpeditions(): SavedExpeditions {
  return { queue: [] };
}

/** How many may be out at once. The shipped queue has no cap; this one does. */
export const MAX_RUNNING = 5;

export interface StartRequest {
  save: SaveV3;
  type: ExpeditionType;
  rarity: ExpeditionRarity;
  nowMs: number;
}

/**
 * Send one.
 *
 * Null when the contract is unknown, the purse is short, or the queue is
 * full. The queue cap is ours: the shipped queue is unbounded, which is
 * harmless there only because nothing waits.
 */
export function startExpedition(request: StartRequest): { save: SaveV3; expedition: RunningExpedition } | null {
  const contract = contractFor(request.rarity);
  if (contract === null || !isExpeditionType(request.type)) return null;
  if (request.save.expeditions.queue.length >= MAX_RUNNING) return null;
  if (request.save.wallet.gold < contract.goldCost) return null;

  const expedition: RunningExpedition = {
    // Built from the departure time and the destination rather than a counter,
    // so two sent in the same millisecond to the same place would collide —
    // which they cannot, because the second is refused while the first is out.
    id: `${request.type}_${request.rarity}_${request.nowMs}`,
    type: request.type,
    rarity: request.rarity,
    startedAtMs: request.nowMs,
    durationMs: contract.durationMs,
  };

  return {
    expedition,
    save: {
      ...request.save,
      wallet: { ...request.save.wallet, gold: request.save.wallet.gold - contract.goldCost },
      expeditions: { queue: [...request.save.expeditions.queue, expedition] },
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
      expeditions: { queue: save.expeditions.queue.filter(entry => entry.id !== id) },
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

export function readExpeditions(raw: unknown, legacy = false): SavedExpeditions {
  const source = legacy ? (isRecord(raw) ? raw.expeditionQueue : null) : isRecord(raw) ? raw.queue : null;
  if (!Array.isArray(source)) return emptyExpeditions();

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
  return { queue: queue.slice(0, MAX_RUNNING) };
}

/** Back out to the shape the shipped game reads. */
export function expeditionsToLegacy(expeditions: SavedExpeditions): Record<string, unknown> {
  return {
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
