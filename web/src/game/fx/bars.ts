import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';

/**
 * One billboarded bar, used for both a swing timer and a health bar.
 *
 * Scaling a plane fattens it about its own centre, so a fill built that way
 * grows in both directions from the middle of the bar. Moving it by half of
 * whatever it grew pins its left edge where the bar starts.
 */

/** Babylon's BILLBOARDMODE_ALL. Named so the 7 is not a mystery. */
export const BILLBOARD_ALL = 7;

export interface Bar {
  pivot: TransformNode;
  setProgress(fraction: number): void;
  setPosition(x: number, y: number, z: number): void;
  setEnabled(enabled: boolean): void;
  setFill(colour: Color3): void;
  dispose(): void;
}

export function createBar(
  scene: Scene,
  name: string,
  width: number,
  height: number,
  fillColour: Color3,
  backingColour = new Color3(0.06, 0.08, 0.11),
): Bar {
  const pivot = new TransformNode(`${name}`, scene);
  pivot.billboardMode = BILLBOARD_ALL;

  const backingMaterial = new StandardMaterial(`${name}-backing-mat`, scene);
  backingMaterial.disableLighting = true;
  backingMaterial.emissiveColor = backingColour;
  backingMaterial.backFaceCulling = false;

  const fillMaterial = new StandardMaterial(`${name}-fill-mat`, scene);
  fillMaterial.disableLighting = true;
  fillMaterial.emissiveColor = fillColour;
  fillMaterial.backFaceCulling = false;

  const backing = CreatePlane(`${name}-backing`, { width, height }, scene);
  backing.material = backingMaterial;
  backing.isPickable = false;
  backing.parent = pivot;

  const fill = CreatePlane(`${name}-fill`, { width, height: height * 0.72 }, scene);
  fill.material = fillMaterial;
  fill.isPickable = false;
  fill.parent = pivot;

  return {
    pivot,
    setProgress(fraction: number) {
      const clamped = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
      fill.scaling.x = clamped;
      fill.position.set(-width / 2 + (width * clamped) / 2, 0, -0.01);
    },
    setPosition(x, y, z) {
      pivot.position.set(x, y, z);
    },
    setEnabled(enabled) {
      pivot.setEnabled(enabled);
    },
    setFill(colour) {
      fillMaterial.emissiveColor = colour;
    },
    dispose() {
      pivot.dispose(false, true);
      backingMaterial.dispose();
      fillMaterial.dispose();
    },
  };
}
