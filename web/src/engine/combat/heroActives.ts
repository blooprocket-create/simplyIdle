import Decimal from 'break_eternity.js';
import {
  ARCHETYPE_COOLDOWN_MS,
  MENDING_PULSE_BASE_HEAL,
  MENDING_PULSE_LEVEL_SCALE,
  MENDING_PULSE_MAX_HEAL,
  type UniqueSkill,
} from '../../content/heroSkills';
import type { HeroActiveSkillArchetypeId } from '../../content/uniqueEffects';
import { clampUniqueRank } from '../../content/uniqueEffects';

/**
 * Hero abilities: what they do, how long they wait, and what they cost.
 *
 * **The fifth unported system**, found while porting mitigation rather than
 * looked for: the port came out off by exactly 0.8 on every scenario with a
 * warrior in it because `autoCastHeroActivesEnabled` is on by default and
 * every `frontline_ward` hero auto-casts a damage-reduction buff.
 *
 * Two layers. Every hero has a **generic archetype** skill; a hero carrying
 * their own relic casts a **unique** skill instead. The relic does not add to
 * the ability — it replaces it, on its own cooldown.
 *
 * Nothing here holds a clock or a state. It answers what a cast *would* do,
 * and `HeroActiveClock` owns when.
 */

/** What a cast changes. Every field is optional because most skills move one. */
export interface CastEffect {
  /** Damage to the enemy. Never enough to kill — see `applyCast`. */
  damage: Decimal;
  /** Health restored to the team, as a fraction of its maximum. */
  healFraction: number;
  /** A team damage buff, as a fraction, and how long it lasts. */
  damageBuffPct: number;
  damageBuffMs: number;
  /** A damage-reduction buff, and how long it lasts. */
  damageReductionPct: number;
  damageReductionMs: number;
}

function emptyEffect(): CastEffect {
  return {
    damage: new Decimal(0),
    healFraction: 0,
    damageBuffPct: 0,
    damageBuffMs: 0,
    damageReductionPct: 0,
    damageReductionMs: 0,
  };
}

/** Twelve percent a rank: rank one is 1×, rank ten is 2.08×. */
export function uniqueSkillPower(skill: UniqueSkill, rank: number): number {
  return skill.power * (1 + (clampUniqueRank(rank) - 1) * 0.12);
}

export interface CasterView {
  /** The hero's own level. Only `mending_pulse` reads it. */
  level: number;
  archetype: HeroActiveSkillArchetypeId;
  /** The relic's skill and rank, when they are carrying one. Null otherwise. */
  unique: { skill: UniqueSkill; rank: number } | null;
}

/**
 * What the fight looks like to a cast.
 *
 * Both fields are needed, and for different skills: almost everything takes a
 * share of the **maximum**, and `execute` alone reads the *missing* health,
 * which is the difference between the two.
 */
export interface FightView {
  enemyHp: Decimal;
  enemyMaxHp: Decimal;
}

/**
 * What one cast does, and how long the caster then waits.
 *
 * The generic archetypes are deliberately **flat** — the same at level one and
 * at level two hundred — with `mending_pulse` the single exception, and even
 * that one is capped at a quarter of the team's health. A port that scaled all
 * four would make every ability grow with the hero.
 *
 * The damaging skills take a share of the enemy's **maximum** health, not the
 * current, so `burst_volley` is worth the same at full health and at one
 * percent. That is what makes it a burst rather than an execute — and the one
 * skill that *is* an execute reads the missing health explicitly.
 */
export function castEffect(caster: CasterView, fight: FightView): { effect: CastEffect; cooldownMs: number } {
  if (caster.unique !== null) {
    return {
      effect: uniqueEffect(caster.unique.skill, uniqueSkillPower(caster.unique.skill, caster.unique.rank), fight),
      cooldownMs: caster.unique.skill.cooldownMs,
    };
  }
  return { effect: archetypeEffect(caster, fight), cooldownMs: ARCHETYPE_COOLDOWN_MS[caster.archetype] };
}

function archetypeEffect(caster: CasterView, fight: FightView): CastEffect {
  const effect = emptyEffect();
  switch (caster.archetype) {
    case 'frontline_ward':
      effect.damageReductionPct = 0.2;
      effect.damageReductionMs = 3_500;
      return effect;
    case 'burst_volley':
      effect.damage = fight.enemyMaxHp.mul(0.08).ceil();
      return effect;
    case 'battle_chant':
      effect.damageBuffPct = 0.18;
      effect.damageBuffMs = 4_200;
      return effect;
    case 'mending_pulse':
      effect.healFraction = Math.min(
        MENDING_PULSE_BASE_HEAL + Math.max(0, caster.level) * MENDING_PULSE_LEVEL_SCALE,
        MENDING_PULSE_MAX_HEAL,
      );
      return effect;
  }
}

/**
 * The ten unique skills.
 *
 * Grouped by what they move rather than listed in the shipped order, because
 * several do the same thing at different rates and reading them together is
 * what makes that visible.
 *
 * The trap is the skills that do **two** things: each applies its second
 * effect at its own discount, and the discounts differ — `soul_drain` heals
 * for half its damage, `chain_lightning` buffs for 0.6 of its power,
 * `barrier_pulse` shields for 0.5 of its heal, and `rallying_cry` alone
 * applies the full power to both. A port that used `power` for both halves of
 * each gets three of the four wrong, which is how I first wrote it.
 */
function uniqueEffect(skill: UniqueSkill, power: number, fight: FightView): CastEffect {
  const effect = emptyEffect();
  const shareOfMax = () => fight.enemyMaxHp.mul(power).ceil();

  switch (skill.type) {
    case 'shield_wall':
      effect.damageReductionPct = power;
      effect.damageReductionMs = skill.durationMs;
      return effect;

    case 'execute': {
      // The one skill that reads the enemy's *missing* health rather than
      // their maximum, which is what makes it an execute: worth nothing on a
      // full enemy and most on a nearly-dead one. Exactly backwards from every
      // other damaging skill here, and the reason `FightView` carries both.
      effect.damage = fight.enemyMaxHp.sub(fight.enemyHp).max(0).mul(power).ceil();
      return effect;
    }

    case 'rallying_cry':
      effect.damageBuffPct = power;
      effect.damageBuffMs = skill.durationMs;
      effect.healFraction = power;
      return effect;

    case 'soul_drain':
      effect.damage = shareOfMax();
      // Half the damage, as healing. The only skill whose two halves are tied
      // to one number at different rates.
      effect.healFraction = power * 0.5;
      return effect;

    case 'crit_storm':
      // Five hits of the same share, which is why it reads as `× 5` rather
      // than as a larger share: the shipped log names the five.
      effect.damage = shareOfMax().mul(5);
      return effect;

    case 'mark_prey':
      effect.damageBuffPct = power;
      effect.damageBuffMs = skill.durationMs;
      return effect;

    case 'chain_lightning':
      effect.damage = shareOfMax();
      // Sixty percent of the power as the buff, not the whole of it. One of
      // two skills whose second effect is discounted, and the discount is
      // different for each — so a port that shared one expression between the
      // two halves of a two-part skill gets both wrong.
      effect.damageBuffPct = power * 0.6;
      effect.damageBuffMs = skill.durationMs;
      return effect;

    case 'barrier_pulse':
      effect.healFraction = power;
      // Half the power as the shield. The other discounted second effect, at a
      // different rate from `chain_lightning`'s.
      effect.damageReductionPct = power * 0.5;
      effect.damageReductionMs = skill.durationMs;
      return effect;

    case 'armor_shred':
      effect.damageBuffPct = power;
      effect.damageBuffMs = skill.durationMs;
      return effect;

    case 'overcharge':
      effect.damage = shareOfMax();
      return effect;
  }
}

/**
 * Apply a cast's damage to an enemy, leaving them alive.
 *
 * **No ability can land the kill**: the shipped code floors the enemy at 1
 * rather than 0 on every damaging skill, so the team's own swings have to
 * finish it. That is a rule about who gets the credit — a port that floored at
 * zero would hand kills to a button, and with them the gold, the EXP and the
 * wave advance.
 */
export function applyCastDamage(enemyHp: Decimal, damage: Decimal): Decimal {
  return enemyHp.sub(damage).max(1);
}

export const HERO_ACTIVE_ARCHETYPES: readonly HeroActiveSkillArchetypeId[] = [
  'frontline_ward',
  'burst_volley',
  'battle_chant',
  'mending_pulse',
];
