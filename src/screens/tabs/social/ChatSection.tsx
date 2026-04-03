import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { GlobalChatMessage } from '../../../services/chat';
import { GuildChatMessage } from '../../../services/guild';
import { SocialAsyncState, SocialCard, SocialInput, SocialPrimaryButton } from './SocialPrimitives';

type ChatListRow =
  | { key: string; type: 'day'; label: string }
  | { key: string; type: 'message'; showHeader: boolean; mine: boolean; compact: boolean; source: 'global' | 'guild'; message: ChatRenderMessage };

interface ChatRenderMessage {
  id: string;
  uid: string;
  displayName: string;
  level?: number;
  vipLevel?: number;
  guildTag?: string;
  text: string;
  sentAt: number;
}

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function formatDayLabel(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

interface ChatSectionProps {
  styles: any;
  onlineCount: number;
  mutedUntil: number | null;
  messages: GlobalChatMessage[];
  guildMessages: GuildChatMessage[];
  hasGuild: boolean;
  isLoading: boolean;
  meUid: string;
  isAdmin: boolean;
  sending: boolean;
  guildSending: boolean;
  draft: string;
  setDraft: (value: string) => void;
  guildDraft: string;
  setGuildDraft: (value: string) => void;
  error: string | null;
  guildError: string | null;
  formatTime: (ts: number) => string;
  onSend: () => Promise<void>;
  onSendGuild: () => Promise<void>;
  onOpenUserMenu: (item: GlobalChatMessage) => void;
  onOpenProfile: (uid: string) => void;
  onMute: (targetUid: string, durationMs: number, reason: string) => Promise<void>;
  meDisplayName: string;
  meLevel: number;
}

export function ChatSection({
  styles,
  onlineCount,
  mutedUntil,
  messages,
  guildMessages,
  hasGuild,
  isLoading,
  meUid,
  isAdmin,
  sending,
  guildSending,
  draft,
  setDraft,
  guildDraft,
  setGuildDraft,
  error,
  guildError,
  formatTime,
  onSend,
  onSendGuild,
  onOpenUserMenu,
  onOpenProfile,
  onMute,
  meDisplayName,
  meLevel,
}: ChatSectionProps) {
  const [activeChannel, setActiveChannel] = useState<'global' | 'guild' | 'party'>('global');
  const listRef = useRef<FlatList<ChatListRow> | null>(null);
  const prevCountByChannelRef = useRef<{ global: number; guild: number; party: number }>({
    global: messages.length,
    guild: guildMessages.length,
    party: 0,
  });
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const activeSourceMessages = useMemo<ChatRenderMessage[]>(() => {
    if (activeChannel === 'guild') {
      return guildMessages.map(message => ({
        id: message.id,
        uid: message.uid,
        displayName: message.displayName,
        text: message.text,
        sentAt: message.sentAt,
      }));
    }
    if (activeChannel === 'party') return [];
    return messages.map(message => ({
      id: message.id,
      uid: message.uid,
      displayName: message.displayName,
      level: message.level,
      vipLevel: message.vipLevel,
      guildTag: message.guildTag,
      text: message.text,
      sentAt: message.sentAt,
    }));
  }, [activeChannel, guildMessages, messages]);

  const rows = useMemo<ChatListRow[]>(() => {
    const nextRows: ChatListRow[] = [];
    let previous: ChatRenderMessage | null = null;
    let previousDay = '';

    for (const message of activeSourceMessages) {
      const currentDay = dayKey(message.sentAt);
      if (currentDay !== previousDay) {
        previousDay = currentDay;
        nextRows.push({
          key: `day_${currentDay}`,
          type: 'day',
          label: formatDayLabel(message.sentAt),
        });
      }

      const sameSender = previous?.uid === message.uid;
      const nearPrevious = previous ? message.sentAt - previous.sentAt <= 90_000 : false;
      const sameDay = previous ? dayKey(previous.sentAt) === currentDay : false;
      const showHeader = !(sameSender && nearPrevious && sameDay);

      nextRows.push({
        key: `msg_${message.id}`,
        type: 'message',
        showHeader,
        mine: message.uid === meUid,
        compact: !showHeader,
        source: activeChannel === 'guild' ? 'guild' : 'global',
        message,
      });

      previous = message;
    }

    return nextRows;
  }, [activeChannel, activeSourceMessages, meUid]);

  const scrollToLatest = (animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  };

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (layoutMeasurement.height + contentOffset.y);
    const nearBottom = distanceFromBottom <= 40;
    setIsNearBottom(nearBottom);
    if (nearBottom && unreadCount > 0) {
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    if (!rows.length) return;
    const previous = prevCountByChannelRef.current[activeChannel];
    const next = activeSourceMessages.length;
    const appended = Math.max(0, next - previous);

    if (appended > 0 && !isNearBottom) {
      setUnreadCount(count => count + appended);
    } else {
      scrollToLatest(next > previous);
      setUnreadCount(0);
    }

    prevCountByChannelRef.current[activeChannel] = next;
  }, [activeChannel, activeSourceMessages.length, isNearBottom, rows.length]);

  useEffect(() => {
    setUnreadCount(0);
    setIsNearBottom(true);
    scrollToLatest(false);
  }, [activeChannel]);

  const activeDraft = activeChannel === 'guild' ? guildDraft : draft;
  const setActiveDraft = activeChannel === 'guild' ? setGuildDraft : setDraft;
  const activeSending = activeChannel === 'guild' ? guildSending : sending;
  const activeError = activeChannel === 'guild' ? guildError : error;

  const sendActiveMessage = () => {
    if (activeChannel === 'guild') {
      if (!hasGuild) return;
      void onSendGuild();
      return;
    }
    if (activeChannel === 'party') return;
    void onSend();
  };

  return (
    <>
      <SocialCard styles={styles} title="Global Chat" subtitle={`Online now: ${onlineCount} • Real-time feed`}>
        {mutedUntil && mutedUntil > Date.now() && (
          <Text style={styles.mutedText}>You are muted until {new Date(mutedUntil).toLocaleString()}.</Text>
        )}
        <Text style={styles.metaText}>Tap message to open profile • long-press for moderation menu.</Text>
      </SocialCard>

      <View style={[styles.card, styles.chatShell]}>
        <View style={styles.chatChannelRow}>
          <Pressable
            style={[styles.chatChannelChip, activeChannel === 'global' && styles.chatChannelChipActive]}
            onPress={() => setActiveChannel('global')}
          >
            <Text style={[styles.chatChannelChipText, activeChannel === 'global' && styles.chatChannelChipTextActive]}>Global</Text>
          </Pressable>
          <Pressable
            style={[
              styles.chatChannelChip,
              activeChannel === 'guild' && styles.chatChannelChipActive,
              !hasGuild && styles.sendBtnDisabled,
            ]}
            onPress={() => {
              if (!hasGuild) return;
              setActiveChannel('guild');
            }}
          >
            <Text style={[styles.chatChannelChipText, activeChannel === 'guild' && styles.chatChannelChipTextActive]}>Guild</Text>
          </Pressable>
          <Pressable style={[styles.chatChannelChip, styles.sendBtnDisabled]} disabled>
            <Text style={styles.chatChannelChipText}>Party (Soon)</Text>
          </Pressable>
        </View>

        <SocialAsyncState
          styles={styles}
          isLoading={isLoading}
          isEmpty={activeSourceMessages.length === 0}
          emptyTitle={activeChannel === 'guild' ? 'No Guild Messages Yet' : 'No Messages Yet'}
          emptySubtitle={
            activeChannel === 'guild'
              ? (hasGuild ? 'Kick off the strategy in guild channel.' : 'Join a guild to unlock guild chat channel.')
              : 'Start the conversation and rally your alliance.'
          }
          variant="inline"
        />

        <View style={styles.chatStreamArea}>
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={item => item.key}
            style={styles.chatStreamList}
            contentContainerStyle={styles.chatStreamContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              if (isNearBottom) scrollToLatest(false);
            }}
            onLayout={() => {
              scrollToLatest(false);
            }}
            onScroll={handleScroll}
            scrollEventThrottle={32}
            renderItem={({ item }) => {
              if (item.type === 'day') {
                return (
                  <View style={styles.chatDayDividerRow}>
                    <View style={styles.chatDayDividerLine} />
                    <Text style={styles.chatDayDividerText}>{item.label}</Text>
                    <View style={styles.chatDayDividerLine} />
                  </View>
                );
              }

              const { message } = item;
              return (
                <Pressable
                  style={[
                    styles.chatRow,
                    item.mine && styles.chatRowMine,
                    item.compact && styles.chatRowCompact,
                  ]}
                  onPress={() => {
                    if (item.mine) return;
                    onOpenProfile(message.uid);
                  }}
                  onLongPress={() => {
                    if (item.mine) return;
                    onOpenUserMenu(message);
                  }}
                  delayLongPress={200}
                >
                  {item.showHeader ? (
                    <View style={styles.chatHeaderRow}>
                      <Text style={styles.chatName} numberOfLines={1} ellipsizeMode="tail">
                        {item.source === 'global'
                          ? `${message.displayName} Lv.${message.level ?? 1} VIP ${message.vipLevel ?? 0}${message.guildTag ? ` [${message.guildTag}]` : ''}`
                          : `${message.displayName} [Guild]`}
                      </Text>
                      <Text style={styles.chatTime}>{formatTime(message.sentAt)}</Text>
                    </View>
                  ) : (
                    <Text style={styles.chatTimeCompact}>{formatTime(message.sentAt)}</Text>
                  )}
                  <Text style={styles.chatText}>{message.text}</Text>
                  {isAdmin && !item.mine && item.source === 'global' && (
                    <View style={styles.muteActionsRow}>
                      <Pressable style={styles.muteBtn} onPress={() => void onMute(message.uid, 60 * 60 * 1000, 'Muted by admin (1h)')}>
                        <Text style={styles.muteBtnText}>Mute 1h</Text>
                      </Pressable>
                      <Pressable style={styles.muteBtn} onPress={() => void onMute(message.uid, 24 * 60 * 60 * 1000, 'Muted by admin (24h)')}>
                        <Text style={styles.muteBtnText}>Mute 24h</Text>
                      </Pressable>
                      <Pressable style={[styles.muteBtn, styles.muteBtnPerm]} onPress={() => void onMute(message.uid, 0, 'Muted by admin (permanent)')}>
                        <Text style={styles.muteBtnText}>Perm</Text>
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        </View>

        {!isNearBottom && unreadCount > 0 && (
          <Pressable style={styles.chatJumpToLatestBtn} onPress={() => {
            setUnreadCount(0);
            scrollToLatest();
          }}>
            <Text style={styles.chatJumpToLatestText}>New {unreadCount} • Jump to Latest</Text>
          </Pressable>
        )}

        <View style={styles.chatComposerWrap}>
          <Text style={styles.metaText}>
            {activeChannel === 'guild'
              ? `Guild channel as ${meDisplayName}`
              : `Message as ${meDisplayName} (Lv.${meLevel})`}
          </Text>
          <View style={styles.chatComposerRow}>
            <SocialInput
              styles={styles}
              style={styles.chatComposerInput}
              value={activeDraft}
              onChangeText={setActiveDraft}
              placeholder={activeChannel === 'guild' ? 'Message guild...' : 'Type a message...'}
              maxLength={activeChannel === 'guild' ? 300 : 500}
              editable={activeChannel === 'guild'
                ? hasGuild && !guildSending
                : !sending && !(mutedUntil && mutedUntil > Date.now())
              }
            />
            <SocialPrimaryButton
              styles={styles}
              label={activeSending ? '...' : 'Send'}
              onPress={sendActiveMessage}
              disabled={activeSending || !activeDraft.trim() || (activeChannel === 'guild' && !hasGuild) || activeChannel === 'party'}
            />
          </View>
          <SocialAsyncState styles={styles} error={activeError} variant="inline" />
        </View>
      </View>
    </>
  );
}
