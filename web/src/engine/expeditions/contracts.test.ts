import { describe, expect, it } from 'vitest';
import fixture from '../../content/__fixtures__/expeditions.json';
import board from '../../content/__fixtures__/contractBoard.json';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { CONTRACT_REFRESH_GOLD_COST, EXPEDITION_CONTRACTS, EXPEDITION_TYPES } from '../../content/expeditions';
import type { ExpeditionRarity, ExpeditionType } from '../../content/expeditions';
import { readSave } from '../save/v3';
import { migrateSave } from '../save/migrate';
import { toLegacyPayload } from '../save/legacyPayload';
import type { SaveV3 } from '../save/schema';
import {
  boardIsStale,
  boardRefreshInMs,
  offeredAt,
  refreshBoard,
  rollBoard,
  settleBoard,
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

/**
 * A save whose board offers the same rarity everywhere.
 *
 * There is no rarity to pass to `startExpedition` any more — the board decides
 * — so a test that wants a godly contract has to stock the board with one.
 * That is the point of the change: the only way to get a tier is for the board
 * to be offering it, in a test exactly as in the game.
 *
 * The stamp is set to `NOW` so the free reroll does not fire and replace the
 * board the case just set up.
 */
function boarded(rarity: ExpeditionRarity, over: Record<string, unknown> = {}): SaveV3 {
  const board = Object.fromEntries(EXPEDITION_TYPES.map(type => [type, rarity]));
  return save({ expeditions: { board, boardRolledAtMs: NOW }, ...over });
}

/** Pinned, so a settle that does fire is at least deterministic. */
const MID = () => 0.5;

/**
 * Send a contract of this rarity, stocking the board with it first.
 *
 * Stocking is not optional even when a save is supplied: a save whose board
 * has never rolled is *stale*, so `startExpedition` settles it before reading
 * — and a settle with a pinned generator hands back `epic` every time. The
 * stamp goes with the board for that reason.
 */
const sent = (rarity: ExpeditionRarity, at = NOW, from = save()) => {
  const board = Object.fromEntries(EXPEDITION_TYPES.map(type => [type, rarity])) as Record<
    ExpeditionType,
    ExpeditionRarity
  >;
  const stocked: SaveV3 = { ...from, expeditions: { ...from.expeditions, board, boardRolledAtMs: at } };
  return startExpedition({ save: stocked, type: 'ruins', nowMs: at, random: MID })!;
};

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

  it('refuses an empty purse, an unknown destination and a full queue', () => {
    expect(
      startExpedition({ save: boarded('godly', { wallet: { gold: 0 } }), type: 'ruins', nowMs: NOW, random: MID }),
    ).toBeNull();
    expect(
      startExpedition({
        save: boarded('common'),
        type: 'atlantis' as ExpeditionType,
        nowMs: NOW,
        random: MID,
      }),
    ).toBeNull();

    let full = boarded('common');
    for (let index = 0; index < MAX_RUNNING; index++) {
      full = startExpedition({ save: full, type: EXPEDITION_TYPES[index], nowMs: NOW, random: MID })!.save;
    }
    expect(full.expeditions.queue).toHaveLength(MAX_RUNNING);
    expect(startExpedition({ save: full, type: 'ruins', nowMs: NOW, random: MID })).toBeNull();
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
    const first = startExpedition({ save: boarded('common'), type: 'ruins', nowMs: NOW, random: MID })!;
    const withGodly: SaveV3 = {
      ...first.save,
      expeditions: { ...first.save.expeditions, board: { ...first.save.expeditions.board, vault: 'godly' } },
    };
    const second = startExpedition({ save: withGodly, type: 'vault', nowMs: NOW, random: MID })!;

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

describe('the contract board', () => {
  /** Draws in order, then repeats the last — so a roll of five is scriptable. */
  const scripted = (values: number[]) => {
    let index = 0;
    return () => values[Math.min(index++, values.length - 1)];
  };

  it('rolls uniformly over the five rarities, in the fifths the fixture measured', () => {
    for (const row of board.rarityByDraw) {
      expect({ draw: row.draw, rarity: rollBoard(() => row.draw).artifact }).toEqual(row);
    }
  });

  it('gives every destination its own offer, rolled separately', () => {
    // Five draws, one per destination — not one draw reused, which would make
    // the whole board a single rarity every time.
    const rolled = rollBoard(scripted([0, 0.25, 0.45, 0.65, 0.85]));
    expect(EXPEDITION_TYPES.map(type => rolled[type])).toEqual(['common', 'rare', 'epic', 'legendary', 'godly']);
  });

  it('rerolls itself after the eight hours the fixture bisected', () => {
    const fresh = {
      ...save(),
      expeditions: { ...save().expeditions, board: rollBoard(() => 0), boardRolledAtMs: NOW },
    };
    expect(board.autoRefreshMs).toBe(8 * HOUR);

    expect(boardIsStale(fresh, NOW + board.autoRefreshMs - 1)).toBe(false);
    expect(boardIsStale(fresh, NOW + board.autoRefreshMs)).toBe(true);
    expect(boardRefreshInMs(fresh, NOW)).toBe(board.autoRefreshMs);
    expect(boardRefreshInMs(fresh, NOW + board.autoRefreshMs)).toBe(0);
  });

  it('treats a board that has never rolled as due, so a new account gets one', () => {
    const fresh = save();
    expect(fresh.expeditions.boardRolledAtMs).toBeNull();
    expect(boardIsStale(fresh, NOW)).toBe(true);
    expect(settleBoard(fresh, NOW, () => 0.85).expeditions.boardRolledAtMs).toBe(NOW);
  });

  it('settles the free reroll without charging, and leaves a fresh board alone', () => {
    const stale = { ...save(), expeditions: { ...save().expeditions, boardRolledAtMs: NOW - 9 * HOUR } };
    const settled = settleBoard(stale, NOW, () => 0.85);
    expect(settled.expeditions.boardRolledAtMs).toBe(NOW);
    expect(settled.wallet.gold).toBe(stale.wallet.gold);
    expect(offeredAt(settled, 'ruins')).toBe('godly');

    // A board rolled a minute ago is left exactly as it is, identity included,
    // so a caller can settle on every read without churning the save.
    const fresh = { ...save(), expeditions: { ...save().expeditions, boardRolledAtMs: NOW - 60_000 } };
    expect(settleBoard(fresh, NOW, () => 0.85)).toBe(fresh);
  });

  it('charges a hundred thousand for a reroll by hand', () => {
    const fresh = {
      ...save(),
      expeditions: { ...save().expeditions, board: rollBoard(() => 0), boardRolledAtMs: NOW },
    };
    const rerolled = refreshBoard(fresh, NOW, () => 0.85)!;
    expect(rerolled.paid).toBe(true);
    expect(fresh.wallet.gold - rerolled.save.wallet.gold).toBe(board.refreshGoldCost);
    expect(offeredAt(rerolled.save, 'ruins')).toBe('godly');
  });

  it('refuses a reroll one gold short, and charges nothing for the refusal', () => {
    const poor = {
      ...save(),
      wallet: { ...save().wallet, gold: board.refreshGoldCost - 1 },
      expeditions: { ...save().expeditions, board: rollBoard(() => 0), boardRolledAtMs: NOW },
    };
    expect(refreshBoard(poor, NOW, () => 0.85)).toBeNull();
  });

  it('does not charge for a reroll the account already had coming', () => {
    /*
     * Shipped behaviour, and worth keeping: the free reroll is settled at the
     * top of the action, so a board that was already eight hours old refreshes
     * *first* and the gold check never runs. Charging here would take a
     * hundred thousand for something the player was owed.
     */
    const owed = {
      ...save(),
      expeditions: { ...save().expeditions, board: rollBoard(() => 0), boardRolledAtMs: NOW - 9 * HOUR },
    };
    const outcome = refreshBoard(owed, NOW, () => 0.85)!;
    expect(outcome.paid).toBe(false);
    expect(outcome.save.wallet.gold).toBe(owed.wallet.gold);
    expect(offeredAt(outcome.save, 'ruins')).toBe('godly');
  });

  it('sends what the destination offers, with no rarity to pass', () => {
    /*
     * The gate the shipped reducer does not have. `START_EXPEDITION` takes an
     * `offeredRarity` and uses it, so its board is a suggestion — measured, and
     * `contractBoard.json` records that passing another rarity works. The only
     * reason a player cannot take a godly contract on demand is that the
     * screen passes the offer.
     *
     * Here the destination is the whole request.
     */
    expect(board.boardIsEnforced.passingAnotherRarityWorks).toBe(true);
    expect(board.boardIsEnforced.screenPassesTheOffer).toBe(true);

    const stocked = {
      ...save(),
      expeditions: {
        ...save().expeditions,
        board: rollBoard(scripted([0, 0.25, 0.45, 0.65, 0.85])),
        boardRolledAtMs: NOW,
      },
    };
    // artifact is offering common, abyss godly — and each costs what it offers.
    const cheap = startExpedition({ save: stocked, type: 'artifact', nowMs: NOW, random: MID })!;
    expect(cheap.expedition.rarity).toBe('common');
    expect(stocked.wallet.gold - cheap.save.wallet.gold).toBe(25_000);

    const dear = startExpedition({ save: stocked, type: 'abyss', nowMs: NOW, random: MID })!;
    expect(dear.expedition.rarity).toBe('godly');
    expect(stocked.wallet.gold - dear.save.wallet.gold).toBe(1_000_000);
  });

  it('sends from the reroll it was owed, not from the board it arrived with', () => {
    /*
     * A player who has been away nine hours is owed a fresh board, and
     * `startExpedition` settles before reading so they send from *today's*
     * offers. Without that settle the screen would draw one board — the rows
     * settle too — and the send would use another.
     *
     * Every other case here stocks a board with a fresh stamp, so the settle
     * has nothing to do and an injection removing it passed all of them. This
     * is the case that has it do something.
     */
    const stale = {
      ...save(),
      expeditions: {
        ...save().expeditions,
        board: rollBoard(() => 0),
        boardRolledAtMs: NOW - 9 * HOUR,
      },
    };
    expect(offeredAt(stale, 'ruins')).toBe('common');

    const sentFrom = startExpedition({ save: stale, type: 'ruins', nowMs: NOW, random: () => 0.85 })!;
    expect(sentFrom.expedition.rarity).toBe('godly');
    expect(stale.wallet.gold - sentFrom.save.wallet.gold).toBe(1_000_000);
    expect(sentFrom.save.expeditions.boardRolledAtMs).toBe(NOW);
  });

  it('carries the board across a migration and back out again', () => {
    const migrated = migrateSave(
      {
        saveVersion: 2,
        playerName: 'V',
        playerClass: 'warrior',
        expeditionContractOffers: {
          artifact: 'godly',
          merchant: 'rare',
          ruins: 'epic',
          vault: 'legendary',
          abyss: 'common',
        },
        expeditionContractsRefreshedAt: NOW - HOUR,
      },
      OPTIONS,
    );
    expect(migrated.expeditions.board).toEqual({
      artifact: 'godly',
      merchant: 'rare',
      ruins: 'epic',
      vault: 'legendary',
      abyss: 'common',
    });
    expect(migrated.expeditions.boardRolledAtMs).toBe(NOW - HOUR);

    const legacy = toLegacyPayload(migrated);
    expect(legacy.expeditionContractOffers).toEqual(migrated.expeditions.board);
    expect(legacy.expeditionContractsRefreshedAt).toBe(NOW - HOUR);
  });

  it('falls back to the cheapest contract for an offer the catalogue has lost', () => {
    // A hole in the board is a destination nobody can visit, which is a worse
    // answer than the cheapest contract.
    const migrated = migrateSave(
      {
        saveVersion: 2,
        playerName: 'V',
        playerClass: 'warrior',
        expeditionContractOffers: { artifact: 'mythic', merchant: 'rare' },
      },
      OPTIONS,
    );
    expect(migrated.expeditions.board.artifact).toBe('common');
    expect(migrated.expeditions.board.merchant).toBe('rare');
  });

  it('writes a never-rolled board out as nought, not null', () => {
    /*
     * The shipped auto-refresh guards with `Number.isFinite`, so a null there
     * would freeze that board forever in a v2 build. Nought reads as "due",
     * which is the honest answer for a board that has never rolled.
     */
    expect(toLegacyPayload(save()).expeditionContractsRefreshedAt).toBe(0);
  });
});
