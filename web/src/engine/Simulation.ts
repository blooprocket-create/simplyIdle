import Decimal from 'break_eternity.js';
import { isBossWave } from '../content/monsters';

import { BossFight } from './combat/BossFight';
import { HeroActiveClock, type ActiveCaster } from './combat/HeroActiveClock';
import { applyActives, castOne } from './combat/applyActives';
import { RallyOffers } from './combat/RallyOffers';
import { retuneFight, type FightTuning } from './combat/retune';
import { BURST_HIT_UID, TELL_HIT_UID, type BurstQuality } from './combat/burst';
import { BurstMeter } from './combat/BurstMeter';
import { applyHit, spawnEnemy, type Enemy } from './combat/encounter';
import { FLAT_RATES, RunEarnings, type BankedRun, type RewardRates } from './combat/rewards';
import { seededRandom } from './rng';
import { applyIncoming, fullHealth, healTeam, type TeamVitals } from './combat/survival';
import { scheduleSwings } from './combat/swingSchedule';
import { heroViews, teamDps, type HeroEntity } from './entities/HeroEntity';
import { creditAwayTime } from './offline/awayCredit';
import type { RunProgress } from './save/runProgress';
import { emptySnapshot, type HitEvent, type SimulationSnapshot } from './types';
import { totalsView } from './views';

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
  /** Whose abilities are in the fight, in team order. Empty means none. */
  casters?: readonly ActiveCaster[];
  /**
   * Whether abilities fire themselves. Shipped on; here it is earned.
   *
   * Taken at construction rather than left to a setter, for the reason
   * `autoBurst` is: an effect that switched it afterwards would run against a
   * null loop on mount and drop the player's earned choice for a frame.
   */
  autoCast?: boolean;
  /**
   * The chest roll, and the only randomness in the fight.
   *
   * An argument because everything random in this engine is one. The default
   * is **deterministic rather than `Math.random`** — a fight built without one
   * still drops chests, and drops the same ones twice, which is what the
   * parity suite and the offline estimator need. The shell passes the real
   * thing; see `App.tsx`.
   */
  random?: () => number;
}

export class Simulation {
  private heroes: HeroEntity[];
  private enemy: Enemy;
  private vitals: TeamVitals;
  private readonly enemyHpMult: number;
  private incomingMult: number;
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
  private readonly actives = new HeroActiveClock();
  private casters: readonly ActiveCaster[];
  private readonly random: () => number;

  constructor(options: SimulationOptions = { heroes: [] }) {
    this.burst = new BurstMeter(options.autoBurst ?? false);
    this.enemyHpMult = options.enemyHpMult ?? 1;
    this.incomingMult = options.incomingMult ?? 0;
    this.casters = options.casters ?? [];
    this.random = options.random ?? seededRandom();
    if (options.autoCast !== undefined) this.actives.setAutoCast(options.autoCast);
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
    // Abilities first: a guard raised this step has to be up *before* the
    // monster swings, or `frontline_ward` is always one step late.
    const cast = applyActives(this.actives, elapsedMs, this.casters, this.enemy, this.vitals);
    this.enemy = cast.enemy;
    this.vitals = cast.vitals;

    // A live guard multiplies the chain rather than joining it: the chain is
    // a property of the roster and this is a property of the last few seconds.
    const incoming = this.incomingMult * (1 - this.actives.damageReduction());
    const survival = applyIncoming(this.vitals, this.enemy.wave, incoming, elapsedMs);
    this.vitals = survival.vitals;
    if (survival.died) this.wipe();

    const step = scheduleSwings(this.heroes, elapsedMs);
    this.heroes = step.heroes;
    // The buff multiplies the swing rather than the hero, so it rises and
    // lapses without rebuilding the roster.
    const buff = this.actives.damageMultiplier();
    for (const swing of step.swings) this.land(swing.hero.damagePerHit.mul(buff), swing.hero.uid, swing.atMs);

    // A window that closed with nobody pressing; see `BurstMeter`.
    const fired = this.burst.tick(this.elapsedMs);
    if (fired) this.detonate(fired.multiplier, fired.seconds);

    // Retarget after the step so a hero whose target died is pointed at
    // whatever replaced it rather than holding a stale id into the next frame.
    this.heroes = this.heroes.map(hero =>
      hero.targetId === this.enemy.id ? hero : { ...hero, targetId: this.enemy.id },
    );
  }

  /** Whether a lapsed BURST window fires itself. Earned, and then chosen. */
  setAutoBurst(on: boolean): void {
    this.burst.setAutomated(on);
  }

  /**
   * The player pressed a hero's ability.
   *
   * Refused — changing nothing, the cooldown included — for a hero who is
   * benched or not ready, so a mistimed press is not a punished one. Goes
   * through the same seam auto-cast does, so pressing is never worse than
   * leaving it alone.
   */
  castHeroActive(uid: string): boolean {
    const cast = castOne(this.actives, uid, this.casters, this.enemy, this.vitals);
    if (cast === null) return false;
    this.enemy = cast.enemy;
    this.vitals = cast.vitals;
    return true;
  }

  /**
   * Whether abilities fire themselves the moment they come up.
   *
   * Named for the automation rather than for the clock, because
   * `ui/architecture.test.ts` derives the gate from the method name: every
   * `setAuto…` the shell calls has to be an automation the player earned.
   */
  setAutoCastHeroActives(on: boolean): void {
    this.actives.setAutoCast(on);
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

  /**
   * The player pressed BURST.
   *
   * Takes no time argument: the simulation owns the clock, and a caller
   * passing its own would be timing the window against a different one.
   */
  spendBurst(): { spent: boolean; multiplier: number; quality: BurstQuality } {
    const { payload, quality } = this.burst.spend(this.elapsedMs);
    if (payload) this.detonate(payload.multiplier, payload.seconds);
    return { spent: payload !== null, multiplier: payload?.multiplier ?? 1, quality };
  }

  /** Credit a stretch the tab spent hidden. See `creditAwayTime` for why. */
  creditAway(elapsedMs: number): void {
    // An offer nobody was present for; the retreat it followed already ran.
    this.rally.clear();
    const fight = { enemyHpMult: this.enemyHpMult, incomingMult: this.incomingMult, rates: this.earnings.rates };
    const team = { teamDps: teamDps(this.heroes), teamMaxHp: this.vitals.maxHp };
    const credit = creditAwayTime({ wave: this.enemy.wave, ...team, ...fight }, elapsedMs);
    if (credit.msCredited <= 0) return;

    this.elapsedMs += credit.msCredited;
    this.kills += credit.kills;
    this.deaths += credit.deaths;
    this.earnings.creditAway(credit.gold, credit.exp, credit.kills);
    // Charged after the clock moves, so the window that opens is open *now*
    // rather than at a moment that already passed while the tab was hidden.
    this.burst.creditAway(credit.kills, this.elapsedMs);
    this.restart(credit.wave);
    this.hits = [];
    this.heroes = this.heroes.map(hero => ({ ...hero, targetId: this.enemy.id }));
  }

  /**
   * A burst landing: seconds of the team's damage, multiplied. Goes through
   * the same path an ordinary swing does, so it kills, overkills and chains
   * waves identically — and the kill it lands charges the *next* burst, the
   * meter being already empty by the time this runs.
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
   * Damage arriving at the enemy, from whatever threw it. Shared by swings and
   * bursts so a kill is bookkept once: two copies of "did that kill it" is how
   * a burst ends up charging the meter it just spent, or healing twice.
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
    this.earnings.creditKill(this.enemy.wave, this.random);
    // The shipped game heals the team to full on a win, and so does the
    // estimator's round model. Matching it keeps the sawtooth the same shape.
    this.restart(this.enemy.wave + 1);
  }

  /**
   * A wipe. Counted, the retreat applied at once, and then put to the player —
   * applying it now rather than when the offer closes is what keeps this in
   * step with the offline estimator, which does not pause to ask.
   */
  private wipe(): void {
    this.deaths += 1;
    this.restart(this.rally.open(this.enemy.wave, this.elapsedMs));
  }

  /** A fresh enemy on `wave`, and the team back on their feet. */
  private restart(wave: number, healthFraction = 1): void {
    this.enemy = spawnEnemy(wave, this.enemyHpMult);
    this.vitals = { hp: this.vitals.maxHp.mul(healthFraction), maxHp: this.vitals.maxHp };
  }

  /** The player answered a rally offer. */
  decideWipe(choice: 'retreat' | 'rally'): boolean {
    const { answered, outcome } = this.rally.take(choice);
    if (outcome !== null) this.restart(outcome.wave, outcome.healthFraction);
    return answered;
  }

  /**
   * New numbers for the same fight, rather than a new fight.
   *
   * What this is for, and what a rebuild costs instead, is in `retune.ts`.
   * Everything not named by `FightTuning` survives untouched: the enemy's
   * health, the team's, every ability cooldown, the burst window, the boss
   * tell and the clock.
   */
  retune(next: FightTuning): void {
    const tuned = retuneFight({ heroes: this.heroes, vitals: this.vitals }, next);
    this.heroes = tuned.heroes;
    this.vitals = tuned.vitals;
    this.incomingMult = next.incomingMult;
    this.casters = next.casters;
    this.earnings.rates = next.rates;
  }

  /**
   * Take the run's earnings out, to be put in the save's wallet.
   *
   * Zeroes the run's tally in the same breath, which is the point: the two
   * must never both hold the same coin. See `RunEarnings.bank`.
   */
  bank(): BankedRun {
    return { ...this.earnings.bank(), wave: this.enemy.wave };
  }

  /**
   * Restore a share of the team's maximum. A potion, from outside the fight.
   *
   * The team's health lives here and not on the save, so a usable item that
   * heals has to reach the simulation rather than change a number in storage.
   * Clamped at full by `healTeam`, and a share rather than an amount because
   * that is what the item promises.
   */
  heal(fraction: number): void {
    this.vitals = healTeam(this.vitals, fraction);
  }

  /** The current read model. Callers must treat it as immutable. */
  read(): SimulationSnapshot {
    const earned = this.earnings.read();
    const counts = { kills: this.kills, deaths: this.deaths, dealt: this.dealt, overkill: this.overkill };
    return {
      ...emptySnapshot(),
      elapsedMs: this.elapsedMs,
      wave: this.enemy.wave,
      ticks: this.ticks,
      enemy: { id: this.enemy.id, wave: this.enemy.wave, hp: this.enemy.hp, maxHp: this.enemy.maxHp },
      team: { hp: this.vitals.hp, maxHp: this.vitals.maxHp },
      heroes: heroViews(this.heroes),
      hits: this.hits,
      abilities: this.actives.view(this.casters),
      burst: this.burst.view(this.elapsedMs),
      wipe: this.rally.view(this.elapsedMs),
      boss: this.boss.view(this.elapsedMs),
      totals: totalsView(counts, earned, this.earnings.spoils()),
    };
  }
}
