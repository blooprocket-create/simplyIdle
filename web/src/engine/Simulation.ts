import Decimal from 'break_eternity.js';
import { advanceAttackTimer, swingProgress } from './combat/attackTimer';
import { retreatWave } from './combat/chapters';
import { applyHit, spawnEnemy, type Enemy } from './combat/encounter';
import { applyIncoming, fullHealth, type TeamVitals } from './combat/survival';
import { nominalDps, type HeroEntity } from './entities/HeroEntity';
import { creditAwayTime } from './offline/awayCredit';
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
  heroes: readonly HeroEntity[];
  startWave?: number;
  /** Weekly event and other non-affix enemy HP scaling. */
  enemyHpMult?: number;
  /** Full team health. The team returns to this on a kill and on a wipe. */
  teamMaxHp?: Decimal;
  /** Enemy damage multiplier after the whole mitigation chain. */
  incomingMult?: number;
}

/** One hero's swing, placed on the step's timeline. */
interface ScheduledSwing {
  hero: HeroEntity;
  atMs: number;
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

  constructor(options: SimulationOptions = { heroes: [] }) {
    this.enemyHpMult = options.enemyHpMult ?? 1;
    this.incomingMult = options.incomingMult ?? 0;
    this.enemy = spawnEnemy(options.startWave ?? 1, this.enemyHpMult);
    this.vitals = fullHealth(options.teamMaxHp ?? new Decimal(100));
    this.heroes = options.heroes.map(hero => ({ ...hero, targetId: this.enemy.id }));
  }

  /** Advances the simulation by `elapsedMs`. Pure with respect to the clock. */
  advance(elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;

    this.elapsedMs += elapsedMs;
    this.ticks += 1;
    this.hits = [];

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

    for (const swing of this.scheduleSwings(elapsedMs)) this.resolve(swing);

    // Retarget after the step so a hero whose target died is pointed at
    // whatever replaced it rather than holding a stale id into the next frame.
    this.heroes = this.heroes.map(hero =>
      hero.targetId === this.enemy.id ? hero : { ...hero, targetId: this.enemy.id },
    );
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
    const credit = creditAwayTime(
      {
        wave: this.enemy.wave,
        teamDps: this.teamDps(),
        teamMaxHp: this.vitals.maxHp,
        enemyHpMult: this.enemyHpMult,
        incomingMult: this.incomingMult,
      },
      elapsedMs,
    );
    if (credit.msCredited <= 0) return;

    this.elapsedMs += credit.msCredited;
    this.kills += credit.kills;
    this.deaths += credit.deaths;
    this.enemy = spawnEnemy(credit.wave, this.enemyHpMult);
    this.vitals = fullHealth(this.vitals.maxHp);
    this.hits = [];
    this.heroes = this.heroes.map(hero => ({ ...hero, targetId: this.enemy.id }));
  }

  private teamDps(): Decimal {
    return this.heroes.reduce((total, hero) => total.add(nominalDps(hero)), new Decimal(0));
  }

  /**
   * Every swing due this step, in the order it happens.
   *
   * Sorted by time rather than walked hero by hero. Hero order would let the
   * first hero in the array spend all its swings before the second acts, so it
   * would land every killing blow and absorb every scrap of overkill — an
   * artefact of array position, visible on screen as one hero always finishing
   * the monster.
   */
  private scheduleSwings(elapsedMs: number): ScheduledSwing[] {
    const swings: ScheduledSwing[] = [];

    this.heroes = this.heroes.map(hero => {
      const step = advanceAttackTimer(hero.timer, elapsedMs);
      const first = hero.timer.intervalMs - hero.timer.bankedMs;
      for (let index = 0; index < step.attacks; index += 1) {
        swings.push({ hero, atMs: first + index * hero.timer.intervalMs });
      }
      return { ...hero, timer: step.timer };
    });

    return swings.sort((left, right) => left.atMs - right.atMs);
  }

  private resolve(swing: ScheduledSwing): void {
    const result = applyHit(this.enemy, swing.hero.damagePerHit);
    this.enemy = result.enemy;
    this.dealt = this.dealt.add(result.dealt);
    this.overkill = this.overkill.add(result.overkill);
    this.hits.push({
      heroUid: swing.hero.uid,
      dealt: result.dealt,
      overkill: result.overkill,
      killed: result.killed,
      atMs: swing.atMs,
    });

    if (!result.killed) return;
    this.kills += 1;
    this.enemy = spawnEnemy(this.enemy.wave + 1, this.enemyHpMult);
    // The shipped game heals the team to full on a win, and so does the
    // estimator's round model. Matching it keeps the sawtooth the same shape.
    this.vitals = fullHealth(this.vitals.maxHp);
  }

  /** A wipe: back to the start of the chapter, healed, and counted. */
  private wipe(): void {
    this.deaths += 1;
    this.enemy = spawnEnemy(retreatWave(this.enemy.wave), this.enemyHpMult);
    this.vitals = fullHealth(this.vitals.maxHp);
  }

  /** The current read model. Callers must treat it as immutable. */
  read(): SimulationSnapshot {
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
      totals: { kills: this.kills, deaths: this.deaths, dealt: this.dealt, overkill: this.overkill },
    };
  }
}
