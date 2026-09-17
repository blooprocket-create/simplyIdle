import { describe, expect, it } from 'vitest';
import { equipmentTemplatesById, getEquipmentItem } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { DEFAULT_AUTO_DISMANTLE_FLOOR, equipmentToLegacy, readEquipment } from './equipmentSlice';
import { migrateSave } from './migrate';
import type { SaveContent } from './schema';
import { readSave, writeSaveV3 } from './v3';

/**
 * The equipment slice, bounded.
 *
 * Local storage is editable by whoever owns the browser and — once the
 * Firebase adapter lands — a shared document is editable by whoever last wrote
 * to it, so every field here is bounded rather than trusted. The interesting
 * part is not any one bound but the *order*: instances, then the inventory,
 * then the worn set, each filtered against the one before it.
 */

const CONTENT: SaveContent = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const OPTIONS = { nowMs: 1_700_000_000_000, content: CONTENT };

function read(over: Partial<Parameters<typeof readEquipment>[0]> = {}) {
  return readEquipment({
    inventoryItemIds: [],
    equipmentInventory: {},
    equippedItems: {},
    autoDismantleRarityFloor: undefined,
    content: CONTENT,
    level: 40,
    ...over,
  });
}

/** A stored instance, in the shape the shipped game writes one. */
function instance(baseItemId: string, over: Record<string, unknown> = {}) {
  const base = getEquipmentItem(baseItemId)!;
  return {
    id: `eq_craft_1_${baseItemId}`,
    baseItemId,
    name: base.name,
    emoji: base.emoji,
    slot: base.slot,
    rarity: base.rarity,
    allowedClasses: [...base.allowedClasses],
    description: base.description,
    bonus: { strength: 4, vitality: 2, agility: 0, intelligence: 0, spirit: 0 },
    itemLevel: 12,
    source: 'craft',
    ...over,
  };
}

describe('what it keeps', () => {
  it('holds a bare catalogue id and a rolled instance in the same list', () => {
    /*
     * Both shapes are legal, because the shipped inventory is a list of ids
     * beside a record keyed by the same ids, and the reducers read either
     * through one fallback. A reader that normalised to one shape would either
     * drop every pre-instance item or invent a stat roll for it — and inventing
     * one needs dice, which is why the conversion lives where the dice do.
     */
    const rolled = instance('w_warrior_hammer');
    const result = read({
      inventoryItemIds: ['w_warrior_blade', rolled.id],
      equipmentInventory: { [rolled.id]: rolled },
    });
    expect(result.inventory).toEqual(['w_warrior_blade', rolled.id]);
    expect(result.instances[rolled.id]?.baseItemId).toBe('w_warrior_hammer');
    expect(result.instances.w_warrior_blade).toBeUndefined();
  });

  it('keeps the stored name over the catalogue’s, so a rename does not rewrite history', () => {
    const renamed = instance('w_warrior_blade', { name: 'Grandfather’s Blade' });
    const result = read({ inventoryItemIds: [renamed.id], equipmentInventory: { [renamed.id]: renamed } });
    expect(result.instances[renamed.id]?.name).toBe('Grandfather’s Blade');
  });

  it('falls back to the catalogue when a stored string is unusable', () => {
    const base = getEquipmentItem('w_warrior_blade')!;
    const blanked = instance('w_warrior_blade', { name: '', emoji: 42, description: null });
    const result = read({ inventoryItemIds: [blanked.id], equipmentInventory: { [blanked.id]: blanked } });
    expect(result.instances[blanked.id]).toMatchObject({
      name: base.name,
      emoji: base.emoji,
      description: base.description,
    });
  });
});

describe('what it drops', () => {
  it('drops an instance whose base item is gone', () => {
    // The mechanism by which a retired item leaves old saves, and the same one
    // `readHero` gives a hero. Without it the slice would carry a row nothing
    // can price, equip or dismantle.
    const orphan = instance('w_warrior_blade', { baseItemId: 'w_retired' });
    const result = read({ inventoryItemIds: [orphan.id], equipmentInventory: { [orphan.id]: orphan } });
    expect(result.instances).toEqual({});
    expect(result.inventory).toEqual([]);
  });

  it('drops an inventory id that is neither an instance nor a catalogue row', () => {
    expect(read({ inventoryItemIds: ['w_warrior_blade', 'w_invented', ''] }).inventory).toEqual(['w_warrior_blade']);
  });

  it('drops a duplicate id rather than keeping both', () => {
    // The inventory is keyed by id everywhere downstream, so two of them is
    // one item the player can dismantle twice.
    expect(read({ inventoryItemIds: ['w_warrior_blade', 'w_warrior_blade'] }).inventory).toEqual(['w_warrior_blade']);
  });

  it('drops an instance nobody holds', () => {
    /*
     * A record that outlived its list is unreachable *and* permanent: every
     * dismantle removes the id from the list, so without this the instances
     * record only ever grows, and a save is a file that has to be written on a
     * timer.
     */
    const orphan = instance('w_warrior_blade');
    const result = read({ inventoryItemIds: [], equipmentInventory: { [orphan.id]: orphan } });
    expect(result.instances).toEqual({});
  });

  it('refuses to wear what the inventory does not hold', () => {
    // A slot pointing at an item the player does not own is a stat bonus from
    // nothing, which is the whole reason the filters run in this order.
    const result = read({
      inventoryItemIds: ['w_warrior_blade'],
      equippedItems: { weapon: 'w_warrior_hammer', armor: 'a_plate', accessory: null },
    });
    expect(result.equipped).toEqual({ weapon: null, armor: null, accessory: null });
  });

  it('refuses to wear an item in the wrong slot', () => {
    // The item's own slot decides, not the key it was stored under.
    const result = read({
      inventoryItemIds: ['w_warrior_blade'],
      equippedItems: { weapon: null, armor: 'w_warrior_blade', accessory: null },
    });
    expect(result.equipped.armor).toBeNull();
  });
});

describe('what it bounds', () => {
  it('floors a stat bonus at zero', () => {
    /*
     * A negative bonus is a stat penalty the game has no concept of, and worse
     * than useless: a dismantle pays scrap for the item anyway, so a save
     * hand-edited to carry one is an item that costs stats and refunds coin.
     */
    const cursed = instance('w_warrior_blade', { bonus: { strength: -50, vitality: 3 } });
    const result = read({ inventoryItemIds: [cursed.id], equipmentInventory: { [cursed.id]: cursed } });
    expect(result.instances[cursed.id]?.bonus).toEqual({
      strength: 0,
      vitality: 3,
      agility: 0,
      intelligence: 0,
      spirit: 0,
    });
  });

  it('defaults an unreadable item level to the player’s, not to one', () => {
    // Treating it as level one would quietly halve a deep account's gear on a
    // single corrupted field, which is the failure a returning player could
    // not diagnose.
    const vague = instance('w_warrior_blade', { itemLevel: 'soon' });
    const result = read({ inventoryItemIds: [vague.id], equipmentInventory: { [vague.id]: vague }, level: 140 });
    expect(result.instances[vague.id]?.itemLevel).toBe(140);
  });

  it('defaults an unreadable source to legacy, not to drop', () => {
    // The source decides the scrap rate. `drop` pays full; `legacy` pays nine
    // tenths. Defaulting to the generous one pays out for an item nobody can
    // account for.
    const vague = instance('w_warrior_blade', { source: 'gift' });
    const result = read({ inventoryItemIds: [vague.id], equipmentInventory: { [vague.id]: vague } });
    expect(result.instances[vague.id]?.source).toBe('legacy');
  });

  it('defaults an unreadable sweep floor to common', () => {
    expect(read({ autoDismantleRarityFloor: 'godly' }).autoDismantleFloor).toBe(DEFAULT_AUTO_DISMANTLE_FLOOR);
    expect(read({ autoDismantleRarityFloor: 'epic' }).autoDismantleFloor).toBe('epic');
  });

  it('survives a payload that is not an object at all', () => {
    expect(read({ inventoryItemIds: 'everything', equipmentInventory: 7, equippedItems: null })).toEqual({
      inventory: [],
      instances: {},
      equipped: { weapon: null, armor: null, accessory: null },
      autoDismantleFloor: DEFAULT_AUTO_DISMANTLE_FLOOR,
    });
  });
});

describe('the round trip', () => {
  const payload = {
    saveVersion: 2,
    playerName: 'Ref',
    playerClass: 'warrior',
    characterCreated: true,
    level: 40,
    inventoryItemIds: ['w_warrior_blade', 'eq_craft_1_a_plate'],
    equipmentInventory: { eq_craft_1_a_plate: instance('a_plate', { id: 'eq_craft_1_a_plate' }) },
    equippedItems: { weapon: 'w_warrior_blade', armor: 'eq_craft_1_a_plate', accessory: null },
    autoDismantleRarityFloor: 'epic',
  };

  it('reads the four v2 keys into the typed slice', () => {
    const save = migrateSave(payload, OPTIONS);
    expect(save.equipment.inventory).toEqual(['w_warrior_blade', 'eq_craft_1_a_plate']);
    expect(save.equipment.equipped).toEqual({
      weapon: 'w_warrior_blade',
      armor: 'eq_craft_1_a_plate',
      accessory: null,
    });
    expect(save.equipment.autoDismantleFloor).toBe('epic');
  });

  it('takes them out of the legacy bag', () => {
    const save = migrateSave(payload, OPTIONS);
    for (const key of ['inventoryItemIds', 'equipmentInventory', 'equippedItems', 'autoDismantleRarityFloor']) {
      expect({ key, inLegacy: key in save.legacy }).toEqual({ key, inLegacy: false });
    }
  });

  it('reads its own output back to the same slice', () => {
    // The law the whole save layer rests on: whatever the reader decides a
    // save means, writing that meaning back and reading it again cannot
    // change it. Three reads deep, because an inflation that happens once is a
    // migration and one that happens every time is a leak.
    const once = migrateSave(payload, OPTIONS);
    const twice = readSave(JSON.parse(writeSaveV3(once)), OPTIONS);
    const thrice = readSave(JSON.parse(writeSaveV3(twice)), OPTIONS);
    expect(twice.equipment).toEqual(once.equipment);
    expect(thrice.equipment).toEqual(once.equipment);
  });

  it('writes a payload the shipped reader understands', () => {
    /*
     * The other half, and the one that matters across apps: both point at the
     * same document, and a slice written under our own field names reads as an
     * *empty* inventory to the shipped game — a player's gear silently gone.
     */
    const save = migrateSave(payload, OPTIONS);
    const out = equipmentToLegacy(save.equipment);
    expect(out.inventoryItemIds).toEqual(['w_warrior_blade', 'eq_craft_1_a_plate']);
    expect(out.equippedItems).toEqual(save.equipment.equipped);
    expect(out.autoDismantleRarityFloor).toBe('epic');
    // The id goes in the body as well as being the key, because the shipped
    // live state carries it there.
    expect((out.equipmentInventory as Record<string, { id: string }>).eq_craft_1_a_plate.id).toBe('eq_craft_1_a_plate');
  });

  it('round-trips through the v2 shape without losing an item', () => {
    const save = migrateSave(payload, OPTIONS);
    const backAgain = migrateSave({ ...payload, ...equipmentToLegacy(save.equipment) }, OPTIONS);
    expect(backAgain.equipment).toEqual(save.equipment);
  });
});
