import { collection, doc, getDoc, getDocs, onSnapshot, runTransaction, setDoc, deleteDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';
import { GIFT_AMOUNTS, GiftPreference } from '../gameConfig';
import { normalizePublicUsername } from './publicProfile';

export interface FriendListEntry {
  uid: string;
  displayName: string;
  level: number;
  giftPreference: GiftPreference;
  addedAt: number;
}

export interface PendingFriendRequest {
  fromUid: string;
  fromName: string;
  createdAt: number;
}

export interface GiftCooldownEntry {
  friendUid: string;
  lastGiftSentAt: number;
}

export type FriendRelationshipStatus = 'self' | 'friends' | 'outgoing' | 'incoming' | 'none';

export interface FriendsRealtimeSnapshot {
  friends: FriendListEntry[];
  pendingRequests: PendingFriendRequest[];
  giftCooldowns: Record<string, number>;
  profile: { displayName: string; giftPreference: GiftPreference } | null;
}

interface MailAttachmentShape {
  shards: number;
  gold: number;
  diamonds: number;
  tears: number;
  essence: number;
}

function normalizePreference(value: unknown): GiftPreference {
  if (value === 'shards' || value === 'essence') return value;
  return 'gold';
}

async function fetchRecipientLevel(uid: string): Promise<number> {
  const db = getFirebaseFirestore();
  if (!db) return 1;
  const snap = await getDoc(doc(db, 'leaderboard_global_v1', uid));
  if (!snap.exists()) return 1;
  const data = snap.data();
  const level = typeof data.level === 'number' ? data.level : 1;
  return Math.max(1, Math.floor(level));
}

async function fetchRecipientPeakProgress(uid: string): Promise<number> {
  const db = getFirebaseFirestore();
  if (!db) return 1;
  const snap = await getDoc(doc(db, 'leaderboard_global_v1', uid));
  if (!snap.exists()) return 1;
  const data = snap.data();
  const highestWaveReached = typeof data.highestWaveReached === 'number' ? data.highestWaveReached : 1;
  return Math.max(1, Math.floor(highestWaveReached));
}

function progressToGiftScale(peakProgress: number): number {
  const safeProgress = Math.max(1, Math.floor(peakProgress));
  return Math.max(1, Math.floor(safeProgress / 10));
}

async function fetchPublicNameAndPreference(uid: string): Promise<{ displayName: string; giftPreference: GiftPreference }> {
  const db = getFirebaseFirestore();
  if (!db) return { displayName: 'Player', giftPreference: 'gold' };

  const [profileSnap, boardSnap] = await Promise.all([
    getDoc(doc(db, 'userProfiles', uid)),
    getDoc(doc(db, 'leaderboard_global_v1', uid)),
  ]);

  const profile = profileSnap.exists() ? profileSnap.data() : {};
  const board = boardSnap.exists() ? boardSnap.data() : {};

  const displayName = typeof profile.publicUsername === 'string'
    ? profile.publicUsername
    : typeof board.publicUsername === 'string'
      ? board.publicUsername
      : 'Player';

  return {
    displayName,
    giftPreference: normalizePreference(profile.giftPreference),
  };
}

function buildGiftAttachment(preference: GiftPreference, receiverPeakProgress: number): MailAttachmentShape {
  const giftScale = progressToGiftScale(receiverPeakProgress);
  if (preference === 'shards') {
    return { shards: GIFT_AMOUNTS.shards(giftScale), gold: 0, diamonds: 0, tears: 0, essence: 0 };
  }
  if (preference === 'essence') {
    return { shards: 0, gold: 0, diamonds: 0, tears: 0, essence: GIFT_AMOUNTS.essence(giftScale) };
  }
  return { shards: 0, gold: GIFT_AMOUNTS.gold(giftScale), diamonds: 0, tears: 0, essence: 0 };
}

export async function setGiftPreference(uid: string, preference: GiftPreference): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !uid) return;
  await setDoc(doc(db, 'userProfiles', uid), {
    giftPreference: preference,
    updatedAt: Date.now(),
  }, { merge: true });
}

export async function fetchFriendProfile(uid: string): Promise<{ displayName: string; giftPreference: GiftPreference } | null> {
  const db = getFirebaseFirestore();
  if (!db || !uid) return null;
  return fetchPublicNameAndPreference(uid);
}

export async function fetchFriends(uid: string): Promise<FriendListEntry[]> {
  const db = getFirebaseFirestore();
  if (!db || !uid) return [];

  const snap = await getDocs(collection(db, 'friends', uid, 'list'));
  const rows = await Promise.all(snap.docs.map(async docSnap => {
    const friendUid = docSnap.id;
    const core = docSnap.data() as { addedAt?: unknown; level?: unknown; giftPreference?: unknown; displayName?: unknown };
    const level = await fetchRecipientLevel(friendUid);
    const profile = await fetchPublicNameAndPreference(friendUid);
    return {
      uid: friendUid,
      displayName: typeof core.displayName === 'string' ? core.displayName : profile.displayName,
      level,
      giftPreference: normalizePreference(core.giftPreference ?? profile.giftPreference),
      addedAt: typeof core.addedAt === 'number' ? core.addedAt : Date.now(),
    } satisfies FriendListEntry;
  }));

  return rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function fetchPendingRequests(uid: string): Promise<PendingFriendRequest[]> {
  const db = getFirebaseFirestore();
  if (!db || !uid) return [];

  const snap = await getDocs(collection(db, 'friends', uid, 'requests'));
  return snap.docs.map(docSnap => {
    const data = docSnap.data() as { fromUid?: unknown; fromName?: unknown; createdAt?: unknown };
    return {
      fromUid: typeof data.fromUid === 'string' ? data.fromUid : docSnap.id,
      fromName: typeof data.fromName === 'string' ? data.fromName : 'Player',
      createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
    } satisfies PendingFriendRequest;
  }).sort((a, b) => b.createdAt - a.createdAt);
}

export async function fetchGiftCooldowns(uid: string): Promise<Record<string, number>> {
  const db = getFirebaseFirestore();
  if (!db || !uid) return {};

  const snap = await getDocs(collection(db, 'friends', uid, 'giftCooldowns'));
  const result: Record<string, number> = {};
  snap.docs.forEach(docSnap => {
    const data = docSnap.data() as { friendUid?: unknown; lastGiftSentAt?: unknown };
    const friendUid = typeof data.friendUid === 'string' ? data.friendUid : '';
    if (!friendUid) return;
    result[friendUid] = typeof data.lastGiftSentAt === 'number' ? data.lastGiftSentAt : 0;
  });
  return result;
}

export async function fetchFriendRelationshipStatus(uid: string, targetUid: string): Promise<FriendRelationshipStatus> {
  const db = getFirebaseFirestore();
  if (!db || !uid || !targetUid) return 'none';
  if (uid === targetUid) return 'self';

  const [friendSnap, outgoingSnap, incomingSnap] = await Promise.all([
    getDoc(doc(db, 'friends', uid, 'list', targetUid)),
    getDoc(doc(db, 'friends', uid, 'outgoing', targetUid)),
    getDoc(doc(db, 'friends', uid, 'requests', targetUid)),
  ]);

  if (friendSnap.exists()) return 'friends';
  if (outgoingSnap.exists()) return 'outgoing';
  if (incomingSnap.exists()) return 'incoming';
  return 'none';
}

export function subscribePendingRequestCount(uid: string, onCount: (count: number) => void): () => void {
  const db = getFirebaseFirestore();
  if (!db || !uid) return () => {};
  return onSnapshot(collection(db, 'friends', uid, 'requests'), snap => {
    onCount(snap.size);
  });
}

export function subscribeFriendsRealtime(
  uid: string,
  onSnapshotData: (snapshot: FriendsRealtimeSnapshot) => void,
  onError?: (error: Error) => void,
): () => void {
  const db = getFirebaseFirestore();
  if (!db || !uid) return () => {};

  let active = true;
  let inflight = false;

  const publishSnapshot = async () => {
    if (!active || inflight) return;
    inflight = true;
    try {
      const [friends, pendingRequests, giftCooldowns, profile] = await Promise.all([
        fetchFriends(uid),
        fetchPendingRequests(uid),
        fetchGiftCooldowns(uid),
        fetchFriendProfile(uid),
      ]);
      if (!active) return;
      onSnapshotData({
        friends,
        pendingRequests,
        giftCooldowns,
        profile,
      });
    } catch (err) {
      if (!active) return;
      if (onError && err instanceof Error) {
        onError(err);
      } else if (onError) {
        onError(new Error('Friends realtime sync failed.'));
      }
    } finally {
      inflight = false;
    }
  };

  const unsubscribers = [
    onSnapshot(collection(db, 'friends', uid, 'list'), () => {
      void publishSnapshot();
    }),
    onSnapshot(collection(db, 'friends', uid, 'requests'), () => {
      void publishSnapshot();
    }),
    onSnapshot(collection(db, 'friends', uid, 'giftCooldowns'), () => {
      void publishSnapshot();
    }),
  ];

  void publishSnapshot();

  return () => {
    active = false;
    unsubscribers.forEach(unsub => unsub());
  };
}

export async function sendGift(
  senderUid: string,
  senderName: string,
  friendUid: string,
  friendPreference: GiftPreference,
): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) return;

  const receiverPeakProgress = await fetchRecipientPeakProgress(friendUid);
  const attachment = buildGiftAttachment(friendPreference, receiverPeakProgress);
  const now = Date.now();
  const cooldownId = `${senderUid}_${friendUid}`;
  const cooldownRef = doc(db, 'friends', senderUid, 'giftCooldowns', cooldownId);
  const mailRef = doc(db, 'playerMail', friendUid, 'messages', `gift_${senderUid}_${now}`);

  await runTransaction(db, async tx => {
    const cooldownSnap = await tx.get(cooldownRef);
    const lastGiftSentAt = cooldownSnap.exists() && typeof cooldownSnap.data().lastGiftSentAt === 'number'
      ? cooldownSnap.data().lastGiftSentAt
      : 0;

    const prevDate = new Date(lastGiftSentAt).toISOString().slice(0, 10);
    const nowDate = new Date(now).toISOString().slice(0, 10);
    if (lastGiftSentAt > 0 && prevDate === nowDate) {
      throw new Error('Gift already sent today.');
    }

    tx.set(mailRef, {
      id: mailRef.id,
      subject: 'Daily Gift Delivery',
      message: `A friend sent you a daily ${friendPreference} gift.`,
      from: senderName.slice(0, 24) || 'Friend',
      sentAt: now,
      attachments: attachment,
      kind: 'friend_gift',
      senderUid,
    });

    tx.set(cooldownRef, {
      senderUid,
      friendUid,
      lastGiftSentAt: now,
      updatedAt: now,
    }, { merge: true });
  });
}

export async function sendFriendRequest(fromUid: string, fromName: string, toUsername: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !fromUid || !toUsername) return;
  const now = Date.now();

  const normalized = normalizePublicUsername(toUsername);
  const usernameSnap = await getDoc(doc(db, 'publicUsernames', normalized));
  if (!usernameSnap.exists()) {
    throw new Error('Player not found.');
  }

  const toUid = usernameSnap.data().uid as string;
  if (!toUid || toUid === fromUid) {
    throw new Error('Invalid friend target.');
  }

  await runTransaction(db, async tx => {
    const existingFriendSnap = await tx.get(doc(db, 'friends', fromUid, 'list', toUid));
    if (existingFriendSnap.exists()) {
      throw new Error('You are already friends.');
    }

    tx.set(doc(db, 'friends', toUid, 'requests', fromUid), {
      fromUid,
      fromName: fromName.slice(0, 24) || 'Player',
      createdAt: now,
    });

    tx.set(doc(db, 'friends', fromUid, 'outgoing', toUid), {
      toUid,
      createdAt: now,
    });
  });
}

export async function acceptFriendRequest(uid: string, fromUid: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !uid || !fromUid) return;
  const now = Date.now();

  const [selfMeta, fromMeta] = await Promise.all([
    fetchPublicNameAndPreference(uid),
    fetchPublicNameAndPreference(fromUid),
  ]);

  await runTransaction(db, async tx => {
    tx.set(doc(db, 'friends', uid, 'list', fromUid), {
      uid: fromUid,
      displayName: fromMeta.displayName,
      giftPreference: fromMeta.giftPreference,
      addedAt: now,
    }, { merge: true });
    tx.set(doc(db, 'friends', fromUid, 'list', uid), {
      uid,
      displayName: selfMeta.displayName,
      giftPreference: selfMeta.giftPreference,
      addedAt: now,
    }, { merge: true });
    tx.delete(doc(db, 'friends', uid, 'requests', fromUid));
    tx.delete(doc(db, 'friends', fromUid, 'outgoing', uid));
  });
}

export async function declineFriendRequest(uid: string, fromUid: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !uid || !fromUid) return;
  await deleteDoc(doc(db, 'friends', uid, 'requests', fromUid));
  await deleteDoc(doc(db, 'friends', fromUid, 'outgoing', uid));
}

export async function removeFriend(uid: string, friendUid: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !uid || !friendUid) return;
  await deleteDoc(doc(db, 'friends', uid, 'list', friendUid));
  await deleteDoc(doc(db, 'friends', friendUid, 'list', uid));
}
