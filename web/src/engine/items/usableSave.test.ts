import { describe, expect, it } from 'vitest';
import fixture from '../../content/__fixtures__/usable-items.json';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { getUsableItem, rollUsableItem, USABLE_ITEMS } from '../../content/usableItems';
import { readSave } from '../save/v3';
import type { SaveV3 } from '../save/schema';
import { usableExpGain, usableGoldGain, usableShardGain, type UsableScaling } from './usableGains';
import { grantUsable, useUsableItem } from './usableSave';

/**
 * Usable items, against the values measured off the shipped reducer.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

/** The account the fixture measured each row against. */
const scalingFor = (row: (typeof fixture.uses)[number]): UsableScaling => ({
  level: row.level,
  highestWave: row.highestWave,
  prestigeCount: row.prestige,
  vipGoldMult: 1 + row.vip * 0.025,
  achievementMult: 1,
  vipExpMult: 1 + row.vip * 0.025,
  weeklyShardMult: 1,
});

function save(over: Record<string, unknown> = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 1 },
      wallet: { gold: 0 },
      ...over,
    },
    { nowMs: NOW, content: CONTENT },
  );
}

describe('the catalogue', () => {
  it('carries every recorded row, verbatim', () => {
    expect(
      USABLE_ITEMS.map(item => ({
        id: item.id,
        name: item.name,
        itemType: item.itemType,
        effect: item.effect,
        value: item.value,
        dropWeight: item.dropWeight,
      })),
    ).toEqual(fixture.items);
  });

  it('reproduces every recorded roll, from both pools', () => {
    expect(
      fixture.rolls.map(row => ({
        basic: rollUsableItem(row.roll, false).id,
        advanced: rollUsableItem(row.roll, true).id,
      })),
    ).toEqual(fixture.rolls.map(row => ({ basic: row.basic, advanced: row.advanced })));
  });

  it('never rolls a coolant, because their weight is zero', () => {
    // They are shop stock. A port treating every row as droppable would give
    // away what the game sells.
    for (let roll = 0; roll <= 1; roll += 0.001) {
      expect(rollUsableItem(roll, true).id.startsWith('coolant')).toBe(false);
    }
  });
});

describe('what a use is worth', () => {
  const measured = (name: string) => fixture.uses.find(row => row.name === name)!;

  /**
   * Exact while the numbers fit a safe integer, and to a relative 1e-12 past
   * it — which is where the two implementations genuinely differ.
   *
   * The wave floor reads `getMonsterGold`, and this port returns a `Decimal`
   * where the shipped game returns a double. A shallow account's gain matches
   * to the digit; a deep one's differs in the *fifteenth* significant figure,
   * because 8.518143752687424e24 and 8.518143752687489e24 are the same
   * arithmetic carried at two precisions. Asserting equality there would be
   * asserting that `Decimal` rounds like a double, which is the opposite of
   * why it is in the stack.
   */
  const matches = (actual: number, expected: number, label: string) => {
    if (Math.abs(expected) <= Number.MAX_SAFE_INTEGER) {
      expect(actual, label).toBe(expected);
      return;
    }
    expect(Math.abs(actual - expected) / Math.abs(expected), label).toBeLessThan(1e-12);
  };

  it('reproduces the recorded gold gains', () => {
    for (const name of ['gold, shallow', 'gold, deep', 'gold, vip', 'gold, shallow and prestiged', 'vault cache']) {
      const row = measured(name);
      const item = getUsableItem(row.itemId)!;
      matches(usableGoldGain(item.value, item.itemType, scalingFor(row)), row.gold, name);
    }
  });

  it('reproduces the recorded EXP and shard gains', () => {
    for (const name of ['exp, shallow', 'exp, deep']) {
      const row = measured(name);
      const item = getUsableItem(row.itemId)!;
      matches(usableExpGain(item.value, item.itemType, scalingFor(row)), row.exp, name);
    }
    for (const name of ['shards, shallow', 'shards, deep']) {
      const row = measured(name);
      const item = getUsableItem(row.itemId)!;
      matches(usableShardGain(item.value, item.itemType, scalingFor(row)), row.shards, name);
    }
  });

  it('pays the wave floor once it beats the item, and ignores everything after', () => {
    /*
     * The finding. Every gain is `max(scaledBase, waveFloor)`, so a deep
     * account's Gold Cache pays what three of their own monsters pay rather
     * than the 350 written on it — and once the floor wins, **prestige, VIP
     * and achievements stop mattering entirely**.
     */
    const deep = measured('gold, deep');
    const prestiged = measured('gold, deep and prestiged');
    expect(prestiged.gold).toBe(deep.gold);
    expect(deep.gold).toBeGreaterThan(getUsableItem('gold_cache')!.value * 1000);
  });
});

describe('using one', () => {
  const held = (id: string, count: number) => grantUsable(save(), id, count);
  const scaling: UsableScaling = {
    level: 1,
    highestWave: 1,
    prestigeCount: 0,
    vipGoldMult: 1,
    achievementMult: 1,
    vipExpMult: 1,
    weeklyShardMult: 1,
  };

  it('spends one and pays once', () => {
    const before = held('gold_cache', 3);
    const after = useUsableItem({ save: before, itemId: 'gold_cache', amount: 1, scaling })!;
    expect(after.used).toBe(1);
    expect(after.save.usables.gold_cache).toBe(2);
    expect(after.save.wallet.gold).toBeGreaterThan(0);
  });

  it('spends several, and pays for each', () => {
    const one = useUsableItem({ save: held('gold_cache', 5), itemId: 'gold_cache', amount: 1, scaling })!;
    const three = useUsableItem({ save: held('gold_cache', 5), itemId: 'gold_cache', amount: 3, scaling })!;
    expect(three.used).toBe(3);
    expect(three.save.wallet.gold).toBe(one.save.wallet.gold * 3);
  });

  it('spends the lot on `all`, and clamps a request past what is held', () => {
    expect(useUsableItem({ save: held('gold_cache', 4), itemId: 'gold_cache', amount: 'all', scaling })!.used).toBe(4);
    // Asking for nine when two are held spends two rather than refusing.
    expect(useUsableItem({ save: held('gold_cache', 2), itemId: 'gold_cache', amount: 9, scaling })!.used).toBe(2);
  });

  it('drops the key entirely once the last one is gone', () => {
    // Otherwise a save grows a zero for every item ever used.
    const after = useUsableItem({ save: held('gold_cache', 1), itemId: 'gold_cache', amount: 1, scaling })!;
    expect('gold_cache' in after.save.usables).toBe(false);
  });

  it('refuses when none are held, or the id is not an item', () => {
    expect(useUsableItem({ save: save(), itemId: 'gold_cache', amount: 1, scaling })).toBeNull();
    expect(useUsableItem({ save: held('gold_cache', 1), itemId: 'not_a_thing', amount: 1, scaling })).toBeNull();
  });

  it('reports a heal rather than applying it, because the save has no team', () => {
    /*
     * The team's health lives in the running fight. A potion that tried to
     * change the save would heal nothing a player could see.
     */
    const after = useUsableItem({ save: held('small_potion', 2), itemId: 'small_potion', amount: 2, scaling })!;
    expect(after.healFraction).toBe(getUsableItem('small_potion')!.value * 2);
    expect(after.save.wallet.gold).toBe(0);
  });

  it('levels the player off a training scroll', () => {
    const after = useUsableItem({ save: held('exp_scroll', 20), itemId: 'exp_scroll', amount: 'all', scaling })!;
    expect(after.save.progression.level).toBeGreaterThan(1);
    expect(after.save.stats.unspent).toBeGreaterThan(0);
  });

  it('spends a coolant and does nothing, because this engine has no heat', () => {
    // Named rather than left to be discovered: refusing would leave a player
    // unable to clear an item they can never use.
    const after = useUsableItem({ save: held('coolant_mk1', 1), itemId: 'coolant_mk1', amount: 1, scaling })!;
    expect(after.used).toBe(1);
    expect('coolant_mk1' in after.save.usables).toBe(false);
    expect(after.healFraction).toBe(0);
  });
});
