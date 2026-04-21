import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, NativeSyntheticEvent, NativeTouchEvent, Platform, Text, View } from 'react-native';
import { GlobalChatMessage } from '../../services/chat';
import { fetchFriendRelationshipStatus, FriendRelationshipStatus, sendFriendRequest } from '../../services/friends';
import { blockUser, unblockUser, reportUser, subscribeBlockList } from '../../services/blockReport';
import { GiftPreference } from '../../gameConfig';
import { trackEvent } from '../../telemetry';
import { SOCIAL_FEATURE_FLAGS } from '../../socialFeatureFlags';
import { FeedbackPressable as Pressable } from '../../components/FeedbackPressable';
import { ChatSection } from './social/ChatSection';
import { FriendsSection } from './social/FriendsSection';
import { GuildSection } from './social/GuildSection';
import { ProfileModal } from './social/ProfileModal';
import { SearchSection } from './social/SearchSection';
import { DMSection } from './social/DMSection';
import { ActivityFeedSection } from './social/ActivityFeedSection';
import { GuildWarsSection } from './social/GuildWarsSection';
import { SocialProvider, useSocialChat, useSocialFriends, useSocialGuild, useSocialMe } from './social/SocialContext';
import { socialStyles as styles } from './social/social.styles';
import { subscribeToDmThreads } from '../../services/directMessages';

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

type SocialSubTab = 'chat' | 'friends' | 'guild' | 'search' | 'dm' | 'feed' | 'wars';

function getSocialTabs(): SocialSubTab[] {
  const tabs: SocialSubTab[] = ['chat', 'friends', 'guild'];
  if (SOCIAL_FEATURE_FLAGS.guildWars) tabs.push('wars');
  if (SOCIAL_FEATURE_FLAGS.playerSearch) tabs.push('search');
  if (SOCIAL_FEATURE_FLAGS.directMessages) tabs.push('dm');
  if (SOCIAL_FEATURE_FLAGS.activityFeed) tabs.push('feed');
  return tabs;
}

// ─── Utility helpers (kept from v1, used by child sections) ──────────────────

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
  const tabs = getSocialTabs();
  const index = tabs.indexOf(current);
  if (index < 0) return current;
  const nextIndex = Math.max(0, Math.min(tabs.length - 1, index + direction));
  return tabs[nextIndex];
}

// ─── Outer shell: wraps with SocialProvider ──────────────────────────────────

export const SocialTabContent = React.memo(function SocialTabContent(props: SocialTabContentProps) {
  if (props.tab !== 'social') return null;

  return (
    <SocialProvider
      accountName={props.accountName}
      publicUsername={props.publicUsername}
      level={props.level}
      vipLevel={props.vipLevel}
      isAdmin={props.isAdmin}
      active={props.tab === 'social'}
    >
      <SocialTabRouter {...props} />
    </SocialProvider>
  );
});

// ─── Inner router: reads from context, routes to sub-sections ────────────────

function SocialTabRouter({
  highestWaveReached,
  diamonds,
  saveSlotId,
  onPendingRequestsCountChange,
}: SocialTabContentProps) {
  const { me, isAdmin } = useSocialMe();
  const chat = useSocialChat();
  const friends = useSocialFriends();
  const guild = useSocialGuild();

  const [subTab, setSubTab] = useState<SocialSubTab>('chat');
  const [activeUserMenu, setActiveUserMenu] = useState<GlobalChatMessage | null>(null);
  const [activeUserRelationship, setActiveUserRelationship] = useState<FriendRelationshipStatus>('none');
  const [activeProfileUid, setActiveProfileUid] = useState<string | null>(null);
  const [friendAddBusy, setFriendAddBusy] = useState(false);
  const [dmUnreadCount, setDmUnreadCount] = useState(0);
  const [blockedUids, setBlockedUids] = useState<Set<string>>(new Set());
  const [menuReportSent, setMenuReportSent] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const sectionAnim = useRef(new Animated.Value(1)).current;

  // Escape key dismiss for user menu modal on web
  useEffect(() => {
    if (Platform.OS !== 'web' || !activeUserMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveUserMenu(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeUserMenu]);

  // Subscribe to DM threads for unread count
  useEffect(() => {
    if (!me.uid || !SOCIAL_FEATURE_FLAGS.directMessages) return;
    const unsub = subscribeToDmThreads(me.uid, threads => {
      const total = threads.reduce((sum, t) => sum + t.unreadCount, 0);
      setDmUnreadCount(total);
    });
    return unsub;
  }, [me.uid]);

  // Subscribe to block list
  useEffect(() => {
    if (!me.uid || !SOCIAL_FEATURE_FLAGS.blockReport) return;
    return subscribeBlockList(me.uid, blocks => {
      setBlockedUids(new Set(blocks.map(b => b.targetUid)));
    });
  }, [me.uid]);

  // Notify parent of pending request count + DM unread count
  useEffect(() => {
    onPendingRequestsCountChange?.(friends.pendingRequests.length + dmUnreadCount);
  }, [onPendingRequestsCountChange, friends.pendingRequests.length, dmUnreadCount]);

  // Animate sub-tab transitions
  useEffect(() => {
    void trackEvent('social_tab_changed', { tab: subTab, mode: 'social' });
    sectionAnim.setValue(0);
    Animated.timing(sectionAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [sectionAnim, subTab]);

  // Fetch relationship for user menu
  useEffect(() => {
    if (!me.uid || !activeUserMenu?.uid) {
      setActiveUserRelationship('none');
      return;
    }
    setMenuReportSent(false);
    void fetchFriendRelationshipStatus(me.uid, activeUserMenu.uid)
      .then(setActiveUserRelationship)
      .catch(() => setActiveUserRelationship('none'));
  }, [activeUserMenu?.uid, me.uid]);

  // ─── Derived state ──────────────────────────────────────────────────────────

  const socialPulse =
    chat.mutedUntil && chat.mutedUntil > Date.now()
      ? 'Muted'
      : chat.sending || friends.friendsBusy || guild.guildBusy
        ? 'Syncing'
        : 'Live';

  const activeGuildLabel = guild.myGuild ? `[${guild.myGuild.tag}] ${guild.myGuild.name}` : 'No Guild';

  const addFriendLabel =
    activeUserRelationship === 'friends'
      ? 'Already Friends'
      : activeUserRelationship === 'outgoing'
        ? 'Request Sent'
        : activeUserRelationship === 'incoming'
          ? 'Incoming Request'
          : 'Add Friend';

  const canAddFriendFromMenu =
    !!activeUserMenu && activeUserMenu.uid !== me.uid && activeUserRelationship === 'none' && !friendAddBusy;

  const subTabTranslateY = sectionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });

  // ─── Swipe gestures ────────────────────────────────────────────────────────

  const handleTouchStart = (event: NativeSyntheticEvent<NativeTouchEvent>) => {
    if (Platform.OS === 'web') return;
    touchStartRef.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
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

  const openProfileCard = (uid: string) => {
    if (!uid) return;
    setActiveProfileUid(uid);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Hero Card */}
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
            <Text style={styles.heroChipValue}>{chat.onlineCount}</Text>
          </View>
          <View style={styles.heroChip}>
            <Text style={styles.heroChipLabel}>Requests</Text>
            <Text style={styles.heroChipValue}>{friends.pendingRequests.length}</Text>
          </View>
          <View style={styles.heroChipWide}>
            <Text style={styles.heroChipLabel}>Guild</Text>
            <Text style={styles.heroChipValue}>{activeGuildLabel}</Text>
          </View>
        </View>
      </View>

      {/* Sub-tab bar */}
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
          {!!friends.pendingRequests.length && <View style={styles.subTabDot} />}
          <Text style={[styles.subTabText, subTab === 'friends' && styles.subTabTextActive]}>
            Friends{friends.pendingRequests.length > 0 ? ` (${friends.pendingRequests.length})` : ''}
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
        {SOCIAL_FEATURE_FLAGS.guildWars && (
          <Pressable
            style={[styles.subTabBtn, subTab === 'wars' && styles.subTabBtnActive]}
            onPress={() => setSubTab('wars')}
            accessibilityRole="tab"
            accessibilityState={{ selected: subTab === 'wars' }}
            accessibilityLabel="Guild wars tab"
          >
            <Text style={[styles.subTabText, subTab === 'wars' && styles.subTabTextActive]}>Wars</Text>
          </Pressable>
        )}
        {SOCIAL_FEATURE_FLAGS.playerSearch && (
          <Pressable
            style={[styles.subTabBtn, subTab === 'search' && styles.subTabBtnActive]}
            onPress={() => setSubTab('search')}
            accessibilityRole="tab"
            accessibilityState={{ selected: subTab === 'search' }}
            accessibilityLabel="Player search tab"
          >
            <Text style={[styles.subTabText, subTab === 'search' && styles.subTabTextActive]}>Search</Text>
          </Pressable>
        )}
        {SOCIAL_FEATURE_FLAGS.directMessages && (
          <Pressable
            style={[styles.subTabBtn, subTab === 'dm' && styles.subTabBtnActive]}
            onPress={() => setSubTab('dm')}
            accessibilityRole="tab"
            accessibilityState={{ selected: subTab === 'dm' }}
            accessibilityLabel={`Direct messages tab${dmUnreadCount > 0 ? `, ${dmUnreadCount} unread` : ''}`}
          >
            <Text style={[styles.subTabText, subTab === 'dm' && styles.subTabTextActive]}>DMs</Text>
            {dmUnreadCount > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: '#B3261E',
                }}
              />
            )}
          </Pressable>
        )}
        {SOCIAL_FEATURE_FLAGS.activityFeed && (
          <Pressable
            style={[styles.subTabBtn, subTab === 'feed' && styles.subTabBtnActive]}
            onPress={() => setSubTab('feed')}
            accessibilityRole="tab"
            accessibilityState={{ selected: subTab === 'feed' }}
            accessibilityLabel="Activity feed tab"
          >
            <Text style={[styles.subTabText, subTab === 'feed' && styles.subTabTextActive]}>Feed</Text>
          </Pressable>
        )}
      </View>

      {/* Active section */}
      <Animated.View
        style={[styles.sectionTransition, { opacity: sectionAnim, transform: [{ translateY: subTabTranslateY }] }]}
      >
        {subTab === 'chat' && (
          <ChatSection
            styles={styles}
            onlineCount={chat.onlineCount}
            mutedUntil={chat.mutedUntil}
            messages={chat.messages}
            guildMessages={chat.guildMessages}
            hasGuild={!!guild.myGuild?.guildId}
            isLoading={!chat.chatLoadedOnce}
            meUid={me.uid}
            isAdmin={isAdmin}
            sending={chat.sending}
            guildSending={chat.guildSending}
            draft={chat.draft}
            setDraft={chat.setDraft}
            guildDraft={chat.guildDraft}
            setGuildDraft={chat.setGuildDraft}
            error={chat.chatError}
            guildError={chat.guildChatError}
            formatTime={formatTime}
            onSend={chat.sendMessage}
            onSendGuild={chat.sendGuildMessage}
            onOpenUserMenu={setActiveUserMenu}
            onOpenProfile={uid => openProfileCard(uid)}
            onToggleReaction={chat.toggleReaction}
            onMute={chat.muteWithDuration}
            meDisplayName={me.name}
            meLevel={me.level}
          />
        )}

        {subTab === 'friends' && (
          <FriendsSection
            styles={styles}
            myGiftPreference={friends.myGiftPreference}
            friendsBusy={friends.friendsBusy}
            isLoading={!friends.friendsLoadedOnce}
            friendsError={friends.friendsError}
            friendSearch={friends.friendSearch}
            setFriendSearch={friends.setFriendSearch}
            pendingRequests={friends.pendingRequests}
            friends={friends.friends}
            giftCooldowns={friends.giftCooldowns}
            giftIcon={giftIcon}
            isSameUtcDay={isSameUtcDay}
            timeUntilNextUtcMidnightLabel={timeUntilNextUtcMidnightLabel}
            onUpdatePreference={friends.updatePreference}
            onSendRequest={friends.sendRequest}
            onAcceptRequest={friends.acceptRequest}
            onDeclineRequest={friends.declineRequest}
            onSendDailyGift={friends.sendDailyGift}
            onRemoveFriend={friends.removeFriendEntry}
            onRetryLoad={friends.refreshFriendsData}
            onViewProfile={uid => openProfileCard(uid)}
          />
        )}

        {subTab === 'guild' && (
          <GuildSection
            styles={styles}
            me={{ uid: me.uid, name: me.name, level: me.level }}
            diamonds={diamonds}
            saveSlotId={saveSlotId}
            peakProgress={Math.max(1, Math.floor(highestWaveReached || 1))}
            error={guild.guildError}
            isLoading={!guild.guildLoadedOnce}
            guildBusy={guild.guildBusy}
            guildNameInput={guild.guildNameInput}
            setGuildNameInput={guild.setGuildNameInput}
            guildTagInput={guild.guildTagInput}
            setGuildTagInput={guild.setGuildTagInput}
            guildDescInput={guild.guildDescInput}
            setGuildDescInput={guild.setGuildDescInput}
            guildSearchInput={guild.guildSearchInput}
            setGuildSearchInput={guild.setGuildSearchInput}
            guildSubTab={guild.guildSubTab}
            setGuildSubTab={guild.setGuildSubTab}
            guildList={guild.guildList}
            myGuild={guild.myGuild}
            guildMembers={guild.guildMembers}
            guildBoss={guild.guildBoss}
            setGuildBoss={guild.setGuildBoss}
            guildEvents={guild.guildEvents}
            setError={guild.setGuildError}
            setGuildBusy={guild.setGuildBusy}
            refreshGuildData={guild.refreshGuildData}
            setConfirmKickMember={guild.setConfirmKickMember}
            setConfirmTransferLeader={guild.setConfirmTransferLeader}
            setConfirmDisbandGuild={guild.setConfirmDisbandGuild}
            onViewProfile={uid => openProfileCard(uid)}
          />
        )}

        {subTab === 'search' && SOCIAL_FEATURE_FLAGS.playerSearch && (
          <SearchSection onViewProfile={uid => openProfileCard(uid)} />
        )}

        {subTab === 'wars' && SOCIAL_FEATURE_FLAGS.guildWars && <GuildWarsSection />}

        {subTab === 'dm' && SOCIAL_FEATURE_FLAGS.directMessages && <DMSection />}

        {subTab === 'feed' && SOCIAL_FEATURE_FLAGS.activityFeed && (
          <ActivityFeedSection onViewProfile={uid => openProfileCard(uid)} />
        )}
      </Animated.View>

      {/* User menu modal (from chat row tap) */}
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
                setFriendAddBusy(true);
                try {
                  await sendFriendRequest(me.uid, me.name, activeUserMenu.displayName);
                  setActiveUserRelationship('outgoing');
                } catch {
                  // swallow — friends hook handles error state
                } finally {
                  setFriendAddBusy(false);
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
                  openProfileCard(activeUserMenu.uid);
                  setActiveUserMenu(null);
                }}
              >
                <Text style={styles.smallBtnText}>View Profile</Text>
              </Pressable>
            )}
            {SOCIAL_FEATURE_FLAGS.blockReport && !!activeUserMenu?.uid && activeUserMenu.uid !== me.uid && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                <Pressable
                  style={[styles.smallBtn, { borderColor: '#7A5C3C', backgroundColor: '#3D2A1A', flex: 1 }]}
                  disabled={friendAddBusy}
                  onPress={async () => {
                    if (!me.uid || !activeUserMenu?.uid) return;
                    setFriendAddBusy(true);
                    try {
                      if (blockedUids.has(activeUserMenu.uid)) {
                        await unblockUser(me.uid, activeUserMenu.uid);
                      } else {
                        await blockUser(me.uid, activeUserMenu.uid);
                      }
                    } catch {
                      /* handled by subscription update */
                    } finally {
                      setFriendAddBusy(false);
                    }
                  }}
                >
                  <Text style={[styles.smallBtnText, { color: '#FFB866' }]}>
                    {blockedUids.has(activeUserMenu?.uid ?? '') ? '🔓 Unblock' : '🚫 Block'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.smallBtn, styles.smallBtnDanger, { flex: 1 }]}
                  disabled={friendAddBusy || menuReportSent}
                  onPress={async () => {
                    if (!me.uid || !activeUserMenu?.uid || menuReportSent) return;
                    setFriendAddBusy(true);
                    try {
                      await reportUser(me.uid, activeUserMenu.uid, 'other', '');
                      setMenuReportSent(true);
                      void trackEvent('social_report_submitted', {
                        targetUid: activeUserMenu.uid,
                        reason: 'other',
                        source: 'chat_menu',
                      });
                    } catch {
                      /* swallow */
                    } finally {
                      setFriendAddBusy(false);
                    }
                  }}
                >
                  <Text style={styles.smallBtnText}>{menuReportSent ? '✓ Reported' : '⚠️ Report'}</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Profile modal */}
      <ProfileModal
        targetUid={activeProfileUid}
        meUid={me.uid}
        meName={me.name}
        meLevel={me.level}
        meVipLevel={me.vipLevel}
        meHighestWave={highestWaveReached}
        canInviteToGuild={guild.canInviteToGuild}
        socialSubTab={subTab}
        onClose={() => setActiveProfileUid(null)}
      />

      {/* Kick confirmation modal */}
      <Modal
        visible={!!guild.confirmKickMember}
        transparent
        animationType="fade"
        onRequestClose={() => guild.setConfirmKickMember(null)}
      >
        <Pressable style={styles.confirmBackdrop} onPress={() => guild.setConfirmKickMember(null)}>
          <Pressable style={styles.confirmCard} onPress={() => {}}>
            <Text style={styles.confirmTitle}>Confirm Kick Member</Text>
            <Text style={styles.confirmText}>
              Are you sure you want to kick {guild.confirmKickMember?.displayName} from the guild?
            </Text>
            <Text style={styles.confirmWarning}>
              This action cannot be undone. They can rejoin if the guild accepts them.
            </Text>
            <View style={styles.confirmButtonRow}>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnCancel]}
                disabled={guild.guildBusy}
                onPress={() => guild.setConfirmKickMember(null)}
              >
                <Text style={styles.confirmBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnDanger]}
                disabled={guild.guildBusy}
                onPress={guild.executeKick}
              >
                <Text style={styles.confirmBtnText}>{guild.guildBusy ? 'Kicking...' : 'Kick Member'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Transfer leadership confirmation modal */}
      <Modal
        visible={!!guild.confirmTransferLeader}
        transparent
        animationType="fade"
        onRequestClose={() => guild.setConfirmTransferLeader(null)}
      >
        <Pressable style={styles.confirmBackdrop} onPress={() => guild.setConfirmTransferLeader(null)}>
          <Pressable style={styles.confirmCard} onPress={() => {}}>
            <Text style={styles.confirmTitle}>Transfer Leadership</Text>
            <Text style={styles.confirmText}>Transfer leadership to {guild.confirmTransferLeader?.displayName}?</Text>
            <Text style={styles.confirmWarning}>
              ⚠️ This is a one-way action. {guild.confirmTransferLeader?.displayName} will become the new leader. You
              will lose all leader powers unless they grant them back.
            </Text>
            <View style={styles.confirmButtonRow}>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnCancel]}
                disabled={guild.guildBusy}
                onPress={() => guild.setConfirmTransferLeader(null)}
              >
                <Text style={styles.confirmBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnDanger]}
                disabled={guild.guildBusy}
                onPress={guild.executeTransfer}
              >
                <Text style={styles.confirmBtnText}>{guild.guildBusy ? 'Transferring...' : 'Transfer'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Disband guild confirmation modal */}
      <Modal
        visible={guild.confirmDisbandGuild}
        transparent
        animationType="fade"
        onRequestClose={() => guild.setConfirmDisbandGuild(false)}
      >
        <Pressable style={styles.confirmBackdrop} onPress={() => guild.setConfirmDisbandGuild(false)}>
          <Pressable style={styles.confirmCard} onPress={() => {}}>
            <Text style={styles.confirmTitleDanger}>⚠️ DISBAND GUILD ⚠️</Text>
            <Text style={styles.confirmText}>Permanently disband {guild.myGuild?.name}?</Text>
            <Text style={styles.confirmWarning}>
              This action is IRREVERSIBLE. All guild data will be lost including:
            </Text>
            <Text style={styles.confirmWarning}>• Guild members ({guild.myGuild?.memberCount})</Text>
            <Text style={styles.confirmWarning}>• Guild treasury and assets</Text>
            <Text style={styles.confirmWarning}>• All guild history and records</Text>
            <Text style={styles.confirmWarning}>Make sure you have backed up any important data.</Text>
            <View style={styles.confirmButtonRow}>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnCancel]}
                disabled={guild.guildBusy}
                onPress={() => guild.setConfirmDisbandGuild(false)}
              >
                <Text style={styles.confirmBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnDanger]}
                disabled={guild.guildBusy}
                onPress={guild.executeDisband}
              >
                <Text style={styles.confirmBtnText}>{guild.guildBusy ? 'Disbanding...' : 'DISBAND GUILD'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
