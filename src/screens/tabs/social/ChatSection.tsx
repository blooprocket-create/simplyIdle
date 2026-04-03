import React from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { THEME } from '../../../theme';
import { GlobalChatMessage } from '../../../services/chat';

interface ChatSectionProps {
  styles: any;
  onlineCount: number;
  mutedUntil: number | null;
  messages: GlobalChatMessage[];
  meUid: string;
  isAdmin: boolean;
  sending: boolean;
  draft: string;
  setDraft: (value: string) => void;
  error: string | null;
  formatTime: (ts: number) => string;
  onSend: () => Promise<void>;
  onOpenUserMenu: (item: GlobalChatMessage) => void;
  onMute: (targetUid: string, durationMs: number, reason: string) => Promise<void>;
  meDisplayName: string;
  meLevel: number;
}

export function ChatSection({
  styles,
  onlineCount,
  mutedUntil,
  messages,
  meUid,
  isAdmin,
  sending,
  draft,
  setDraft,
  error,
  formatTime,
  onSend,
  onOpenUserMenu,
  onMute,
  meDisplayName,
  meLevel,
}: ChatSectionProps) {
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Global Chat</Text>
        <Text style={styles.metaText}>Online now: {onlineCount} • Real-time feed</Text>
        {mutedUntil && mutedUntil > Date.now() && (
          <Text style={styles.mutedText}>You are muted until {new Date(mutedUntil).toLocaleString()}.</Text>
        )}
      </View>

      <View style={[styles.card, styles.chatListCard]}>
        {messages.length === 0 && <Text style={styles.metaText}>No messages yet. Start the conversation.</Text>}
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
                  onOpenUserMenu(item);
                }}
              >
                <View style={styles.chatHeaderRow}>
                  <Text style={styles.chatName}>
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

      <View style={styles.card}>
        <Text style={styles.metaText}>Message as {meDisplayName} (Lv.{meLevel})</Text>
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
          onPress={() => void onSend()}
          disabled={sending || !draft.trim()}
        >
          <Text style={styles.sendBtnText}>{sending ? 'Sending...' : 'Send'}</Text>
        </Pressable>
        {!!error && <Text style={styles.errorText}>{error}</Text>}
      </View>
    </>
  );
}
