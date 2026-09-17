import { describe, expect, it } from 'vitest';
import { HERO_POOL } from '../content/heroes';
import { equipmentTemplatesById } from '../content/equipment';
import type { PreferenceStore } from '../ui/prefs/store';
import { migrateSave } from '../engine/save/migrate';
import { heroTemplatesById } from '../content/heroes';
import { loadSave, writeSave, SAVE_KEY } from './saveStore';

function fakeStore(seed?: string) {
  const cells = new Map<string, string>();
  if (seed !== undefined) cells.set(SAVE_KEY, seed);
  const store: PreferenceStore = {
    read: key => cells.get(key) ?? null,
    write: (key, value) => void cells.set(key, value),
  };
  return { store, cells };
}

const NOW = 1_700_000_000_000;
const [FIRST] = HERO_POOL;

describe('loading a save', () => {
  it('says there is none rather than inventing an empty one', () => {
    /*
     * Null and "a save with nothing in it" are different answers and the
     * shell branches on them: nothing stored is a new player who needs a
     * starting team, while a stored save with an empty roster is a player
     * who has one and emptied it. Inventing heroes for the second would be
     * inventing progress.
     */
    expect(loadSave(fakeStore().store, NOW)).toBeNull();
    expect(loadSave(fakeStore('').store, NOW)).toBeNull();
  });

  it('says there is none for text that is not a save at all', () => {
    expect(loadSave(fakeStore('{{{ not json').store, NOW)).toBeNull();
  });

  it('migrates a stored payload rather than trusting its shape', () => {
    // The point of going through `migrateSave`: it is built to read the
    // shipped v2 saves, whose shape this is, so the cutover inherits every
    // repair the migration already makes instead of a second reader.
    const { store } = fakeStore(
      JSON.stringify({
        playerName: 'Wanderer',
        heroRoster: [{ id: FIRST.id, uid: 'a', rarity: 'rare', level: 12, rank: 2 }],
        activeTeamHeroIds: ['a'],
      }),
    );

    const save = loadSave(store, NOW);
    expect(save?.identity.name).toBe('Wanderer');
    expect(save?.roster.heroes.map(hero => hero.uid)).toEqual(['a']);
    expect(save?.roster.activeUids).toEqual(['a']);
  });

  it('bounds a payload that is a valid object but not a save', () => {
    // `migrateSave` takes anything; that is its contract. An object with no
    // save in it becomes an empty save, not null and not a throw.
    const save = loadSave(fakeStore('{"unrelated":true}').store, NOW);
    expect(save).not.toBeNull();
    expect(save?.roster.heroes).toEqual([]);
  });

  it('reads back what it writes, which is what the writer was waiting for', () => {
    /*
     * The trap this file used to contain, now closed. `migrateSave` reads the
     * *v2* payload shape — `heroRoster` — because reading the shipped saves is
     * what it was written for. A `SaveV3` keeps its roster at `roster.heroes`,
     * so migrating one returns an *empty* save rather than itself.
     *
     * That is still true, and asserted below, because it is the reason there
     * was no writer. What changed is that `loadSave` no longer goes straight
     * to the migration: `readSave` picks the reader from the payload, and the
     * v3 reader bounds a stored v3 payload as hard as the migration bounds a
     * v2 one. `engine/save/v3.test.ts` holds it to that.
     */
    const fromV2 = migrateSave(
      { heroRoster: [{ id: FIRST.id, uid: 'a', rarity: 'epic', level: 5, rank: 1 }] },
      { nowMs: NOW, content: { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() } },
    );
    expect(fromV2.roster.heroes).toHaveLength(1);

    // The old reader alone still empties it. Kept as the standing reason the
    // dispatcher exists rather than deleted along with the bug.
    expect(
      migrateSave(JSON.parse(JSON.stringify(fromV2)), {
        nowMs: NOW,
        content: { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() },
      }).roster.heroes,
    ).toEqual([]);

    const { store } = fakeStore();
    expect(writeSave(store, fromV2)).toBe(true);
    expect(loadSave(store, NOW)).toEqual(fromV2);
  });

  it('reports a store that will not keep the save', () => {
    /*
     * A private window, or blocked site data. `browserStore().write` swallows
     * the throw on purpose — a player who cannot save should still get a game
     * — so the only way a caller learns their progress is going nowhere is
     * this return value. Silently returning true would make the first honest
     * failure a player's discovery when they close the tab.
     */
    const hostile: PreferenceStore = { read: () => null, write: () => {} };
    const save = migrateSave(
      {},
      { nowMs: NOW, content: { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() } },
    );
    expect(writeSave(hostile, save)).toBe(false);
  });

  it('keeps nothing when the browser will not store anything', () => {
    // A private window, or blocked site data. The player gets the starting
    // team every time, which is a worse game but still a game.
    const hostile: PreferenceStore = { read: () => null, write: () => {} };
    expect(loadSave(hostile, NOW)).toBeNull();
  });
});
