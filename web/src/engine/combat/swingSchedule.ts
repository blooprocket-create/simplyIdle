import { advanceAttackTimer } from './attackTimer';
import type { HeroEntity } from '../entities/HeroEntity';

/**
 * Placing a step's swings on a timeline.
 *
 * Lives here rather than in `Simulation` for the reason that file's header
 * gives: it owns the clock and delegates every rule, and "when in this step
 * did each hero swing" is a rule. It is also the last piece of combat the
 * coordinator still implemented itself.
 */

/** One hero's swing, placed on the step's timeline. */
export interface ScheduledSwing {
  hero: HeroEntity;
  atMs: number;
}

/**
 * Every swing due this step, in the order it happens, and the heroes with
 * their timers advanced.
 *
 * Sorted by time rather than walked hero by hero. Hero order would let the
 * first hero in the array spend all its swings before the second acts, so it
 * would land every killing blow and absorb every scrap of overkill — an
 * artefact of array position, visible on screen as one hero always finishing
 * the monster.
 */
export function scheduleSwings(
  heroes: readonly HeroEntity[],
  elapsedMs: number,
): { heroes: HeroEntity[]; swings: ScheduledSwing[] } {
  const swings: ScheduledSwing[] = [];

  const advanced = heroes.map(hero => {
    const step = advanceAttackTimer(hero.timer, elapsedMs);
    const first = hero.timer.intervalMs - hero.timer.bankedMs;
    for (let index = 0; index < step.attacks; index += 1) {
      swings.push({ hero, atMs: first + index * hero.timer.intervalMs });
    }
    return { ...hero, timer: step.timer };
  });

  return { heroes: advanced, swings: swings.sort((left, right) => left.atMs - right.atMs) };
}
