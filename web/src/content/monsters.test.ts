import { describe, expect, it } from 'vitest';
import { MONSTER_POOL, firstWaveFor, getMonsterForWave, isBossWave, poolEntryForWave } from './monsters';

describe('which monster a wave draws on', () => {
  it('crowns every tenth wave and no other', () => {
    for (const wave of [10, 20, 100, 1_000]) expect(isBossWave(wave), `wave ${wave}`).toBe(true);
    for (const wave of [1, 9, 11, 19, 99, 101]) expect(isBossWave(wave), `wave ${wave}`).toBe(false);
  });

  it('names a boss after the entry its own cycle reached', () => {
    // The two cycles run at different rates — one per wave, one per ten — so
    // the entry behind a boss is not the one the ordinary cycle would give.
    expect(getMonsterForWave(10).name).toBe(`${MONSTER_POOL[0].name} King`);
    expect(getMonsterForWave(20).name).toBe(`${MONSTER_POOL[1].name} King`);
    expect(poolEntryForWave(10)).toEqual(MONSTER_POOL[0]);
    expect(poolEntryForWave(20)).toEqual(MONSTER_POOL[1]);
  });

  it('always agrees with the name it decorates', () => {
    for (let wave = 1; wave <= 200; wave += 1) {
      const shown = getMonsterForWave(wave).name;
      const base = poolEntryForWave(wave).name;
      expect(shown === base || shown === `${base} King`, `wave ${wave}: ${shown} vs ${base}`).toBe(true);
    }
  });

  it('reaches every entry in the pool within a hundred waves', () => {
    /*
     * The bug this exists for. Ancient Dragon is last in the pool, so its
     * ordinary slot is wave 10, 20, 30 — every one of which is a boss wave.
     * It never spawns uncrowned, so a bestiary matching on the name shown
     * left it permanently marked unseen.
     */
    const met = new Set<string>();
    for (let wave = 1; wave <= MONSTER_POOL.length * 10; wave += 1) met.add(poolEntryForWave(wave).name);
    for (const monster of MONSTER_POOL) expect(met.has(monster.name), monster.name).toBe(true);
  });

  it('says the first wave each entry actually appears on', () => {
    for (const monster of MONSTER_POOL) {
      const wave = firstWaveFor(monster.name);
      expect(wave, monster.name).not.toBeNull();
      if (wave === null) continue;
      expect(poolEntryForWave(wave).name).toBe(monster.name);
      // And nothing earlier does.
      for (let earlier = 1; earlier < wave; earlier += 1) {
        expect(poolEntryForWave(earlier).name).not.toBe(monster.name);
      }
    }
  });

  it('does not claim the last monster arrives before it does', () => {
    // Its index would suggest wave 10; wave 10 is the first boss, which is
    // the *first* monster crowned. The real answer is its first boss slot.
    const last = MONSTER_POOL[MONSTER_POOL.length - 1];
    const wave = firstWaveFor(last.name);
    expect(wave).not.toBe(MONSTER_POOL.length);
    expect(wave).toBe(MONSTER_POOL.length * 10);
  });

  it('admits a name that is not in the pool', () => {
    expect(firstWaveFor('Grue')).toBeNull();
  });
});
