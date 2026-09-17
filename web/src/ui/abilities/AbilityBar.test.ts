import { describe, expect, it } from 'vitest';
import { UNIQUE_SKILL_TYPES } from '../../content/heroSkills';
import { HERO_ACTIVE_ARCHETYPES } from '../../engine/combat/heroActives';
import type { AbilityView } from '../../engine/combat/HeroActiveClock';
import { ARCHETYPE_HINT, ARCHETYPE_NAME, UNIQUE_HINT, UNIQUE_NAME } from '../copy/abilities';
import { pressable } from './AbilityBar';

/**
 * The ability bar's decisions, which are two: who gets a button, and what the
 * button says. There is no React testing stack here — see the note on
 * `EquipmentSurface.test.ts` — so both live in functions and tables.
 */

const ability = (uid: string, over: Partial<AbilityView> = {}): AbilityView => ({
  uid,
  archetype: 'battle_chant',
  uniqueType: null,
  fielded: true,
  ready: true,
  remainingMs: 0,
  cooldownMs: 9_000,
  progress: 1,
  ...over,
});

describe('who gets a button', () => {
  it('draws the fielded and leaves the bench out', () => {
    /*
     * A benched hero keeps their ability and cannot use it, so a button for
     * them would be permanently dead — and `HeroActiveClock` refuses the press
     * anyway. Two ways of saying no, one of them silent, is worse than one.
     */
    const shown = pressable([ability('in'), ability('out', { fielded: false, ready: false }), ability('also-in')]);
    expect(shown.map(entry => entry.uid)).toEqual(['in', 'also-in']);
  });

  it('keeps a fielded hero who is merely on cooldown', () => {
    // Cooling is the bar's main job to show. Dropping them would make the row
    // change width every few seconds, which is the one thing a row of buttons
    // must not do.
    expect(pressable([ability('cooling', { ready: false, remainingMs: 4_000, progress: 0.5 })])).toHaveLength(1);
  });
});

describe('what the button says', () => {
  it('names every archetype and every unique skill', () => {
    /*
     * Typed as `Record<…, string>`, so a *missing* key is a type error — but
     * an empty one is not, and neither is a table that has drifted from the
     * content list it claims to cover. A hero whose skill had no copy would
     * render the word `undefined` on a button.
     */
    for (const archetype of HERO_ACTIVE_ARCHETYPES) {
      expect(ARCHETYPE_NAME[archetype], archetype).toBeTruthy();
      expect(ARCHETYPE_HINT[archetype], archetype).toBeTruthy();
    }
    for (const type of UNIQUE_SKILL_TYPES) {
      expect(UNIQUE_NAME[type], type).toBeTruthy();
      expect(UNIQUE_HINT[type], type).toBeTruthy();
    }
    expect(Object.keys(UNIQUE_NAME).sort()).toEqual([...UNIQUE_SKILL_TYPES].sort());
    expect(Object.keys(ARCHETYPE_NAME).sort()).toEqual([...HERO_ACTIVE_ARCHETYPES].sort());
  });

  it('keeps the names short enough for a phone', () => {
    // The bar is six buttons across 62 pixels each. A long name does not wrap
    // there, it clips — and a clipped skill name is worse than a short one.
    for (const name of [...Object.values(ARCHETYPE_NAME), ...Object.values(UNIQUE_NAME)]) {
      expect(name.length, name).toBeLessThanOrEqual(16);
    }
  });
});
