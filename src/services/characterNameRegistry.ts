import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore, isFirebaseConfigured } from './firebase';

export type CharacterNameReserveResult =
  | { ok: true }
  | { ok: false; error: 'taken' | 'unavailable' | 'unknown' };

function normalizeCharacterName(name: string): string {
  // NFC normalize to collapse composed/decomposed Unicode variants,
  // then strip characters outside Basic Latin + Latin Extended to block
  // Cyrillic/Greek/etc. homoglyphs (е→e, і→i, о→o).
  return name
    .normalize('NFC')
    .replace(/[^\u0000-\u024F\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function toNameDocId(normalizedName: string): string {
  return encodeURIComponent(normalizedName).slice(0, 160) || 'unnamed';
}

export function normalizeCharacterNameForCompare(name: string): string {
  return normalizeCharacterName(name);
}

export async function reserveCharacterName(name: string, accountName: string): Promise<CharacterNameReserveResult> {
  if (!isFirebaseConfigured()) return { ok: true };

  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();
  const uid = auth?.currentUser?.uid;
  if (!db || !uid) return { ok: false, error: 'unavailable' };

  const normalized = normalizeCharacterName(name);
  if (!normalized) return { ok: false, error: 'unknown' };

  const ref = doc(db, 'characterNames', toNameDocId(normalized));

  try {
    return await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        return { ok: false, error: 'taken' } as CharacterNameReserveResult;
      }

      tx.set(ref, {
        normalized,
        displayName: name.trim().slice(0, 24),
        accountName: accountName.trim().toLowerCase(),
        uid,
        createdAt: serverTimestamp(),
      });

      return { ok: true } as CharacterNameReserveResult;
    });
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : '';
    if (code.includes('permission-denied') || code.includes('unavailable')) {
      return { ok: false, error: 'unavailable' };
    }
    return { ok: false, error: 'unknown' };
  }
}

export async function releaseCharacterName(name: string): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();
  const uid = auth?.currentUser?.uid;
  if (!db || !uid) return;

  const normalized = normalizeCharacterName(name);
  if (!normalized) return;

  const ref = doc(db, 'characterNames', toNameDocId(normalized));

  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;

      const ownerUid = snap.get('uid');
      if (typeof ownerUid !== 'string' || ownerUid !== uid) return;

      tx.delete(ref);
    });
  } catch {
    // Best-effort cleanup on delete.
  }
}
