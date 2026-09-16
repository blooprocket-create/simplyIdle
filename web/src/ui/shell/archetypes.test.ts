import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../nav/destinations';
import { ARCHETYPE_LAYOUT, keepsFightVisible } from './archetypes';

describe('archetype layouts', () => {
  it('describes every archetype and nothing else', () => {
    expect(Object.keys(ARCHETYPE_LAYOUT).sort()).toEqual([...ARCHETYPES].sort());
  });

  it('never scrolls more than one axis', () => {
    // Two-axis scrolling is the thing this whole split exists to make
    // impossible: a surface describes data, an archetype owns geometry.
    for (const archetype of ARCHETYPES) {
      expect(['block', 'none'], archetype).toContain(ARCHETYPE_LAYOUT[archetype].scroll);
    }
  });

  it('only lets a moment take the screen from the fight', () => {
    // Surfaces open over a running battle and the battle keeps running. A
    // summon reveal or a rebirth is allowed to be the point; a gear list is
    // not.
    const dimming = ARCHETYPES.filter(archetype => !keepsFightVisible(archetype));
    expect(dimming).toEqual(['moment']);
  });

  it('gives the scrolling archetypes the room to scroll in', () => {
    // A panel that scrolls would be a scroller inside the shell's own
    // geometry, which is how nested scrolling starts.
    for (const archetype of ARCHETYPES) {
      const layout = ARCHETYPE_LAYOUT[archetype];
      if (layout.scroll === 'block') expect(layout.fill, archetype).toBe('sheet');
    }
  });
});
