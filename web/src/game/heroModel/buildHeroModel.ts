import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { BUILD_WIDTH, type HeroModelSpec } from './spec';

/**
 * Assemble a hero from primitives.
 *
 * Proportions are driven off height in heads, the way figure drawing does it,
 * so a slight mage and a huge berserker stay anatomically coherent instead of
 * being the same doll at different scales. Everything else comes from the
 * spec, which was read off the hero's portrait.
 */

const HEADS_TALL = 7.2;

function material(scene: Scene, name: string, hex: string, glow = 0): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = Color3.FromHexString(hex);
  mat.specularColor = new Color3(0.18, 0.18, 0.2);
  if (glow > 0) mat.emissiveColor = Color3.FromHexString(hex).scale(glow);
  return mat;
}

interface Kit {
  scene: Scene;
  root: TransformNode;
  /** Head height: the unit every proportion is expressed in. */
  unit: number;
  width: number;
}

function place(mesh: Mesh, kit: Kit, x: number, y: number, z: number): Mesh {
  mesh.parent = kit.root;
  mesh.position = new Vector3(x, y, z);
  return mesh;
}

function buildLegs(kit: Kit, spec: HeroModelSpec): void {
  const { scene, unit, width } = kit;
  const legMat = material(scene, `${spec.heroId}-legs`, spec.legs.colour);
  const hip = unit * 3.05;

  if (spec.legs.style === 'robe') {
    // A robe is one volume to the floor, wider at the hem — the silhouette a
    // mage reads by, and quite different from two legs.
    const robe = CreateCylinder(
      `${spec.heroId}-robe`,
      { height: hip, diameterTop: unit * 1.1 * width, diameterBottom: unit * 2.1 * width, tessellation: 16 },
      scene,
    );
    robe.material = legMat;
    place(robe, kit, 0, hip / 2, 0);
    return;
  }

  const thickness = unit * (spec.legs.style === 'greaves' ? 0.42 : 0.36) * width;
  for (const side of [-1, 1]) {
    const leg = CreateCylinder(
      `${spec.heroId}-leg${side}`,
      { height: hip, diameterTop: thickness * 1.15, diameterBottom: thickness * 0.85, tessellation: 12 },
      scene,
    );
    leg.material = legMat;
    place(leg, kit, side * unit * 0.32 * width, hip / 2, 0);

    const foot = CreateBox(
      `${spec.heroId}-foot${side}`,
      { width: thickness * 1.1, height: unit * 0.18, depth: unit * 0.62 },
      scene,
    );
    foot.material = material(scene, `${spec.heroId}-foot-m`, '#3a2e24');
    place(foot, kit, side * unit * 0.32 * width, unit * 0.09, -unit * 0.14);
  }
}

function buildTorso(kit: Kit, spec: HeroModelSpec): void {
  const { scene, unit, width } = kit;
  const hip = unit * 3.05;
  const torsoHeight = unit * 2.7;
  const chestW = unit * 1.55 * width;
  const waistW = unit * 1.05 * width;

  // Tapered: shoulders wide, waist narrow. A box would read as a crate.
  const torso = CreateCylinder(
    `${spec.heroId}-torso`,
    { height: torsoHeight, diameterTop: chestW, diameterBottom: waistW, tessellation: 12 },
    scene,
  );
  torso.material = material(scene, `${spec.heroId}-torso-m`, spec.torso.primary);
  torso.scaling.z = 0.62;
  place(torso, kit, 0, hip + torsoHeight / 2, 0);

  // Plate and mail get a chest overlay in the secondary colour; cloth does not.
  if (spec.torso.armour === 'plate' || spec.torso.armour === 'mail') {
    const plate = CreateCylinder(
      `${spec.heroId}-plate`,
      { height: torsoHeight * 0.62, diameterTop: chestW * 1.06, diameterBottom: waistW * 1.2, tessellation: 12 },
      scene,
    );
    plate.material = material(scene, `${spec.heroId}-plate-m`, spec.torso.secondary);
    plate.scaling.z = 0.64;
    place(plate, kit, 0, hip + torsoHeight * 0.68, 0);
  } else {
    // Cloth and leather get crossed straps instead — the read on a gambeson.
    for (const lean of [1, -1]) {
      const strap = CreateBox(
        `${spec.heroId}-strap${lean}`,
        { width: unit * 0.22 * width, height: torsoHeight * 0.95, depth: unit * 0.1 },
        scene,
      );
      strap.material = material(scene, `${spec.heroId}-strap-m`, spec.torso.secondary);
      strap.rotation.z = lean * 0.42;
      place(strap, kit, 0, hip + torsoHeight * 0.55, -chestW * 0.3);
    }
  }
}

function buildArms(kit: Kit, spec: HeroModelSpec): void {
  const { scene, unit, width } = kit;
  const shoulderY = unit * 5.5;
  // Clear of the torso: at 0.82 the arms sat inside the chest volume and the
  // figure read as a barrel with pauldrons stuck to it.
  const shoulderX = unit * 1.02 * width;
  const armMat = material(scene, `${spec.heroId}-arm`, spec.torso.primary);
  const pauldronMat = material(scene, `${spec.heroId}-pauldron`, spec.pauldrons.colour);

  for (const side of [-1, 1]) {
    const upper = CreateCylinder(
      `${spec.heroId}-upper${side}`,
      { height: unit * 1.25, diameterTop: unit * 0.38 * width, diameterBottom: unit * 0.3 * width, tessellation: 10 },
      scene,
    );
    upper.material = armMat;
    place(upper, kit, side * shoulderX, shoulderY - unit * 0.7, 0);

    const fore = CreateCylinder(
      `${spec.heroId}-fore${side}`,
      { height: unit * 1.15, diameterTop: unit * 0.3 * width, diameterBottom: unit * 0.26 * width, tessellation: 10 },
      scene,
    );
    fore.material = armMat;
    // Forearms angle in toward whatever the hands are holding.
    fore.rotation.z = side * -0.18;
    place(fore, kit, side * shoulderX * 0.92, shoulderY - unit * 1.9, -unit * 0.12);

    const hand = CreateSphere(`${spec.heroId}-hand${side}`, { diameter: unit * 0.3, segments: 8 }, scene);
    hand.material = material(scene, `${spec.heroId}-skin-h`, spec.skin);
    place(hand, kit, side * shoulderX * 0.85, shoulderY - unit * 2.5, -unit * 0.18);

    if (spec.pauldrons.size > 0) {
      // Two stacked lames rather than one egg. Layered plate is the read on
      // almost every armoured portrait in the roster.
      for (const [lame, drop] of [
        [1, 0],
        [0.82, 0.3],
      ] as [number, number][]) {
        const pauldron = CreateSphere(
          `${spec.heroId}-pd${side}-${lame}`,
          { diameter: unit * spec.pauldrons.size * width * lame, segments: 10 },
          scene,
        );
        pauldron.material = pauldronMat;
        pauldron.scaling.y = 0.42;
        pauldron.scaling.z = 0.88;
        place(pauldron, kit, side * shoulderX * 1.0, shoulderY + unit * (0.16 - drop * 0.55), 0);
      }

      // Spikes break the outline. This is how tier reads at a glance.
      for (let i = 0; i < spec.pauldrons.spikes; i += 1) {
        const spike = CreateCylinder(
          `${spec.heroId}-spike${side}-${i}`,
          { height: unit * 0.75, diameterTop: 0, diameterBottom: unit * 0.2, tessellation: 6 },
          scene,
        );
        spike.material = pauldronMat;
        const spread = (i - (spec.pauldrons.spikes - 1) / 2) * 0.5;
        spike.rotation.z = side * (0.5 + Math.abs(spread) * 0.25);
        spike.rotation.x = spread * 0.55;
        place(spike, kit, side * shoulderX * 1.25, shoulderY + unit * 0.3, spread * unit * 0.4);
      }
    }
  }
}

function buildHead(kit: Kit, spec: HeroModelSpec): void {
  const { scene, unit, width } = kit;
  const headY = unit * 6.6;
  const skinMat = material(scene, `${spec.heroId}-skin`, spec.skin);

  const neck = CreateCylinder(
    `${spec.heroId}-neck`,
    { height: unit * 0.32, diameter: unit * 0.38 * width, tessellation: 10 },
    scene,
  );
  neck.material = skinMat;
  place(neck, kit, 0, unit * 6.02, 0);

  const head = CreateSphere(`${spec.heroId}-head`, { diameter: unit * 0.95, segments: 14 }, scene);
  head.material = skinMat;
  head.scaling.z = 0.92;
  place(head, kit, 0, headY, 0);

  for (const side of [-1, 1]) {
    const eye = CreateSphere(`${spec.heroId}-eye${side}`, { diameter: unit * 0.1, segments: 6 }, scene);
    eye.material = material(scene, `${spec.heroId}-eye-m`, '#241d18');
    place(eye, kit, side * unit * 0.19, headY + unit * 0.06, -unit * 0.4);
  }

  if (spec.beard) {
    // Under the jaw and on the front half only. A sphere centred on the head
    // swallows the whole face and reads as a helmet.
    const beard = CreateSphere(`${spec.heroId}-beard`, { diameter: unit * 0.66, segments: 10 }, scene);
    beard.material = material(scene, `${spec.heroId}-beard-m`, spec.beard.colour);
    beard.scaling.y = 0.55 + spec.beard.length * 0.6;
    beard.scaling.z = 0.72;
    place(beard, kit, 0, headY - unit * 0.34, -unit * 0.16);
  }

  const hairMat = material(scene, `${spec.heroId}-hair`, spec.hair.colour);
  if (spec.hair.style !== 'bald') {
    // A skullcap sat back off the brow, not a lid centred on the crown — the
    // first version read as a bowl balanced on the head.
    const cap = CreateSphere(`${spec.heroId}-hair-m`, { diameter: unit * 0.99, segments: 12 }, scene);
    cap.material = hairMat;
    cap.scaling.y = spec.hair.style === 'wild' ? 0.85 : 0.6;
    place(cap, kit, 0, headY + unit * 0.22, unit * 0.12);

    if (spec.hair.style === 'long' || spec.hair.style === 'wild') {
      const fall = CreateBox(
        `${spec.heroId}-hairfall`,
        { width: unit * 0.82, height: unit * 1.15, depth: unit * 0.42 },
        scene,
      );
      fall.material = hairMat;
      place(fall, kit, 0, headY - unit * 0.45, unit * 0.28);
    }
    if (spec.hair.style === 'topknot') {
      const knot = CreateSphere(`${spec.heroId}-knot`, { diameter: unit * 0.42, segments: 8 }, scene);
      knot.material = hairMat;
      place(knot, kit, 0, headY + unit * 0.62, unit * 0.12);
    }
  }

  if (spec.head.gear === 'hood') {
    // A cowl: wider than the head, open at the front, falling to the shoulders.
    const hood = CreateSphere(`${spec.heroId}-hood`, { diameter: unit * 1.38, segments: 12 }, scene);
    hood.material = material(scene, `${spec.heroId}-hood-m`, spec.head.colour ?? spec.torso.secondary);
    hood.scaling.z = 1.05;
    place(hood, kit, 0, headY + unit * 0.08, unit * 0.2);
  } else if (spec.head.gear === 'helm' || spec.head.gear === 'horned') {
    const helm = CreateSphere(`${spec.heroId}-helm`, { diameter: unit * 1.08, segments: 12 }, scene);
    helm.material = material(scene, `${spec.heroId}-helm-m`, spec.head.colour ?? spec.pauldrons.colour);
    helm.scaling.y = 0.86;
    place(helm, kit, 0, headY + unit * 0.12, 0);

    if (spec.head.gear === 'horned') {
      for (const side of [-1, 1]) {
        const horn = CreateCylinder(
          `${spec.heroId}-horn${side}`,
          { height: unit * 1.05, diameterTop: 0, diameterBottom: unit * 0.22, tessellation: 6 },
          scene,
        );
        horn.material = material(scene, `${spec.heroId}-horn-m`, spec.head.colour ?? '#d8d2c4');
        horn.rotation.z = side * 0.75;
        place(horn, kit, side * unit * 0.48, headY + unit * 0.5, 0);
      }
    }
  } else if (spec.head.gear === 'crown') {
    const crown = CreateTorus(
      `${spec.heroId}-crown`,
      { diameter: unit * 0.98, thickness: unit * 0.13, tessellation: 12 },
      scene,
    );
    crown.material = material(scene, `${spec.heroId}-crown-m`, spec.head.colour ?? '#e7c463', 0.5);
    place(crown, kit, 0, headY + unit * 0.42, 0);
  }
}

function buildCloak(kit: Kit, spec: HeroModelSpec): void {
  if (!spec.cloak) return;
  const { scene, unit, width } = kit;
  const cloak = CreateCylinder(
    `${spec.heroId}-cloak`,
    {
      height: unit * spec.cloak.length,
      diameterTop: unit * 1.6 * width,
      diameterBottom: unit * 2.3 * width,
      tessellation: 14,
    },
    scene,
  );
  cloak.material = material(scene, `${spec.heroId}-cloak-m`, spec.cloak.colour);
  cloak.scaling.z = 0.5;
  // Behind the body, hanging from the shoulders.
  place(cloak, kit, 0, unit * 5.5 - (unit * spec.cloak.length) / 2, unit * 0.42 * width);
}

function buildWeapon(kit: Kit, spec: HeroModelSpec): void {
  const { scene, unit, width } = kit;
  const { kind, length, colour, glow } = spec.weapon;
  if (kind === 'none' || kind === 'fists') return;

  const handX = unit * 0.95 * width;
  const handY = unit * 3.6;
  const mat = material(scene, `${spec.heroId}-weapon`, colour, glow ? 0.65 : 0);
  const glowMat = glow ? material(scene, `${spec.heroId}-weapon-glow`, glow, 0.9) : mat;

  if (kind === 'staff' || kind === 'spear') {
    const shaft = CreateCylinder(
      `${spec.heroId}-shaft`,
      { height: unit * length, diameter: unit * 0.14, tessellation: 8 },
      scene,
    );
    shaft.material = mat;
    shaft.rotation.z = 0.22;
    place(shaft, kit, handX, handY + unit * length * 0.28, -unit * 0.18);

    const tip = CreateSphere(`${spec.heroId}-tip`, { diameter: unit * 0.4, segments: 10 }, scene);
    tip.material = glowMat;
    place(tip, kit, handX + unit * length * 0.24, handY + unit * length * 0.8, -unit * 0.18);
    return;
  }

  if (kind === 'bow') {
    const bow = CreateTorus(
      `${spec.heroId}-bow`,
      { diameter: unit * length * 0.9, thickness: unit * 0.1, tessellation: 20 },
      scene,
    );
    bow.material = mat;
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = 0.25;
    place(bow, kit, handX * 1.1, handY + unit * 0.9, -unit * 0.2);
    return;
  }

  // Bladed: held upright beside the body. An earlier version tilted the blade
  // and crossed it with a wide guard, which read as a letter A.
  const grip = CreateCylinder(
    `${spec.heroId}-grip`,
    { height: unit * 0.6, diameter: unit * 0.13, tessellation: 8 },
    scene,
  );
  grip.material = material(scene, `${spec.heroId}-grip-m`, '#3a2b20');
  place(grip, kit, handX, handY, -unit * 0.22);

  const guard = CreateBox(
    `${spec.heroId}-guard`,
    { width: unit * (kind === 'axe' ? 0.36 : 0.62), height: unit * 0.11, depth: unit * 0.14 },
    scene,
  );
  guard.material = mat;
  place(guard, kit, handX, handY + unit * 0.34, -unit * 0.22);

  if (kind === 'axe') {
    const head = CreateCylinder(
      `${spec.heroId}-axehead`,
      { height: unit * 0.16, diameterTop: unit * 1.0, diameterBottom: unit * 0.4, tessellation: 3 },
      scene,
    );
    head.material = glow ? glowMat : mat;
    head.rotation.x = Math.PI / 2;
    head.rotation.y = Math.PI / 2;
    place(head, kit, handX + unit * 0.18, handY + unit * length * 0.78, -unit * 0.22);

    const haft = CreateCylinder(
      `${spec.heroId}-haft`,
      { height: unit * length, diameter: unit * 0.12, tessellation: 8 },
      scene,
    );
    haft.material = material(scene, `${spec.heroId}-haft-m`, '#3a2b20');
    place(haft, kit, handX, handY + unit * length * 0.4, -unit * 0.22);
  } else {
    const blade = CreateBox(
      `${spec.heroId}-blade`,
      { width: unit * (kind === 'greatsword' ? 0.3 : 0.2), height: unit * length, depth: unit * 0.07 },
      scene,
    );
    blade.material = glow ? glowMat : mat;
    place(blade, kit, handX, handY + unit * 0.4 + (unit * length) / 2, -unit * 0.22);

    const point = CreateCylinder(
      `${spec.heroId}-point`,
      {
        height: unit * 0.34,
        diameterTop: 0,
        diameterBottom: unit * (kind === 'greatsword' ? 0.3 : 0.2),
        tessellation: 4,
      },
      scene,
    );
    point.material = blade.material;
    place(point, kit, handX, handY + unit * 0.4 + unit * length + unit * 0.17, -unit * 0.22);
  }
}

function buildOffhand(kit: Kit, spec: HeroModelSpec): void {
  const { scene, unit, width } = kit;
  const { kind, colour, trim } = spec.offhand;
  if (kind === 'none') return;

  const x = -unit * 1.28 * width;
  const y = unit * 3.9;
  const mat = material(scene, `${spec.heroId}-offhand`, colour);

  if (kind === 'orb') {
    const orb = CreateSphere(`${spec.heroId}-orb`, { diameter: unit * 0.55, segments: 12 }, scene);
    orb.material = material(scene, `${spec.heroId}-orb-m`, colour, 0.8);
    place(orb, kit, x, y, -unit * 0.3);
    return;
  }

  const scale = kind === 'tower' ? 1.7 : kind === 'kite' ? 1.4 : 1.15;

  if (kind === 'round') {
    const disc = CreateCylinder(
      `${spec.heroId}-shield`,
      { height: unit * 0.12, diameter: unit * 1.5 * scale, tessellation: 20 },
      scene,
    );
    disc.material = mat;
    disc.rotation.x = Math.PI / 2;
    place(disc, kit, x, y, -unit * 0.5);
  } else {
    // A kite is a tall panel that tapers to a point. Built as a board plus a
    // cone rather than a low-tessellation cylinder, which read as a hexagon.
    const board = CreateBox(
      `${spec.heroId}-shield`,
      { width: unit * 1.0 * scale, height: unit * 1.35 * scale, depth: unit * 0.12 },
      scene,
    );
    board.material = mat;
    place(board, kit, x, y + unit * 0.3, -unit * 0.5);

    const tip = CreateCylinder(
      `${spec.heroId}-shield-tip`,
      { height: unit * 0.85 * scale, diameterTop: unit * 1.0 * scale, diameterBottom: 0, tessellation: 4 },
      scene,
    );
    tip.material = mat;
    tip.rotation.y = Math.PI / 4;
    tip.scaling.z = 0.12 / (1.0 * scale);
    place(tip, kit, x, y - unit * 0.78 * scale, -unit * 0.5);
  }

  const boss = CreateSphere(`${spec.heroId}-boss`, { diameter: unit * 0.34, segments: 10 }, scene);
  boss.material = material(scene, `${spec.heroId}-boss-m`, trim ?? '#9aa3ad');
  place(boss, kit, x, y + unit * 0.3, -unit * 0.62);
}

function buildAura(kit: Kit, spec: HeroModelSpec): void {
  if (!spec.emissive || spec.emissive.orbits <= 0) return;
  const { scene, unit, width } = kit;
  const mat = material(scene, `${spec.heroId}-aura`, spec.emissive.colour, spec.emissive.intensity);

  for (let i = 0; i < spec.emissive.orbits; i += 1) {
    const ring = CreateTorus(
      `${spec.heroId}-ring${i}`,
      { diameter: unit * (3.2 + i * 0.9) * width, thickness: unit * 0.07, tessellation: 28 },
      scene,
    );
    ring.material = mat;
    ring.rotation.x = 0.5 + i * 0.6;
    ring.rotation.z = i * 0.7;
    place(ring, kit, 0, unit * (3.6 + i * 0.5), 0);
  }
}

export function buildHeroModel(scene: Scene, spec: HeroModelSpec): TransformNode {
  const root = new TransformNode(`hero-${spec.heroId}`, scene);
  const kit: Kit = {
    scene,
    root,
    unit: spec.height / HEADS_TALL,
    width: BUILD_WIDTH[spec.build],
  };

  buildCloak(kit, spec);
  buildLegs(kit, spec);
  buildTorso(kit, spec);
  buildArms(kit, spec);
  buildHead(kit, spec);
  buildWeapon(kit, spec);
  buildOffhand(kit, spec);
  buildAura(kit, spec);

  return root;
}
