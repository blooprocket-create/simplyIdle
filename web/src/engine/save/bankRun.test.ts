import { describe, expect, it } from 'vitest';
import Decimal from 'break_eternity.js';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { upgradeFacility } from '../prestige/prestigeSave';
import { expForLevel, STAT_POINTS_PER_LEVEL } from './migrate';
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

const run = (
  gold: number,
  essence = 0,
  bossTears = 0,
  exp = 0,
  kills = 0,
  equipmentDrops: number[] = [],
  wave = 1,
) => ({
  gold: new Decimal(gold),
  exp: new Decimal(exp),
  essence,
  bossTears,
  kills,
  equipmentDrops,
  usableDrops: [] as string[],
  // Where the run stands rather than something it earned, which is why it is
  // last and defaulted: most of these cases are about the purse.
  wave,
});

describe('the three tallies a run moves that nothing else does', () => {
  it('adds the kills to the account, not just to the heroes', () => {
    /*
     * They were used to level fielded heroes and then dropped. Nothing else in
     * the rewrite wrote `totalKills`, so five achievements and two automations
     * gated on it were measured against whatever the save was read with, plus
     * a run tally that goes back to zero on reload.
     */
    const banked = bankRun(save(), run(0, 0, 0, 0, 40));
    expect(banked.progression.totalKills).toBe(40);
    // And instalments add up, which is the property that makes banking on a
    // timer indistinguishable from banking once.
    expect(bankRun(banked, run(0, 0, 0, 0, 2)).progression.totalKills).toBe(42);
  });

  it('raises the deepest wave, and never lowers it', () => {
    /*
     * `highestWave` gates the rebirth button and both team-slot purchases, and
     * was written by the save reader and by nothing after it — so a player who
     * fought to wave 200 found rebirth still locked.
     *
     * It only ever climbs. A run that wiped back a chapter is still a run that
     * got there, which is the rule the shipped `highestWaveReached` follows.
     */
    const deep = bankRun(save(), run(0, 0, 0, 0, 0, [], 214));
    expect(deep.progression.highestWave).toBe(214);
    expect(bankRun(deep, run(0, 0, 0, 0, 0, [], 41)).progression.highestWave).toBe(214);
  });

  it('adds the kills to the week as well as to the account', () => {
    /*
     * The third tally, and the one that is *meant* to go backwards: the
     * weekly track is measured on it and the rollover clears it. Without this
     * the track could never move.
     */
    const banked = bankRun(save(), run(0, 0, 0, 0, 40));
    expect(banked.calendar.weeklyKills).toBe(40);
    expect(bankRun(banked, run(0, 0, 0, 0, 2)).calendar.weeklyKills).toBe(42);
  });

  it('takes a fractional or negative count as nothing rather than as a loss', () => {
    // Neither should ever arrive; both would silently *reduce* a lifetime
    // tally, which is the one direction it must never move.
    const banked = bankRun(save(), run(0, 0, 0, 0, -5, [], -3));
    expect(banked.progression.totalKills).toBe(0);
    expect(banked.calendar.weeklyKills).toBe(0);
    expect(banked.progression.highestWave).toBe(save().progression.highestWave);
  });
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
    const banked = bankRun(save(), { ...run(0), gold: new Decimal('1e400') });
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

describe('levelling, banked', () => {
  const withRoster = (over: Record<string, unknown> = {}) =>
    readSave(
      {
        version: 3,
        identity: { name: 'P', playerClass: 'warrior', created: true },
        progression: { level: 1, exp: 0 },
        wallet: { gold: 0 },
        roster: {
          heroes: [
            { id: 'h1', uid: 'fielded', level: 10, rank: 1, rarity: 'common' },
            { id: 'h1', uid: 'benched', level: 10, rank: 1, rarity: 'common' },
          ],
          activeUids: ['fielded'],
          ...over,
        },
      },
      { nowMs: 0, content: CONTENT },
    );

  const levelOf = (next: SaveV3, uid: string) => next.roster.heroes.find(hero => hero.uid === uid)!.level;

  it('levels the player and pays the stat points', () => {
    const banked = bankRun(withRoster(), { ...run(0), exp: new Decimal(expForLevel(1) + expForLevel(2)) });
    expect(banked.progression.level).toBe(3);
    expect(banked.stats.unspent).toBe(2 * STAT_POINTS_PER_LEVEL);
    expect(banked.progression.exp).toBe(0);
  });

  it('levels the fielded heroes and leaves the bench alone', () => {
    // The shipped rule, and the only one that makes fielding a choice.
    const banked = bankRun(withRoster(), { ...run(0), kills: 7 });
    expect(levelOf(banked, 'fielded')).toBe(17);
    expect(levelOf(banked, 'benched')).toBe(10);
  });

  it('lands in the same place whether banked once or in instalments', () => {
    /*
     * The property that lets banking happen on any cadence at all. An idle
     * player banks every few seconds and a busy one banks on every press, and
     * the two must not drift — `applyExp` carries its remainder and
     * `heroLevelAfter` takes a count rather than looping.
     */
    const total = expForLevel(1) + expForLevel(2) + 25;
    const once = bankRun(withRoster(), { ...run(0), exp: new Decimal(total), kills: 9 });

    let drip = withRoster();
    for (let i = 0; i < 9; i += 1) {
      drip = bankRun(drip, { ...run(0), exp: new Decimal(Math.floor(total / 9)), kills: 1 });
    }
    drip = bankRun(drip, { ...run(0), exp: new Decimal(total - Math.floor(total / 9) * 9), kills: 0 });

    expect(drip.progression.level).toBe(once.progression.level);
    expect(drip.progression.exp).toBe(once.progression.exp);
    expect(drip.stats.unspent).toBe(once.stats.unspent);
    expect(levelOf(drip, 'fielded')).toBe(levelOf(once, 'fielded'));
  });

  it('counts a run that only killed as worth banking', () => {
    // A team deep enough to out-level its gold still has to level.
    expect(worthBanking({ ...run(0), kills: 1 })).toBe(true);
    expect(worthBanking({ ...run(0), exp: new Decimal(1) })).toBe(true);
    // A won drop is worth banking on its own: the item is built when it lands.
    expect(worthBanking({ ...run(0), equipmentDrops: [40] })).toBe(true);
    expect(worthBanking(run(0))).toBe(false);
  });
});
