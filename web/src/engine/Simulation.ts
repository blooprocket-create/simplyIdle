import Decimal from 'break_eternity.js';
import { swingProgress } from './combat/attackTimer';
import { isBossWave } from '../content/monsters';

import { BossFight } from './combat/BossFight';
import { RallyOffers } from './combat/RallyOffers';
import { BURST_HIT_UID, TELL_HIT_UID, type BurstQuality } from './combat/burst';
import { BurstMeter } from './combat/BurstMeter';
import { applyHit, spawnEnemy, type Enemy } from './combat/encounter';
import { FLAT_RATES, RunEarnings, type RewardRates } from './combat/rewards';
import { applyIncoming, fullHealth, type TeamVitals } from './combat/survival';
import { scheduleSwings } from './combat/swingSchedule';
import { teamDps, type HeroEntity } from './entities/HeroEntity';
import { creditAwayTime } from './offline/awayCredit';
import type { RunProgress } from './save/runProgress';
import { emptySnapshot, type HitEvent, type SimulationSnapshot } from './types';

/**
 * The coordinator. It owns the clock and delegates every rule to a subsystem —
 * it does not implement any of them itself.
 *
 * `architecture.test.ts` caps this file's length, because the reason this
 * rewrite exists is that the previous simulation reached 5,901 lines without
 * anything objecting. The cap is the objection.
 */

export interface SimulationOptions {
  /**
   * Whether a lapsed BURST window fires itself at the floor multiplier.
   *
   * Off by default, which is the Phase 4 change: the shipped game let a
   * player switch this on from the settings tab in their first minute, so
   * the verb was optional from the moment it existed.
   */
  autoBurst?: boolean;
  heroes: readonly HeroEntity[];
  startWave?: number;
  /**
   * A run being continued rather than begun. Takes precedence over
   * `startWave`: a resumed run already knows where it is.
   */
  resume?: RunProgress;
  /** Weekly event and other non-affix enemy HP scaling. */
  enemyHpMult?: number;
  /** Full team health. The team returns to this on a kill and on a wipe. */
  teamMaxHp?: Decimal;
  /** Enemy damage multiplier after the whole mitigation chain. */
  incomingMult?: number;
  /** The gold and EXP multiplier chain. Flat until Phase 10 assembles it. */
  rates?: RewardRates;
}

export class Simulation {
  private heroes: HeroEntity[];
  private enemy: Enemy;
  private vitals: TeamVitals;
  private readonly enemyHpMult: number;
  private readonly incomingMult: number;
  private elapsedMs = 0;
  private ticks = 0;
  private kills = 0;
  private deaths = 0;
  private dealt = new Decimal(0);
  private overkill = new Decimal(0);
  private hits: HitEvent[] = [];
  private readonly earnings: RunEarnings;
  private readonly burst: BurstMeter;
  private readonly rally = new RallyOffers();
  private readonly boss = new BossFight();

  constructor(options: SimulationOptions = { heroes: [] }) {
    this.burst = new BurstMeter(options.autoBurst ?? false);
    this.enemyHpMult = options.enemyHpMult ?? 1;
    this.incomingMult = options.incomingMult ?? 0;
    const resume = options.resume;
    this.kills = resume?.kills ?? 0;
    this.deaths = resume?.deaths ?? 0;
    this.earnings = new RunEarnings(options.rates ?? FLAT_RATES, resume);
    this.enemy = spawnEnemy(resume?.wave ?? options.startWave ?? 1, this.enemyHpMult);
    // Banked charge comes back at the sim clock's origin, so a player who
    // reloads on a full meter gets the window they had rather than a wait.
    if (resume !== undefined) this.burst.gain(resume.burstCharge, this.elapsedMs);
    this.vitals = fullHealth(options.teamMaxHp ?? new Decimal(100));
    this.heroes = options.heroes.map(hero => ({ ...hero, targetId: this.enemy.id }));
    // Armed here rather than on the first step: `GameLoop.subscribe` publishes
    // a snapshot before any frame has run, and a player who reloads standing
    // on a boss would otherwise be told there was no mechanic to answer.
    this.boss.tick(this.enemy.wave, this.elapsedMs);
  }

  /** Advances the simulation by `elapsedMs`. Pure with respect to the clock. */
  advance(elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;

    this.elapsedMs += elapsedMs;
    this.ticks += 1;
    this.hits = [];

    this.rally.tick(this.elapsedMs);
    // Opens and closes the act's tell. It never damages anything, which is
    // what keeps an unwatched boss fight the fight the estimator models.
    this.boss.tick(this.enemy.wave, this.elapsedMs);

    /*
     * The monster hits back first, then the swings land.
     *
     * Without this the team could never lose: an underpowered roster would
     * have climbed every wave forever while the offline estimator, modelling
     * the same encounter, reported deaths and chapter retreats. The two were
     * describing different games.
     *
     * Damage *before* swings, because a kill heals to full and the estimator's
     * model has the team starting every round at full health. Applying it
     * afterwards charged them for time they had already survived: a team that
     * killed early in a step still paid the whole step's damage, on top of the
     * heal that kill had just given them.
     */
    const survival = applyIncoming(this.vitals, this.enemy.wave, this.incomingMult, elapsedMs);
    this.vitals = survival.vitals;
    if (survival.died) this.wipe();

    const step = scheduleSwings(this.heroes, elapsedMs);
    this.heroes = step.heroes;
    for (const swing of step.swings) this.land(swing.hero.damagePerHit, swing.hero.uid, swing.atMs);

    // A window that closed with nobody pressing; see `BurstMeter`.
    const fired = this.burst.tick(this.elapsedMs);
    if (fired) this.detonate(fired.multiplier, fired.seconds);

    // Retarget after the step so a hero whose target died is pointed at
    // whatever replaced it rather than holding a stale id into the next frame.
    this.heroes = this.heroes.map(hero =>
      hero.targetId === this.enemy.id ? hero : { ...hero, targetId: this.enemy.id },
    );
  }

  /**
   * The player pressed BURST.
   *
   * Takes no time argument: the simulation owns the clock, and a caller
   * passing its own would be timing the window against a different one.
   */
  /** Whether a lapsed BURST window fires itself. Earned, and then chosen. */
  setAutoBurst(on: boolean): void {
    this.burst.setAutomated(on);
  }

  /**
   * The player answered the boss's tell.
   *
   * Pays in both currencies on purpose: charge, because a boss is one enemy
   * and the kill-fed meter would otherwise starve exactly where the fight
   * needs it; and a chip, because an answer the player can see landing is
   * what makes the mechanic a verb rather than a chore.
   */
  answerTell(): boolean {
    const payoff = this.boss.answer(this.elapsedMs);
    if (payoff === null) return false;
    this.burst.gain(payoff.charge, this.elapsedMs);
    this.detonate(1, payoff.chipSeconds, TELL_HIT_UID);
    return true;
  }

  spendBurst(): { spent: boolean; multiplier: number; quality: BurstQuality } {
    const { payload, quality } = this.burst.spend(this.elapsedMs);
    if (payload) this.detonate(payload.multiplier, payload.seconds);
    return { spent: payload !== null, multiplier: payload?.multiplier ?? 1, quality };
  }

  /**
   * Credit a stretch the tab spent hidden.
   *
   * Routed through the offline estimator rather than `advance`, which clamps
   * long steps and would drop the remainder on the floor. The estimator models
   * the sawtooth — climbs, wipes and chapter retreats — so a player who closed
   * the tab at their ceiling comes back to the same place the shipped game
   * would have put them, rather than to a free climb or to nothing at all.
   */
  creditAway(elapsedMs: number): void {
    // An offer nobody was present for; the retreat it followed already ran.
    this.rally.clear();
    const credit = creditAwayTime(
      {
        wave: this.enemy.wave,
        teamDps: teamDps(this.heroes),
        teamMaxHp: this.vitals.maxHp,
        enemyHpMult: this.enemyHpMult,
        incomingMult: this.incomingMult,
        rates: this.earnings.rates,
      },
      elapsedMs,
    );
    if (credit.msCredited <= 0) return;

    this.elapsedMs += credit.msCredited;
    this.kills += credit.kills;
    this.deaths += credit.deaths;
    this.earnings.creditAway(credit.gold, credit.exp);
    // Charged after the clock moves, so the window that opens is open *now*
    // rather than at a moment that already passed while the tab was hidden.
    this.burst.creditAway(credit.kills, this.elapsedMs);
    this.enemy = spawnEnemy(credit.wave, this.enemyHpMult);
    this.vitals = fullHealth(this.vitals.maxHp);
    this.hits = [];
    this.heroes = this.heroes.map(hero => ({ ...hero, targetId: this.enemy.id }));
  }

  /**
   * A burst landing: seconds of the team's damage, multiplied.
   *
   * Goes through the same path an ordinary swing does, so it kills, overkills
   * and chains waves identically — and so the kill it lands charges the
   * *next* burst, which is right: the meter is already empty by the time this
   * runs.
   */
  private detonate(multiplier: number, seconds: number, uid: string = BURST_HIT_UID): void {
    const damage = teamDps(this.heroes).mul(seconds).mul(multiplier);
    if (damage.lte(0)) return;
    // Not a hero's swing, so it carries a reserved uid rather than borrowing
    // one: the renderer places floating numbers by hashing this, and a
    // borrowed uid would stack the burst on top of that hero's own hit.
    this.land(damage, uid, 0);
  }

  /**
   * Damage arriving at the enemy, from whatever threw it.
   *
   * Shared by swings and bursts so a kill is bookkept once. Two copies of
   * "did that kill it" is how a burst ends up charging the meter it just
   * spent, or healing the team twice.
   */
  private land(damage: Decimal, heroUid: string, atMs: number): void {
    const result = applyHit(this.enemy, damage);
    this.enemy = result.enemy;
    this.dealt = this.dealt.add(result.dealt);
    this.overkill = this.overkill.add(result.overkill);
    this.hits.push({ heroUid, dealt: result.dealt, overkill: result.overkill, killed: result.killed, atMs });

    if (!result.killed) return;
    this.kills += 1;
    // Both charged from the wave that just died, not the one replacing it: a
    // boss is worth three charges and seven times the gold, and reading after
    // the respawn credits the wrong fight on both counts.
    this.burst.charge(isBossWave(this.enemy.wave), this.elapsedMs);
    this.earnings.creditKill(this.enemy.wave);
    this.enemy = spawnEnemy(this.enemy.wave + 1, this.enemyHpMult);
    // The shipped game heals the team to full on a win, and so does the
    // estimator's round model. Matching it keeps the sawtooth the same shape.
    this.vitals = fullHealth(this.vitals.maxHp);
  }

  /**
   * A wipe. Counted, the retreat applied at once, and then put to the player.
   *
   * Applying it now rather than when the offer closes is what keeps this in
   * step with the offline estimator: pausing the fight to ask cost an idle
   * player eight seconds per wipe and made the two models disagree.
   */
  private wipe(): void {
    this.deaths += 1;
    this.enemy = spawnEnemy(this.rally.open(this.enemy.wave, this.elapsedMs), this.enemyHpMult);
    this.vitals = fullHealth(this.vitals.maxHp);
  }

  /** The player answered a rally offer. */
  decideWipe(choice: 'retreat' | 'rally'): boolean {
    const { answered, outcome } = this.rally.take(choice);
    if (outcome !== null) {
      this.enemy = spawnEnemy(outcome.wave, this.enemyHpMult);
      this.vitals = { ...fullHealth(this.vitals.maxHp), hp: this.vitals.maxHp.mul(outcome.healthFraction) };
    }
    return answered;
  }

  /** The current read model. Callers must treat it as immutable. */
  read(): SimulationSnapshot {
    const earned = this.earnings.read();
    return {
      ...emptySnapshot(),
      elapsedMs: this.elapsedMs,
      wave: this.enemy.wave,
      ticks: this.ticks,
      enemy: { id: this.enemy.id, wave: this.enemy.wave, hp: this.enemy.hp, maxHp: this.enemy.maxHp },
      team: { hp: this.vitals.hp, maxHp: this.vitals.maxHp },
      heroes: this.heroes.map(hero => ({
        uid: hero.uid,
        swingProgress: swingProgress(hero.timer),
        damagePerHit: hero.damagePerHit,
        targetId: hero.targetId,
      })),
      hits: this.hits,
      burst: this.burst.view(this.elapsedMs),
      wipe: this.rally.view(this.elapsedMs),
      boss: this.boss.view(this.elapsedMs),
      totals: { kills: this.kills, deaths: this.deaths, dealt: this.dealt, overkill: this.overkill, ...earned },
    };
  }
}
