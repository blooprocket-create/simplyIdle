import { describe, expect, it } from 'vitest';
import fixture from '../engine/equipment/__fixtures__/equipment.json';
import { CLASS_PROFILES, type PlayerClass } from './classes';
import { RARITY_IDS } from './rarities';
import {
  EQUIPMENT_CATALOG,
  EQUIPMENT_RARITIES,
  EQUIPMENT_RARITY_IDS,
  EQUIPMENT_SLOTS,
  equipmentRarityConfig,
  getEquipmentItem,
  starterEquipmentForClass,
} from './equipment';

/**
 * Checked against the fixture rather than read back from the file it is
 * transcribed into. Seventy-five rows of names, emoji, classes and stat
 * bonuses is more transcription than anybody reads carefully — the file is
 * generated out of the fixture for exactly that reason, and this is the other
 * half of that arrangement.
 */

/** Every class, from the profile table, so a sixth would join these sweeps. */
const CLASS_IDS = Object.keys(CLASS_PROFILES) as PlayerClass[];

describe('the catalogue', () => {
  it('carries every shipped row, field for field', () => {
    expect(
      EQUIPMENT_CATALOG.map(item => ({
        id: item.id,
        name: item.name,
        emoji: item.emoji,
        slot: item.slot,
        rarity: item.rarity,
        allowedClasses: [...item.allowedClasses],
        description: item.description,
        bonus: item.bonus,
      })),
    ).toEqual(fixture.catalog);
  });

  it('keeps the rows in the order the shipped file authored them', () => {
    // Not cosmetic here the way it is for heroes — nothing indexes into this
    // catalogue — but a reordered file is a diff nobody can read, and the
    // generator that produced it walks the fixture in order.
    expect(EQUIPMENT_CATALOG.map(item => item.id)).toEqual(fixture.catalog.map(item => item.id));
  });

  it('finds an item by id, and nothing by a made-up one', () => {
    expect(getEquipmentItem('w_warrior_blade')?.name).toBe('Iron Vanguard Blade');
    expect(getEquipmentItem('w_nonexistent')).toBeUndefined();
  });
});

describe('the rarity table', () => {
  it('carries the shipped weights, labels and colours', () => {
    expect(EQUIPMENT_RARITIES.map(entry => ({ ...entry }))).toEqual(fixture.rarities);
  });

  it('is not the hero rarity table, and shares four names with it', () => {
    /*
     * The trap this file's header is about. Heroes have eight rarities
     * including `uncommon` and `godly`; equipment has six and neither. Four
     * names appear in both, which is enough for a port to collapse them and
     * enough for the collapse to work on most inputs — until something rolls
     * a `godly` sword that no weight table has a row for.
     */
    expect(EQUIPMENT_RARITY_IDS).toHaveLength(6);
    expect(EQUIPMENT_RARITY_IDS).not.toContain('uncommon');
    expect(EQUIPMENT_RARITY_IDS).not.toContain('godly');
    const shared = EQUIPMENT_RARITY_IDS.filter(id => (RARITY_IDS as readonly string[]).includes(id));
    expect(shared).toEqual(['common', 'rare', 'epic', 'legendary', 'mythic', 'transcendent']);
    expect(RARITY_IDS.length).toBeGreaterThan(EQUIPMENT_RARITY_IDS.length);
  });

  it('falls back to common for a rarity it does not know', () => {
    // The shipped `?? EQUIPMENT_RARITIES[0]`, kept: a stored save can name a
    // rarity this build has retired, and a lookup that threw would take the
    // screen down rather than showing a common.
    expect(equipmentRarityConfig('godly' as never).id).toBe('common');
  });
});

describe('what a class starts with', () => {
  it('matches the shipped starter set for every class', () => {
    for (const cls of CLASS_IDS) {
      expect({ cls, items: starterEquipmentForClass(cls) }).toEqual({
        cls,
        items: fixture.starterByClass[cls],
      });
    }
  });

  it('gives three items, one per slot', () => {
    for (const cls of CLASS_IDS) {
      const slots = starterEquipmentForClass(cls).map(id => getEquipmentItem(id)!.slot);
      expect({ cls, slots: [...slots].sort() }).toEqual({ cls, slots: [...EQUIPMENT_SLOTS].sort() });
    }
  });

  it('takes the cheapest available, which is not always a common', () => {
    /*
     * No accessory in the catalogue is common, so every class starts with a
     * rare there — and the **mage** with an epic, the strongest starter item
     * in the game. That falls out of "sort by rarity and take the first"
     * rather than being chosen, which is why a port that hardcoded `common`
     * would agree on weapons and armour and be wrong on every accessory.
     */
    const accessories = Object.fromEntries(
      CLASS_IDS.map(cls => [cls, getEquipmentItem(starterEquipmentForClass(cls)[2])!.rarity]),
    );
    expect(accessories).toEqual({
      warrior: 'rare',
      berserker: 'rare',
      archer: 'rare',
      mage: 'epic',
      monk: 'rare',
    });
  });
});
