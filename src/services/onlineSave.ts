import { deleteDoc, doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore, isFirebaseConfigured } from './firebase';
import { isCurrentUserAdmin, logAdminAction } from './adminAccess';

const SAVE_SCHEMA_VERSION = 1;

export interface OnlineSaveEnvelope<TPayload extends Record<string, unknown>> {
  revision: number;
  updatedAt: number;
  payload: TPayload;
}

export type OnlineSaveErrorCode = 'permission-denied' | 'invalid-slot' | 'unavailable' | 'unknown';

interface SaveDocRecord {
  revision: number;
  updatedAt: number;
  schemaVersion: number;
  saveSlot: string;
  payload?: Record<string, unknown>;
  payloadJson?: string;
}

const NESTED_ARRAY_MARKER = 'simplyIdleNestedArrayV1';
const LEGACY_NESTED_ARRAY_MARKER = '__simplyIdle_nested_array_v1__';

export type OnlineSaveWriteResult<TPayload extends Record<string, unknown>> =
  | { ok: true; revision: number }
  | { ok: false; remote: OnlineSaveEnvelope<TPayload> | null; errorCode?: OnlineSaveErrorCode };

export type OnlineSaveLoadResult<TPayload extends Record<string, unknown>> =
  | { ok: true; data: OnlineSaveEnvelope<TPayload> | null }
  | { ok: false; errorCode: OnlineSaveErrorCode };

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
    (typeof record.payloadJson === 'string' || (!!record.payload && typeof record.payload === 'object'))
  );
}

function toEnvelope<TPayload extends Record<string, unknown>>(raw: unknown): OnlineSaveEnvelope<TPayload> | null {
  if (!isSaveDocRecord(raw)) return null;

  let payload: Record<string, unknown>;
  if (typeof raw.payloadJson === 'string') {
    // New compact format: single JSON string field
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

export function isOnlineSaveAvailable(): boolean {
  if (!isFirebaseConfigured()) return false;
  if (!getFirebaseFirestore()) return false;
  return !!getCurrentUid();
}

export async function loadOnlineSave<TPayload extends Record<string, unknown>>(
  saveSlot: string,
): Promise<OnlineSaveLoadResult<TPayload>> {
  const db = getFirebaseFirestore();
  const uid = getCurrentUid();
  if (!db || !uid) return { ok: false, errorCode: 'unavailable' };

  try {
    const safeSlot = sanitizeSaveSlot(saveSlot);
    const ref = doc(db, 'users', uid, 'saveSlots', safeSlot);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: true, data: null };
    return { ok: true, data: toEnvelope<TPayload>(snap.data()) };
  } catch (error) {
    return { ok: false, errorCode: mapFirestoreErrorCode(error) };
  }
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

    return runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      const remote = snap.exists() ? toEnvelope<TPayload>(snap.data()) : null;
      const remoteRevision = remote?.revision ?? 0;
      const baseRevision = expectedRevision ?? remoteRevision;

      if (remoteRevision !== baseRevision) {
        return { ok: false, remote } as OnlineSaveWriteResult<TPayload>;
      }

      const nextRevision = remoteRevision + 1;
      tx.set(ref, {
        revision: nextRevision,
        updatedAt: now,
        schemaVersion: SAVE_SCHEMA_VERSION,
        saveSlot: safeSlot,
        payloadJson: JSON.stringify(payload),
      });

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
    return { ok: true, data: toEnvelope<TPayload>(snap.data()) };
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
    await setDoc(ref, {
      revision: existing.revision,
      updatedAt: Date.now(),
      schemaVersion: existing.schemaVersion ?? SAVE_SCHEMA_VERSION,
      saveSlot: existing.saveSlot,
      payloadJson: JSON.stringify(payload),
    });
    await logAdminAction('write_save_for_uid', { targetUid: uid, saveSlotId });
    return { ok: true };
  } catch (error) {
    return { ok: false, errorCode: mapFirestoreErrorCode(error) };
  }
}
