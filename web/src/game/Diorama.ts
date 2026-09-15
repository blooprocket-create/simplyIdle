import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4, Vector3 } from '@babylonjs/core/Maths/math';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { SimulationSnapshot } from '../engine/types';

/**
 * Phase 0 placeholder. It exists to prove the seam, not to look like anything:
 * a ground plane, a light, and one box per side of a fight that does not exist
 * yet.
 *
 * When Phase 2 replaces these boxes, the hero placeholders do NOT become
 * capsules. Every hero has authored portrait art — 65 PNGs in `IMG/HeroIcon/`,
 * mapped 1:1 to hero ids by `src/heroPortraits.ts` — and a placeholder is a
 * small assembly of primitives whose outline reads as that hero at gameplay
 * distance: bulk, stance, headgear, weapon shape. Kael Ironheart is armoured
 * bulk with pauldrons and a kite shield; Lunara Frostweave is a hooded cloak
 * and a staff on a slight frame, and the player should be able to tell them
 * apart on the battle line before a single GLB exists. The portraits are busts,
 * chest-up, so legs and stance have to be extrapolated. See REVAMP.md, Phase 2.
 *
 * The rule it establishes is the one that matters — `render` takes a snapshot
 * and draws it. It never decides an outcome, and nothing here is allowed to
 * call back into the simulation. Phase 2 replaces the boxes; the signature
 * stays.
 */
export class Diorama {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly hero: ReturnType<typeof CreateBox>;
  private readonly foe: ReturnType<typeof CreateBox>;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.043, 0.086, 0.125, 1);

    const camera = new ArcRotateCamera('camera', -Math.PI / 2.2, Math.PI / 2.6, 14, new Vector3(0, 1, 0), this.scene);
    camera.attachControl(canvas, false);

    const key = new HemisphericLight('key', new Vector3(0.4, 1, -0.3), this.scene);
    key.intensity = 0.9;

    const groundMaterial = new StandardMaterial('ground', this.scene);
    groundMaterial.diffuseColor = new Color3(0.13, 0.22, 0.18);
    groundMaterial.specularColor = Color3.Black();
    const ground = CreateGround('ground', { width: 40, height: 14 }, this.scene);
    ground.material = groundMaterial;

    this.hero = this.makeActor('hero', new Color3(0.37, 0.83, 0.54), -3);
    this.foe = this.makeActor('foe', new Color3(0.8, 0.42, 0.32), 3);

    this.engine.runRenderLoop(() => this.scene.render());
  }

  private makeActor(name: string, colour: Color3, x: number) {
    const material = new StandardMaterial(`${name}-material`, this.scene);
    material.diffuseColor = colour;
    material.specularColor = Color3.Black();
    const box = CreateBox(name, { width: 1, height: 2, depth: 1 }, this.scene);
    box.material = material;
    box.position = new Vector3(x, 1, 0);
    return box;
  }

  /** Draws the snapshot. Reads only; never writes back into the simulation. */
  render(snapshot: SimulationSnapshot): void {
    // Standing in for real actor state: both sides bob so it is visible at a
    // glance that the engine clock is reaching the renderer.
    const phase = snapshot.elapsedMs / 1000;
    this.hero.position.y = 1 + Math.sin(phase * 2) * 0.08;
    this.foe.position.y = 1 + Math.sin(phase * 2 + Math.PI) * 0.08;
  }

  resize(): void {
    this.engine.resize();
  }

  dispose(): void {
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
