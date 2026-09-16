import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';

import type { Placement } from '../layout/battleLine';
import { createBar, type Bar } from './bars';

/**
 * A wind-up, above each hero's head.
 *
 * This is the thing the entity rewrite was for. The shipped combat applies
 * `dps * dt` continuously, so there is no swing to be part way through and
 * nothing a bar could show. A hero with their own timer has a wind-up, and a
 * wind-up is readable.
 */

const BAR_WIDTH = 0.9;
const BAR_HEIGHT = 0.1;
/**
 * Clear of the tallest thing a hero can be holding. A staff reaches well
 * above its owner's head, and a swing timer drawn through a weapon is a
 * timer nobody can read.
 */
const BAR_ABOVE = 2.62;
const FILL = new Color3(0.55, 0.78, 0.95);

export class CastBars {
  private readonly bars = new Map<string, Bar>();

  constructor(private readonly scene: Scene) {}

  /** Drops bars for anyone no longer present and creates them for anyone new. */
  sync(uids: readonly string[]): void {
    const wanted = new Set(uids);
    for (const [uid, bar] of this.bars) {
      if (wanted.has(uid)) continue;
      bar.dispose();
      this.bars.delete(uid);
    }
    for (const uid of uids) {
      if (this.bars.has(uid)) continue;
      this.bars.set(uid, createBar(this.scene, `castbar-${uid}`, BAR_WIDTH, BAR_HEIGHT, FILL));
    }
  }

  update(placements: Map<string, Placement>, progressByUid: Map<string, number>): void {
    for (const [uid, bar] of this.bars) {
      const placement = placements.get(uid);
      if (!placement) {
        bar.setEnabled(false);
        continue;
      }
      bar.setEnabled(true);
      bar.setPosition(placement.x, placement.y + BAR_ABOVE, placement.z);
      bar.setProgress(progressByUid.get(uid) ?? 0);
    }
  }

  dispose(): void {
    for (const bar of this.bars.values()) bar.dispose();
    this.bars.clear();
  }
}
