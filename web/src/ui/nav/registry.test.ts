import { describe, expect, it } from 'vitest';
import { emptySnapshot } from '../../engine/types';
import {
  GROUP_ORDER,
  SHELF_SLOTS,
  groupDestinations,
  registryProblems,
  shelfLayout,
  visibleDestinations,
} from './destinations';
import { DEFAULT_PINNED, REBIRTH_VISIBLE_FROM_WAVE, REGISTRY } from './registry';

const at = (wave: number) => ({ ...emptySnapshot(), wave });

describe('destination registry', () => {
  it('holds every invariant the registry helpers check', () => {
    expect(registryProblems(REGISTRY)).toEqual([]);
  });

  it('files everything into one of the four groups, and uses all four', () => {
    // A group with nothing in it means the filing was wrong, not that the
    // group is spare — these four are the whole taxonomy.
    const used = new Set(REGISTRY.map(destination => destination.group));
    expect([...used].sort()).toEqual([...GROUP_ORDER].sort());
  });

  it('does not make Stats a destination', () => {
    // REVAMP: Stats becomes tooltips on the numbers it describes, where a
    // player is already looking, rather than a place to navigate to.
    expect(REGISTRY.some(destination => /^stats$/i.test(destination.id))).toBe(false);
    expect(REGISTRY.some(destination => /^stats$/i.test(destination.label))).toBe(false);
  });

  it('has no Battle destination, because the battle is the screen', () => {
    expect(REGISTRY.some(destination => /battle/i.test(destination.id))).toBe(false);
  });

  it('collapses Achievements to a single ledger', () => {
    // Five sub-tabs in the shipped game; one surface here.
    const achievements = REGISTRY.filter(destination => /achievement/i.test(destination.id));
    expect(achievements).toHaveLength(1);
    expect(achievements[0].archetype).toBe('ledger');
  });

  it('hides Rebirth until it is reachable, and shows it after', () => {
    const early = visibleDestinations(REGISTRY, at(1)).map(d => d.id);
    const later = visibleDestinations(REGISTRY, at(REBIRTH_VISIBLE_FROM_WAVE)).map(d => d.id);
    expect(early).not.toContain('rebirth');
    expect(later).toContain('rebirth');
  });

  it('fills the shelf even when the pinned preference is unusable', () => {
    // An unknown id, an unavailable one, and a duplicate: the shelf is never
    // short, because a short shelf is a navigation dead end.
    for (const pinned of [[], ['nonsense'], ['rebirth'], ['roster', 'roster', 'roster']]) {
      const layout = shelfLayout(REGISTRY, at(1), pinned);
      expect(layout.pinned, pinned.join()).toHaveLength(SHELF_SLOTS);
      expect(new Set(layout.pinned.map(d => d.id)).size, pinned.join()).toBe(SHELF_SLOTS);
    }
  });

  it('honours the default pins on a fresh save', () => {
    const layout = shelfLayout(REGISTRY, at(1), DEFAULT_PINNED);
    expect(layout.pinned.map(d => d.id)).toEqual([...DEFAULT_PINNED]);
  });

  it('reaches every destination from the shelf plus More', () => {
    // The whole claim of the shelf: nothing is unreachable, however many
    // destinations exist.
    const snapshot = at(REBIRTH_VISIBLE_FROM_WAVE);
    const layout = shelfLayout(REGISTRY, snapshot, DEFAULT_PINNED);
    const reachable = new Set([...layout.pinned, ...layout.overflow].map(d => d.id));
    for (const destination of visibleDestinations(REGISTRY, snapshot)) {
      expect(reachable.has(destination.id), destination.id).toBe(true);
    }
  });

  it('keeps the shelf a fixed cost as the game grows', () => {
    // Doubling the registry must not widen the shelf by one slot.
    const doubled = [...REGISTRY, ...REGISTRY.map(d => ({ ...d, id: `${d.id}-2` }))];
    expect(shelfLayout(doubled, at(1), DEFAULT_PINNED).pinned).toHaveLength(SHELF_SLOTS);
  });

  it('groups in rail order with nothing orphaned', () => {
    const sections = groupDestinations(visibleDestinations(REGISTRY, at(1)));
    expect(sections.map(section => section.group)).toEqual([...GROUP_ORDER]);
    const filed = sections.flatMap(section => section.entries).length;
    expect(filed).toBe(visibleDestinations(REGISTRY, at(1)).length);
  });
});
