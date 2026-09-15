import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { buildHeroModel } from '../src/game/heroModel/buildHeroModel';
import { PREVIEW_SPECS } from './heroes';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.07, 0.08, 0.1, 1);

const which = new URLSearchParams(location.search).get('hero') ?? PREVIEW_SPECS[0].heroId;
const spec = PREVIEW_SPECS.find(s => s.heroId === which) ?? PREVIEW_SPECS[0];

// Frame the whole figure: target mid-chest, back far enough for the feet and
// any headgear to stay in shot.
const camera = new ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 2.15, 5.2, new Vector3(0, 0.95, 0), scene);
camera.fov = 0.62;

const fill = new HemisphericLight('fill', new Vector3(0.2, 1, -0.3), scene);
fill.intensity = 0.72;
fill.groundColor = new Color3(0.16, 0.17, 0.22);
const key = new DirectionalLight('key', new Vector3(-0.55, -0.8, 0.5), scene);
key.intensity = 1.05;

const ground = CreateGround('g', { width: 14, height: 14 }, scene);
const groundMat = new StandardMaterial('gm', scene);
groundMat.diffuseColor = new Color3(0.12, 0.13, 0.16);
groundMat.specularColor = new Color3(0, 0, 0);
ground.material = groundMat;

buildHeroModel(scene, spec);

scene.executeWhenReady(() => {
  for (let frame = 0; frame < 3; frame += 1) scene.render();
  (window as unknown as { __ready: boolean }).__ready = true;
});
engine.runRenderLoop(() => scene.render());
