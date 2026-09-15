import { describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT, type SimulationSnapshot } from '../../engine/types';
import {
  SHELF_SLOTS,
  groupDestinations,
  mergeBadges,
  registryProblems,
  shelfLayout,
  type Destination,
} from './destinations';

const snapshot: SimulationSnapshot = EMPTY_SNAPSHOT;

function make(id: string, overrides: Partial<Destination> = {}): Destination {
  return { id, group: 'power', label: id, archetype: 'ledger', ...overrides };
}

describe('shelf layout', () => {
  it('fills every slot from registry order when nothing is pinned', () => {
    const registry = [make('a'), make('b'), make('c'), make('d')];

    const { pinned, overflow } = shelfLayout(registry, snapshot, []);

    expect(pinned.map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(overflow.map((d) => d.id)).toEqual(['d']);
  });

  it('honours pins and backfills the rest', () => {
    const registry = [make('a'), make('b'), make('c'), make('d')];

    const { pinned, overflow } = shelfLayout(registry, snapshot, ['d']);

    expect(pinned.map((d) => d.id)).toEqual(['d', 'a', 'b']);
    expect(overflow.map((d) => d.id)).toEqual(['c']);
  });

  it('ignores pins that are unknown or unavailable', () => {
    const registry = [make('a'), make('b'), make('c'), make('hidden', { available: () => false })];

    const { pinned } = shelfLayout(registry, snapshot, ['ghost', 'hidden', 'c']);

    expect(pinned.map((d) => d.id)).toEqual(['c', 'a', 'b']);
  });

  it('never overfills the shelf however many are pinned', () => {
    const registry = [make('a'), make('b'), make('c'), make('d'), make('e')];

    const { pinned } = shelfLayout(registry, snapshot, ['a', 'b', 'c', 'd', 'e']);

    expect(pinned).toHaveLength(SHELF_SLOTS);
  });

  it('surfaces badges from behind More so nothing is lost back there', () => {
    const registry = [
      make('a'),
      make('b'),
      make('c'),
      make('d', { badge: () => 2 }),
      make('e', { badge: () => 3 }),
    ];

    const { overflowBadge } = shelfLayout(registry, snapshot, []);

    expect(overflowBadge).toBe(5);
  });
});

describe('badges', () => {
  it('adds numbers and drops a dot when anything counted', () => {
    expect(mergeBadges([1, 'dot', 2])).toBe(3);
  });

  it('keeps a bare dot when nothing counted', () => {
    expect(mergeBadges(['dot', null])).toBe('dot');
  });

  it('is null when there is nothing to say', () => {
    expect(mergeBadges([null, null])).toBeNull();
  });
});

describe('grouping', () => {
  it('renders groups in fixed order and drops empty ones', () => {
    const registry = [
      make('roster', { group: 'companion' }),
      make('gear', { group: 'power' }),
      make('codex', { group: 'record' }),
    ];

    expect(groupDestinations(registry).map((section) => section.group)).toEqual([
      'power',
      'companion',
      'record',
    ]);
  });
});

describe('registry invariants', () => {
  it('accepts a well-formed registry', () => {
    expect(registryProblems([make('a'), make('b'), make('c')])).toEqual([]);
  });

  it('reports duplicate ids', () => {
    expect(registryProblems([make('a'), make('a'), make('c')])).toContain('duplicate id "a"');
  });

  it('reports a registry too small to fill the shelf', () => {
    expect(registryProblems([make('a')])).toContain(
      `registry has 1 destinations, fewer than the ${SHELF_SLOTS} shelf slots`,
    );
  });
});
