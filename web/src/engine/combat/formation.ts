import type { PlayerClass } from '../../content/classes';

/**
 * Formation multipliers: what standing in the front, middle or back rank does
 * to the team's damage, health and incoming damage.
 *
 * This is also where the battle line's *shape* comes from — `front`, `mid` and
 * `back` counts are returned alongside the multipliers because Phase 2's
 * renderer needs to know who stands where, and the shipped code already
 * computes it and then uses only the numbers.
 */

export type FormationRole = 'front' | 'mid' | 'back';

/** At most this many heroes benefit from any one rank. */
export const MAX_FORMATION_ROLE_HEROES = 2;

/**
 * Which ranks a class may occupy. Note that only the monk has more than one,
 * which matters for the bug documented on `getFormationRoleForHero` below.
 */
export const VALID_FORMATION_ROLES_FOR_CLASS: Record<PlayerClass, FormationRole[]> = {
  warrior: ['front'],
  berserker: ['front'],
  monk: ['front', 'mid'],
  mage: ['mid'],
  archer: ['back'],
};

/** Caps, applied after the per-hero loop. */
export const FORMATION_DPS_CAP = 1.95;
export const FORMATION_HP_CAP = 1.85;
export const FORMATION_INCOMING_MIN = 0.68;
export const FORMATION_INCOMING_MAX = 1.35;

export interface FormationHero {
  uid: string;
  heroClass: PlayerClass;
  /** The player's stored choice. See the note on `getFormationRoleForHero`. */
  storedRole?: FormationRole;
}

export interface FormationResult {
  dpsMult: number;
  hpMult: number;
  incomingMult: number;
  front: number;
  mid: number;
  back: number;
}

/**
 * The rank a hero actually fights in.
 *
 * **This reproduces a bug in the shipped game, deliberately.** The shipped
 * `getFormationRoleForHero` takes only the hero and returns
 * `VALID_FORMATION_ROLES_FOR_CLASS[heroClass][0]` — it never reads
 * `state.heroFormationByUid`, so the formation the player sets through
 * `SET_HERO_FORMATION` does not reach the combat multipliers at all. That
 * stored value *is* read when validating team selection, which is why the
 * control looks like it works.
 *
 * It only bites the monk, the one class with two legal ranks: a monk the
 * player has placed in `mid` is still counted as `front`, worth 1.03x team DPS
 * that never arrives. Every other class has a single legal rank, so `[0]` is
 * the only answer and ignoring the stored value changes nothing.
 *
 * Verified against the shipped implementation: a monk with `mid` stored still
 * reports a formation multiplier of 1 rather than 1.03.
 *
 * Ported as-is because the rewrite's contract is that the numbers do not move.
 * Fixing it is a balance change and belongs in its own commit, on purpose,
 * with the parity fixture regenerated to match.
 */
export function getFormationRoleForHero(hero: FormationHero): FormationRole {
  return VALID_FORMATION_ROLES_FOR_CLASS[hero.heroClass][0];
}

/** The role the player asked for, which is what a fixed version would use. */
export function getIntendedFormationRole(hero: FormationHero): FormationRole {
  const valid = VALID_FORMATION_ROLES_FOR_CLASS[hero.heroClass];
  if (hero.storedRole && valid.includes(hero.storedRole)) return hero.storedRole;
  return valid[0];
}

const FRONT_RANK_TANKS: PlayerClass[] = ['warrior', 'berserker', 'monk'];
const BACK_RANK_CASTERS: PlayerClass[] = ['archer', 'mage'];

export function getFormationMultipliers(team: readonly FormationHero[]): FormationResult {
  let front = 0;
  let mid = 0;
  let back = 0;
  let dpsMult = 1;
  let hpMult = 1;
  let incomingMult = 1;

  for (const hero of team) {
    const role = getFormationRoleForHero(hero);

    if (role === 'front') {
      if (front >= MAX_FORMATION_ROLE_HEROES) continue;
      front += 1;
      hpMult *= 1.06;
      incomingMult *= 0.95;
      // A class built to hold the line mitigates; anyone else pays in damage.
      if (FRONT_RANK_TANKS.includes(hero.heroClass)) incomingMult *= 0.96;
      else dpsMult *= 0.98;
    } else if (role === 'mid') {
      if (mid >= MAX_FORMATION_ROLE_HEROES) continue;
      mid += 1;
      dpsMult *= 1.03;
      hpMult *= 1.02;
      incomingMult *= 0.99;
    } else {
      if (back >= MAX_FORMATION_ROLE_HEROES) continue;
      back += 1;
      dpsMult *= 1.05;
      incomingMult *= 1.03;
      // A ranged class makes the back rank pay off; anyone else is exposed.
      if (BACK_RANK_CASTERS.includes(hero.heroClass)) dpsMult *= 1.04;
      else incomingMult *= 1.02;
    }
  }

  return {
    dpsMult: Math.min(FORMATION_DPS_CAP, dpsMult),
    hpMult: Math.min(FORMATION_HP_CAP, hpMult),
    incomingMult: Math.max(FORMATION_INCOMING_MIN, Math.min(FORMATION_INCOMING_MAX, incomingMult)),
    front,
    mid,
    back,
  };
}

/** Sum of the active team's team-boost values. */
export function getTeamHeroBoost(team: readonly { teamBoost: number }[]): number {
  return team.reduce((sum, hero) => sum + hero.teamBoost, 0);
}

export function getTeamBoostMultiplier(team: readonly { teamBoost: number }[]): number {
  return 1 + getTeamHeroBoost(team);
}
