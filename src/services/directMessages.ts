import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  getDoc,
  updateDoc,
  increment,
} from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';
import { SOCIAL_FEATURE_FLAGS } from '../socialFeatureFlags';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DirectMessage {
  id: string;
  senderUid: string;
  text: string;
  sentAt: number;
}

export interface DMThread {
  partnerUid: string;
  partnerName: string;
  lastMessageText: string;
  lastMessageAt: number;
  unreadCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Deterministic conversation ID from two UIDs (sorted pair). */
export function buildConversationId(uid1: string, uid2: string): string {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

// ─── Send DM ─────────────────────────────────────────────────────────────────

export async function sendDirectMessage(
  fromUid: string,
  toUid: string,
  fromName: string,
  toName: string,
  text: string,
): Promise<void> {
  if (!SOCIAL_FEATURE_FLAGS.directMessages) throw new Error('Direct messages are currently disabled.');
  const db = getFirebaseFirestore();
  if (!db || !fromUid || !toUid || fromUid === toUid) return;

  const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!cleaned) return;

  // Validate recipient exists and sender hasn't blocked them
  // Note: we can only read our OWN block list (rules enforce uid == auth.uid).
  // Recipient-side block enforcement must happen via Cloud Function or rules.
  const [recipientSnap, senderBlockSnap] = await Promise.all([
    getDoc(doc(db, 'leaderboard_global_v1', toUid)),
    getDoc(doc(db, 'blocks', fromUid, 'list', toUid)),
  ]);
  if (!recipientSnap.exists()) throw new Error('Recipient not found.');
  if (senderBlockSnap.exists()) throw new Error('You have blocked this player.');

  const conversationId = buildConversationId(fromUid, toUid);
  const now = Date.now();

  // Write message
  const msgRef = doc(collection(db, 'directMessages', conversationId, 'messages'));
  await setDoc(msgRef, {
    senderUid: fromUid,
    text: cleaned,
    sentAt: now,
  });

  // Update thread index for sender (unreadCount stays 0)
  await setDoc(
    doc(db, 'dmThreads', fromUid, 'conversations', toUid),
    {
      partnerUid: toUid,
      partnerName: toName.trim().slice(0, 24),
      lastMessageText: cleaned.slice(0, 80),
      lastMessageAt: now,
      unreadCount: 0,
    },
    { merge: true },
  );

  // Update thread index for receiver (+1 unread, atomic increment)
  const receiverThreadRef = doc(db, 'dmThreads', toUid, 'conversations', fromUid);
  await setDoc(
    receiverThreadRef,
    {
      partnerUid: fromUid,
      partnerName: fromName.trim().slice(0, 24),
      lastMessageText: cleaned.slice(0, 80),
      lastMessageAt: now,
      unreadCount: increment(1),
    },
    { merge: true },
  );
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export function subscribeToConversation(
  uid: string,
  partnerUid: string,
  onMessages: (messages: DirectMessage[]) => void,
): () => void {
  const db = getFirebaseFirestore();
  if (!db || !uid || !partnerUid) return () => {};

  const conversationId = buildConversationId(uid, partnerUid);
  const q = query(collection(db, 'directMessages', conversationId, 'messages'), orderBy('sentAt', 'desc'), limit(100));

  return onSnapshot(
    q,
    snap => {
      const msgs: DirectMessage[] = snap.docs
        .map(d => {
          const data = d.data();
          return {
            id: d.id,
            senderUid: typeof data.senderUid === 'string' ? data.senderUid : '',
            text: typeof data.text === 'string' ? data.text : '',
            sentAt: typeof data.sentAt === 'number' ? data.sentAt : 0,
          };
        })
        .filter(m => m.senderUid && m.text)
        .sort((a, b) => a.sentAt - b.sentAt);
      onMessages(msgs);
    },
    () => {
      onMessages([]);
    },
  );
}

export async function fetchConversations(uid: string): Promise<DMThread[]> {
  const db = getFirebaseFirestore();
  if (!db || !uid) return [];

  const snap = await getDocs(
    query(collection(db, 'dmThreads', uid, 'conversations'), orderBy('lastMessageAt', 'desc'), limit(50)),
  );

  return snap.docs.map(d => {
    const data = d.data();
    return {
      partnerUid: d.id,
      partnerName: typeof data.partnerName === 'string' && data.partnerName ? data.partnerName : 'Player',
      lastMessageText: typeof data.lastMessageText === 'string' ? data.lastMessageText : '',
      lastMessageAt: typeof data.lastMessageAt === 'number' ? data.lastMessageAt : 0,
      unreadCount: typeof data.unreadCount === 'number' ? Math.max(0, data.unreadCount) : 0,
    };
  });
}

export async function markConversationRead(uid: string, partnerUid: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !uid || !partnerUid) return;

  const threadRef = doc(db, 'dmThreads', uid, 'conversations', partnerUid);
  try {
    await updateDoc(threadRef, { unreadCount: 0 });
  } catch {
    // Thread may not exist yet (first conversation) — safe to ignore.
  }
}
