import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from './firebase';

const PUBLIC_USERNAMES_COLLECTION = 'publicUsernames';
const USER_PROFILES_COLLECTION = 'userProfiles';

export const PUBLIC_USERNAME_MIN = 3;
export const PUBLIC_USERNAME_MAX = 24;

/**
 * Validates format only (not uniqueness).
 * Returns an error string, or null if valid.
 */
export function validatePublicUsername(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < PUBLIC_USERNAME_MIN) return `Must be at least ${PUBLIC_USERNAME_MIN} characters.`;
  if (trimmed.length > PUBLIC_USERNAME_MAX) return `Must be ${PUBLIC_USERNAME_MAX} characters or fewer.`;
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return 'Letters, numbers, and underscores only.';
  return null;
}

export function normalizePublicUsername(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Non-transactional pre-check. Fast, but not race-safe.
 * Returns true if the username appears available.
 */
export async function isPublicUsernameAvailable(username: string): Promise<boolean> {
  const db = getFirebaseFirestore();
  if (!db) return true;
  try {
    const normalized = normalizePublicUsername(username);
    const snap = await getDoc(doc(db, PUBLIC_USERNAMES_COLLECTION, normalized));
    return !snap.exists();
  } catch {
    return true;
  }
}

/**
 * Atomically claims the username in `publicUsernames` and writes to `userProfiles/{uid}`.
 * Returns ok:false with an error string if the username is already claimed by another uid.
 */
export async function reservePublicUsername(
  displayName: string,
  uid: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = getFirebaseFirestore();
  if (!db) return { ok: false, error: 'Service unavailable.' };

  const normalized = normalizePublicUsername(displayName);
  const nameRef = doc(db, PUBLIC_USERNAMES_COLLECTION, normalized);
  const profileRef = doc(db, USER_PROFILES_COLLECTION, uid);

  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(nameRef);
      if (snap.exists() && snap.data().uid !== uid) {
        throw new Error('taken');
      }
      tx.set(nameRef, { uid, createdAt: Date.now() });
      tx.set(profileRef, { publicUsername: displayName.trim(), updatedAt: Date.now() }, { merge: true });
    });

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'taken') return { ok: false, error: 'That username is already taken. Please choose another.' };
    return { ok: false, error: 'Could not reserve username. Please try again.' };
  }
}

/**
 * Reads the public username from Firestore for the given uid and refreshes the local cache.
 * Returns null if not set or unavailable.
 */
export async function loadPublicUsername(uid: string): Promise<string | null> {
  const db = getFirebaseFirestore();
  if (!db) return null;

  try {
    const profileRef = doc(db, USER_PROFILES_COLLECTION, uid);
    const snap = await getDoc(profileRef);
    if (!snap.exists()) return null;
    const username = snap.data().publicUsername;
    if (typeof username !== 'string' || !username) return null;
    return username;
  } catch {
    return null;
  }
}

/**
 * Loads the public username for the currently signed-in Firebase user.
 */
export async function refreshCurrentUserPublicUsername(): Promise<string | null> {
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!uid) return null;
  return loadPublicUsername(uid);
}
