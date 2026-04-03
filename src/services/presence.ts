import { collection, getCountFromServer, query, serverTimestamp, setDoc, where, doc } from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';

const PRESENCE_COLLECTION = 'onlinePresence';
const HEARTBEAT_MS = 45_000;
const ONLINE_WINDOW_MS = 90_000;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

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
  void writePresenceHeartbeat(uid, displayName, level);

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  heartbeatTimer = setInterval(() => {
    void writePresenceHeartbeat(uid, displayName, level);
  }, HEARTBEAT_MS);

  return () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
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
