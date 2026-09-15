import type { SimulationSnapshot } from '../../engine/types';

/**
 * Every surface in the game is one of five archetypes. Adding a sixth is a
 * deliberate design decision, not something a feature does on its way past.
 */
export const ARCHETYPES = ['dashboard', 'ledger', 'graph', 'detail', 'moment'] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/**
 * Rail section order. Groups render in this order and never re-sort.
 *
 * The old game had eight bottom tabs, seventeen sub-tabs and fifteen modals —
 * roughly fifty destinations reached by navigating away from the fight. These
 * four groups are where all of them go instead.
 */
export const GROUP_ORDER = ['power', 'companion', 'world', 'record'] as const;
export type DestinationGroup = (typeof GROUP_ORDER)[number];

export type Badge = number | 'dot';

export interface Destination {
  id: string;
  group: DestinationGroup;
  label: string;
  archetype: Archetype;
  /** Attention marker. Evaluated per publish; keep it cheap. */
  badge?: (snapshot: SimulationSnapshot) => Badge | null;
  /** Hides a destination until the engine says it exists (e.g. Rebirth). */
  available?: (snapshot: SimulationSnapshot) => boolean;
}

/**
 * The shelf holds this many destinations plus one More slot, forever. It is a
 * fixed cost no matter how large the game gets; growth goes to the rail.
 *
 * This is the whole answer to "a million menus": the menus are not deleted,
 * they are filed, and the cost of navigation stops growing with the game.
 */
export const SHELF_SLOTS = 3;

export interface GroupedDestinations {
  group: DestinationGroup;
  entries: Destination[];
}

export interface ShelfLayout {
  pinned: Destination[];
  overflow: Destination[];
  /** Badges from everything behind More, so nothing gets lost back there. */
  overflowBadge: Badge | null;
}

export function isAvailable(destination: Destination, snapshot: SimulationSnapshot): boolean {
  return destination.available?.(snapshot) ?? true;
}

export function badgeFor(destination: Destination, snapshot: SimulationSnapshot): Badge | null {
  return destination.badge?.(snapshot) ?? null;
}

export function visibleDestinations(registry: readonly Destination[], snapshot: SimulationSnapshot): Destination[] {
  return registry.filter(destination => isAvailable(destination, snapshot));
}

/** Registry order is preserved inside each group; empty groups are dropped. */
export function groupDestinations(destinations: readonly Destination[]): GroupedDestinations[] {
  return GROUP_ORDER.map(group => ({
    group,
    entries: destinations.filter(destination => destination.group === group),
  })).filter(section => section.entries.length > 0);
}

/** Numeric badges add up; a bare dot only survives if nothing counted. */
export function mergeBadges(badges: readonly (Badge | null)[]): Badge | null {
  let total = 0;
  let sawDot = false;
  for (const badge of badges) {
    if (badge === null) continue;
    if (badge === 'dot') sawDot = true;
    else total += badge;
  }
  if (total > 0) return total;
  return sawDot ? 'dot' : null;
}

/**
 * Splits the visible registry into the shelf's fixed slots and the overflow
 * behind More. `pinnedIds` is a user preference; unknown or unavailable ids
 * fall back to registry order so the shelf is never short.
 */
export function shelfLayout(
  registry: readonly Destination[],
  snapshot: SimulationSnapshot,
  pinnedIds: readonly string[],
): ShelfLayout {
  const visible = visibleDestinations(registry, snapshot);
  const byId = new Map(visible.map(destination => [destination.id, destination]));

  const pinned: Destination[] = [];
  for (const id of pinnedIds) {
    const destination = byId.get(id);
    if (destination && !pinned.includes(destination)) pinned.push(destination);
    if (pinned.length === SHELF_SLOTS) break;
  }
  for (const destination of visible) {
    if (pinned.length === SHELF_SLOTS) break;
    if (!pinned.includes(destination)) pinned.push(destination);
  }

  const overflow = visible.filter(destination => !pinned.includes(destination));
  return {
    pinned,
    overflow,
    overflowBadge: mergeBadges(overflow.map(destination => badgeFor(destination, snapshot))),
  };
}

/** Invariants the registry must hold. */
export function registryProblems(registry: readonly Destination[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const destination of registry) {
    if (seen.has(destination.id)) problems.push(`duplicate id "${destination.id}"`);
    seen.add(destination.id);
    if (!ARCHETYPES.includes(destination.archetype)) {
      problems.push(`"${destination.id}" has unknown archetype "${destination.archetype}"`);
    }
    if (!GROUP_ORDER.includes(destination.group)) {
      problems.push(`"${destination.id}" has unknown group "${destination.group}"`);
    }
  }
  if (registry.length > 0 && registry.length < SHELF_SLOTS) {
    problems.push(`registry has ${registry.length} destinations, fewer than the ${SHELF_SLOTS} shelf slots`);
  }
  return problems;
}
