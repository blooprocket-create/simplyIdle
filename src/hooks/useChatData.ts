import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChatReactionSummary,
  GlobalChatMessage,
  fetchChatReactionSummaryForMessage,
  isUserMuted,
  muteUser,
  sendChatMessage,
  subscribeToChat,
  toggleChatReaction,
} from '../services/chat';
import { fetchOnlineCount } from '../services/presence';
import { GuildChatMessage, sendGuildChatMessage, subscribeGuildChat } from '../services/guild';
import { trackEvent } from '../telemetry';

const CHAT_COOLDOWN_MS = 3_000;
const ONLINE_POLL_MS = 30_000;
const MUTE_POLL_MS = 20_000;

export interface ChatIdentity {
  uid: string;
  name: string;
  level: number;
  vipLevel: number;
}

export interface UseChatDataReturn {
  // State
  messages: GlobalChatMessage[];
  guildMessages: GuildChatMessage[];
  onlineCount: number;
  mutedUntil: number | null;
  draft: string;
  guildDraft: string;
  chatError: string | null;
  guildChatError: string | null;
  sending: boolean;
  guildSending: boolean;
  chatLoadedOnce: boolean;

  // Setters
  setDraft: (value: string) => void;
  setGuildDraft: (value: string) => void;

  // Actions
  sendMessage: () => Promise<void>;
  sendGuildMessage: () => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  muteWithDuration: (targetUid: string, durationMs: number, reason: string) => Promise<void>;
  clearChatError: () => void;
}

/**
 * Encapsulates all chat state: global messages, guild messages, presence,
 * mute status, drafts, send actions, and reaction toggling.
 */
export function useChatData(
  me: ChatIdentity,
  guildId: string | null,
  isAdmin: boolean,
  active: boolean,
): UseChatDataReturn {
  const [messages, setMessages] = useState<GlobalChatMessage[]>([]);
  const [guildMessages, setGuildMessages] = useState<GuildChatMessage[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [mutedUntil, setMutedUntil] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [guildDraft, setGuildDraft] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [guildChatError, setGuildChatError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [guildSending, setGuildSending] = useState(false);
  const [chatLoadedOnce, setChatLoadedOnce] = useState(false);
  const lastSendAtRef = useRef(0);

  // --- Global chat + online count + mute polling ---
  useEffect(() => {
    if (!active) return;

    const stopChat = subscribeToChat(
      rows => {
        setMessages(rows);
        setChatLoadedOnce(true);
      },
      err => {
        setChatError(err.message || 'Chat sync failed.');
        setChatLoadedOnce(true);
      },
    );

    const refreshOnline = () => {
      void fetchOnlineCount()
        .then(setOnlineCount)
        .catch(() => {});
    };
    const refreshMute = () => {
      if (!me.uid) return;
      void isUserMuted(me.uid)
        .then(mute => setMutedUntil(mute?.mutedUntil ?? null))
        .catch(() => setMutedUntil(null));
    };

    refreshOnline();
    refreshMute();
    const onlineTimer = setInterval(refreshOnline, ONLINE_POLL_MS);
    const muteTimer = setInterval(refreshMute, MUTE_POLL_MS);

    return () => {
      stopChat();
      clearInterval(onlineTimer);
      clearInterval(muteTimer);
    };
  }, [active, me.uid]);

  // --- Guild chat subscription ---
  useEffect(() => {
    if (!active || !me.uid || !guildId) return;
    const stop = subscribeGuildChat(me.uid, setGuildMessages);
    return stop;
  }, [active, me.uid, guildId]);

  // --- Send global message ---
  const sendMessage = useCallback(async () => {
    if (!me.uid || sending) return;
    const now = Date.now();
    if (now - lastSendAtRef.current < CHAT_COOLDOWN_MS) {
      setChatError('Slow down: chat has a 3-second cooldown.');
      void trackEvent('social_chat_send_blocked', { reason: 'cooldown' });
      return;
    }
    if (mutedUntil && mutedUntil > now) {
      setChatError('You are muted right now.');
      void trackEvent('social_chat_send_blocked', { reason: 'muted' });
      return;
    }

    setChatError(null);
    setSending(true);
    try {
      await sendChatMessage(me.uid, me.name, me.level, draft, me.vipLevel);
      setDraft('');
      lastSendAtRef.current = now;
      void trackEvent('social_chat_send_success', { hasGuild: !!guildId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send message.';
      setChatError(msg);
      void trackEvent('social_chat_send_failed', { reason: msg.slice(0, 80) });
    } finally {
      setSending(false);
    }
  }, [me.uid, me.name, me.level, me.vipLevel, sending, draft, mutedUntil, guildId]);

  // --- Send guild message ---
  const sendGuildMessage = useCallback(async () => {
    if (!me.uid || !guildId || guildSending || !guildDraft.trim()) return;
    setGuildSending(true);
    setGuildChatError(null);
    try {
      await sendGuildChatMessage({
        uid: me.uid,
        displayName: me.name,
        text: guildDraft,
      });
      setGuildDraft('');
      void trackEvent('social_guild_chat_send_success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send guild chat.';
      setGuildChatError(msg);
      void trackEvent('social_guild_chat_send_failed', { reason: msg.slice(0, 80) });
    } finally {
      setGuildSending(false);
    }
  }, [me.uid, me.name, guildId, guildSending, guildDraft]);

  // --- Toggle reaction ---
  const toggleReactionCb = useCallback(
    async (messageId: string, emoji: string) => {
      if (!me.uid) return;
      try {
        const summary = await toggleChatReaction(me.uid, messageId, emoji);
        const resolved: ChatReactionSummary = summary?.counts
          ? summary
          : await fetchChatReactionSummaryForMessage(messageId, me.uid);

        setMessages(current =>
          current.map(message => {
            if (message.id !== messageId) return message;
            return { ...message, reactions: resolved.counts, myReaction: resolved.mine };
          }),
        );
        setChatError(null);
        void trackEvent('social_chat_reaction_toggled', { emoji });
      } catch {
        setChatError('Failed to react to message.');
      }
    },
    [me.uid],
  );

  // --- Mute (admin) ---
  const muteWithDuration = useCallback(
    async (targetUid: string, durationMs: number, reason: string) => {
      if (!isAdmin || !me.uid || !targetUid || targetUid === me.uid) return;
      try {
        await muteUser(targetUid, me.uid, durationMs, reason);
      } catch {
        setChatError('Failed to mute user.');
      }
    },
    [isAdmin, me.uid],
  );

  const clearChatError = useCallback(() => {
    setChatError(null);
    setGuildChatError(null);
  }, []);

  return {
    messages,
    guildMessages,
    onlineCount,
    mutedUntil,
    draft,
    guildDraft,
    chatError,
    guildChatError,
    sending,
    guildSending,
    chatLoadedOnce,
    setDraft,
    setGuildDraft,
    sendMessage,
    sendGuildMessage,
    toggleReaction: toggleReactionCb,
    muteWithDuration,
    clearChatError,
  };
}
