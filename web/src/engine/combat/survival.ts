import Decimal from 'break_eternity.js';
import { getMonsterAffixModifiers } from '../../content/affixes';
import { getMonsterDamage } from '../waves/curves';

/**
 * The half of combat that happens *to* the team.
 *
 * Heroes got timers and targets before anything could hit back, which left the
 * live simulation unable to lose: no team health, no incoming damage, no
 * death, no retreat. An underpowered roster would have climbed every wave
 * forever, while the offline estimator — modelling the same encounter —
 * reported the sawtooth of deaths and chapter retreats that the game actually
 * has. Online and offline were describing different games.
 *
 * Incoming damage is continuous here, not another attack timer. The shipped
 * model applies it continuously and so does the estimator, so a per-monster
 * cadence would open a fresh divergence to pay for a fidelity nobody asked
 * for. Giving enemies a swing rhythm is its own decision, for the phase that
 * has something to animate them with.
 */

export interface TeamVitals {
  hp: Decimal;
  maxHp: Decimal;
}

export function fullHealth(maxHp: Decimal): TeamVitals {
  return { hp: maxHp, maxHp };
}

/**
 * What the monster at `wave` deals per second, after the whole mitigation
 * chain has been collapsed into `incomingMult` by the caller — the same
 * scalar the offline estimator takes, for the same reason.
 */
export function incomingDamagePerSecond(wave: number, incomingMult: number): Decimal {
  const safeWave = Math.max(1, Math.floor(wave));
  return getMonsterDamage(safeWave).mul(incomingMult).mul(getMonsterAffixModifiers(safeWave).damageMult);
}

export interface SurvivalStep {
  vitals: TeamVitals;
  taken: Decimal;
  died: boolean;
}

export function applyIncoming(vitals: TeamVitals, wave: number, incomingMult: number, elapsedMs: number): SurvivalStep {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || incomingMult <= 0) {
    return { vitals, taken: new Decimal(0), died: false };
  }

  const taken = incomingDamagePerSecond(wave, incomingMult).mul(elapsedMs).div(1_000);
  const hp = vitals.hp.sub(taken);

  // Matching the shipped rule, which wipes on `teamHp <= 0` rather than below.
  if (hp.lte(0)) return { vitals: { ...vitals, hp: new Decimal(0) }, taken, died: true };
  return { vitals: { ...vitals, hp }, taken, died: false };
}

/**
 * Restore a fraction of the team's maximum, never past full.
 *
 * A fraction rather than an amount, because that is what an ability gives:
 * `mending_pulse` heals eight percent of the team's maximum whatever that
 * number is, so a heal expressed in points would have to be recomputed
 * wherever the maximum changed.
 */
export function healTeam(vitals: TeamVitals, fraction: number): TeamVitals {
  if (!(fraction > 0)) return vitals;
  return { ...vitals, hp: vitals.hp.add(vitals.maxHp.mul(fraction)).min(vitals.maxHp) };
}

/**
 * Move the team to a new maximum, keeping the share of it they had.
 *
 * A hero levels and the team's ceiling rises. Carrying the *fraction* rather
 * than the points is what stops that being a heal: a team at half health stays
 * at half health, where copying the old hp across would leave them at a
 * smaller share and setting them to full would make levelling a free reset.
 *
 * A maximum of zero has no fraction to keep, so the team sits at zero rather
 * than at `NaN`.
 */
export function rescaleVitals(vitals: TeamVitals, maxHp: Decimal): TeamVitals {
  if (vitals.maxHp.lte(0)) return { hp: new Decimal(0), maxHp };
  const share = vitals.hp.div(vitals.maxHp);
  return { hp: maxHp.mul(share).min(maxHp).max(0), maxHp };
}
