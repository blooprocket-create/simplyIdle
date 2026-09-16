import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';

import { BUILD_MASS, type Silhouette } from '../models/silhouette';

/**
 * A placeholder assembled from its description.
 *
 * Low-poly on purpose: boxes, cylinders and a few spheres, no smoothing, no
 * subdivision. The job is an outline that reads at gameplay distance — bulk,
 * stance, headgear, weapon shape — not a model. A GLB replaces it the moment
 * the pack has one, and nothing else in the renderer changes.
 */

function material(scene: Scene, name: string, rgb: [number, number, number]): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = new Color3(...rgb);
  m.specularColor = Color3.Black();
  return m;
}

function box(
  scene: Scene,
  name: string,
  size: { width: number; height: number; depth: number },
  at: Vector3,
  parent: TransformNode,
  skin: StandardMaterial,
): Mesh {
  const mesh = CreateBox(name, size, scene);
  mesh.position = at;
  mesh.parent = parent;
  mesh.material = skin;
  return mesh;
}

export function buildSilhouette(scene: Scene, name: string, spec: Silhouette): TransformNode {
  const root = new TransformNode(`${name}-root`, scene);
  const mass = BUILD_MASS[spec.build];
  const h = spec.height;
  const w = mass.width;
  const d = mass.depth;

  const primary = material(scene, `${name}-primary`, spec.palette.primary);
  const secondary = material(scene, `${name}-secondary`, spec.palette.secondary);
  const accent = material(scene, `${name}-accent`, spec.palette.accent);

  const legsH = h * 0.44;
  const torsoH = h * 0.36;
  const headH = h - legsH - torsoH;
  const shoulder = 0.46 * w;

  box(
    scene,
    `${name}-legs`,
    { width: 0.38 * w, height: legsH, depth: 0.3 * d },
    new Vector3(0, legsH / 2, 0),
    root,
    secondary,
  );
  box(
    scene,
    `${name}-torso`,
    { width: shoulder, height: torsoH, depth: 0.34 * d },
    new Vector3(0, legsH + torsoH / 2, 0),
    root,
    primary,
  );
  box(
    scene,
    `${name}-head`,
    { width: 0.2 * w, height: headH * 0.78, depth: 0.2 * d },
    new Vector3(0, legsH + torsoH + headH * 0.39, 0),
    root,
    secondary,
  );

  // Bulk reads as bulk only if it sits on the shoulders.
  if (spec.build === 'broad' || spec.build === 'hulking') {
    for (const side of [-1, 1]) {
      box(
        scene,
        `${name}-pauldron${side}`,
        { width: 0.16 * w, height: 0.14, depth: 0.3 * d },
        new Vector3(side * shoulder * 0.52, legsH + torsoH * 0.9, 0),
        root,
        primary,
      );
    }
  }

  const crown = legsH + torsoH + headH * 0.8;
  if (spec.headgear === 'helm' || spec.headgear === 'horned') {
    box(
      scene,
      `${name}-helm`,
      { width: 0.23 * w, height: headH * 0.46, depth: 0.23 * d },
      new Vector3(0, crown - headH * 0.1, 0),
      root,
      primary,
    );
  }
  if (spec.headgear === 'horned') {
    for (const side of [-1, 1]) {
      const horn = CreateCylinder(
        `${name}-horn${side}`,
        { diameterBottom: 0.07, diameterTop: 0, height: 0.3, tessellation: 6 },
        scene,
      );
      horn.position = new Vector3(side * 0.11 * w, crown + 0.12, 0);
      horn.rotation.z = side * 0.5;
      horn.parent = root;
      horn.material = accent;
    }
  }
  if (spec.headgear === 'hood') {
    const hood = CreateCylinder(
      `${name}-hood`,
      { diameterBottom: 0.34 * w, diameterTop: 0.05, height: headH * 1.15, tessellation: 7 },
      scene,
    );
    hood.position = new Vector3(0, crown - headH * 0.22, 0);
    hood.parent = root;
    hood.material = secondary;
  }
  if (spec.headgear === 'crown') {
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2;
      const spike = CreateCylinder(
        `${name}-crown${i}`,
        { diameterBottom: 0.04, diameterTop: 0, height: 0.16, tessellation: 4 },
        scene,
      );
      spike.position = new Vector3(Math.cos(angle) * 0.1 * w, crown + 0.08, Math.sin(angle) * 0.1 * d);
      spike.parent = root;
      spike.material = accent;
    }
  }

  if (spec.cloak) {
    const cloak = box(
      scene,
      `${name}-cloak`,
      { width: shoulder * 1.02, height: (legsH + torsoH) * 0.82, depth: 0.05 },
      new Vector3(0, legsH * 0.75 + torsoH * 0.4, 0.2 * d),
      root,
      secondary,
    );
    cloak.rotation.x = -0.08;
  }

  // Weapons hang off the character's right, which is -x with the line facing
  // along +x. Shapes are exaggerated: at gameplay distance the weapon is most
  // of what separates one class from another.
  const hand = new Vector3(-shoulder * 0.72, legsH + torsoH * 0.5, -0.06 * d);
  const held = (nm: string, size: { width: number; height: number; depth: number }, offset: Vector3, mat = accent) =>
    box(scene, `${name}-${nm}`, size, hand.add(offset), root, mat);

  switch (spec.weapon) {
    case 'sword':
      held('blade', { width: 0.07, height: 0.95, depth: 0.03 }, new Vector3(0, 0.34, 0));
      break;
    case 'swordAndShield':
      held('blade', { width: 0.07, height: 0.95, depth: 0.03 }, new Vector3(0, 0.34, 0));
      box(
        scene,
        `${name}-shield`,
        { width: 0.07, height: 0.78, depth: 0.52 },
        new Vector3(shoulder * 0.72, legsH + torsoH * 0.55, 0),
        root,
        primary,
      );
      break;
    case 'greatsword':
      held('blade', { width: 0.11, height: 1.4, depth: 0.04 }, new Vector3(0, 0.55, 0));
      break;
    case 'axe':
      held('haft', { width: 0.06, height: 1.1, depth: 0.06 }, new Vector3(0, 0.42, 0), secondary);
      held('head', { width: 0.34, height: 0.3, depth: 0.06 }, new Vector3(-0.12, 0.88, 0));
      break;
    case 'spear':
      held('haft', { width: 0.05, height: 1.9, depth: 0.05 }, new Vector3(0, 0.5, 0), secondary);
      held('point', { width: 0.11, height: 0.3, depth: 0.05 }, new Vector3(0, 1.45, 0));
      break;
    case 'staff': {
      held('haft', { width: 0.055, height: 1.7, depth: 0.055 }, new Vector3(0, 0.42, 0), secondary);
      const orb = CreateSphere(`${name}-orb`, { diameter: 0.2, segments: 8 }, scene);
      orb.position = hand.add(new Vector3(0, 1.27, 0));
      orb.parent = root;
      orb.material = accent;
      break;
    }
    case 'bow': {
      const stave = CreateCylinder(`${name}-bow`, { diameter: 0.05, height: 1.5, tessellation: 6 }, scene);
      stave.position = hand.add(new Vector3(0, 0.3, 0));
      stave.rotation.x = 0.25;
      stave.parent = root;
      stave.material = accent;
      break;
    }
    case 'claws':
      for (const side of [-1, 1]) {
        for (let i = -1; i <= 1; i += 1) {
          const claw = CreateCylinder(
            `${name}-claw${side}${i}`,
            { diameterBottom: 0.05, diameterTop: 0, height: 0.26, tessellation: 4 },
            scene,
          );
          claw.position = new Vector3(side * shoulder * 0.62 + i * 0.05, legsH + torsoH * 0.2, -0.12 * d);
          claw.rotation.x = -1.2;
          claw.parent = root;
          claw.material = accent;
        }
      }
      break;
    case 'fists':
      for (const side of [-1, 1]) {
        box(
          scene,
          `${name}-fist${side}`,
          { width: 0.17, height: 0.17, depth: 0.17 },
          new Vector3(side * shoulder * 0.62, legsH + torsoH * 0.35, -0.08 * d),
          root,
          accent,
        );
      }
      break;
    case 'none':
    default:
      break;
  }

  return root;
}
