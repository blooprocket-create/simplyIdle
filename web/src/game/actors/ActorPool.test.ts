import { describe, expect, it } from 'vitest';
import { CLASS_SILHOUETTE, monsterSilhouette } from '../models/silhouette';
import { ActorPool, requestSignature, type ActorRequest } from './ActorPool';
import type { LoadedActor, ModelLoader } from './ModelLoader';

/**
 * A loader that hands back a nameable stand-in and lets a test decide when
 * each load lands. The pool's own Babylon imports are all type-only, so this
 * exercises the real class rather than a reimplementation of it.
 */
class FakeLoader {
  readonly built: string[] = [];
  readonly disposed: string[] = [];
  private waiting: (() => void)[] = [];

  acquire(keys: readonly string[], name: string): Promise<LoadedActor> {
    const tag = `${name}:${keys[0]}`;
    this.built.push(tag);
    const actor = {
      root: { position: { set() {} }, rotation: { y: 0 } },
      clips: new Map(),
      provisional: true,
      dispose: () => this.disposed.push(tag),
      tag,
    } as unknown as LoadedActor;
    return new Promise(resolve => {
      this.waiting.push(() => resolve(actor));
    });
  }

  /** Lands every load started so far, oldest first. */
  async settle(): Promise<void> {
    const pending = this.waiting;
    this.waiting = [];
    for (const land of pending) land();
    await Promise.resolve();
    await Promise.resolve();
  }

  asLoader(): ModelLoader {
    return this as unknown as ModelLoader;
  }
}

const tagOf = (actor: LoadedActor | undefined) => (actor as unknown as { tag: string } | undefined)?.tag;

const request = (over: Partial<ActorRequest> = {}): ActorRequest => ({
  id: 'enemy',
  modelKeys: ['monster/goblin'],
  name: 'enemy',
  silhouette: monsterSilhouette('Goblin'),
  ...over,
});

describe('actor request identity', () => {
  it('is stable for the same request', () => {
    expect(requestSignature(request())).toBe(requestSignature(request()));
  });

  it('changes when the slot is asked for a different model', () => {
    // The enemy slot is one id and a different monster every wave. Comparing
    // by id alone says "already have one" forever, which is how one slot kept
    // showing wave one's monster for the rest of the run.
    expect(requestSignature(request())).not.toBe(requestSignature(request({ modelKeys: ['monster/orc'] })));
  });

  it('changes when the fallback chain changes, not just its first key', () => {
    // A boss asks for its own key and settles for the base monster's. Two
    // requests sharing a first key are still different requests.
    expect(requestSignature(request({ modelKeys: ['monster/orc'] }))).not.toBe(
      requestSignature(request({ modelKeys: ['monster/orc', 'monster/goblin'] })),
    );
  });

  it('changes when only the placeholder look changes', () => {
    // A pack with no entry for either draws a placeholder, and those differ.
    expect(requestSignature(request())).not.toBe(requestSignature(request({ silhouette: monsterSilhouette('Troll') })));
    expect(requestSignature(request())).not.toBe(requestSignature(request({ silhouette: CLASS_SILHOUETTE.mage })));
  });

  it('does not change when only the id or name does', () => {
    // Those say which slot and what to call it, not what to build.
    expect(requestSignature(request({ id: 'other' }))).toBe(requestSignature(request()));
    expect(requestSignature(request({ name: 'other' }))).toBe(requestSignature(request()));
  });

  it('tells every monster in the pool apart', () => {
    const keys = ['Slime', 'Goblin', 'Orc', 'Troll', 'Orc King'].map(name =>
      requestSignature(request({ modelKeys: [`monster/${name}`], silhouette: monsterSilhouette(name) })),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('actor pool', () => {
  const enemy = (name: string): ActorRequest => ({
    id: 'enemy',
    modelKeys: [`monster/${name.toLowerCase()}`],
    name: 'enemy',
    silhouette: monsterSilhouette(name),
  });

  it('replaces what stands in a slot when the slot is asked for something else', async () => {
    // The whole enemy line is one slot holding a different monster every wave.
    const loader = new FakeLoader();
    const pool = new ActorPool(loader.asLoader());

    pool.sync([enemy('Goblin')]);
    await loader.settle();
    expect(tagOf(pool.get('enemy'))).toBe('enemy:monster/goblin');

    pool.sync([enemy('Orc')]);
    await loader.settle();
    expect(tagOf(pool.get('enemy'))).toBe('enemy:monster/orc');
    expect(loader.disposed).toContain('enemy:monster/goblin');
  });

  it('does not rebuild a slot asked for the same thing again', async () => {
    // Rebuilding on every sync would re-download the pack every wave.
    const loader = new FakeLoader();
    const pool = new ActorPool(loader.asLoader());
    pool.sync([enemy('Goblin')]);
    await loader.settle();
    pool.sync([enemy('Goblin')]);
    pool.sync([enemy('Goblin')]);
    await loader.settle();
    expect(loader.built).toEqual(['enemy:monster/goblin']);
  });

  it('throws away a load that lands after the slot has moved on', async () => {
    // Two waves can pass while a model is in flight. Accepting the first
    // result then would show a monster the player already killed.
    const loader = new FakeLoader();
    const pool = new ActorPool(loader.asLoader());
    pool.sync([enemy('Goblin')]);
    pool.sync([enemy('Orc')]);
    await loader.settle();
    expect(tagOf(pool.get('enemy'))).toBe('enemy:monster/orc');
    expect(loader.disposed).toContain('enemy:monster/goblin');
    expect(pool.size).toBe(1);
  });

  it('drops an actor whose id is no longer wanted at all', async () => {
    const loader = new FakeLoader();
    const pool = new ActorPool(loader.asLoader());
    pool.sync([enemy('Goblin')]);
    await loader.settle();
    pool.sync([]);
    expect(pool.get('enemy')).toBeUndefined();
    expect(loader.disposed).toContain('enemy:monster/goblin');
  });
});
