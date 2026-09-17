import { describe, expect, it } from 'vitest';
import { getClassProfile } from '../../content/classes';
import { EQUIPMENT_CATALOG, EQUIPMENT_RARITIES, getEquipmentItem } from '../../content/equipment';
import fixture from './__fixtures__/equipment.json';
import {
  EQUIPMENT_CRAFT_COST,
  UPGRADE_BASE_COST,
  craftInventoryCap,
  refineCount,
  scrapToEssenceCost,
  upgradePlan,
  upgradedItemLevel,
  SCRAP_TO_SHARD_COST,
  SHARDS_PER_REFINE,
} from './forge';
import {
  atOrBelowRarity,
  createEquipmentInstance,
  equipmentBudget,
  equipmentScrapGain,
  equipmentStatWeights,
  forgeStatMultiplier,
  rollEquipmentBonus,
  type EquipmentInstance,
} from './instance';
import { equipmentRarityRank, nextEquipmentRarity, rollEquipmentRarity, rollEquipmentRarityByTier } from './rarity';

/**
 * The equipment rules, against the recorded runs.
 *
 * The draw counts are the contract, as they are for a summon: the fixture
 * records eight values for a craft and seven for an upgrade, and the order is
 * fixed — rarity, pick, id, then one per stat. A port with the same
 * distribution in a different order agrees on nothing after the first value.
 */

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

/** The same LCG the fixture's generator scripts `Math.random` with. */
function scriptedRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

/** A fixed list of draws, repeating the last one once exhausted. */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function itemOf(id: string) {
  const item = getEquipmentItem(id);
  if (!item) throw new Error(`no such equipment: ${id}`);
  return item;
}

function sumBonus(bonus: Record<string, number | undefined>): number {
  return Object.values(bonus).reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

describe('the same scripted source yields the same values', () => {
  it('reproduces the sequence the fixture recorded', () => {
    // The whole file rests on this. Two implementations of the same LCG that
    // disagreed in the last bit would make every comparison below a coin toss
    // dressed up as a parity claim.
    const source = scriptedRandom(fixture.seed);
    expect(Array.from({ length: fixture.randomSequence.length }, () => source())).toEqual(fixture.randomSequence);
  });
});

describe('rolling a rarity', () => {
  it('matches the shipped sweep, ungated and gated', () => {
    for (const recorded of fixture.rarityRolls) {
      const rolled = recorded.byRoll.map((_, step) =>
        recorded.name === 'plain'
          ? rollEquipmentRarity(step / 20, EQUIPMENT_RARITIES)
          : rollEquipmentRarityByTier(step / 20, EQUIPMENT_RARITIES, {
              mythic: recorded.mythic,
              transcendent: recorded.transcendent,
            }),
      );
      expect({ name: recorded.name, rolled }).toEqual({ name: recorded.name, rolled: recorded.byRoll });
    }
  });

  it('lands on the same boundaries the shipped scan found', () => {
    /*
     * Where the table is actually pinned. Twenty-one even steps cannot see
     * legendary and above — they are 4.4 of a total weight of 101.4 between
     * them — so the sweep above only records the shape.
     */
    for (const recorded of fixture.rarityRolls) {
      for (const [rarity, first] of Object.entries(recorded.firstRollByRarity)) {
        if (first === null) continue;
        const rolled =
          recorded.name === 'plain'
            ? rollEquipmentRarity(first, EQUIPMENT_RARITIES)
            : rollEquipmentRarityByTier(first, EQUIPMENT_RARITIES, {
                mythic: recorded.mythic,
                transcendent: recorded.transcendent,
              });
        expect({ name: recorded.name, rarity, rolled }).toEqual({ name: recorded.name, rarity, rolled: rarity });
      }
    }
  });

  it('returns common on a roll of exactly one, through the fallback', () => {
    /*
     * The best possible roll gives the worst item, because the subtractions
     * leave about 7e-15 above zero for the full table and the loop ends
     * without a match. Unreachable in play — `Math.random()` never returns 1 —
     * and the reason this is a loop rather than a cumulative threshold list.
     *
     * The gated pools do not do it, which is the proof that it is float
     * residue rather than a guard: their smaller totals land on or below zero.
     */
    expect(rollEquipmentRarity(1, EQUIPMENT_RARITIES)).toBe('common');
    expect(rollEquipmentRarityByTier(1, EQUIPMENT_RARITIES, { mythic: true, transcendent: true })).toBe('common');
    expect(rollEquipmentRarityByTier(1, EQUIPMENT_RARITIES, { mythic: false, transcendent: false })).toBe('legendary');
    expect(rollEquipmentRarityByTier(1, EQUIPMENT_RARITIES, { mythic: true, transcendent: false })).toBe('mythic');
  });

  it('ranks the rarities by the table’s own order', () => {
    expect(EQUIPMENT_RARITIES.map(entry => equipmentRarityRank(entry.id))).toEqual([0, 1, 2, 3, 4, 5]);
    // An unknown rarity ranks lowest rather than throwing, so a stored save
    // naming a retired one sweeps rather than crashing the screen.
    expect(equipmentRarityRank('godly' as never)).toBe(0);
  });

  it('steps up one rarity, and stops at the top', () => {
    expect(nextEquipmentRarity('common')).toBe('rare');
    expect(nextEquipmentRarity('mythic')).toBe('transcendent');
    expect(nextEquipmentRarity('transcendent')).toBeNull();
  });
});

describe('rolling an item', () => {
  /**
   * The five stat draws, replayed exactly as a craft makes them.
   *
   * A craft takes eight values: one for the rarity, one for the pick, one for
   * the instance id, then five for the stats. So a replay that wants the same
   * bonus has to burn the first three.
   */
  function craftLikeBonus(baseItemId: string, itemLevel: number, statMultiplier: number, seed: number) {
    const source = scriptedRandom(seed);
    source();
    source();
    source();
    return rollEquipmentBonus(itemOf(baseItemId), itemLevel, source, statMultiplier);
  }

  it('produces the bonus the shipped craft produced, for every class and slot', () => {
    for (const craft of fixture.crafts.filter(entry => entry.item !== null)) {
      const bonus = craftLikeBonus(
        craft.item!.baseItemId,
        craft.item!.itemLevel,
        forgeStatMultiplier(craft.forgeLevel),
        fixture.seed,
      );
      expect({ name: craft.name, bonus }).toEqual({ name: craft.name, bonus: craft.item!.bonus });
    }
  });

  it('scales the budget with the item level, seven percent each', () => {
    for (const row of fixture.levelScaling) {
      const bonus = craftLikeBonus(row.baseItemId, row.playerLevel, 1, fixture.seed);
      expect({ level: row.playerLevel, bonus }).toEqual({ level: row.playerLevel, bonus: row.bonus });
    }
  });

  it('takes five values, one per stat, and no more', () => {
    let drawn = 0;
    rollEquipmentBonus(
      itemOf('w_warrior_blade'),
      30,
      () => {
        drawn += 1;
        return 0.5;
      },
      1,
    );
    expect(drawn).toBe(5);
  });

  it('spends the budget exactly, but for the anchor floor', () => {
    /*
     * The loop assigns the whole budget — the last stat takes the remainder
     * rather than its share — and then the authored bonus's stats are floored
     * at one, which can push the total *above* it. Both halves matter: without
     * the remainder the sum drifts, and without the floor an item can show
     * none of the stats its description promises.
     */
    const item = itemOf('w_warrior_blade');
    const budget = equipmentBudget(item, 30);
    const bonus = rollEquipmentBonus(item, 30, sequence(0.5), 1);
    expect(sumBonus(bonus)).toBeGreaterThanOrEqual(budget);
    // The floor can only add, and only for stats the row authored.
    expect(sumBonus(bonus) - budget).toBeLessThanOrEqual(Object.keys(item.bonus).length);
  });

  it('never rolls a stat out of existence', () => {
    /*
     * Every weight is floored at 0.15 rather than allowed to be zero. The roll
     * is a share of a total, so a zero weight is a stat that can never appear
     * — and a mage's weapon would then be unable to carry any strength at all,
     * however the dice fell.
     */
    for (const cls of ['warrior', 'berserker', 'archer', 'mage', 'monk'] as const) {
      for (const slot of ['weapon', 'armor', 'accessory'] as const) {
        const weights = equipmentStatWeights(cls, slot);
        for (const [stat, weight] of Object.entries(weights)) {
          expect({ cls, slot, stat, positive: weight >= 0.15 }).toEqual({ cls, slot, stat, positive: true });
        }
      }
    }
  });

  it('weighs an archer’s agility nearly double everyone else’s', () => {
    /*
     * Written into the formula rather than into a table, so it is the one
     * class rule here a port would drop by reading the shape rather than the
     * arithmetic: `physWeight * 1.18` for an archer against `* 0.62` for
     * everybody else.
     *
     * Expressed off the profiles rather than with the numbers inlined, which
     * is a correction: my first version assumed the archer and the warrior
     * shared a `physWeight` and came out at 1.90 against the real 2.06. They
     * do not — the archer's is 1.35 to the warrior's 1.25 — so the gap is the
     * factor *and* the class.
     */
    const archer = equipmentStatWeights('archer', 'accessory').agility;
    const warrior = equipmentStatWeights('warrior', 'accessory').agility;
    const expected = (getClassProfile('archer').physWeight * 1.18) / (getClassProfile('warrior').physWeight * 0.62);
    expect(archer / warrior).toBeCloseTo(expected, 10);
    expect(archer / warrior).toBeGreaterThan(2);
  });

  it('rolls an item the way its own class wants it, whoever crafted it', () => {
    // The weights come from the item's first allowed class, not the player's.
    // Both are always the same today — an item is class-locked and only that
    // class can craft it — which is why this is the kind of thing a port
    // "simplifies" by passing the player's class and never notices.
    const mageStaff = itemOf('w_mage_staff');
    const bonus = rollEquipmentBonus(mageStaff, 40, sequence(0.5), 1);
    expect((bonus.intelligence ?? 0) > (bonus.strength ?? 0)).toBe(true);
  });

  it('floors an authored stat the roll gave nothing to', () => {
    /*
     * The floor that runs after the loop, and it needed a real input before it
     * bit: every recorded craft happens to roll all of its authored stats
     * above zero, so deleting the floor left thirty-four assertions green.
     *
     * It takes a budget small enough that three of the five stats get nothing,
     * *and* an authored stat that is not the last key — because the last key
     * takes the remainder and so is never empty while budget is left. My first
     * attempt authored spirit, which is last, and the sum came out exactly on
     * the budget with the floor doing nothing.
     *
     * Vitality on a warrior weapon is second in the order and weighted low
     * enough to round to zero at a budget of two. Without the floor the item's
     * only authored stat is missing from the item.
     */
    const stoutBlade = { ...itemOf('w_warrior_blade'), id: 'test_stout_blade', bonus: { vitality: 1 } };
    const bonus = rollEquipmentBonus(stoutBlade, 1, sequence(0.5), 1);
    expect(equipmentBudget(stoutBlade, 1)).toBe(2);
    expect(bonus.vitality).toBe(1);
    expect(sumBonus(bonus)).toBeGreaterThan(2);
  });

  it('draws the id first and the bonus after, value for value', () => {
    /*
     * The order inside the instance builder, pinned by *value* rather than by
     * shape — which is a correction. An earlier version of this file checked
     * the id against a regex and the bonus through a separate replay, and
     * swapping the two halves in the source left every assertion green: the
     * regex matches whichever value the id was built from.
     */
    const instance = createEquipmentInstance({
      baseItem: itemOf('w_warrior_blade'),
      itemLevel: 30,
      source: 'craft',
      random: scriptedRandom(fixture.seed),
      nowMs: NOW,
    });

    const expectedIdSource = scriptedRandom(fixture.seed);
    const expectedSuffix = expectedIdSource().toString(36).slice(2, 8);
    expect(instance.id).toBe(`eq_craft_${NOW}_${expectedSuffix}`);

    const afterId = scriptedRandom(fixture.seed);
    afterId();
    expect(instance.bonus).toEqual(rollEquipmentBonus(itemOf('w_warrior_blade'), 30, afterId, 1));
  });

  it('builds the id before the bonus, from the source and the clock', () => {
    /*
     * The order is why this is one function rather than two calls at the seam.
     * A port that rolled the stats first would produce the same item under a
     * different id and the same id over a different bonus, and every recorded
     * run after that point would disagree.
     */
    const instance = createEquipmentInstance({
      baseItem: itemOf('w_warrior_blade'),
      itemLevel: 30,
      source: 'craft',
      random: sequence(0.5),
      nowMs: NOW,
    });
    expect(instance.id).toMatch(/^eq_craft_\d+_[0-9a-z]{1,6}$/);
    expect(instance.source).toBe('craft');
    expect(instance.itemLevel).toBe(30);
    expect(instance.baseItemId).toBe('w_warrior_blade');
  });

  it('gives a new instance an id nobody holds', () => {
    // Not shipped. Two crafts in the same millisecond on the same draw produce
    // one id, and an inventory keyed by id loses the second item outright —
    // the player pays and receives nothing.
    const taken = new Set<string>();
    for (let index = 0; index < 8; index += 1) {
      const instance = createEquipmentInstance({
        baseItem: itemOf('w_warrior_blade'),
        itemLevel: 30,
        source: 'craft',
        random: sequence(0.5),
        nowMs: NOW,
        taken,
      });
      expect(taken.has(instance.id)).toBe(false);
      taken.add(instance.id);
    }
    expect(taken.size).toBe(8);
  });

  it('clamps an item level below one rather than inverting the budget', () => {
    const instance = createEquipmentInstance({
      baseItem: itemOf('w_warrior_blade'),
      itemLevel: -40,
      source: 'craft',
      random: sequence(0.5),
      nowMs: NOW,
    });
    expect(instance.itemLevel).toBe(1);
  });

  it('multiplies the budget by the forge level and nothing else', () => {
    expect(forgeStatMultiplier(0)).toBe(1);
    expect(forgeStatMultiplier(10)).toBeCloseTo(1.3, 10);
    // A negative or fractional level is floored, not trusted.
    expect(forgeStatMultiplier(-5)).toBe(1);
    expect(forgeStatMultiplier(3.9)).toBeCloseTo(1.09, 10);

    const plain = fixture.crafts.find(entry => entry.name === 'warrior-weapon')!;
    const forged = fixture.crafts.find(entry => entry.name === 'forge-ten')!;
    expect(sumBonus(forged.item!.bonus)).toBeGreaterThan(sumBonus(plain.item!.bonus));
  });

  it('never lets a multiplier below one shrink the budget', () => {
    // `Math.max(1, statMultiplier)`, so a forge that somehow reported 0.5
    // leaves the item alone rather than halving it.
    const item = itemOf('w_warrior_blade');
    const full = rollEquipmentBonus(item, 30, sequence(0.5), 1);
    const shrunk = rollEquipmentBonus(item, 30, sequence(0.5), 0.5);
    expect(shrunk).toEqual(full);
  });
});

describe('what an item is worth taken apart', () => {
  it('pays the catalogue rate for a row with no instance behind it', () => {
    for (const recorded of fixture.scrapGains) {
      const item = EQUIPMENT_CATALOG.find(entry => entry.rarity === recorded.rarity)!;
      expect({ rarity: recorded.rarity, gain: equipmentScrapGain(item) }).toEqual({
        rarity: recorded.rarity,
        gain: recorded.gain,
      });
    }
  });

  it('discounts an instance by where it came from', () => {
    /*
     * A dropped item pays full and everything else is discounted — most
     * severely a hero's unique relic at a twentieth. Worth its own test
     * because the branch is `'source' in item`, and a port that gave every
     * entry a source would quietly pay 42% for a crafted item where the
     * shipped code pays 100% for a catalogue row.
     */
    const base = itemOf('tx_monk_cycle');
    const instance = (source: EquipmentInstance['source']): EquipmentInstance => ({
      ...base,
      allowedClasses: [...base.allowedClasses],
      id: `eq_${source}`,
      baseItemId: base.id,
      itemLevel: 1,
      source,
    });
    expect(equipmentScrapGain(instance('drop'))).toBe(760);
    expect(equipmentScrapGain(instance('craft'))).toBe(Math.floor(760 * 0.42));
    expect(equipmentScrapGain(instance('legacy'))).toBe(Math.floor(760 * 0.9));
    expect(equipmentScrapGain(instance('hero_unique'))).toBe(Math.floor(760 * 0.05));
  });

  it('never pays nothing, however steep the discount', () => {
    // A common hero relic is 10 × 0.05 = 0.5, which floors to zero. The
    // `Math.max(1, …)` is what stops a dismantle that costs the player an item
    // and gives back nothing at all.
    const base = itemOf('w_warrior_blade');
    const relic: EquipmentInstance = {
      ...base,
      allowedClasses: [...base.allowedClasses],
      id: 'eq_relic',
      baseItemId: base.id,
      itemLevel: 1,
      source: 'hero_unique',
    };
    expect(equipmentScrapGain(relic)).toBe(1);
  });

  it('sweeps at or below the floor, not strictly below', () => {
    // Read as `<`, a floor of common sweeps nothing and the setting's own
    // default does nothing at all.
    expect(atOrBelowRarity(itemOf('w_warrior_blade'), 'common')).toBe(true);
    expect(atOrBelowRarity(itemOf('w_warrior_hammer'), 'common')).toBe(false);
    expect(atOrBelowRarity(itemOf('w_warrior_hammer'), 'epic')).toBe(true);
  });
});

describe('the forge’s prices', () => {
  it('charges the shipped craft cost per slot', () => {
    expect(EQUIPMENT_CRAFT_COST).toEqual(fixture.craftCosts);
  });

  it('doubles the inventory cap at VIP five', () => {
    expect(craftInventoryCap(0)).toBe(250);
    expect(craftInventoryCap(4)).toBe(250);
    expect(craftInventoryCap(5)).toBe(500);
  });

  it('prices an upgrade off the rarity being left', () => {
    const recorded = fixture.upgrades.find(entry => entry.name === 'common-to-rare')!;
    const plan = upgradePlan({
      baseItem: itemOf(recorded.fromItemId),
      catalog: EQUIPMENT_CATALOG,
      purse: { scrap: recorded.scrapBefore, essence: recorded.essenceBefore, gold: recorded.goldBefore },
      unlocks: { mythic: false, transcendent: false },
      random: sequence(0.5),
    });
    expect({
      rarity: plan.targetRarity,
      scrap: plan.scrapCost,
      essence: plan.essenceCost,
      gold: plan.goldCost,
    }).toEqual({
      rarity: 'rare',
      scrap: recorded.scrapBefore - recorded.scrapAfter,
      essence: recorded.essenceBefore - recorded.essenceAfter,
      gold: recorded.goldBefore - recorded.goldAfter,
    });
    expect(UPGRADE_BASE_COST.common).toEqual({ scrap: 80, essence: 0, gold: 1_400 });
  });

  it('draws one value for the target, before anybody checks the purse', () => {
    /*
     * The difference in kind from every other purchase in this game. A summon,
     * a spark exchange and a craft all refuse before touching the dice; an
     * unaffordable upgrade press still advances the sequence, because the plan
     * picks its target first and `canUpgrade` is a field on the answer rather
     * than a gate in front of it.
     */
    let drawn = 0;
    const plan = upgradePlan({
      baseItem: itemOf('w_warrior_blade'),
      catalog: EQUIPMENT_CATALOG,
      purse: { scrap: 0, essence: 0, gold: 0 },
      unlocks: { mythic: false, transcendent: false },
      random: () => {
        drawn += 1;
        return 0.5;
      },
    });
    expect(drawn).toBe(1);
    expect(plan.canUpgrade).toBe(false);
    expect(plan.targetItemId).not.toBeNull();
  });

  it('refuses at the top, and at a tier the account has not unlocked', () => {
    const atTop = upgradePlan({
      baseItem: itemOf('tx_monk_cycle'),
      catalog: EQUIPMENT_CATALOG,
      purse: { scrap: 1e9, essence: 1e9, gold: 1e9 },
      unlocks: { mythic: true, transcendent: true },
      random: sequence(0.5),
    });
    expect({ can: atTop.canUpgrade, reason: atTop.reason }).toEqual({ can: false, reason: 'At max rarity' });

    const lockedMythic = upgradePlan({
      baseItem: EQUIPMENT_CATALOG.find(item => item.rarity === 'legendary')!,
      catalog: EQUIPMENT_CATALOG,
      purse: { scrap: 1e9, essence: 1e9, gold: 1e9 },
      unlocks: { mythic: false, transcendent: false },
      random: sequence(0.5),
    });
    expect({ can: lockedMythic.canUpgrade, reason: lockedMythic.reason }).toEqual({
      can: false,
      reason: 'Mythic tier locked',
    });
  });

  it('stops at a locked tier rather than skipping past it', () => {
    // A locked mythic does not fall through to transcendent. The search
    // returns, which is what keeps the gate a gate.
    const plan = upgradePlan({
      baseItem: EQUIPMENT_CATALOG.find(item => item.rarity === 'legendary')!,
      catalog: EQUIPMENT_CATALOG,
      purse: { scrap: 1e9, essence: 1e9, gold: 1e9 },
      unlocks: { mythic: false, transcendent: true },
      random: sequence(0.5),
    });
    expect(plan.targetRarity).toBeNull();
  });

  it('skips a rarity the class and slot has no item for, and charges for the step', () => {
    /*
     * **This happens constantly**, which is the opposite of what I first
     * wrote here. Every class has five items per slot across six rarities, so
     * *every* class-and-slot pair is missing exactly one — the warrior's
     * weapons have no epic, the mage's armour has neither common nor rare.
     *
     * So the per-step multipliers are live rather than dormant: a warrior
     * upgrading a rare weapon lands on **legendary**, two steps, and pays
     * 1.55x the scrap and 1.75x the gold of a one-step upgrade. A port that
     * took one step and refused when the pool was empty would refuse the most
     * ordinary upgrade in the game.
     */
    const rareWarriorWeapon = EQUIPMENT_CATALOG.find(
      item => item.slot === 'weapon' && item.rarity === 'rare' && item.allowedClasses.includes('warrior'),
    )!;
    const plan = upgradePlan({
      baseItem: rareWarriorWeapon,
      catalog: EQUIPMENT_CATALOG,
      purse: { scrap: 1e9, essence: 1e9, gold: 1e9 },
      unlocks: { mythic: true, transcendent: true },
      random: sequence(0.5),
    });
    expect(plan.targetRarity).toBe('legendary');
    expect(plan.scrapCost).toBe(Math.ceil(170 * 1.55));
    expect(plan.essenceCost).toBe(Math.ceil(4 * 1.5));
    expect(plan.goldCost).toBe(Math.ceil(4_200 * 1.75));
  });

  it('leaves a one-step upgrade at the base price', () => {
    // The other half, so the multipliers above are shown to be a *step* count
    // rather than a flat surcharge.
    const plan = upgradePlan({
      baseItem: itemOf('w_warrior_blade'),
      catalog: EQUIPMENT_CATALOG,
      purse: { scrap: 1e9, essence: 1e9, gold: 1e9 },
      unlocks: { mythic: true, transcendent: true },
      random: sequence(0.5),
    });
    expect(plan.targetRarity).toBe('rare');
    expect({ scrap: plan.scrapCost, essence: plan.essenceCost, gold: plan.goldCost }).toEqual(UPGRADE_BASE_COST.common);
  });

  it('gives an upgraded instance two item levels, and a bare row the player’s', () => {
    const row = itemOf('w_warrior_blade');
    expect(upgradedItemLevel(row, 42)).toBe(42);
    expect(upgradedItemLevel({ ...row, id: 'x', baseItemId: row.id, itemLevel: 7, source: 'craft' }, 42)).toBe(9);
    // A player at level zero still gets an item level of one.
    expect(upgradedItemLevel(row, 0)).toBe(1);
  });
});

describe('refining scrap', () => {
  it('prices essence off all three meta tracks', () => {
    const base = fixture.conversions.find(entry => entry.name === 'essence-one')!;
    expect(scrapToEssenceCost({ damage: 0, economy: 0, survival: 0 })).toBe(base.scrapBefore - base.scrapAfter);

    const priced = fixture.conversions.find(entry => entry.name === 'essence-meta-priced')!;
    expect(scrapToEssenceCost(priced.metaLevels)).toBe(priced.scrapBefore - priced.scrapAfter);
    // Reading it as one track prices a five-of-each account at 800, not 1,200.
    expect(scrapToEssenceCost({ damage: 5, economy: 0, survival: 0 })).toBe(800);
  });

  it('buys what the purse covers rather than refusing an over-ask', () => {
    const asked = fixture.conversions.find(entry => entry.name === 'essence-over-asked')!;
    const costPer = scrapToEssenceCost(asked.metaLevels);
    expect(refineCount(asked.scrapBefore, costPer, asked.count ?? undefined)).toBe(asked.essenceAfter);

    const shards = fixture.conversions.find(entry => entry.name === 'shards-over-asked')!;
    expect(refineCount(shards.scrapBefore, SCRAP_TO_SHARD_COST, shards.count ?? undefined) * SHARDS_PER_REFINE).toBe(
      shards.shardsAfter,
    );
  });

  it('answers zero when the account cannot afford even one', () => {
    for (const name of ['essence-too-poor', 'shards-too-poor']) {
      const entry = fixture.conversions.find(conversion => conversion.name === name)!;
      const costPer =
        entry.kind === 'CONVERT_SCRAP_TO_SHARDS' ? SCRAP_TO_SHARD_COST : scrapToEssenceCost(entry.metaLevels);
      expect({ name, count: refineCount(entry.scrapBefore, costPer, entry.count ?? undefined) }).toEqual({
        name,
        count: 0,
      });
    }
  });

  it('buys one when no count is asked for', () => {
    // `action.count ?? 1`, so the plain button is a single refine rather than
    // everything the purse allows.
    expect(refineCount(10_000, 600, undefined)).toBe(1);
  });
});
