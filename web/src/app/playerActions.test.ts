import { describe, expect, it } from 'vitest';
import { heroTemplatesById } from '../content/heroes';
import { equipmentTemplatesById } from '../content/equipment';
import { DIAMOND_SUMMON_COST, GACHA_SUMMON_COST, VIP_SUMMON_DISCOUNT_LEVEL } from '../content/summon';
import type { SaveV3 } from '../engine/save/schema';
import { readSave } from '../engine/save/v3';
import { readVipFromLegacy } from '../engine/save/vipSlice';
import { VIP_LEVEL_THRESHOLDS } from '../content/vip';
import { migrateSave } from '../engine/save/migrate';
import { canSummon, priceOfSummon, summonOnce, vipLevel } from './playerActions';

/**
 * The seam between a surface and the engine.
 *
 * Tested without React on purpose. A callback that picked a hero pool *and*
 * lived in a component would need a render to exercise, which is most of why
 * the shipped game's reducer actions have no tests at all.
 */

const NOW = 1_700_000_000_000;
const OPTIONS = { nowMs: NOW, content: { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() } };

function saveWith(over: Partial<SaveV3> = {}): SaveV3 {
  return { ...readSave({ version: 3 }, OPTIONS), ...over };
}

/**
 * A full purse at a chosen VIP level.
 *
 * The level goes through `readVipFromLegacy` rather than being written into
 * the block by hand, so these still exercise the reader that a migrated v2
 * save comes through — and so a rubbish stored level is rejected here the same
 * way it is there.
 */
function rich(vipKeys: Record<string, unknown> = {}): SaveV3 {
  const base = saveWith();
  return {
    ...base,
    wallet: { ...base.wallet, bossTears: 50_000, diamonds: 50_000 },
    vip: readVipFromLegacy({ vipPoints: 0, ...vipKeys }),
  };
}

/** The level a point total buys, for the tests that want a level rather than points. */
function atVip(level: number): Record<string, unknown> {
  return { vipPoints: VIP_LEVEL_THRESHOLDS[level] };
}

describe('what a pull costs this account', () => {
  it('reads VIP off the typed block rather than assuming zero', () => {
    /*
     * This read `save.legacy.vipLevel` until Phase 10 claimed the five VIP
     * keys. The move is invisible from here — the discount is priced off the
     * same number — but it is exactly the kind of change a hand-built `legacy`
     * bag hides, which is why the case below migrates a real v2 payload.
     */
    expect(vipLevel(saveWith())).toBe(0);
    expect(vipLevel(rich(atVip(7)))).toBe(7);
    expect(vipLevel(rich({ vipPoints: 'gold' }))).toBe(0);
    expect(vipLevel(rich({ vipPoints: -3 }))).toBe(0);
  });

  it('still finds it after a v2 save has been migrated', () => {
    /*
     * The case a hand-built save cannot make. Claiming a key *removes* it from
     * `legacy`, so a reader left pointing at the bag answers zero for every
     * account — silently, and on the one field that prices a summon.
     *
     * So this goes the whole way round: a v2 payload in, the migration, and
     * the discount out.
     */
    const migrated = migrateSave({ saveVersion: 2, vipPoints: 3_000, diamonds: 50_000 }, OPTIONS);
    expect(migrated.legacy.vipLevel).toBeUndefined();
    expect(vipLevel(migrated)).toBe(6);
    expect(priceOfSummon(migrated, 'diamonds')).toBe(450);
  });

  it('charges boss tears and diamonds from their own prices', () => {
    expect(priceOfSummon(rich(), 'bossTears')).toBe(GACHA_SUMMON_COST);
    expect(priceOfSummon(rich(), 'diamonds')).toBe(DIAMOND_SUMMON_COST);
  });

  it('applies the VIP discount to the diamond price and not the tear price', () => {
    /*
     * This asserted 450 for both, which was wrong twice: a tear pull costs
     * **one** tear, and takes no discount at all. The shipped tear path is a
     * guard — `bossTears < 1` — with no cost arithmetic on it to discount,
     * while the diamond path computes `DIAMOND_SUMMON_COST * (1 - discount)`.
     * Both measured through the reducer in `summonFixture`.
     */
    const vip = rich(atVip(VIP_SUMMON_DISCOUNT_LEVEL));
    expect(priceOfSummon(vip, 'bossTears')).toBe(GACHA_SUMMON_COST);
    expect(priceOfSummon(rich({}), 'bossTears')).toBe(GACHA_SUMMON_COST);
    expect(priceOfSummon(vip, 'diamonds')).toBe(450);
    // And a level below it pays full price.
    expect(priceOfSummon(rich(atVip(VIP_SUMMON_DISCOUNT_LEVEL - 1)), 'diamonds')).toBe(DIAMOND_SUMMON_COST);
  });
});

describe('whether a pull would go through', () => {
  it('says yes on a free charge whatever the purse holds', () => {
    const broke = saveWith();
    expect(canSummon(broke, 'bossTears')).toBe(false);
    expect(canSummon({ ...broke, summon: { ...broke.summon, freeCharges: 1 } }, 'bossTears')).toBe(true);
  });

  it('answers per currency, not per account', () => {
    const base = saveWith();
    const tearsOnly = { ...base, wallet: { ...base.wallet, bossTears: 500, diamonds: 0 } };
    expect(canSummon(tearsOnly, 'bossTears')).toBe(true);
    expect(canSummon(tearsOnly, 'diamonds')).toBe(false);
  });

  it('agrees with what a pull actually does, discount and all', () => {
    /*
     * The one that matters. A button enabled by `canSummon` and refused by
     * `summonOnce` is a button that does nothing.
     *
     * Measured on the **diamond** price, which is where the VIP discount
     * lives: 450 held is enough at VIP 3 and not enough below it. It used to
     * be measured on tears, which took a discount this port invented.
     */
    const base = saveWith();
    const at450 = { ...base, wallet: { ...base.wallet, diamonds: 450 } };
    const vip = { ...at450, vip: readVipFromLegacy(atVip(VIP_SUMMON_DISCOUNT_LEVEL)) };

    expect(canSummon(at450, 'diamonds')).toBe(false);
    expect(summonOnce({ save: at450, pay: 'diamonds', nowMs: NOW, random: () => 0.5 })).toBeNull();

    expect(canSummon(vip, 'diamonds')).toBe(true);
    expect(summonOnce({ save: vip, pay: 'diamonds', nowMs: NOW, random: () => 0.5 })).not.toBeNull();
  });

  it('lets a single boss tear buy a hero', () => {
    // The shipped price, and the one this port had five hundred times wrong.
    const base = saveWith();
    const one = { ...base, wallet: { ...base.wallet, bossTears: 1 } };
    expect(canSummon(one, 'bossTears')).toBe(true);
    expect(summonOnce({ save: one, pay: 'bossTears', nowMs: NOW, random: () => 0.5 })).not.toBeNull();

    const none = { ...base, wallet: { ...base.wallet, bossTears: 0 } };
    expect(canSummon(none, 'bossTears')).toBe(false);
  });
});

describe('pulling', () => {
  it('hands the engine the whole catalogue', () => {
    // Not a slice of it. A pull that could only reach part of the pool would
    // make some heroes unobtainable, which is the kind of thing nobody
    // notices for months.
    const seen = new Set<string>();
    let save = rich();
    for (let pull = 0; pull < 200; pull += 1) {
      const outcome = summonOnce({ save, pay: 'diamonds', nowMs: NOW + pull, random: Math.random });
      if (!outcome) break;
      save = outcome.save;
      seen.add(outcome.hero.id);
    }
    // Two hundred pulls from a sixty-five hero pool reach well past a third of
    // it even on an unlucky run; the point is that it is not a handful.
    expect(seen.size).toBeGreaterThan(20);
  });

  it('spends what it said it would', () => {
    const save = rich();
    const outcome = summonOnce({ save, pay: 'bossTears', nowMs: NOW, random: () => 0.5 })!;
    expect(save.wallet.bossTears - outcome.save.wallet.bossTears).toBe(priceOfSummon(save, 'bossTears'));
  });

  it('leaves the save alone when it refuses', () => {
    const broke = saveWith();
    expect(summonOnce({ save: broke, pay: 'diamonds', nowMs: NOW, random: () => 0.5 })).toBeNull();
    expect(canSummon(broke, 'diamonds')).toBe(false);
  });
});
