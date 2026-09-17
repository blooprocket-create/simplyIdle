import { describe, expect, it } from 'vitest';
import Decimal from 'break_eternity.js';
import { equipmentTemplatesById } from '../content/equipment';
import { heroTemplatesById } from '../content/heroes';
import { craftInventoryCap } from '../engine/equipment/forge';
import { readSave } from '../engine/save/v3';
import type { SaveV3 } from '../engine/save/schema';
import { bankInto } from './bank';

/**
 * Everything a banked run does to the account, including the items it won.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

function save(over: Record<string, unknown> = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 40 },
      wallet: { gold: 0 },
      ...over,
    },
    { nowMs: NOW, content: CONTENT },
  );
}

const banked = (over: Partial<Parameters<typeof bankInto>[1]> = {}) => ({
  gold: new Decimal(0),
  exp: new Decimal(0),
  essence: 0,
  bossTears: 0,
  kills: 0,
  equipmentDrops: [] as number[],
  usableDrops: [] as string[],
  ...over,
});

/** A generator that never repeats, so two drops are two different items. */
const rolling = () => {
  let at = 0;
  return () => (at++ * 0.37) % 1;
};

describe('the items a run won', () => {
  it('puts a won drop in the bag', () => {
    const before = save();
    const after = bankInto(before, banked({ equipmentDrops: [40] }), NOW, rolling());
    expect(after.equipment.inventory.length).toBe(before.equipment.inventory.length + 1);
  });

  it('builds one item per wave it was handed', () => {
    const before = save();
    const after = bankInto(before, banked({ equipmentDrops: [10, 20, 30] }), NOW, rolling());
    expect(after.equipment.inventory.length).toBe(before.equipment.inventory.length + 3);
    // Three distinct ids, not one item counted three times.
    expect(new Set(after.equipment.inventory).size).toBe(after.equipment.inventory.length);
  });

  it('marks them as drops, which is what prices their scrap', () => {
    // A `drop` scraps for more than a `starter`, so the source is not cosmetic.
    const before = save();
    const after = bankInto(before, banked({ equipmentDrops: [40] }), NOW, rolling());
    const added = after.equipment.inventory.filter(id => !before.equipment.inventory.includes(id));
    expect(after.equipment.instances[added[0]].source).toBe('drop');
  });

  it('rolls the item against the level the same bank just reached', () => {
    /*
     * Ordering, and it is visible: the EXP in this bank takes the player past
     * level 40, and the item that lands is rolled at the level they arrived
     * at rather than the one they left. Rolling first would hand a player who
     * just levelled an item from before it.
     */
    const before = save();
    const withLevel = bankInto(before, banked({ exp: new Decimal(1e9), equipmentDrops: [40] }), NOW, rolling());
    const added = withLevel.equipment.inventory.filter(id => !before.equipment.inventory.includes(id));
    expect(withLevel.progression.level).toBeGreaterThan(before.progression.level);
    expect(withLevel.equipment.instances[added[0]].itemLevel).toBe(withLevel.progression.level);
  });

  it('loses a drop rather than overflowing the bag', () => {
    /*
     * The shipped behaviour, and it reads as a bug until the alternative is
     * named: a bag that grows without limit.
     *
     * Filled by *winning* items rather than by writing ids into the save,
     * which was my first attempt — the reader drops an inventory id with no
     * catalogue row behind it, so a bag of `filler_0`, `filler_1` reads back
     * empty and the test measured nothing. That rule is Phase 9's, and it is
     * the same one that retires an item from old saves.
     */
    const cap = craftInventoryCap(0);
    const roll = rolling();
    const full = bankInto(save(), banked({ equipmentDrops: Array.from({ length: cap }, () => 40) }), NOW, roll);
    expect(full.equipment.inventory.length).toBe(cap);

    const after = bankInto(full, banked({ equipmentDrops: [40, 41, 42] }), NOW, roll);
    expect(after.equipment.inventory.length).toBe(cap);
  });

  it('leaves the bag alone when nothing dropped', () => {
    const before = save();
    const after = bankInto(before, banked({ gold: new Decimal(100) }), NOW, rolling());
    expect(after.equipment.inventory).toEqual(before.equipment.inventory);
    expect(after.wallet.gold).toBe(100);
  });

  it('banks the currencies alongside, in one call', () => {
    // The whole reason this function exists: a shell that called `bankRun`
    // alone would bank the gold and drop the drops on the floor.
    const after = bankInto(save(), banked({ gold: new Decimal(250), equipmentDrops: [40] }), NOW, rolling());
    expect(after.wallet.gold).toBe(250);
    expect(after.equipment.inventory.length).toBe(1);
  });
});

describe('the usables a run found', () => {
  it('puts them in the bag, already resolved', () => {
    // Unlike equipment, a usable needs nothing from the save — it comes off a
    // weight table — so the fight resolves which item and this only grants it.
    const after = bankInto(
      save(),
      banked({ usableDrops: ['gold_cache', 'gold_cache', 'small_potion'] }),
      NOW,
      rolling(),
    );
    expect(after.usables.gold_cache).toBe(2);
    expect(after.usables.small_potion).toBe(1);
  });

  it('ignores an id the catalogue does not know', () => {
    const after = bankInto(save(), banked({ usableDrops: ['not_a_thing'] }), NOW, rolling());
    expect(after.usables).toEqual({});
  });
});
