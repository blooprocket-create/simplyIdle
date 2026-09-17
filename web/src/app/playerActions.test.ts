import { describe, expect, it } from 'vitest';
import { heroTemplatesById } from '../content/heroes';
import { equipmentTemplatesById } from '../content/equipment';
import { DIAMOND_SUMMON_COST, GACHA_SUMMON_COST, VIP_SUMMON_DISCOUNT_LEVEL } from '../content/summon';
import type { SaveV3 } from '../engine/save/schema';
import { readSave } from '../engine/save/v3';
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

function rich(legacy: Record<string, unknown> = {}): SaveV3 {
  const base = saveWith();
  return {
    ...base,
    wallet: { ...base.wallet, bossTears: 50_000, diamonds: 50_000 },
    legacy: { ...base.legacy, ...legacy },
  };
}

describe('what a pull costs this account', () => {
  it('reads VIP out of the bag rather than assuming zero', () => {
    // VIP is Phase 10's system and stays unclaimed; the discount is the one
    // field a pull needs, and `legacy` is there to be read from.
    expect(vipLevel(saveWith())).toBe(0);
    expect(vipLevel(rich({ vipLevel: 7 }))).toBe(7);
    expect(vipLevel(rich({ vipLevel: 'gold' }))).toBe(0);
    expect(vipLevel(rich({ vipLevel: -3 }))).toBe(0);
  });

  it('charges boss tears and diamonds from their own prices', () => {
    expect(priceOfSummon(rich(), 'bossTears')).toBe(GACHA_SUMMON_COST);
    expect(priceOfSummon(rich(), 'diamonds')).toBe(DIAMOND_SUMMON_COST);
  });

  it('applies the VIP discount to both', () => {
    const vip = rich({ vipLevel: VIP_SUMMON_DISCOUNT_LEVEL });
    expect(priceOfSummon(vip, 'bossTears')).toBe(450);
    expect(priceOfSummon(vip, 'diamonds')).toBe(450);
    // And a level below it pays full price.
    expect(priceOfSummon(rich({ vipLevel: VIP_SUMMON_DISCOUNT_LEVEL - 1 }), 'diamonds')).toBe(DIAMOND_SUMMON_COST);
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
     * `summonOnce` is a button that does nothing, and the VIP discount is
     * exactly where the two would drift: 450 held is enough at VIP 3 and not
     * enough below it.
     */
    const base = saveWith();
    const at450 = { ...base, wallet: { ...base.wallet, bossTears: 450 } };
    const vip = { ...at450, legacy: { ...at450.legacy, vipLevel: VIP_SUMMON_DISCOUNT_LEVEL } };

    expect(canSummon(at450, 'bossTears')).toBe(false);
    expect(summonOnce({ save: at450, pay: 'bossTears', nowMs: NOW, random: () => 0.5 })).toBeNull();

    expect(canSummon(vip, 'bossTears')).toBe(true);
    expect(summonOnce({ save: vip, pay: 'bossTears', nowMs: NOW, random: () => 0.5 })).not.toBeNull();
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
