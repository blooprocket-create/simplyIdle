import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';
import { normalizePublicUsername } from './publicProfile';
import { SOCIAL_FEATURE_FLAGS } from '../socialFeatureFlags';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlayerSearchResult {
  uid: string;
  publicUsername: string;
  level: number;
  vipLevel: number;
  guildName: string | null;
  guildTag: string | null;
}

// ─── Search API ──────────────────────────────────────────────────────────────

/**
 * Search players by username prefix.
 * Uses the `publicUsernames` collection for prefix matching,
 * then enriches with leaderboard data.
 *
 * Returns up to `maxResults` matches (default 15).
 */
export async function searchPlayers(queryText: string, maxResults = 15): Promise<PlayerSearchResult[]> {
  if (!SOCIAL_FEATURE_FLAGS.playerSearch) throw new Error('Player search is currently disabled.');
  const db = getFirebaseFirestore();
  if (!db) return [];

  const normalized = normalizePublicUsername(queryText);
  if (!normalized || normalized.length < 2) return [];

  // Firestore prefix range query: [normalized, normalized + \uf8ff]
  const endPrefix = normalized + '\uf8ff';

  // Search both publicUsernames AND leaderboard by accountName prefix
  const [pubSnap, boardSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'publicUsernames'),
        where('__name__', '>=', normalized),
        where('__name__', '<=', endPrefix),
        orderBy('__name__'),
        limit(maxResults),
      ),
    ),
    getDocs(
      query(
        collection(db, 'leaderboard_global_v1'),
        where('accountName', '>=', normalized),
        where('accountName', '<=', endPrefix),
        orderBy('accountName'),
        limit(maxResults),
      ),
    ),
  ]);

  const seen = new Set<string>();
  const results: PlayerSearchResult[] = [];

  // Add results from publicUsernames
  for (const docSnap of pubSnap.docs) {
    const data = docSnap.data();
    const uid = typeof data.uid === 'string' ? data.uid : '';
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    results.push({
      uid,
      publicUsername: docSnap.id,
      level: 0,
      vipLevel: 0,
      guildName: null,
      guildTag: null,
    });
  }

  // Add results from leaderboard (fallback for players without a public username)
  for (const docSnap of boardSnap.docs) {
    const uid = docSnap.id;
    if (seen.has(uid)) continue;
    seen.add(uid);
    const data = docSnap.data();
    results.push({
      uid,
      publicUsername:
        typeof data.publicUsername === 'string'
          ? data.publicUsername
          : typeof data.accountName === 'string'
            ? data.accountName
            : uid,
      level: typeof data.level === 'number' ? Math.max(1, Math.floor(data.level)) : 0,
      vipLevel: typeof data.vipLevel === 'number' ? Math.max(0, Math.floor(data.vipLevel)) : 0,
      guildName: null,
      guildTag: null,
    });
  }

  if (results.length === 0) return [];

  // Enrich with leaderboard + guild data (best-effort, won't block results)
  try {
    const enrichPromises = results.map(async player => {
      try {
        const [boardDoc, guildDoc] = await Promise.all([
          getDoc(doc(db, 'leaderboard_global_v1', player.uid)),
          getDoc(doc(db, 'userGuild', player.uid)),
        ]);

        if (boardDoc.exists()) {
          const boardData = boardDoc.data();
          player.level = typeof boardData.level === 'number' ? Math.max(1, Math.floor(boardData.level)) : 0;
          player.vipLevel = typeof boardData.vipLevel === 'number' ? Math.max(0, Math.floor(boardData.vipLevel)) : 0;
        }

        if (guildDoc.exists()) {
          const guildData = guildDoc.data();
          const guildId = typeof guildData.guildId === 'string' ? guildData.guildId : '';
          if (guildId) {
            const guildSnap = await getDoc(doc(db, 'guilds', guildId));
            if (guildSnap.exists()) {
              const guild = guildSnap.data();
              player.guildName = typeof guild.name === 'string' ? guild.name : null;
              player.guildTag = typeof guild.tag === 'string' ? guild.tag : null;
            }
          }
        }
      } catch {
        // Partial enrichment failure is acceptable — show result with what we have.
      }
    });
    await Promise.all(enrichPromises);
  } catch {
    // Non-blocking enrichment.
  }

  return results.slice(0, maxResults);
}
