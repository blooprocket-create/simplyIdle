import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
} from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';

const CHAT_COLLECTION = 'globalChat';
const CHAT_MUTES_COLLECTION = 'chatMutes';
const CHAT_RATE_LIMIT_COLLECTION = 'chatRateLimit';
const CHAT_SEND_COOLDOWN_MS = 3_000;

export interface GlobalChatMessage {
  id: string;
  uid: string;
  displayName: string;
  level: number;
  vipLevel: number;
  guildTag: string;
  text: string;
  sentAt: number;
}

export interface ChatMuteRecord {
  uid: string;
  mutedUntil: number;
  reason: string;
  mutedBy: string;
  updatedAt: number;
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
    const rows = snap.docs
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
        } satisfies GlobalChatMessage;
      })
      .filter(row => !!row.uid && !!row.text)
      .sort((a, b) => a.sentAt - b.sentAt);

    onMessages(rows);
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
