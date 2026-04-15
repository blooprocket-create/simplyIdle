import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';
import { SOCIAL_FEATURE_FLAGS } from '../socialFeatureFlags';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ActivityType =
  | 'prestige_completed'
  | 'boss_defeated'
  | 'achievement_unlocked'
  | 'guild_joined'
  | 'wave_milestone'
  | 'leaderboard_rank_change';

export interface ActivityEvent {
  id: string;
  uid: string;
  displayName: string;
  type: ActivityType;
  data: Record<string, string | number | boolean>;
  createdAt: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Only show activity from the last 7 days. */
const ACTIVITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const VALID_TYPES = new Set<ActivityType>([
  'prestige_completed',
  'boss_defeated',
  'achievement_unlocked',
  'guild_joined',
  'wave_milestone',
  'leaderboard_rank_change',
]);

// ─── Publish Activity ────────────────────────────────────────────────────────

/**
 * Publish an activity event to the player's feed.
 * Called from game logic when significant events occur.
 */
export async function publishActivity(
  uid: string,
  displayName: string,
  type: ActivityType,
  data: Record<string, string | number | boolean> = {},
): Promise<void> {
  if (!SOCIAL_FEATURE_FLAGS.activityFeed) return;
  const db = getFirebaseFirestore();
  if (!db || !uid || !VALID_TYPES.has(type)) return;

  const eventRef = doc(collection(db, 'activityFeed', uid, 'events'));
  await setDoc(eventRef, {
    uid,
    displayName: displayName.trim().slice(0, 24),
    type,
    data,
    createdAt: Date.now(),
  });
}

// ─── Fetch Activity (single player) ─────────────────────────────────────────

export async function fetchPlayerActivity(uid: string, maxRows = 20): Promise<ActivityEvent[]> {
  const db = getFirebaseFirestore();
  if (!db || !uid) return [];

  const cutoff = Date.now() - ACTIVITY_TTL_MS;
  const q = query(
    collection(db, 'activityFeed', uid, 'events'),
    where('createdAt', '>', cutoff),
    orderBy('createdAt', 'desc'),
    limit(maxRows),
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => parseActivityDoc(d.id, d.data())).filter((e): e is ActivityEvent => e !== null);
}

// ─── Subscribe to friend activity (merged feed) ─────────────────────────────

/**
 * Subscribe to activity from a list of friend UIDs.
 * Merges multiple friends' feeds and returns sorted by most recent.
 *
 * Note: Firestore doesn't support cross-subcollection queries,
 * so we subscribe to each friend individually (limited by friendCount).
 */
export function subscribeToFriendActivity(
  friendUids: string[],
  onActivity: (events: ActivityEvent[]) => void,
): () => void {
  const db = getFirebaseFirestore();
  if (!db || friendUids.length === 0) return () => {};

  const cutoff = Date.now() - ACTIVITY_TTL_MS;
  // Cap subscription count to prevent excessive Firestore listeners
  const cappedUids = friendUids.slice(0, 30);
  const eventsByUid = new Map<string, ActivityEvent[]>();
  const unsubs: (() => void)[] = [];

  const emitMerged = () => {
    const all: ActivityEvent[] = [];
    for (const events of eventsByUid.values()) {
      all.push(...events);
    }
    all.sort((a, b) => b.createdAt - a.createdAt);
    onActivity(all.slice(0, 100)); // cap at 100 merged events
  };

  for (const friendUid of cappedUids) {
    const q = query(
      collection(db, 'activityFeed', friendUid, 'events'),
      where('createdAt', '>', cutoff),
      orderBy('createdAt', 'desc'),
      limit(10),
    );

    const unsub = onSnapshot(q, snap => {
      const events = snap.docs.map(d => parseActivityDoc(d.id, d.data())).filter((e): e is ActivityEvent => e !== null);
      eventsByUid.set(friendUid, events);
      emitMerged();
    });

    unsubs.push(unsub);
  }

  return () => {
    unsubs.forEach(unsub => unsub());
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseActivityDoc(id: string, data: Record<string, unknown>): ActivityEvent | null {
  const uid = typeof data.uid === 'string' ? data.uid : '';
  const type = typeof data.type === 'string' ? data.type : '';
  const createdAt = typeof data.createdAt === 'number' ? data.createdAt : 0;
  if (!uid || !VALID_TYPES.has(type as ActivityType) || !createdAt) return null;

  return {
    id,
    uid,
    displayName: typeof data.displayName === 'string' ? data.displayName : 'Player',
    type: type as ActivityType,
    data:
      typeof data.data === 'object' && data.data !== null
        ? (data.data as Record<string, string | number | boolean>)
        : {},
    createdAt,
  };
}
