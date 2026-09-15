import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';

import type { Placement } from '../layout/battleLine';

/**
 * A wind-up, above each hero's head.
 *
 * This is the thing the whole entity rewrite was for. The shipped combat
 * applies `dps * dt` continuously, so there is no swing to be part way
 * through and nothing a bar could show. A hero with their own timer has a
 * wind-up, and a wind-up is readable.
 */

const BILLBOARD_ALL = 7;
const BAR_WIDTH = 0.9;
const BAR_HEIGHT = 0.1;
const BAR_ABOVE = 2.15;

interface Bar {
  pivot: TransformNode;
  fill: Mesh;
  backing: Mesh;
}

export class CastBars {
  private readonly bars = new Map<string, Bar>();
  private readonly backingMaterial: StandardMaterial;
  private readonly fillMaterial: StandardMaterial;

  constructor(private readonly scene: Scene) {
    this.backingMaterial = new StandardMaterial('castbar-backing', scene);
    this.backingMaterial.disableLighting = true;
    this.backingMaterial.emissiveColor = new Color3(0.06, 0.08, 0.11);
    this.backingMaterial.backFaceCulling = false;

    this.fillMaterial = new StandardMaterial('castbar-fill', scene);
    this.fillMaterial.disableLighting = true;
    this.fillMaterial.emissiveColor = new Color3(0.55, 0.78, 0.95);
    this.fillMaterial.backFaceCulling = false;
  }

  /** Drops bars for anyone no longer present and creates them for anyone new. */
  sync(uids: readonly string[]): void {
    const wanted = new Set(uids);
    for (const [uid, bar] of this.bars) {
      if (wanted.has(uid)) continue;
      bar.pivot.dispose(false, true);
      this.bars.delete(uid);
    }
    for (const uid of uids) if (!this.bars.has(uid)) this.bars.set(uid, this.create(uid));
  }

  update(placements: Map<string, Placement>, progressByUid: Map<string, number>): void {
    for (const [uid, bar] of this.bars) {
      const placement = placements.get(uid);
      if (!placement) {
        bar.pivot.setEnabled(false);
        continue;
      }
      bar.pivot.setEnabled(true);
      bar.pivot.position.set(placement.x, placement.y + BAR_ABOVE, placement.z);
      const progress = Math.max(0, Math.min(1, progressByUid.get(uid) ?? 0));
      // Scaling alone fattens a plane about its own centre, so the fill would
      // grow in both directions from the middle of the bar. Moving it by half
      // of what it grew keeps its left edge pinned to the bar's left edge.
      bar.fill.scaling.x = progress;
      bar.fill.position.x = -BAR_WIDTH / 2 + (BAR_WIDTH * progress) / 2;
    }
  }

  private create(uid: string): Bar {
    const pivot = new TransformNode(`castbar-${uid}`, this.scene);
    pivot.billboardMode = BILLBOARD_ALL;

    const backing = CreatePlane(`castbar-${uid}-backing`, { width: BAR_WIDTH, height: BAR_HEIGHT }, this.scene);
    backing.material = this.backingMaterial;
    backing.isPickable = false;
    backing.parent = pivot;

    const fill = CreatePlane(`castbar-${uid}-fill`, { width: BAR_WIDTH, height: BAR_HEIGHT * 0.72 }, this.scene);
    fill.material = this.fillMaterial;
    fill.isPickable = false;
    fill.parent = pivot;
    fill.position = new Vector3(-BAR_WIDTH / 2, 0, -0.01);

    return { pivot, fill, backing };
  }

  dispose(): void {
    for (const bar of this.bars.values()) bar.pivot.dispose(false, true);
    this.bars.clear();
    this.backingMaterial.dispose();
    this.fillMaterial.dispose();
  }
}
