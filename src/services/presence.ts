import { collection, getCountFromServer, query, serverTimestamp, setDoc, where, doc } from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';

const PRESENCE_COLLECTION = 'onlinePresence';
const HEARTBEAT_MS = 45_000;
const ONLINE_WINDOW_MS = 90_000;

/** Per-uid heartbeat timers — prevents global singleton conflicts with StrictMode / HMR. */
const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();

function nowMs(): number {
  return Date.now();
}

export async function writePresenceHeartbeat(uid: string, displayName: string, level: number): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !uid) return;

  const safeLevel = Math.max(1, Math.floor(level || 1));
  await setDoc(
    doc(db, PRESENCE_COLLECTION, uid),
    {
      uid,
      displayName: displayName.trim().slice(0, 24) || 'Player',
      level: safeLevel,
      lastSeen: nowMs(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function markPresenceOffline(uid: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !uid) return;
  await setDoc(doc(db, PRESENCE_COLLECTION, uid), { lastSeen: 0, updatedAt: serverTimestamp() }, { merge: true });
}

export function startPresenceHeartbeat(uid: string, displayName: string, level: number): () => void {
  void writePresenceHeartbeat(uid, displayName, level).catch(() => {});

  // Clear any existing timer for this uid (handles StrictMode double-mount / HMR)
  const existing = heartbeatTimers.get(uid);
  if (existing) clearInterval(existing);

  const timer = setInterval(() => {
    void writePresenceHeartbeat(uid, displayName, level).catch(() => {});
  }, HEARTBEAT_MS);
  heartbeatTimers.set(uid, timer);

  return () => {
    const t = heartbeatTimers.get(uid);
    if (t) {
      clearInterval(t);
      heartbeatTimers.delete(uid);
    }
  };
}

export async function fetchOnlineCount(): Promise<number> {
  const db = getFirebaseFirestore();
  if (!db) return 0;

  const cutoff = nowMs() - ONLINE_WINDOW_MS;
  const countSnap = await getCountFromServer(
    query(collection(db, PRESENCE_COLLECTION), where('lastSeen', '>', cutoff)),
  );
  return countSnap.data().count;
}
