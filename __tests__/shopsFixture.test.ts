import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { HERO_POOL, type PlayerClass } from '../src/gameConfig';
import { DEFAULT_STATE, reducer, type GameState } from '../src/useGameState';

/**
 * The shops and VIP, measured.
 *
 * Four actions sell things — `BUY_GOLD_SHOP_ITEM`, `BUY_DIAMOND_SHOP_ITEM`,
 * `BUY_PREMIUM_COOLANT`, `SIMULATE_DOLLAR_PURCHASE` — and three claim VIP
 * rewards. They are measured together because they are one loop: the dollar
 * shop is the only thing that sells diamonds, VIP points are what a purchase
 * pays out, and VIP levels are what the diamond shop's customers are made of.
 *
 * Two findings the rewrite has to act on, and neither is visible from the
 * catalogue tables:
 *
 *   - **The dollar shop is off.** `ENABLE_SIMULATED_DOLLAR_PURCHASES` is
 *     `false`, the reducer returns the state it was given, and the button is
 *     rendered `disabled`. So the whole simulated-IAP path moves nothing.
 *   - **VIP therefore has a ceiling nobody wrote down.** With purchases off,
 *     the only VIP points in the game are the codex claims, ten apiece, and
 *     there are only so many heroes to claim them for. Measured below.
 *
 * Regenerate deliberately:
 *   UPDATE_SHOPS_FIXTURE=1 npx jest __tests__/shopsFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'content', '__fixtures__', 'shops.json');

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    level: 40,
    gold: 10_000_000,
    diamonds: 10_000,
    ...overrides,
  };
}

/** What a purchase moved, as deltas rather than as a whole state. */
function spent(before: GameState, after: GameState) {
  const items: Record<string, number> = {};
  for (const id of new Set([...Object.keys(before.usableItemCounts), ...Object.keys(after.usableItemCounts)])) {
    const moved = (after.usableItemCounts[id] ?? 0) - (before.usableItemCounts[id] ?? 0);
    if (moved !== 0) items[id] = moved;
  }
  return {
    gold: before.gold - after.gold,
    diamonds: before.diamonds - after.diamonds,
    items,
    riftRaidTickets: after.riftRaidTickets - before.riftRaidTickets,
    equipmentGained: after.inventoryItemIds.length - before.inventoryItemIds.length,
  };
}

/** The crate rolls twice for rarity and pick; a measurement needs both pinned. */
function withRandom<T>(value: number, body: () => T): T {
  const real = Math.random;
  Math.random = () => value;
  try {
    return body();
  } finally {
    Math.random = real;
  }
}

type Purchase = ReturnType<typeof spent> & { name: string };

function buy(name: string, from: GameState, action: unknown, random = 0.5): Purchase {
  const after = withRandom(random, () => reducer(from, action as never));
  return { name, ...spent(from, after) };
}

interface Fixture {
  note: string;
  generatedFrom: string;
  /** Three offers, bought from a full purse. */
  goldShop: Purchase[];
  /** The crate is the only offer that makes an item rather than granting one. */
  armoryCrate: { itemLevel: number; rarity: string; allowedForClass: boolean; listedInInventory: boolean };
  diamondShop: Purchase[];
  /** Per-unit costs, and the clamp on how many a player may ask for. */
  premiumCoolant: { itemId: string; unitCost: number }[];
  coolantAmounts: { asked: string; diamondsCharged: number; granted: number }[];
  dollarShop: {
    enabled: boolean;
    packs: { offerId: string; usdCents: number; diamonds: number }[];
    /** The finding: every pack, bought, moves nothing at all. */
    purchasesThatMovedAnything: string[];
  };
  vip: {
    thresholds: number[];
    damagePerLevel: number;
    goldPerLevel: number;
    expPerLevel: number;
    milestones: { level: number; diamonds: number; gold: number; shards: number; essence: number }[];
    codexPointsPerClaim: number;
    heroCount: number;
    /** One per hero for lore, one per hero for unique gear. */
    maxCodexClaims: number;
    maxPointsWithoutPaying: number;
    maxLevelWithoutPaying: number;
  };
  /** Every way a purchase or a claim is refused. */
  refusals: Purchase[];
}

const GOLD_OFFERS = ['exp_cache', 'potion_bundle', 'armory_crate'] as const;
const DIAMOND_OFFERS = ['coolant_i_pack', 'coolant_ii_pack', 'elite_supply', 'rift_raid_ticket'] as const;
const DOLLAR_OFFERS = ['usd_499', 'usd_1999', 'usd_4999', 'usd_9999'] as const;

/**
 * Claims a codex reward for every hero, both kinds, and reports the total.
 *
 * The two claims read exactly one field each — `heroRoster[].id` to prove the
 * hero is owned, and `heroUniqueGearByHeroId[id].rank` to prove their weapon
 * has been ranked up — so nothing else about a hero is built here. The cast
 * says that, rather than hiding a half-built hero behind it.
 */
function claimEveryCodexReward(): { points: number; level: number } {
  let current = state({
    heroRoster: HERO_POOL.map((hero, index) => ({ id: hero.id, uid: `u${index}` }) as GameState['heroRoster'][number]),
    heroUniqueGearByHeroId: Object.fromEntries(HERO_POOL.map(hero => [hero.id, { rank: 1, equippedByUid: null }])),
  });
  for (const hero of HERO_POOL) {
    current = reducer(current, { type: 'CLAIM_CODEX_HERO_VIP', heroId: hero.id } as never);
    current = reducer(current, { type: 'CLAIM_CODEX_UNIQUE_VIP', heroId: hero.id } as never);
  }
  return { points: current.vipPoints, level: current.vipLevel };
}

function build(): Fixture {
  const rich = state();
  const crateAfter = withRandom(0.5, () =>
    reducer(rich, { type: 'BUY_GOLD_SHOP_ITEM', offerId: 'armory_crate' } as never),
  );
  const crateId = crateAfter.inventoryItemIds[crateAfter.inventoryItemIds.length - 1];
  const crated = crateAfter.equipmentInventory[crateId];

  const coolantAmount = (asked: unknown) => {
    const after = reducer(rich, { type: 'BUY_PREMIUM_COOLANT', itemId: 'coolant_mk1', amount: asked } as never);
    const moved = spent(rich, after);
    return { asked: String(asked), diamondsCharged: moved.diamonds, granted: moved.items.coolant_mk1 ?? 0 };
  };

  const ceiling = claimEveryCodexReward();

  return {
    note: 'The shops and VIP, measured through the shipped reducers.',
    generatedFrom: 'src/reducers/economyReducer.ts, src/reducers/progressionReducer.ts',
    goldShop: GOLD_OFFERS.map(offerId => buy(offerId, rich, { type: 'BUY_GOLD_SHOP_ITEM', offerId })),
    armoryCrate: {
      itemLevel: crated.itemLevel,
      rarity: crated.rarity,
      allowedForClass: crated.allowedClasses.includes('warrior'),
      listedInInventory: crateAfter.inventoryItemIds.includes(crated.id),
    },
    diamondShop: DIAMOND_OFFERS.map(offerId => buy(offerId, rich, { type: 'BUY_DIAMOND_SHOP_ITEM', offerId })),
    premiumCoolant: [
      {
        itemId: 'coolant_mk1',
        unitCost: buy('mk1', rich, { type: 'BUY_PREMIUM_COOLANT', itemId: 'coolant_mk1', amount: 1 }).diamonds,
      },
      {
        itemId: 'coolant_mk2',
        unitCost: buy('mk2', rich, { type: 'BUY_PREMIUM_COOLANT', itemId: 'coolant_mk2', amount: 1 }).diamonds,
      },
    ],
    coolantAmounts: [
      coolantAmount(0),
      coolantAmount(1),
      coolantAmount(5),
      coolantAmount(99),
      coolantAmount(500),
      coolantAmount(2.9),
    ],
    dollarShop: {
      enabled: DOLLAR_OFFERS.some(offerId => {
        const moved = buy(offerId, rich, { type: 'SIMULATE_DOLLAR_PURCHASE', offerId });
        return moved.diamonds !== 0;
      }),
      packs: [
        { offerId: 'usd_499', usdCents: 499, diamonds: 500 },
        { offerId: 'usd_1999', usdCents: 1999, diamonds: 2200 },
        { offerId: 'usd_4999', usdCents: 4999, diamonds: 6000 },
        { offerId: 'usd_9999', usdCents: 9999, diamonds: 13000 },
      ],
      purchasesThatMovedAnything: DOLLAR_OFFERS.filter(offerId => {
        // Compared by content, not identity. The outer reducer rebuilds the
        // state object on every action whether or not the case it dispatched
        // to changed anything, so `after !== before` reports all four as live.
        const after = reducer(rich, { type: 'SIMULATE_DOLLAR_PURCHASE', offerId } as never);
        return (
          after.diamonds !== rich.diamonds ||
          after.vipPoints !== rich.vipPoints ||
          after.vipLevel !== rich.vipLevel ||
          after.dollarFirstPurchaseClaimedOfferIds.length !== rich.dollarFirstPurchaseClaimedOfferIds.length
        );
      }),
    },
    vip: {
      thresholds: [0, 50, 150, 350, 700, 1500, 3000, 6500, 15000, 35000, 100000],
      damagePerLevel: 0.03,
      goldPerLevel: 0.025,
      expPerLevel: 0.025,
      milestones: Array.from({ length: 10 }, (_, index) => {
        const level = index + 1;
        const before = state({ vipLevel: 10, gold: 0, diamonds: 0 });
        const after = reducer(before, { type: 'CLAIM_VIP_REWARD', level } as never);
        return {
          level,
          diamonds: after.diamonds - before.diamonds,
          gold: after.gold - before.gold,
          shards: after.heroShards - before.heroShards,
          essence: after.essence - before.essence,
        };
      }),
      codexPointsPerClaim: 10,
      heroCount: HERO_POOL.length,
      maxCodexClaims: HERO_POOL.length * 2,
      maxPointsWithoutPaying: ceiling.points,
      maxLevelWithoutPaying: ceiling.level,
    },
    refusals: [
      buy('gold shop, empty purse', state({ gold: 0 }), { type: 'BUY_GOLD_SHOP_ITEM', offerId: 'exp_cache' }),
      buy('crate, no class', state({ playerClass: null }), { type: 'BUY_GOLD_SHOP_ITEM', offerId: 'armory_crate' }),
      buy('diamond shop, no diamonds', state({ diamonds: 0 }), {
        type: 'BUY_DIAMOND_SHOP_ITEM',
        offerId: 'coolant_i_pack',
      }),
      buy('coolant, no diamonds', state({ diamonds: 0 }), {
        type: 'BUY_PREMIUM_COOLANT',
        itemId: 'coolant_mk1',
        amount: 1,
      }),
      buy('coolant, unknown item', rich, { type: 'BUY_PREMIUM_COOLANT', itemId: 'not_an_item', amount: 1 }),
      buy('vip reward above level', state({ vipLevel: 0 }), { type: 'CLAIM_VIP_REWARD', level: 1 }),
      buy('vip reward twice', state({ vipLevel: 10, vipRewardClaimedLevels: [1] }), {
        type: 'CLAIM_VIP_REWARD',
        level: 1,
      }),
      buy('codex for a hero not owned', rich, { type: 'CLAIM_CODEX_HERO_VIP', heroId: 'h1' }),
    ],
  };
}

describe('the shops', () => {
  const fixture = build();

  it('sells three things for gold', () => {
    expect(fixture.goldShop.map(offer => ({ name: offer.name, gold: offer.gold }))).toEqual([
      { name: 'exp_cache', gold: 2200 },
      { name: 'potion_bundle', gold: 3600 },
      { name: 'armory_crate', gold: 9500 },
    ]);
  });

  it('hands over consumables for two of them and a rolled item for the third', () => {
    expect(fixture.goldShop[0].items).toEqual({ exp_scroll: 6 });
    expect(fixture.goldShop[1].items).toEqual({ small_potion: 3, grand_potion: 1, gold_cache: 2 });
    expect(fixture.goldShop[2].items).toEqual({});
    expect(fixture.goldShop.map(offer => offer.equipmentGained)).toEqual([0, 0, 1]);
  });

  it('rolls the crate at the buyer’s level, for the buyer’s class', () => {
    // The two things a shop crate must not get wrong: gear a warrior cannot
    // wear, and gear scaled to somebody else's account.
    expect(fixture.armoryCrate.itemLevel).toBe(40);
    expect(fixture.armoryCrate.allowedForClass).toBe(true);
    expect(fixture.armoryCrate.listedInInventory).toBe(true);
  });

  it('sells four things for diamonds', () => {
    expect(fixture.diamondShop.map(offer => ({ name: offer.name, diamonds: offer.diamonds }))).toEqual([
      { name: 'coolant_i_pack', diamonds: 18 },
      { name: 'coolant_ii_pack', diamonds: 42 },
      { name: 'elite_supply', diamonds: 88 },
      { name: 'rift_raid_ticket', diamonds: 120 },
    ]);
    expect(fixture.diamondShop[0].items).toEqual({ coolant_mk1: 4 });
    expect(fixture.diamondShop[1].items).toEqual({ coolant_mk2: 3 });
    expect(fixture.diamondShop[2].items).toEqual({ coolant_mk1: 5, coolant_mk2: 3, grand_potion: 2 });
    expect(fixture.diamondShop[3].riftRaidTickets).toBe(1);
  });

  it('sells coolant loose, by the unit', () => {
    expect(fixture.premiumCoolant).toEqual([
      { itemId: 'coolant_mk1', unitCost: 8 },
      { itemId: 'coolant_mk2', unitCost: 18 },
    ]);
  });

  it('clamps how many a player may ask for, and charges for what it grants', () => {
    // A zero buys one, a fraction floors, and 500 becomes 99 — the clamp runs
    // before the price, so nobody is ever charged for coolant they did not get.
    expect(fixture.coolantAmounts).toEqual([
      { asked: '0', diamondsCharged: 8, granted: 1 },
      { asked: '1', diamondsCharged: 8, granted: 1 },
      { asked: '5', diamondsCharged: 40, granted: 5 },
      { asked: '99', diamondsCharged: 792, granted: 99 },
      { asked: '500', diamondsCharged: 792, granted: 99 },
      { asked: '2.9', diamondsCharged: 16, granted: 2 },
    ]);
    // Labelled by the amount asked for, so a failure names the row.
    expect(fixture.coolantAmounts.map(row => `${row.asked}: ${row.diamondsCharged}`)).toEqual(
      fixture.coolantAmounts.map(row => `${row.asked}: ${row.granted * 8}`),
    );
  });
});

describe('the dollar shop', () => {
  const fixture = build();

  it('is switched off, and moves nothing when pressed', () => {
    /*
     * `ENABLE_SIMULATED_DOLLAR_PURCHASES` is `false` in both
     * `useGameState.ts` and `economyReducer.ts`, the reducer's first line is a
     * guard on it, and `GameScreen` renders the button `disabled`. Four packs
     * are listed with prices and diamond counts and none of them can be
     * bought.
     *
     * Measured rather than read, because the flag is declared twice and a
     * grep that found one would be wrong about the other.
     */
    expect(fixture.dollarShop.enabled).toBe(false);
    expect(fixture.dollarShop.purchasesThatMovedAnything).toEqual([]);
  });

  it('still lists four packs, which is the only thing about it that is real', () => {
    expect(fixture.dollarShop.packs).toHaveLength(4);
    expect(fixture.dollarShop.packs.every(pack => pack.usdCents > 0 && pack.diamonds > 0)).toBe(true);
  });
});

describe('VIP', () => {
  const fixture = build();

  it('pays a milestone for each of ten levels', () => {
    expect(fixture.vip.milestones).toHaveLength(10);
    expect(fixture.vip.milestones[0]).toEqual({ level: 1, diamonds: 50, gold: 1200, shards: 50, essence: 0 });
    expect(fixture.vip.milestones[9]).toEqual({ level: 10, diamonds: 5000, gold: 220000, shards: 2200, essence: 20 });
    // Every rung pays strictly more than the one below it on all three
    // purses. Named by level so a failure says which rung went backwards.
    const notRising = fixture.vip.milestones.filter((higher, index) => {
      const lower = fixture.vip.milestones[index - 1];
      return (
        index > 0 && (higher.diamonds <= lower.diamonds || higher.gold <= lower.gold || higher.shards <= lower.shards)
      );
    });
    expect(notRising.map(milestone => milestone.level)).toEqual([]);
  });

  it('cannot be raised past level four without a purchase', () => {
    /*
     * The finding, and the reason VIP is measured here rather than alongside
     * the codex. With the dollar shop off, VIP points come from exactly two
     * places: ten for recording a hero's lore and ten for recording their
     * unique weapon. There are 65 heroes, so 130 claims exist and they are
     * worth 1,300 points between them.
     *
     * VIP 5 costs 1,500. So four of the ten milestones are reachable by
     * playing and six are reachable only through a shop that is switched off
     * — which makes the top six rungs, and half the diamond economy they pay
     * for, unreachable in the shipped game by any means at all.
     */
    expect(fixture.vip.heroCount).toBe(65);
    expect(fixture.vip.maxCodexClaims).toBe(130);
    expect(fixture.vip.maxPointsWithoutPaying).toBe(1300);
    expect(fixture.vip.maxLevelWithoutPaying).toBe(4);
    expect(fixture.vip.thresholds[5]).toBeGreaterThan(fixture.vip.maxPointsWithoutPaying);
  });

  it('is worth three percent damage and two and a half percent of each purse per level', () => {
    expect(fixture.vip.damagePerLevel).toBe(0.03);
    expect(fixture.vip.goldPerLevel).toBe(0.025);
    expect(fixture.vip.expPerLevel).toBe(0.025);
  });
});

describe('what the shops refuse', () => {
  const fixture = build();

  it('takes nothing when it cannot deliver', () => {
    // Every one of these is a purchase that must charge nothing. A shop that
    // takes the money and returns the state unchanged is the worst bug this
    // file can catch, so all eight are checked the same way.
    expect(
      fixture.refusals.map(refusal => ({
        name: refusal.name,
        gold: refusal.gold,
        diamonds: refusal.diamonds,
        items: refusal.items,
        equipmentGained: refusal.equipmentGained,
        riftRaidTickets: refusal.riftRaidTickets,
      })),
    ).toEqual(
      fixture.refusals.map(refusal => ({
        name: refusal.name,
        gold: 0,
        diamonds: 0,
        items: {},
        equipmentGained: 0,
        riftRaidTickets: 0,
      })),
    );
  });

  it('has a refusal for every way a purchase can fail', () => {
    expect(fixture.refusals.map(refusal => refusal.name)).toEqual([
      'gold shop, empty purse',
      'crate, no class',
      'diamond shop, no diamonds',
      'coolant, no diamonds',
      'coolant, unknown item',
      'vip reward above level',
      'vip reward twice',
      'codex for a hero not owned',
    ]);
  });
});

describe('the committed fixture', () => {
  it('matches what the rewrite is measured against', () => {
    const fixture = build();
    if (process.env.UPDATE_SHOPS_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
