import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';

import type { ModelManifest } from '../models/manifest';
import { CLASS_SILHOUETTE } from '../models/silhouette';
import { ModelLoader } from './ModelLoader';

/**
 * A one-node glTF, written inline rather than kept as a fixture, so the thing
 * being asserted about is visible in the same screen as the assertion. The
 * node carries a transform an artist authored — scaled to three, lifted two
 * metres — and the manifest entry adds a pack-level scale, lift and yaw on
 * top. Anything that overwrites rather than composes shows up here instead of
 * as a model that is mysteriously the wrong size in a screenshot.
 *
 * Babylon needs a plugin it can pick by extension; a `data:` URL carrying raw
 * glTF JSON is one the loader recognises by sniffing it.
 */
const AUTHORED_SCALE = 3;
const AUTHORED_LIFT = 2;
const PACK_SCALE = 0.5;
const PACK_LIFT = 1;
const PACK_YAW_DEGREES = 90;

const GLTF =
  'data:{"asset":{"version":"2.0"},"scene":0,"scenes":[{"nodes":[0]}],"nodes":[{"name":"Body","scale":[3,3,3],"translation":[0,2,0]}]}';

const PACK: ModelManifest = {
  // An empty root makes the url the file verbatim.
  root: '',
  models: {
    'hero/h1': { file: GLTF, scale: PACK_SCALE, yOffset: PACK_LIFT, yawOffset: PACK_YAW_DEGREES },
  },
};

describe('model loader', () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('hands back a root that starts where placement expects it to', async () => {
    // `ActorPool.place` assigns position and rotation outright and `Diorama`
    // assigns scaling outright for a boss. A root that arrived already
    // carrying the pack's transform would lose it on the first frame.
    const actor = await load().acquire(['hero/h1'], 'kael', CLASS_SILHOUETTE.warrior);
    expect(actor.provisional).toBe(false);
    expect(actor.root.scaling.x).toBe(1);
    expect(actor.root.position.y).toBe(0);
    expect(actor.root.rotation.y).toBe(0);
  });

  it('keeps the pack transform out of the reach of world placement', async () => {
    const actor = await load().acquire(['hero/h1'], 'kael', CLASS_SILHOUETTE.warrior);
    const authored = actor.root.getChildren()[0] as TransformNode;
    const before = {
      scale: authored.scaling.clone(),
      position: authored.position.clone(),
      yaw: authored.rotation.y,
    };

    // Exactly what the renderer does to an actor, every frame.
    actor.root.position.set(4, 0, -2);
    actor.root.rotation.y = Math.PI;
    actor.root.scaling.setAll(1.35);

    expect(authored.scaling.equals(before.scale)).toBe(true);
    expect(authored.position.equals(before.position)).toBe(true);
    expect(authored.rotation.y).toBe(before.yaw);
  });

  it('composes the pack transform with the one the artist exported', async () => {
    const actor = await load().acquire(['hero/h1'], 'kael', CLASS_SILHOUETTE.warrior);
    const pack = actor.root.getChildren()[0] as TransformNode;
    const artist = pack.getChildren()[0] as TransformNode;

    // The pack's scale and lift and yaw, applied once.
    expect(pack.scaling.x).toBeCloseTo(PACK_SCALE, 5);
    expect(pack.position.y).toBeCloseTo(PACK_LIFT, 5);
    expect(pack.rotation.y).toBeCloseTo((PACK_YAW_DEGREES * Math.PI) / 180, 5);
    // Babylon's own handedness flip rides on the same node, so a renderer that
    // reset this node's scaling would mirror the model as well as resize it.
    expect(pack.scaling.z).toBeCloseTo(-PACK_SCALE, 5);
    // And the artist's transform is still underneath, untouched.
    expect(artist.scaling.x).toBeCloseTo(AUTHORED_SCALE, 5);
    expect(artist.position.y).toBeCloseTo(AUTHORED_LIFT, 5);
  });

  it('gives a placeholder the same shape, so placement never asks which it has', async () => {
    const actor = await load().acquire(['hero/nobody'], 'ghost', CLASS_SILHOUETTE.mage);
    expect(actor.provisional).toBe(true);
    expect(actor.root.scaling.x).toBe(1);
    expect(actor.root.position.y).toBe(0);
    expect(actor.root.getChildren().length).toBeGreaterThan(0);
  });

  it('falls back down the key list rather than to a placeholder', async () => {
    const loader = load();
    const actor = await loader.acquire(['hero/nobody', 'hero/h1'], 'kael', CLASS_SILHOUETTE.warrior);
    // A boss the pack never authored still draws the monster it came from.
    expect(actor.provisional).toBe(false);
    expect(loader.report.fallbacks.size).toBe(0);
  });

  it('reports a key no entry in the pack can supply', async () => {
    const loader = load();
    const actor = await loader.acquire(['hero/nobody'], 'ghost', CLASS_SILHOUETTE.mage);
    expect(actor.provisional).toBe(true);
    // Surfaced rather than swallowed: a pack with a typo should be findable.
    expect(loader.report.fallbacks.get('hero/nobody')).toBe('missing');
  });

  it('leaves nothing behind when an actor is disposed', async () => {
    const before = scene.transformNodes.length;
    const actor = await load().acquire(['hero/h1'], 'kael', CLASS_SILHOUETTE.warrior);
    expect(scene.transformNodes.length).toBeGreaterThan(before);
    actor.dispose();
    expect(scene.transformNodes.filter(node => node.name.startsWith('kael')).length).toBe(0);
  });

  it('loads a given model once however many actors ask for it', async () => {
    const loader = load();
    const [a, b] = await Promise.all([
      loader.acquire(['hero/h1'], 'one', CLASS_SILHOUETTE.warrior),
      loader.acquire(['hero/h1'], 'two', CLASS_SILHOUETTE.warrior),
    ]);
    // Two actors, two sets of nodes, but the container behind them is shared.
    expect(a.root).not.toBe(b.root);
    expect(scene.transformNodes.filter(node => node.name.startsWith('one-')).length).toBeGreaterThan(0);
    expect(scene.transformNodes.filter(node => node.name.startsWith('two-')).length).toBeGreaterThan(0);
  });

  function load(): ModelLoader {
    return new ModelLoader(scene, PACK);
  }
});
