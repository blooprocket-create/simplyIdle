import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  EQUIPMENT_CATALOG,
  EQUIPMENT_RARITIES,
  getStarterEquipmentForClass,
  rollEquipmentRarity,
  rollEquipmentRarityByTier,
  type EquipmentRarity,
  type EquipmentSlot,
  type PlayerClass,
  type StatBlock,
} from '../src/gameConfig';
import { DEFAULT_STATE, computeStats, getEquipmentCraftCost, reducer, type GameState } from '../src/useGameState';

/**
 * Reference behaviour for equipment: the catalogue, what a crafted item rolls,
 * what it is worth dismantled, what an upgrade costs, and what wearing it does
 * to the player's stats.
 *
 * Generated from the shipped source **before** the port exists, which is the
 * Phase 1 pattern and the only order that makes a parity fixture mean
 * anything: a fixture written after the port records what the port does.
 *
 * Almost everything here draws. `randomizeEquipmentBonus` takes one value per
 * stat, `createEquipmentInstance` takes one for the id, and crafting takes two
 * more before either — so `Math.random` is scripted rather than pinned, the
 * same way `summonFixture` scripts it, and **the draw counts are recorded**.
 * The order is part of the behaviour: a port with the same distribution in a
 * different order agrees on nothing after the first value.
 *
 * Regenerate deliberately:
 *   UPDATE_EQUIPMENT_FIXTURE=1 npx jest __tests__/equipmentFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'engine', 'equipment', '__fixtures__', 'equipment.json');

const FIXED_NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const SEED = 20_260_115;

/** The same LCG the summon and team fixtures use, for the same reason. */
function scriptedRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const CLASSES: PlayerClass[] = ['warrior', 'berserker', 'archer', 'mage', 'monk'];
const SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'accessory'];

function state(overrides: Partial<GameState>): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    ...overrides,
  };
}

function apply(from: GameState, action: unknown): GameState {
  return reducer(from, action as never);
}

/**
 * Run one action with a scripted source, and count what it took.
 *
 * `Date.now` is pinned for the whole suite; `Math.random` is scripted per
 * scenario so that each starts from the same value and the recorded draw
 * counts are comparable.
 */
function drive(from: GameState, action: unknown, seed = SEED): { after: GameState; draws: number } {
  const source = scriptedRandom(seed);
  let draws = 0;
  const spy = jest.spyOn(Math, 'random').mockImplementation(() => {
    draws += 1;
    return source();
  });
  try {
    return { after: apply(from, action), draws };
  } finally {
    spy.mockRestore();
  }
}

/** The stat block an equipped set contributes, read off the shipped selector. */
function equipmentBonusOf(from: GameState): StatBlock {
  // `getEquipmentBonusStats` is private; `computeStats` publishes the same sum
  // under `equipmentBonus`, which is also the field a screen reads.
  return computeStats(from).equipmentBonus;
}

interface Fixture {
  note: string;
  generatedFrom: string;
  seed: number;
  /** The first values the scripted source yields, so a port can check its own. */
  randomSequence: number[];

  rarities: { id: string; label: string; color: string; dropWeight: number }[];
  catalog: {
    id: string;
    name: string;
    emoji: string;
    slot: string;
    rarity: string;
    allowedClasses: string[];
    bonus: Partial<StatBlock>;
  }[];
  starterByClass: Record<string, string[]>;
  craftCosts: Record<string, { scrap: number; gold: number }>;

  /** `rollEquipmentRarity` and the tier-gated variant, swept across the unit. */
  rarityRolls: {
    name: string;
    mythic: boolean;
    transcendent: boolean;
    /** Twenty-one even steps, for the shape. Too coarse to reach the top tiers. */
    byRoll: string[];
    /** The lowest roll producing each rarity, scanned finely. Null when unreachable. */
    firstRollByRarity: Record<string, number | null>;
  }[];

  /**
   * The same craft at three player levels, from one seed.
   *
   * `equipmentBudgetFor` is private and its only observable is a rolled bonus,
   * whose split is random — but the loop assigns exactly the budget across the
   * five stats, so the *sum* is the budget, give or take the anchor-stat floor
   * that runs after it. Recorded as whole crafts rather than as a number,
   * because a number reached by inference is a number a port can satisfy by
   * inferring differently.
   */
  levelScaling: { playerLevel: number; baseItemId: string; bonus: Partial<StatBlock>; bonusSum: number }[];

  /** One crafted item per class and slot, from one seed. */
  crafts: {
    name: string;
    playerClass: string;
    slot: string;
    level: number;
    forgeLevel: number;
    scrapBefore: number;
    goldBefore: number;
    /** Null when the craft was refused, which is how a refusal is recorded. */
    item: {
      id: string;
      baseItemId: string;
      rarity: string;
      itemLevel: number;
      source: string;
      bonus: Partial<StatBlock>;
    } | null;
    scrapAfter: number;
    goldAfter: number;
    draws: number;
  }[];

  /** What an item is worth taken apart, by rarity and by where it came from. */
  scrapGains: { name: string; rarity: string; source: string | null; gain: number }[];

  /** Equipping, and every refusal the action makes. */
  equips: {
    name: string;
    itemId: string;
    playerClass: string;
    inInventory: boolean;
    /** The slot map afterwards. Unchanged means refused. */
    equippedAfter: Record<string, string | null>;
  }[];

  dismantles: {
    name: string;
    itemId: string;
    equipped: boolean;
    scrapBefore: number;
    scrapAfter: number;
    inventoryAfter: string[];
  }[];

  autoDismantles: {
    name: string;
    floor: string;
    inventory: string[];
    equipped: string[];
    scrapBefore: number;
    scrapAfter: number;
    inventoryAfter: string[];
  }[];

  upgrades: {
    name: string;
    fromItemId: string;
    scrapBefore: number;
    essenceBefore: number;
    goldBefore: number;
    /** Null when refused. */
    result: { baseItemId: string; rarity: string; itemLevel: number; source: string } | null;
    scrapAfter: number;
    essenceAfter: number;
    goldAfter: number;
    equippedAfter: Record<string, string | null>;
    draws: number;
  }[];

  conversions: {
    name: string;
    kind: string;
    count: number | null;
    metaLevels: { damage: number; economy: number; survival: number };
    scrapBefore: number;
    scrapAfter: number;
    essenceAfter: number;
    shardsAfter: number;
  }[];

  /** What a worn set adds to the player's stats. */
  worn: {
    name: string;
    equipped: Record<string, string | null>;
    bonus: StatBlock;
  }[];
}

/** An inventory of catalogue items, which is how a save that predates instances looks. */
function withInventory(ids: string[], overrides: Partial<GameState> = {}): GameState {
  return state({ inventoryItemIds: [...ids], ...overrides });
}

function itemOf(id: string) {
  const item = EQUIPMENT_CATALOG.find(entry => entry.id === id);
  if (!item) throw new Error(`no such equipment: ${id}`);
  return item;
}

function build(): Fixture {
  const sequenceSource = scriptedRandom(SEED);
  const randomSequence = Array.from({ length: 12 }, () => sequenceSource());

  const rarityRolls: Fixture['rarityRolls'] = [
    { name: 'ungated', mythic: true, transcendent: true, byRoll: [], firstRollByRarity: {} },
    { name: 'no-transcendent', mythic: true, transcendent: false, byRoll: [], firstRollByRarity: {} },
    { name: 'no-mythic', mythic: false, transcendent: false, byRoll: [], firstRollByRarity: {} },
  ];
  const SCAN_STEPS = 20_000;
  for (const entry of rarityRolls) {
    entry.byRoll = Array.from({ length: 21 }, (_, step) =>
      rollEquipmentRarityByTier(step / 20, entry.mythic, entry.transcendent),
    );
    // Twenty-one steps cannot see legendary and above — they are 4.4 of a
    // total weight of 101.4 between them — so the boundaries are scanned
    // rather than sampled. This is where the table's thresholds actually get
    // pinned; `byRoll` only records the shape.
    entry.firstRollByRarity = Object.fromEntries(EQUIPMENT_RARITIES.map(rarity => [rarity.id, null]));
    for (let step = 0; step <= SCAN_STEPS; step += 1) {
      const roll = step / SCAN_STEPS;
      const rarity = rollEquipmentRarityByTier(roll, entry.mythic, entry.transcendent);
      if (entry.firstRollByRarity[rarity] === null) entry.firstRollByRarity[rarity] = roll;
    }
  }
  // The ungated sweep is `rollEquipmentRarityByTier` with both flags on; the
  // plain `rollEquipmentRarity` is the same weights with no filter, recorded
  // separately so a port cannot satisfy one by implementing the other.
  const plainRarityRoll = Array.from({ length: 21 }, (_, step) => rollEquipmentRarity(step / 20));
  const plainFirstRoll: Record<string, number | null> = Object.fromEntries(
    EQUIPMENT_RARITIES.map(rarity => [rarity.id, null]),
  );
  for (let step = 0; step <= SCAN_STEPS; step += 1) {
    const roll = step / SCAN_STEPS;
    const rarity = rollEquipmentRarity(roll);
    if (plainFirstRoll[rarity] === null) plainFirstRoll[rarity] = roll;
  }

  const levelScaling: Fixture['levelScaling'] = [];
  for (const playerLevel of [1, 20, 200]) {
    const cost = getEquipmentCraftCost('weapon');
    const before = state({ level: playerLevel, equipmentScrap: cost.scrap, gold: cost.gold });
    const { after } = drive(before, { type: 'CRAFT_EQUIPMENT', slot: 'weapon' });
    const madeId = after.inventoryItemIds.find(id => !before.inventoryItemIds.includes(id))!;
    const made = after.equipmentInventory[madeId];
    levelScaling.push({
      playerLevel,
      baseItemId: made.baseItemId,
      bonus: made.bonus,
      bonusSum: sumBonus(made.bonus),
    });
  }

  const crafts: Fixture['crafts'] = [];
  for (const playerClass of CLASSES) {
    for (const slot of SLOTS) {
      const cost = getEquipmentCraftCost(slot);
      const before = state({
        playerClass,
        level: 30,
        equipmentScrap: cost.scrap + 5,
        gold: cost.gold + 7,
      });
      const { after, draws } = drive(before, { type: 'CRAFT_EQUIPMENT', slot });
      const madeId = after.inventoryItemIds.find(id => !before.inventoryItemIds.includes(id)) ?? null;
      const made = madeId ? after.equipmentInventory[madeId] : undefined;
      crafts.push({
        name: `${playerClass}-${slot}`,
        playerClass,
        slot,
        level: before.level,
        forgeLevel: before.guildhallFacilities.forge.level,
        scrapBefore: before.equipmentScrap,
        goldBefore: before.gold,
        item: made
          ? {
              id: made.id,
              baseItemId: made.baseItemId,
              rarity: made.rarity,
              itemLevel: made.itemLevel,
              source: made.source,
              bonus: made.bonus,
            }
          : null,
        scrapAfter: after.equipmentScrap,
        goldAfter: after.gold,
        draws,
      });
    }
  }

  // Two more crafts that are refused, so the guards are recorded rather than
  // assumed: one that cannot pay, and one whose inventory is at the cap.
  const weaponCost = getEquipmentCraftCost('weapon');
  for (const [name, over] of [
    ['too-poor', { equipmentScrap: weaponCost.scrap - 1, gold: weaponCost.gold }],
    ['inventory-full', { equipmentScrap: weaponCost.scrap, gold: weaponCost.gold, inventoryItemIds: fullInventory() }],
  ] as const) {
    const before = state({ level: 30, ...over });
    const { after, draws } = drive(before, { type: 'CRAFT_EQUIPMENT', slot: 'weapon' });
    crafts.push({
      name,
      playerClass: 'warrior',
      slot: 'weapon',
      level: before.level,
      forgeLevel: before.guildhallFacilities.forge.level,
      scrapBefore: before.equipmentScrap,
      goldBefore: before.gold,
      item: null,
      scrapAfter: after.equipmentScrap,
      goldAfter: after.gold,
      draws,
    });
  }

  // A forge level, which multiplies the rolled budget and nothing else.
  {
    const cost = getEquipmentCraftCost('weapon');
    const before = state({
      level: 30,
      equipmentScrap: cost.scrap,
      gold: cost.gold,
      guildhallFacilities: {
        ...DEFAULT_STATE.guildhallFacilities,
        forge: { ...DEFAULT_STATE.guildhallFacilities.forge, level: 10 },
      },
    });
    const { after, draws } = drive(before, { type: 'CRAFT_EQUIPMENT', slot: 'weapon' });
    const madeId = after.inventoryItemIds.find(id => !before.inventoryItemIds.includes(id)) ?? null;
    const made = madeId ? after.equipmentInventory[madeId] : undefined;
    crafts.push({
      name: 'forge-ten',
      playerClass: 'warrior',
      slot: 'weapon',
      level: before.level,
      forgeLevel: 10,
      scrapBefore: before.equipmentScrap,
      goldBefore: before.gold,
      item: made
        ? {
            id: made.id,
            baseItemId: made.baseItemId,
            rarity: made.rarity,
            itemLevel: made.itemLevel,
            source: made.source,
            bonus: made.bonus,
          }
        : null,
      scrapAfter: after.equipmentScrap,
      goldAfter: after.gold,
      draws,
    });
  }

  const scrapGains: Fixture['scrapGains'] = [];
  for (const rarity of EQUIPMENT_RARITIES.map(entry => entry.id)) {
    const catalogItem = EQUIPMENT_CATALOG.find(entry => entry.rarity === rarity)!;
    const before = withInventory([catalogItem.id], { equipmentScrap: 0 });
    const after = apply(before, { type: 'DISMANTLE_EQUIPMENT', itemId: catalogItem.id });
    scrapGains.push({ name: `catalog-${rarity}`, rarity, source: null, gain: after.equipmentScrap });
  }

  const equips: Fixture['equips'] = [];
  for (const [name, itemId, playerClass, inInventory] of [
    ['own-class', 'w_warrior_blade', 'warrior', true],
    ['wrong-class', 'w_mage_staff', 'warrior', true],
    ['not-owned', 'w_warrior_hammer', 'warrior', false],
    ['not-in-catalog', 'w_nonexistent', 'warrior', true],
  ] as const) {
    const before = withInventory(inInventory ? [itemId] : [], { playerClass });
    const after = apply(before, { type: 'EQUIP_ITEM', itemId });
    equips.push({ name, itemId, playerClass, inInventory, equippedAfter: { ...after.equippedItems } });
  }
  // Equipping a second weapon replaces the first rather than stacking.
  {
    const before = withInventory(['w_warrior_blade', 'w_warrior_hammer'], {
      equippedItems: { ...DEFAULT_STATE.equippedItems, weapon: 'w_warrior_blade' },
    });
    const after = apply(before, { type: 'EQUIP_ITEM', itemId: 'w_warrior_hammer' });
    equips.push({
      name: 'replaces-the-slot',
      itemId: 'w_warrior_hammer',
      playerClass: 'warrior',
      inInventory: true,
      equippedAfter: { ...after.equippedItems },
    });
  }

  const dismantles: Fixture['dismantles'] = [];
  for (const [name, itemId, equipped] of [
    ['benched', 'w_warrior_hammer', false],
    ['worn', 'w_warrior_blade', true],
  ] as const) {
    const before = withInventory(['w_warrior_blade', 'w_warrior_hammer'], {
      equipmentScrap: 100,
      equippedItems: { ...DEFAULT_STATE.equippedItems, weapon: 'w_warrior_blade' },
    });
    const after = apply(before, { type: 'DISMANTLE_EQUIPMENT', itemId });
    dismantles.push({
      name,
      itemId,
      equipped,
      scrapBefore: before.equipmentScrap,
      scrapAfter: after.equipmentScrap,
      inventoryAfter: [...after.inventoryItemIds],
    });
  }

  const autoDismantles: Fixture['autoDismantles'] = [];
  for (const floor of ['common', 'epic'] as EquipmentRarity[]) {
    const inventory = ['w_warrior_blade', 'w_warrior_hammer', 'a_plate', 'x_warrior_signet'];
    const before = withInventory(inventory, {
      equipmentScrap: 0,
      autoDismantleRarityFloor: floor,
      equippedItems: { ...DEFAULT_STATE.equippedItems, weapon: 'w_warrior_blade' },
    });
    const after = apply(before, { type: 'AUTO_DISMANTLE_EQUIPMENT' });
    autoDismantles.push({
      name: `floor-${floor}`,
      floor,
      inventory,
      equipped: ['w_warrior_blade'],
      scrapBefore: before.equipmentScrap,
      scrapAfter: after.equipmentScrap,
      inventoryAfter: [...after.inventoryItemIds],
    });
  }

  const upgrades: Fixture['upgrades'] = [];
  for (const [name, itemId, rich, worn] of [
    ['common-to-rare', 'w_warrior_blade', true, false],
    ['common-to-rare-worn', 'w_warrior_blade', true, true],
    ['too-poor', 'w_warrior_blade', false, false],
  ] as const) {
    const before = withInventory([itemId], {
      equipmentScrap: rich ? 100_000 : 0,
      essence: rich ? 500 : 0,
      gold: rich ? 5_000_000 : 0,
      equippedItems: worn ? { ...DEFAULT_STATE.equippedItems, weapon: itemId } : DEFAULT_STATE.equippedItems,
    });
    const { after, draws } = drive(before, { type: 'UPGRADE_EQUIPMENT_RARITY', itemId });
    const madeId = after.inventoryItemIds.find(id => !before.inventoryItemIds.includes(id)) ?? null;
    const made = madeId ? after.equipmentInventory[madeId] : undefined;
    upgrades.push({
      name,
      fromItemId: itemId,
      scrapBefore: before.equipmentScrap,
      essenceBefore: before.essence,
      goldBefore: before.gold,
      result: made
        ? { baseItemId: made.baseItemId, rarity: made.rarity, itemLevel: made.itemLevel, source: made.source }
        : null,
      scrapAfter: after.equipmentScrap,
      essenceAfter: after.essence,
      goldAfter: after.gold,
      equippedAfter: { ...after.equippedItems },
      draws,
    });
  }

  const conversions: Fixture['conversions'] = [];
  for (const [name, kind, count, meta, scrap] of [
    ['essence-one', 'CONVERT_SCRAP_TO_ESSENCE', null, 0, 1_000],
    ['essence-three', 'CONVERT_SCRAP_TO_ESSENCE', 3, 0, 5_000],
    ['essence-over-asked', 'CONVERT_SCRAP_TO_ESSENCE', 99, 0, 1_500],
    ['essence-meta-priced', 'CONVERT_SCRAP_TO_ESSENCE', 1, 5, 2_000],
    ['essence-too-poor', 'CONVERT_SCRAP_TO_ESSENCE', 1, 0, 599],
    ['shards-one', 'CONVERT_SCRAP_TO_SHARDS', null, 0, 1_000],
    ['shards-over-asked', 'CONVERT_SCRAP_TO_SHARDS', 99, 0, 500],
    ['shards-too-poor', 'CONVERT_SCRAP_TO_SHARDS', 1, 0, 179],
  ] as const) {
    const before = state({
      equipmentScrap: scrap,
      essence: 0,
      heroShards: 0,
      metaDamageLevel: meta,
      metaEconomyLevel: meta,
      metaSurvivalLevel: meta,
    });
    const after = apply(before, count === null ? { type: kind } : { type: kind, count });
    conversions.push({
      name,
      kind,
      count,
      metaLevels: { damage: meta, economy: meta, survival: meta },
      scrapBefore: before.equipmentScrap,
      scrapAfter: after.equipmentScrap,
      essenceAfter: after.essence,
      shardsAfter: after.heroShards,
    });
  }

  const worn: Fixture['worn'] = [];
  for (const [name, equipped] of [
    ['nothing', { weapon: null, armor: null, accessory: null }],
    ['starter-warrior', { weapon: 'w_warrior_blade', armor: 'a_plate', accessory: 'x_warrior_signet' }],
    ['weapon-only', { weapon: 'w_warrior_hammer', armor: null, accessory: null }],
    ['missing-item', { weapon: 'w_nonexistent', armor: null, accessory: null }],
  ] as const) {
    const ids = (Object.values(equipped) as (string | null)[]).filter((id): id is string => id !== null);
    const before = withInventory(ids, { equippedItems: { ...equipped } });
    worn.push({ name, equipped: { ...equipped }, bonus: equipmentBonusOf(before) });
  }

  return {
    note: 'Shipped equipment: the catalogue, crafting, dismantling, upgrading and wearing. Owned by __tests__/equipmentFixture.test.ts.',
    generatedFrom: 'src/gameConfig.ts and src/reducers via the exported reducer',
    seed: SEED,
    randomSequence,
    rarities: EQUIPMENT_RARITIES.map(entry => ({ ...entry })),
    catalog: EQUIPMENT_CATALOG.map(item => ({
      id: item.id,
      name: item.name,
      emoji: item.emoji,
      slot: item.slot,
      rarity: item.rarity,
      allowedClasses: [...item.allowedClasses],
      bonus: { ...item.bonus },
    })),
    starterByClass: Object.fromEntries(CLASSES.map(cls => [cls, getStarterEquipmentForClass(cls)])),
    craftCosts: Object.fromEntries(SLOTS.map(slot => [slot, getEquipmentCraftCost(slot)])),
    rarityRolls: [
      ...rarityRolls,
      {
        name: 'plain',
        mythic: true,
        transcendent: true,
        byRoll: plainRarityRoll,
        firstRollByRarity: plainFirstRoll,
      },
    ],
    levelScaling,
    crafts,
    scrapGains,
    equips,
    dismantles,
    autoDismantles,
    upgrades,
    conversions,
    worn,
  };
}

function sumBonus(bonus: Partial<StatBlock>): number {
  return Object.values(bonus).reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

/** An inventory at the non-VIP craft cap, so the cap is recorded rather than read. */
function fullInventory(): string[] {
  return Array.from({ length: 250 }, (_, index) => `filler_${index}`);
}

describe('equipment fixture', () => {
  let nowSpy: jest.SpyInstance<number, []>;
  let fixture: Fixture;

  beforeAll(() => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    fixture = build();
  }, 60_000);

  afterAll(() => {
    nowSpy.mockRestore();
  });

  it('carries the whole catalogue, three slots of twenty-five', () => {
    expect(fixture.catalog).toHaveLength(75);
    for (const slot of SLOTS) {
      expect({ slot, count: fixture.catalog.filter(item => item.slot === slot).length }).toEqual({ slot, count: 25 });
    }
  });

  it('gives every item exactly one class', () => {
    /*
     * Not obvious from the type, which is a list. Every catalogue row names a
     * single class, and `EQUIP_ITEM` refuses an item whose list does not
     * include the player's — so in practice the check is equality, and a port
     * that modelled `allowedClasses` as one string would agree on every input
     * that exists today and diverge the moment a shared item is authored.
     */
    for (const item of fixture.catalog) {
      expect({ id: item.id, classes: item.allowedClasses.length }).toEqual({ id: item.id, classes: 1 });
    }
  });

  it('starts every class on their cheapest item in each slot', () => {
    /*
     * Cheapest, not common. A starter set is **not** three commons: the
     * accessory band has no common for any class, so every player starts with
     * a rare in that slot. My first version of this asserted all-common and
     * the fixture said otherwise, which is what a fixture is for.
     *
     * Asserted as "the lowest rank available" rather than by naming the
     * rarities, so it stays true if an accessory common is ever authored.
     */
    const rank = Object.fromEntries(fixture.rarities.map((entry, index) => [entry.id, index]));
    for (const cls of CLASSES) {
      const starters = fixture.starterByClass[cls];
      expect({ cls, count: starters.length }).toEqual({ cls, count: 3 });
      for (const id of starters) {
        const item = itemOf(id);
        const available = fixture.catalog.filter(
          candidate => candidate.slot === item.slot && candidate.allowedClasses.includes(cls),
        );
        const lowest = Math.min(...available.map(candidate => rank[candidate.rarity]));
        expect({ cls, slot: item.slot, rank: rank[item.rarity] }).toEqual({ cls, slot: item.slot, rank: lowest });
      }
    }
    /*
     * And no class starts on a common accessory, because none exists — the
     * cheapest is rare for four classes and **epic** for the mage, who
     * therefore begins with the strongest starter item in the game. Recorded
     * as what it is rather than smoothed into a rule: my first attempt claimed
     * "rare" for all five and the fixture said otherwise.
     */
    const accessories = Object.fromEntries(CLASSES.map(cls => [cls, itemOf(fixture.starterByClass[cls][2]).rarity]));
    expect(accessories).toEqual({
      warrior: 'rare',
      berserker: 'rare',
      archer: 'rare',
      mage: 'epic',
      monk: 'rare',
    });
  });

  it('weights the rarity roll so a transcendent is one in two hundred and fifty', () => {
    // 0.4 of a total weight of 101.4. The sweep below is the behaviour; this
    // is the reason a twenty-one step sweep sees no transcendent at all.
    const total = fixture.rarities.reduce((sum, entry) => sum + entry.dropWeight, 0);
    expect(total).toBeCloseTo(101.4, 10);
    const transcendent = fixture.rarities.find(entry => entry.id === 'transcendent')!;
    expect(transcendent.dropWeight / total).toBeCloseTo(0.4 / 101.4, 12);
  });

  it('walks the rarity table in order, taking the first whose weight the roll falls inside', () => {
    /*
     * Not a threshold table: the roll is scaled by the *total* weight and then
     * decremented, so which rarity a given roll produces depends on every
     * weight before it. A port that precomputed cumulative thresholds agrees;
     * one that normalised each weight against the total independently does
     * not.
     */
    const ungated = fixture.rarityRolls.find(entry => entry.name === 'ungated')!;
    const order = fixture.rarities.map(entry => entry.id);
    expect(ungated.byRoll[0]).toBe('common');

    // Monotonic across everything but the last step, which is its own finding
    // below. A higher roll is never a worse rarity.
    const ranks = ungated.byRoll.slice(0, 20).map(rarity => order.indexOf(rarity));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));

    // The boundaries, which is where the table is actually pinned: each
    // rarity starts where the cumulative weight before it ends.
    let cumulative = 0;
    for (const rarity of fixture.rarities) {
      const first = ungated.firstRollByRarity[rarity.id];
      expect({ id: rarity.id, reachable: first !== null }).toEqual({ id: rarity.id, reachable: true });
      expect(first!).toBeCloseTo(cumulative / 101.4, 3);
      cumulative += rarity.dropWeight;
    }
  });

  it('returns common on a roll of exactly one, through the fallback', () => {
    /*
     * The best possible roll gives the worst item. `cursor` starts at
     * `roll * total` and is decremented by each weight; at `roll === 1` the
     * subtractions should land it exactly on zero, and for the full table they
     * leave a positive residue of about 7e-15 instead. The loop ends without
     * a match and the trailing `return 'common'` fires.
     *
     * Unreachable in play — `Math.random()` never returns 1 — but a port that
     * computed cumulative thresholds up front would answer `transcendent`
     * here, and the divergence would be invisible until something else fed it
     * a 1. Recorded because it is what the code does, not because it matters.
     *
     * The gated pools do *not* do this: their smaller totals happen to land on
     * or below zero, so they return their top unlocked rarity. Which is the
     * proof that this is float residue rather than an intended guard.
     */
    expect(fixture.rarityRolls.find(entry => entry.name === 'ungated')!.byRoll[20]).toBe('common');
    expect(fixture.rarityRolls.find(entry => entry.name === 'plain')!.byRoll[20]).toBe('common');
    expect(fixture.rarityRolls.find(entry => entry.name === 'no-transcendent')!.byRoll[20]).toBe('mythic');
    expect(fixture.rarityRolls.find(entry => entry.name === 'no-mythic')!.byRoll[20]).toBe('legendary');
  });

  it('redistributes the locked tiers’ weight rather than dropping the roll', () => {
    /*
     * The gate filters the *pool* before summing the weights, so locking
     * mythic and transcendent does not make high rolls fail — it makes them
     * legendary. A port that kept the full total and returned `common` on a
     * roll past the last unlocked tier would hand out commons at the top of
     * the range, which is the opposite of what the gate is for.
     */
    const locked = fixture.rarityRolls.find(entry => entry.name === 'no-mythic')!;
    const ungated = fixture.rarityRolls.find(entry => entry.name === 'ungated')!;
    expect(locked.firstRollByRarity.mythic).toBeNull();
    expect(locked.firstRollByRarity.transcendent).toBeNull();

    /*
     * The top unlocked rarity runs to the ceiling, which is the whole point:
     * legendary's band is 3 of a total that is now 100 rather than 3 of 101.4
     * *followed by* 1.4 of better things. So legendary starts slightly
     * **later** — 0.97 against 0.9566 — and covers everything above, where
     * ungated it stops at 0.9862.
     *
     * My first version of this asserted it started earlier, on the reasoning
     * that removing weight makes everything cheaper. It makes the denominator
     * smaller, which pushes every boundary up.
     */
    expect(locked.firstRollByRarity.legendary!).toBeGreaterThan(ungated.firstRollByRarity.legendary!);
    expect(locked.firstRollByRarity.legendary!).toBeCloseTo(97 / 100, 3);
    expect(ungated.firstRollByRarity.legendary!).toBeCloseTo(97 / 101.4, 3);

    const noTranscendent = fixture.rarityRolls.find(entry => entry.name === 'no-transcendent')!;
    expect(noTranscendent.firstRollByRarity.transcendent).toBeNull();
    expect(noTranscendent.firstRollByRarity.mythic!).toBeCloseTo(100 / 101, 3);
  });

  it('crafts from the rolled rarity, and falls back to the whole class slot', () => {
    /*
     * `rarityPool` is the class's items in that slot at the rolled rarity, and
     * when it is empty the pick falls back to **every** item of that class and
     * slot — so a rolled rarity with no item behind it does not refuse the
     * craft, it widens it. That is why a craft can produce an item whose
     * rarity is not the one that was rolled.
     */
    const made = fixture.crafts.filter(entry => entry.item !== null);
    expect(made.length).toBeGreaterThanOrEqual(15);
    for (const entry of made) {
      const base = itemOf(entry.item!.baseItemId);
      expect({ name: entry.name, slot: base.slot, cls: base.allowedClasses }).toEqual({
        name: entry.name,
        slot: entry.slot,
        cls: [entry.playerClass],
      });
    }
  });

  it('takes eight values to craft, in a fixed order', () => {
    /*
     * One for the rarity roll, one for the pick, one for the instance id, and
     * five for the stat roll — one per stat. The count is the contract: a port
     * that built the id after the bonus would produce the same item from a
     * different id, and the same id from a different bonus.
     */
    for (const entry of fixture.crafts.filter(craft => craft.item !== null)) {
      expect({ name: entry.name, draws: entry.draws }).toEqual({ name: entry.name, draws: 8 });
    }
  });

  it('refuses a craft before drawing anything', () => {
    for (const name of ['too-poor', 'inventory-full']) {
      const entry = fixture.crafts.find(craft => craft.name === name)!;
      expect({ name, draws: entry.draws, item: entry.item }).toEqual({ name, draws: 0, item: null });
    }
  });

  it('charges the craft even though the item is random', () => {
    for (const entry of fixture.crafts.filter(craft => craft.item !== null)) {
      const cost = fixture.craftCosts[entry.slot];
      expect({
        name: entry.name,
        scrap: entry.scrapBefore - entry.scrapAfter,
        gold: entry.goldBefore - entry.goldAfter,
      }).toEqual({ name: entry.name, scrap: cost.scrap, gold: cost.gold });
    }
  });

  it('scales a crafted item’s stat budget with the player’s level', () => {
    /*
     * Seven percent a level over the first, and the item level a craft uses is
     * `max(1, state.level)` — the *player's* level, not anything about the
     * item. So the same base item crafted at 200 carries a far larger bonus
     * than one crafted at 1, and an old item does not grow.
     */
    const [low, mid, high] = fixture.levelScaling;
    expect({ same: mid.baseItemId === low.baseItemId && high.baseItemId === low.baseItemId }).toEqual({ same: true });
    expect(mid.bonusSum).toBeGreaterThan(low.bonusSum);
    expect(high.bonusSum).toBeGreaterThan(mid.bonusSum);
  });

  it('multiplies a crafted item’s stat budget by the forge level', () => {
    // Three percent a level, so ten levels is 1.3x — and it applies to the
    // budget rather than to each stat, which is why the split can move too.
    const plain = fixture.crafts.find(entry => entry.name === 'warrior-weapon')!;
    const forged = fixture.crafts.find(entry => entry.name === 'forge-ten')!;
    expect(sumBonus(forged.item!.bonus)).toBeGreaterThan(sumBonus(plain.item!.bonus));
  });

  it('pays the catalogue rate for an item with no instance behind it', () => {
    /*
     * The source multiplier is applied only when the entry *has* a source —
     * `'source' in item`. A bare catalogue id, which is what an old save's
     * inventory is full of, pays the undiscounted rate. A port that gave
     * everything a source would quietly pay 42% for the same item.
     */
    const byRarity = Object.fromEntries(fixture.scrapGains.map(entry => [entry.rarity, entry.gain]));
    expect(byRarity).toEqual({
      common: 10,
      rare: 24,
      epic: 60,
      legendary: 160,
      mythic: 360,
      transcendent: 760,
    });
  });

  it('equips only an item the player owns and their class may wear', () => {
    const find = (name: string) => fixture.equips.find(entry => entry.name === name)!;
    expect(find('own-class').equippedAfter.weapon).toBe('w_warrior_blade');
    expect(find('wrong-class').equippedAfter.weapon).toBeNull();
    expect(find('not-owned').equippedAfter.weapon).toBeNull();
    expect(find('not-in-catalog').equippedAfter.weapon).toBeNull();
  });

  it('replaces the slot rather than stacking', () => {
    // And the replaced item stays in the inventory: equipping is not a move.
    expect(fixture.equips.find(entry => entry.name === 'replaces-the-slot')!.equippedAfter.weapon).toBe(
      'w_warrior_hammer',
    );
  });

  it('refuses to dismantle what is being worn', () => {
    const worn = fixture.dismantles.find(entry => entry.name === 'worn')!;
    expect(worn.scrapAfter).toBe(worn.scrapBefore);
    expect(worn.inventoryAfter).toContain('w_warrior_blade');

    const benched = fixture.dismantles.find(entry => entry.name === 'benched')!;
    expect(benched.scrapAfter).toBeGreaterThan(benched.scrapBefore);
    expect(benched.inventoryAfter).not.toContain('w_warrior_hammer');
  });

  it('sweeps everything at or below the floor, sparing what is worn', () => {
    /*
     * At or below, not below — `<= floorRank` — so a floor of `common` takes
     * the commons rather than nothing. That off-by-one is the whole setting:
     * read as `<`, a floor of common sweeps nothing and the button does
     * nothing.
     */
    const common = fixture.autoDismantles.find(entry => entry.name === 'floor-common')!;
    expect(common.inventoryAfter).toContain('w_warrior_blade');
    expect(common.scrapAfter).toBeGreaterThan(common.scrapBefore);

    const epic = fixture.autoDismantles.find(entry => entry.name === 'floor-epic')!;
    expect(epic.scrapAfter).toBeGreaterThan(common.scrapAfter);
    expect(epic.inventoryAfter).toContain('w_warrior_blade');
  });

  it('upgrades into a random item of the next rarity, and moves the slot with it', () => {
    /*
     * The upgraded item is a **new instance with a new id**, so anything
     * pointing at the old one has to be re-pointed — which the action does for
     * `equippedItems` and for nothing else. An item level of `+2` on an
     * instance, or the player's level when upgrading a bare catalogue id.
     */
    const plain = fixture.upgrades.find(entry => entry.name === 'common-to-rare')!;
    expect(plain.result?.rarity).toBe('rare');
    expect(plain.result?.source).toBe('upgrade');

    const worn = fixture.upgrades.find(entry => entry.name === 'common-to-rare-worn')!;
    expect(worn.equippedAfter.weapon).not.toBe('w_warrior_blade');
    expect(worn.equippedAfter.weapon).not.toBeNull();
  });

  it('takes seven values to upgrade: one for the target, six for the instance', () => {
    const plain = fixture.upgrades.find(entry => entry.name === 'common-to-rare')!;
    expect(plain.draws).toBe(7);

    /*
     * And a refused upgrade **still draws one**, unlike every other purchase
     * in this game. `getEquipmentUpgradePlan` picks the target item before the
     * affordability check runs, so a player pressing a button they cannot
     * afford advances the sequence anyway.
     *
     * That is a real difference in kind: a summon, a spark exchange and a
     * craft all refuse before touching the dice. Ported rather than tidied,
     * because a port that refused first would fall out of step with any
     * recorded run that contains an unaffordable press.
     */
    expect(fixture.upgrades.find(entry => entry.name === 'too-poor')!.draws).toBe(1);
  });

  it('prices an upgrade off the rarity being left, not the one arrived at', () => {
    const plain = fixture.upgrades.find(entry => entry.name === 'common-to-rare')!;
    expect({
      scrap: plain.scrapBefore - plain.scrapAfter,
      essence: plain.essenceBefore - plain.essenceAfter,
      gold: plain.goldBefore - plain.goldAfter,
    }).toEqual({ scrap: 80, essence: 0, gold: 1_400 });
  });

  it('refines scrap into essence at a price the meta levels raise', () => {
    const base = fixture.conversions.find(entry => entry.name === 'essence-one')!;
    expect(base.scrapBefore - base.scrapAfter).toBe(600);
    expect(base.essenceAfter).toBe(1);

    /*
     * Forty a level across **all three** meta tracks, so five of each is 600
     * more — the cost roughly doubles for an account that has bought a little
     * of everything. Reading it as one track would price it at 800.
     */
    const priced = fixture.conversions.find(entry => entry.name === 'essence-meta-priced')!;
    expect(priced.scrapBefore - priced.scrapAfter).toBe(600 + 3 * 5 * 40);
    expect(priced.essenceAfter).toBe(1);
  });

  it('clamps a conversion to what the purse can afford rather than refusing it', () => {
    /*
     * `Math.min(count, maxAffordable)` with a floor of one, so asking for
     * ninety-nine buys as many as the scrap covers. A port that refused an
     * unaffordable count would turn a "refine all" button into a button that
     * does nothing at exactly the moment a player presses it.
     */
    const asked = fixture.conversions.find(entry => entry.name === 'essence-over-asked')!;
    expect(asked.essenceAfter).toBe(2);
    expect(asked.scrapBefore - asked.scrapAfter).toBe(1_200);

    const shards = fixture.conversions.find(entry => entry.name === 'shards-over-asked')!;
    expect(shards.shardsAfter).toBe(2 * 140);
  });

  it('refuses a conversion it cannot afford even one of', () => {
    for (const name of ['essence-too-poor', 'shards-too-poor']) {
      const entry = fixture.conversions.find(conversion => conversion.name === name)!;
      expect({ name, scrap: entry.scrapAfter, essence: entry.essenceAfter, shards: entry.shardsAfter }).toEqual({
        name,
        scrap: entry.scrapBefore,
        essence: 0,
        shards: 0,
      });
    }
  });

  it('adds every worn item’s bonus to the player’s stats, and ignores a missing one', () => {
    const find = (name: string) => fixture.worn.find(entry => entry.name === name)!;
    expect(find('nothing').bonus).toEqual({ strength: 0, vitality: 0, agility: 0, intelligence: 0, spirit: 0 });
    expect(find('missing-item').bonus).toEqual(find('nothing').bonus);

    // The starter set is the sum of its three rows, not an average or a max.
    const expected = ['w_warrior_blade', 'a_plate', 'x_warrior_signet']
      .map(id => itemOf(id).bonus)
      .reduce<Record<string, number>>((sum, bonus) => {
        for (const [key, value] of Object.entries(bonus)) sum[key] = (sum[key] ?? 0) + (value ?? 0);
        return sum;
      }, {});
    const worn = find('starter-warrior').bonus as unknown as Record<string, number>;
    for (const [key, value] of Object.entries(expected)) {
      expect({ key, value: worn[key] }).toEqual({ key, value });
    }
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_EQUIPMENT_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }

    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
