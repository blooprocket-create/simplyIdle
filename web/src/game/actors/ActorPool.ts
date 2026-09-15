import { Color3 } from '@babylonjs/core/Maths/math.color';

import type { Placement } from '../layout/battleLine';
import type { ModelKey } from '../models/manifest';
import type { LoadedActor, ModelLoader } from './ModelLoader';

/**
 * The actors currently on the field, keyed by the id the simulation uses.
 *
 * Loading is asynchronous and drawing is not, so this never blocks a frame:
 * `ensure` starts a load and the actor joins the scene when it arrives. Until
 * then the id simply has nothing to draw, which is the same state as a hero
 * who has not been recruited.
 */

export interface ActorRequest {
  id: string;
  modelKey: ModelKey;
  name: string;
  tint?: Color3;
}

export class ActorPool {
  private readonly actors = new Map<string, LoadedActor>();
  private readonly pending = new Set<string>();
  /** The ids the last `sync` asked for, so a late arrival can be checked. */
  private wanted = new Set<string>();

  constructor(private readonly loader: ModelLoader) {}

  get(id: string): LoadedActor | undefined {
    return this.actors.get(id);
  }

  get size(): number {
    return this.actors.size;
  }

  /**
   * Brings the pool in line with a set of requests: start anything new, drop
   * anything gone, leave everything else alone. Rebuilding wholesale would
   * re-download the pack every time one hero was swapped.
   */
  sync(requests: readonly ActorRequest[]): void {
    const wanted = new Set(requests.map(request => request.id));
    this.wanted = wanted;
    for (const [id, actor] of this.actors) {
      if (wanted.has(id)) continue;
      actor.dispose();
      this.actors.delete(id);
    }
    for (const request of requests) {
      if (this.actors.has(request.id) || this.pending.has(request.id)) continue;
      this.pending.add(request.id);
      void this.loader
        .acquire(request.modelKey, request.name, request.tint)
        .then(actor => {
          this.pending.delete(request.id);
          // The roster can change while a model is in flight; if this id is
          // no longer wanted by the time it lands, throw it away rather than
          // adding a hero who has already left.
          if (!this.wanted.has(request.id)) {
            actor.dispose();
            return;
          }
          this.actors.set(request.id, actor);
        })
        .catch(() => {
          this.pending.delete(request.id);
        });
    }
  }

  place(placements: Map<string, Placement>): void {
    for (const [id, placement] of placements) {
      const actor = this.actors.get(id);
      if (!actor) continue;
      actor.root.position.set(placement.x, placement.y, placement.z);
      actor.root.rotation.y = placement.yaw;
    }
  }

  dispose(): void {
    for (const actor of this.actors.values()) actor.dispose();
    this.actors.clear();
    this.pending.clear();
    this.wanted.clear();
  }
}
