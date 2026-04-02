import {
  collection,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore, isFirebaseConfigured } from './firebase';

const LEADERBOARD_COLLECTION = 'leaderboard_global_v1';

export interface LeaderboardEntry {
  uid: string;
  accountName: string;
  playerName: string;
  score: number;
  highestWaveReached: number;
  prestigeCount: number;
  updatedAt: number;
}

export interface SubmitLeaderboardScoreInput {
  accountName: string;
  playerName: string;
  score: number;
  highestWaveReached: number;
  prestigeCount: number;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function isEntry(value: unknown): value is LeaderboardEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<LeaderboardEntry>;
  return (
    typeof entry.uid === 'string'
    && typeof entry.accountName === 'string'
    && typeof entry.playerName === 'string'
    && typeof entry.score === 'number'
    && typeof entry.highestWaveReached === 'number'
    && typeof entry.prestigeCount === 'number'
    && typeof entry.updatedAt === 'number'
  );
}

export function isLiveLeaderboardAvailable(): boolean {
  if (!isFirebaseConfigured()) return false;
  if (!getFirebaseFirestore()) return false;
  return !!getFirebaseAuth()?.currentUser?.uid;
}

export async function submitLeaderboardScore(input: SubmitLeaderboardScoreInput): Promise<void> {
  const db = getFirebaseFirestore();
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!db || !uid) return;

  const ref = doc(db, LEADERBOARD_COLLECTION, uid);
  const now = Date.now();
  const score = clampScore(input.score);

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const remoteScore = snap.exists() && typeof snap.data().score === 'number' ? clampScore(snap.data().score) : 0;
    if (remoteScore > score) {
      return;
    }

    tx.set(ref, {
      uid,
      accountName: input.accountName.trim().toLowerCase().slice(0, 48),
      playerName: input.playerName.trim().slice(0, 24) || 'Commander',
      score,
      highestWaveReached: clampScore(input.highestWaveReached),
      prestigeCount: clampScore(input.prestigeCount),
      updatedAt: now,
    });
  });
}

export async function fetchLeaderboardTop(maxRows = 25): Promise<LeaderboardEntry[]> {
  const db = getFirebaseFirestore();
  if (!db) return [];

  const q = query(collection(db, LEADERBOARD_COLLECTION), orderBy('score', 'desc'), limit(maxRows));
  const snap = await getDocs(q);
  return snap.docs
    .map(docSnap => docSnap.data())
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
