import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';

/**
 * What stands in for a hero the pack has no model for.
 *
 * Deliberately plain. An earlier attempt at this spent a long time trying to
 * make primitives read as a specific hero and never got there; the models are
 * authored elsewhere now, and a placeholder's job is to occupy the right
 * volume and be obviously provisional, not to audition for the part.
 *
 * So: a body, a head, and a rank-coloured base, sized to a person. It marks
 * the spot and it does not pretend.
 */

export interface PlaceholderOptions {
  /** Metres. A hero is about this tall. */
  height?: number;
  tint?: Color3;
}

export const PLACEHOLDER_HEIGHT = 1.8;

export function buildPlaceholder(scene: Scene, name: string, options: PlaceholderOptions = {}): TransformNode {
  const height = options.height ?? PLACEHOLDER_HEIGHT;
  const tint = options.tint ?? new Color3(0.42, 0.46, 0.54);

  const root = new TransformNode(`${name}-root`, scene);

  const material = new StandardMaterial(`${name}-material`, scene);
  material.diffuseColor = tint;
  material.specularColor = Color3.Black();

  // Thirds of a person: legs to 45%, torso to 85%, head above that.
  const legsHeight = height * 0.45;
  const torsoHeight = height * 0.4;
  const headHeight = height - legsHeight - torsoHeight;

  const legs = CreateBox(`${name}-legs`, { width: 0.5, depth: 0.34, height: legsHeight }, scene);
  legs.material = material;
  legs.position = new Vector3(0, legsHeight / 2, 0);
  legs.parent = root;

  const torso = CreateBox(`${name}-torso`, { width: 0.64, depth: 0.4, height: torsoHeight }, scene);
  torso.material = material;
  torso.position = new Vector3(0, legsHeight + torsoHeight / 2, 0);
  torso.parent = root;

  const head = CreateBox(`${name}-head`, { width: 0.34, depth: 0.32, height: headHeight }, scene);
  head.material = material;
  head.position = new Vector3(0, legsHeight + torsoHeight + headHeight / 2, 0);
  head.parent = root;

  const base = CreateCylinder(`${name}-base`, { diameter: 0.9, height: 0.04, tessellation: 20 }, scene);
  base.material = material;
  base.position = new Vector3(0, 0.02, 0);
  base.parent = root;

  return root;
}
