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

export function getMonsterForWave(wave: number): Monster {
  if (isBossWave(wave)) {
    const base = MONSTER_POOL[Math.floor(wave / 10 - 1) % MONSTER_POOL.length];
    return { name: `${base.name} King`, emoji: '👑' };
  }
  return MONSTER_POOL[(wave - 1) % MONSTER_POOL.length];
}
