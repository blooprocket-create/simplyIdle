import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import '@babylonjs/loaders/glTF/2.0';

import { resolveFirst, type ClipRole, type ModelKey, type ModelManifest } from '../models/manifest';
import type { Silhouette } from '../models/silhouette';
import { buildSilhouette } from './buildSilhouette';

/**
 * Turns a model key into something on the screen.
 *
 * Every hero asks for a key; the manifest either has an entry or it does not.
 * A key with no entry becomes a placeholder, and so does a key whose file
 * fails to load — a pack arriving a few models at a time will have dead
 * entries in it, and a 404 on one hero must not take the battle line with it.
 *
 * Containers are cached and instantiated rather than re-fetched, so six
 * heroes sharing a model cost one download between them.
 */

export interface LoadedActor {
  /**
   * Where world placement is written. Deliberately not the node the
   * manifest's scale, offset and yaw are applied to — those are properties of
   * the export and would be overwritten the first time anything positioned
   * this actor, which is every frame.
   */
  root: TransformNode;
  clips: Map<ClipRole, AnimationGroup>;
  /** True when this is standing in, rather than the authored model. */
  provisional: boolean;
  dispose(): void;
}

export interface LoaderReport {
  /** Keys that fell back, and why. Surfaced rather than swallowed. */
  fallbacks: Map<ModelKey, 'missing' | 'failed'>;
}

export class ModelLoader {
  private readonly containers = new Map<ModelKey, Promise<AssetContainer | null>>();
  readonly report: LoaderReport = { fallbacks: new Map() };

  constructor(
    private readonly scene: Scene,
    private manifest: ModelManifest,
  ) {}

  /** Swapping the pack invalidates the cache but not anything already built. */
  setManifest(manifest: ModelManifest): void {
    this.manifest = manifest;
    this.containers.clear();
    this.report.fallbacks.clear();
  }

  async acquire(keys: readonly ModelKey[], name: string, silhouette: Silhouette): Promise<LoadedActor> {
    const resolved = resolveFirst(this.manifest, keys);
    const key = resolved.key;
    if (resolved.kind === 'placeholder') {
      this.report.fallbacks.set(key, 'missing');
      return this.placeholder(name, silhouette);
    }

    const container = await this.container(key, resolved.url);
    if (!container) {
      this.report.fallbacks.set(key, 'failed');
      return this.placeholder(name, silhouette);
    }

    const entries = container.instantiateModelsToScene(source => `${name}-${source}`, false, {
      doNotInstantiate: false,
    });
    // Two nodes: an outer one the world moves, and an inner one carrying the
    // transform the pack authored. Collapsing them means a model exported in
    // centimetres is resized to 1 the moment it is placed.
    const root = new TransformNode(`${name}-actor`, this.scene);
    const authored = entries.rootNodes[0] as TransformNode;
    authored.parent = root;
    authored.scaling.scaleInPlace(resolved.scale);
    authored.position.y += resolved.yOffset;
    authored.rotation.y += resolved.yaw;

    const clips = new Map<ClipRole, AnimationGroup>();
    for (const [role, clipName] of Object.entries(resolved.clips) as [ClipRole, string][]) {
      const group = entries.animationGroups.find(candidate => candidate.name.endsWith(clipName));
      if (group) {
        group.stop();
        clips.set(role, group);
      }
    }

    return {
      root,
      clips,
      provisional: false,
      dispose: () => {
        for (const group of entries.animationGroups) group.dispose();
        root.dispose(false, true);
      },
    };
  }

  private placeholder(name: string, silhouette: Silhouette): LoadedActor {
    // Same two-node shape as a loaded model, so placement code never has to
    // know which it is looking at.
    const root = new TransformNode(`${name}-actor`, this.scene);
    buildSilhouette(this.scene, name, silhouette).parent = root;
    return { root, clips: new Map(), provisional: true, dispose: () => root.dispose(false, true) };
  }

  private container(key: ModelKey, url: string): Promise<AssetContainer | null> {
    const existing = this.containers.get(key);
    if (existing) return existing;
    // The rejection is swallowed here on purpose: a missing or broken file is
    // a fact about the pack, reported through `report`, not an exception the
    // render loop should have to survive.
    const loading = LoadAssetContainerAsync(url, this.scene).catch(() => null);
    this.containers.set(key, loading);
    return loading;
  }

  dispose(): void {
    for (const pending of this.containers.values()) {
      void pending.then(container => container?.dispose());
    }
    this.containers.clear();
  }
}
