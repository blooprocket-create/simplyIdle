import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, writeBatch } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore, isFirebaseConfigured } from './firebase';
import { isCurrentUserAdmin, logAdminAction } from './adminAccess';

const SAVE_SCHEMA_VERSION = 2;

export interface OnlineSaveEnvelope<TPayload extends Record<string, unknown>> {
  revision: number;
  updatedAt: number;
  payload: TPayload;
}

export type OnlineSaveErrorCode =
  | 'permission-denied'
  | 'invalid-slot'
  | 'unavailable'
  | 'resource-exhausted'
  | 'unknown';

interface SaveDocRecord {
  revision: number;
  updatedAt: number;
  schemaVersion: number;
  saveSlot: string;
  payload?: Record<string, unknown>;
  payloadJson?: string;
  /** Present on schema v2+ saves; lists the chunk doc IDs in the /chunks subcollection. */
  chunkKeys?: string[];
}

// ---------------------------------------------------------------------------
// Chunk definitions – each chunk groups related SaveData keys.
// The mapping is from chunk name → list of SaveData top-level keys.
// Keys not listed in ANY chunk fall into the catch-all "_extra" chunk.
// ---------------------------------------------------------------------------
export const SAVE_CHUNKS: Record<string, string[]> = {
  identity: ['saveVersion', 'playerName', 'playerClass', 'characterCreated'],
  economy: [
    'gold',
    'diamonds',
    'totalGold',
    'exp',
    'totalExp',
    'level',
    'heroShards',
    'bossTears',
    'essence',
    'rebirthCores',
    'equipmentScrap',
    'sparkTokens',
  ],
  combat: [
    'wave',
    'highestWaveReached',
    'highestLevelReached',
    'monsterHp',
    'teamHp',
    'totalKills',
    'burstCharge',
    'combatHeat',
    'unspentStatPoints',
    'statsAlloc',
    'skills',
    'damageBuffPct',
    'damageBuffMs',
    'damageReductionBuffPct',
    'damageReductionBuffMs',
    'heroActiveCdMs',
    'combatLog',
  ],
  roster: [
    'heroRoster',
    'activeTeamHeroIds',
    'teamLoadouts',
    'teamSlotsUnlocked',
    'heroFormationByUid',
    'heroUniqueGearByHeroId',
    'totalSummons',
    'firstSummonGiven',
    'freeSummonCharges',
    'gachaPityCounter',
    'guaranteedMinRarity',
    'claimedSummonMilestones',
    'summonHistory',
    'autoRecycleMaxRarity',
  ],
  equipment: [
    'inventoryItemIds',
    'equipmentInventory',
    'equippedItems',
    'usableItemCounts',
    'autoDismantleEnabled',
    'autoDismantleRarityFloor',
  ],
  progression: [
    'prestigeCount',
    'rebirthDamagePath',
    'rebirthEconomyPath',
    'rebirthSurvivalPath',
    'metaDamageLevel',
    'metaEconomyLevel',
    'metaSurvivalLevel',
    'permanentUnlocks',
    'achievements',
    'classMasteryXp',
    'vipPoints',
    'vipLevel',
    'vipRewardClaimedLevels',
    'dollarFirstPurchaseClaimedOfferIds',
    'codexVipClaimedHeroIds',
    'codexVipClaimedUniqueIds',
  ],
  minigames: [
    'lastDiceRollDay',
    'lastDiceRollValue',
    'lastRiftRunDay',
    'riftDungeonLevel',
    'riftEntriesUsedToday',
    'riftEntryDay',
    'riftRaidTickets',
    'lastRiftBossDamagePct',
    'lastRiftWavesCleared',
    'treasureDungeonLevel',
    'treasureEntriesUsedToday',
    'treasureEntryDay',
    'lastTreasureHaulPct',
    'lastTreasureWiped',
    'lastReconSweepDay',
    'lastLockpickDay',
    'lastTargetPracticeDay',
    'lastBountyDraftDay',
    'miniBounty',
    'guildhallFacilities',
    'expeditionQueue',
    'lastExpeditionDay',
    'expeditionContractOffers',
    'expeditionContractsRefreshedAt',
  ],
  settings: [
    'autoUsePotionEnabled',
    'autoUsePotionThresholdPct',
    'autoUseCoolantEnabled',
    'autoRecycleEnabled',
    'autoSummonEnabled',
    'autoSummonMode',
    'autoSummonReserveGold',
    'autoBurstEnabled',
    'combatTempo',
    'autoTempoEnabled',
    'autoTempoTarget',
    'seenHintIds',
    'lastActiveAt',
    'seasonPoints',
    'bestSeasonPoints',
    'dailyLoginStreak',
    'lastDailyLoginDay',
    'streakInsuranceCharges',
    'weeklyEventWeek',
    'weeklyEventId',
    'weeklyKills',
    'weeklyTrackClaimed',
    'claimedMissionIds',
    'mailbox',
    'giftPreference',
  ],
};

/** All chunk names in load order. */
/** Set of all explicitly-mapped keys for fast lookup. */
const MAPPED_KEYS = new Set(Object.values(SAVE_CHUNKS).flat());

/**
 * Split a flat payload into named chunks.
 * Any keys not covered by SAVE_CHUNKS land in an "_extra" chunk so nothing is lost.
 */
export function splitPayloadIntoChunks(payload: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const chunks: Record<string, Record<string, unknown>> = {};
  for (const [chunkName, keys] of Object.entries(SAVE_CHUNKS)) {
    const chunk: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in payload) chunk[key] = payload[key];
    }
    chunks[chunkName] = chunk;
  }
  // Catch-all for any keys not in any chunk definition (future-proofing)
  const extra: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) {
    if (!MAPPED_KEYS.has(key)) extra[key] = payload[key];
  }
  if (Object.keys(extra).length > 0) chunks['_extra'] = extra;
  return chunks;
}

/**
 * Merge chunk payloads back into a single flat payload.
 */
export function mergeChunks(chunks: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const chunkPayload of Object.values(chunks)) {
    Object.assign(merged, chunkPayload);
  }
  return merged;
}

/** Progress callback type for chunked loads. */
export type LoadProgressCallback = (loaded: number, total: number, chunkName: string) => void;

const NESTED_ARRAY_MARKER = 'simplyIdleNestedArrayV1';
const LEGACY_NESTED_ARRAY_MARKER = '__simplyIdle_nested_array_v1__';

export type OnlineSaveWriteResult<TPayload extends Record<string, unknown>> =
  | { ok: true; revision: number }
  | { ok: false; remote: OnlineSaveEnvelope<TPayload> | null; errorCode?: OnlineSaveErrorCode };

export type OnlineSaveLoadResult<TPayload extends Record<string, unknown>> =
  | { ok: true; data: OnlineSaveEnvelope<TPayload> | null }
  | { ok: false; errorCode: OnlineSaveErrorCode };

export interface OnlineSaveLoadOptions {
  includeChunks?: string[];
}

function sanitizeSaveSlot(saveSlot: string): string {
  const sanitized =
    saveSlot
      .trim()
      .replace(/[/.#$[\]]/g, '_')
      .slice(0, 96) || 'default';
  if (/^__.*__$/.test(sanitized)) {
    return `slot${sanitized.replace(/^_+|_+$/g, '')}`.slice(0, 96);
  }
  return sanitized;
}

function mapFirestoreErrorCode(error: unknown): OnlineSaveErrorCode {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : '';
  if (code.includes('permission-denied')) return 'permission-denied';
  if (code.includes('invalid-argument')) return 'invalid-slot';
  if (code.includes('resource-exhausted')) return 'resource-exhausted';
  if (code.includes('unavailable')) return 'unavailable';
  return 'unknown';
}

function getCurrentUid(): string | null {
  const auth = getFirebaseAuth();
  return auth?.currentUser?.uid ?? null;
}

function isSaveDocRecord(value: unknown): value is SaveDocRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<SaveDocRecord>;
  return (
    typeof record.revision === 'number' &&
    typeof record.updatedAt === 'number' &&
    typeof record.saveSlot === 'string' &&
    (typeof record.payloadJson === 'string' ||
      (!!record.payload && typeof record.payload === 'object') ||
      Array.isArray(record.chunkKeys))
  );
}

/**
 * Convert a raw Firestore doc into an envelope.
 * For chunked saves (schemaVersion >= 2 with chunkKeys), returns an envelope
 * with an empty payload — the caller is responsible for loading chunks separately.
 */
function toEnvelope<TPayload extends Record<string, unknown>>(raw: unknown): OnlineSaveEnvelope<TPayload> | null {
  if (!isSaveDocRecord(raw)) return null;

  // Schema v2+: chunked saves have chunkKeys but no inline payload
  if (Array.isArray(raw.chunkKeys) && raw.chunkKeys.length > 0) {
    return {
      revision: Math.max(0, Math.floor(raw.revision)),
      updatedAt: Math.max(0, Math.floor(raw.updatedAt)),
      payload: {} as TPayload,
    };
  }

  let payload: Record<string, unknown>;
  if (typeof raw.payloadJson === 'string') {
    // v1 compact format: single JSON string field
    try {
      payload = JSON.parse(raw.payloadJson) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (raw.payload) {
    // Legacy structured-map format
    payload = decodeFirestorePayload(raw.payload);
  } else {
    return null;
  }

  return {
    revision: Math.max(0, Math.floor(raw.revision)),
    updatedAt: Math.max(0, Math.floor(raw.updatedAt)),
    payload: payload as TPayload,
  };
}

function decodeFirestoreValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decodeFirestoreValue);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const asRecord = value as Record<string, unknown>;
  if (
    Object.keys(asRecord).length === 1 &&
    ((NESTED_ARRAY_MARKER in asRecord && Array.isArray(asRecord[NESTED_ARRAY_MARKER])) ||
      (LEGACY_NESTED_ARRAY_MARKER in asRecord && Array.isArray(asRecord[LEGACY_NESTED_ARRAY_MARKER])))
  ) {
    const encodedArray = (asRecord[NESTED_ARRAY_MARKER] ?? asRecord[LEGACY_NESTED_ARRAY_MARKER]) as unknown[];
    return encodedArray.map(decodeFirestoreValue);
  }

  const decoded: Record<string, unknown> = {};
  Object.entries(asRecord).forEach(([key, nested]) => {
    decoded[key] = decodeFirestoreValue(nested);
  });
  return decoded;
}

function decodeFirestorePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const decoded = decodeFirestoreValue(payload);
  return decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? (decoded as Record<string, unknown>) : {};
}

/**
 * Encode a value for native Firestore storage.
 * Firestore doesn't support nested arrays, so we wrap them with a marker object.
 */
function encodeFirestoreValue(value: unknown, insideArray = false): unknown {
  if (Array.isArray(value)) {
    const encoded = value.map(item => encodeFirestoreValue(item, true));
    // Any array that is itself inside another array must be wrapped with a marker
    // because Firestore does not allow nested arrays at any depth.
    if (insideArray) {
      return { [NESTED_ARRAY_MARKER]: encoded };
    }
    return encoded;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const encoded: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      encoded[k] = encodeFirestoreValue(v);
    }
    return encoded;
  }
  return value;
}

/** Encode a chunk payload's values so they can be stored as native Firestore fields. */
function encodeChunkForFirestore(chunk: Record<string, unknown>): Record<string, unknown> {
  const encoded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(chunk)) {
    encoded[key] = encodeFirestoreValue(value);
  }
  return encoded;
}

/** Decode a native Firestore chunk doc back into a plain JS object. */
function decodeChunkFromFirestore(data: Record<string, unknown>): Record<string, unknown> {
  return decodeFirestorePayload(data);
}

/**
 * Chunks with deeply nested or high-cardinality data that would exceed
 * Firestore's 40,000 index-entry limit when stored as native fields.
 * These are kept as a single payloadJson string.
 */
const JSON_ONLY_CHUNKS = new Set(['roster', 'equipment', 'settings', '_extra']);

/** Encode a chunk for Firestore write — native fields or payloadJson depending on complexity. */
function serializeChunkForWrite(chunkName: string, chunkPayload: Record<string, unknown>): Record<string, unknown> {
  if (JSON_ONLY_CHUNKS.has(chunkName)) {
    return { payloadJson: JSON.stringify(chunkPayload) };
  }
  return encodeChunkForFirestore(chunkPayload);
}

export function isOnlineSaveAvailable(): boolean {
  if (!isFirebaseConfigured()) return false;
  if (!getFirebaseFirestore()) return false;
  return !!getCurrentUid();
}

export async function loadOnlineSave<TPayload extends Record<string, unknown>>(
  saveSlot: string,
  onProgress?: LoadProgressCallback,
  options?: OnlineSaveLoadOptions,
): Promise<OnlineSaveLoadResult<TPayload>> {
  const db = getFirebaseFirestore();
  const uid = getCurrentUid();
  if (!db || !uid) return { ok: false, errorCode: 'unavailable' };

  try {
    const safeSlot = sanitizeSaveSlot(saveSlot);
    const ref = doc(db, 'users', uid, 'saveSlots', safeSlot);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: true, data: null };

    const raw = snap.data() as SaveDocRecord;

    // Schema v2+: chunked save – load chunks from subcollection
    if (Array.isArray(raw.chunkKeys) && raw.chunkKeys.length > 0) {
      const envelope = toEnvelope<TPayload>(raw);
      if (!envelope) return { ok: true, data: null };
      const includeChunks = options?.includeChunks ?? [];
      const selectedChunkKeys =
        includeChunks.length > 0 ? raw.chunkKeys.filter(chunkName => includeChunks.includes(chunkName)) : raw.chunkKeys;
      const payload = await loadChunksForSlot(db, ['users', uid, 'saveSlots', safeSlot], selectedChunkKeys, onProgress);
      envelope.payload = payload as TPayload;
      return { ok: true, data: envelope };
    }

    // Legacy v1/v0: inline payload
    onProgress?.(1, 1, 'payload');
    return { ok: true, data: toEnvelope<TPayload>(raw) };
  } catch (error) {
    return { ok: false, errorCode: mapFirestoreErrorCode(error) };
  }
}

/**
 * Load chunk documents from a saveSlot's /chunks subcollection.
 * Fires onProgress after each chunk resolves so callers can drive a progress bar.
 */
async function loadChunksForSlot(
  db: NonNullable<ReturnType<typeof getFirebaseFirestore>>,
  slotPath: [string, ...string[]],
  chunkKeys: string[],
  onProgress?: LoadProgressCallback,
): Promise<Record<string, unknown>> {
  if (chunkKeys.length === 0) {
    onProgress?.(1, 1, 'payload');
    return {};
  }

  const total = chunkKeys.length;
  let loaded = 0;
  const chunks: Record<string, Record<string, unknown>> = {};

  // Fetch chunk docs in parallel, then parse serially to avoid main-thread spikes
  const chunkDocs = await Promise.all(
    chunkKeys.map(async chunkName => {
      const chunkPath: [string, ...string[]] = [...slotPath, 'chunks', chunkName];
      const chunkRef = doc(db, ...chunkPath);
      const chunkSnap = await getDoc(chunkRef);
      return { chunkName, chunkSnap };
    }),
  );

  for (const { chunkName, chunkSnap } of chunkDocs) {
    if (chunkSnap.exists()) {
      const chunkData = chunkSnap.data();
      if (typeof chunkData.payloadJson === 'string') {
        // Legacy: chunk stored as JSON string
        try {
          chunks[chunkName] = JSON.parse(chunkData.payloadJson) as Record<string, unknown>;
        } catch {
          // Corrupted chunk — skip it, sanitizeSaveData will fill defaults
        }
      } else {
        // Native Firestore fields — decode nested array markers
        chunks[chunkName] = decodeChunkFromFirestore(chunkData);
      }
    }
    loaded++;
    onProgress?.(loaded, total, chunkName);
    if (loaded < total) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return mergeChunks(chunks);
}

export async function writeOnlineSave<TPayload extends Record<string, unknown>>(
  saveSlot: string,
  payload: TPayload,
  expectedRevision: number | null,
): Promise<OnlineSaveWriteResult<TPayload>> {
  const db = getFirebaseFirestore();
  const uid = getCurrentUid();
  if (!db || !uid) {
    return { ok: false, remote: null, errorCode: 'unavailable' };
  }

  try {
    const safeSlot = sanitizeSaveSlot(saveSlot);
    const ref = doc(db, 'users', uid, 'saveSlots', safeSlot);
    const now = Date.now();
    const chunks = splitPayloadIntoChunks(payload as unknown as Record<string, unknown>);
    const chunkEntries = Object.entries(chunks);
    const chunkKeyList = chunkEntries.map(([name]) => name);

    return runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      const remote = snap.exists() ? toEnvelope<TPayload>(snap.data()) : null;
      const remoteRevision = remote?.revision ?? 0;
      const baseRevision = expectedRevision ?? remoteRevision;

      if (remoteRevision !== baseRevision) {
        // Conflict detected — load remote chunks if needed for conflict resolution
        if (remote && snap.exists()) {
          const rawData = snap.data() as SaveDocRecord;
          if (Array.isArray(rawData.chunkKeys) && rawData.chunkKeys.length > 0) {
            const remotePayload = await loadChunksForSlot(db, ['users', uid, 'saveSlots', safeSlot], rawData.chunkKeys);
            remote.payload = remotePayload as TPayload;
          }
        }
        return { ok: false, remote } as OnlineSaveWriteResult<TPayload>;
      }

      const nextRevision = remoteRevision + 1;

      // Write header doc (no inline payload — data is in chunks)
      tx.set(ref, {
        revision: nextRevision,
        updatedAt: now,
        schemaVersion: SAVE_SCHEMA_VERSION,
        saveSlot: safeSlot,
        chunkKeys: chunkKeyList,
      });

      // Write each chunk
      for (const [chunkName, chunkPayload] of chunkEntries) {
        const chunkRef = doc(db, 'users', uid, 'saveSlots', safeSlot, 'chunks', chunkName);
        tx.set(chunkRef, serializeChunkForWrite(chunkName, chunkPayload));
      }

      return { ok: true, revision: nextRevision } as OnlineSaveWriteResult<TPayload>;
    });
  } catch (error) {
    return { ok: false, remote: null, errorCode: mapFirestoreErrorCode(error) };
  }
}

export async function deleteOnlineSave(saveSlot: string): Promise<{ ok: boolean; errorCode?: OnlineSaveErrorCode }> {
  const db = getFirebaseFirestore();
  const uid = getCurrentUid();
  if (!db || !uid) return { ok: false, errorCode: 'unavailable' };

  try {
    const safeSlot = sanitizeSaveSlot(saveSlot);
    const ref = doc(db, 'users', uid, 'saveSlots', safeSlot);

    // Delete all chunk subcollection docs first
    const chunksCol = collection(db, 'users', uid, 'saveSlots', safeSlot, 'chunks');
    const chunkSnaps = await getDocs(chunksCol);
    if (!chunkSnaps.empty) {
      const batch = writeBatch(db);
      chunkSnaps.forEach(chunkDoc => batch.delete(chunkDoc.ref));
      await batch.commit();
    }

    await deleteDoc(ref);
    return { ok: true };
  } catch (error) {
    return { ok: false, errorCode: mapFirestoreErrorCode(error) };
  }
}

/** Reads a specific user's save slot (used by admins for /sendMsg). */
export async function loadOnlineSaveForUid<TPayload extends Record<string, unknown>>(
  uid: string,
  saveSlotId: string,
): Promise<OnlineSaveLoadResult<TPayload>> {
  const db = getFirebaseFirestore();
  if (!db) return { ok: false, errorCode: 'unavailable' };
  if (!(await isCurrentUserAdmin())) return { ok: false, errorCode: 'permission-denied' };
  try {
    const ref = doc(db, 'users', uid, 'saveSlots', saveSlotId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: true, data: null };
    await logAdminAction('load_save_for_uid', { targetUid: uid, saveSlotId });

    const raw = snap.data() as SaveDocRecord;
    const envelope = toEnvelope<TPayload>(raw);
    if (!envelope) return { ok: true, data: null };

    // Chunked save — load chunks
    if (Array.isArray(raw.chunkKeys) && raw.chunkKeys.length > 0) {
      const payload = await loadChunksForSlot(db, ['users', uid, 'saveSlots', saveSlotId], raw.chunkKeys);
      envelope.payload = payload as TPayload;
    }

    return { ok: true, data: envelope };
  } catch (error) {
    return { ok: false, errorCode: mapFirestoreErrorCode(error) };
  }
}

/** Overwrites a specific user's save slot (used by admins for /sendMsg mail injection). */
export async function writeOnlineSaveForUid<TPayload extends Record<string, unknown>>(
  uid: string,
  saveSlotId: string,
  payload: TPayload,
): Promise<{ ok: boolean; errorCode?: OnlineSaveErrorCode }> {
  const db = getFirebaseFirestore();
  if (!db) return { ok: false, errorCode: 'unavailable' };
  if (!(await isCurrentUserAdmin())) return { ok: false, errorCode: 'permission-denied' };
  try {
    const ref = doc(db, 'users', uid, 'saveSlots', saveSlotId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, errorCode: 'invalid-slot' };
    const existing = snap.data() as SaveDocRecord;

    // Write chunked format
    const chunks = splitPayloadIntoChunks(payload as unknown as Record<string, unknown>);
    const chunkEntries = Object.entries(chunks);
    const chunkKeyList = chunkEntries.map(([name]) => name);

    const batch = writeBatch(db);
    batch.set(ref, {
      revision: existing.revision,
      updatedAt: Date.now(),
      schemaVersion: SAVE_SCHEMA_VERSION,
      saveSlot: existing.saveSlot,
      chunkKeys: chunkKeyList,
    });
    for (const [chunkName, chunkPayload] of chunkEntries) {
      const chunkRef = doc(db, 'users', uid, 'saveSlots', saveSlotId, 'chunks', chunkName);
      batch.set(chunkRef, serializeChunkForWrite(chunkName, chunkPayload));
    }
    await batch.commit();

    await logAdminAction('write_save_for_uid', { targetUid: uid, saveSlotId });
    return { ok: true };
  } catch (error) {
    return { ok: false, errorCode: mapFirestoreErrorCode(error) };
  }
}
