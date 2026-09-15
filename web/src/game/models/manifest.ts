/**
 * The seam a model pack plugs into.
 *
 * The renderer never names a file. It asks for a `ModelKey` — `hero/h1`,
 * `monster/wolf` — and the manifest says whether a pack has one and how to
 * orient it. A key with no entry falls back to a placeholder, so the diorama
 * runs on an empty pack, a partial pack, or a complete one without a code
 * change between them.
 *
 * Nothing here touches Babylon. Deciding *what* to draw is a decision, and
 * decisions that can only be exercised inside a GL context do not get tested.
 */

export type ModelKey = string;

/** The states the diorama asks a model to be in. */
export const CLIP_ROLES = ['idle', 'attack', 'hit', 'death', 'victory'] as const;
export type ClipRole = (typeof CLIP_ROLES)[number];

export interface ModelEntry {
  /** File name, resolved against the manifest root. */
  file: string;
  /** Uniform scale, for exports authored in something other than metres. */
  scale?: number;
  /** Vertical offset, so the feet meet the ground plane rather than hover. */
  yOffset?: number;
  /** Yaw correction in degrees, for exports that face +Z rather than -Z. */
  yawOffset?: number;
  /** Clip names inside the file, by the role the diorama asks for. */
  clips?: Partial<Record<ClipRole, string>>;
}

export interface ModelManifest {
  /** Base URL the files are served from. Trailing slash optional. */
  root: string;
  models: Record<ModelKey, ModelEntry>;
}

export const EMPTY_MANIFEST: ModelManifest = { root: '', models: {} };

export function heroModelKey(heroId: string): ModelKey {
  return `hero/${heroId}`;
}

export function monsterModelKey(monsterId: string): ModelKey {
  return `monster/${monsterId}`;
}

export interface ResolvedAsset {
  kind: 'asset';
  key: ModelKey;
  url: string;
  scale: number;
  yOffset: number;
  /** Radians, ready to assign. Authored in degrees because people read those. */
  yaw: number;
  clips: Partial<Record<ClipRole, string>>;
}

export interface ResolvedPlaceholder {
  kind: 'placeholder';
  key: ModelKey;
}

export type Resolved = ResolvedAsset | ResolvedPlaceholder;

const DEGREES_TO_RADIANS = Math.PI / 180;

export function resolve(manifest: ModelManifest, key: ModelKey): Resolved {
  const entry = manifest.models[key];
  if (!entry) return { kind: 'placeholder', key };
  const root = manifest.root.endsWith('/') || manifest.root === '' ? manifest.root : `${manifest.root}/`;
  return {
    kind: 'asset',
    key,
    url: `${root}${entry.file}`,
    scale: entry.scale ?? 1,
    yOffset: entry.yOffset ?? 0,
    yaw: (entry.yawOffset ?? 0) * DEGREES_TO_RADIANS,
    clips: entry.clips ?? {},
  };
}

/** Which of the keys the diorama expects the pack cannot supply yet. */
export function missingKeys(manifest: ModelManifest, expected: readonly ModelKey[]): ModelKey[] {
  return expected.filter(key => !manifest.models[key]);
}

const SAFE_FILE = /^[\w./-]+$/;

/**
 * Validates a hand-authored or generated manifest.
 *
 * Every problem is collected rather than thrown on the first, because the
 * person fixing a 65-entry file should see all of it in one pass. Paths are
 * checked against a conservative pattern: a manifest is data, and a `file`
 * of `../../etc/whatever` is a request the renderer should not forward.
 */
export function parseManifest(raw: unknown): { manifest: ModelManifest; problems: string[] } {
  const problems: string[] = [];
  const models: Record<ModelKey, ModelEntry> = {};
  if (typeof raw !== 'object' || raw === null) {
    return { manifest: EMPTY_MANIFEST, problems: ['manifest is not an object'] };
  }
  const source = raw as Record<string, unknown>;
  const root = typeof source.root === 'string' ? source.root : '';
  if (typeof source.root !== 'string') problems.push('root is missing or not a string');

  const rawModels = source.models;
  if (typeof rawModels !== 'object' || rawModels === null) {
    problems.push('models is missing or not an object');
    return { manifest: { root, models }, problems };
  }

  for (const [key, value] of Object.entries(rawModels as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) {
      problems.push(`${key}: entry is not an object`);
      continue;
    }
    const entry = value as Record<string, unknown>;
    if (typeof entry.file !== 'string' || entry.file === '') {
      problems.push(`${key}: file is missing`);
      continue;
    }
    if (!SAFE_FILE.test(entry.file) || entry.file.includes('..')) {
      problems.push(`${key}: file "${entry.file}" is not a plain relative path`);
      continue;
    }
    const clips: Partial<Record<ClipRole, string>> = {};
    if (typeof entry.clips === 'object' && entry.clips !== null) {
      for (const [role, name] of Object.entries(entry.clips as Record<string, unknown>)) {
        if (!(CLIP_ROLES as readonly string[]).includes(role)) {
          problems.push(`${key}: unknown clip role "${role}"`);
          continue;
        }
        if (typeof name !== 'string') {
          problems.push(`${key}: clip "${role}" is not a string`);
          continue;
        }
        clips[role as ClipRole] = name;
      }
    } else if (entry.clips !== undefined) {
      problems.push(`${key}: clips is not an object`);
    }
    models[key] = {
      file: entry.file,
      ...(typeof entry.scale === 'number' && entry.scale > 0 ? { scale: entry.scale } : {}),
      ...(typeof entry.yOffset === 'number' ? { yOffset: entry.yOffset } : {}),
      ...(typeof entry.yawOffset === 'number' ? { yawOffset: entry.yawOffset } : {}),
      ...(Object.keys(clips).length > 0 ? { clips } : {}),
    };
    if (entry.scale !== undefined && !(typeof entry.scale === 'number' && entry.scale > 0)) {
      problems.push(`${key}: scale must be a positive number`);
    }
  }
  return { manifest: { root, models }, problems };
}
