import { describe, expect, it } from 'vitest';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { SHOP_OFFERS } from '../../content/shops';
import { VIP_LEVEL_THRESHOLDS } from '../../content/vip';
import { readSave } from '../../engine/save/v3';
import type { SaveV3 } from '../../engine/save/schema';
import { looseRows, offerRows, vipRows, vipStanding } from './ShopSurface';

/**
 * The Shop surface's decisions: which buttons are live, and what a dead one
 * says instead of a price.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };

function save(over: Record<string, unknown> = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 20 },
      wallet: { gold: 0, diamonds: 0 },
      ...over,
    },
    { nowMs: 0, content: CONTENT },
  );
}

const rowFor = (from: SaveV3, id: string) => offerRows(from).find(row => row.offer.id === id)!;

describe('which offers get a live button', () => {
  it('lists every offer, including the ones this build withholds', () => {
    // Not filtered. A shop showing three rows would be telling the player this
    // game sells three.
    expect(offerRows(save()).map(row => row.offer.id)).toEqual(SHOP_OFFERS.map(offer => offer.id));
  });

  it('goes live only when the purse covers it', () => {
    expect(rowFor(save({ wallet: { gold: 2_199 } }), 'exp_cache').affordable).toBe(false);
    expect(rowFor(save({ wallet: { gold: 2_200 } }), 'exp_cache').affordable).toBe(true);
  });

  it('says the price when the purse is short', () => {
    expect(rowFor(save(), 'exp_cache').blockedBy).toBe('Costs 2200 gold');
  });

  it('says nothing when the button works', () => {
    expect(rowFor(save({ wallet: { gold: 999_999 } }), 'exp_cache').blockedBy).toBeNull();
  });

  it('gives the reason rather than the price for one this build withholds', () => {
    /*
     * The catalogue's reason wins over the purse, even for an account that
     * could afford it. Telling a player they cannot afford a coolant pack
     * sends them off to earn diamonds for a button that will never work; the
     * true answer is that nothing in this build runs hot yet.
     */
    const rich = save({ wallet: { gold: 999_999, diamonds: 999_999 } });
    const withheld = rowFor(rich, 'coolant_i_pack');
    expect(withheld.affordable).toBe(false);
    expect(withheld.blockedBy).toContain('runs hot');
    // The raid ticket was the second example here until Phase 11 built the
    // dungeons; it quotes a price now, like anything else on sale.
    expect(rowFor(rich, 'rift_raid_ticket').blockedBy).toBeNull();
  });
});

describe('the loose goods', () => {
  it('names the item out of the catalogue and shows how many are held', () => {
    const row = looseRows(save({ usables: { coolant_mk1: 3 } }))[0];
    expect(row.name).toContain('Coolant');
    expect(row.held).toBe(3);
  });

  it('is blocked for the same reason the packs are', () => {
    expect(looseRows(save()).map(row => row.blockedBy === null)).toEqual([false, false]);
  });
});

describe('the VIP track', () => {
  it('shows all ten rungs whatever the account has reached', () => {
    // Four of the ten are reachable in the shipped game and six are not; a
    // track that showed four would be a different claim about the game.
    expect(vipRows(save()).map(row => row.milestone.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('marks a rung earned, claimed and claimable separately', () => {
    const earned = save({ vip: { points: VIP_LEVEL_THRESHOLDS[2], claimedRewardLevels: [1] } });
    expect(vipRows(earned).slice(0, 3)).toEqual([
      { milestone: expect.objectContaining({ level: 1 }), earned: true, claimed: true, claimable: false },
      { milestone: expect.objectContaining({ level: 2 }), earned: true, claimed: false, claimable: true },
      { milestone: expect.objectContaining({ level: 3 }), earned: false, claimed: false, claimable: false },
    ]);
  });

  it('says where the account stands and what the next rung costs', () => {
    expect(vipStanding(save({ vip: { points: 60 } }))).toEqual({ level: 1, points: 60, toNext: 90 });
  });

  it('says there is no next rung at the top', () => {
    expect(vipStanding(save({ vip: { points: 100_000 } })).toNext).toBeNull();
  });
});
