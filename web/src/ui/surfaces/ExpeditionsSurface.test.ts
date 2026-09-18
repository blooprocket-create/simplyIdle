import { describe, expect, it } from 'vitest';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { EXPEDITION_CONTRACTS } from '../../content/expeditions';
import { startExpedition } from '../../engine/expeditions/contracts';
import { readSave } from '../../engine/save/v3';
import type { SaveV3 } from '../../engine/save/schema';
import { contractHint, expeditionView, refreshLabel, remainingLabel } from './ExpeditionsSurface';

/**
 * The Expeditions surface's decisions: how long is left, in words, and what a
 * contract costs, in words.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const HOUR = 3_600_000;

function save(): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 40 },
      wallet: { gold: 50_000_000 },
    },
    { nowMs: NOW, content: CONTENT },
  );
}

/** A board stocked entirely with godly contracts, and one already sent. */
const godlyBoard = () => {
  const base = save();
  return {
    ...base,
    expeditions: {
      ...base.expeditions,
      board: { artifact: 'godly', merchant: 'godly', ruins: 'godly', vault: 'godly', abyss: 'godly' } as const,
      boardRolledAtMs: NOW,
    },
  };
};

const withGodly = () => startExpedition({ save: godlyBoard(), type: 'ruins', nowMs: NOW, random: () => 0.5 })!.save;

describe('how long is left, in words', () => {
  const rowAt = (at: number) => expeditionView(withGodly(), at).running[0];

  it('counts minutes below an hour and hours above it', () => {
    expect(remainingLabel(rowAt(NOW))).toBe('8h 0m left');
    expect(remainingLabel(rowAt(NOW + 7 * HOUR))).toBe('1h 0m left');
    expect(remainingLabel(rowAt(NOW + 7.5 * HOUR))).toBe('30m left');
  });

  it('says ready rather than a time once it is due', () => {
    // A row that read "0m left" beside a live button would be telling the
    // player to wait for something that is already waiting for them.
    expect(remainingLabel(rowAt(NOW + 8 * HOUR))).toBe('Ready');
    expect(rowAt(NOW + 8 * HOUR).due).toBe(true);
  });

  it('fills the meter as the wait runs down', () => {
    expect(rowAt(NOW).fraction).toBe(0);
    expect(rowAt(NOW + 4 * HOUR).fraction).toBeCloseTo(0.5, 6);
    expect(rowAt(NOW + 99 * HOUR).fraction).toBe(1);
  });
});

describe('what a contract row says', () => {
  it('quotes the wait and the reward, and skips a currency it does not pay', () => {
    const common = EXPEDITION_CONTRACTS[0];
    const godly = EXPEDITION_CONTRACTS[4];
    expect(contractHint(common)).toBe('5m · 35 💎 · 150 shards');
    expect(contractHint(godly)).toBe('8h · 400 💎 · 2400 shards · 4 essence');
  });
});

describe('what the screen offers', () => {
  it('counts the free slots, and the ones ready', () => {
    const view = expeditionView(withGodly(), NOW);
    expect({ due: view.due, slotsLeft: view.slotsLeft }).toEqual({ due: 0, slotsLeft: 4 });
    expect(expeditionView(withGodly(), NOW + 8 * HOUR).due).toBe(1);
  });

  it('shows one contract per destination, not one per tier', () => {
    /*
     * The correction this phase needed. Each of the five destinations offers
     * one rarity and that is what may be sent there; an earlier version listed
     * the five *tiers* and let the player pick, which made a godly contract
     * available whenever they had the gold.
     */
    const view = expeditionView(godlyBoard(), NOW, () => 0.5);
    expect(view.board.map(row => row.type)).toEqual(['artifact', 'merchant', 'ruins', 'vault', 'abyss']);
    expect(view.board.every(row => row.rarity === 'godly')).toBe(true);
    expect(view.board.every(row => row.affordable)).toBe(true);
    expect(view.board.every(row => row.hasRoom)).toBe(true);
  });

  it('greys a destination the purse cannot cover', () => {
    const poor = { ...godlyBoard(), wallet: { ...save().wallet, gold: 10 } };
    const view = expeditionView(poor, NOW, () => 0.5);
    expect(view.board.every(row => row.affordable)).toBe(false);
  });

  it('says when the board rerolls itself, and what a reroll by hand costs', () => {
    const fresh = expeditionView(godlyBoard(), NOW, () => 0.5);
    expect(refreshLabel(fresh.refreshInMs)).toBe('New contracts in 8h 0m');
    expect(fresh.canRefresh).toBe(true);

    const due = expeditionView(godlyBoard(), NOW + 8 * HOUR, () => 0.5);
    expect(refreshLabel(due.refreshInMs)).toBe('New contracts now');
  });
});
