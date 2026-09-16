import { describe, expect, it } from 'vitest';
import { REGISTRY } from '../nav/registry';
import { SURFACES, surfaceFor, unbuiltDestinations } from './registry';

const IDS = new Set(REGISTRY.map(destination => destination.id));

describe('surface registry', () => {
  it('never names a destination that does not exist', () => {
    // A surface filed against a renamed or removed destination is a file
    // nothing renders, and nothing else would ever say so.
    for (const id of Object.keys(SURFACES)) {
      expect(IDS.has(id), `no destination "${id}"`).toBe(true);
    }
  });

  it('hands back the surface a built destination asks for', () => {
    expect(surfaceFor('character')).toBeDefined();
    expect(surfaceFor('roster')).toBeDefined();
    expect(surfaceFor('campaign')).toBeDefined();
  });

  it('admits when a destination has no surface yet', () => {
    // Undefined rather than a stub, so the host decides what an unbuilt
    // destination looks like in one place instead of each surface faking it.
    expect(surfaceFor('nothing-of-the-sort')).toBeUndefined();
  });

  it('counts what is left, and the count is real', () => {
    const unbuilt = unbuiltDestinations();
    expect(unbuilt.length).toBe(REGISTRY.length - Object.keys(SURFACES).length);
    for (const id of unbuilt) {
      expect(surfaceFor(id)).toBeUndefined();
      expect(IDS.has(id)).toBe(true);
    }
  });

  it('has actually built some of them', () => {
    // Guards the guard: every assertion above is satisfied by an empty
    // registry, so this is the one that notices if the wiring is dropped.
    expect(Object.keys(SURFACES).length).toBeGreaterThanOrEqual(5);
    expect(unbuiltDestinations().length).toBeLessThan(REGISTRY.length);
  });
});
