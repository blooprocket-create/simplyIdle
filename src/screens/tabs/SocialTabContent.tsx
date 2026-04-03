import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { THEME, RADIUS } from '../../theme';
import {
  GlobalChatMessage,
  isUserMuted,
  muteUser,
  sendChatMessage,
  subscribeToChat,
} from '../../services/chat';
import { fetchOnlineCount } from '../../services/presence';
import { getFirebaseAuth } from '../../services/firebase';

export interface SocialTabContentProps {
  tab: string;
  accountName: string;
  publicUsername: string;
  level: number;
  isAdmin: boolean;
}

type SocialSubTab = 'chat' | 'friends';

function formatTime(ts: number): string {
  const date = new Date(ts);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

export function SocialTabContent({ tab, accountName, publicUsername, level, isAdmin }: SocialTabContentProps) {
  const [subTab, setSubTab] = useState<SocialSubTab>('chat');
  const [onlineCount, setOnlineCount] = useState(0);
  const [messages, setMessages] = useState<GlobalChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutedUntil, setMutedUntil] = useState<number | null>(null);
  const [lastSendAt, setLastSendAt] = useState(0);

  const me = useMemo(() => {
    const authUid = getFirebaseAuth()?.currentUser?.uid ?? '';
    return {
      uid: authUid,
      name: (publicUsername || accountName).trim() || 'Player',
      level: Math.max(1, Math.floor(level || 1)),
    };
  }, [accountName, publicUsername, level]);

  useEffect(() => {
    if (tab !== 'social') return;

    const stopChat = subscribeToChat(setMessages);
    const refreshOnline = () => {
      void fetchOnlineCount().then(setOnlineCount).catch(() => {});
    };
    const refreshMute = () => {
      if (!me.uid) return;
      void isUserMuted(me.uid)
        .then(mute => setMutedUntil(mute?.mutedUntil ?? null))
        .catch(() => setMutedUntil(null));
    };

    refreshOnline();
    refreshMute();
    const onlineTimer = setInterval(refreshOnline, 30_000);
    const muteTimer = setInterval(refreshMute, 20_000);

    return () => {
      stopChat();
      clearInterval(onlineTimer);
      clearInterval(muteTimer);
    };
  }, [tab, me.uid]);

  if (tab !== 'social') return null;

  const send = async () => {
    if (!me.uid || sending) return;
    const now = Date.now();
    if (now - lastSendAt < 3_000) {
      setError('Slow down: chat has a 3-second cooldown.');
      return;
    }
    if (mutedUntil && mutedUntil > now) {
      setError('You are muted right now.');
      return;
    }

    setError(null);
    setSending(true);
    try {
      await sendChatMessage(me.uid, me.name, me.level, draft);
      setDraft('');
      setLastSendAt(now);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send message.';
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  const muteForOneHour = async (targetUid: string) => {
    if (!isAdmin || !me.uid || !targetUid || targetUid === me.uid) return;
    try {
      await muteUser(targetUid, me.uid, 60 * 60 * 1000, 'Muted by admin');
    } catch {
      setError('Failed to mute user.');
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.subTabRow}>
        <Pressable style={[styles.subTabBtn, subTab === 'chat' && styles.subTabBtnActive]} onPress={() => setSubTab('chat')}>
          <Text style={[styles.subTabText, subTab === 'chat' && styles.subTabTextActive]}>Chat</Text>
        </Pressable>
        <Pressable style={[styles.subTabBtn, subTab === 'friends' && styles.subTabBtnActive]} onPress={() => setSubTab('friends')}>
          <Text style={[styles.subTabText, subTab === 'friends' && styles.subTabTextActive]}>Friends</Text>
        </Pressable>
      </View>

      {subTab === 'chat' && (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Global Chat</Text>
            <Text style={styles.metaText}>Online now: {onlineCount}</Text>
            {mutedUntil && mutedUntil > Date.now() && (
              <Text style={styles.mutedText}>You are muted until {new Date(mutedUntil).toLocaleString()}.</Text>
            )}
          </View>

          <View style={[styles.card, styles.chatListCard]}>
            <FlatList
              data={messages}
              keyExtractor={item => item.id}
              renderItem={({ item }) => {
                const mine = item.uid === me.uid;
                return (
                  <View style={[styles.chatRow, mine && styles.chatRowMine]}>
                    <View style={styles.chatHeaderRow}>
                      <Text style={styles.chatName}>{item.displayName} Lv.{item.level}</Text>
                      <Text style={styles.chatTime}>{formatTime(item.sentAt)}</Text>
                    </View>
                    <Text style={styles.chatText}>{item.text}</Text>
                    {isAdmin && !mine && (
                      <Pressable style={styles.muteBtn} onPress={() => muteForOneHour(item.uid)}>
                        <Text style={styles.muteBtnText}>Mute 1h</Text>
                      </Pressable>
                    )}
                  </View>
                );
              }}
            />
          </View>

          <View style={styles.card}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Say something..."
              placeholderTextColor={THEME.text.tertiary}
              style={styles.input}
              maxLength={500}
              editable={!sending && !(mutedUntil && mutedUntil > Date.now())}
            />
            <Pressable
              style={[styles.sendBtn, (sending || !draft.trim()) && styles.sendBtnDisabled]}
              onPress={send}
              disabled={sending || !draft.trim()}
            >
              <Text style={styles.sendBtnText}>{sending ? 'Sending...' : 'Send'}</Text>
            </Pressable>
            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </View>
        </>
      )}

      {subTab === 'friends' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Friends & Gifts</Text>
          <Text style={styles.metaText}>Foundation services are now wired. UI actions for requests and gifting are next.</Text>
          <Text style={styles.metaText}>Gift scaling now uses receiver level: Gold x1000, Shards x10, Essence x5.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
  },
  subTabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  subTabBtn: {
    flex: 1,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: THEME.bg.tertiary,
  },
  subTabBtnActive: {
    borderColor: THEME.status.info,
    backgroundColor: '#132235',
  },
  subTabText: {
    color: THEME.text.secondary,
    fontWeight: '700',
  },
  subTabTextActive: {
    color: THEME.text.primary,
  },
  card: {
    backgroundColor: THEME.bg.tertiary,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    borderRadius: RADIUS.md,
    padding: 12,
    gap: 8,
  },
  chatListCard: {
    minHeight: 260,
    maxHeight: 340,
  },
  cardTitle: {
    color: THEME.text.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  metaText: {
    color: THEME.text.tertiary,
    fontSize: 12,
  },
  mutedText: {
    color: '#F9D66D',
    fontSize: 12,
    fontWeight: '700',
  },
  chatRow: {
    borderWidth: 1,
    borderColor: THEME.surface.border,
    borderRadius: RADIUS.sm,
    padding: 8,
    marginBottom: 8,
    backgroundColor: '#111626',
  },
  chatRowMine: {
    borderColor: THEME.status.info,
    backgroundColor: '#18253A',
  },
  chatHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  chatName: {
    color: THEME.text.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  chatTime: {
    color: THEME.text.tertiary,
    fontSize: 11,
  },
  chatText: {
    color: THEME.text.primary,
    fontSize: 13,
  },
  muteBtn: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#FF7788',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  muteBtnText: {
    color: '#FF96A3',
    fontWeight: '700',
    fontSize: 11,
  },
  input: {
    borderWidth: 1,
    borderColor: THEME.surface.border,
    borderRadius: RADIUS.sm,
    backgroundColor: '#0E1422',
    color: THEME.text.primary,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sendBtn: {
    alignSelf: 'flex-end',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: THEME.status.success,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    color: '#051018',
    fontWeight: '800',
  },
  errorText: {
    color: '#FF8694',
    fontSize: 12,
  },
});
