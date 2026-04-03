import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
} from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';
import { getFirebaseAuth } from './firebase';

const CHAT_COLLECTION = 'globalChat';
const CHAT_MUTES_COLLECTION = 'chatMutes';
const CHAT_RATE_LIMIT_COLLECTION = 'chatRateLimit';
const CHAT_REACTIONS_COLLECTION = 'reactions';
const CHAT_SEND_COOLDOWN_MS = 3_000;
const ALLOWED_REACTIONS = new Set(['👍', '🔥', '💪', '🎉']);

export interface GlobalChatMessage {
  id: string;
  uid: string;
  displayName: string;
  level: number;
  vipLevel: number;
  guildTag: string;
  text: string;
  sentAt: number;
  reactions: Record<string, number>;
  myReaction: string | null;
}

export interface ChatMuteRecord {
  uid: string;
  mutedUntil: number;
  reason: string;
  mutedBy: string;
  updatedAt: number;
}

interface ChatReactionSummary {
  counts: Record<string, number>;
  mine: string | null;
}

async function fetchChatReactionSummary(messageId: string, viewerUid: string): Promise<ChatReactionSummary> {
  const db = getFirebaseFirestore();
  if (!db || !messageId) return { counts: {}, mine: null };

  const snap = await getDocs(collection(db, CHAT_COLLECTION, messageId, CHAT_REACTIONS_COLLECTION));
  const counts: Record<string, number> = {};
  let mine: string | null = null;

  snap.docs.forEach(reactionDoc => {
    const data = reactionDoc.data() as { emoji?: unknown };
    const emoji = typeof data.emoji === 'string' ? data.emoji : '';
    if (!emoji || !ALLOWED_REACTIONS.has(emoji)) return;
    counts[emoji] = (counts[emoji] ?? 0) + 1;
    if (reactionDoc.id === viewerUid) mine = emoji;
  });

  return { counts, mine };
}

async function resolveChatIdentity(uid: string): Promise<{ level: number; vipLevel: number; guildTag: string }> {
  const db = getFirebaseFirestore();
  if (!db || !uid) return { level: 1, vipLevel: 0, guildTag: '' };

  const [leaderboardSnap, membershipSnap] = await Promise.all([
    getDoc(doc(db, 'leaderboard_global_v1', uid)),
    getDoc(doc(db, 'userGuild', uid)),
  ]);

  const level = leaderboardSnap.exists() && typeof leaderboardSnap.data().level === 'number'
    ? Math.max(1, Math.floor(leaderboardSnap.data().level))
    : 1;
  const vipLevel = leaderboardSnap.exists() && typeof leaderboardSnap.data().vipLevel === 'number'
    ? Math.max(0, Math.floor(leaderboardSnap.data().vipLevel))
    : 0;

  let guildTag = '';
  if (membershipSnap.exists()) {
    const membershipData = membershipSnap.data() as { guildId?: unknown };
    const guildId = typeof membershipData.guildId === 'string' ? membershipData.guildId : '';
    if (guildId) {
      const guildSnap = await getDoc(doc(db, 'guilds', guildId));
      if (guildSnap.exists()) {
        const guildData = guildSnap.data() as { tag?: unknown };
        guildTag = typeof guildData.tag === 'string' ? guildData.tag.trim().slice(0, 5) : '';
      }
    }
  }

  return { level, vipLevel, guildTag };
}

async function resolveGuildTag(uid: string): Promise<string> {
  const db = getFirebaseFirestore();
  if (!db || !uid) return '';

  const membership = await getDoc(doc(db, 'userGuild', uid));
  if (!membership.exists()) return '';
  const membershipData = membership.data() as { guildId?: unknown };
  const guildId = typeof membershipData.guildId === 'string' ? membershipData.guildId : '';
  if (!guildId) return '';

  const guildSnap = await getDoc(doc(db, 'guilds', guildId));
  if (!guildSnap.exists()) return '';
  const guildData = guildSnap.data() as { tag?: unknown };
  return typeof guildData.tag === 'string' ? guildData.tag.trim().slice(0, 5) : '';
}

function normalizeMessageText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 500);
}

export async function isUserMuted(uid: string): Promise<ChatMuteRecord | null> {
  const db = getFirebaseFirestore();
  if (!db || !uid) return null;

  const snap = await getDoc(doc(db, CHAT_MUTES_COLLECTION, uid));
  if (!snap.exists()) return null;

  const data = snap.data() as Partial<ChatMuteRecord>;
  if (typeof data.mutedUntil !== 'number') return null;
  if (data.mutedUntil <= Date.now()) return null;

  return {
    uid,
    mutedUntil: data.mutedUntil,
    reason: typeof data.reason === 'string' ? data.reason : 'No reason provided.',
    mutedBy: typeof data.mutedBy === 'string' ? data.mutedBy : 'admin',
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
  };
}

export async function sendChatMessage(
  uid: string,
  displayName: string,
  level: number,
  text: string,
  vipLevel = 0,
): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !uid) return;

  const message = normalizeMessageText(text);
  if (!message) return;

  const mute = await isUserMuted(uid);
  if (mute) {
    throw new Error('You are muted.');
  }

  const guildTag = await resolveGuildTag(uid);

  const rateRef = doc(db, CHAT_RATE_LIMIT_COLLECTION, uid);

  await runTransaction(db, async tx => {
    const now = Date.now();
    const rateSnap = await tx.get(rateRef);
    const lastSentAt = rateSnap.exists() && typeof rateSnap.data().lastSentAt === 'number'
      ? rateSnap.data().lastSentAt
      : 0;

    if (now - lastSentAt < CHAT_SEND_COOLDOWN_MS) {
      throw new Error('Chat rate limit reached.');
    }

    const chatRef = doc(collection(db, CHAT_COLLECTION));
    tx.set(chatRef, {
      uid,
      displayName: displayName.trim().slice(0, 24) || 'Player',
      level: Math.max(1, Math.floor(level || 1)),
      vipLevel: Math.max(0, Math.floor(vipLevel || 0)),
      guildTag,
      text: message,
      sentAt: now,
    });
    tx.set(rateRef, { lastSentAt: now }, { merge: true });
  });
}

export function subscribeToChat(onMessages: (messages: GlobalChatMessage[]) => void): () => void {
  const db = getFirebaseFirestore();
  if (!db) return () => {};

  const q = query(collection(db, CHAT_COLLECTION), orderBy('sentAt', 'desc'), limit(50));
  return onSnapshot(q, snap => {
    const baseRows = snap.docs
      .map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          uid: typeof data.uid === 'string' ? data.uid : '',
          displayName: typeof data.displayName === 'string' ? data.displayName : 'Player',
          level: typeof data.level === 'number' ? data.level : 1,
          vipLevel: typeof data.vipLevel === 'number' ? Math.max(0, Math.floor(data.vipLevel)) : 0,
          guildTag: typeof data.guildTag === 'string' ? data.guildTag : '',
          text: typeof data.text === 'string' ? data.text : '',
          sentAt: typeof data.sentAt === 'number' ? data.sentAt : 0,
          reactions: {},
          myReaction: null,
        } satisfies GlobalChatMessage;
      })
      .filter(row => !!row.uid && !!row.text)
      .sort((a, b) => a.sentAt - b.sentAt);

    const uniqueUids = [...new Set(baseRows.map(r => r.uid))];
    void (async () => {
      const viewerUid = getFirebaseAuth()?.currentUser?.uid ?? '';
      const identityPairs = await Promise.all(uniqueUids.map(async uid => [uid, await resolveChatIdentity(uid)] as const));
      const identityByUid = new Map(identityPairs);
      const reactionPairs = await Promise.all(baseRows.map(async row => [row.id, await fetchChatReactionSummary(row.id, viewerUid)] as const));
      const reactionsByMessageId = new Map(reactionPairs);

      const rows = baseRows.map(row => {
        const identity = identityByUid.get(row.uid);
        const reaction = reactionsByMessageId.get(row.id);
        return {
          ...row,
          level: identity ? identity.level : row.level,
          vipLevel: identity ? identity.vipLevel : row.vipLevel,
          guildTag: identity ? identity.guildTag : row.guildTag,
          reactions: reaction ? reaction.counts : {},
          myReaction: reaction ? reaction.mine : null,
        };
      });

      onMessages(rows);
    })().catch(() => {
      onMessages(baseRows);
    });
  });
}

export async function toggleChatReaction(uid: string, messageId: string, emoji: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !uid || !messageId) return;
  if (!ALLOWED_REACTIONS.has(emoji)) return;

  const reactionRef = doc(db, CHAT_COLLECTION, messageId, CHAT_REACTIONS_COLLECTION, uid);
  await runTransaction(db, async tx => {
    const current = await tx.get(reactionRef);
    if (!current.exists()) {
      tx.set(reactionRef, {
        uid,
        emoji,
        updatedAt: Date.now(),
      });
      return;
    }

    const currentData = current.data() as { emoji?: unknown };
    const currentEmoji = typeof currentData.emoji === 'string' ? currentData.emoji : '';
    if (currentEmoji === emoji) {
      tx.delete(reactionRef);
      return;
    }

    tx.set(reactionRef, {
      uid,
      emoji,
      updatedAt: Date.now(),
    }, { merge: true });
  });
}

export async function muteUser(targetUid: string, mutedByUid: string, durationMs: number, reason: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !targetUid) return;

  const now = Date.now();
  const mutedUntil = durationMs <= 0 ? now + 10 * 365 * 24 * 60 * 60 * 1000 : now + durationMs;

  await setDoc(doc(db, CHAT_MUTES_COLLECTION, targetUid), {
    uid: targetUid,
    mutedBy: mutedByUid,
    reason: reason.trim().slice(0, 180) || 'Muted by admin',
    mutedUntil,
    updatedAt: now,
  }, { merge: true });
}

export async function unmuteUser(targetUid: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !targetUid) return;
  await deleteDoc(doc(db, CHAT_MUTES_COLLECTION, targetUid));
}
