import { describe, expect, it } from 'vitest';
import { heroTemplatesById, HERO_POOL } from '../content/heroes';
import { equipmentTemplatesById } from '../content/equipment';
import { SHOP_OFFERS } from '../content/shops';
import { VIP_LEVEL_THRESHOLDS } from '../content/vip';
import type { SaveV3 } from '../engine/save/schema';
import { migrateSave } from '../engine/save/migrate';
import { toLegacyPayload } from '../engine/save/legacyPayload';
import { readSave } from '../engine/save/v3';
import { economyFromSave, progressionFromSave } from '../engine/character/fromSave';
import { vipLevel } from './playerActions';
import { buy, buyUnits, canBuy, claimableCodexEntries, claimVip, priceOfOffer, recordCodex } from './shopActions';

/**
 * The seam between the shop surface and the engine.
 *
 * Tested without React, for the reason `playerActions.test.ts` gives: a
 * callback that picked a catalogue *and* lived in a component would need a
 * render to exercise.
 */

const NOW = 1_700_000_000_000;
const OPTIONS = { nowMs: NOW, content: { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() } };

function save(over: Record<string, unknown> = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 20 },
      wallet: { gold: 1_000_000, diamonds: 10_000 },
      ...over,
    },
    OPTIONS,
  );
}

const attempt = (from: SaveV3) => ({ save: from, nowMs: NOW, random: () => 0.5 });

describe('what the shop will sell', () => {
  it('prices an offer without pressing it', () => {
    expect(priceOfOffer('exp_cache')).toEqual({ currency: 'gold', cost: 2_200 });
    expect(priceOfOffer('rift_raid_ticket')).toEqual({ currency: 'diamonds', cost: 120 });
    expect(priceOfOffer('not_an_offer')).toBeNull();
  });

  it('agrees with itself about what a press would do', () => {
    /*
     * The one that matters, for the reason the summon version of it gives: a
     * button enabled by `canBuy` and refused by `buy` is a button that does
     * nothing. Checked across every offer and both purses, because the two
     * disagree in opposite directions for a withheld offer and a poor one.
     */
    const rich = save();
    const broke = save({ wallet: { gold: 0, diamonds: 0 } });
    for (const from of [rich, broke]) {
      const asked = SHOP_OFFERS.map(offer => canBuy(from, offer.id));
      const done = SHOP_OFFERS.map(offer => buy(attempt(from), offer.id) !== null);
      expect(done).toEqual(asked);
    }
  });

  it('refuses an offer nobody listed rather than throwing', () => {
    expect(canBuy(save(), 'not_an_offer')).toBe(false);
    expect(buy(attempt(save()), 'not_an_offer')).toBeNull();
    expect(buyUnits(save(), 'not_an_item', 1)).toBeNull();
  });

  it('sells the three this build can honour and withholds the rest', () => {
    expect(SHOP_OFFERS.filter(offer => canBuy(save(), offer.id)).map(offer => offer.id)).toEqual([
      'exp_cache',
      'potion_bundle',
      'armory_crate',
    ]);
  });
});

describe('the codex sweep', () => {
  const owned = (count: number) =>
    save({
      roster: {
        heroes: HERO_POOL.slice(0, count).map((hero, index) => ({
          id: hero.id,
          uid: `u${index}`,
          rarity: 'common',
          level: 1,
          rank: 1,
          teamBoost: hero.baseTeamBoost,
        })),
      },
    });

  it('counts what a press would record without recording it', () => {
    // A badge and a disabled button both ask this, so it has to be a query.
    const before = owned(4);
    expect(claimableCodexEntries(before)).toBe(4);
    expect(before.vip.points).toBe(0);
  });

  it('records them, and then there is nothing left to record', () => {
    const swept = recordCodex(owned(6));
    expect({ recorded: swept.recorded, points: swept.save.vip.points, level: swept.save.vip.level }).toEqual({
      recorded: 6,
      points: 60,
      level: 1,
    });
    expect(claimableCodexEntries(swept.save)).toBe(0);
  });

  it('ignores a hero the catalogue has retired', () => {
    // The roster reader drops a row whose template is gone, so the subject
    // list is built from the catalogue rather than from the roster.
    const stale = save({ roster: { heroes: [{ id: 'no_such_hero', uid: 'u0' }] } });
    expect(claimableCodexEntries(stale)).toBe(0);
  });
});

describe('claiming a VIP rung through the seam', () => {
  it('pays out, once', () => {
    const earned = save({ vip: { points: VIP_LEVEL_THRESHOLDS[1] } });
    const claim = claimVip(earned, 1)!;
    expect(claim.save.wallet.diamonds - earned.wallet.diamonds).toBe(50);
    expect(claimVip(claim.save, 1)).toBeNull();
  });
});

describe('every reader of the VIP level, after a migration', () => {
  it('agrees, because none of them is still looking in the legacy bag', () => {
    /*
     * The regression this commit could most easily have shipped. Claiming a
     * key **removes it from `legacy`**, so any reader left pointing at the bag
     * answers zero for every migrated account — silently, and on a field worth
     * 3% damage and 2.5% of each purse per rung.
     *
     * Four readers moved: the summon discount, the damage chain, the gold and
     * EXP chains, and the bag cap. This is the test that fails if one is
     * missed, and it goes the whole way round from a v2 payload.
     */
    const migrated = migrateSave({ saveVersion: 2, vipPoints: 3_000 }, OPTIONS);
    expect(migrated.legacy.vipLevel).toBeUndefined();
    expect(migrated.vip.level).toBe(6);
    expect(vipLevel(migrated)).toBe(6);
    expect(progressionFromSave(migrated).vipLevel).toBe(6);
    expect(economyFromSave(migrated).vipLevel).toBe(6);
  });

  it('writes the five keys back out for the shipped game to read', () => {
    const migrated = migrateSave(
      { saveVersion: 2, vipPoints: 3_000, vipRewardClaimedLevels: [1, 2], codexVipClaimedHeroIds: ['h1'] },
      OPTIONS,
    );
    const payload = toLegacyPayload(migrated);
    expect({
      vipPoints: payload.vipPoints,
      vipLevel: payload.vipLevel,
      vipRewardClaimedLevels: payload.vipRewardClaimedLevels,
      codexVipClaimedHeroIds: payload.codexVipClaimedHeroIds,
      codexVipClaimedUniqueIds: payload.codexVipClaimedUniqueIds,
    }).toEqual({
      vipPoints: 3_000,
      vipLevel: 6,
      vipRewardClaimedLevels: [1, 2],
      codexVipClaimedHeroIds: ['h1'],
      codexVipClaimedUniqueIds: [],
    });
  });
});
