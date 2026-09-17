import { toLegacyPayload } from '../engine/save/legacyPayload';
import type { SaveV3 } from '../engine/save/schema';
import type { SavePort } from './index';

/**
 * The account's save, read out of and written back into the documents the
 * shipped game already keeps.
 *
 * This is the reason `/legacy` cannot be retired. There are dormant accounts
 * holding real saves; those saves live in Firestore behind auth; and until the
 * rewrite can reach them, the Expo app is the only route by which those players
 * get their own game back. Phase 13 is gated on this working.
 *
 * ## What is here and what is not
 *
 * Everything below is the *format*: where a save lives, how a chunked document
 * is put back together, and what has to be written so the shipped reader still
 * understands it. None of it mentions Firebase, because none of it needs to —
 * the document store is injected as `SaveDocStore`, three methods wide,
 * which is what lets all of it be tested against a fake instead of a live project.
 *
 * Binding that interface to `firebase/firestore` is the last step and it is
 * deliberately not taken here. A `SavePort` with no signed-in account has
 * nothing to address: `users/{uid}/saveSlots/{slot}` needs a uid, and the
 * rewrite has no auth at all yet — `onlineAuth` is Phase 12. Writing that
 * binding now would add a dependency and a file that cannot be exercised, run,
 * or tested, in front of the one thing it is waiting for. The seam is here, the
 * format is here and proven, and the binding is roughly thirty lines the day
 * there is a uid to hand it.
 *
 * ## Why writes go out as v2
 *
 * Both apps point at the same document. See `legacyPayload.ts` — the shipped
 * reader is total, so a `SaveV3` stored there reads as a valid save with
 * nothing in it rather than as an error, and hands the player a new account.
 */

/** The shipped slot document, as much of it as reading a save needs. */
interface SlotDocument {
  revision?: unknown;
  updatedAt?: unknown;
  /** Schema v2+: names the docs in the slot's `chunks` subcollection. */
  chunkKeys?: unknown;
  /** v1 compact format: the whole payload as one JSON string. */
  payloadJson?: unknown;
  /** Pre-v1: the payload as nested Firestore fields. */
  payload?: unknown;
}

/**
 * Reading and writing single documents, by path.
 *
 * Deliberately not a Firestore type. Everything this port does to a save is
 * decided here and tested against a fake; what a real implementation adds is
 * the network, not a rule.
 */
export interface SaveDocStore {
  /** The signed-in account, or null when there is nobody to read a save for. */
  uid(): string | null;
  /** One document, or null when it does not exist. */
  read(path: readonly string[]): Promise<Record<string, unknown> | null>;
  /** One document, replacing what is there. */
  write(path: readonly string[], data: Record<string, unknown>): Promise<void>;
}

/**
 * Firestore forbids nested arrays at any depth, so the shipped writer wraps an
 * inner array in a marker object. Both spellings are read because saves written
 * either side of the rename are still out there; the current one is written.
 */
const NESTED_ARRAY_MARKER = 'simplyIdleNestedArrayV1';
const LEGACY_NESTED_ARRAY_MARKER = '__simplyIdle_nested_array_v1__';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function decodeFirestoreValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeFirestoreValue);
  if (!isRecord(value)) return value;

  const keys = Object.keys(value);
  if (keys.length === 1) {
    const wrapped = value[NESTED_ARRAY_MARKER] ?? value[LEGACY_NESTED_ARRAY_MARKER];
    if (Array.isArray(wrapped)) return wrapped.map(decodeFirestoreValue);
  }

  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, decodeFirestoreValue(nested)]));
}

export function encodeFirestoreValue(value: unknown, insideArray = false): unknown {
  if (Array.isArray(value)) {
    const encoded = value.map(item => encodeFirestoreValue(item, true));
    return insideArray ? { [NESTED_ARRAY_MARKER]: encoded } : encoded;
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, encodeFirestoreValue(nested)]));
  }
  return value;
}

/**
 * Firestore document ids cannot contain `/`, `.`, `#`, `$`, `[` or `]`, and a
 * name of the form `__x__` is reserved. Ported from the shipped sanitiser
 * character for character: a slot that sanitises differently here addresses a
 * *different document*, which is an account that cannot find its own save.
 */
export function sanitizeSaveSlot(slot: string): string {
  const sanitized =
    slot
      .trim()
      .replace(/[/.#$[\]]/g, '_')
      .slice(0, 96) || 'default';
  if (/^__.*__$/.test(sanitized)) return `slot${sanitized.replace(/^_+|_+$/g, '')}`.slice(0, 96);
  return sanitized;
}

/**
 * The chunks the shipped writer keeps as one JSON string rather than as native
 * fields, because native fields would blow Firestore's 40,000 index-entry
 * limit. Ported as-is: writing `roster` as native fields would make a large
 * account's save fail to store at all, and only for large accounts.
 */
const JSON_ONLY_CHUNKS = new Set(['roster', 'equipment', 'settings', '_extra']);

/** One chunk document, in whichever of the two shapes it was written. */
export function readChunk(data: Record<string, unknown> | null): Record<string, unknown> {
  if (!data) return {};
  if (typeof data.payloadJson === 'string') {
    try {
      const parsed: unknown = JSON.parse(data.payloadJson);
      return isRecord(parsed) ? parsed : {};
    } catch {
      // A corrupted chunk is skipped rather than fatal: the save reader is
      // total, so the account comes back missing a field instead of missing.
      return {};
    }
  }
  const decoded = decodeFirestoreValue(data);
  return isRecord(decoded) ? decoded : {};
}

function slotPath(uid: string, slot: string): string[] {
  return ['users', uid, 'saveSlots', sanitizeSaveSlot(slot)];
}

/**
 * Reassemble the payload a slot holds, across all three formats the shipped
 * game has written over its life.
 *
 * The chunk list on the header is trusted for *which* chunks to read, but a
 * chunk that is missing or corrupt does not fail the load — a save reader that
 * refuses a damaged account is worse than one that returns it with a hole,
 * because both readers fill holes with defaults and only one of them gives the
 * player their heroes back.
 */
async function readSlotPayload(docs: SaveDocStore, uid: string, slot: string): Promise<Record<string, unknown> | null> {
  const path = slotPath(uid, slot);
  const header = (await docs.read(path)) as SlotDocument | null;
  if (!header) return null;

  if (Array.isArray(header.chunkKeys) && header.chunkKeys.length > 0) {
    const names = header.chunkKeys.filter((name): name is string => typeof name === 'string');
    const chunks = await Promise.all(names.map(name => docs.read([...path, 'chunks', name])));
    return Object.assign({}, ...chunks.map(readChunk)) as Record<string, unknown>;
  }

  if (typeof header.payloadJson === 'string') {
    try {
      const parsed: unknown = JSON.parse(header.payloadJson);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  if (isRecord(header.payload)) {
    const decoded = decodeFirestoreValue(header.payload);
    return isRecord(decoded) ? decoded : null;
  }

  // A header with a revision and no payload anywhere is a slot that exists and
  // holds nothing, which is a different answer from "no such slot" and is
  // reported as the empty save it is rather than as null.
  return {};
}

/** Split a flat payload the way the shipped writer does. */
export function splitIntoChunks(
  payload: Record<string, unknown>,
  chunkKeys: Readonly<Record<string, readonly string[]>>,
): Record<string, Record<string, unknown>> {
  const mapped = new Set(Object.values(chunkKeys).flat());
  const chunks: Record<string, Record<string, unknown>> = {};

  for (const [name, keys] of Object.entries(chunkKeys)) {
    const chunk: Record<string, unknown> = {};
    for (const key of keys) if (key in payload) chunk[key] = payload[key];
    chunks[name] = chunk;
  }

  const extra: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) if (!mapped.has(key)) extra[key] = payload[key];
  if (Object.keys(extra).length > 0) chunks._extra = extra;

  return chunks;
}

/** Encode one chunk for storage, as native fields or as a JSON string. */
export function serializeChunk(name: string, chunk: Record<string, unknown>): Record<string, unknown> {
  if (JSON_ONLY_CHUNKS.has(name)) return { payloadJson: JSON.stringify(chunk) };
  const encoded = encodeFirestoreValue(chunk);
  return isRecord(encoded) ? encoded : {};
}

export interface RemoteSaveOptions {
  /**
   * The shipped `SAVE_CHUNKS` map, injected rather than imported. `src/` is the
   * Expo app and this is the Vite one; importing across would drag React Native
   * into this bundle for a constant. Phase 10 or 11 will move the authoritative
   * copy into `content/`, and until then the caller supplies it so the two
   * cannot silently disagree about where a field lives.
   */
  chunkKeys: Readonly<Record<string, readonly string[]>>;
  /** Wall clock at write time. Injected for the usual reason. */
  now(): number;
}

/**
 * A `SavePort` over the account's documents.
 *
 * `load` returns the raw stored payload rather than a `SaveV3`, because
 * bounding it is `readSave`'s job and the port has no business having a second
 * opinion about what a save means. `save` takes a `SaveV3` and writes v2.
 */
export function remoteSavePort(docs: SaveDocStore, options: RemoteSaveOptions): SavePort {
  return {
    async load(slot: string): Promise<unknown | null> {
      const uid = docs.uid();
      if (!uid) return null;
      return readSlotPayload(docs, uid, slot);
    },

    async save(slot: string, save: SaveV3): Promise<void> {
      const uid = docs.uid();
      if (!uid) throw new Error('no account is signed in, so there is no save to write to');

      const path = slotPath(uid, slot);
      const flat = toLegacyPayload(save);
      const chunks = splitIntoChunks(flat, options.chunkKeys);

      /*
       * Chunks first, header last. A reader follows `chunkKeys` off the header,
       * so a header that names a chunk not yet written is a save that reads
       * back short — while a chunk written under a header that does not name it
       * is simply unreferenced. Both orders can be interrupted; only one of
       * them loses data when it is.
       */
      await Promise.all(
        Object.entries(chunks).map(([name, chunk]) =>
          docs.write([...path, 'chunks', name], serializeChunk(name, chunk)),
        ),
      );

      const previous = (await docs.read(path)) as SlotDocument | null;
      const revision = typeof previous?.revision === 'number' ? Math.max(0, Math.floor(previous.revision)) + 1 : 1;

      await docs.write(path, {
        revision,
        updatedAt: options.now(),
        schemaVersion: 2,
        saveSlot: sanitizeSaveSlot(slot),
        chunkKeys: Object.keys(chunks),
      });
    },
  };
}
