import Decimal from 'break_eternity.js';
import { advanceAttackTimer } from './combat/attackTimer';
import { applyHit, spawnEnemy, type Enemy } from './combat/encounter';
import { swingProgress } from './combat/attackTimer';
import type { HeroEntity } from './entities/HeroEntity';
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
}

/** One hero's swing, placed on the step's timeline. */
interface ScheduledSwing {
  hero: HeroEntity;
  atMs: number;
}

export class Simulation {
  private heroes: HeroEntity[];
  private enemy: Enemy;
  private readonly enemyHpMult: number;
  private elapsedMs = 0;
  private ticks = 0;
  private kills = 0;
  private dealt = new Decimal(0);
  private overkill = new Decimal(0);
  private hits: HitEvent[] = [];

  constructor(options: SimulationOptions = { heroes: [] }) {
    this.enemyHpMult = options.enemyHpMult ?? 1;
    this.enemy = spawnEnemy(options.startWave ?? 1, this.enemyHpMult);
    this.heroes = options.heroes.map(hero => ({ ...hero, targetId: this.enemy.id }));
  }

  /** Advances the simulation by `elapsedMs`. Pure with respect to the clock. */
  advance(elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;

    this.elapsedMs += elapsedMs;
    this.ticks += 1;
    this.hits = [];

    for (const swing of this.scheduleSwings(elapsedMs)) this.resolve(swing);

    // Retarget after the step so a hero whose target died is pointed at
    // whatever replaced it rather than holding a stale id into the next frame.
    this.heroes = this.heroes.map(hero =>
      hero.targetId === this.enemy.id ? hero : { ...hero, targetId: this.enemy.id },
    );
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
  }

  /** The current read model. Callers must treat it as immutable. */
  read(): SimulationSnapshot {
    return {
      ...emptySnapshot(),
      elapsedMs: this.elapsedMs,
      wave: this.enemy.wave,
      ticks: this.ticks,
      enemy: { id: this.enemy.id, wave: this.enemy.wave, hp: this.enemy.hp, maxHp: this.enemy.maxHp },
      heroes: this.heroes.map(hero => ({
        uid: hero.uid,
        swingProgress: swingProgress(hero.timer),
        damagePerHit: hero.damagePerHit,
        targetId: hero.targetId,
      })),
      hits: this.hits,
      totals: { kills: this.kills, dealt: this.dealt, overkill: this.overkill },
    };
  }
}
