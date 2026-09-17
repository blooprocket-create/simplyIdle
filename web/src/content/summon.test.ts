import { describe, expect, it } from 'vitest';
import fixture from '../engine/roster/__fixtures__/summon.json';
import teamFixture from '../engine/roster/__fixtures__/team-management.json';
import { HERO_POOL, getHeroTemplate } from './heroes';
import { RARITY_IDS, type Rarity } from './rarities';
import {
  BANNER_RATE_UP_BY_RARITY,
  DIAMOND_SUMMON_COST,
  FEATURED_SUMMON_BANNERS,
  GACHA_SUMMON_COST,
  SPARK_EXCHANGE_OPTIONS,
  SPARK_TOKEN_BY_RARITY,
  SUMMON_MILESTONES,
  VIP_SUMMON_DISCOUNT,
  VIP_SUMMON_DISCOUNT_LEVEL,
  bannerById,
  summonCost,
} from './summon';

/**
 * Checked against the fixture rather than read back from the file it is
 * transcribed into. Six milestone rows that differ in one field each, eight
 * spark rates and seven banners is a lot of transcription, and a test that
 * asserts the values it can see in the same file asserts nothing.
 */

describe('what a summon costs', () => {
  it('carries the shipped prices', () => {
    expect({
      gacha: GACHA_SUMMON_COST,
      diamonds: DIAMOND_SUMMON_COST,
      vipDiscountLevel: VIP_SUMMON_DISCOUNT_LEVEL,
      vipDiscount: VIP_SUMMON_DISCOUNT,
    }).toEqual(fixture.costs);
  });

  it('takes a tenth off for VIP 3 and nothing below it', () => {
    expect(summonCost(GACHA_SUMMON_COST, 0)).toBe(GACHA_SUMMON_COST);
    expect(summonCost(GACHA_SUMMON_COST, VIP_SUMMON_DISCOUNT_LEVEL - 1)).toBe(GACHA_SUMMON_COST);
    expect(summonCost(GACHA_SUMMON_COST, VIP_SUMMON_DISCOUNT_LEVEL)).toBe(450);
    expect(summonCost(GACHA_SUMMON_COST, 12)).toBe(450);
  });

  it('floors the discount rather than rounding it', () => {
    /*
     * A tenth off 500 is exactly 450, so the floor never bites at the shipped
     * price and would the moment either number moved. It takes a price ending
     * in 5 to tell the two readings apart — 495 discounts to 445.5, which
     * floors to 445 and rounds to 446. Picked rather than stumbled on: the
     * first version of this used 499, where 449.1 floors and rounds alike, and
     * swapping `floor` for `round` in the source left it green.
     */
    expect(summonCost(495, VIP_SUMMON_DISCOUNT_LEVEL)).toBe(445);
  });
});

describe('duplicate spark', () => {
  it('pays the shipped rate for every rarity', () => {
    expect(SPARK_TOKEN_BY_RARITY).toEqual(fixture.sparkTokenByRarity);
  });

  it('names every rarity, so a pull can never find no rate', () => {
    expect(Object.keys(SPARK_TOKEN_BY_RARITY).sort()).toEqual([...RARITY_IDS].sort());
  });

  it('never pays less for a better pull', () => {
    // Monotonic in the authored rarity order. Worth pinning because the rate
    // is read at the rarity *pulled* rather than the one already held, so a
    // dip would make a lucky duplicate worth less than an unlucky one.
    const rates = RARITY_IDS.map(id => SPARK_TOKEN_BY_RARITY[id]);
    for (let index = 1; index < rates.length; index += 1) {
      expect(rates[index], RARITY_IDS[index]).toBeGreaterThan(rates[index - 1]);
    }
  });
});

describe('summon milestones', () => {
  it('carries every shipped row, field for field', () => {
    const asRecorded = SUMMON_MILESTONES.map(entry => ({
      threshold: entry.threshold,
      rewardLabel: entry.rewardLabel,
      freeCharges: entry.freeCharges ?? null,
      sparkTokens: entry.sparkTokens ?? null,
      guaranteedRarity: entry.guaranteedRarity ?? null,
      grantUniqueForge: entry.grantUnique === true,
    }));
    expect(asRecorded).toEqual(fixture.milestones);
  });

  it('is ordered by threshold, which `claimMilestones` relies on', () => {
    // It walks the list in order and lets a later guarantee win, so an
    // out-of-order row would hand a jumped account the weaker promise.
    const thresholds = SUMMON_MILESTONES.map(entry => entry.threshold);
    expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
    expect(thresholds).toEqual(fixture.milestoneThresholds);
  });

  it('promises only rarities that exist', () => {
    for (const entry of SUMMON_MILESTONES) {
      if (!entry.guaranteedRarity) continue;
      expect(RARITY_IDS, entry.rewardLabel).toContain(entry.guaranteedRarity);
    }
  });
});

describe('banners', () => {
  it('carries all seven as authored', () => {
    expect(FEATURED_SUMMON_BANNERS).toEqual(fixture.banners);
  });

  it('features heroes the catalogue actually has', () => {
    /*
     * The one thing the fixture cannot check, because it was generated from a
     * file that has its own copy of the pool. A banner naming a retired hero
     * would show a card with no hero behind it.
     */
    for (const banner of FEATURED_SUMMON_BANNERS) {
      expect(getHeroTemplate(banner.featuredHeroId), banner.id).toBeDefined();
    }
  });

  it('features only heroes from the top of the pool, where the rate-up applies', () => {
    // Every rate-up rarity is legendary or better, and those draw from index
    // 40 upward. A banner featuring a hero below that could never be won by
    // the mechanism the rate-up is part of.
    const index = new Map(HERO_POOL.map((hero, at) => [hero.id, at]));
    for (const banner of FEATURED_SUMMON_BANNERS) {
      expect(index.get(banner.featuredHeroId) ?? -1, banner.id).toBeGreaterThanOrEqual(40);
    }
  });

  it('never repeats an id or a featured hero', () => {
    expect(new Set(FEATURED_SUMMON_BANNERS.map(entry => entry.id)).size).toBe(FEATURED_SUMMON_BANNERS.length);
    expect(new Set(FEATURED_SUMMON_BANNERS.map(entry => entry.featuredHeroId)).size).toBe(
      FEATURED_SUMMON_BANNERS.length,
    );
  });

  it('finds one by id, and nothing for an id it does not have', () => {
    expect(bannerById('astral-vanguard')?.featuredHeroId).toBe('h64');
    expect(bannerById('no-such-banner')).toBeUndefined();
  });

  it('rates up only the rarities a banner can win', () => {
    expect(BANNER_RATE_UP_BY_RARITY).toEqual(fixture.bannerRateUpByRarity);
    // Legendary and above only. A rate-up on common would fire on half of all
    // pulls, which is what `pickWithBanner`'s short-circuit exists to avoid.
    const rated = Object.keys(BANNER_RATE_UP_BY_RARITY) as Rarity[];
    for (const rarity of rated)
      expect(RARITY_IDS.indexOf(rarity)).toBeGreaterThanOrEqual(RARITY_IDS.indexOf('legendary'));
  });

  it('never rates up a worse rarity more than a better one', () => {
    const rated = (Object.keys(BANNER_RATE_UP_BY_RARITY) as Rarity[]).sort(
      (a, b) => RARITY_IDS.indexOf(a) - RARITY_IDS.indexOf(b),
    );
    for (let index = 1; index < rated.length; index += 1) {
      const previous = BANNER_RATE_UP_BY_RARITY[rated[index - 1]] ?? 0;
      expect(BANNER_RATE_UP_BY_RARITY[rated[index]] ?? 0, rated[index]).toBeGreaterThan(previous);
    }
  });
});

describe('the spark exchange', () => {
  it('carries the shipped options, prices and labels', () => {
    expect(
      SPARK_EXCHANGE_OPTIONS.map(option => ({
        id: option.id,
        label: option.label,
        sparkCost: option.sparkCost,
        kind: option.kind,
        ...(option.minRarity ? { minRarity: option.minRarity } : {}),
        ...(option.minTier ? { minTier: option.minTier } : {}),
      })),
    ).toEqual(teamFixture.sparkOptions);
  });

  it('names a rarity for every option that hands over a hero', () => {
    /*
     * `minRarity` is optional because a free charge has none, and
     * `applySparkExchange` reads it for both hero kinds — so an option of
     * either kind with no rarity would be a purchase that granted nothing.
     * The type cannot say "required unless free", so this does.
     */
    for (const option of SPARK_EXCHANGE_OPTIONS) {
      expect({ id: option.id, named: option.minRarity !== undefined }).toEqual({
        id: option.id,
        named: option.kind !== 'free_summon',
      });
    }
  });

  it('prices them in the order they are offered', () => {
    // The screen lists them as authored, so an out-of-order price would put
    // the expensive option above the cheap one with nothing saying why.
    const costs = SPARK_EXCHANGE_OPTIONS.map(option => option.sparkCost);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });
});
