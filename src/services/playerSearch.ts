import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
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

  const snap = await getDocs(
    query(
      collection(db, 'publicUsernames'),
      where('__name__', '>=', normalized),
      where('__name__', '<=', endPrefix),
      orderBy('__name__'),
      limit(maxResults),
    ),
  );

  if (snap.empty) return [];

  const results: PlayerSearchResult[] = [];
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const uid = typeof data.uid === 'string' ? data.uid : '';
    if (!uid) continue;

    results.push({
      uid,
      publicUsername: docSnap.id,
      level: 0, // enriched below
      vipLevel: 0, // enriched below
      guildName: null, // enriched below
      guildTag: null, // enriched below
    });
  }

  // Enrich with leaderboard + guild data (best-effort, won't block results)
  try {
    const enrichPromises = results.map(async player => {
      try {
        const [boardSnap, guildSnap] = await Promise.all([
          getDocs(query(collection(db, 'leaderboard_global_v1'), where('__name__', '==', player.uid), limit(1))),
          getDocs(query(collection(db, 'userGuild'), where('__name__', '==', player.uid), limit(1))),
        ]);

        if (!boardSnap.empty) {
          const boardData = boardSnap.docs[0].data();
          player.level = typeof boardData.level === 'number' ? Math.max(1, Math.floor(boardData.level)) : 0;
          player.vipLevel = typeof boardData.vipLevel === 'number' ? Math.max(0, Math.floor(boardData.vipLevel)) : 0;
        }

        if (!guildSnap.empty) {
          const guildData = guildSnap.docs[0].data();
          const guildId = typeof guildData.guildId === 'string' ? guildData.guildId : '';
          if (guildId) {
            const guildDocSnap = await getDocs(
              query(collection(db, 'guilds'), where('__name__', '==', guildId), limit(1)),
            );
            if (!guildDocSnap.empty) {
              const guild = guildDocSnap.docs[0].data();
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

  return results;
}
