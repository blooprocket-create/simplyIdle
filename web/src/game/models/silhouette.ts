import type { PlayerClass } from '../../content/classes';
import { MONSTER_POOL } from '../../content/monsters';

/**
 * What a placeholder should look like, before anything draws it.
 *
 * REVAMP's Phase 2 is specific about this: *"a placeholder is a small
 * assembly of primitives whose outline reads as that hero at gameplay
 * distance — bulk, stance, headgear and the weapon shape — not a single
 * mesh"*. Kael Ironheart is armoured bulk with pauldrons and a kite shield;
 * Lunara Frostweave is a hooded cloak and a staff on a slight frame. A
 * capsule for both throws away identity that is already drawn and paid for.
 *
 * This is the description. The assembly lives in `actors/`, because a
 * description is a decision and decisions stay testable without a GL context.
 *
 * Authoring all sixty-five is data entry that can happen a few at a time:
 * anything without an entry falls back to its class, which already reads as
 * the right shape of person. `heroesOnClassDefault` says which are still
 * waiting.
 */

export type Build = 'slight' | 'lean' | 'average' | 'broad' | 'hulking';
export type Headgear = 'none' | 'hood' | 'helm' | 'horned' | 'crown';
export type Weapon =
  | 'none'
  | 'fists'
  | 'sword'
  | 'swordAndShield'
  | 'greatsword'
  | 'axe'
  | 'staff'
  | 'bow'
  | 'spear'
  | 'claws';

export interface Palette {
  /** Body or armour. */
  primary: [number, number, number];
  /** Cloth, trim, secondary mass. */
  secondary: [number, number, number];
  /** Weapon metal, glow, the thing that catches the eye. */
  accent: [number, number, number];
}

export interface Silhouette {
  build: Build;
  /** Heel to crown, in metres. */
  height: number;
  headgear: Headgear;
  weapon: Weapon;
  /** A hanging mass behind the shoulders. The strongest silhouette cue there is. */
  cloak: boolean;
  palette: Palette;
}

/** Shoulder width and torso depth per build, as multiples of a base body. */
export const BUILD_MASS: Record<Build, { width: number; depth: number }> = {
  slight: { width: 0.82, depth: 0.86 },
  lean: { width: 0.92, depth: 0.92 },
  average: { width: 1, depth: 1 },
  broad: { width: 1.18, depth: 1.1 },
  hulking: { width: 1.36, depth: 1.22 },
};

const STEEL: Palette = {
  primary: [0.42, 0.46, 0.52],
  secondary: [0.2, 0.26, 0.3],
  accent: [0.74, 0.78, 0.84],
};

/**
 * The player's own look, and the fallback for any hero without an entry.
 * A class already implies bulk, headgear and a weapon; starting from it means
 * an unauthored hero still reads as the right shape of person rather than as
 * a box.
 */
export const CLASS_SILHOUETTE: Record<PlayerClass, Silhouette> = {
  warrior: {
    build: 'broad',
    height: 1.85,
    headgear: 'helm',
    weapon: 'swordAndShield',
    cloak: false,
    palette: STEEL,
  },
  berserker: {
    build: 'hulking',
    height: 1.92,
    headgear: 'horned',
    weapon: 'axe',
    cloak: false,
    palette: { primary: [0.44, 0.24, 0.18], secondary: [0.24, 0.14, 0.1], accent: [0.8, 0.5, 0.26] },
  },
  archer: {
    build: 'lean',
    height: 1.78,
    headgear: 'hood',
    weapon: 'bow',
    cloak: true,
    palette: { primary: [0.24, 0.36, 0.24], secondary: [0.14, 0.22, 0.16], accent: [0.68, 0.6, 0.36] },
  },
  mage: {
    build: 'slight',
    height: 1.74,
    headgear: 'hood',
    weapon: 'staff',
    cloak: true,
    palette: { primary: [0.26, 0.28, 0.46], secondary: [0.16, 0.18, 0.32], accent: [0.56, 0.72, 0.95] },
  },
  monk: {
    build: 'average',
    height: 1.8,
    headgear: 'none',
    weapon: 'fists',
    cloak: false,
    palette: { primary: [0.62, 0.48, 0.28], secondary: [0.38, 0.28, 0.16], accent: [0.86, 0.76, 0.5] },
  },
};

/**
 * Per-hero overrides, keyed by the id `src/heroPortraits.ts` already uses.
 * Only the fields that differ from the class need stating.
 */
export const HERO_SILHOUETTE: Record<string, Partial<Silhouette>> = {
  // Kael Ironheart: armoured bulk, pauldrons, kite shield.
  h1: { build: 'broad', height: 1.88, headgear: 'helm', weapon: 'swordAndShield' },
  // Lunara Frostweave: hooded cloak, staff, slight frame.
  h2: {
    build: 'slight',
    height: 1.72,
    headgear: 'hood',
    weapon: 'staff',
    cloak: true,
    palette: { primary: [0.3, 0.42, 0.58], secondary: [0.18, 0.26, 0.4], accent: [0.72, 0.88, 1] },
  },
};

export function silhouetteFor(heroId: string, heroClass: PlayerClass): Silhouette {
  return { ...CLASS_SILHOUETTE[heroClass], ...HERO_SILHOUETTE[heroId] };
}

/** Which heroes still look like their class rather than like themselves. */
export function heroesOnClassDefault(heroIds: readonly string[]): string[] {
  return heroIds.filter(id => !HERO_SILHOUETTE[id]);
}

const MONSTER_SILHOUETTE: Record<string, Partial<Silhouette>> = {
  Slime: { build: 'average', height: 1.1, headgear: 'none', weapon: 'none' },
  Goblin: { build: 'slight', height: 1.35, weapon: 'sword' },
  Skeleton: { build: 'slight', height: 1.78, weapon: 'sword' },
  Orc: { build: 'broad', height: 1.95, weapon: 'axe' },
  Troll: { build: 'hulking', height: 2.4, weapon: 'none', headgear: 'none' },
  Witch: { build: 'slight', height: 1.7, headgear: 'hood', weapon: 'staff', cloak: true },
  Vampire: { build: 'lean', height: 1.86, weapon: 'claws', cloak: true },
  Werewolf: { build: 'hulking', height: 2.1, weapon: 'claws' },
  Demon: { build: 'hulking', height: 2.3, headgear: 'horned', weapon: 'spear' },
  'Ancient Dragon': { build: 'hulking', height: 2.8, headgear: 'horned', weapon: 'claws' },
};

const MONSTER_BASE: Silhouette = {
  build: 'average',
  height: 1.8,
  headgear: 'none',
  weapon: 'claws',
  cloak: false,
  palette: { primary: [0.46, 0.26, 0.24], secondary: [0.26, 0.15, 0.14], accent: [0.8, 0.44, 0.3] },
};

/**
 * The monster a boss is a crowned version of, or the name unchanged.
 *
 * `getMonsterForWave` names a boss `"<Name> King"`. That convention is read in
 * two places — the crown on the silhouette and the model key a boss falls back
 * to — so it is spelled out once, here, rather than in both.
 */
export function baseMonsterName(name: string): string {
  return name.endsWith(BOSS_SUFFIX) ? name.slice(0, -BOSS_SUFFIX.length) : name;
}

const BOSS_SUFFIX = ' King';

/**
 * A monster's look. The crown is derived from the name rather than passed
 * separately — there is one source of truth for what a boss is and it is
 * already in `content`.
 */
export function monsterSilhouette(name: string): Silhouette {
  const base = baseMonsterName(name);
  const crowned = base !== name;
  const override = MONSTER_SILHOUETTE[base] ?? {};
  const silhouette = { ...MONSTER_BASE, ...override };
  if (!crowned) return silhouette;
  return { ...silhouette, headgear: 'crown', height: silhouette.height * 1.15 };
}

/**
 * A compact, stable identity for a silhouette.
 *
 * The actor pool needs to know whether the thing it already built is still
 * the thing being asked for. Comparing the object by reference says no every
 * frame; not comparing it at all says yes forever, which is how one slot kept
 * showing wave one's monster for the rest of the run.
 */
export function silhouetteKey(silhouette: Silhouette): string {
  return [
    silhouette.build,
    silhouette.height,
    silhouette.headgear,
    silhouette.weapon,
    silhouette.cloak ? 'cloak' : 'bare',
    silhouette.palette.primary.join(','),
    silhouette.palette.secondary.join(','),
    silhouette.palette.accent.join(','),
  ].join('|');
}

/** Every monster the pool can produce, for a coverage check. */
export const MONSTER_NAMES = MONSTER_POOL.map(monster => monster.name);
