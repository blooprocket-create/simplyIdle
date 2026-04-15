import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';
import { SOCIAL_FEATURE_FLAGS } from '../socialFeatureFlags';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BlockRecord {
  targetUid: string;
  blockedAt: number;
}

export type ReportReason = 'harassment' | 'spam' | 'inappropriate_name' | 'cheating' | 'other';

export interface ReportSubmission {
  reporterUid: string;
  targetUid: string;
  reason: ReportReason;
  details: string;
  createdAt: number;
}

// ─── Block API ───────────────────────────────────────────────────────────────

export async function blockUser(uid: string, targetUid: string): Promise<void> {
  if (!SOCIAL_FEATURE_FLAGS.blockReport) throw new Error('Block/report is currently disabled.');
  const db = getFirebaseFirestore();
  if (!db || !uid || !targetUid || uid === targetUid) return;

  await setDoc(doc(db, 'blocks', uid, 'list', targetUid), {
    blockedAt: Date.now(),
  });
}

export async function unblockUser(uid: string, targetUid: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !uid || !targetUid) return;

  await deleteDoc(doc(db, 'blocks', uid, 'list', targetUid));
}

export async function fetchBlockList(uid: string): Promise<BlockRecord[]> {
  const db = getFirebaseFirestore();
  if (!db || !uid) return [];

  const snap = await getDocs(collection(db, 'blocks', uid, 'list'));
  return snap.docs.map(d => ({
    targetUid: d.id,
    blockedAt: typeof d.data().blockedAt === 'number' ? d.data().blockedAt : 0,
  }));
}

export function subscribeBlockList(uid: string, onBlocks: (blocks: BlockRecord[]) => void): () => void {
  const db = getFirebaseFirestore();
  if (!db || !uid) return () => {};

  return onSnapshot(collection(db, 'blocks', uid, 'list'), snap => {
    const blocks = snap.docs.map(d => ({
      targetUid: d.id,
      blockedAt: typeof d.data().blockedAt === 'number' ? d.data().blockedAt : 0,
    }));
    onBlocks(blocks);
  });
}

export async function isBlocked(uid: string, targetUid: string): Promise<boolean> {
  const db = getFirebaseFirestore();
  if (!db || !uid || !targetUid) return false;

  const snap = await getDoc(doc(db, 'blocks', uid, 'list', targetUid));
  return snap.exists();
}

// ─── Report API ──────────────────────────────────────────────────────────────

const VALID_REASONS = new Set<ReportReason>(['harassment', 'spam', 'inappropriate_name', 'cheating', 'other']);

export async function reportUser(
  reporterUid: string,
  targetUid: string,
  reason: ReportReason,
  details: string,
): Promise<void> {
  if (!SOCIAL_FEATURE_FLAGS.blockReport) throw new Error('Block/report is currently disabled.');
  const db = getFirebaseFirestore();
  if (!db || !reporterUid || !targetUid || reporterUid === targetUid) return;
  if (!VALID_REASONS.has(reason)) return;

  const sanitizedDetails = details.trim().slice(0, 500);

  const reportRef = doc(collection(db, 'reports'));
  await setDoc(reportRef, {
    reporterUid,
    targetUid,
    reason,
    details: sanitizedDetails,
    createdAt: Date.now(),
  } satisfies ReportSubmission);
}
