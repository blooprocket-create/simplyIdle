import { describe, expect, it } from 'vitest';
import { MONSTER_POOL } from '../../content/monsters';
import { monsterAppearance } from './cast';
import { EMPTY_MANIFEST, resolveFirst, type ModelManifest } from './manifest';

describe('monster appearance', () => {
  it('asks for a monster by who it is, not which wave it turned up on', () => {
    // `spawnEnemy` ids an encounter `w1`, `w2`, `w3`… That is fine for the
    // simulation, which only tells one encounter from the next, and wrong for
    // a pack: it would want one authored Goblin per wave, forever.
    expect(monsterAppearance('Goblin').modelKeys).toEqual(['monster/goblin']);
    expect(monsterAppearance('Goblin').modelKeys).toEqual(monsterAppearance('Goblin').modelKeys);
    for (const { modelKeys } of MONSTER_POOL.map(monster => monsterAppearance(monster.name))) {
      for (const key of modelKeys) expect(key).not.toMatch(/^monster\/w\d+$/);
    }
  });

  it('lets a boss settle for the monster it is a crowned version of', () => {
    expect(monsterAppearance('Orc King').modelKeys).toEqual(['monster/orc-king', 'monster/orc']);
    const pack: ModelManifest = { root: '/m', models: { 'monster/orc': { file: 'orc.glb' } } };
    // A pack that never authored the king still draws an Orc, not a capsule.
    expect(resolveFirst(pack, monsterAppearance('Orc King').modelKeys)).toMatchObject({ kind: 'asset' });
    // And a monster that is not a boss asks for one thing only.
    expect(monsterAppearance('Orc').modelKeys).toHaveLength(1);
  });

  it('crowns a boss and leaves a plain monster alone', () => {
    expect(monsterAppearance('Orc King').silhouette.headgear).toBe('crown');
    expect(monsterAppearance('Orc').silhouette.headgear).not.toBe('crown');
    // The crowned one is the same creature, only bigger.
    expect(monsterAppearance('Orc King').silhouette.build).toBe(monsterAppearance('Orc').silhouette.build);
    expect(monsterAppearance('Orc King').silhouette.height).toBeGreaterThan(monsterAppearance('Orc').silhouette.height);
  });

  it('produces a drawable key for every monster the game can spawn', () => {
    for (const monster of MONSTER_POOL) {
      const { modelKeys, silhouette } = monsterAppearance(monster.name);
      expect(modelKeys.length).toBeGreaterThan(0);
      expect(modelKeys[0]).toMatch(/^monster\/[a-z0-9-]+$/);
      // No pack at all is still a silhouette rather than nothing.
      expect(resolveFirst(EMPTY_MANIFEST, modelKeys).kind).toBe('placeholder');
      expect(silhouette.height).toBeGreaterThan(0.5);
    }
  });
});
