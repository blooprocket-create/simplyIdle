import type Decimal from 'break_eternity.js';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';

import { ENEMY_POSITION, RANK_X } from '../layout/battleLine';
import { createBar, type Bar } from './bars';
import { barFraction } from './ratio';

/**
 * How the fight is going.
 *
 * Without these the diorama showed damage flying and nothing else: no sense
 * of whether a kill was imminent, and a wipe that sent the team back a whole
 * chapter happened with nothing on screen to mark it. The engine has carried
 * `enemy.hp`, `team.hp` and a death count all along; this reads them.
 */

const ENEMY_BAR = { width: 2.0, height: 0.16, above: 2.9 };
const TEAM_BAR = { width: 3.2, height: 0.18, above: 3.0 };

const ENEMY_FILL = new Color3(0.78, 0.28, 0.26);
const TEAM_FILL = new Color3(0.36, 0.76, 0.48);
const TEAM_HURT = new Color3(0.86, 0.66, 0.24);
const TEAM_CRITICAL = new Color3(0.88, 0.26, 0.24);

/** How long the line stays lit after a wipe. */
export const WIPE_FLASH_MS = 700;

export class HealthBars {
  private readonly enemy: Bar;
  private readonly team: Bar;
  private sinceWipeMs = WIPE_FLASH_MS;
  private lastDeaths = 0;

  constructor(scene: Scene) {
    this.enemy = createBar(scene, 'enemy-health', ENEMY_BAR.width, ENEMY_BAR.height, ENEMY_FILL);
    this.team = createBar(scene, 'team-health', TEAM_BAR.width, TEAM_BAR.height, TEAM_FILL);
    // Centred over the line rather than over any one hero: the health is the
    // team's, and hanging it above one of them would read as that hero's.
    this.team.setPosition((RANK_X.back + RANK_X.front) / 2, TEAM_BAR.above, 0);
    this.enemy.setPosition(ENEMY_POSITION.x, ENEMY_BAR.above, ENEMY_POSITION.z);
  }

  /**
   * Advances the wipe flash. Cheap, and runs on every frame including the
   * ones the governor skips — a timer that only ticks when something is drawn
   * runs long exactly when the device is too busy to draw, which is when a
   * wipe is most likely.
   *
   * A wipe is instantaneous in the simulation: health returns to full in the
   * same step the team lost it, so there is no low bar to notice. The
   * cumulative death count is the only trace, which is also why a wipe on a
   * skipped frame is still caught — the count does not reset.
   */
  tick(deaths: number, stepMs: number): void {
    if (deaths > this.lastDeaths) this.sinceWipeMs = 0;
    else this.sinceWipeMs += stepMs;
    this.lastDeaths = deaths;
  }

  /** Writes the meshes. Only worth doing on a frame that will be drawn. */
  draw(enemy: { hp: Decimal; maxHp: Decimal } | null, team: { hp: Decimal; maxHp: Decimal }): void {
    this.enemy.setEnabled(enemy !== null);
    if (enemy) this.enemy.setProgress(barFraction(enemy.hp, enemy.maxHp));

    const remaining = barFraction(team.hp, team.maxHp);
    this.team.setEnabled(team.maxHp.gt(0));
    this.team.setProgress(remaining);

    const wiping = this.sinceWipeMs < WIPE_FLASH_MS;
    this.team.setFill(wiping || remaining < 0.25 ? TEAM_CRITICAL : remaining < 0.6 ? TEAM_HURT : TEAM_FILL);
  }

  dispose(): void {
    this.enemy.dispose();
    this.team.dispose();
  }
}
