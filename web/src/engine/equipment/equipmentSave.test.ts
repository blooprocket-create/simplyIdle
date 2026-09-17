import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT_CATALOG,
  EQUIPMENT_RARITIES,
  equipmentTemplatesById,
  getEquipmentItem,
} from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { readSave } from '../save/v3';
import type { SaveContent, SaveV3 } from '../save/schema';
import fixture from './__fixtures__/equipment.json';
import {
  autoDismantle,
  craftEquipment,
  dismantleItem,
  equipItem,
  refineToEssence,
  refineToShards,
  setAutoDismantleFloor,
  unequipSlot,
  upgradeEquipment,
  wornStats,
  type EquipmentContent,
} from './equipmentSave';

/**
 * The equipment verbs, applied to a save, against the recorded actions.
 *
 * `equipment.test.ts` covers the rules; this is the half with a schema. The
 * draw counts are asserted exactly, because the order is the contract: eight
 * values for a craft and seven for an upgrade, and an upgrade **draws one
 * before checking the purse** where every other purchase in this game refuses
 * first.
 */

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const SAVE_CONTENT: SaveContent = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const CONTENT: EquipmentContent = {
  catalog: EQUIPMENT_CATALOG,
  rarityTable: EQUIPMENT_RARITIES,
  byId: getEquipmentItem,
};

function scriptedRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function counted(source: () => number) {
  const state = { drawn: 0 };
  return {
    state,
    random: () => {
      state.drawn += 1;
      return source();
    },
  };
}

interface SaveShape {
  level?: number;
  scrap?: number;
  gold?: number;
  essence?: number;
  shards?: number;
  inventory?: string[];
  equipped?: Partial<Record<'weapon' | 'armor' | 'accessory', string | null>>;
  floor?: string;
  meta?: number;
}

function save(shape: SaveShape = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'Ref', playerClass: 'warrior', created: true },
      progression: {
        level: shape.level ?? 30,
        metaDamageLevel: shape.meta ?? 0,
        metaEconomyLevel: shape.meta ?? 0,
        metaSurvivalLevel: shape.meta ?? 0,
      },
      wallet: {
        gold: shape.gold ?? 0,
        equipmentScrap: shape.scrap ?? 0,
        essence: shape.essence ?? 0,
        heroShards: shape.shards ?? 0,
      },
      equipment: {
        inventory: shape.inventory ?? [],
        instances: {},
        equipped: { weapon: null, armor: null, accessory: null, ...shape.equipped },
        autoDismantleFloor: shape.floor ?? 'common',
      },
    },
    { nowMs: NOW, content: SAVE_CONTENT },
  );
}

describe('wearing an item', () => {
  it('wears one the player owns and their class allows', () => {
    const next = equipItem(save({ inventory: ['w_warrior_blade'] }), CONTENT, 'w_warrior_blade');
    expect(next?.equipment.equipped.weapon).toBe('w_warrior_blade');
  });

  it('refuses one the class may not wear, and one nobody owns', () => {
    expect(equipItem(save({ inventory: ['w_mage_staff'] }), CONTENT, 'w_mage_staff')).toBeNull();
    expect(equipItem(save({ inventory: [] }), CONTENT, 'w_warrior_blade')).toBeNull();
    expect(equipItem(save({ inventory: ['w_warrior_blade'] }), CONTENT, 'w_invented')).toBeNull();
  });

  it('replaces the slot without moving the old item out of the inventory', () => {
    // Equipping is not a swap. The replaced item stays owned and simply stops
    // being worn, which is what lets a player flip back without re-earning it.
    const start = save({ inventory: ['w_warrior_blade', 'w_warrior_hammer'], equipped: { weapon: 'w_warrior_blade' } });
    const next = equipItem(start, CONTENT, 'w_warrior_hammer');
    expect(next?.equipment.equipped.weapon).toBe('w_warrior_hammer');
    expect(next?.equipment.inventory).toEqual(['w_warrior_blade', 'w_warrior_hammer']);
  });

  it('refuses to re-wear what is already worn', () => {
    // Not a no-op that reports success: a screen greying out a button has to
    // be able to ask, and "already on" is the answer.
    const start = save({ inventory: ['w_warrior_blade'], equipped: { weapon: 'w_warrior_blade' } });
    expect(equipItem(start, CONTENT, 'w_warrior_blade')).toBeNull();
  });

  it('takes an item off, and refuses an empty slot', () => {
    const start = save({ inventory: ['w_warrior_blade'], equipped: { weapon: 'w_warrior_blade' } });
    expect(unequipSlot(start, 'weapon')?.equipment.equipped.weapon).toBeNull();
    expect(unequipSlot(start, 'armor')).toBeNull();
  });
});

describe('what the worn set is worth', () => {
  it('sums every worn item, and ignores an empty slot', () => {
    const recorded = fixture.worn.find(entry => entry.name === 'starter-warrior')!;
    const start = save({
      inventory: ['w_warrior_blade', 'a_plate', 'x_warrior_signet'],
      equipped: { weapon: 'w_warrior_blade', armor: 'a_plate', accessory: 'x_warrior_signet' },
    });
    expect(wornStats(start, CONTENT)).toEqual(recorded.bonus);
  });

  it('is nothing at all when nothing is worn', () => {
    const recorded = fixture.worn.find(entry => entry.name === 'nothing')!;
    expect(wornStats(save(), CONTENT)).toEqual(recorded.bonus);
  });
});

describe('taking an item apart', () => {
  it('pays the recorded rate for a bare catalogue row', () => {
    for (const recorded of fixture.scrapGains) {
      const item = EQUIPMENT_CATALOG.find(entry => entry.rarity === recorded.rarity)!;
      const outcome = dismantleItem(save({ inventory: [item.id] }), CONTENT, item.id);
      expect({ rarity: recorded.rarity, gain: outcome?.scrapGained }).toEqual({
        rarity: recorded.rarity,
        gain: recorded.gain,
      });
      expect(outcome?.save.wallet.equipmentScrap).toBe(recorded.gain);
      expect(outcome?.save.equipment.inventory).toEqual([]);
    }
  });

  it('refuses what is being worn', () => {
    // Which is why a screen offers the button only for something on the bench:
    // offering it for what the player is wearing is a button that never works.
    const start = save({ inventory: ['w_warrior_blade'], equipped: { weapon: 'w_warrior_blade' } });
    expect(dismantleItem(start, CONTENT, 'w_warrior_blade')).toBeNull();
  });

  it('refuses one nobody owns', () => {
    expect(dismantleItem(save(), CONTENT, 'w_warrior_blade')).toBeNull();
  });
});

describe('sweeping the bench', () => {
  it('takes everything at or below the floor, sparing what is worn', () => {
    /*
     * At or below, not below. Read as strictly-below, a floor of `common` —
     * the default — sweeps nothing and the button does nothing at all, which
     * is the kind of bug that reads as "the feature is broken" rather than as
     * an off-by-one.
     */
    const start = save({
      inventory: ['w_warrior_blade', 'w_warrior_hammer', 'a_plate', 'x_warrior_signet'],
      equipped: { weapon: 'w_warrior_blade' },
      floor: 'common',
    });
    const outcome = autoDismantle(start, CONTENT);
    expect(outcome?.dismantled).toEqual(['a_plate']);
    expect(outcome?.save.equipment.inventory).toEqual(['w_warrior_blade', 'w_warrior_hammer', 'x_warrior_signet']);
  });

  it('takes more as the floor rises', () => {
    const inventory = ['w_warrior_blade', 'w_warrior_hammer', 'a_plate', 'x_warrior_signet'];
    const common = autoDismantle(save({ inventory, floor: 'common' }), CONTENT)!;
    const epic = autoDismantle(save({ inventory, floor: 'epic' }), CONTENT)!;
    expect(epic.dismantled.length).toBeGreaterThan(common.dismantled.length);
    expect(epic.scrapGained).toBeGreaterThan(common.scrapGained);
  });

  it('refuses a sweep that would take nothing', () => {
    // Rather than succeeding with an empty one. A sweep that found nothing and
    // a sweep that worked are different answers, and "+0 scrap" reported as a
    // success is the screen lying quietly.
    const start = save({ inventory: ['w_warrior_hammer'], floor: 'common' });
    expect(autoDismantle(start, CONTENT)).toBeNull();
    expect(autoDismantle(save(), CONTENT)).toBeNull();
  });

  it('changes the floor, and refuses to set the one already set', () => {
    expect(setAutoDismantleFloor(save({ floor: 'common' }), 'epic')?.equipment.autoDismantleFloor).toBe('epic');
    expect(setAutoDismantleFloor(save({ floor: 'common' }), 'common')).toBeNull();
  });
});

describe('crafting', () => {
  it('takes eight values, in the recorded order', () => {
    /*
     * One for the rarity, one for the pick, one for the instance id, and five
     * for the stats. The count is the contract: a port that built the id after
     * the bonus would produce the same item from a different id.
     */
    const cost = { scrap: 130, gold: 1_800 };
    const { state, random } = counted(scriptedRandom(fixture.seed));
    const outcome = craftEquipment({
      save: save({ scrap: cost.scrap, gold: cost.gold, level: 30 }),
      content: CONTENT,
      slot: 'weapon',
      unlocks: { mythic: false, transcendent: false },
      vipLevel: 0,
      forgeLevel: 0,
      random,
      nowMs: NOW,
    });
    expect(state.drawn).toBe(8);
    expect(outcome?.item.source).toBe('craft');
  });

  it('hands over the item the shipped craft handed over', () => {
    for (const recorded of fixture.crafts.filter(entry => entry.item !== null && entry.playerClass === 'warrior')) {
      const { random } = counted(scriptedRandom(fixture.seed));
      const outcome = craftEquipment({
        save: save({ scrap: recorded.scrapBefore, gold: recorded.goldBefore, level: recorded.level }),
        content: CONTENT,
        slot: recorded.slot as 'weapon',
        unlocks: { mythic: false, transcendent: false },
        vipLevel: 0,
        forgeLevel: recorded.forgeLevel,
        random,
        nowMs: NOW,
      });
      expect({ name: recorded.name, base: outcome?.item.baseItemId, bonus: outcome?.item.bonus }).toEqual({
        name: recorded.name,
        base: recorded.item!.baseItemId,
        bonus: recorded.item!.bonus,
      });
    }
  });

  it('charges the slot’s price and files the item', () => {
    const start = save({ scrap: 200, gold: 3_000 });
    const outcome = craftEquipment({
      save: start,
      content: CONTENT,
      slot: 'weapon',
      unlocks: { mythic: false, transcendent: false },
      vipLevel: 0,
      forgeLevel: 0,
      random: sequence(0.5),
      nowMs: NOW,
    })!;
    expect(outcome.save.wallet.equipmentScrap).toBe(70);
    expect(outcome.save.wallet.gold).toBe(1_200);
    expect(outcome.save.equipment.inventory).toEqual([outcome.item.id]);
    expect(outcome.save.equipment.instances[outcome.item.id]?.baseItemId).toBe(outcome.item.baseItemId);
  });

  it('refuses before drawing when the account cannot pay', () => {
    const { state, random } = counted(sequence(0.5));
    const outcome = craftEquipment({
      save: save({ scrap: 129, gold: 1_800 }),
      content: CONTENT,
      slot: 'weapon',
      unlocks: { mythic: false, transcendent: false },
      vipLevel: 0,
      forgeLevel: 0,
      random,
      nowMs: NOW,
    });
    expect(outcome).toBeNull();
    expect(state.drawn).toBe(0);
  });

  it('refuses a full inventory, and lets VIP five past it', () => {
    /*
     * The cap is on the inventory's length, so the inventory is set directly
     * rather than read in: `readSave` drops a duplicate id and there are not
     * 250 distinct warrior items to fill it with, which is how my first
     * attempt at this ended up asserting nothing.
     */
    const filled = (count: number): SaveV3 => {
      const base = save({ scrap: 1_000, gold: 10_000 });
      return {
        ...base,
        equipment: { ...base.equipment, inventory: Array.from({ length: count }, (_, i) => `filler_${i}`) },
      };
    };
    const request = {
      content: CONTENT,
      slot: 'weapon' as const,
      unlocks: { mythic: false, transcendent: false },
      forgeLevel: 0,
      nowMs: NOW,
    };
    expect(craftEquipment({ ...request, save: filled(249), vipLevel: 0, random: sequence(0.5) })).not.toBeNull();
    expect(craftEquipment({ ...request, save: filled(250), vipLevel: 0, random: sequence(0.5) })).toBeNull();
    // VIP five doubles it, so the same inventory goes through.
    expect(craftEquipment({ ...request, save: filled(250), vipLevel: 5, random: sequence(0.5) })).not.toBeNull();
    expect(craftEquipment({ ...request, save: filled(500), vipLevel: 5, random: sequence(0.5) })).toBeNull();
  });

  it('falls back to the whole class slot when the rolled rarity has no item', () => {
    /*
     * Every class-and-slot pair is missing exactly one rarity, so this is the
     * ordinary case rather than an edge one. A craft that refused when the
     * rarity pool was empty would refuse one press in six.
     *
     * Driven with a roll that lands on the warrior weapons' missing epic.
     */
    const outcome = craftEquipment({
      save: save({ scrap: 1_000, gold: 10_000 }),
      content: CONTENT,
      // 0.93 is inside epic's band with mythic and transcendent locked.
      slot: 'weapon',
      unlocks: { mythic: false, transcendent: false },
      vipLevel: 0,
      forgeLevel: 0,
      random: sequence(0.93, 0.5),
      nowMs: NOW,
    })!;
    expect(outcome.rolledRarity).toBe('epic');
    const warriorWeapons = EQUIPMENT_CATALOG.filter(
      item => item.slot === 'weapon' && item.allowedClasses.includes('warrior'),
    );
    expect(warriorWeapons.some(item => item.rarity === 'epic')).toBe(false);
    expect(warriorWeapons.some(item => item.id === outcome.item.baseItemId)).toBe(true);
    expect(outcome.item.rarity).not.toBe('epic');
  });
});

describe('upgrading', () => {
  it('takes seven values, and draws one before checking the purse', () => {
    /*
     * The difference in kind from every other purchase in this game. A summon,
     * a spark exchange and a craft all refuse before touching the dice; an
     * unaffordable upgrade press still advances the sequence, because the plan
     * picks its target first.
     */
    const rich = counted(scriptedRandom(fixture.seed));
    const outcome = upgradeEquipment({
      save: save({ inventory: ['w_warrior_blade'], scrap: 100_000, essence: 500, gold: 5_000_000 }),
      content: CONTENT,
      id: 'w_warrior_blade',
      unlocks: { mythic: false, transcendent: false },
      random: rich.random,
      nowMs: NOW,
    });
    expect(rich.state.drawn).toBe(7);
    expect(outcome?.item.source).toBe('upgrade');

    const poor = counted(scriptedRandom(fixture.seed));
    const refused = upgradeEquipment({
      save: save({ inventory: ['w_warrior_blade'] }),
      content: CONTENT,
      id: 'w_warrior_blade',
      unlocks: { mythic: false, transcendent: false },
      random: poor.random,
      nowMs: NOW,
    });
    expect(refused).toBeNull();
    expect(poor.state.drawn).toBe(1);
  });

  it('charges the price the recorded upgrade charged', () => {
    const recorded = fixture.upgrades.find(entry => entry.name === 'common-to-rare')!;
    const outcome = upgradeEquipment({
      save: save({
        inventory: [recorded.fromItemId],
        scrap: recorded.scrapBefore,
        essence: recorded.essenceBefore,
        gold: recorded.goldBefore,
      }),
      content: CONTENT,
      id: recorded.fromItemId,
      unlocks: { mythic: false, transcendent: false },
      random: sequence(0.5),
      nowMs: NOW,
    })!;
    expect(outcome.cost).toEqual({
      scrap: recorded.scrapBefore - recorded.scrapAfter,
      essence: recorded.essenceBefore - recorded.essenceAfter,
      gold: recorded.goldBefore - recorded.goldAfter,
    });
    expect(outcome.save.wallet.equipmentScrap).toBe(recorded.scrapAfter);
    expect(outcome.save.wallet.gold).toBe(recorded.goldAfter);
  });

  it('replaces the old item with a new instance and keeps it worn', () => {
    /*
     * The upgraded item has a **new id**, so the worn slot has to follow it.
     * Without that an upgrade silently unequips whatever the player was
     * wearing, which reads as the upgrade having destroyed it.
     */
    const start = save({
      inventory: ['w_warrior_blade'],
      equipped: { weapon: 'w_warrior_blade' },
      scrap: 100_000,
      essence: 500,
      gold: 5_000_000,
    });
    const outcome = upgradeEquipment({
      save: start,
      content: CONTENT,
      id: 'w_warrior_blade',
      unlocks: { mythic: false, transcendent: false },
      random: sequence(0.5),
      nowMs: NOW,
    })!;
    expect(outcome.save.equipment.inventory).toEqual([outcome.item.id]);
    expect(outcome.save.equipment.equipped.weapon).toBe(outcome.item.id);
    expect(outcome.save.equipment.instances[outcome.item.id]?.rarity).toBe('rare');
  });

  it('gives a bare row the player’s level, and an instance two more than its own', () => {
    const fromRow = upgradeEquipment({
      save: save({ inventory: ['w_warrior_blade'], scrap: 1e6, essence: 1e4, gold: 1e8, level: 77 }),
      content: CONTENT,
      id: 'w_warrior_blade',
      unlocks: { mythic: false, transcendent: false },
      random: sequence(0.5),
      nowMs: NOW,
    })!;
    expect(fromRow.item.itemLevel).toBe(77);

    const again = upgradeEquipment({
      save: fromRow.save,
      content: CONTENT,
      id: fromRow.item.id,
      unlocks: { mythic: false, transcendent: false },
      random: sequence(0.5),
      nowMs: NOW,
    })!;
    expect(again.item.itemLevel).toBe(79);
  });

  it('refuses an item nobody owns, and one at the top rarity', () => {
    expect(
      upgradeEquipment({
        save: save({ scrap: 1e6, essence: 1e4, gold: 1e8 }),
        content: CONTENT,
        id: 'w_warrior_blade',
        unlocks: { mythic: true, transcendent: true },
        random: sequence(0.5),
        nowMs: NOW,
      }),
    ).toBeNull();

    const top = EQUIPMENT_CATALOG.find(
      item => item.rarity === 'transcendent' && item.allowedClasses.includes('warrior'),
    )!;
    expect(
      upgradeEquipment({
        save: save({ inventory: [top.id], scrap: 1e6, essence: 1e4, gold: 1e8 }),
        content: CONTENT,
        id: top.id,
        unlocks: { mythic: true, transcendent: true },
        random: sequence(0.5),
        nowMs: NOW,
      }),
    ).toBeNull();
  });
});

describe('refining scrap', () => {
  it('matches every recorded conversion', () => {
    for (const recorded of fixture.conversions) {
      const start = save({ scrap: recorded.scrapBefore, meta: recorded.metaLevels.damage });
      const outcome =
        recorded.kind === 'CONVERT_SCRAP_TO_SHARDS'
          ? refineToShards(start, recorded.count ?? undefined)
          : refineToEssence(start, recorded.count ?? undefined);

      if (recorded.scrapAfter === recorded.scrapBefore) {
        // Recorded as refused: nothing moved.
        expect({ name: recorded.name, outcome }).toEqual({ name: recorded.name, outcome: null });
        continue;
      }
      expect({
        name: recorded.name,
        scrap: outcome?.save.wallet.equipmentScrap,
        essence: outcome?.save.wallet.essence,
        shards: outcome?.save.wallet.heroShards,
      }).toEqual({
        name: recorded.name,
        scrap: recorded.scrapAfter,
        essence: recorded.essenceAfter,
        shards: recorded.shardsAfter,
      });
    }
  });

  it('buys what the purse covers rather than refusing an over-ask', () => {
    // A "refine everything" button spends what it can instead of doing nothing
    // at exactly the moment a player presses it.
    const outcome = refineToEssence(save({ scrap: 1_500 }), 99)!;
    expect(outcome.count).toBe(2);
    expect(outcome.scrapSpent).toBe(1_200);
  });

  it('refuses when the account cannot afford even one', () => {
    expect(refineToEssence(save({ scrap: 599 }))).toBeNull();
    expect(refineToShards(save({ scrap: 179 }))).toBeNull();
  });
});
