import { describe, expect, it } from 'vitest';
import fixture from '../combat/__fixtures__/kill-rewards.json';
import { dropsEquipment, equipmentDropChance, usableDropChance } from './drops';

/**
 * The drop chances, against the curves the fixture measured by bisection off
 * the shipped reducer.
 */

describe('how often a kill drops', () => {
  /*
   * Compared to a millionth rather than exactly, and the reason is the
   * measurement: the fixture finds each chance by bisecting the roll and
   * rounds the answer to 1e-6, so `0.1 + 41 * 0.003` — which is
   * 0.10300000000000001 as a double — cannot equal the recorded 0.103. The
   * precision is the bisection's, not a tolerance chosen to make this pass.
   */
  const MEASURED_PRECISION = 6;

  it('reproduces every measured equipment chance', () => {
    for (const row of fixture.drops.chances) {
      expect(equipmentDropChance(row.wave, row.boss), `wave ${row.wave}`).toBeCloseTo(
        row.equipment,
        MEASURED_PRECISION,
      );
    }
  });

  it('reproduces every measured usable chance', () => {
    // Recorded even though usable items are not ported: the curve is what the
    // port will need, and measuring it now costs nothing.
    for (const row of fixture.drops.chances) {
      expect(usableDropChance(row.wave, row.boss), `wave ${row.wave}`).toBeCloseTo(row.usable, MEASURED_PRECISION);
    }
  });

  it('adds the boss term, and then stops at the ceiling', () => {
    expect(equipmentDropChance(40, true)).toBeGreaterThan(equipmentDropChance(40, false));
    expect(equipmentDropChance(100, true)).toBe(0.4);
    expect(equipmentDropChance(10_000, true)).toBe(equipmentDropChance(100, true));
    expect(usableDropChance(10_000, true)).toBe(usableDropChance(200, true));
  });

  it('floors a nonsense wave at one rather than going below the base', () => {
    expect(equipmentDropChance(0, false)).toBe(equipmentDropChance(1, false));
    expect(equipmentDropChance(-50, false)).toBe(equipmentDropChance(1, false));
  });
});

describe('the roll', () => {
  it('drops on a roll landing exactly on the chance', () => {
    /*
     * `<=`, as shipped, and the only place in this game that reads that way.
     * The fixture found the same boundary by bisection from the other side.
     */
    const chance = equipmentDropChance(41, false);
    expect(dropsEquipment(41, false, () => chance)).toBe(true);
    expect(dropsEquipment(41, false, () => chance + Number.EPSILON * 8)).toBe(false);
  });

  it('agrees with the scripted kills the fixture recorded', () => {
    // 0.24 is above wave 41's chance and below wave 40's, so the same dice
    // drop on the boss and miss beside it.
    expect(dropsEquipment(40, true, () => 0.24)).toBe(true);
    expect(dropsEquipment(41, false, () => 0.24)).toBe(false);
  });

  it('draws exactly once, whatever it decides', () => {
    // The chance roll is unconditional; a port that skipped it on, say, a
    // full bag would leave a seeded generator one value ahead.
    let draws = 0;
    const counted = () => {
      draws += 1;
      return 0.99;
    };
    dropsEquipment(1, false, counted);
    dropsEquipment(400, true, counted);
    expect(draws).toBe(2);
  });
});
