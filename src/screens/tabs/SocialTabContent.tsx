import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  NativeSyntheticEvent,
  NativeTouchEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { THEME, RADIUS } from '../../theme';
import {
  ChatReactionSummary,
  GlobalChatMessage,
  fetchChatReactionSummaryForMessage,
  isUserMuted,
  muteUser,
  sendChatMessage,
  subscribeToChat,
  toggleChatReaction,
} from '../../services/chat';
import { fetchOnlineCount } from '../../services/presence';
import { getFirebaseAuth } from '../../services/firebase';
import {
  acceptFriendRequest,
  declineFriendRequest,
  fetchFriendRelationshipStatus,
  fetchFriends,
  fetchGiftCooldowns,
  fetchPendingRequests,
  fetchFriendProfile,
  FriendRelationshipStatus,
  removeFriend,
  sendFriendRequest,
  sendGift,
  setGiftPreference,
  subscribeFriendsRealtime,
  FriendListEntry,
  PendingFriendRequest,
} from '../../services/friends';
import { GiftPreference } from '../../gameConfig';
import {
  disbandGuild,
  fetchActiveBoss,
  fetchGuildBrowse,
  fetchGuildChat,
  fetchGuildEvents,
  fetchGuildInfo,
  fetchGuildMembers,
  GuildBossState,
  GuildBrowseRow,
  GuildChatMessage,
  GuildEventState,
  GuildMember,
  GuildSummary,
  kickGuildMember,
  sendGuildInvite,
  sendGuildChatMessage,
  subscribeGuildChat,
  subscribeGuildMembership,
  transferGuildLeadership,
} from '../../services/guild';
import { trackEvent } from '../../telemetry';
import { ChatSection } from './social/ChatSection';
import { FriendsSection } from './social/FriendsSection';
import { GuildSection } from './social/GuildSection';
import { ProfileModal } from './social/ProfileModal';

export interface SocialTabContentProps {
  tab: string;
  accountName: string;
  publicUsername: string;
  level: number;
  highestWaveReached: number;
  vipLevel: number;
  diamonds: number;
  saveSlotId: string;
  isAdmin: boolean;
  onPendingRequestsCountChange?: (count: number) => void;
}

type SocialSubTab = 'chat' | 'friends' | 'guild';
type GuildSubTab = 'home' | 'boss' | 'events' | 'treasury';
const SOCIAL_TABS: SocialSubTab[] = ['chat', 'friends', 'guild'];

interface SocialUiState {
  sending: boolean;
  friendsBusy: boolean;
  guildBusy: boolean;
  chatError: string | null;
  friendsError: string | null;
  guildError: string | null;
  lastSendAt: number;
  chatLoadedOnce: boolean;
  friendsLoadedOnce: boolean;
  guildLoadedOnce: boolean;
}

type SocialUiAction =
  | { type: 'setSending'; value: boolean }
  | { type: 'setFriendsBusy'; value: boolean }
  | { type: 'setGuildBusy'; value: boolean }
  | { type: 'setChatError'; value: string | null }
  | { type: 'setFriendsError'; value: string | null }
  | { type: 'setGuildError'; value: string | null }
  | { type: 'setLastSendAt'; value: number }
  | { type: 'setChatLoadedOnce'; value: boolean }
  | { type: 'setFriendsLoadedOnce'; value: boolean }
  | { type: 'setGuildLoadedOnce'; value: boolean }
  | { type: 'clearErrors' };

const initialSocialUiState: SocialUiState = {
  sending: false,
  friendsBusy: false,
  guildBusy: false,
  chatError: null,
  friendsError: null,
  guildError: null,
  lastSendAt: 0,
  chatLoadedOnce: false,
  friendsLoadedOnce: false,
  guildLoadedOnce: false,
};

function socialUiReducer(state: SocialUiState, action: SocialUiAction): SocialUiState {
  switch (action.type) {
    case 'setSending':
      return { ...state, sending: action.value };
    case 'setFriendsBusy':
      return { ...state, friendsBusy: action.value };
    case 'setGuildBusy':
      return { ...state, guildBusy: action.value };
    case 'setChatError':
      return { ...state, chatError: action.value };
    case 'setFriendsError':
      return { ...state, friendsError: action.value };
    case 'setGuildError':
      return { ...state, guildError: action.value };
    case 'setLastSendAt':
      return { ...state, lastSendAt: action.value };
    case 'setChatLoadedOnce':
      return { ...state, chatLoadedOnce: action.value };
    case 'setFriendsLoadedOnce':
      return { ...state, friendsLoadedOnce: action.value };
    case 'setGuildLoadedOnce':
      return { ...state, guildLoadedOnce: action.value };
    case 'clearErrors':
      return { ...state, chatError: null, friendsError: null, guildError: null };
    default:
      return state;
  }
}

function formatTime(ts: number): string {
  const date = new Date(ts);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function giftIcon(pref: GiftPreference): string {
  if (pref === 'shards') return '💠';
  if (pref === 'essence') return '✨';
  return '💰';
}

function isSameUtcDay(a: number, b: number): boolean {
  if (!a || !b) return false;
  return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
}

function timeUntilNextUtcMidnightLabel(nowMs: number): string {
  const now = new Date(nowMs);
  const nextMidnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
  const diffMs = Math.max(0, nextMidnightUtc - nowMs);
  const hours = Math.floor(diffMs / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

function shiftSocialTab(current: SocialSubTab, direction: -1 | 1): SocialSubTab {
  const index = SOCIAL_TABS.indexOf(current);
  if (index < 0) return current;
  const nextIndex = Math.max(0, Math.min(SOCIAL_TABS.length - 1, index + direction));
  return SOCIAL_TABS[nextIndex];
}

export const SocialTabContent = React.memo(function SocialTabContent({
  tab,
  accountName,
  publicUsername,
  level,
  highestWaveReached,
  vipLevel,
  diamonds,
  saveSlotId,
  isAdmin,
  onPendingRequestsCountChange,
}: SocialTabContentProps) {
  const [subTab, setSubTab] = useState<SocialSubTab>('chat');
  const [onlineCount, setOnlineCount] = useState(0);
  const [messages, setMessages] = useState<GlobalChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [friendSearch, setFriendSearch] = useState('');
  const [friends, setFriends] = useState<FriendListEntry[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingFriendRequest[]>([]);
  const [giftCooldowns, setGiftCooldowns] = useState<Record<string, number>>({});
  const [myGiftPreference, setMyGiftPreference] = useState<GiftPreference>('gold');
  const [uiState, dispatchUi] = useReducer(socialUiReducer, initialSocialUiState);
  const [mutedUntil, setMutedUntil] = useState<number | null>(null);
  const [guildNameInput, setGuildNameInput] = useState('');
  const [guildTagInput, setGuildTagInput] = useState('');
  const [guildDescInput, setGuildDescInput] = useState('');
  const [guildSearchInput, setGuildSearchInput] = useState('');
  const [guildList, setGuildList] = useState<GuildBrowseRow[]>([]);
  const [myGuild, setMyGuild] = useState<GuildSummary | null>(null);
  const [guildMembers, setGuildMembers] = useState<GuildMember[]>([]);
  const [guildSubTab, setGuildSubTab] = useState<GuildSubTab>('home');
  const [guildBoss, setGuildBoss] = useState<GuildBossState | null>(null);
  const [guildEvents, setGuildEvents] = useState<GuildEventState[]>([]);
  const [guildChat, setGuildChat] = useState<GuildChatMessage[]>([]);
  const [guildChatDraft, setGuildChatDraft] = useState('');
  const [activeUserMenu, setActiveUserMenu] = useState<GlobalChatMessage | null>(null);
  const [activeUserRelationship, setActiveUserRelationship] = useState<FriendRelationshipStatus>('none');
  const [confirmKickMember, setConfirmKickMember] = useState<GuildMember | null>(null);
  const [confirmTransferLeader, setConfirmTransferLeader] = useState<GuildMember | null>(null);
  const [confirmDisbandGuild, setConfirmDisbandGuild] = useState(false);
  const [activeProfileUid, setActiveProfileUid] = useState<string | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const sectionAnim = useRef(new Animated.Value(1)).current;

  const {
    sending,
    friendsBusy,
    guildBusy,
    chatError,
    friendsError,
    guildError,
    lastSendAt,
    chatLoadedOnce,
    friendsLoadedOnce,
    guildLoadedOnce,
  } = uiState;

  const setSending = (value: boolean) => dispatchUi({ type: 'setSending', value });
  const setFriendsBusy = (value: boolean) => dispatchUi({ type: 'setFriendsBusy', value });
  const setGuildBusy = (value: boolean) => dispatchUi({ type: 'setGuildBusy', value });
  const setChatError = (value: string | null) => dispatchUi({ type: 'setChatError', value });
  const setFriendsError = (value: string | null) => dispatchUi({ type: 'setFriendsError', value });
  const setGuildError = (value: string | null) => dispatchUi({ type: 'setGuildError', value });
  const setLastSendAt = (value: number) => dispatchUi({ type: 'setLastSendAt', value });
  const setChatLoadedOnce = (value: boolean) => dispatchUi({ type: 'setChatLoadedOnce', value });
  const setFriendsLoadedOnce = (value: boolean) => dispatchUi({ type: 'setFriendsLoadedOnce', value });
  const setGuildLoadedOnce = (value: boolean) => dispatchUi({ type: 'setGuildLoadedOnce', value });

  const me = useMemo(() => {
    const authUid = getFirebaseAuth()?.currentUser?.uid ?? '';
    return {
      uid: authUid,
      name: (publicUsername || accountName).trim() || 'Player',
      level: Math.max(1, Math.floor(level || 1)),
      vipLevel: Math.max(0, Math.floor(vipLevel || 0)),
    };
  }, [accountName, publicUsername, level, vipLevel]);

  useEffect(() => {
    if (tab !== 'social') return;

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
    const onlineTimer = setInterval(refreshOnline, 30_000);
    const muteTimer = setInterval(refreshMute, 20_000);

    return () => {
      stopChat();
      clearInterval(onlineTimer);
      clearInterval(muteTimer);
    };
  }, [tab, me.uid]);

  useEffect(() => {
    if (tab !== 'social') return;
    if (!me.uid) {
      setMyGuild(null);
      return;
    }

    const stopMembership = subscribeGuildMembership(
      me.uid,
      guildInfo => {
        setMyGuild(guildInfo);
      },
      () => {
        setGuildError('Guild membership sync failed.');
      },
    );

    return stopMembership;
  }, [tab, me.uid]);

  useEffect(() => {
    onPendingRequestsCountChange?.(pendingRequests.length);
  }, [onPendingRequestsCountChange, pendingRequests.length]);

  useEffect(() => {
    dispatchUi({ type: 'clearErrors' });
    void trackEvent('social_tab_changed', {
      tab: subTab,
      mode: 'social',
    });
  }, [subTab]);

  useEffect(() => {
    sectionAnim.setValue(0);
    Animated.timing(sectionAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [sectionAnim, subTab]);

  useEffect(() => {
    if (tab !== 'social' || subTab !== 'friends' || !me.uid) return;

    const stopRealtime = subscribeFriendsRealtime(
      me.uid,
      snapshot => {
        setFriends(snapshot.friends);
        setPendingRequests(snapshot.pendingRequests);
        setGiftCooldowns(snapshot.giftCooldowns);
        if (snapshot.profile?.giftPreference) setMyGiftPreference(snapshot.profile.giftPreference);
        setFriendsLoadedOnce(true);
      },
      () => {
        setFriendsError('Failed to load friends data.');
        setFriendsLoadedOnce(true);
      },
    );

    const fallbackTimer = setInterval(() => {
      void refreshFriendsData();
    }, 90_000);

    return () => {
      stopRealtime();
      clearInterval(fallbackTimer);
    };
  }, [tab, subTab, me.uid]);

  useEffect(() => {
    if (tab !== 'social' || subTab !== 'guild' || !me.uid) return;

    const refresh = async () => {
      setGuildBusy(true);
      setGuildError(null);
      try {
        const guildInfo = myGuild;
        const browseRows = await fetchGuildBrowse(guildSearchInput);
        setGuildList(browseRows);
        if (guildInfo?.guildId) {
          const [members, boss, events] = await Promise.all([
            fetchGuildMembers(guildInfo.guildId),
            fetchActiveBoss(me.uid),
            fetchGuildEvents(me.uid),
          ]);
          setGuildMembers(members);
          setGuildBoss(boss);
          setGuildEvents(events);
        } else {
          setGuildMembers([]);
          setGuildBoss(null);
          setGuildEvents([]);
          setGuildChat([]);
        }
        setGuildLoadedOnce(true);
      } catch {
        setGuildError('Failed to load guild data.');
      } finally {
        setGuildBusy(false);
        setGuildLoadedOnce(true);
      }
    };

    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 60_000);
    return () => clearInterval(timer);
  }, [guildSearchInput, me.uid, myGuild, subTab, tab]);

  useEffect(() => {
    if (tab !== 'social' || !me.uid || !myGuild?.guildId) return;
    const stop = subscribeGuildChat(me.uid, setGuildChat);
    return stop;
  }, [me.uid, myGuild?.guildId, tab]);

  useEffect(() => {
    if (!me.uid || !activeUserMenu?.uid) {
      setActiveUserRelationship('none');
      return;
    }

    void fetchFriendRelationshipStatus(me.uid, activeUserMenu.uid)
      .then(setActiveUserRelationship)
      .catch(() => setActiveUserRelationship('none'));
  }, [activeUserMenu?.uid, me.uid]);

  if (tab !== 'social') return null;

  const send = async () => {
    if (!me.uid || sending) return;
    const now = Date.now();
    if (now - lastSendAt < 3_000) {
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
      setLastSendAt(now);
      void trackEvent('social_chat_send_success', { hasGuild: !!myGuild?.guildId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send message.';
      setChatError(msg);
      void trackEvent('social_chat_send_failed', { reason: msg.slice(0, 80) });
    } finally {
      setSending(false);
    }
  };

  const sendGuildFromChat = async () => {
    if (!me.uid || !myGuild?.guildId || guildBusy || !guildChatDraft.trim()) return;
    setGuildBusy(true);
    setGuildError(null);
    try {
      await sendGuildChatMessage({
        uid: me.uid,
        displayName: me.name,
        text: guildChatDraft,
      });
      setGuildChatDraft('');
      void trackEvent('social_guild_chat_send_success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send guild chat.';
      setGuildError(msg);
      void trackEvent('social_guild_chat_send_failed', { reason: msg.slice(0, 80) });
    } finally {
      setGuildBusy(false);
    }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!me.uid) return;
    try {
      const summary = await toggleChatReaction(me.uid, messageId, emoji);
      const resolvedSummary: ChatReactionSummary = summary?.counts
        ? summary
        : await fetchChatReactionSummaryForMessage(messageId, me.uid);

      setMessages(current =>
        current.map(message => {
          if (message.id !== messageId) return message;
          return {
            ...message,
            reactions: resolvedSummary.counts,
            myReaction: resolvedSummary.mine,
          };
        }),
      );
      setChatError(null);
      void trackEvent('social_chat_reaction_toggled', { emoji });
    } catch {
      setChatError('Failed to react to message.');
    }
  };

  const muteWithDuration = async (targetUid: string, durationMs: number, reason: string) => {
    if (!isAdmin || !me.uid || !targetUid || targetUid === me.uid) return;
    try {
      await muteUser(targetUid, me.uid, durationMs, reason);
    } catch {
      setChatError('Failed to mute user.');
    }
  };

  const refreshFriendsData = async () => {
    if (!me.uid) return;
    setFriendsBusy(true);
    setFriendsError(null);
    try {
      const [friendRows, pendingRows, cooldownRows] = await Promise.all([
        fetchFriends(me.uid),
        fetchPendingRequests(me.uid),
        fetchGiftCooldowns(me.uid),
      ]);
      setFriends(friendRows);
      setPendingRequests(pendingRows);
      setGiftCooldowns(cooldownRows);
    } catch {
      setFriendsError('Failed to load friends data.');
    } finally {
      setFriendsBusy(false);
    }
  };

  const sendRequest = async () => {
    if (!me.uid || !friendSearch.trim() || friendsBusy) return;
    setFriendsBusy(true);
    setFriendsError(null);
    try {
      await sendFriendRequest(me.uid, me.name, friendSearch);
      setFriendSearch('');
      await refreshFriendsData();
      void trackEvent('social_friend_request_sent');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send friend request.';
      setFriendsError(msg);
      void trackEvent('social_friend_request_failed', { reason: msg.slice(0, 80) });
    } finally {
      setFriendsBusy(false);
    }
  };

  const acceptRequest = async (fromUid: string) => {
    if (!me.uid || friendsBusy) return;
    setFriendsBusy(true);
    setFriendsError(null);
    try {
      await acceptFriendRequest(me.uid, fromUid);
      await refreshFriendsData();
    } catch {
      setFriendsError('Failed to accept request.');
    } finally {
      setFriendsBusy(false);
    }
  };

  const declineRequest = async (fromUid: string) => {
    if (!me.uid || friendsBusy) return;
    setFriendsBusy(true);
    setFriendsError(null);
    try {
      await declineFriendRequest(me.uid, fromUid);
      await refreshFriendsData();
    } catch {
      setFriendsError('Failed to decline request.');
    } finally {
      setFriendsBusy(false);
    }
  };

  const sendDailyGift = async (friend: FriendListEntry) => {
    if (!me.uid || friendsBusy) return;
    setFriendsBusy(true);
    setFriendsError(null);
    try {
      await sendGift(me.uid, me.name, friend.uid, friend.giftPreference);
      await refreshFriendsData();
      void trackEvent('social_gift_sent', { preference: friend.giftPreference });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send gift.';
      setFriendsError(msg);
      void trackEvent('social_gift_failed', { reason: msg.slice(0, 80) });
    } finally {
      setFriendsBusy(false);
    }
  };

  const updatePreference = async (preference: GiftPreference) => {
    if (!me.uid || friendsBusy) return;
    setFriendsBusy(true);
    setFriendsError(null);
    try {
      await setGiftPreference(me.uid, preference);
      setMyGiftPreference(preference);
    } catch {
      setFriendsError('Failed to update gift preference.');
    } finally {
      setFriendsBusy(false);
    }
  };

  const refreshGuildData = async () => {
    if (!me.uid) return;
    const [guildInfo, browseRows] = await Promise.all([fetchGuildInfo(me.uid), fetchGuildBrowse(guildSearchInput)]);
    setMyGuild(guildInfo);
    setGuildList(browseRows);
    if (guildInfo?.guildId) {
      const [members, boss, events, chatRows] = await Promise.all([
        fetchGuildMembers(guildInfo.guildId),
        fetchActiveBoss(me.uid),
        fetchGuildEvents(me.uid),
        fetchGuildChat(me.uid),
      ]);
      setGuildMembers(members);
      setGuildBoss(boss);
      setGuildEvents(events);
      setGuildChat(chatRows);
    } else {
      setGuildMembers([]);
      setGuildBoss(null);
      setGuildEvents([]);
      setGuildChat([]);
    }
    void trackEvent('social_guild_refresh_success', { inGuild: !!guildInfo?.guildId });
  };

  const addFriendLabel =
    activeUserRelationship === 'friends'
      ? 'Already Friends'
      : activeUserRelationship === 'outgoing'
        ? 'Request Sent'
        : activeUserRelationship === 'incoming'
          ? 'Incoming Request'
          : 'Add Friend';

  const canAddFriendFromMenu =
    !!activeUserMenu && activeUserMenu.uid !== me.uid && activeUserRelationship === 'none' && !friendsBusy;

  const socialPulse =
    mutedUntil && mutedUntil > Date.now() ? 'Muted' : sending || friendsBusy || guildBusy ? 'Syncing' : 'Live';

  const activeGuildLabel = myGuild ? `[${myGuild.tag}] ${myGuild.name}` : 'No Guild';
  const myGuildRole = guildMembers.find(member => member.uid === me.uid)?.rank ?? null;
  const canInviteToGuild = !!myGuild?.guildId && (myGuild.leaderId === me.uid || myGuildRole === 'officer');

  const removeFriendEntry = async (friendUid: string) => {
    if (friendsBusy || !me.uid) return;
    setFriendsBusy(true);
    setFriendsError(null);
    try {
      await removeFriend(me.uid, friendUid);
      await refreshFriendsData();
    } catch {
      setFriendsError('Failed to remove friend.');
    } finally {
      setFriendsBusy(false);
    }
  };

  const openProfileCard = (_uid: string, _source: string) => {
    if (!_uid) return;
    setActiveProfileUid(_uid);
  };

  const handleTouchStart = (event: NativeSyntheticEvent<NativeTouchEvent>) => {
    if (Platform.OS === 'web') return;
    touchStartRef.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    };
  };

  const handleTouchEnd = (event: NativeSyntheticEvent<NativeTouchEvent>) => {
    if (Platform.OS === 'web') return;
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const deltaX = event.nativeEvent.pageX - start.x;
    const deltaY = event.nativeEvent.pageY - start.y;
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    setSubTab(current => shiftSocialTab(current, deltaX < 0 ? 1 : -1));
  };

  const isChatLoading = subTab === 'chat' && !chatLoadedOnce;
  const isFriendsLoading = subTab === 'friends' && !friendsLoadedOnce;
  const isGuildLoading = subTab === 'guild' && !guildLoadedOnce;
  const subTabTranslateY = sectionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });

  return (
    <View style={styles.root} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <View style={styles.heroCard}>
        <View style={styles.heroTitleRow}>
          <Text style={styles.heroTitle}>Social Nexus</Text>
          <Text style={styles.heroPulse}>{socialPulse}</Text>
        </View>
        <Text style={styles.heroSubtitle}>
          Build alliances, coordinate your guild, and stay visible in global chat.
        </Text>
        <View style={styles.heroMetaRow}>
          <View style={styles.heroChip}>
            <Text style={styles.heroChipLabel}>Online</Text>
            <Text style={styles.heroChipValue}>{onlineCount}</Text>
          </View>
          <View style={styles.heroChip}>
            <Text style={styles.heroChipLabel}>Requests</Text>
            <Text style={styles.heroChipValue}>{pendingRequests.length}</Text>
          </View>
          <View style={styles.heroChipWide}>
            <Text style={styles.heroChipLabel}>Guild</Text>
            <Text style={styles.heroChipValue}>{activeGuildLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.subTabRow} accessibilityRole="tablist">
        <Pressable
          style={[styles.subTabBtn, subTab === 'chat' && styles.subTabBtnActive]}
          onPress={() => setSubTab('chat')}
          accessibilityRole="tab"
          accessibilityState={{ selected: subTab === 'chat' }}
          accessibilityLabel="Global chat tab"
        >
          <Text style={[styles.subTabText, subTab === 'chat' && styles.subTabTextActive]}>Global Chat</Text>
        </Pressable>
        <Pressable
          style={[styles.subTabBtn, subTab === 'friends' && styles.subTabBtnActive]}
          onPress={() => setSubTab('friends')}
          accessibilityRole="tab"
          accessibilityState={{ selected: subTab === 'friends' }}
          accessibilityLabel="Friends tab"
        >
          {!!pendingRequests.length && <View style={styles.subTabDot} />}
          <Text style={[styles.subTabText, subTab === 'friends' && styles.subTabTextActive]}>
            Friends{pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.subTabBtn, subTab === 'guild' && styles.subTabBtnActive]}
          onPress={() => setSubTab('guild')}
          accessibilityRole="tab"
          accessibilityState={{ selected: subTab === 'guild' }}
          accessibilityLabel="Guild operations tab"
        >
          <Text style={[styles.subTabText, subTab === 'guild' && styles.subTabTextActive]}>Guild Ops</Text>
        </Pressable>
      </View>

      <Animated.View
        style={[
          styles.sectionTransition,
          {
            opacity: sectionAnim,
            transform: [{ translateY: subTabTranslateY }],
          },
        ]}
      >
        {subTab === 'chat' && (
          <ChatSection
            styles={styles}
            onlineCount={onlineCount}
            mutedUntil={mutedUntil}
            messages={messages}
            guildMessages={guildChat}
            hasGuild={!!myGuild?.guildId}
            meUid={me.uid}
            isAdmin={isAdmin}
            sending={sending}
            guildSending={guildBusy}
            draft={draft}
            setDraft={setDraft}
            guildDraft={guildChatDraft}
            setGuildDraft={setGuildChatDraft}
            isLoading={isChatLoading}
            error={chatError}
            guildError={guildError}
            formatTime={formatTime}
            onSend={send}
            onSendGuild={sendGuildFromChat}
            onOpenUserMenu={setActiveUserMenu}
            onOpenProfile={uid => void openProfileCard(uid, 'chat_row_tap')}
            onToggleReaction={toggleReaction}
            onMute={muteWithDuration}
            meDisplayName={me.name}
            meLevel={me.level}
          />
        )}

        {subTab === 'friends' && (
          <FriendsSection
            styles={styles}
            myGiftPreference={myGiftPreference}
            friendsBusy={friendsBusy}
            isLoading={isFriendsLoading}
            friendsError={friendsError}
            friendSearch={friendSearch}
            setFriendSearch={setFriendSearch}
            pendingRequests={pendingRequests}
            friends={friends}
            giftCooldowns={giftCooldowns}
            giftIcon={giftIcon}
            isSameUtcDay={isSameUtcDay}
            timeUntilNextUtcMidnightLabel={timeUntilNextUtcMidnightLabel}
            onUpdatePreference={updatePreference}
            onSendRequest={sendRequest}
            onAcceptRequest={acceptRequest}
            onDeclineRequest={declineRequest}
            onSendDailyGift={sendDailyGift}
            onRemoveFriend={removeFriendEntry}
            onRetryLoad={refreshFriendsData}
            onViewProfile={uid => void openProfileCard(uid, 'friends_row')}
          />
        )}

        {subTab === 'guild' && (
          <GuildSection
            styles={styles}
            me={{ uid: me.uid, name: me.name, level: me.level }}
            diamonds={diamonds}
            saveSlotId={saveSlotId}
            peakProgress={Math.max(1, Math.floor(highestWaveReached || 1))}
            error={guildError}
            isLoading={isGuildLoading}
            guildBusy={guildBusy}
            guildNameInput={guildNameInput}
            setGuildNameInput={setGuildNameInput}
            guildTagInput={guildTagInput}
            setGuildTagInput={setGuildTagInput}
            guildDescInput={guildDescInput}
            setGuildDescInput={setGuildDescInput}
            guildSearchInput={guildSearchInput}
            setGuildSearchInput={setGuildSearchInput}
            guildSubTab={guildSubTab}
            setGuildSubTab={setGuildSubTab}
            guildList={guildList}
            myGuild={myGuild}
            guildMembers={guildMembers}
            guildBoss={guildBoss}
            setGuildBoss={setGuildBoss}
            guildEvents={guildEvents}
            setError={setGuildError}
            setGuildBusy={setGuildBusy}
            refreshGuildData={refreshGuildData}
            setConfirmKickMember={setConfirmKickMember}
            setConfirmTransferLeader={setConfirmTransferLeader}
            setConfirmDisbandGuild={setConfirmDisbandGuild}
            onViewProfile={uid => void openProfileCard(uid, 'guild_row')}
          />
        )}
      </Animated.View>

      <Modal visible={!!activeUserMenu} transparent animationType="fade" onRequestClose={() => setActiveUserMenu(null)}>
        <Pressable style={styles.userMenuBackdrop} onPress={() => setActiveUserMenu(null)}>
          <Pressable style={styles.userMenuCard} onPress={() => {}}>
            <Text style={styles.cardTitle}>{activeUserMenu?.displayName ?? 'Player'}</Text>
            <Text style={styles.metaText}>
              Lv.{activeUserMenu?.level ?? 1} VIP {activeUserMenu?.vipLevel ?? 0}
              {activeUserMenu?.guildTag ? ` • Guild [${activeUserMenu.guildTag}]` : ''}
            </Text>
            <Pressable
              style={[styles.sendBtn, !canAddFriendFromMenu && styles.sendBtnDisabled]}
              onPress={async () => {
                if (!me.uid || !activeUserMenu?.displayName || !canAddFriendFromMenu) return;
                setFriendsBusy(true);
                setFriendsError(null);
                try {
                  await sendFriendRequest(me.uid, me.name, activeUserMenu.displayName);
                  setActiveUserRelationship('outgoing');
                } catch (err) {
                  const msg = err instanceof Error ? err.message : 'Failed to send friend request.';
                  setFriendsError(msg);
                } finally {
                  setFriendsBusy(false);
                  setActiveUserMenu(null);
                }
              }}
              disabled={!canAddFriendFromMenu}
            >
              <Text style={styles.sendBtnText}>{addFriendLabel}</Text>
            </Pressable>
            {!!activeUserMenu?.uid && (
              <Pressable
                style={styles.smallBtn}
                onPress={() => {
                  void openProfileCard(activeUserMenu.uid, 'chat_user_menu');
                  setActiveUserMenu(null);
                }}
              >
                <Text style={styles.smallBtnText}>View Profile</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <ProfileModal
        targetUid={activeProfileUid}
        meUid={me.uid}
        meName={me.name}
        meLevel={me.level}
        meVipLevel={me.vipLevel}
        meHighestWave={highestWaveReached}
        canInviteToGuild={canInviteToGuild}
        socialSubTab={subTab}
        onClose={() => setActiveProfileUid(null)}
      />

      <Modal
        visible={!!confirmKickMember}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmKickMember(null)}
      >
        <Pressable style={styles.confirmBackdrop} onPress={() => setConfirmKickMember(null)}>
          <Pressable style={styles.confirmCard} onPress={() => {}}>
            <Text style={styles.confirmTitle}>Confirm Kick Member</Text>
            <Text style={styles.confirmText}>
              Are you sure you want to kick {confirmKickMember?.displayName} from the guild?
            </Text>
            <Text style={styles.confirmWarning}>
              This action cannot be undone. They can rejoin if the guild accepts them.
            </Text>
            <View style={styles.confirmButtonRow}>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnCancel]}
                disabled={guildBusy}
                onPress={() => setConfirmKickMember(null)}
              >
                <Text style={styles.confirmBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnDanger]}
                disabled={guildBusy}
                onPress={async () => {
                  if (!me.uid || !confirmKickMember) return;
                  setGuildBusy(true);
                  setGuildError(null);
                  try {
                    await kickGuildMember({ actorUid: me.uid, targetUid: confirmKickMember.uid });
                    await refreshGuildData();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Failed to kick member.';
                    setGuildError(msg);
                  } finally {
                    setGuildBusy(false);
                    setConfirmKickMember(null);
                  }
                }}
              >
                <Text style={styles.confirmBtnText}>{guildBusy ? 'Kicking...' : 'Kick Member'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!confirmTransferLeader}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmTransferLeader(null)}
      >
        <Pressable style={styles.confirmBackdrop} onPress={() => setConfirmTransferLeader(null)}>
          <Pressable style={styles.confirmCard} onPress={() => {}}>
            <Text style={styles.confirmTitle}>Transfer Leadership</Text>
            <Text style={styles.confirmText}>Transfer leadership to {confirmTransferLeader?.displayName}?</Text>
            <Text style={styles.confirmWarning}>
              ⚠️ This is a one-way action. {confirmTransferLeader?.displayName} will become the new leader. You will
              lose all leader powers unless they grant them back.
            </Text>
            <View style={styles.confirmButtonRow}>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnCancel]}
                disabled={guildBusy}
                onPress={() => setConfirmTransferLeader(null)}
              >
                <Text style={styles.confirmBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnDanger]}
                disabled={guildBusy}
                onPress={async () => {
                  if (!me.uid || !confirmTransferLeader) return;
                  setGuildBusy(true);
                  setGuildError(null);
                  try {
                    await transferGuildLeadership({ actorUid: me.uid, newLeaderUid: confirmTransferLeader.uid });
                    await refreshGuildData();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Failed to transfer leadership.';
                    setGuildError(msg);
                  } finally {
                    setGuildBusy(false);
                    setConfirmTransferLeader(null);
                  }
                }}
              >
                <Text style={styles.confirmBtnText}>{guildBusy ? 'Transferring...' : 'Transfer'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={confirmDisbandGuild}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDisbandGuild(false)}
      >
        <Pressable style={styles.confirmBackdrop} onPress={() => setConfirmDisbandGuild(false)}>
          <Pressable style={styles.confirmCard} onPress={() => {}}>
            <Text style={styles.confirmTitleDanger}>⚠️ DISBAND GUILD ⚠️</Text>
            <Text style={styles.confirmText}>Permanently disband {myGuild?.name}?</Text>
            <Text style={styles.confirmWarning}>
              This action is IRREVERSIBLE. All guild data will be lost including:
            </Text>
            <Text style={styles.confirmWarning}>• Guild members ({myGuild?.memberCount})</Text>
            <Text style={styles.confirmWarning}>• Guild treasury and assets</Text>
            <Text style={styles.confirmWarning}>• All guild history and records</Text>
            <Text style={styles.confirmWarning}>Make sure you have backed up any important data.</Text>
            <View style={styles.confirmButtonRow}>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnCancel]}
                disabled={guildBusy}
                onPress={() => setConfirmDisbandGuild(false)}
              >
                <Text style={styles.confirmBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnDanger]}
                disabled={guildBusy}
                onPress={async () => {
                  if (!me.uid) return;
                  setGuildBusy(true);
                  setGuildError(null);
                  try {
                    await disbandGuild({ actorUid: me.uid });
                    await refreshGuildData();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Failed to disband guild.';
                    setGuildError(msg);
                  } finally {
                    setGuildBusy(false);
                    setConfirmDisbandGuild(false);
                  }
                }}
              >
                <Text style={styles.confirmBtnText}>{guildBusy ? 'Disbanding...' : 'DISBAND GUILD'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    gap: 12,
  },
  sectionTransition: {
    gap: 12,
  },
  heroCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#2A5A84',
    backgroundColor: '#0E1A2A',
    padding: 14,
    gap: 10,
  },
  heroTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroTitle: {
    color: '#E9F4FF',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  heroPulse: {
    color: '#A4FFD6',
    backgroundColor: 'rgba(40, 140, 105, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(125, 234, 188, 0.45)',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  heroSubtitle: {
    color: '#9EC1DE',
    fontSize: 12,
    lineHeight: 18,
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  heroChip: {
    minWidth: 88,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#33526D',
    backgroundColor: '#142436',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  heroChipWide: {
    flex: 1,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#33526D',
    backgroundColor: '#142436',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  heroChipLabel: {
    color: '#9CB9D1',
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  heroChipValue: {
    color: '#F1FAFF',
    fontSize: 12,
    fontWeight: '800',
  },
  subTabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  subTabBtn: {
    position: 'relative',
    flex: 1,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#314B63',
    minHeight: 46,
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101D2B',
  },
  subTabBtnActive: {
    borderColor: '#83D0FF',
    backgroundColor: '#17314A',
    shadowColor: '#56B4FF',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  subTabDot: {
    position: 'absolute',
    top: 5,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: '#FF5A7A',
  },
  subTabText: {
    color: '#AFC3D6',
    fontWeight: '700',
    fontSize: 11,
    textAlign: 'center',
  },
  subTabTextActive: {
    color: '#F2FAFF',
  },
  card: {
    backgroundColor: '#111D2A',
    borderWidth: 1,
    borderColor: '#2B4258',
    borderRadius: RADIUS.lg,
    padding: 12,
    gap: 10,
  },
  chatListCard: {
    minHeight: 260,
    maxHeight: 360,
    backgroundColor: '#0B1520',
  },
  chatShell: {
    minHeight: 430,
    maxHeight: 560,
    backgroundColor: '#0B1520',
    padding: 10,
  },
  chatChannelRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 2,
  },
  chatChannelChip: {
    position: 'relative',
    borderWidth: 1,
    borderColor: '#2F4C64',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#0E1F2E',
  },
  chatChannelChipActive: {
    borderColor: '#7EC8FF',
    backgroundColor: '#1A3550',
  },
  chatChannelChipText: {
    color: '#98BCD8',
    fontSize: 11,
    fontWeight: '700',
  },
  chatChannelChipTextActive: {
    color: '#EAF7FF',
  },
  chatChannelBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF5A7A',
    borderWidth: 1,
    borderColor: '#FFD2DC',
    paddingHorizontal: 4,
  },
  chatChannelBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  chatStreamArea: {
    flex: 1,
    minHeight: 220,
    borderWidth: 1,
    borderColor: '#284158',
    borderRadius: RADIUS.md,
    backgroundColor: '#0E1A28',
    overflow: 'hidden',
  },
  chatStreamList: {
    flex: 1,
  },
  chatStreamContent: {
    padding: 8,
    paddingBottom: 12,
  },
  chatDayDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 8,
  },
  chatDayDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2A445B',
  },
  chatDayDividerText: {
    color: '#8EAFC7',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chatComposerWrap: {
    borderTopWidth: 1,
    borderTopColor: '#2E4B63',
    paddingTop: 8,
    gap: 8,
  },
  chatJumpToLatestBtn: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#6EB7EA',
    backgroundColor: '#16344B',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 6,
  },
  chatJumpToLatestText: {
    color: '#DDF3FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  chatComposerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatComposerInput: {
    flex: 1,
    minHeight: 40,
  },
  cardTitle: {
    color: '#E8F3FF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  metaText: {
    color: '#9AB4CA',
    fontSize: 12,
  },
  asyncInlineContainer: {
    borderWidth: 1,
    borderColor: '#2F465D',
    borderRadius: RADIUS.md,
    backgroundColor: '#0E1B29',
    padding: 10,
    gap: 6,
  },
  asyncInlineTitle: {
    color: '#E8F3FF',
    fontSize: 13,
    fontWeight: '700',
  },
  skeletonStack: {
    gap: 8,
    marginTop: 2,
  },
  skeletonBlock: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#1F3247',
    borderWidth: 1,
    borderColor: '#2C465F',
  },
  skeletonBlockShort: {
    width: '62%',
  },
  skeletonBlockMedium: {
    width: '78%',
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  metricChip: {
    minWidth: 96,
    flex: 1,
    borderWidth: 1,
    borderColor: '#2E4E68',
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#0D1A28',
    gap: 2,
  },
  metricLabel: {
    color: '#99BAD3',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricValue: {
    color: '#E7F5FF',
    fontSize: 12,
    fontWeight: '800',
  },
  cooldownText: {
    color: '#9DD8FF',
    fontSize: 11,
    marginTop: 3,
  },
  mutedText: {
    color: '#F9D66D',
    fontSize: 12,
    fontWeight: '700',
  },
  chatRow: {
    borderWidth: 1,
    borderColor: '#2A415A',
    borderRadius: RADIUS.md,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#121F2E',
  },
  chatRowCompact: {
    marginTop: -6,
    paddingTop: 6,
  },
  chatRowMine: {
    borderColor: '#7CC3FF',
    backgroundColor: '#1A2F45',
  },
  chatHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
    gap: 8,
  },
  chatName: {
    flex: 1,
    flexShrink: 1,
    color: '#EAF6FF',
    fontWeight: '700',
    fontSize: 12,
  },
  chatTime: {
    color: '#87A6BF',
    fontSize: 11,
  },
  chatTimeCompact: {
    color: '#7396B4',
    fontSize: 10,
    marginBottom: 3,
    fontWeight: '700',
  },
  chatText: {
    color: '#D5E6F5',
    fontSize: 13,
    lineHeight: 19,
  },
  reactionRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 7,
    flexWrap: 'wrap',
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#3A5E79',
    borderRadius: 999,
    minHeight: 30,
    minWidth: 38,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#162B3D',
  },
  reactionChipActive: {
    borderColor: '#8AD0FF',
    backgroundColor: '#214661',
  },
  reactionChipText: {
    color: '#EAF7FF',
    fontSize: 11,
    fontWeight: '700',
  },
  reactionChipCount: {
    color: '#B6D8EF',
    fontSize: 10,
    fontWeight: '800',
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
  muteActionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  muteBtnPerm: {
    borderColor: '#FFA23D',
  },
  muteBtnText: {
    color: '#FF96A3',
    fontWeight: '700',
    fontSize: 11,
  },
  input: {
    borderWidth: 1,
    borderColor: '#33506A',
    borderRadius: RADIUS.md,
    backgroundColor: '#091320',
    color: '#E8F5FF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendBtn: {
    alignSelf: 'flex-end',
    borderRadius: RADIUS.md,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#67E6B6',
    backgroundColor: '#79F0C6',
  },
  sendBtnPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    color: '#053024',
    fontWeight: '800',
    fontSize: 12,
  },
  errorText: {
    color: '#FF8694',
    fontSize: 12,
  },
  prefRow: {
    flexDirection: 'row',
    gap: 8,
  },
  prefBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#304960',
    borderRadius: RADIUS.md,
    minHeight: 44,
    paddingVertical: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E1A29',
  },
  prefBtnActive: {
    borderColor: '#8CCBFF',
    backgroundColor: '#1C3550',
  },
  prefBtnText: {
    color: '#DCEEFF',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  friendRow: {
    borderWidth: 1,
    borderColor: '#2F465D',
    borderRadius: RADIUS.md,
    padding: 9,
    backgroundColor: '#122133',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
  },
  friendMeta: {
    flex: 1,
  },
  friendName: {
    color: '#E8F5FF',
    fontWeight: '700',
    fontSize: 13,
  },
  friendActions: {
    flexDirection: 'row',
    gap: 8,
  },
  sectionLabel: {
    color: '#B6D8F1',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statusDotReady: {
    backgroundColor: '#67E6B6',
  },
  statusDotCooldown: {
    backgroundColor: '#F9D66D',
  },
  statusText: {
    color: '#C6E2F5',
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadge: {
    color: '#E2F3FF',
    borderWidth: 1,
    borderColor: '#4F7898',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: '#1B334A',
    overflow: 'hidden',
  },
  progressBlock: {
    gap: 6,
    marginTop: 4,
  },
  progressLabel: {
    color: '#A7C8DF',
    fontSize: 11,
    fontWeight: '700',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: '#12283A',
    borderWidth: 1,
    borderColor: '#2A4B66',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#7EC8FF',
  },
  smallBtn: {
    borderWidth: 1,
    borderColor: '#7EC8FF',
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1B3C5C',
  },
  smallBtnDanger: {
    borderColor: '#FF7A90',
    backgroundColor: '#4D2230',
  },
  smallBtnText: {
    color: '#F2FAFF',
    fontWeight: '700',
    fontSize: 12,
  },
  smallBtnPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.88,
  },
  userMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 8, 16, 0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  userMenuCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#132133',
    borderWidth: 1,
    borderColor: '#35516A',
    borderRadius: RADIUS.lg,
    padding: 12,
    gap: 10,
  },
  profileCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#132133',
    borderWidth: 1,
    borderColor: '#35516A',
    borderRadius: RADIUS.lg,
    padding: 14,
    gap: 10,
  },
  profileName: {
    color: '#EAF6FF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  profileTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  profileTag: {
    color: '#DDF5FF',
    borderWidth: 1,
    borderColor: '#4B7695',
    borderRadius: 999,
    backgroundColor: '#17334A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
  },
  compareCard: {
    borderWidth: 1,
    borderColor: '#3C5D77',
    borderRadius: RADIUS.md,
    backgroundColor: '#102636',
    padding: 10,
    gap: 4,
  },
  compareTitle: {
    color: '#E7F4FF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 8, 16, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#132133',
    borderWidth: 1,
    borderColor: '#35516A',
    borderRadius: RADIUS.lg,
    padding: 16,
    gap: 12,
  },
  confirmTitle: {
    color: THEME.text.primary,
    fontSize: 17,
    fontWeight: '800',
  },
  confirmTitleDanger: {
    color: '#FF5555',
    fontSize: 17,
    fontWeight: '800',
  },
  confirmText: {
    color: '#C8DAEA',
    fontSize: 14,
  },
  confirmWarning: {
    color: '#FFB347',
    fontSize: 12,
  },
  confirmButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  confirmBtn: {
    flex: 1,
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  confirmBtnCancel: {
    borderWidth: 1,
    borderColor: '#46627B',
    backgroundColor: '#1A2A3D',
  },
  confirmBtnDanger: {
    backgroundColor: THEME.status.error,
  },
  confirmBtnText: {
    fontWeight: '800',
    fontSize: 12,
    color: '#FFFFFF',
  },
});
