import { useEffect, useState } from 'react';
import { fetchCloudMail, subscribeToCloudMail } from '../services/cloudMail';
import { subscribePendingRequestCount } from '../services/friends';
import { writePresenceHeartbeat } from '../services/presence';
import { getFirebaseAuth } from '../services/firebase';

type MailboxEntry = {
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
};

interface UseSocialServicesParams {
  characterCreated: boolean;
  playerName: string | null;
  level: number;
  accountName: string;
  publicUsername: string;
  appendMailboxMessages: (entries: MailboxEntry[]) => void;
}

export function useSocialServices({
  characterCreated,
  playerName,
  level,
  accountName,
  publicUsername,
  appendMailboxMessages,
}: UseSocialServicesParams) {
  const [socialPendingCount, setSocialPendingCount] = useState(0);
  const [mailSyncError, setMailSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!characterCreated) return;
    const uid = getFirebaseAuth()?.currentUser?.uid;
    if (!uid) return;

    void fetchCloudMail(uid).then(mails => {
      const mapped = mails.map(mail => ({
        id: mail.id,
        subject: mail.subject,
        message: mail.message,
        from: mail.from,
        sentAt: mail.sentAt,
        attachments: mail.attachments,
      }));
      appendMailboxMessages(mapped);
      setMailSyncError(null);
    }).catch(() => {
      setMailSyncError('Mail sync failed. Your mailbox may be incomplete.');
    });

    return subscribeToCloudMail(uid, mails => {
      const mapped = mails.map(mail => ({
        id: mail.id,
        subject: mail.subject,
        message: mail.message,
        from: mail.from,
        sentAt: mail.sentAt,
        attachments: mail.attachments,
      }));
      appendMailboxMessages(mapped);
    });
  }, [appendMailboxMessages, characterCreated]);

  useEffect(() => {
    if (!characterCreated) return;
    const uid = getFirebaseAuth()?.currentUser?.uid;
    if (!uid) return;
    return subscribePendingRequestCount(uid, setSocialPendingCount);
  }, [characterCreated]);

  useEffect(() => {
    if (!characterCreated) return;
    const uid = getFirebaseAuth()?.currentUser?.uid;
    if (!uid) return;
    const display = (publicUsername || playerName || accountName).trim() || accountName;
    void writePresenceHeartbeat(uid, display, level).catch(() => {});
  }, [accountName, publicUsername, characterCreated, level, playerName]);

  return {
    socialPendingCount,
    setSocialPendingCount,
    mailSyncError,
  };
}
