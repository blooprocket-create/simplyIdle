import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';

import { ENEMY_POSITION, RANK_X } from '../layout/battleLine';
import type { DeviceProfile } from '../device/DeviceProfile';

/**
 * The set: camera, light and ground.
 *
 * Framed from the numbers the layout already publishes rather than from a
 * hand-tuned constant, so moving a rank moves the camera with it instead of
 * quietly pushing the back line out of shot.
 */

export interface Stage {
  camera: ArcRotateCamera;
  dispose(): void;
}

/** Headroom either side of the outermost actors. */
export const FRAMING_MARGIN = 2.4;

/**
 * The ground runs well past the framing on purpose. Sized to the fight, its
 * near edge sits between the camera and the line and draws a hard horizon
 * across the middle of the shot.
 */
export const GROUND_DEPTH = 48;

/**
 * Swung off the axis on purpose. Everyone faces along the line, so a camera
 * placed square to it sees the whole cast in pure profile and every actor
 * reads as a post. A little under twenty degrees puts the heroes in three
 * quarter view without turning the enemy's back to the player.
 */
export const VIEW_ANGLE = 0.3;

export function buildStage(scene: Scene, profile: DeviceProfile): Stage {
  scene.clearColor = new Color4(0.043, 0.086, 0.125, 1);

  const left = RANK_X.back;
  const right = ENEMY_POSITION.x;
  const centre = (left + right) / 2;
  const span = right - left + FRAMING_MARGIN * 2;

  const camera = new ArcRotateCamera(
    'camera',
    -Math.PI / 2 + VIEW_ANGLE,
    Math.PI / 2.7,
    span * 0.98,
    new Vector3(centre, 1.0, 0),
    scene,
  );
  camera.lowerRadiusLimit = span * 0.6;
  camera.upperRadiusLimit = span * 2;
  camera.minZ = 0.5;

  const fill = new HemisphericLight('fill', new Vector3(0.2, 1, -0.4), scene);
  fill.intensity = 0.55;
  fill.groundColor = new Color3(0.08, 0.1, 0.14);

  const key = new DirectionalLight('key', new Vector3(-0.45, -1, 0.35), scene);
  key.position = new Vector3(6, 10, -6);
  key.intensity = profile.shadows ? 1.1 : 1.3;

  const groundMaterial = new StandardMaterial('ground', scene);
  groundMaterial.diffuseColor = new Color3(0.13, 0.22, 0.18);
  groundMaterial.specularColor = Color3.Black();
  const ground = CreateGround('ground', { width: span * 4, height: GROUND_DEPTH }, scene);
  ground.material = groundMaterial;
  ground.position.x = centre;
  ground.receiveShadows = profile.shadows;

  return {
    camera,
    dispose: () => {
      ground.dispose();
      groundMaterial.dispose();
      key.dispose();
      fill.dispose();
      camera.dispose();
    },
  };
}
