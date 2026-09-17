import { describe, expect, it } from 'vitest';
import Decimal from 'break_eternity.js';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { upgradeFacility } from '../prestige/prestigeSave';
import { readSave } from './v3';
import type { SaveV3 } from './schema';
import { bankRun, worthBanking } from './bankRun';

/**
 * Banking, and the hole it closes.
 *
 * A coin has to belong to the wallet or to the run and never to both — or to
 * neither, which was the other half of the same fault.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };

function save(wallet: Record<string, number> = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 30 },
      wallet: { gold: 0, ...wallet },
    },
    { nowMs: 0, content: CONTENT },
  );
}

const run = (gold: number, essence = 0, bossTears = 0) => ({
  gold: new Decimal(gold),
  essence,
  bossTears,
});

describe('putting a run in the wallet', () => {
  it('adds the gold, and the lifetime tally with it', () => {
    /*
     * `totalGold` climbs alongside, because it unlocks achievements and a
     * player whose earnings arrived in a hundred instalments has to reach the
     * same figure as one whose arrived in a single lump.
     */
    const banked = bankRun(save({ gold: 500, totalGold: 500 }), run(1_000));
    expect(banked.wallet.gold).toBe(1_500);
    expect(banked.wallet.totalGold).toBe(1_500);
  });

  it('adds the essence and the tears a run earned', () => {
    // These had the opposite fault from gold rather than the same one: nothing
    // added them to the wallet, so the essence tree and the summon pool never
    // saw a coin of what the fight produced.
    const banked = bankRun(save({ essence: 2, bossTears: 1 }), run(0, 7, 3));
    expect(banked.wallet.essence).toBe(9);
    expect(banked.wallet.bossTears).toBe(4);
  });

  it('clamps a balance past what a saved number can hold', () => {
    // Gold outgrows a double on a deep account, and the wallet is JSON.
    const banked = bankRun(save(), { gold: new Decimal('1e400'), essence: 0, bossTears: 0 });
    expect(Number.isFinite(banked.wallet.gold)).toBe(true);
    expect(banked.wallet.gold).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('skips a run that earned nothing', () => {
    expect(worthBanking(run(0))).toBe(false);
    expect(worthBanking(run(1))).toBe(true);
    expect(worthBanking(run(0, 1))).toBe(true);
    expect(worthBanking(run(0, 0, 1))).toBe(true);
  });
});

describe('the hole banking closes', () => {
  it('lets a purchase be paid for exactly once', () => {
    /*
     * The measurement this exists for. Spending used to check against the
     * wallet *plus* the run's tally and deduct from the wallet alone, floored
     * at zero — so an empty wallet with a million unbanked gold bought seven
     * facility levels and still read a million. Free, seven times over.
     *
     * Banked first, the wallet is the balance, and the eighth level is refused
     * because the money is actually gone.
     */
    let current = bankRun(save(), run(1_000_000));
    expect(current.wallet.gold).toBe(1_000_000);

    let bought = 0;
    for (let i = 0; i < 20; i += 1) {
      const next = upgradeFacility(current, 'training', current.wallet.gold);
      if (next === null) break;
      current = next;
      bought += 1;
    }

    expect(bought).toBeGreaterThan(0);
    expect(current.facilities.training).toBe(bought);
    // Paid for: the balance fell, and by the whole of what was bought.
    expect(current.wallet.gold).toBeLessThan(1_000_000);
    expect(current.wallet.gold).toBeGreaterThanOrEqual(0);
  });

  it('refuses the purchase that the run cannot afford', () => {
    // Against an unbanked purse this was the case that never arrived: the
    // wallet floored at zero and the next press went through anyway.
    const current = bankRun(save(), run(10));
    expect(upgradeFacility(current, 'training', current.wallet.gold)).toBeNull();
  });
});
