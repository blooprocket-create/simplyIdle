import Decimal from 'break_eternity.js';
import { getFormationMultipliers, getTeamBoostMultiplier, type FormationHero } from './formation';
import { getHeroPassiveMultipliers, type HeroPassiveTraitId } from './heroPassives';
import {
  getProgressionMultipliers,
  type ProgressionMultipliers,
  type ProgressionState,
} from './progressionMultipliers';
import { getTeamSynergy } from './synergy';
import { getUniqueRelicMultipliers, type RelicBearer } from './uniqueRelics';

/**
 * The fourteen factors between a team's base damage and what it actually deals.
 *
 * Every one of them was already ported and fixture-tested. **None of them was
 * called by anything the player ran.** `app/roster.ts` built a hero's damage
 * from `getHeroContribution` and stopped, so the live fight was missing team
 * synergy, the formation bonus, hero passives, unique relics, the prestige and
 * meta levels, class mastery, VIP and the team boost — the whole stack. It is
 * the same shape as the wallet: rules complete, caller missing.
 *
 * **The order is the shipped order**, interleaved, and that is why
 * `multiplyProgression` is deliberately not used here. It exists to reproduce
 * the *progression subset's* sequence and says so, but the shipped product runs
 * hero passives, formation and synergy between the class passive and mastery,
 * and the relics between VIP and the temporary buff. Float multiplication is
 * not associative, so reproducing the shipped sequence means reproducing it
 * whole rather than in two halves.
 */

/** A fielded hero, as the multiplier stack reads them. */
export interface PoweredHero extends FormationHero {
  passiveTrait: HeroPassiveTraitId;
  /** The rarity-scaled boost off their save row. */
  teamBoost: number;
}

export interface TeamPowerInput {
  team: readonly PoweredHero[];
  relics: readonly RelicBearer[];
  progression: ProgressionState;
}

/** Every factor, named, so a screen can say where a number came from. */
export interface DamageMultipliers extends ProgressionMultipliers {
  heroPassives: number;
  formation: number;
  synergy: number;
  uniqueRelics: number;
  teamBoost: number;
}

export function damageMultipliers(input: TeamPowerInput): DamageMultipliers {
  return {
    ...getProgressionMultipliers(input.progression),
    heroPassives: getHeroPassiveMultipliers(input.team).dpsMult,
    formation: getFormationMultipliers(input.team).dpsMult,
    synergy: getTeamSynergy(input.team).dpsMult,
    uniqueRelics: getUniqueRelicMultipliers(input.relics).dpsMult,
    teamBoost: getTeamBoostMultiplier(input.team),
  };
}

/**
 * Their product, in the shipped sequence.
 *
 * The shipped code wraps this in `safeMultiplier`, which returns **1** for a
 * value that is not finite or is negative. That guard exists because the
 * product is a double and fourteen factors compound: a deep account's
 * `1.5^prestigeCount` alone reaches `Infinity` at 1,760 rebirths, and the
 * shipped game answers by throwing the entire bonus away.
 *
 * This does not reproduce that, and the difference is deliberate. The whole
 * reason `break_eternity` is in the stack is that the numbers outlive doubles,
 * and `getRebirthLegacyMultiplier` already prefers the float while one exists
 * and reaches for `Decimal.pow` only past it. Collapsing a legitimately huge
 * multiplier to 1 here would undo that on purpose. What is kept is the other
 * half of the guard: a negative product — which only a corrupt input can
 * produce — reads as 1 rather than as damage that heals the enemy.
 */
export function multiplyDamage(multipliers: DamageMultipliers): Decimal {
  const product = multipliers.rebirthLegacy
    .mul(multipliers.achievementLegacy)
    .mul(multipliers.metaDamage)
    .mul(multipliers.rebirthDamagePath)
    .mul(multipliers.tacticsFacility)
    .mul(multipliers.classPassive)
    .mul(multipliers.heroPassives)
    .mul(multipliers.formation)
    .mul(multipliers.synergy)
    .mul(multipliers.mastery)
    .mul(multipliers.vipDamage)
    .mul(multipliers.uniqueRelics)
    .mul(multipliers.temporaryBuff)
    .mul(multipliers.teamBoost);
  return product.isNan() || product.lt(0) ? new Decimal(1) : product;
}

/** The whole stack, as one number. */
export function damageMultiplier(input: TeamPowerInput): Decimal {
  return multiplyDamage(damageMultipliers(input));
}

export interface TeamDamageInput extends TeamPowerInput {
  /** The player's own contribution, before multipliers. */
  playerDamage: number;
  /** Each fielded hero's contribution, before multipliers. */
  heroDamage: readonly { uid: string; damage: number }[];
}

export interface TeamDamage {
  multiplier: Decimal;
  /** The player's share, multiplied. They fight; see `playerDamage.ts`. */
  player: Decimal;
  heroes: { uid: string; damage: Decimal }[];
  /** What the shipped `finalDps` would be: the sum, floored at one. */
  total: Decimal;
}

/**
 * The team's damage, split per combatant and multiplied.
 *
 * The shipped game computes one scalar — `(playerDps + heroDps) * mult` — and
 * the rewrite keeps combatants as separate entities with their own swing
 * timers, so the multiplier is applied to each share rather than to the sum.
 * That is the same number by distributivity, and it is what lets the floating
 * damage numbers say who hit.
 *
 * The floor of one is the shipped `Math.max(1, rawDps)`, applied to the total
 * rather than to each share: a team of six each dealing a fifth of a point
 * deals one point between them, not six.
 */
export function teamDamage(input: TeamDamageInput): TeamDamage {
  const multiplier = damageMultiplier(input);
  const player = new Decimal(Math.max(0, input.playerDamage)).mul(multiplier);
  const heroes = input.heroDamage.map(hero => ({
    uid: hero.uid,
    damage: new Decimal(Math.max(0, hero.damage)).mul(multiplier),
  }));
  const summed = heroes.reduce((total, hero) => total.add(hero.damage), player);
  return { multiplier, player, heroes, total: Decimal.max(1, summed) };
}
