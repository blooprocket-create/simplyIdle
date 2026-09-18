import { describe, expect, it } from 'vitest';
import fixture from '../../content/__fixtures__/auto-potion.json';
import { getUsableItem } from '../../content/usableItems';
import {
  AUTO_POTION_THRESHOLD,
  GRAND_POTION,
  PREFER_GRAND_BELOW,
  SMALL_POTION,
  choosePotion,
  potionHealFraction,
} from './autoPotion';

/**
 * Auto-potion, against what the shipped rule was measured drinking.
 *
 * The fixture's `hpRatio` is where a case *starts*; the rule sees a little
 * less, because the step deals the monster's damage first. The shift is pinned
 * below rather than waved at — it is small enough that no case in the table
 * crosses either comparison, which is what makes reproducing the table from
 * the starting ratio a fair test, and the exact boundary is settled by its own
 * probe rather than by this one.
 */

const held = (counts: Record<string, number>): Readonly<Record<string, number>> => counts;
/** The fixture's `held` comes back from JSON as a union of literal shapes. */
const heldIn = (counts: object): Readonly<Record<string, number>> => counts as Record<string, number>;

describe('when it drinks', () => {
  it('reproduces every case the shipped rule was measured on', () => {
    expect(
      fixture.cases
        // The switched-off case is the shell's gate rather than this rule's:
        // `choosePotion` is never called when the automation is not active.
        .filter(entry => entry.name !== 'below the threshold, switched off')
        .map(entry => ({
          name: entry.name,
          spent: choosePotion({
            hpRatio: entry.hpRatio,
            held: heldIn(entry.held),
            threshold: entry.name.includes('raised') ? 0.8 : fixture.thresholdPct,
          }),
        })),
    ).toEqual(
      fixture.cases
        .filter(entry => entry.name !== 'below the threshold, switched off')
        .map(entry => ({ name: entry.name, spent: entry.spent })),
    );
  });

  it('is measured at a step small enough not to move any case across a comparison', () => {
    /*
     * The probe started at 0.5 and the rule saw `boundary.ratio`, so this is
     * what one step of the monster's damage costs. Every case in the table
     * sits further than that from both the threshold and the pivot — except
     * the one at exactly the threshold, which is on the drinking side either
     * way — so reading the table off the starting ratios is sound.
     */
    const shift = 0.5 - fixture.boundary.ratio;
    expect(shift).toBeGreaterThan(0);
    const pivot = fixture.thresholdPct * fixture.grandPreferencePivot;
    const tooClose = fixture.cases.filter(
      entry =>
        (Math.abs(entry.hpRatio - fixture.thresholdPct) < shift && entry.hpRatio !== fixture.thresholdPct) ||
        Math.abs(entry.hpRatio - pivot) < shift,
    );
    expect(tooClose.map(entry => entry.name)).toEqual([]);
  });

  it('drinks at exactly the threshold', () => {
    // Inclusive, which the probe settled and the cases could not.
    expect(choosePotion({ hpRatio: AUTO_POTION_THRESHOLD, held: held({ small_potion: 1 }) })).toBe(SMALL_POTION);
    expect(choosePotion({ hpRatio: AUTO_POTION_THRESHOLD + 1e-9, held: held({ small_potion: 1 }) })).toBeNull();
  });

  it('defaults to the shipped threshold and pivot', () => {
    expect(AUTO_POTION_THRESHOLD).toBe(fixture.thresholdPct);
    expect(PREFER_GRAND_BELOW).toBe(fixture.grandPreferencePivot);
  });

  it('honours a threshold the player raised', () => {
    const at60 = { hpRatio: 0.6, held: held({ small_potion: 1, grand_potion: 1 }) };
    expect(choosePotion(at60)).toBeNull();
    expect(choosePotion({ ...at60, threshold: 0.8 })).toBe(SMALL_POTION);
  });

  it('answers null for an empty bag rather than naming an item nobody has', () => {
    expect(choosePotion({ hpRatio: 0.1, held: held({}) })).toBeNull();
    expect(choosePotion({ hpRatio: 0.1, held: held({ small_potion: 0, grand_potion: 0 }) })).toBeNull();
    // And for an unrelated bag, which is what a player holding only scrolls has.
    expect(choosePotion({ hpRatio: 0.1, held: held({ exp_scroll: 9 }) })).toBeNull();
  });
});

describe('which one it reaches for', () => {
  const both = held({ small_potion: 9, grand_potion: 9 });
  const pivot = AUTO_POTION_THRESHOLD * PREFER_GRAND_BELOW;

  it('saves the grand one until below the pivot, which is not the threshold', () => {
    /*
     * Two comparisons against one ratio. A port that read the threshold in
     * both places would spend a grand on the first sip, every time — and would
     * pass every test above.
     */
    expect(choosePotion({ hpRatio: pivot + 1e-9, held: both })).toBe(SMALL_POTION);
    expect(choosePotion({ hpRatio: pivot, held: both })).toBe(GRAND_POTION);
  });

  it('takes its second choice rather than nothing', () => {
    expect(choosePotion({ hpRatio: 0.05, held: held({ small_potion: 1 }) })).toBe(SMALL_POTION);
    expect(choosePotion({ hpRatio: 0.3, held: held({ grand_potion: 1 }) })).toBe(GRAND_POTION);
  });
});

describe('what it restores', () => {
  it('is the share the catalogue promises', () => {
    for (const potion of fixture.potions) {
      expect(potionHealFraction(potion.id)).toBe(potion.value);
      expect(getUsableItem(potion.id)!.effect).toBe('heal_team_percent');
    }
  });

  it('restores nothing for an item that does not heal, or does not exist', () => {
    // A guard rather than a throw: the choice and the heal are two lookups,
    // and a catalogue that retired an item between them should cost a press
    // rather than a frame.
    expect(potionHealFraction('exp_scroll')).toBe(0);
    expect(potionHealFraction('not_an_item')).toBe(0);
  });
});
