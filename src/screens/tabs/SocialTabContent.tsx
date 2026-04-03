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
import {
  acceptFriendRequest,
  declineFriendRequest,
  fetchFriends,
  fetchGiftCooldowns,
  fetchPendingRequests,
  fetchFriendProfile,
  removeFriend,
  sendFriendRequest,
  sendGift,
  setGiftPreference,
  FriendListEntry,
  PendingFriendRequest,
} from '../../services/friends';
import { GiftPreference } from '../../gameConfig';

export interface SocialTabContentProps {
  tab: string;
  accountName: string;
  publicUsername: string;
  level: number;
  isAdmin: boolean;
  onPendingRequestsCountChange?: (count: number) => void;
}

type SocialSubTab = 'chat' | 'friends' | 'guild';

function formatTime(ts: number): string {
  const date = new Date(ts);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function giftIcon(pref: GiftPreference): string {
  if (pref === 'shards') return '💎';
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

export function SocialTabContent({
  tab,
  accountName,
  publicUsername,
  level,
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutedUntil, setMutedUntil] = useState<number | null>(null);
  const [lastSendAt, setLastSendAt] = useState(0);
  const [friendsBusy, setFriendsBusy] = useState(false);

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

  useEffect(() => {
    onPendingRequestsCountChange?.(pendingRequests.length);
  }, [onPendingRequestsCountChange, pendingRequests.length]);

  useEffect(() => {
    if (tab !== 'social' || subTab !== 'friends' || !me.uid) return;

    const refresh = async () => {
      try {
        const [friendRows, pendingRows, cooldownRows, myProfile] = await Promise.all([
          fetchFriends(me.uid),
          fetchPendingRequests(me.uid),
          fetchGiftCooldowns(me.uid),
          fetchFriendProfile(me.uid),
        ]);
        setFriends(friendRows);
        setPendingRequests(pendingRows);
        setGiftCooldowns(cooldownRows);
        if (myProfile?.giftPreference) setMyGiftPreference(myProfile.giftPreference);
      } catch {
        setError('Failed to load friends data.');
      }
    };

    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 20_000);
    return () => clearInterval(timer);
  }, [tab, subTab, me.uid]);

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

  const refreshFriendsData = async () => {
    if (!me.uid) return;
    const [friendRows, pendingRows, cooldownRows] = await Promise.all([
      fetchFriends(me.uid),
      fetchPendingRequests(me.uid),
      fetchGiftCooldowns(me.uid),
    ]);
    setFriends(friendRows);
    setPendingRequests(pendingRows);
    setGiftCooldowns(cooldownRows);
  };

  const sendRequest = async () => {
    if (!me.uid || !friendSearch.trim() || friendsBusy) return;
    setFriendsBusy(true);
    setError(null);
    try {
      await sendFriendRequest(me.uid, me.name, friendSearch);
      setFriendSearch('');
      await refreshFriendsData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send friend request.';
      setError(msg);
    } finally {
      setFriendsBusy(false);
    }
  };

  const acceptRequest = async (fromUid: string) => {
    if (!me.uid || friendsBusy) return;
    setFriendsBusy(true);
    setError(null);
    try {
      await acceptFriendRequest(me.uid, fromUid);
      await refreshFriendsData();
    } catch {
      setError('Failed to accept request.');
    } finally {
      setFriendsBusy(false);
    }
  };

  const declineRequest = async (fromUid: string) => {
    if (!me.uid || friendsBusy) return;
    setFriendsBusy(true);
    setError(null);
    try {
      await declineFriendRequest(me.uid, fromUid);
      await refreshFriendsData();
    } catch {
      setError('Failed to decline request.');
    } finally {
      setFriendsBusy(false);
    }
  };

  const sendDailyGift = async (friend: FriendListEntry) => {
    if (!me.uid || friendsBusy) return;
    setFriendsBusy(true);
    setError(null);
    try {
      await sendGift(me.uid, me.name, friend.uid, friend.giftPreference);
      await refreshFriendsData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send gift.';
      setError(msg);
    } finally {
      setFriendsBusy(false);
    }
  };

  const updatePreference = async (preference: GiftPreference) => {
    if (!me.uid || friendsBusy) return;
    setFriendsBusy(true);
    setError(null);
    try {
      await setGiftPreference(me.uid, preference);
      setMyGiftPreference(preference);
    } catch {
      setError('Failed to update gift preference.');
    } finally {
      setFriendsBusy(false);
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
        <Pressable style={[styles.subTabBtn, subTab === 'guild' && styles.subTabBtnActive]} onPress={() => setSubTab('guild')}>
          <Text style={[styles.subTabText, subTab === 'guild' && styles.subTabTextActive]}>Guild</Text>
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
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>My Gift Preference</Text>
            <View style={styles.prefRow}>
              {(['gold', 'shards', 'essence'] as GiftPreference[]).map(pref => (
                <Pressable
                  key={pref}
                  style={[styles.prefBtn, myGiftPreference === pref && styles.prefBtnActive]}
                  onPress={() => updatePreference(pref)}
                  disabled={friendsBusy}
                >
                  <Text style={styles.prefBtnText}>{giftIcon(pref)} {pref}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Add Friend</Text>
            <TextInput
              value={friendSearch}
              onChangeText={setFriendSearch}
              placeholder="Public username"
              placeholderTextColor={THEME.text.tertiary}
              style={styles.input}
              maxLength={24}
              editable={!friendsBusy}
              autoCapitalize="none"
            />
            <Pressable
              style={[styles.sendBtn, (!friendSearch.trim() || friendsBusy) && styles.sendBtnDisabled]}
              onPress={sendRequest}
              disabled={!friendSearch.trim() || friendsBusy}
            >
              <Text style={styles.sendBtnText}>Send Request</Text>
            </Pressable>
          </View>

          {pendingRequests.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Pending Requests ({pendingRequests.length})</Text>
              {pendingRequests.map(request => (
                <View key={request.fromUid} style={styles.friendRow}>
                  <Text style={styles.friendName}>👤 {request.fromName}</Text>
                  <View style={styles.friendActions}>
                    <Pressable style={styles.smallBtn} onPress={() => acceptRequest(request.fromUid)} disabled={friendsBusy}>
                      <Text style={styles.smallBtnText}>Accept</Text>
                    </Pressable>
                    <Pressable style={[styles.smallBtn, styles.smallBtnDanger]} onPress={() => declineRequest(request.fromUid)} disabled={friendsBusy}>
                      <Text style={styles.smallBtnText}>Decline</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Friends ({friends.length})</Text>
            {friends.length === 0 && <Text style={styles.metaText}>No friends yet. Add someone by public username.</Text>}
            {friends.map(friend => {
              const cooldownAt = giftCooldowns[friend.uid] ?? 0;
              const giftedToday = isSameUtcDay(cooldownAt, Date.now());
              return (
                <View key={friend.uid} style={styles.friendRow}>
                  <View style={styles.friendMeta}>
                    <Text style={styles.friendName}>{friend.displayName}</Text>
                    <Text style={styles.metaText}>Lv.{friend.level} • Wants {giftIcon(friend.giftPreference)} {friend.giftPreference}</Text>
                    {giftedToday && <Text style={styles.cooldownText}>Next gift in {timeUntilNextUtcMidnightLabel(Date.now())}</Text>}
                  </View>
                  <View style={styles.friendActions}>
                    <Pressable
                      style={[styles.smallBtn, giftedToday && styles.sendBtnDisabled]}
                      onPress={() => sendDailyGift(friend)}
                      disabled={friendsBusy || giftedToday}
                    >
                      <Text style={styles.smallBtnText}>{giftedToday ? 'Gifted' : 'Gift'}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.smallBtn, styles.smallBtnDanger]}
                      onPress={async () => {
                        if (friendsBusy || !me.uid) return;
                        setFriendsBusy(true);
                        setError(null);
                        try {
                          await removeFriend(me.uid, friend.uid);
                          await refreshFriendsData();
                        } catch {
                          setError('Failed to remove friend.');
                        } finally {
                          setFriendsBusy(false);
                        }
                      }}
                      disabled={friendsBusy}
                    >
                      <Text style={styles.smallBtnText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      {subTab === 'guild' && (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Guild Command</Text>
            <Text style={styles.metaText}>Guild will live here as a Social sub-tab with Home, Boss, Events, Guild Chat, and Browse.</Text>
            <Text style={styles.metaText}>Create Guild Cost: 2,500 Diamonds.</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Planned Guild Events</Text>
            <Text style={styles.metaText}>- Guild Boss: shared HP target, rewards delivered to all participants by mail.</Text>
            <Text style={styles.metaText}>- Guild War: 48-hour DPS race against rival guilds.</Text>
            <Text style={styles.metaText}>- Guild Expedition: week-long cooperative milestone campaign.</Text>
          </View>
        </>
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
  cooldownText: {
    color: '#9ED4FF',
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
  prefRow: {
    flexDirection: 'row',
    gap: 8,
  },
  prefBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    borderRadius: RADIUS.sm,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#101726',
  },
  prefBtnActive: {
    borderColor: THEME.status.info,
    backgroundColor: '#1A2A40',
  },
  prefBtnText: {
    color: THEME.text.primary,
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  friendRow: {
    borderWidth: 1,
    borderColor: THEME.surface.border,
    borderRadius: RADIUS.sm,
    padding: 8,
    backgroundColor: '#111626',
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
    color: THEME.text.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  friendActions: {
    flexDirection: 'row',
    gap: 8,
  },
  smallBtn: {
    borderWidth: 1,
    borderColor: THEME.status.info,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#15304A',
  },
  smallBtnDanger: {
    borderColor: THEME.status.error,
    backgroundColor: '#3A1520',
  },
  smallBtnText: {
    color: THEME.text.primary,
    fontWeight: '700',
    fontSize: 12,
  },
});
