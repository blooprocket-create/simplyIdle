import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import {
  DMThread,
  DirectMessage,
  fetchConversations,
  markConversationRead,
  sendDirectMessage,
  subscribeToConversation,
} from '../../../services/directMessages';
import { SocialCard, SocialInput, SocialPrimaryButton } from './SocialPrimitives';
import { socialStyles as styles } from './social.styles';
import { useSocialMe, useSocialFriends } from './SocialContext';
import { trackEvent } from '../../../telemetry';
import { FeedbackPressable as Pressable } from '../../../components/FeedbackPressable';

type DMView = 'inbox' | 'conversation';

export function DMSection() {
  const { me } = useSocialMe();
  const { friends } = useSocialFriends();

  const [view, setView] = useState<DMView>('inbox');
  const [threads, setThreads] = useState<DMThread[]>([]);
  const [activePartner, setActivePartner] = useState<{ uid: string; name: string } | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);

  // ─── Load conversation list ──────────────────────────────────────────

  useEffect(() => {
    if (!me.uid) return;
    setLoading(true);
    void fetchConversations(me.uid)
      .then(convos => {
        setThreads(convos);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [me.uid]);

  // ─── Subscribe to active conversation ────────────────────────────────

  useEffect(() => {
    if (!me.uid || !activePartner) return;
    void markConversationRead(me.uid, activePartner.uid);
    const unsub = subscribeToConversation(me.uid, activePartner.uid, setMessages);
    return unsub;
  }, [me.uid, activePartner]);

  // ─── Open a conversation ─────────────────────────────────────────────

  const openConversation = useCallback((partnerUid: string, partnerName: string) => {
    setActivePartner({ uid: partnerUid, name: partnerName });
    setMessages([]);
    setDraft('');
    setView('conversation');
  }, []);

  const goBackToInbox = useCallback(() => {
    setView('inbox');
    setActivePartner(null);
    setMessages([]);
    // Refresh threads when going back
    if (me.uid) {
      void fetchConversations(me.uid)
        .then(setThreads)
        .catch(() => {});
    }
  }, [me.uid]);

  // ─── Send message ────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    if (!me.uid || !activePartner || !draft.trim() || sending) return;
    setSending(true);
    try {
      await sendDirectMessage(me.uid, activePartner.uid, me.name, activePartner.name, draft.trim());
      setDraft('');
      void trackEvent('social_dm_sent');
    } catch {
      // Handled silently
    } finally {
      setSending(false);
    }
  }, [me.uid, me.name, activePartner, draft, sending]);

  // ─── Thread list item ────────────────────────────────────────────────

  const renderThread = useCallback(
    ({ item }: { item: DMThread }) => {
      const hasUnread = item.unreadCount > 0;
      return (
        <Pressable
          style={[styles.friendRow, hasUnread && { borderColor: '#83D0FF' }]}
          onPress={() => openConversation(item.partnerUid, item.partnerName || 'Player')}
        >
          <View style={styles.friendMeta}>
            <Text style={styles.friendName}>
              {item.partnerName || 'Player'}
              {hasUnread ? ` (${item.unreadCount})` : ''}
            </Text>
            <Text style={styles.metaText} numberOfLines={1}>
              {item.lastMessageText || 'No messages yet'}
            </Text>
          </View>
        </Pressable>
      );
    },
    [openConversation],
  );

  // ─── Message item ───────────────────────────────────────────────────

  const renderMessage = useCallback(
    ({ item }: { item: DirectMessage }) => {
      const isMine = item.senderUid === me.uid;
      const time = new Date(item.sentAt);
      const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
      return (
        <View style={[styles.chatRow, isMine && styles.chatRowMine]}>
          <View style={styles.chatHeaderRow}>
            <Text style={styles.chatName}>{isMine ? 'You' : (activePartner?.name ?? 'Player')}</Text>
            <Text style={styles.chatTime}>{timeStr}</Text>
          </View>
          <Text style={styles.chatText}>{item.text}</Text>
        </View>
      );
    },
    [me.uid, activePartner?.name],
  );

  // ─── Render ──────────────────────────────────────────────────────────

  if (view === 'conversation' && activePartner) {
    return (
      <SocialCard styles={styles} title={`Chat with ${activePartner.name ?? 'Player'}`}>
        <Pressable style={styles.smallBtn} onPress={goBackToInbox}>
          <Text style={styles.smallBtnText}>← Back to Inbox</Text>
        </Pressable>

        <View style={[styles.chatStreamArea, { minHeight: 200, maxHeight: 320 }]}>
          <FlatList
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            contentContainerStyle={{ padding: 8, paddingBottom: 12 }}
            inverted={false}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <SocialInput
            styles={styles}
            style={{ flex: 1 }}
            placeholder="Type a message..."
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={handleSend}
            maxLength={500}
          />
          <SocialPrimaryButton
            styles={styles}
            label={sending ? '...' : 'Send'}
            onPress={handleSend}
            disabled={sending || !draft.trim()}
          />
        </View>
      </SocialCard>
    );
  }

  // ─── Inbox view ─────────────────────────────────────────────────────

  const totalUnread = threads.reduce((sum, t) => sum + t.unreadCount, 0);

  return (
    <SocialCard
      styles={styles}
      title={`Direct Messages${totalUnread > 0 ? ` (${totalUnread})` : ''}`}
      subtitle="Private messages with friends"
    >
      {/* Start new conversation with a friend */}
      {friends.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>Start Conversation</Text>
          {friends.slice(0, 5).map(friend => {
            const existingThread = threads.find(t => t.partnerUid === friend.uid);
            return (
              <Pressable
                key={friend.uid}
                style={styles.friendRow}
                onPress={() => openConversation(friend.uid, friend.displayName)}
              >
                <View style={styles.friendMeta}>
                  <Text style={styles.friendName}>{friend.displayName}</Text>
                  {existingThread && existingThread.unreadCount > 0 && (
                    <Text style={styles.metaText}>{existingThread.unreadCount} unread</Text>
                  )}
                </View>
                <View style={styles.smallBtn}>
                  <Text style={styles.smallBtnText}>Message</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Existing threads */}
      {threads.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>Recent Conversations</Text>
          <FlatList
            data={threads}
            keyExtractor={item => item.partnerUid}
            renderItem={renderThread}
            scrollEnabled={false}
          />
        </View>
      )}

      {!loading && threads.length === 0 && friends.length === 0 && (
        <Text style={styles.metaText}>Add some friends to start messaging!</Text>
      )}
    </SocialCard>
  );
}
