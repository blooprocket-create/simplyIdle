import { collection, doc, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore';
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
 * Uses periodic polling instead of per-friend real-time listeners
 * to reduce Firestore connection overhead (30 listeners → 1 poll interval).
 */
export function subscribeToFriendActivity(
  friendUids: string[],
  onActivity: (events: ActivityEvent[]) => void,
): () => void {
  const db = getFirebaseFirestore();
  if (!db || friendUids.length === 0) return () => {};

  const cappedUids = friendUids.slice(0, 30);
  let cancelled = false;

  const fetchAll = async () => {
    const cutoff = Date.now() - ACTIVITY_TTL_MS;
    const allEvents: ActivityEvent[] = [];

    // Batch into groups of 10 for parallel fetching
    const BATCH_SIZE = 10;
    for (let i = 0; i < cappedUids.length; i += BATCH_SIZE) {
      const batch = cappedUids.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(uid =>
          getDocs(
            query(
              collection(db, 'activityFeed', uid, 'events'),
              where('createdAt', '>', cutoff),
              orderBy('createdAt', 'desc'),
              limit(5),
            ),
          ),
        ),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          for (const d of result.value.docs) {
            const event = parseActivityDoc(d.id, d.data());
            if (event) allEvents.push(event);
          }
        }
      }
    }

    allEvents.sort((a, b) => b.createdAt - a.createdAt);
    if (!cancelled) {
      onActivity(allEvents.slice(0, 100));
    }
  };

  // Initial fetch + poll every 60 seconds
  void fetchAll();
  const timer = setInterval(() => void fetchAll(), 60_000);

  return () => {
    cancelled = true;
    clearInterval(timer);
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
