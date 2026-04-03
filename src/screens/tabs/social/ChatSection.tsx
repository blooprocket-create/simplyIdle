import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { GlobalChatMessage } from '../../../services/chat';
import { SocialAsyncState, SocialCard, SocialInput, SocialPrimaryButton } from './SocialPrimitives';

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
  return (
    <>
      <SocialCard styles={styles} title="Global Chat" subtitle={`Online now: ${onlineCount} • Real-time feed`}>
        {mutedUntil && mutedUntil > Date.now() && (
          <Text style={styles.mutedText}>You are muted until {new Date(mutedUntil).toLocaleString()}.</Text>
        )}
      </SocialCard>

      <SocialAsyncState
        styles={styles}
        isLoading={isLoading}
        isEmpty={messages.length === 0}
        emptyTitle="No Messages Yet"
        emptySubtitle="Start the conversation and rally your alliance."
      />

      <View style={[styles.card, styles.chatListCard]}>
        <FlatList
          data={messages}
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            const mine = item.uid === meUid;
            return (
              <Pressable
                style={[styles.chatRow, mine && styles.chatRowMine]}
                onPress={() => {
                  if (mine) return;
                  onOpenProfile(item.uid);
                }}
                onLongPress={() => {
                  if (mine) return;
                  onOpenUserMenu(item);
                }}
                delayLongPress={200}
              >
                <View style={styles.chatHeaderRow}>
                  <Text style={styles.chatName} numberOfLines={1} ellipsizeMode="tail">
                    {item.displayName} Lv.{item.level} VIP {item.vipLevel}{item.guildTag ? ` [${item.guildTag}]` : ''}
                  </Text>
                  <Text style={styles.chatTime}>{formatTime(item.sentAt)}</Text>
                </View>
                <Text style={styles.chatText}>{item.text}</Text>
                {isAdmin && !mine && (
                  <View style={styles.muteActionsRow}>
                    <Pressable style={styles.muteBtn} onPress={() => void onMute(item.uid, 60 * 60 * 1000, 'Muted by admin (1h)')}>
                      <Text style={styles.muteBtnText}>Mute 1h</Text>
                    </Pressable>
                    <Pressable style={styles.muteBtn} onPress={() => void onMute(item.uid, 24 * 60 * 60 * 1000, 'Muted by admin (24h)')}>
                      <Text style={styles.muteBtnText}>Mute 24h</Text>
                    </Pressable>
                    <Pressable style={[styles.muteBtn, styles.muteBtnPerm]} onPress={() => void onMute(item.uid, 0, 'Muted by admin (permanent)')}>
                      <Text style={styles.muteBtnText}>Perm</Text>
                    </Pressable>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      </View>

      <SocialCard styles={styles} subtitle={`Message as ${meDisplayName} (Lv.${meLevel})`}>
        <SocialInput
          styles={styles}
          value={draft}
          onChangeText={setDraft}
          placeholder="Say something..."
          maxLength={500}
          editable={!sending && !(mutedUntil && mutedUntil > Date.now())}
        />
        <SocialPrimaryButton
          styles={styles}
          label={sending ? 'Sending...' : 'Send'}
          onPress={() => void onSend()}
          disabled={sending || !draft.trim()}
        />
        <SocialAsyncState styles={styles} error={error} variant="inline" />
      </SocialCard>
    </>
  );
}
