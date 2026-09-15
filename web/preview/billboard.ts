import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import '@babylonjs/core/Rendering/edgesRenderer';

/**
 * The other way to put a hero on the battle line: use the painting.
 *
 * The portraits are finished art. Reproducing them from primitives throws
 * that away and lands somewhere between a chess piece and a Lego minifig.
 * A lit, grounded billboard keeps every brushstroke the artist made.
 */

const canvas = document.getElementById('c') as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.07, 0.08, 0.1, 1);

const hero = new URLSearchParams(location.search).get('hero') ?? 'KaelIronheart';

const camera = new ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 2.25, 5.4, new Vector3(0, 1.35, 0), scene);
camera.fov = 0.72;

const fill = new HemisphericLight('fill', new Vector3(0.2, 1, -0.3), scene);
fill.intensity = 0.9;
fill.groundColor = new Color3(0.14, 0.15, 0.2);
const key = new DirectionalLight('key', new Vector3(-0.5, -0.9, 0.4), scene);
key.intensity = 0.8;

const ground = CreateGround('g', { width: 16, height: 16 }, scene);
const groundMat = new StandardMaterial('gm', scene);
groundMat.diffuseColor = new Color3(0.13, 0.14, 0.18);
groundMat.specularColor = new Color3(0.02, 0.02, 0.03);
ground.material = groundMat;

// The hero: a plane carrying the portrait, standing on the ground.
const card = CreatePlane('hero', { width: 2.1, height: 2.4 }, scene);
card.position = new Vector3(0, 1.35, 0);
const cardMat = new StandardMaterial('heroMat', scene);
const tex = new Texture(`/next/heroes/${hero}.png`, scene, false, false);
// Babylon's plane UVs run the other way, so the portrait arrives upside down.
tex.vScale = -1;
tex.vOffset = 1;
// Crop in on the figure: the portraits are square and carry a lot of painted
// backdrop that a billboard does not want.
tex.uScale = 0.72;
tex.uOffset = 0.14;
tex.vScale = -0.82;
tex.vOffset = 0.9;
tex.hasAlpha = true;
cardMat.diffuseTexture = tex;
cardMat.emissiveTexture = tex;
cardMat.emissiveColor = new Color3(0.42, 0.42, 0.42);
cardMat.specularColor = new Color3(0, 0, 0);
cardMat.backFaceCulling = false;
card.material = cardMat;

// A contact shadow so the figure sits on the floor instead of hovering.
const blob = CreateGround('blob', { width: 1.7, height: 0.9 }, scene);
blob.position = new Vector3(0, 0.02, 0.1);
const blobMat = new StandardMaterial('blobMat', scene);
blobMat.diffuseColor = new Color3(0, 0, 0);
blobMat.specularColor = new Color3(0, 0, 0);
blobMat.alpha = 0.42;
blob.material = blobMat;

scene.executeWhenReady(() => {
  for (let frame = 0; frame < 3; frame += 1) scene.render();
  (window as unknown as { __ready: boolean }).__ready = true;
});
engine.runRenderLoop(() => scene.render());
