import { doc, getDoc, runTransaction, setDoc, deleteDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';
import { GIFT_AMOUNTS, GiftPreference } from '../gameConfig';

export interface FriendListEntry {
  uid: string;
  displayName: string;
  level: number;
  giftPreference: GiftPreference;
  addedAt: number;
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

function buildGiftAttachment(preference: GiftPreference, receiverLevel: number): MailAttachmentShape {
  if (preference === 'shards') {
    return { shards: GIFT_AMOUNTS.shards(receiverLevel), gold: 0, diamonds: 0, tears: 0, essence: 0 };
  }
  if (preference === 'essence') {
    return { shards: 0, gold: 0, diamonds: 0, tears: 0, essence: GIFT_AMOUNTS.essence(receiverLevel) };
  }
  return { shards: 0, gold: GIFT_AMOUNTS.gold(receiverLevel), diamonds: 0, tears: 0, essence: 0 };
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

  const profileSnap = await getDoc(doc(db, 'userProfiles', uid));
  const boardSnap = await getDoc(doc(db, 'leaderboard_global_v1', uid));

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

export async function sendGift(
  senderUid: string,
  senderName: string,
  friendUid: string,
  friendPreference: GiftPreference,
): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) return;

  const receiverLevel = await fetchRecipientLevel(friendUid);
  const attachment = buildGiftAttachment(friendPreference, receiverLevel);
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

export async function sendFriendRequest(fromUid: string, fromName: string, toUid: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !fromUid || !toUid || fromUid === toUid) return;
  const now = Date.now();

  await runTransaction(db, async tx => {
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

  await runTransaction(db, async tx => {
    tx.set(doc(db, 'friends', uid, 'list', fromUid), { uid: fromUid, addedAt: now }, { merge: true });
    tx.set(doc(db, 'friends', fromUid, 'list', uid), { uid, addedAt: now }, { merge: true });
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
