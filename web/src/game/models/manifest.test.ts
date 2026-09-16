import { describe, expect, it } from 'vitest';
import {
  EMPTY_MANIFEST,
  resolveFirst,
  heroModelKey,
  missingKeys,
  monsterModelKey,
  parseManifest,
  resolve,
  type ModelManifest,
} from './manifest';

const PACK: ModelManifest = {
  root: '/models',
  models: {
    'hero/h1': {
      file: 'kael.glb',
      scale: 0.01,
      yOffset: 0.02,
      yawOffset: 180,
      clips: { idle: 'Idle', attack: 'Swing' },
    },
    'hero/h2': { file: 'lunara.glb' },
  },
};

describe('model manifest', () => {
  it('falls back to a placeholder for a key the pack has no model for', () => {
    // The diorama has to run on an empty pack, a partial one and a complete
    // one with no code change between them.
    expect(resolve(PACK, heroModelKey('h9')).kind).toBe('placeholder');
    expect(resolve(EMPTY_MANIFEST, heroModelKey('h1')).kind).toBe('placeholder');
  });

  it('resolves a key to a url with its orientation applied', () => {
    const resolved = resolve(PACK, heroModelKey('h1'));
    expect(resolved).toEqual({
      kind: 'asset',
      key: 'hero/h1',
      url: '/models/kael.glb',
      scale: 0.01,
      yOffset: 0.02,
      yaw: Math.PI,
      clips: { idle: 'Idle', attack: 'Swing' },
    });
  });

  it('defaults an entry that says only where the file is', () => {
    const resolved = resolve(PACK, heroModelKey('h2'));
    expect(resolved).toMatchObject({
      kind: 'asset',
      url: '/models/lunara.glb',
      scale: 1,
      yOffset: 0,
      yaw: 0,
      clips: {},
    });
  });

  it('joins the root whether or not it ends in a slash', () => {
    for (const root of ['/models', '/models/']) {
      expect(resolve({ ...PACK, root }, heroModelKey('h2'))).toMatchObject({ url: '/models/lunara.glb' });
    }
    expect(resolve({ ...PACK, root: '' }, heroModelKey('h2'))).toMatchObject({ url: 'lunara.glb' });
  });

  it('names the keys a pack cannot supply yet', () => {
    // 65 heroes arriving a few at a time: the useful question is which are
    // still outstanding, not whether the pack is complete.
    const expected = [heroModelKey('h1'), heroModelKey('h2'), heroModelKey('h3'), monsterModelKey('wolf')];
    expect(missingKeys(PACK, expected)).toEqual(['hero/h3', 'monster/wolf']);
    expect(missingKeys(PACK, [])).toEqual([]);
  });

  it('keys heroes and monsters into separate namespaces', () => {
    expect(heroModelKey('h1')).not.toBe(monsterModelKey('h1'));
  });

  it('keys a monster by who it is, not which wave it turned up on', () => {
    // `spawnEnemy` ids encounters w1, w2, w3… — fine for the simulation and
    // wrong for a pack, which would need one Goblin per wave forever.
    expect(monsterModelKey('Goblin')).toBe('monster/goblin');
    expect(monsterModelKey('Ancient Dragon')).toBe('monster/ancient-dragon');
    expect(monsterModelKey('Orc King')).toBe('monster/orc-king');
    // The same monster on two different waves is the same key.
    expect(monsterModelKey('Goblin')).toBe(monsterModelKey('Goblin'));
  });

  it('settles for a less specific key when the pack lacks the exact one', () => {
    const pack: ModelManifest = { root: '/m', models: { 'monster/orc': { file: 'orc.glb' } } };
    // A king the pack never authored still draws an Orc, not a placeholder.
    expect(resolveFirst(pack, ['monster/orc-king', 'monster/orc'])).toMatchObject({
      kind: 'asset',
      url: '/m/orc.glb',
    });
    // And a pack that did author one gets used in preference.
    const royal: ModelManifest = {
      root: '/m',
      models: { ...pack.models, 'monster/orc-king': { file: 'king.glb' } },
    };
    expect(resolveFirst(royal, ['monster/orc-king', 'monster/orc'])).toMatchObject({ url: '/m/king.glb' });
    expect(resolveFirst(pack, ['monster/grue', 'monster/grue-king']).kind).toBe('placeholder');
    expect(resolveFirst(pack, []).kind).toBe('placeholder');
  });

  it('collects every problem in a manifest rather than stopping at the first', () => {
    // Someone fixing a 65-entry file should see all of it in one pass.
    const { problems } = parseManifest({
      root: '/models',
      models: {
        a: { file: 'a.glb', scale: -1 },
        b: { notAFile: true },
        c: { file: 'c.glb', clips: { idle: 'Idle', sprint: 'Run' } },
      },
    });
    expect(problems).toHaveLength(3);
    expect(problems.join('\n')).toMatch(/a: scale/);
    expect(problems.join('\n')).toMatch(/b: file is missing/);
    expect(problems.join('\n')).toMatch(/c: unknown clip role "sprint"/);
  });

  it('refuses a file path that climbs out of the pack', () => {
    // A manifest is data. `../../etc/passwd` is a request the renderer should
    // not forward to a fetch, whoever generated the file.
    const { manifest, problems } = parseManifest({
      root: '/models',
      models: { evil: { file: '../../secrets.glb' }, absolute: { file: 'https://elsewhere/x.glb' } },
    });
    expect(manifest.models).toEqual({});
    expect(problems).toHaveLength(2);
  });

  it('survives input that is not a manifest at all', () => {
    for (const raw of [null, 42, 'nope', [], {}]) {
      const { manifest, problems } = parseManifest(raw);
      expect(problems.length).toBeGreaterThan(0);
      expect(manifest.models).toEqual({});
    }
  });

  it('keeps a valid entry when a sibling entry is broken', () => {
    const { manifest } = parseManifest({ root: '/m', models: { good: { file: 'g.glb' }, bad: {} } });
    expect(Object.keys(manifest.models)).toEqual(['good']);
  });
});
