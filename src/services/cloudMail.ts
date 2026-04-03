import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';

export interface CloudMailMessage {
  id: string;
  subject: string;
  message: string;
  from: string;
  sentAt: number;
  attachments: {
    shards: number;
    gold: number;
    diamonds: number;
    tears: number;
    essence: number;
  };
}

function toCloudMail(id: string, data: Record<string, unknown>): CloudMailMessage {
  const attachmentsRaw = (data.attachments ?? {}) as Record<string, unknown>;
  return {
    id,
    subject: typeof data.subject === 'string' ? data.subject : 'Gift Delivery',
    message: typeof data.message === 'string' ? data.message : '',
    from: typeof data.from === 'string' ? data.from : 'System',
    sentAt: typeof data.sentAt === 'number' ? data.sentAt : Date.now(),
    attachments: {
      shards: typeof attachmentsRaw.shards === 'number' ? attachmentsRaw.shards : 0,
      gold: typeof attachmentsRaw.gold === 'number' ? attachmentsRaw.gold : 0,
      diamonds: typeof attachmentsRaw.diamonds === 'number' ? attachmentsRaw.diamonds : 0,
      tears: typeof attachmentsRaw.tears === 'number' ? attachmentsRaw.tears : 0,
      essence: typeof attachmentsRaw.essence === 'number' ? attachmentsRaw.essence : 0,
    },
  };
}

export async function claimCloudMail(uid: string, messageId: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) return;
  await deleteDoc(doc(db, 'playerMail', uid, 'messages', messageId));
}

export function subscribeToCloudMail(
  uid: string,
  onMessages: (messages: CloudMailMessage[]) => void,
): () => void {
  const db = getFirebaseFirestore();
  if (!db || !uid) return () => {};

  const q = query(
    collection(db, 'playerMail', uid, 'messages'),
    orderBy('sentAt', 'desc'),
  );

  return onSnapshot(q, snap => {
    const messages = snap.docs.map(docSnap => toCloudMail(docSnap.id, docSnap.data() as Record<string, unknown>));
    onMessages(messages);
  });
}
