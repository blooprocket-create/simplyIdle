import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { GlobalChatMessage } from '../../../services/chat';
import { SocialAsyncState, SocialCard, SocialInput, SocialPrimaryButton } from './SocialPrimitives';

type ChatListRow =
  | { key: string; type: 'day'; label: string }
  | { key: string; type: 'message'; showHeader: boolean; mine: boolean; compact: boolean; message: GlobalChatMessage };

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
  isLoading: boolean;
  meUid: string;
  isAdmin: boolean;
  sending: boolean;
  draft: string;
  setDraft: (value: string) => void;
  error: string | null;
  formatTime: (ts: number) => string;
  onSend: () => Promise<void>;
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
  isLoading,
  meUid,
  isAdmin,
  sending,
  draft,
  setDraft,
  error,
  formatTime,
  onSend,
  onOpenUserMenu,
  onOpenProfile,
  onMute,
  meDisplayName,
  meLevel,
}: ChatSectionProps) {
  const listRef = useRef<FlatList<ChatListRow> | null>(null);
  const prevMessageCountRef = useRef(messages.length);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const rows = useMemo<ChatListRow[]>(() => {
    const nextRows: ChatListRow[] = [];
    let previous: GlobalChatMessage | null = null;
    let previousDay = '';

    for (const message of messages) {
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
        message,
      });

      previous = message;
    }

    return nextRows;
  }, [messages, meUid]);

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
    const previous = prevMessageCountRef.current;
    const next = messages.length;
    const appended = Math.max(0, next - previous);

    if (appended > 0 && !isNearBottom) {
      setUnreadCount(count => count + appended);
    } else {
      scrollToLatest(next > previous);
      setUnreadCount(0);
    }

    prevMessageCountRef.current = next;
  }, [isNearBottom, messages.length, rows.length]);

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
          <View style={[styles.chatChannelChip, styles.chatChannelChipActive]}>
            <Text style={[styles.chatChannelChipText, styles.chatChannelChipTextActive]}>Global</Text>
          </View>
          <View style={styles.chatChannelChip}>
            <Text style={styles.chatChannelChipText}>Guild</Text>
          </View>
          <View style={styles.chatChannelChip}>
            <Text style={styles.chatChannelChipText}>Party</Text>
          </View>
        </View>

        <SocialAsyncState
          styles={styles}
          isLoading={isLoading}
          isEmpty={messages.length === 0}
          emptyTitle="No Messages Yet"
          emptySubtitle="Start the conversation and rally your alliance."
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
                        {message.displayName} Lv.{message.level} VIP {message.vipLevel}{message.guildTag ? ` [${message.guildTag}]` : ''}
                      </Text>
                      <Text style={styles.chatTime}>{formatTime(message.sentAt)}</Text>
                    </View>
                  ) : (
                    <Text style={styles.chatTimeCompact}>{formatTime(message.sentAt)}</Text>
                  )}
                  <Text style={styles.chatText}>{message.text}</Text>
                  {isAdmin && !item.mine && (
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
          <Text style={styles.metaText}>Message as {meDisplayName} (Lv.{meLevel})</Text>
          <View style={styles.chatComposerRow}>
            <SocialInput
              styles={styles}
              style={styles.chatComposerInput}
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message..."
              maxLength={500}
              editable={!sending && !(mutedUntil && mutedUntil > Date.now())}
            />
            <SocialPrimaryButton
              styles={styles}
              label={sending ? '...' : 'Send'}
              onPress={() => void onSend()}
              disabled={sending || !draft.trim()}
            />
          </View>
          <SocialAsyncState styles={styles} error={error} variant="inline" />
        </View>
      </View>
    </>
  );
}
