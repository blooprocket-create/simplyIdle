import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import '@babylonjs/loaders/glTF/2.0';

import { resolve, type ClipRole, type ModelKey, type ModelManifest } from '../models/manifest';
import { buildPlaceholder } from './placeholder';

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

  async acquire(key: ModelKey, name: string, tint?: Color3): Promise<LoadedActor> {
    const resolved = resolve(this.manifest, key);
    if (resolved.kind === 'placeholder') {
      this.report.fallbacks.set(key, 'missing');
      return this.placeholder(name, tint);
    }

    const container = await this.container(key, resolved.url);
    if (!container) {
      this.report.fallbacks.set(key, 'failed');
      return this.placeholder(name, tint);
    }

    const entries = container.instantiateModelsToScene(source => `${name}-${source}`, false, {
      doNotInstantiate: false,
    });
    const root = entries.rootNodes[0] as TransformNode;
    root.scaling.scaleInPlace(resolved.scale);
    root.position.y += resolved.yOffset;
    root.rotation.y += resolved.yaw;

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

  private placeholder(name: string, tint?: Color3): LoadedActor {
    const root = buildPlaceholder(this.scene, name, { tint });
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
