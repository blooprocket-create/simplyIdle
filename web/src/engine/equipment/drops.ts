/**
 * What a kill drops.
 *
 * Two chances, both four-term and both capped, measured by bisection in
 * `__tests__/killRewardFixture.test.ts` rather than transcribed — the first
 * version of that fixture computed them from a copy of the expression and
 * agreed with itself while the shipped source was changed underneath it.
 *
 * The comparison is `<=`, which is worth its own note because every other
 * drop and refusal in this game reads `<`. The only roll that tells the two
 * apart lands exactly on the chance, which a player will never do and a
 * seeded test does on purpose.
 */

export const EQUIPMENT_DROP_BASE = 0.1;
export const EQUIPMENT_DROP_PER_WAVE = 0.003;
export const EQUIPMENT_DROP_BOSS_BONUS = 0.12;
export const EQUIPMENT_DROP_CEILING = 0.4;

export const USABLE_DROP_BASE = 0.12;
export const USABLE_DROP_PER_WAVE = 0.0015;
export const USABLE_DROP_BOSS_BONUS = 0.08;
export const USABLE_DROP_CEILING = 0.32;

export function equipmentDropChance(wave: number, isBoss: boolean): number {
  const safeWave = Math.max(1, Math.floor(wave));
  return Math.min(
    EQUIPMENT_DROP_CEILING,
    EQUIPMENT_DROP_BASE + safeWave * EQUIPMENT_DROP_PER_WAVE + (isBoss ? EQUIPMENT_DROP_BOSS_BONUS : 0),
  );
}

export function usableDropChance(wave: number, isBoss: boolean): number {
  const safeWave = Math.max(1, Math.floor(wave));
  return Math.min(
    USABLE_DROP_CEILING,
    USABLE_DROP_BASE + safeWave * USABLE_DROP_PER_WAVE + (isBoss ? USABLE_DROP_BOSS_BONUS : 0),
  );
}

/** Whether this kill won a drop. `<=`, as shipped — see the note above. */
export function dropsEquipment(wave: number, isBoss: boolean, random: () => number): boolean {
  return random() <= equipmentDropChance(wave, isBoss);
}
