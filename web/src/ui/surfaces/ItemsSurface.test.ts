import { describe, expect, it } from 'vitest';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { USABLE_ITEMS } from '../../content/usableItems';
import { readSave } from '../../engine/save/v3';
import type { SaveV3 } from '../../engine/save/schema';
import { heldItems } from './ItemsSurface';

/**
 * The Items surface's one decision: what to draw.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };

function save(usables: Record<string, number>): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 10 },
      usables,
    },
    { nowMs: 0, content: CONTENT },
  );
}

describe('what the bag shows', () => {
  it('shows only what is held', () => {
    expect(heldItems(save({ gold_cache: 2 })).map(entry => entry.id)).toEqual(['gold_cache']);
  });

  it('shows nothing for an empty bag rather than every item at zero', () => {
    // A screen listing eight items the player does not have is a screen that
    // has to be read before it can be ignored.
    expect(heldItems(save({}))).toEqual([]);
  });

  it('orders by the catalogue, not by what arrived first', () => {
    /*
     * So the bag does not reshuffle itself as a run goes on. A player reaching
     * for the third row has to find the same item there next time.
     */
    const order = heldItems(save({ shard_cluster: 1, small_potion: 1, gold_cache: 1 })).map(entry => entry.id);
    const catalogue = USABLE_ITEMS.map(item => item.id).filter(id => order.includes(id));
    expect(order).toEqual(catalogue);
  });

  it('carries the count through', () => {
    expect(heldItems(save({ gold_cache: 7 }))[0].count).toBe(7);
  });
});
