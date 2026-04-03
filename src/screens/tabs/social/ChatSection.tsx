import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { GlobalChatMessage } from '../../../services/chat';
import { GuildChatMessage } from '../../../services/guild';
import { SocialAsyncState, SocialCard, SocialInput, SocialPrimaryButton } from './SocialPrimitives';

type ChatChannel = 'global' | 'guild' | 'party';

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
  reactions?: Record<string, number>;
  myReaction?: string | null;
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
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
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
  onToggleReaction,
  onMute,
  meDisplayName,
  meLevel,
}: ChatSectionProps) {
  const [activeChannel, setActiveChannel] = useState<ChatChannel>('global');
  const [optimisticReactionByMessageId, setOptimisticReactionByMessageId] = useState<Record<string, string | null>>({});
  const [reactionPendingByMessageId, setReactionPendingByMessageId] = useState<Record<string, boolean>>({});
  const listRef = useRef<FlatList<ChatListRow> | null>(null);
  const prevCountByChannelRef = useRef<Record<ChatChannel, number>>({
    global: messages.length,
    guild: guildMessages.length,
    party: 0,
  });
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadByChannel, setUnreadByChannel] = useState<Record<ChatChannel, number>>({
    global: 0,
    guild: 0,
    party: 0,
  });

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
    if (nearBottom) {
      setUnreadByChannel(current => ({
        ...current,
        [activeChannel]: 0,
      }));
    }
  };

  useEffect(() => {
    const prevGlobal = prevCountByChannelRef.current.global;
    const prevGuild = prevCountByChannelRef.current.guild;
    const nextGlobal = messages.length;
    const nextGuild = guildMessages.length;

    const deltaGlobal = Math.max(0, nextGlobal - prevGlobal);
    const deltaGuild = Math.max(0, nextGuild - prevGuild);

    if (deltaGlobal > 0 || deltaGuild > 0) {
      setUnreadByChannel(current => {
        const nextState = { ...current };

        if (deltaGlobal > 0) {
          if (activeChannel === 'global' && isNearBottom) {
            nextState.global = 0;
          } else {
            nextState.global = current.global + deltaGlobal;
          }
        }

        if (deltaGuild > 0) {
          if (activeChannel === 'guild' && isNearBottom) {
            nextState.guild = 0;
          } else {
            nextState.guild = current.guild + deltaGuild;
          }
        }

        return nextState;
      });
    }

    if (rows.length && isNearBottom) {
      scrollToLatest(nextGlobal > prevGlobal || nextGuild > prevGuild);
    }

    prevCountByChannelRef.current.global = nextGlobal;
    prevCountByChannelRef.current.guild = nextGuild;
  }, [activeChannel, guildMessages.length, isNearBottom, messages.length, rows.length]);

  useEffect(() => {
    setUnreadByChannel(current => ({
      ...current,
      [activeChannel]: 0,
    }));
    setIsNearBottom(true);
    scrollToLatest(false);
  }, [activeChannel]);

  useEffect(() => {
    // Clear optimistic overrides once server state catches up with the same reaction value.
    setOptimisticReactionByMessageId(current => {
      let changed = false;
      const next = { ...current };
      for (const message of messages) {
        if (!Object.prototype.hasOwnProperty.call(next, message.id)) continue;
        const optimistic = next[message.id] ?? null;
        const serverValue = message.myReaction ?? null;
        if (optimistic === serverValue) {
          delete next[message.id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [messages]);

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

  const activeUnread = unreadByChannel[activeChannel];

  const getEffectiveMyReaction = (message: ChatRenderMessage): string | null => {
    if (Object.prototype.hasOwnProperty.call(optimisticReactionByMessageId, message.id)) {
      return optimisticReactionByMessageId[message.id] ?? null;
    }
    return message.myReaction ?? null;
  };

  const getEffectiveReactionCount = (message: ChatRenderMessage, emoji: string): number => {
    const base = message.reactions?.[emoji] ?? 0;
    const baseMine = message.myReaction === emoji;
    const effectiveMine = getEffectiveMyReaction(message) === emoji;
    if (baseMine === effectiveMine) return base;
    if (baseMine && !effectiveMine) return Math.max(0, base - 1);
    return base + 1;
  };

  const onReactionPress = async (message: ChatRenderMessage, emoji: string) => {
    if (reactionPendingByMessageId[message.id]) return;

    const currentEffective = getEffectiveMyReaction(message);
    const nextEffective = currentEffective === emoji ? null : emoji;

    setReactionPendingByMessageId(current => ({ ...current, [message.id]: true }));
    setOptimisticReactionByMessageId(current => ({ ...current, [message.id]: nextEffective }));

    try {
      await onToggleReaction(message.id, emoji);
    } catch {
      // Revert optimistic state if transaction fails.
      setOptimisticReactionByMessageId(current => {
        const next = { ...current };
        next[message.id] = currentEffective;
        return next;
      });
    } finally {
      setReactionPendingByMessageId(current => {
        const next = { ...current };
        delete next[message.id];
        return next;
      });
    }
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
            {unreadByChannel.global > 0 && activeChannel !== 'global' && (
              <View style={styles.chatChannelBadge}>
                <Text style={styles.chatChannelBadgeText}>{unreadByChannel.global}</Text>
              </View>
            )}
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
            {unreadByChannel.guild > 0 && activeChannel !== 'guild' && (
              <View style={styles.chatChannelBadge}>
                <Text style={styles.chatChannelBadgeText}>{unreadByChannel.guild}</Text>
              </View>
            )}
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
                <View
                  style={[
                    styles.chatRow,
                    item.mine && styles.chatRowMine,
                    item.compact && styles.chatRowCompact,
                  ]}
                >
                  <Pressable
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
                  </Pressable>
                  {item.source === 'global' && (
                    <View style={styles.reactionRow}>
                      {(['👍', '🔥', '💪', '🎉'] as const).map(emoji => {
                        const count = getEffectiveReactionCount(message, emoji);
                        const active = getEffectiveMyReaction(message) === emoji;
                        const pending = !!reactionPendingByMessageId[message.id];
                        return (
                          <Pressable
                            key={`${message.id}_${emoji}`}
                            style={[styles.reactionChip, active && styles.reactionChipActive]}
                            hitSlop={8}
                            disabled={pending}
                            onPress={() => {
                              void onReactionPress(message, emoji);
                            }}
                          >
                            <Text style={styles.reactionChipText}>{emoji}</Text>
                            {!!count && <Text style={styles.reactionChipCount}>{count}</Text>}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
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
                </View>
              );
            }}
          />
        </View>

        {!isNearBottom && activeUnread > 0 && (
          <Pressable style={styles.chatJumpToLatestBtn} onPress={() => {
            setUnreadByChannel(current => ({
              ...current,
              [activeChannel]: 0,
            }));
            scrollToLatest();
          }}>
            <Text style={styles.chatJumpToLatestText}>New {activeUnread} • Jump to Latest</Text>
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
