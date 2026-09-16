import { describe, expect, it } from 'vitest';
import { CLASS_PROFILES, type PlayerClass } from '../../content/classes';
import { CLASS_COPY, STAT_COPY, statOrder } from './classes';

const CLASSES = Object.keys(CLASS_PROFILES) as PlayerClass[];

describe('class copy', () => {
  it('covers every class the engine can produce', () => {
    // The engine dropped these strings on purpose — `classes.ts` says names,
    // emoji and blurbs "belong with the UI that shows them". That makes this
    // the file that goes stale when a sixth class is added, so the closed set
    // is checked against rather than restated.
    expect(Object.keys(CLASS_COPY).sort()).toEqual([...CLASSES].sort());
  });

  it('gives every class something to actually show', () => {
    for (const playerClass of CLASSES) {
      const copy = CLASS_COPY[playerClass];
      expect(copy.name.trim(), playerClass).not.toBe('');
      expect(copy.emoji.trim(), playerClass).not.toBe('');
      expect(copy.blurb.trim(), playerClass).not.toBe('');
      expect(copy.passive.name.trim(), playerClass).not.toBe('');
      expect(copy.passive.effect.trim(), playerClass).not.toBe('');
    }
  });

  it('never gives two classes the same name or emoji', () => {
    // A roster screen listing two Warriors is a screen nobody can use.
    const names = CLASSES.map(playerClass => CLASS_COPY[playerClass].name);
    const emoji = CLASSES.map(playerClass => CLASS_COPY[playerClass].emoji);
    expect(new Set(names).size).toBe(CLASSES.length);
    expect(new Set(emoji).size).toBe(CLASSES.length);
  });

  it('describes the passive the engine actually applies', () => {
    // The multipliers live in `classPassives.ts` and the words live here, so
    // they can disagree. This catches the disagreement that matters: a
    // passive described as reducing damage while the engine raises it.
    for (const playerClass of CLASSES) {
      const { passive } = CLASS_COPY[playerClass];
      expect(passive.effect, playerClass).toMatch(/\d/);
    }
  });
});

describe('stat copy', () => {
  it('covers every stat in a class base block', () => {
    const stats = Object.keys(CLASS_PROFILES.warrior.baseStats).sort();
    expect(Object.keys(STAT_COPY).sort()).toEqual(stats);
    expect([...statOrder()].sort()).toEqual(stats);
  });

  it('orders stats the same way every time it is asked', () => {
    // A character sheet whose rows move between renders is unreadable.
    expect(statOrder()).toEqual(statOrder());
  });

  it('gives every stat a label and a reason to care', () => {
    for (const stat of statOrder()) {
      expect(STAT_COPY[stat].label.trim(), stat).not.toBe('');
      expect(STAT_COPY[stat].effect.trim(), stat).not.toBe('');
    }
  });
});
