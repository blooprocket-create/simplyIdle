import { getClassProfile, type PlayerClass } from '../../content/classes';
import { getRankStatMultiplier, type Rarity } from '../../content/rarities';
import { getHeroStatProfile, type HeroTemplate, type StatSpread } from '../../content/heroStats';

/**
 * A hero's own combat stats and the damage they contribute.
 *
 * The shipped implementation computes exactly this per hero, then throws it
 * away:
 *
 *     heroDps += heroDmg;
 *
 * That single `+=` is why six heroes and one hero with six times the stats are
 * indistinguishable to the simulation, why the battle view has nothing to draw
 * but two progress bars, and why 66 authored heroes read as one number. The
 * arithmetic here is identical — what changes is that the per-hero result
 * survives, so a renderer can put it on screen and a player can act on it.
 *
 * `heroDamage.test.ts` proves the split is lossless: these values summed equal
 * the scalar the old code produced, exactly.
 */

/** A hero as the simulation sees them: a template plus their earned progress. */
export interface HeroUnit {
  uid: string;
  template: HeroTemplate;
  level: number;
  rank: number;
  rarity: Rarity;
  /** Permanent multiplier earned by rebirthing the hero. At least 1. */
  rebirthStatMult?: number;
}

export interface HeroCombatStats {
  str: number;
  int: number;
  agi: number;
  spr: number;
}

export interface HeroContribution {
  uid: string;
  stats: HeroCombatStats;
  /** Physical and magical components, kept apart so a hit can be described. */
  physical: number;
  magical: number;
  damage: number;
}

const PHYS_FROM_STR = 2;
const PHYS_FROM_AGI = 1.2;
const PHYS_FROM_LEVEL = 0.5;
const MAGIC_FROM_INT = 2;
const MAGIC_FROM_SPR = 1.1;
const PHYS_CONTRIBUTION = 0.4;
const MAGIC_CONTRIBUTION = 0.3;
const DAMAGE_DIVISOR = 2;

/** Stats a hero actually fights with: profile, scaled by rank and rebirth. */
export function getHeroCombatStats(hero: HeroUnit): HeroCombatStats {
  const profile = getHeroStatProfile(hero.template);
  const rankMult = getRankStatMultiplier(hero.rank, hero.rarity);
  const statMult = Math.max(1, hero.rebirthStatMult ?? 1);

  const at = (key: keyof StatSpread) =>
    (profile.baseStats[key] + hero.level * profile.statGrowth[key]) * rankMult * statMult;

  return { str: at('str'), int: at('int'), agi: at('agi'), spr: at('spr') };
}

/** One hero's damage contribution, kept whole rather than accumulated. */
export function getHeroContribution(hero: HeroUnit): HeroContribution {
  const stats = getHeroCombatStats(hero);
  const cls = getClassProfile(hero.template.heroClass);

  const physical = stats.str * PHYS_FROM_STR + stats.agi * PHYS_FROM_AGI + hero.level * PHYS_FROM_LEVEL;
  const magical = stats.int * MAGIC_FROM_INT + stats.spr * MAGIC_FROM_SPR;

  const damage =
    (physical * cls.physWeight * PHYS_CONTRIBUTION + magical * cls.magicWeight * MAGIC_CONTRIBUTION) / DAMAGE_DIVISOR;

  return { uid: hero.uid, stats, physical, magical, damage };
}

/**
 * The active team's contributions, in team order.
 *
 * Summing this is what the old code did eagerly; doing it at the end instead
 * is the whole structural change.
 */
export function getTeamContributions(team: readonly HeroUnit[]): HeroContribution[] {
  return team.map(getHeroContribution);
}

export function sumContributions(contributions: readonly HeroContribution[]): number {
  return contributions.reduce((total, contribution) => total + contribution.damage, 0);
}

/** Convenience for the parity suite and for callers that still want a scalar. */
export function getTeamBaseDps(team: readonly HeroUnit[]): number {
  return sumContributions(getTeamContributions(team));
}

/** Per-class fallback stats, for a hero whose template is missing. */
export function getFallbackCombatStats(
  heroClass: PlayerClass,
  level: number,
  rankMult: number,
  statMult: number,
): HeroCombatStats {
  const base = getClassProfile(heroClass).baseStats;
  return {
    str: (base.strength + level * 0.9) * rankMult * statMult,
    int: (base.intelligence + level * 0.85) * rankMult * statMult,
    agi: (base.agility + level * 0.7) * rankMult * statMult,
    spr: (base.spirit + level * 0.6) * rankMult * statMult,
  };
}
