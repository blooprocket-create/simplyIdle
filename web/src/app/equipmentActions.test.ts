import { describe, expect, it } from 'vitest';
import { equipmentTemplatesById, getEquipmentItem } from '../content/equipment';
import { heroTemplatesById } from '../content/heroes';
import { readSave } from '../engine/save/v3';
import type { SaveContent, SaveV3 } from '../engine/save/schema';
import { equipmentUnlocks, migrateLegacyEquipment, planUpgrade } from './equipmentActions';

/**
 * The equipment seam: the catalogue and the dice, handed to an engine that may
 * read neither.
 */

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const CONTENT: SaveContent = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };

function scriptedRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function save(over: Record<string, unknown> = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'Ref', playerClass: 'warrior', created: true },
      progression: { level: 100, ...(over.progression as object) },
      equipment: {
        inventory: ['w_warrior_blade', 'a_plate'],
        instances: {},
        equipped: { weapon: 'w_warrior_blade', armor: null, accessory: null },
        autoDismantleFloor: 'common',
        ...(over.equipment as object),
      },
      legacy: (over.legacy as object) ?? {},
    },
    { nowMs: NOW, content: CONTENT },
  );
}

describe('converting a pre-instance inventory', () => {
  it('turns every bare id into a rolled instance', () => {
    const before = save();
    const after = migrateLegacyEquipment(before, NOW, scriptedRandom(1));
    expect(after.equipment.inventory).toHaveLength(2);
    for (const id of after.equipment.inventory) {
      expect({ id, kind: id in after.equipment.instances }).toEqual({ id, kind: true });
      expect({ id, source: after.equipment.instances[id].source }).toEqual({ id, source: 'legacy' });
    }
  });

  it('rolls against the player’s level, which is the whole point', () => {
    /*
     * A bare row carries its *authored* bonus — three or four points. The
     * instance it becomes is rolled against the player's level, which at 100
     * is an order of magnitude more. A port that skipped this would show a
     * returning player far weaker gear than the app they left.
     */
    const authored = getEquipmentItem('w_warrior_blade')!.bonus;
    const authoredSum = Object.values(authored).reduce<number>((sum, value) => sum + (value ?? 0), 0);

    const after = migrateLegacyEquipment(save(), NOW, scriptedRandom(1));
    const converted = Object.values(after.equipment.instances).find(item => item.baseItemId === 'w_warrior_blade')!;
    const rolledSum = Object.values(converted.bonus).reduce<number>((sum, value) => sum + value, 0);
    expect(rolledSum).toBeGreaterThan(authoredSum * 5);
    expect(converted.itemLevel).toBe(100);
  });

  it('moves the worn slot to the item’s new id', () => {
    // The instance has a new id, so a slot left naming the old one is a player
    // whose weapon vanished on load.
    const after = migrateLegacyEquipment(save(), NOW, scriptedRandom(1));
    const weapon = after.equipment.equipped.weapon;
    expect(weapon).not.toBe('w_warrior_blade');
    expect(weapon).not.toBeNull();
    expect(after.equipment.instances[weapon!].baseItemId).toBe('w_warrior_blade');
  });

  it('leaves a save that is already all instances alone', () => {
    // Idempotent, which it has to be: it runs on every load, and a conversion
    // that re-rolled would give a player different stats every time they
    // opened the tab.
    const once = migrateLegacyEquipment(save(), NOW, scriptedRandom(1));
    const twice = migrateLegacyEquipment(once, NOW, scriptedRandom(2));
    expect(twice).toBe(once);
  });

  it('gives every converted item a distinct id', () => {
    // Two conversions in the same millisecond on the same draw would collide,
    // and an inventory keyed by id loses the second item outright.
    const wide = save({
      equipment: {
        inventory: ['w_warrior_blade', 'w_warrior_hammer', 'a_plate', 'x_warrior_signet'],
        instances: {},
        equipped: { weapon: null, armor: null, accessory: null },
        autoDismantleFloor: 'common',
      },
    });
    const after = migrateLegacyEquipment(wide, NOW, () => 0.5);
    expect(new Set(after.equipment.inventory).size).toBe(4);
  });
});

describe('which tiers an account has unlocked', () => {
  it('defaults both to locked', () => {
    /*
     * The honest reading of an absent field, and the shipped one: `hasUnlock`
     * answers false for a list it cannot find. Defaulted to true it would hand
     * a new player mythic crafts on their first press.
     */
    expect(equipmentUnlocks(save())).toEqual({ mythic: false, transcendent: false });
  });

  it('reads the mythic flag out of the legacy bag', () => {
    expect(equipmentUnlocks(save({ legacy: { unlockedFeatures: ['mythic_equipment'] } })).mythic).toBe(true);
    expect(equipmentUnlocks(save({ legacy: { unlockedFeatures: 'mythic_equipment' } })).mythic).toBe(false);
  });

  it('takes transcendent off the postgame gate, not off a flag', () => {
    // `isPostgameSummonUnlocked` is wave 150 or one prestige, and the typed
    // slice already carries both — so this one does not need the bag at all.
    expect(equipmentUnlocks(save({ progression: { highestWave: 150 } })).transcendent).toBe(true);
    expect(equipmentUnlocks(save({ progression: { prestigeCount: 1 } })).transcendent).toBe(true);
    expect(equipmentUnlocks(save({ progression: { highestWave: 149 } })).transcendent).toBe(false);
  });
});

describe('quoting an upgrade', () => {
  it('draws a value, which is why no screen quotes one', () => {
    /*
     * The shipped plan picks its target *before* anybody checks the purse, so
     * this is not a pure query — calling it to price a button would advance the
     * sequence on every render, and the item it named need not be the one the
     * press hands over, because the press computes its own plan.
     */
    let drawn = 0;
    const plan = planUpgrade(save(), 'w_warrior_blade', () => {
      drawn += 1;
      return 0.5;
    });
    expect(drawn).toBe(1);
    expect(plan?.targetRarity).toBe('rare');
  });

  it('answers nothing for an item nobody owns', () => {
    expect(planUpgrade(save(), 'w_warrior_hammer', () => 0.5)).toBeNull();
    expect(planUpgrade(save(), 'w_invented', () => 0.5)).toBeNull();
  });
});
