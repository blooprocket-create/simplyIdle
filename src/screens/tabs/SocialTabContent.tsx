import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
  subscribeGuildChat,
  transferGuildLeadership,
} from '../../services/guild';
import { ChatSection } from './social/ChatSection';
import { FriendsSection } from './social/FriendsSection';
import { GuildSection } from './social/GuildSection';

export interface SocialTabContentProps {
  tab: string;
  accountName: string;
  publicUsername: string;
  level: number;
  vipLevel: number;
  diamonds: number;
  saveSlotId: string;
  isAdmin: boolean;
  onPendingRequestsCountChange?: (count: number) => void;
}

type SocialSubTab = 'chat' | 'friends' | 'guild';
type GuildSubTab = 'home' | 'boss' | 'events' | 'chat';

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

export function SocialTabContent({
  tab,
  accountName,
  publicUsername,
  level,
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutedUntil, setMutedUntil] = useState<number | null>(null);
  const [lastSendAt, setLastSendAt] = useState(0);
  const [friendsBusy, setFriendsBusy] = useState(false);
  const [guildBusy, setGuildBusy] = useState(false);
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
    if (tab !== 'social') return;
    if (!me.uid) {
      setMyGuild(null);
      return;
    }

    let cancelled = false;
    const refreshMembership = () => {
      void fetchGuildInfo(me.uid)
        .then(guildInfo => {
          if (!cancelled) setMyGuild(guildInfo);
        })
        .catch(() => {});
    };

    refreshMembership();
    const timer = setInterval(refreshMembership, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
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

  useEffect(() => {
    if (tab !== 'social' || subTab !== 'guild' || !me.uid) return;

    const refresh = async () => {
      try {
        const [guildInfo, browseRows] = await Promise.all([
          fetchGuildInfo(me.uid),
          fetchGuildBrowse(guildSearchInput),
        ]);
        setMyGuild(guildInfo);
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
      } catch {
        setError('Failed to load guild data.');
      }
    };

    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 20_000);
    return () => clearInterval(timer);
  }, [guildSearchInput, me.uid, subTab, tab]);

  useEffect(() => {
    if (tab !== 'social' || subTab !== 'guild' || !me.uid || !myGuild?.guildId) return;
    const stop = subscribeGuildChat(me.uid, setGuildChat);
    return stop;
  }, [me.uid, myGuild?.guildId, subTab, tab]);

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
      await sendChatMessage(me.uid, me.name, me.level, draft, me.vipLevel);
      setDraft('');
      setLastSendAt(now);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send message.';
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  const muteWithDuration = async (targetUid: string, durationMs: number, reason: string) => {
    if (!isAdmin || !me.uid || !targetUid || targetUid === me.uid) return;
    try {
      await muteUser(targetUid, me.uid, durationMs, reason);
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

  const refreshGuildData = async () => {
    if (!me.uid) return;
    const [guildInfo, browseRows] = await Promise.all([
      fetchGuildInfo(me.uid),
      fetchGuildBrowse(guildSearchInput),
    ]);
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
  };

  const addFriendLabel = activeUserRelationship === 'friends'
    ? 'Already Friends'
    : activeUserRelationship === 'outgoing'
      ? 'Request Sent'
      : activeUserRelationship === 'incoming'
        ? 'Incoming Request'
        : 'Add Friend';

  const canAddFriendFromMenu =
    !!activeUserMenu
    && activeUserMenu.uid !== me.uid
    && activeUserRelationship === 'none'
    && !friendsBusy;

  const socialPulse = mutedUntil && mutedUntil > Date.now()
    ? 'Muted'
    : sending || friendsBusy || guildBusy
      ? 'Syncing'
      : 'Live';

  const activeGuildLabel = myGuild ? `[${myGuild.tag}] ${myGuild.name}` : 'No Guild';

  const removeFriendEntry = async (friendUid: string) => {
    if (friendsBusy || !me.uid) return;
    setFriendsBusy(true);
    setError(null);
    try {
      await removeFriend(me.uid, friendUid);
      await refreshFriendsData();
    } catch {
      setError('Failed to remove friend.');
    } finally {
      setFriendsBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.heroCard}>
        <View style={styles.heroTitleRow}>
          <Text style={styles.heroTitle}>Social Nexus</Text>
          <Text style={styles.heroPulse}>{socialPulse}</Text>
        </View>
        <Text style={styles.heroSubtitle}>Build alliances, coordinate your guild, and stay visible in global chat.</Text>
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

      <View style={styles.subTabRow}>
        <Pressable style={[styles.subTabBtn, subTab === 'chat' && styles.subTabBtnActive]} onPress={() => setSubTab('chat')}>
          <Text style={[styles.subTabText, subTab === 'chat' && styles.subTabTextActive]}>Chat</Text>
        </Pressable>
        <Pressable style={[styles.subTabBtn, subTab === 'friends' && styles.subTabBtnActive]} onPress={() => setSubTab('friends')}>
          {!!pendingRequests.length && <View style={styles.subTabDot} />}
          <Text style={[styles.subTabText, subTab === 'friends' && styles.subTabTextActive]}>Friends</Text>
        </Pressable>
        <Pressable style={[styles.subTabBtn, subTab === 'guild' && styles.subTabBtnActive]} onPress={() => setSubTab('guild')}>
          <Text style={[styles.subTabText, subTab === 'guild' && styles.subTabTextActive]}>Guild</Text>
        </Pressable>
      </View>

      {subTab === 'chat' && (
        <ChatSection
          styles={styles}
          onlineCount={onlineCount}
          mutedUntil={mutedUntil}
          messages={messages}
          meUid={me.uid}
          isAdmin={isAdmin}
          sending={sending}
          draft={draft}
          setDraft={setDraft}
          error={error}
          formatTime={formatTime}
          onSend={send}
          onOpenUserMenu={setActiveUserMenu}
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
        />
      )}

      {subTab === 'guild' && (
        <GuildSection
          styles={styles}
          me={{ uid: me.uid, name: me.name, level: me.level }}
          diamonds={diamonds}
          saveSlotId={saveSlotId}
          level={level}
          error={error}
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
          guildChat={guildChat}
          guildChatDraft={guildChatDraft}
          setGuildChatDraft={setGuildChatDraft}
          setError={setError}
          setGuildBusy={setGuildBusy}
          refreshGuildData={refreshGuildData}
          formatTime={formatTime}
          setConfirmKickMember={setConfirmKickMember}
          setConfirmTransferLeader={setConfirmTransferLeader}
          setConfirmDisbandGuild={setConfirmDisbandGuild}
        />
      )}

      <Modal
        visible={!!activeUserMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveUserMenu(null)}
      >
        <Pressable style={styles.userMenuBackdrop} onPress={() => setActiveUserMenu(null)}>
          <Pressable style={styles.userMenuCard} onPress={() => {}}>
            <Text style={styles.cardTitle}>{activeUserMenu?.displayName ?? 'Player'}</Text>
            <Text style={styles.metaText}>
              Lv.{activeUserMenu?.level ?? 1} VIP {activeUserMenu?.vipLevel ?? 0}{activeUserMenu?.guildTag ? ` • Guild [${activeUserMenu.guildTag}]` : ''}
            </Text>
            <Pressable
              style={[styles.sendBtn, !canAddFriendFromMenu && styles.sendBtnDisabled]}
              onPress={async () => {
                if (!me.uid || !activeUserMenu?.displayName || !canAddFriendFromMenu) return;
                setFriendsBusy(true);
                setError(null);
                try {
                  await sendFriendRequest(me.uid, me.name, activeUserMenu.displayName);
                  setActiveUserRelationship('outgoing');
                } catch (err) {
                  const msg = err instanceof Error ? err.message : 'Failed to send friend request.';
                  setError(msg);
                } finally {
                  setFriendsBusy(false);
                  setActiveUserMenu(null);
                }
              }}
              disabled={!canAddFriendFromMenu}
            >
              <Text style={styles.sendBtnText}>{addFriendLabel}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!confirmKickMember}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmKickMember(null)}
      >
        <Pressable style={styles.confirmBackdrop} onPress={() => setConfirmKickMember(null)}>
          <Pressable style={styles.confirmCard} onPress={() => {}}>
            <Text style={styles.confirmTitle}>Confirm Kick Member</Text>
            <Text style={styles.confirmText}>Are you sure you want to kick {confirmKickMember?.displayName} from the guild?</Text>
            <Text style={styles.confirmWarning}>This action cannot be undone. They can rejoin if the guild accepts them.</Text>
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
                  setError(null);
                  try {
                    await kickGuildMember({ actorUid: me.uid, targetUid: confirmKickMember.uid });
                    await refreshGuildData();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Failed to kick member.';
                    setError(msg);
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
            <Text style={styles.confirmWarning}>⚠️ This is a one-way action. {confirmTransferLeader?.displayName} will become the new leader. You will lose all leader powers unless they grant them back.</Text>
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
                  setError(null);
                  try {
                    await transferGuildLeadership({ actorUid: me.uid, newLeaderUid: confirmTransferLeader.uid });
                    await refreshGuildData();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Failed to transfer leadership.';
                    setError(msg);
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
            <Text style={styles.confirmWarning}>This action is IRREVERSIBLE. All guild data will be lost including:</Text>
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
                  setError(null);
                  try {
                    await disbandGuild({ actorUid: me.uid });
                    await refreshGuildData();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Failed to disband guild.';
                    setError(msg);
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
}

const styles = StyleSheet.create({
  root: {
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
    paddingVertical: 9,
    alignItems: 'center',
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
    fontSize: 12,
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
  chatRowMine: {
    borderColor: '#7CC3FF',
    backgroundColor: '#1A2F45',
  },
  chatHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
    gap: 8,
  },
  chatName: {
    flex: 1,
    color: '#EAF6FF',
    fontWeight: '700',
    fontSize: 12,
  },
  chatTime: {
    color: '#87A6BF',
    fontSize: 11,
  },
  chatText: {
    color: '#D5E6F5',
    fontSize: 13,
    lineHeight: 19,
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
    paddingVertical: 8,
    alignItems: 'center',
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
