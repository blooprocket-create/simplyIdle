import { describe, expect, it } from 'vitest';
import { SHELF_SLOTS } from '../nav/destinations';
import { DEFAULT_PINNED, REGISTRY } from '../nav/registry';
import { PINNED_KEY, loadPinned, parsePinned, savePinned, togglePin } from './pinned';
import type { PreferenceStore } from './store';

const KNOWN = new Set(REGISTRY.map(destination => destination.id));

/** A store that behaves; the hostile ones are built per-test. */
function memoryStore(seed: Record<string, string> = {}): PreferenceStore {
  const data = new Map(Object.entries(seed));
  return {
    read: key => data.get(key) ?? null,
    write: (key, value) => void data.set(key, value),
  };
}

describe('pinned preference', () => {
  it('keeps only ids the registry still has', () => {
    // A destination can be renamed or dropped between versions, and a save
    // from the old version outlives it. Dropping it silently is the whole
    // point: a stale preference should not blank a shelf slot.
    expect(parsePinned(['character', 'wardrobe', 'roster'], KNOWN)).toEqual(['character', 'roster']);
  });

  it('never returns more ids than there are slots', () => {
    const tooMany = REGISTRY.slice(0, SHELF_SLOTS + 3).map(destination => destination.id);
    expect(parsePinned(tooMany, KNOWN)).toHaveLength(SHELF_SLOTS);
  });

  it('collapses a duplicate rather than spending two slots on one thing', () => {
    expect(parsePinned(['roster', 'roster', 'campaign'], KNOWN)).toEqual(['roster', 'campaign']);
  });

  it('refuses anything that is not a list of strings', () => {
    // This is parsed from storage a user can edit and a browser can corrupt.
    for (const raw of [null, undefined, 42, 'roster', {}, { 0: 'roster' }, [1, 2], [null], [{}]]) {
      expect(parsePinned(raw, KNOWN)).toEqual([]);
    }
    // A mixed list keeps the strings it can use rather than failing whole.
    expect(parsePinned(['roster', 7], KNOWN)).toEqual(['roster']);
  });

  it('survives a store that throws on read', () => {
    // Safari in private mode, a blocked origin, a disabled cookie jar. None
    // of these should stop the game rendering a shelf.
    const hostile: PreferenceStore = {
      read: () => {
        throw new DOMException('denied');
      },
      write: () => {},
    };
    expect(loadPinned(hostile, KNOWN)).toEqual([...DEFAULT_PINNED]);
  });

  it('survives a store that throws on write', () => {
    const full: PreferenceStore = {
      read: () => null,
      write: () => {
        throw new DOMException('quota');
      },
    };
    expect(() => savePinned(full, ['roster'])).not.toThrow();
  });

  it('falls back to the default when nothing is stored', () => {
    expect(loadPinned(memoryStore(), KNOWN)).toEqual([...DEFAULT_PINNED]);
  });

  it('falls back to the default when what is stored is unusable', () => {
    expect(loadPinned(memoryStore({ [PINNED_KEY]: 'not json' }), KNOWN)).toEqual([...DEFAULT_PINNED]);
    expect(loadPinned(memoryStore({ [PINNED_KEY]: '["nothing","real"]' }), KNOWN)).toEqual([...DEFAULT_PINNED]);
  });

  it('round-trips through a store', () => {
    const store = memoryStore();
    savePinned(store, ['skills', 'party']);
    expect(loadPinned(store, KNOWN)).toEqual(['skills', 'party']);
  });

  it('keeps a deliberately short shelf short', () => {
    // Someone who pinned two things meant two. `shelfLayout` fills the rest
    // from registry order, so the preference does not have to be complete.
    const store = memoryStore();
    savePinned(store, ['skills']);
    expect(loadPinned(store, KNOWN)).toEqual(['skills']);
  });
});

describe('toggling a pin', () => {
  it('adds one that is not there', () => {
    expect(togglePin(['character'], 'roster')).toEqual(['character', 'roster']);
  });

  it('removes one that is', () => {
    expect(togglePin(['character', 'roster'], 'character')).toEqual(['roster']);
  });

  it('evicts the oldest pin rather than refusing a full shelf', () => {
    // Refusing would make the player unpin before they can pin, for no
    // reason they can see. The shelf is three slots; the fourth pin pushes
    // the first one off.
    const full = ['character', 'roster', 'campaign'];
    expect(togglePin(full, 'skills')).toEqual(['roster', 'campaign', 'skills']);
    expect(togglePin(full, 'skills')).toHaveLength(SHELF_SLOTS);
  });

  it('does not mutate what it was given', () => {
    const before = ['character', 'roster'];
    togglePin(before, 'skills');
    togglePin(before, 'character');
    expect(before).toEqual(['character', 'roster']);
  });

  it('is its own inverse for a shelf that has room', () => {
    expect(togglePin(togglePin(['character'], 'skills'), 'skills')).toEqual(['character']);
  });
});
