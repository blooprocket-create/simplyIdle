import { collection, doc, getCountFromServer, getDoc, query, runTransaction } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from './firebase';

const PUBLIC_USERNAMES_COLLECTION = 'publicUsernames';
const USER_PROFILES_COLLECTION = 'userProfiles';
const LEADERBOARD_COLLECTION = 'leaderboard_global_v1';
const USER_GUILD_COLLECTION = 'userGuild';

export const PUBLIC_USERNAME_MIN = 3;
export const PUBLIC_USERNAME_MAX = 24;

export interface PublicPlayerProfile {
  uid: string;
  publicUsername: string;
  giftPreference: 'gold' | 'shards' | 'essence';
  level: number;
  vipLevel: number;
  score: number;
  highestWaveReached: number;
  prestigeCount: number;
  guildName: string | null;
  guildRank: string | null;
  leaderboardRank: number | null;
  friendCount: number;
  guildContribution: number;
}

function normalizeGiftPreference(value: unknown): 'gold' | 'shards' | 'essence' {
  if (value === 'shards' || value === 'essence') return value;
  return 'gold';
}

export async function fetchPublicPlayerProfile(uid: string): Promise<PublicPlayerProfile | null> {
  const db = getFirebaseFirestore();
  if (!db || !uid) return null;

  const [profileSnap, boardSnap, guildSnap] = await Promise.all([
    getDoc(doc(db, USER_PROFILES_COLLECTION, uid)).catch(() => null),
    getDoc(doc(db, LEADERBOARD_COLLECTION, uid)).catch(() => null),
    getDoc(doc(db, USER_GUILD_COLLECTION, uid)).catch(() => null),
  ]);

  let friendCount = 0;
  try {
    const friendCountSnap = await getCountFromServer(query(collection(db, 'friends', uid, 'list')));
    friendCount = friendCountSnap.data().count;
  } catch {
    friendCount = 0;
  }

  const profileData = profileSnap && profileSnap.exists() ? profileSnap.data() : {};
  const boardData = boardSnap && boardSnap.exists() ? boardSnap.data() : {};
  const guildData = guildSnap && guildSnap.exists() ? guildSnap.data() : {};

  const publicUsername =
    typeof profileData.publicUsername === 'string'
      ? profileData.publicUsername
      : typeof boardData.publicUsername === 'string'
        ? boardData.publicUsername
        : 'Player';

  const score = typeof boardData.score === 'number' ? Math.max(0, Math.floor(boardData.score)) : 0;

  const leaderboardRank =
    typeof boardData.approxRank === 'number' && boardData.approxRank > 0 ? boardData.approxRank : null;

  let guildContribution = 0;
  try {
    const guildId = typeof guildData.guildId === 'string' ? guildData.guildId : '';
    if (guildId) {
      const memberSnap = await getDoc(doc(db, 'guilds', guildId, 'members', uid));
      if (memberSnap.exists()) {
        const memberData = memberSnap.data();
        guildContribution =
          typeof memberData.guildContribution === 'number' ? Math.max(0, Math.floor(memberData.guildContribution)) : 0;
      }
    }
  } catch {
    guildContribution = 0;
  }

  return {
    uid,
    publicUsername,
    giftPreference: normalizeGiftPreference(profileData.giftPreference),
    level: typeof boardData.level === 'number' ? Math.max(1, Math.floor(boardData.level)) : 1,
    vipLevel: typeof boardData.vipLevel === 'number' ? Math.max(0, Math.floor(boardData.vipLevel)) : 0,
    score,
    highestWaveReached:
      typeof boardData.highestWaveReached === 'number' ? Math.max(0, Math.floor(boardData.highestWaveReached)) : 0,
    prestigeCount: typeof boardData.prestigeCount === 'number' ? Math.max(0, Math.floor(boardData.prestigeCount)) : 0,
    guildName: typeof guildData.guildName === 'string' ? guildData.guildName : null,
    guildRank: typeof guildData.rank === 'string' ? guildData.rank : null,
    leaderboardRank,
    friendCount,
    guildContribution,
  };
}

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
