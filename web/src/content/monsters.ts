/**
 * The enemy roster. Authored data only.
 *
 * Phase 2 gives each of these a `modelKey` so the renderer can swap a
 * primitive for a GLB without the engine noticing.
 */
export interface Monster {
  name: string;
  emoji: string;
}

export const MONSTER_POOL: readonly Monster[] = [
  { name: 'Slime', emoji: '🟢' },
  { name: 'Goblin', emoji: '👺' },
  { name: 'Skeleton', emoji: '💀' },
  { name: 'Orc', emoji: '👹' },
  { name: 'Troll', emoji: '🧌' },
  { name: 'Witch', emoji: '🧙' },
  { name: 'Vampire', emoji: '🧛' },
  { name: 'Werewolf', emoji: '🐺' },
  { name: 'Demon', emoji: '😈' },
  { name: 'Ancient Dragon', emoji: '🐲' },
];

/** Every tenth wave is a boss: the same roster, crowned. */
export function isBossWave(wave: number): boolean {
  return wave % 10 === 0;
}

/**
 * Which entry of the pool a wave draws on, crowned or not.
 *
 * The two cycles run at different rates — one per wave for ordinary fights,
 * one per ten for bosses — so the entry behind a boss is not the entry the
 * ordinary cycle would have produced. A bestiary that wants to know "have I
 * met this monster" has to ask this rather than read the name off
 * `getMonsterForWave`, which decorates a boss's name and so never matches a
 * plain one.
 *
 * That is not hypothetical. **Ancient Dragon is last in the pool, so its
 * ordinary slot is wave 10, 20, 30 — every one of which is a boss wave.** It
 * never spawns uncrowned at all, and a bestiary matching on the decorated
 * name left it permanently marked unseen.
 */
export function poolEntryForWave(wave: number): Monster {
  const index = isBossWave(wave) ? Math.floor(wave / 10 - 1) : wave - 1;
  return MONSTER_POOL[((index % MONSTER_POOL.length) + MONSTER_POOL.length) % MONSTER_POOL.length];
}

export function getMonsterForWave(wave: number): Monster {
  const base = poolEntryForWave(wave);
  return isBossWave(wave) ? { name: `${base.name} King`, emoji: '👑' } : base;
}

/**
 * The first wave that draws on a given pool entry, in either form.
 *
 * Scanned rather than derived: with two cycles interleaving, the closed form
 * is a congruence nobody reading it could check, and the pool is ten long.
 */
export function firstWaveFor(name: string): number | null {
  const limit = MONSTER_POOL.length * 10;
  for (let wave = 1; wave <= limit; wave += 1) {
    if (poolEntryForWave(wave).name === name) return wave;
  }
  return null;
}
