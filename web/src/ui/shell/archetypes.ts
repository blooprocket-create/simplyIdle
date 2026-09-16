import type { Archetype } from '../nav/destinations';

/**
 * What each archetype does with the screen.
 *
 * The rule the UI architecture test enforces is that a surface describes data
 * and an archetype owns geometry — including scrolling, which is why two-axis
 * scrolling is impossible here rather than merely discouraged. A surface that
 * could scroll itself would be a surface that could be nested inside another
 * scroller, and that is the bug.
 *
 * This is the decision table for that, kept apart from the components so the
 * closed set can be checked without rendering anything.
 */

export interface ArchetypeLayout {
  /** Fills the screen, or sits over the fight as a panel. */
  fill: 'sheet' | 'panel';
  /** Which way content runs. Exactly one axis ever scrolls. */
  scroll: 'block' | 'none';
  /** A moment interrupts; everything else lets the fight stay visible. */
  dims: boolean;
}

export const ARCHETYPE_LAYOUT: Record<Archetype, ArchetypeLayout> = {
  // A few big numbers and their controls. No list, so nothing to scroll.
  dashboard: { fill: 'panel', scroll: 'none', dims: false },
  // A long list of comparable things: the only archetype that really runs on.
  ledger: { fill: 'sheet', scroll: 'block', dims: false },
  // A shaped view of history. Sized to the screen, never scrolled.
  graph: { fill: 'panel', scroll: 'none', dims: false },
  // One thing, at length.
  detail: { fill: 'sheet', scroll: 'block', dims: false },
  // A summon reveal, a rebirth. It takes the screen and it is the point.
  moment: { fill: 'sheet', scroll: 'none', dims: true },
};

/** Archetypes that let the player keep watching the fight behind them. */
export function keepsFightVisible(archetype: Archetype): boolean {
  return !ARCHETYPE_LAYOUT[archetype].dims;
}
