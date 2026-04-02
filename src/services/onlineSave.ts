import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore, isFirebaseConfigured } from './firebase';

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
  payload: Record<string, unknown>;
}

export type OnlineSaveWriteResult<TPayload extends Record<string, unknown>> =
  | { ok: true; revision: number }
  | { ok: false; remote: OnlineSaveEnvelope<TPayload> | null; errorCode?: OnlineSaveErrorCode };

export type OnlineSaveLoadResult<TPayload extends Record<string, unknown>> =
  | { ok: true; data: OnlineSaveEnvelope<TPayload> | null }
  | { ok: false; errorCode: OnlineSaveErrorCode };

function sanitizeSaveSlot(saveSlot: string): string {
  const sanitized = saveSlot.trim().replace(/[/.#$\[\]]/g, '_').slice(0, 96) || 'default';
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
    typeof record.revision === 'number'
    && typeof record.updatedAt === 'number'
    && typeof record.saveSlot === 'string'
    && !!record.payload
    && typeof record.payload === 'object'
  );
}

function toEnvelope<TPayload extends Record<string, unknown>>(raw: unknown): OnlineSaveEnvelope<TPayload> | null {
  if (!isSaveDocRecord(raw)) return null;
  return {
    revision: Math.max(0, Math.floor(raw.revision)),
    updatedAt: Math.max(0, Math.floor(raw.updatedAt)),
    payload: raw.payload as TPayload,
  };
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
        payload,
      });

      return { ok: true, revision: nextRevision } as OnlineSaveWriteResult<TPayload>;
    });
  } catch (error) {
    return { ok: false, remote: null, errorCode: mapFirestoreErrorCode(error) };
  }
}
