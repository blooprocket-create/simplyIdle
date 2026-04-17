import {
  collection,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore, isFirebaseConfigured } from './firebase';
import { SOCIAL_FEATURE_FLAGS } from '../socialFeatureFlags';

const LEADERBOARD_COLLECTION = 'leaderboard_global_v1';
const MIN_SUBMIT_INTERVAL_MS = 12_000;

interface SubmitGuardState {
  inFlight: boolean;
  lastAttemptAt: number;
  lastScoreSeen: number;
}

const submitGuardByUid = new Map<string, SubmitGuardState>();

export interface LeaderboardEntry {
  uid: string;
  accountName: string;
  publicUsername: string;
  score: number;
  level: number;
  vipLevel: number;
  highestWaveReached: number;
  prestigeCount: number;
  updatedAt: number;
}

export interface SubmitLeaderboardScoreInput {
  accountName: string;
  publicUsername: string;
  score: number;
  level: number;
  vipLevel: number;
  highestWaveReached: number;
  prestigeCount: number;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function isEntry(value: unknown): value is LeaderboardEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<LeaderboardEntry>;
  return (
    typeof entry.uid === 'string' &&
    typeof entry.accountName === 'string' &&
    typeof entry.publicUsername === 'string' &&
    typeof entry.score === 'number' &&
    typeof entry.level === 'number' &&
    (typeof entry.vipLevel === 'number' || typeof entry.vipLevel === 'undefined') &&
    typeof entry.highestWaveReached === 'number' &&
    typeof entry.prestigeCount === 'number' &&
    typeof entry.updatedAt === 'number'
  );
}

export function isLiveLeaderboardAvailable(): boolean {
  if (!isFirebaseConfigured()) return false;
  if (!getFirebaseFirestore()) return false;
  return !!getFirebaseAuth()?.currentUser?.uid;
}

export async function submitLeaderboardScore(input: SubmitLeaderboardScoreInput): Promise<void> {
  if (!SOCIAL_FEATURE_FLAGS.leaderboard) return;
  const db = getFirebaseFirestore();
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!db || !uid) return;

  const ref = doc(db, LEADERBOARD_COLLECTION, uid);
  const now = Date.now();
  const score = clampScore(input.score);

  const guard = submitGuardByUid.get(uid) ?? {
    inFlight: false,
    lastAttemptAt: 0,
    lastScoreSeen: 0,
  };

  if (guard.inFlight) return;
  if (now - guard.lastAttemptAt < MIN_SUBMIT_INTERVAL_MS) {
    return;
  }

  guard.inFlight = true;
  guard.lastAttemptAt = now;
  guard.lastScoreSeen = Math.max(guard.lastScoreSeen, score);
  submitGuardByUid.set(uid, guard);

  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      const remoteData = snap.exists() ? snap.data() : null;

      // Respect the Firestore-rules 10s rate limit even after page reload
      // (in-memory guard state is lost on refresh).
      const remoteUpdatedAt = remoteData && typeof remoteData.updatedAt === 'number' ? remoteData.updatedAt : 0;
      if (remoteUpdatedAt > 0 && now - remoteUpdatedAt < MIN_SUBMIT_INTERVAL_MS) {
        return;
      }

      const remoteScore = remoteData && typeof remoteData.score === 'number' ? clampScore(remoteData.score) : 0;
      const remoteVipLevel =
        remoteData && typeof remoteData.vipLevel === 'number' ? Math.max(0, Math.floor(remoteData.vipLevel)) : 0;
      const nextScore = Math.max(remoteScore, score);
      const nextVipLevel = Math.max(remoteVipLevel, Math.max(0, Math.floor(input.vipLevel || 0)));

      tx.set(ref, {
        uid,
        accountName: input.accountName.trim().toLowerCase().slice(0, 48),
        publicUsername: input.publicUsername.trim().slice(0, 24) || 'Commander',
        score: nextScore,
        level: clampLevel(input.level),
        vipLevel: nextVipLevel,
        highestWaveReached: clampScore(input.highestWaveReached),
        prestigeCount: clampScore(input.prestigeCount),
        updatedAt: now,
      });
    });
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : '';
    if (code.includes('failed-precondition') || code.includes('aborted') || code.includes('permission-denied')) {
      // Transient errors: transaction contention, rate-limit near boundary, or rule timing edge.
      return;
    }
    throw error;
  } finally {
    const current = submitGuardByUid.get(uid);
    if (current) {
      current.inFlight = false;
      submitGuardByUid.set(uid, current);
    }
  }

  // Denormalize approximate rank (non-blocking, runs after transaction)
  void (async () => {
    try {
      const higherScores = query(collection(db, LEADERBOARD_COLLECTION), where('score', '>', score));
      const countSnap = await getCountFromServer(higherScores);
      const approxRank = countSnap.data().count + 1;
      await updateDoc(ref, { approxRank });
    } catch {
      // Non-critical — rank will update on next submission cycle
    }
  })();
}

export async function fetchLeaderboardTop(maxRows = 25): Promise<LeaderboardEntry[]> {
  const db = getFirebaseFirestore();
  if (!db) return [];

  const q = query(collection(db, LEADERBOARD_COLLECTION), orderBy('score', 'desc'), limit(maxRows));
  const snap = await getDocs(q);
  return snap.docs
    .map(docSnap => {
      const row = docSnap.data() as Partial<LeaderboardEntry>;
      return {
        uid: row.uid ?? '',
        accountName: row.accountName ?? 'player',
        publicUsername: row.publicUsername ?? row.accountName ?? 'Commander',
        score: clampScore(typeof row.score === 'number' ? row.score : 0),
        level: clampLevel(typeof row.level === 'number' ? row.level : 1),
        vipLevel: typeof row.vipLevel === 'number' ? Math.max(0, Math.floor(row.vipLevel)) : 0,
        highestWaveReached: clampScore(typeof row.highestWaveReached === 'number' ? row.highestWaveReached : 0),
        prestigeCount: clampScore(typeof row.prestigeCount === 'number' ? row.prestigeCount : 0),
        updatedAt: clampScore(typeof row.updatedAt === 'number' ? row.updatedAt : 0),
      } satisfies LeaderboardEntry;
    })
    .filter(isEntry)
    .sort((a, b) => b.score - a.score);
}

export async function fetchCurrentUserRank(score: number): Promise<number | null> {
  const db = getFirebaseFirestore();
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!db || !uid) return null;

  const safeScore = clampScore(score);
  const higherScoreQuery = query(collection(db, LEADERBOARD_COLLECTION), where('score', '>', safeScore));
  const countSnap = await getCountFromServer(higherScoreQuery);
  return countSnap.data().count + 1;
}
