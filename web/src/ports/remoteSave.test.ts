import { describe, expect, it } from 'vitest';
import { equipmentTemplatesById } from '../content/equipment';
import type { PlayerClass } from '../content/classes';
import { migrateSave } from '../engine/save/migrate';
import type { SaveContent, SaveV3 } from '../engine/save/schema';
import { readSave } from '../engine/save/v3';
import fixture from '../engine/save/__fixtures__/v2-saves.json';
import {
  decodeFirestoreValue,
  encodeFirestoreValue,
  readChunk,
  remoteSavePort,
  sanitizeSaveSlot,
  splitIntoChunks,
  type SaveDocStore,
} from './remoteSave';

/**
 * The account's save, over a fake document store.
 *
 * Every rule about where a save lives and how it is written is decided in
 * `remoteSave.ts` and exercised here. What a real Firestore binding adds is the
 * network, so none of the below needs one — and testing the format against a
 * live project would test the network instead of the format.
 */

const CONTENT: SaveContent = {
  equipmentById: equipmentTemplatesById(),
  heroesById: new Map(
    fixture.heroTemplates.map(template => [
      template.id,
      { heroClass: template.heroClass as PlayerClass, baseTeamBoost: template.baseTeamBoost },
    ]),
  ),
};

const NOW = fixture.nowMs;
const UID = 'account-1';

/** The shipped chunk map, trimmed to the keys these cases actually move. */
const CHUNKS: Record<string, readonly string[]> = {
  identity: ['saveVersion', 'playerName', 'playerClass', 'characterCreated'],
  economy: ['gold', 'totalGold', 'diamonds', 'level', 'exp', 'totalExp'],
  combat: ['wave', 'highestWaveReached', 'totalKills'],
  roster: ['heroRoster', 'activeTeamHeroIds', 'teamLoadouts', 'heroFormationByUid'],
};

function fakeStore(uid: string | null = UID) {
  const docs = new Map<string, Record<string, unknown>>();
  const reads: string[] = [];
  const store: SaveDocStore = {
    uid: () => uid,
    read: async path => {
      reads.push(path.join('/'));
      return docs.get(path.join('/')) ?? null;
    },
    write: async (path, data) => void docs.set(path.join('/'), data),
  };
  return { store, docs, reads };
}

function veteran(): SaveV3 {
  const entry = fixture.cases.find(candidate => candidate.name === 'veteran');
  if (!entry) throw new Error('no veteran fixture');
  return migrateSave(entry.payload, { nowMs: NOW, content: CONTENT });
}

const port = (store: SaveDocStore) => remoteSavePort(store, { chunkKeys: CHUNKS, now: () => NOW });

describe('finding the right document', () => {
  it('addresses the slot the shipped game addresses', () => {
    // A slot that sanitises differently here points at a *different document*,
    // which is an account that cannot find its own save. Ported character for
    // character from the shipped sanitiser, and checked on its edges.
    expect(sanitizeSaveSlot('default')).toBe('default');
    expect(sanitizeSaveSlot('  main  ')).toBe('main');
    expect(sanitizeSaveSlot('')).toBe('default');
    expect(sanitizeSaveSlot('a/b.c#d$e[f]g')).toBe('a_b_c_d_e_f_g');
    // Firestore reserves `__x__`, so those are rewritten rather than rejected.
    expect(sanitizeSaveSlot('__proto__')).toBe('slotproto');
    expect(sanitizeSaveSlot('x'.repeat(200))).toHaveLength(96);
  });

  it('reads nothing at all when nobody is signed in', async () => {
    // Not an error. There is no account, so there is no save, and the shell
    // falls back to the local one — which is what makes the rewrite playable
    // without a login in the first place.
    const { store, reads } = fakeStore(null);
    expect(await port(store).load('default')).toBeNull();
    expect(reads).toEqual([]);
  });

  it('refuses to write when nobody is signed in', async () => {
    // The opposite answer from `load`, on purpose. Silently discarding a write
    // is how a player plays for an hour and loses it; there is nowhere to put
    // this save and the caller has to hear so.
    const { store } = fakeStore(null);
    await expect(port(store).save('default', veteran())).rejects.toThrow(/no account/);
  });
});

describe('reading the formats the shipped game has written', () => {
  it('reassembles a chunked save', async () => {
    const { store, docs } = fakeStore();
    const base = `users/${UID}/saveSlots/default`;
    docs.set(base, { revision: 4, updatedAt: NOW, chunkKeys: ['identity', 'economy'] });
    docs.set(`${base}/chunks/identity`, { playerName: 'Wanderer', characterCreated: true });
    docs.set(`${base}/chunks/economy`, { gold: 120, level: 7 });

    expect(await port(store).load('default')).toEqual({
      playerName: 'Wanderer',
      characterCreated: true,
      gold: 120,
      level: 7,
    });
  });

  it('reads a chunk stored as a JSON string', async () => {
    // The shipped writer keeps `roster`, `equipment`, `settings` and `_extra`
    // as one string, because native fields would blow Firestore's index limit.
    const { store, docs } = fakeStore();
    const base = `users/${UID}/saveSlots/default`;
    docs.set(base, { revision: 1, chunkKeys: ['roster'] });
    docs.set(`${base}/chunks/roster`, { payloadJson: JSON.stringify({ heroRoster: [{ id: 'h1', uid: 'a' }] }) });

    expect(await port(store).load('default')).toEqual({ heroRoster: [{ id: 'h1', uid: 'a' }] });
  });

  it('reads the v1 inline string and the pre-v1 nested fields', async () => {
    const { store, docs } = fakeStore();
    docs.set(`users/${UID}/saveSlots/v1`, { revision: 1, payloadJson: JSON.stringify({ gold: 9 }) });
    docs.set(`users/${UID}/saveSlots/old`, { revision: 1, payload: { gold: 9 } });

    expect(await port(store).load('v1')).toEqual({ gold: 9 });
    expect(await port(store).load('old')).toEqual({ gold: 9 });
  });

  it('tells an empty slot apart from a missing one', async () => {
    /*
     * Null is "no such save", and the shell reads it as a new player who needs
     * a starting team. A header with no payload is a slot that exists and holds
     * nothing — a player who emptied their roster — and inventing heroes for
     * them would be inventing progress. `saveStore.ts` draws the same line.
     */
    const { store, docs } = fakeStore();
    docs.set(`users/${UID}/saveSlots/empty`, { revision: 2, updatedAt: NOW });

    expect(await port(store).load('missing')).toBeNull();
    expect(await port(store).load('empty')).toEqual({});
  });

  it('comes back with a hole rather than not at all when a chunk is damaged', async () => {
    /*
     * A reader that refuses a damaged account is worse than one that returns it
     * short: both fill the gap with defaults, and only one gives the player
     * their heroes back. The corrupt chunk here is the *economy* one, so the
     * roster survives it.
     */
    const { store, docs } = fakeStore();
    const base = `users/${UID}/saveSlots/default`;
    docs.set(base, { revision: 1, chunkKeys: ['identity', 'economy', 'gone'] });
    docs.set(`${base}/chunks/identity`, { playerName: 'Wanderer' });
    docs.set(`${base}/chunks/economy`, { payloadJson: '{{{ not json' });

    expect(await port(store).load('default')).toEqual({ playerName: 'Wanderer' });
  });
});

describe('the nested array marker', () => {
  it('survives a round trip through the encoding Firestore forces', () => {
    /*
     * Firestore forbids an array inside an array at any depth, so the shipped
     * writer wraps the inner one in a marker object. `teamLoadouts` is exactly
     * that shape — three teams, each a list of uids — so getting this wrong
     * loses every saved loadout and nothing else, which is the kind of bug that
     * reaches a player before it reaches a test.
     */
    const loadouts = [['a', 'b'], [], ['c']];
    const encoded = encodeFirestoreValue({ teamLoadouts: loadouts }) as Record<string, unknown>;
    expect(decodeFirestoreValue(encoded)).toEqual({ teamLoadouts: loadouts });

    // And the wrapping really happened, rather than the arrays passing through
    // as-is and the assertion above passing for the wrong reason.
    const inner = (encoded.teamLoadouts as unknown[])[0] as Record<string, unknown>;
    expect(Array.isArray(encoded.teamLoadouts)).toBe(true);
    expect(Array.isArray(inner)).toBe(false);
    expect(inner).toHaveProperty('simplyIdleNestedArrayV1');
  });

  it('still reads the marker under its older name', () => {
    // Saves written either side of the rename are both still out there.
    expect(decodeFirestoreValue({ __simplyIdle_nested_array_v1__: [1, 2] })).toEqual([1, 2]);
  });

  it('leaves an ordinary single-key object alone', () => {
    // The decoder looks for a lone key whose value is an array, which a real
    // save can also have. It only unwraps the marker names.
    expect(decodeFirestoreValue({ heroRoster: [{ id: 'h1' }] })).toEqual({ heroRoster: [{ id: 'h1' }] });
    expect(readChunk({ heroRoster: [{ id: 'h1' }] })).toEqual({ heroRoster: [{ id: 'h1' }] });
  });
});

describe('writing a save back', () => {
  it('writes v2, so the shipped game can still read the account', async () => {
    /*
     * The whole reason `legacyPayload.ts` exists. Both apps read this document
     * and the shipped reader is total, so a `SaveV3` stored here would read as
     * a valid save with nothing in it rather than as an error.
     */
    const { store, docs } = fakeStore();
    const save = veteran();
    await port(store).save('default', save);

    const identity = docs.get(`users/${UID}/saveSlots/default/chunks/identity`);
    expect(identity?.saveVersion).toBe(2);
    expect(identity?.playerName).toBe(save.identity.name);
    expect(docs.get(`users/${UID}/saveSlots/default`)?.chunkKeys).toContain('identity');
  });

  it('reads back the save it wrote, in both apps', async () => {
    /*
     * The end-to-end law. A save that goes up and comes down is the same save —
     * and it has to be the same save to *either* reader, which is the half that
     * is easy to lose.
     *
     * `readSave` alone is not enough to prove it: it accepts v3 as happily as
     * v2, so writing a `SaveV3` straight into the document passes that
     * assertion while leaving the shipped game looking at a payload it reads as
     * an empty account. `migrateSave` is the shipped reader's rules, so
     * asserting on it too is what makes this an interop test rather than a test
     * of our own writer against our own reader.
     */
    const { store } = fakeStore();
    const save = veteran();
    await port(store).save('default', save);

    const stored = await port(store).load('default');
    expect(readSave(stored, { nowMs: NOW, content: CONTENT })).toEqual(save);
    expect(migrateSave(stored, { nowMs: NOW, content: CONTENT })).toEqual(save);
  });

  it('puts every key somewhere, including ones no chunk claims', async () => {
    /*
     * `_extra` is the catch-all. Without it a field that the chunk map has not
     * heard of is silently dropped on write — which is every field a later
     * phase adds, and the failure only shows up as progress quietly not saving.
     */
    const { store, docs } = fakeStore();
    await port(store).save('default', veteran());

    const header = docs.get(`users/${UID}/saveSlots/default`);
    expect(header?.chunkKeys).toContain('_extra');

    const extra = docs.get(`users/${UID}/saveSlots/default/chunks/_extra`);
    expect(typeof extra?.payloadJson).toBe('string');
    expect(JSON.parse(extra?.payloadJson as string)).toHaveProperty('lastActiveAt');
  });

  it('splits a payload the way the shipped writer splits it', () => {
    const split = splitIntoChunks({ gold: 1, playerName: 'x', unheard_of: true }, CHUNKS);
    expect(split.economy).toEqual({ gold: 1 });
    expect(split.identity).toEqual({ playerName: 'x' });
    expect(split._extra).toEqual({ unheard_of: true });
    // A chunk whose keys are all absent is still written, empty, because the
    // header names it and a reader follows the header.
    expect(split.combat).toEqual({});
  });

  it('advances the revision rather than resetting it', async () => {
    // The revision is what a conflict check would compare. Starting over at 1
    // on every write would make every save look like the first one.
    const { store, docs } = fakeStore();
    docs.set(`users/${UID}/saveSlots/default`, { revision: 41, updatedAt: 0 });

    await port(store).save('default', veteran());
    expect(docs.get(`users/${UID}/saveSlots/default`)?.revision).toBe(42);
    expect(docs.get(`users/${UID}/saveSlots/default`)?.updatedAt).toBe(NOW);

    await port(store).save('default', veteran());
    expect(docs.get(`users/${UID}/saveSlots/default`)?.revision).toBe(43);
  });

  it('writes the chunks before the header that names them', async () => {
    /*
     * Order matters because a reader follows `chunkKeys` off the header. A
     * header naming a chunk that is not there yet is a save that reads back
     * short; a chunk written under a header that does not name it is merely
     * unreferenced. Both orders can be interrupted, and only one loses data
     * when it is.
     *
     * Checked by reading the store *as the header lands* rather than by
     * inspecting call order, so it stays true if the writes are reordered into
     * a batch later.
     */
    const seen: string[] = [];
    const docs = new Map<string, Record<string, unknown>>();
    const store: SaveDocStore = {
      uid: () => UID,
      read: async path => docs.get(path.join('/')) ?? null,
      write: async (path, data) => {
        seen.push(path.join('/'));
        docs.set(path.join('/'), data);
      },
    };

    await remoteSavePort(store, { chunkKeys: CHUNKS, now: () => NOW }).save('default', veteran());

    const headerAt = seen.indexOf(`users/${UID}/saveSlots/default`);
    expect(headerAt).toBeGreaterThan(-1);
    const named = docs.get(`users/${UID}/saveSlots/default`)?.chunkKeys as string[];
    for (const name of named) {
      expect({
        name,
        writtenBeforeHeader: seen.indexOf(`users/${UID}/saveSlots/default/chunks/${name}`) < headerAt,
      }).toEqual({ name, writtenBeforeHeader: true });
    }
  });
});
