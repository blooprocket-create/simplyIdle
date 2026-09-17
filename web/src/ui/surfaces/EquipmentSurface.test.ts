import { describe, expect, it } from 'vitest';
import { equipmentTemplatesById, getEquipmentItem } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { readSave } from '../../engine/save/v3';
import type { SaveContent, SaveV3 } from '../../engine/save/schema';
import { shownItems, statLine } from './EquipmentSurface';

/**
 * The decisions on the Equipment surface that are not a render.
 *
 * There is no React testing stack here, by choice — surfaces describe data and
 * are held to `ui/architecture.test.ts` — so anything with a branch in it lives
 * somewhere that can be called without mounting a component.
 */

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const CONTENT: SaveContent = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };

function save(equipment: Record<string, unknown>, playerClass = 'warrior'): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'Ref', playerClass, created: true },
      progression: { level: 30 },
      equipment: {
        inventory: [],
        instances: {},
        equipped: { weapon: null, armor: null, accessory: null },
        autoDismantleFloor: 'common',
        ...equipment,
      },
    },
    { nowMs: NOW, content: CONTENT },
  );
}

function instance(baseItemId: string, over: Record<string, unknown> = {}) {
  const base = getEquipmentItem(baseItemId)!;
  return {
    baseItemId,
    name: base.name,
    emoji: base.emoji,
    description: base.description,
    rarity: base.rarity,
    bonus: { strength: 9, vitality: 4, agility: 0, intelligence: 0, spirit: 0 },
    itemLevel: 31,
    source: 'craft',
    ...over,
  };
}

describe('resolving what is owned', () => {
  it('shows a bare catalogue row and a rolled instance alike', () => {
    /*
     * Both shapes are legal in one inventory, so the surface has to draw
     * either — and the difference is visible: an instance has an item level
     * and a rolled bonus, a row has neither.
     */
    const rolled = instance('w_warrior_hammer');
    const items = shownItems(save({ inventory: ['w_warrior_blade', 'eq_1'], instances: { eq_1: rolled } }));
    expect(items.map(item => item.id)).toEqual(['w_warrior_blade', 'eq_1']);
    expect(items[0].itemLevel).toBeNull();
    expect(items[1].itemLevel).toBe(31);
    expect(items[1].bonus).toEqual(rolled.bonus);
  });

  it('prefers an instance’s own rarity over its base row’s', () => {
    // An upgrade builds from a *different* row, so a stored rarity is not
    // always the base item's — reading the base's would show a player the
    // rarity they upgraded away from.
    const upgraded = instance('w_warrior_blade', { rarity: 'legendary' });
    const items = shownItems(save({ inventory: ['eq_1'], instances: { eq_1: upgraded } }));
    expect({ shown: items[0].rarity, base: getEquipmentItem('w_warrior_blade')!.rarity }).toEqual({
      shown: 'legendary',
      base: 'common',
    });
  });

  it('marks what is worn', () => {
    const items = shownItems(
      save({ inventory: ['w_warrior_blade', 'w_warrior_hammer'], equipped: { weapon: 'w_warrior_blade' } }),
    );
    expect(items.map(item => item.worn)).toEqual([true, false]);
  });

  it('marks what the class may not wear, rather than hiding it', () => {
    /*
     * Shown and flagged, not filtered out. A mage's staff in a warrior's
     * inventory is still theirs — they can scrap it, and they will want to
     * know why they cannot equip it. Filtering would make it vanish with no
     * explanation.
     */
    const items = shownItems(save({ inventory: ['w_warrior_blade', 'w_mage_staff'] }));
    expect(items.map(item => ({ id: item.id, wearable: item.wearable }))).toEqual([
      { id: 'w_warrior_blade', wearable: true },
      { id: 'w_mage_staff', wearable: false },
    ]);
  });

  it('keeps the inventory’s own order', () => {
    // Which is the order items arrived in. Sorting here would mean a screen
    // that reorders itself every craft.
    const items = shownItems(save({ inventory: ['x_warrior_signet', 'w_warrior_blade', 'a_plate'] }));
    expect(items.map(item => item.id)).toEqual(['x_warrior_signet', 'w_warrior_blade', 'a_plate']);
  });
});

describe('the stat line', () => {
  it('names only the stats an item actually gives', () => {
    // A row of five stats where three are zero is four characters of signal in
    // a line of noise.
    expect(statLine({ strength: 9, vitality: 4, agility: 0, intelligence: 0, spirit: 0 })).toBe('+9 STR · +4 VIT');
  });

  it('is empty when an item gives nothing', () => {
    expect(statLine({})).toBe('');
    expect(statLine({ strength: 0 })).toBe('');
  });

  it('lists them in the stat order, not the order they were written', () => {
    // The same order the character screen uses, so two screens describing one
    // item do not disagree about which stat comes first.
    expect(statLine({ spirit: 1, strength: 2 })).toBe('+2 STR · +1 SPI');
  });
});
