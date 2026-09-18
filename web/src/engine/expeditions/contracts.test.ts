import { describe, expect, it } from 'vitest';
import fixture from '../../content/__fixtures__/expeditions.json';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { CONTRACT_REFRESH_GOLD_COST, EXPEDITION_CONTRACTS, EXPEDITION_TYPES } from '../../content/expeditions';
import type { ExpeditionRarity } from '../../content/expeditions';
import { readSave } from '../save/v3';
import { migrateSave } from '../save/migrate';
import { toLegacyPayload } from '../save/legacyPayload';
import type { SaveV3 } from '../save/schema';
import {
  completeDue,
  completeExpedition,
  isDue,
  MAX_RUNNING,
  readExpeditions,
  remainingMs,
  startExpedition,
} from './contracts';

/**
 * Expeditions, against the shipped contracts — and against the one rule the
 * shipped game stores and never checks.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const OPTIONS = { nowMs: NOW, content: CONTENT };
const HOUR = 3_600_000;

function save(over: Record<string, unknown> = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 40 },
      wallet: { gold: 50_000_000, totalGold: 50_000_000, diamonds: 0, heroShards: 0, essence: 0 },
      ...over,
    },
    OPTIONS,
  );
}

const sent = (rarity: ExpeditionRarity, at = NOW, from = save()) =>
  startExpedition({ save: from, type: 'ruins', rarity, nowMs: at })!;

describe('the five contracts', () => {
  it('are the shipped five, at the shipped prices and durations', () => {
    expect(
      EXPEDITION_CONTRACTS.map(contract => ({
        rarity: contract.rarity,
        goldCost: contract.goldCost,
        durationMs: contract.durationMs,
        reward: contract.reward,
      })),
    ).toEqual(
      fixture.tiers.map(tier => ({
        rarity: tier.rarity,
        goldCost: tier.goldCost,
        durationMs: tier.durationMs,
        // Artifacts are deliberately absent: the shipped reward carries a
        // count and the shipped completion never pays it, so listing one
        // would promise the player something this game cannot hand over.
        reward: { diamonds: tier.reward.diamonds, shards: tier.reward.shards, essence: tier.reward.essence },
      })),
    );
  });

  it('go to the shipped five destinations, and charge the shipped reroll', () => {
    expect([...EXPEDITION_TYPES]).toEqual(fixture.types);
    expect(CONTRACT_REFRESH_GOLD_COST).toBe(fixture.refreshGoldCost);
  });
});

describe('sending one', () => {
  it('charges the contract and queues it', () => {
    const before = save();
    const outcome = sent('godly', NOW, before);
    expect(before.wallet.gold - outcome.save.wallet.gold).toBe(1_000_000);
    expect(outcome.save.expeditions.queue).toHaveLength(1);
    expect(outcome.expedition).toMatchObject({
      type: 'ruins',
      rarity: 'godly',
      startedAtMs: NOW,
      durationMs: 8 * HOUR,
    });
  });

  it('refuses an empty purse, an unknown contract and a full queue', () => {
    expect(
      startExpedition({ save: save({ wallet: { gold: 0 } }), type: 'ruins', rarity: 'godly', nowMs: NOW }),
    ).toBeNull();
    expect(
      startExpedition({ save: save(), type: 'ruins', rarity: 'mythic' as ExpeditionRarity, nowMs: NOW }),
    ).toBeNull();

    let full = save();
    for (let index = 0; index < MAX_RUNNING; index++) {
      full = startExpedition({ save: full, type: EXPEDITION_TYPES[index], rarity: 'common', nowMs: NOW })!.save;
    }
    expect(full.expeditions.queue).toHaveLength(MAX_RUNNING);
    expect(startExpedition({ save: full, type: 'ruins', rarity: 'common', nowMs: NOW })).toBeNull();
  });
});

describe('the wait', () => {
  it('is enforced here, and is not in the shipped game', () => {
    /*
     * **The divergence**, and the largest in the rewrite so far. The shipped
     * `COMPLETE_EXPEDITION` looks the expedition up by id and pays it out with
     * no comparison against `startTime + durationMs` anywhere in the case, so
     * an eight-hour godly contract completes the instant it starts — measured,
     * for its full 400 diamonds and 2,400 shards.
     *
     * The fixture records that. This refuses it.
     */
    expect(fixture.completedImmediately).toMatchObject({
      waitedMs: 0,
      paid: { diamonds: 400, shards: 2400, essence: 4 },
    });

    const outcome = sent('godly');
    expect(completeExpedition(outcome.save, outcome.expedition.id, NOW)).toBeNull();
    expect(completeExpedition(outcome.save, outcome.expedition.id, NOW + 8 * HOUR - 1)).toBeNull();
    expect(completeExpedition(outcome.save, outcome.expedition.id, NOW + 8 * HOUR)).not.toBeNull();
  });

  it('counts down, and stops at nought', () => {
    const outcome = sent('epic');
    expect(remainingMs(outcome.expedition, NOW)).toBe(90 * 60_000);
    expect(remainingMs(outcome.expedition, NOW + 45 * 60_000)).toBe(45 * 60_000);
    expect(remainingMs(outcome.expedition, NOW + 99 * HOUR)).toBe(0);
    expect(isDue(outcome.expedition, NOW + 99 * HOUR)).toBe(true);
  });
});

describe('bringing one home', () => {
  const due = () => {
    const outcome = sent('godly');
    return { save: outcome.save, id: outcome.expedition.id, at: NOW + 8 * HOUR };
  };

  it('pays what the contract promised, and takes it out of the queue', () => {
    const { save: queued, id, at } = due();
    const outcome = completeExpedition(queued, id, at)!;
    expect({
      diamonds: outcome.save.wallet.diamonds - queued.wallet.diamonds,
      shards: outcome.save.wallet.heroShards - queued.wallet.heroShards,
      essence: outcome.save.wallet.essence - queued.wallet.essence,
    }).toEqual({ diamonds: 400, shards: 2400, essence: 4 });
    expect(outcome.save.expeditions.queue).toEqual([]);
  });

  it('refuses an id nobody queued, and the same one twice', () => {
    const { save: queued, id, at } = due();
    expect(completeExpedition(queued, 'nothing_at_all', at)).toBeNull();
    const collected = completeExpedition(queued, id, at)!.save;
    expect(completeExpedition(collected, id, at)).toBeNull();
  });

  it('brings home everything due and leaves the rest running', () => {
    // A five-minute common and an eight-hour godly, collected an hour in: one
    // comes home and one does not.
    const first = startExpedition({ save: save(), type: 'ruins', rarity: 'common', nowMs: NOW })!;
    const second = startExpedition({ save: first.save, type: 'vault', rarity: 'godly', nowMs: NOW })!;

    const swept = completeDue(second.save, NOW + HOUR);
    expect(swept.completed.map(entry => entry.rarity)).toEqual(['common']);
    expect(swept.save.expeditions.queue.map(entry => entry.rarity)).toEqual(['godly']);
    expect(swept.save.wallet.diamonds).toBe(35);
  });

  it('brings home nothing, and changes nothing, when nothing is due', () => {
    const queued = sent('godly').save;
    const swept = completeDue(queued, NOW);
    expect(swept.completed).toEqual([]);
    expect(swept.save).toBe(queued);
  });
});

describe('the stored queue', () => {
  it('reads the shipped shape and our own', () => {
    const fromV2 = readExpeditions(
      {
        expeditionQueue: [
          { id: 'a', type: 'ruins', rarity: 'epic', startTime: 1_000, durationMs: 5, reward: { artifacts: 2 } },
        ],
      },
      true,
    );
    expect(fromV2.queue).toEqual([
      // The duration comes from the catalogue, never from the save: a stored
      // one is a number a hand-edited save sets to zero, and the whole point
      // of this port is that the wait is real.
      { id: 'a', type: 'ruins', rarity: 'epic', startedAtMs: 1_000, durationMs: 90 * 60_000 },
    ]);
  });

  it('drops a contract or a destination the catalogue has retired', () => {
    expect(readExpeditions({ queue: [{ id: 'a', type: 'nowhere', rarity: 'epic', startedAtMs: 0 }] }).queue).toEqual(
      [],
    );
    expect(readExpeditions({ queue: [{ id: 'a', type: 'ruins', rarity: 'mythic', startedAtMs: 0 }] }).queue).toEqual(
      [],
    );
    expect(readExpeditions(null).queue).toEqual([]);
  });

  it('round-trips through a migration and back out', () => {
    const migrated = migrateSave(
      {
        saveVersion: 2,
        expeditionQueue: [{ id: 'a', type: 'vault', rarity: 'legendary', startTime: 9_000, durationMs: 1 }],
      },
      OPTIONS,
    );
    expect(migrated.legacy.expeditionQueue).toBeUndefined();
    expect(migrated.expeditions.queue[0]).toMatchObject({ rarity: 'legendary', durationMs: 4 * HOUR });

    const payload = toLegacyPayload(migrated) as { expeditionQueue: { rarity: string; reward: unknown }[] };
    expect(payload.expeditionQueue[0]).toMatchObject({
      rarity: 'legendary',
      // Artifacts go back out because `legacy` writes what the shipped game
      // reads. Not paying them is a decision about *this* game, not licence to
      // damage a save on the way through.
      reward: { diamonds: 240, shards: 1_300, essence: 2, artifacts: 0 },
    });
  });
});
