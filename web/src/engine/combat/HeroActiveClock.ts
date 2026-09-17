import Decimal from 'break_eternity.js';
import { applyCastDamage, castEffect, type CasterView, type CastEffect, type FightView } from './heroActives';

/**
 * Whose ability is ready, and how long a buff has left.
 *
 * The piece every earlier phase said was missing. `progressionFromSave` and
 * `rosterFromSave` both pass a temporary buff of **zero** with the same note:
 * "a temporary buff needs a clock to expire by and nothing here ticks one
 * down, so honouring a stored one would make it permanent". This is that clock.
 *
 * Its own object rather than fields on `Simulation`, for the reason
 * `RunEarnings` is: `Simulation.ts` is held under three hundred lines by
 * `engine/architecture.test.ts`, and a system with two timers and a cooldown
 * per hero does not fit inside another one. The simulation steps it and reads
 * two scalars back.
 *
 * Nothing here reads a clock of its own — `step` takes the elapsed
 * milliseconds, exactly as every other engine part does.
 */

export interface CastRecord {
  uid: string;
  effect: CastEffect;
}

export interface StepResult {
  /** Casts that fired during this step, in team order. */
  casts: CastRecord[];
  /** Damage those casts dealt, already floored so the enemy survives. */
  enemyHp: Decimal;
  /** Health restored, as a fraction of the team's maximum. Summed. */
  healFraction: number;
}

export class HeroActiveClock {
  /** Milliseconds until each hero's ability is ready. Missing means ready. */
  private readonly cooldownMs = new Map<string, number>();

  private damageBuffPct = 0;
  private damageBuffMs = 0;
  private damageReductionPct = 0;
  private damageReductionMs = 0;

  /**
   * Whether an ability fires itself the moment it comes up.
   *
   * **On by default, as shipped.** That default is not a detail: it is why the
   * mitigation fixture had to switch it off to measure anything, and why a
   * team of `frontline_ward` heroes is quietly 20% tougher than its stats say.
   */
  private autoCast = true;

  setAutoCast(on: boolean): void {
    this.autoCast = on;
  }

  /** How long until this hero can cast. Zero means now. */
  remainingMs(uid: string): number {
    return this.cooldownMs.get(uid) ?? 0;
  }

  ready(uid: string): boolean {
    return this.remainingMs(uid) <= 0;
  }

  /** The team damage multiplier a live buff is worth. One when none is up. */
  damageMultiplier(): number {
    return this.damageBuffMs > 0 ? 1 + this.damageBuffPct : 1;
  }

  /** The damage-reduction fraction a live buff is worth. Zero when none is up. */
  damageReduction(): number {
    return this.damageReductionMs > 0 ? this.damageReductionPct : 0;
  }

  /**
   * A hero the player pressed, or refused.
   *
   * Refused when the hero is not on the field or their ability is not ready —
   * the same two guards the shipped action makes, and in the same order. A
   * refusal changes nothing at all, including the cooldown, so a mistimed
   * press is not a punished one.
   */
  cast(uid: string, caster: CasterView, fight: FightView, fielded: boolean): CastRecord | null {
    if (!fielded) return null;
    if (!this.ready(uid)) return null;
    return this.fire(uid, caster, fight);
  }

  private fire(uid: string, caster: CasterView, fight: FightView): CastRecord {
    const { effect, cooldownMs } = castEffect(caster, fight);
    this.cooldownMs.set(uid, cooldownMs);
    this.absorb(effect);
    return { uid, effect };
  }

  /**
   * Buffs take the **stronger** of the old and the new, on both axes.
   *
   * `Math.max` on each, as shipped — so a weaker cast landing on a stronger
   * one does not cut it short, and two casts of the same skill refresh the
   * duration rather than stacking the power. A port that added them would make
   * a team of chanters immortal.
   */
  private absorb(effect: CastEffect): void {
    if (effect.damageBuffMs > 0) {
      this.damageBuffPct = Math.max(this.damageBuffPct, effect.damageBuffPct);
      this.damageBuffMs = Math.max(this.damageBuffMs, effect.damageBuffMs);
    }
    if (effect.damageReductionMs > 0) {
      this.damageReductionPct = Math.max(this.damageReductionPct, effect.damageReductionPct);
      this.damageReductionMs = Math.max(this.damageReductionMs, effect.damageReductionMs);
    }
  }

  /**
   * Advance every cooldown and buff, and fire what auto-cast fires.
   *
   * The order matters and is the shipped one: cooldowns come down first, then
   * a hero whose cooldown reached zero casts *within the same step*. A port
   * that fired on the next step instead would leave every ability one tick
   * late forever, which compounds into a visible rate difference over a run.
   *
   * `casters` is walked in team order, so a heal that lands before a burst
   * does so deterministically rather than by map iteration order.
   */
  step(
    elapsedMs: number,
    casters: readonly { uid: string; caster: CasterView; fielded: boolean }[],
    fight: FightView,
  ): StepResult {
    this.damageBuffMs = Math.max(0, this.damageBuffMs - elapsedMs);
    this.damageReductionMs = Math.max(0, this.damageReductionMs - elapsedMs);
    // A lapsed buff's magnitude is cleared with it, so a stale percentage
    // cannot come back when the next cast refreshes only the duration.
    if (this.damageBuffMs === 0) this.damageBuffPct = 0;
    if (this.damageReductionMs === 0) this.damageReductionPct = 0;

    const casts: CastRecord[] = [];
    let enemyHp = fight.enemyHp;
    let healFraction = 0;

    for (const entry of casters) {
      if (!entry.fielded) continue;
      const left = Math.max(0, this.remainingMs(entry.uid) - elapsedMs);
      this.cooldownMs.set(entry.uid, left);
      if (left > 0) continue;
      if (!this.autoCast) continue;

      // Each cast sees the enemy as the ones before it left them, which is
      // what makes `execute` in a team of five read a falling health bar
      // rather than the same number five times.
      const record = this.fire(entry.uid, entry.caster, { enemyHp, enemyMaxHp: fight.enemyMaxHp });
      enemyHp = applyCastDamage(enemyHp, record.effect.damage);
      healFraction += record.effect.healFraction;
      casts.push(record);
    }

    return { casts, enemyHp, healFraction };
  }

  /** Forget every cooldown and buff. For a wipe, or a team that changed. */
  reset(): void {
    this.cooldownMs.clear();
    this.damageBuffPct = 0;
    this.damageBuffMs = 0;
    this.damageReductionPct = 0;
    this.damageReductionMs = 0;
  }
}
