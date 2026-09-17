import { CLASS_PROFILES, type PlayerClass } from '../../content/classes';
import { getRankStatMultiplier, type Rarity } from '../../content/rarities';
import { getFormationMultipliers, type FormationHero } from '../combat/formation';
import { getClassMasteryLevel, getTacticsPowerMultiplier } from '../combat/progressionMultipliers';
import { getTeamSynergy } from '../combat/synergy';
import type { StatBlock } from '../save/schema';

/**
 * The player's character, and the team health it produces.
 *
 * Until this existed the rewrite had no character at all: `Simulation` took
 * `teamMaxHp` as an option and `demoRoster.ts` handed it a flat `2000` with a
 * note saying "nothing derives it yet". Everything downstream of that number
 * was unanchored — how long a team survives, which wave is the wall, where the
 * offline sawtooth turns over. The numbers here are measured against the
 * shipped game by `__fixtures__/character.json`, which was generated before
 * any of this was written.
 *
 * Two details are easy to get wrong by reading the shipped code too quickly.
 *
 * **Heroes contribute their *class* base vitality, not their template's.**
 * `computeStats` builds per-hero display stats from `getHeroStatProfile` when a
 * template exists and falls back to the class; `getTeamMaxHp` does no such
 * thing and always uses the class. Following the display path here would give
 * every hero a slightly different health contribution from the one the game
 * actually grants them.
 *
 * **The multipliers compose by multiplication, not addition.** Essence
 * survival, the rebirth path, formation, synergy, mastery and tactics are six
 * separate factors. Adding any pair of them stays within a few percent at low
 * levels and is wrong by a lot in the deep game, which is why the fixture
 * carries a scenario with every one of them switched on at once.
 *
 * Equipment is the one term deliberately missing. `derivedStats` in the
 * shipped game sums class base, allocated points and an equipment bonus; the
 * third is Phase 9. Every fixture scenario has no equipment, so the two halves
 * that exist are exact and the third is absent rather than approximated.
 */

/** Health per point of the player's own vitality, plus their flat base. */
const PLAYER_HP_PER_VITALITY = 10;
const PLAYER_VITALITY_BASE = 5;

/** The same pair for a hero, who is worth less per point but has many more. */
const HERO_HP_PER_VITALITY = 8;
const HERO_VITALITY_BASE = 3;

/** A hero's vitality grows this much per level, before rank and rebirth. */
const HERO_VITALITY_PER_LEVEL = 0.8;

/** And their spirit grows more slowly. Only team defence reads it. */
const HERO_SPIRIT_PER_LEVEL = 0.5;

export const META_SURVIVAL_PER_LEVEL = 0.05;
export const REBIRTH_SURVIVAL_PER_LEVEL = 0.07;

/** Mastery adds 2% of health every four levels, and stops at a quarter. */
export const MASTERY_HP_PER_STEP = 0.02;
export const MASTERY_HP_LEVELS_PER_STEP = 4;
export const MASTERY_HP_CAP = 0.25;

export const EMPTY_STATS: StatBlock = { strength: 0, vitality: 0, agility: 0, intelligence: 0, spirit: 0 };

export function addStats(a: StatBlock, b: StatBlock): StatBlock {
  return {
    strength: a.strength + b.strength,
    vitality: a.vitality + b.vitality,
    agility: a.agility + b.agility,
    intelligence: a.intelligence + b.intelligence,
    spirit: a.spirit + b.spirit,
  };
}

/**
 * The player's stats: what their class gives them plus what they have spent.
 *
 * `equipment` is an argument rather than an import so that Phase 9 adds a
 * caller rather than editing this function — and so that today's callers pass
 * nothing and get exactly the shipped answer for a character with no gear.
 */
export function derivedStats(
  playerClass: PlayerClass | null,
  alloc: StatBlock,
  equipment: StatBlock = EMPTY_STATS,
): StatBlock {
  // The shipped code defaults a null class to warrior rather than to zero, so
  // a save mid-character-creation reads as a warrior and not as a blank.
  const base = CLASS_PROFILES[playerClass ?? 'warrior'].baseStats;
  return addStats(addStats(base, alloc), equipment);
}

export function getMetaSurvivalMultiplier(metaSurvivalLevel: number): number {
  return 1 + Math.max(0, metaSurvivalLevel) * META_SURVIVAL_PER_LEVEL;
}

export function getRebirthSurvivalMultiplier(rebirthSurvivalPath: number): number {
  return 1 + Math.max(0, rebirthSurvivalPath) * REBIRTH_SURVIVAL_PER_LEVEL;
}

/**
 * Health from class mastery, which is the one multiplier here with a ceiling.
 *
 * A quarter, reached at mastery level 52. Past that, more mastery is worth
 * nothing to health — a cap a port drops silently, because the formula still
 * looks right and only the deep game runs away.
 */
export function getMasteryHpMultiplier(classMasteryXp: number): number {
  const level = getClassMasteryLevel(classMasteryXp);
  const steps = Math.floor(level / MASTERY_HP_LEVELS_PER_STEP);
  return 1 + Math.min(MASTERY_HP_CAP, steps * MASTERY_HP_PER_STEP);
}

/** A hero, as team health sees them. */
export interface HealthHero extends FormationHero {
  rarity: Rarity;
  level: number;
  rank: number;
  /** A rebirth stat multiplier, floored at 1 exactly as the shipped code does. */
  rebirthStatMult: number;
}

export interface TeamHealthInput {
  playerClass: PlayerClass | null;
  alloc: StatBlock;
  equipment?: StatBlock;
  /** Only the heroes actually fielded. Owning one is not fielding them. */
  activeHeroes: readonly HealthHero[];
  metaSurvivalLevel: number;
  rebirthSurvivalPath: number;
  classMasteryXp: number;
  tacticsFacilityLevel: number;
}

/** A single hero's vitality, before it becomes health. */
export function heroVitality(hero: HealthHero): number {
  const rankMult = getRankStatMultiplier(hero.rank, hero.rarity);
  // Floored at one: the shipped reader accepts a stored multiplier below one
  // and `getTeamMaxHp` refuses to let it reduce anything.
  const statMult = Math.max(1, hero.rebirthStatMult);
  const base = CLASS_PROFILES[hero.heroClass].baseStats.vitality;
  return (base + hero.level * HERO_VITALITY_PER_LEVEL) * rankMult * statMult;
}

/**
 * A hero's spirit, which only defence reads.
 *
 * Grows at **0.5** a level where vitality grows at 0.8 — two similar formulas
 * with different slopes, sharing the rank and rebirth multipliers. Lives beside
 * `heroVitality` so the pair cannot drift, even though nothing about health
 * uses it.
 */
export function heroSpirit(hero: HealthHero): number {
  const rankMult = getRankStatMultiplier(hero.rank, hero.rarity);
  const statMult = Math.max(1, hero.rebirthStatMult);
  const base = CLASS_PROFILES[hero.heroClass].baseStats.spirit;
  return (base + hero.level * HERO_SPIRIT_PER_LEVEL) * rankMult * statMult;
}

/**
 * Team health, as a whole number.
 *
 * `Math.ceil` at the end is the shipped behaviour and is load-bearing at low
 * levels, where a fresh warrior's 244.x becomes 245 — the fixture records the
 * integer, so rounding differently is a mismatch on every scenario.
 */
export function teamMaxHp(input: TeamHealthInput): number {
  const stats = derivedStats(input.playerClass, input.alloc, input.equipment);
  let health = (stats.vitality + PLAYER_VITALITY_BASE) * PLAYER_HP_PER_VITALITY;

  for (const hero of input.activeHeroes) {
    health += (heroVitality(hero) + HERO_VITALITY_BASE) * HERO_HP_PER_VITALITY;
  }

  const formation = getFormationMultipliers(input.activeHeroes);
  const synergy = getTeamSynergy(input.activeHeroes);

  return Math.ceil(
    health *
      getMetaSurvivalMultiplier(input.metaSurvivalLevel) *
      getRebirthSurvivalMultiplier(input.rebirthSurvivalPath) *
      formation.hpMult *
      synergy.hpMult *
      getMasteryHpMultiplier(input.classMasteryXp) *
      getTacticsPowerMultiplier(input.tacticsFacilityLevel).toNumber(),
  );
}
