import { describe, expect, it } from 'vitest';
import type { AutomationId } from '../../content/automation';
import { AUTOMATION_KEY, loadAutomation, parseAutomation, saveAutomation, toggleAutomation } from './automation';
import type { PreferenceStore } from './store';

function memoryStore(seed: Record<string, string> = {}): PreferenceStore {
  const data = new Map(Object.entries(seed));
  return { read: key => data.get(key) ?? null, write: (key, value) => void data.set(key, value) };
}

const ALL: ReadonlySet<AutomationId> = new Set<AutomationId>(['burst', 'summon', 'tempo']);

describe('the automation preference', () => {
  it('keeps only ids the game still has', () => {
    expect(parseAutomation(['burst', 'teleport', 'summon'])).toEqual(['burst', 'summon']);
  });

  it('collapses duplicates', () => {
    expect(parseAutomation(['burst', 'burst'])).toEqual(['burst']);
  });

  it('refuses anything that is not a list of strings', () => {
    for (const raw of [null, undefined, 7, 'burst', {}, [1], [null], [{}]]) {
      expect(parseAutomation(raw)).toEqual([]);
    }
  });

  it('drops anything no longer earned', () => {
    // Switched on, then prestiged past the signal that earned it. Keeping the
    // benefit silently would be a reward nobody could see they still had.
    const store = memoryStore({ [AUTOMATION_KEY]: '["burst","summon"]' });
    expect(loadAutomation(store, new Set<AutomationId>(['burst']))).toEqual(['burst']);
    expect(loadAutomation(store, new Set())).toEqual([]);
  });

  it('survives a store that throws on either end', () => {
    const hostile: PreferenceStore = {
      read: () => {
        throw new DOMException('denied');
      },
      write: () => {
        throw new DOMException('quota');
      },
    };
    expect(loadAutomation(hostile, ALL)).toEqual([]);
    expect(() => saveAutomation(hostile, ['burst'])).not.toThrow();
  });

  it('round-trips through a store', () => {
    const store = memoryStore();
    saveAutomation(store, ['burst']);
    expect(loadAutomation(store, ALL)).toEqual(['burst']);
  });

  it('toggles on and off without mutating what it was given', () => {
    const before: AutomationId[] = ['burst'];
    expect(toggleAutomation(before, 'summon')).toEqual(['burst', 'summon']);
    expect(toggleAutomation(before, 'burst')).toEqual([]);
    expect(before).toEqual(['burst']);
  });

  it('starts with everything off', () => {
    // Nothing is on until the player says so, which is the point.
    expect(loadAutomation(memoryStore(), ALL)).toEqual([]);
  });
});
