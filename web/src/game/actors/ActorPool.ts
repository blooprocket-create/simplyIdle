import type { Placement } from '../layout/battleLine';
import type { ModelKey } from '../models/manifest';
import { silhouetteKey, type Silhouette } from '../models/silhouette';
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
  /** Tried in order; the first the pack can supply wins. */
  modelKeys: readonly ModelKey[];
  name: string;
  silhouette: Silhouette;
}

/**
 * What an actor was built from.
 *
 * A slot holds one actor and the thing standing in it changes — the enemy
 * slot is a different monster every wave. Comparing the request by id alone
 * says "already have one" forever, which is how one slot kept showing wave
 * one's monster for the rest of the run.
 */
export function requestSignature(request: ActorRequest): string {
  return `${request.modelKeys.join('>')}|${silhouetteKey(request.silhouette)}`;
}

export class ActorPool {
  private readonly actors = new Map<string, { actor: LoadedActor; signature: string }>();
  private readonly pending = new Map<string, string>();
  /** The ids the last `sync` asked for, so a late arrival can be checked. */
  private wanted = new Set<string>();
  /** And what each was asked to be, so a late arrival can be checked against it. */
  private signatures = new Map<string, string>();

  constructor(private readonly loader: ModelLoader) {}

  get(id: string): LoadedActor | undefined {
    return this.actors.get(id)?.actor;
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
    const signatures = new Map(requests.map(request => [request.id, requestSignature(request)]));
    this.signatures = signatures;
    for (const [id, held] of this.actors) {
      // Gone, or the same slot now holds something else.
      if (wanted.has(id) && signatures.get(id) === held.signature) continue;
      held.actor.dispose();
      this.actors.delete(id);
    }
    for (const request of requests) {
      const signature = requestSignature(request);
      if (this.actors.has(request.id)) continue;
      if (this.pending.get(request.id) === signature) continue;
      this.pending.set(request.id, signature);
      void this.loader
        .acquire(request.modelKeys, request.name, request.silhouette)
        .then(actor => {
          if (this.pending.get(request.id) === signature) this.pending.delete(request.id);
          // The roster can change while a model is in flight. If this id is no
          // longer wanted, or the slot has moved on to something else since,
          // throw the result away rather than showing a monster two waves old.
          if (!this.wanted.has(request.id) || this.signatures.get(request.id) !== signature) {
            actor.dispose();
            return;
          }
          this.actors.get(request.id)?.actor.dispose();
          this.actors.set(request.id, { actor, signature });
        })
        .catch(() => {
          if (this.pending.get(request.id) === signature) this.pending.delete(request.id);
        });
    }
  }

  place(placements: Map<string, Placement>): void {
    for (const [id, placement] of placements) {
      const held = this.actors.get(id);
      if (!held) continue;
      held.actor.root.position.set(placement.x, placement.y, placement.z);
      held.actor.root.rotation.y = placement.yaw;
    }
  }

  dispose(): void {
    for (const held of this.actors.values()) held.actor.dispose();
    this.actors.clear();
    this.pending.clear();
    this.wanted.clear();
    this.signatures.clear();
  }
}
