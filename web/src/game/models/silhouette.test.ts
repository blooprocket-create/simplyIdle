import { describe, expect, it } from 'vitest';
import { CLASS_PROFILES, type PlayerClass } from '../../content/classes';
import {
  BUILD_MASS,
  CLASS_SILHOUETTE,
  HERO_SILHOUETTE,
  MONSTER_NAMES,
  baseMonsterName,
  heroesOnClassDefault,
  silhouetteKey,
  monsterSilhouette,
  silhouetteFor,
} from './silhouette';

const CLASSES = Object.keys(CLASS_PROFILES) as PlayerClass[];

describe('silhouettes', () => {
  it('covers every class the player can pick', () => {
    // The player's own model comes from their class, so a missing entry is a
    // player with nothing to draw rather than a hero with a generic stand-in.
    for (const playerClass of CLASSES) {
      expect(CLASS_SILHOUETTE[playerClass], playerClass).toBeDefined();
      expect(CLASS_SILHOUETTE[playerClass].height, playerClass).toBeGreaterThan(1);
    }
  });

  it('gives each class a different outline', () => {
    // If two classes read the same at gameplay distance the whole exercise is
    // pointless — the portraits are being used precisely so a player can tell
    // them apart on the line at a glance.
    const shapes = CLASSES.map(playerClass => {
      const s = CLASS_SILHOUETTE[playerClass];
      return `${s.build}/${s.headgear}/${s.weapon}/${s.cloak}`;
    });
    expect(new Set(shapes).size).toBe(CLASSES.length);
  });

  it('falls back to the class for a hero nobody has authored', () => {
    const fallback = silhouetteFor('h999', 'mage');
    expect(fallback).toEqual(CLASS_SILHOUETTE.mage);
  });

  it('lets a hero override only what differs', () => {
    const kael = silhouetteFor('h1', 'warrior');
    expect(kael.weapon).toBe('swordAndShield');
    expect(kael.height).toBe(HERO_SILHOUETTE.h1.height);
    // Unstated fields still come from the class rather than from nothing.
    expect(kael.palette).toEqual(CLASS_SILHOUETTE.warrior.palette);
    expect(kael.cloak).toBe(CLASS_SILHOUETTE.warrior.cloak);
  });

  it('never returns a partial silhouette', () => {
    for (const playerClass of CLASSES) {
      for (const id of ['h1', 'h2', 'unknown']) {
        const s = silhouetteFor(id, playerClass);
        expect(s.build, id).toBeDefined();
        expect(s.headgear, id).toBeDefined();
        expect(s.weapon, id).toBeDefined();
        expect(s.palette.primary, id).toHaveLength(3);
        expect(BUILD_MASS[s.build], id).toBeDefined();
      }
    }
  });

  it('names the heroes still wearing their class', () => {
    // 65 arrive a few at a time; the useful question is which are outstanding.
    expect(heroesOnClassDefault(['h1', 'h2', 'h3'])).toEqual(['h3']);
    expect(heroesOnClassDefault([])).toEqual([]);
  });

  it('has a shape for every monster the pool can produce', () => {
    for (const name of MONSTER_NAMES) {
      const s = monsterSilhouette(name);
      expect(s.height, name).toBeGreaterThan(0.5);
      expect(BUILD_MASS[s.build], name).toBeDefined();
    }
  });

  it('crowns a boss without needing to be told it is one', () => {
    // `getMonsterForWave` names a boss "<Name> King". Deriving the crown from
    // that keeps one source of truth for what a boss is.
    const orc = monsterSilhouette('Orc');
    const king = monsterSilhouette('Orc King');
    expect(orc.headgear).not.toBe('crown');
    expect(king.headgear).toBe('crown');
    expect(king.height).toBeGreaterThan(orc.height);
    expect(king.build).toBe(orc.build);
  });

  it('gives different-looking things different keys', () => {
    // The actor pool compares these to decide whether what it already built
    // is still what is being asked for. A key that collided would leave one
    // slot showing a monster two waves old.
    const seen = new Set(MONSTER_NAMES.map(name => silhouetteKey(monsterSilhouette(name))));
    expect(seen.size).toBe(MONSTER_NAMES.length);
    expect(silhouetteKey(monsterSilhouette('Orc'))).not.toBe(silhouetteKey(monsterSilhouette('Orc King')));
    for (const playerClass of CLASSES) {
      expect(silhouetteKey(CLASS_SILHOUETTE[playerClass])).toBeTruthy();
    }
  });

  it('gives the same silhouette the same key every time', () => {
    expect(silhouetteKey(monsterSilhouette('Troll'))).toBe(silhouetteKey(monsterSilhouette('Troll')));
  });

  it('reads a boss name as a crowned version of the monster it comes from', () => {
    // One place spells out the `"<Name> King"` convention; the crown on the
    // silhouette and the model key a boss falls back to both read it here.
    expect(baseMonsterName('Orc King')).toBe('Orc');
    expect(baseMonsterName('Ancient Dragon King')).toBe('Ancient Dragon');
    // A monster that is not a boss is its own base.
    expect(baseMonsterName('Orc')).toBe('Orc');
    // And "King" alone is a name, not a suffix — there is no monster left.
    expect(baseMonsterName('King')).toBe('King');
  });

  it('still produces something for a monster it has never heard of', () => {
    const unknown = monsterSilhouette('Grue');
    expect(unknown.height).toBeGreaterThan(0.5);
    expect(monsterSilhouette('Grue King').headgear).toBe('crown');
  });
});
