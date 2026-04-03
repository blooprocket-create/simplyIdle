import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { GiftPreference } from '../../../gameConfig';
import { FriendListEntry, PendingFriendRequest } from '../../../services/friends';
import { SocialAsyncState, SocialCard, SocialInput, SocialPrimaryButton } from './SocialPrimitives';

interface FriendsSectionProps {
  styles: any;
  myGiftPreference: GiftPreference;
  friendsBusy: boolean;
  isLoading: boolean;
  friendsError: string | null;
  friendSearch: string;
  setFriendSearch: (value: string) => void;
  pendingRequests: PendingFriendRequest[];
  friends: FriendListEntry[];
  giftCooldowns: Record<string, number>;
  giftIcon: (pref: GiftPreference) => string;
  isSameUtcDay: (a: number, b: number) => boolean;
  timeUntilNextUtcMidnightLabel: (nowMs: number) => string;
  onUpdatePreference: (preference: GiftPreference) => Promise<void>;
  onSendRequest: () => Promise<void>;
  onAcceptRequest: (fromUid: string) => Promise<void>;
  onDeclineRequest: (fromUid: string) => Promise<void>;
  onSendDailyGift: (friend: FriendListEntry) => Promise<void>;
  onRemoveFriend: (friendUid: string) => Promise<void>;
  onRetryLoad: () => Promise<void>;
}

export function FriendsSection({
  styles,
  myGiftPreference,
  friendsBusy,
  isLoading,
  friendsError,
  friendSearch,
  setFriendSearch,
  pendingRequests,
  friends,
  giftCooldowns,
  giftIcon,
  isSameUtcDay,
  timeUntilNextUtcMidnightLabel,
  onUpdatePreference,
  onSendRequest,
  onAcceptRequest,
  onDeclineRequest,
  onSendDailyGift,
  onRemoveFriend,
  onRetryLoad,
}: FriendsSectionProps) {
  const nowMs = Date.now();

  const friendsReadyToGift = friends.filter(friend => {
    const cooldownAt = giftCooldowns[friend.uid] ?? 0;
    return !isSameUtcDay(cooldownAt, nowMs);
  });

  const friendsGiftedToday = friends.filter(friend => {
    const cooldownAt = giftCooldowns[friend.uid] ?? 0;
    return isSameUtcDay(cooldownAt, nowMs);
  });

  return (
    <>
      <SocialCard styles={styles} title="My Gift Preference" subtitle="Set what friends send you at daily reset.">
        <View style={styles.prefRow}>
          {(['gold', 'shards', 'essence'] as GiftPreference[]).map(pref => (
            <Pressable
              key={pref}
              style={[styles.prefBtn, myGiftPreference === pref && styles.prefBtnActive]}
              onPress={() => void onUpdatePreference(pref)}
              disabled={friendsBusy}
            >
              <Text style={styles.prefBtnText}>{giftIcon(pref)} {pref}</Text>
            </Pressable>
          ))}
        </View>
      </SocialCard>

      <SocialCard styles={styles} title="Add Friend" subtitle="Search by exact public username.">
        <SocialAsyncState styles={styles} isLoading={isLoading} variant="inline" />
        <SocialInput
          styles={styles}
          value={friendSearch}
          onChangeText={setFriendSearch}
          placeholder="Public username"
          maxLength={24}
          editable={!friendsBusy}
          autoCapitalize="none"
        />
        <SocialPrimaryButton
          styles={styles}
          label="Send Request"
          onPress={() => void onSendRequest()}
          disabled={!friendSearch.trim() || friendsBusy}
        />
        <SocialAsyncState styles={styles} error={friendsError} variant="inline" onRetry={() => void onRetryLoad()} />
      </SocialCard>

      {pendingRequests.length > 0 && (
        <SocialCard styles={styles} title={`Pending Requests (${pendingRequests.length})`}>
          {pendingRequests.map(request => (
            <View key={request.fromUid} style={styles.friendRow}>
              <Text style={styles.friendName}>👤 {request.fromName}</Text>
              <View style={styles.friendActions}>
                <Pressable style={styles.smallBtn} onPress={() => void onAcceptRequest(request.fromUid)} disabled={friendsBusy}>
                  <Text style={styles.smallBtnText}>Accept</Text>
                </Pressable>
                <Pressable style={[styles.smallBtn, styles.smallBtnDanger]} onPress={() => void onDeclineRequest(request.fromUid)} disabled={friendsBusy}>
                  <Text style={styles.smallBtnText}>Decline</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </SocialCard>
      )}

      <SocialAsyncState
        styles={styles}
        isEmpty={pendingRequests.length === 0}
        emptyTitle="No Pending Requests"
        emptySubtitle="Friend requests you receive will show up here."
      />

      <SocialAsyncState
        styles={styles}
        isEmpty={friends.length === 0}
        emptyTitle="No Friends Yet"
        emptySubtitle="Search for a public username to send your first friend request."
      />

      <SocialCard
        styles={styles}
        title={`Friends (${friends.length})`}
        subtitle={`Ready to gift: ${friendsReadyToGift.length} • Gifted today: ${friendsGiftedToday.length}`}
      >
        {friendsReadyToGift.length > 0 && (
          <Text style={styles.sectionLabel}>Ready To Gift</Text>
        )}
        {friendsReadyToGift.map(friend => (
          <View key={friend.uid} style={styles.friendRow}>
            <View style={styles.friendMeta}>
              <Text style={styles.friendName}>{friend.displayName}</Text>
              <Text style={styles.metaText}>Lv.{friend.level} • Wants {giftIcon(friend.giftPreference)} {friend.giftPreference}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, styles.statusDotReady]} />
                <Text style={styles.statusText}>Gift Ready</Text>
              </View>
            </View>
            <View style={styles.friendActions}>
              <Pressable
                style={styles.smallBtn}
                onPress={() => void onSendDailyGift(friend)}
                disabled={friendsBusy}
              >
                <Text style={styles.smallBtnText}>Send Gift</Text>
              </Pressable>
              <Pressable
                style={[styles.smallBtn, styles.smallBtnDanger]}
                onPress={() => void onRemoveFriend(friend.uid)}
                disabled={friendsBusy}
              >
                <Text style={styles.smallBtnText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {friendsGiftedToday.length > 0 && (
          <Text style={styles.sectionLabel}>Gifted Today</Text>
        )}
        {friendsGiftedToday.map(friend => (
          <View key={friend.uid} style={styles.friendRow}>
            <View style={styles.friendMeta}>
              <Text style={styles.friendName}>{friend.displayName}</Text>
              <Text style={styles.metaText}>Lv.{friend.level} • Wants {giftIcon(friend.giftPreference)} {friend.giftPreference}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, styles.statusDotCooldown]} />
                <Text style={styles.statusText}>Gift Cooldown</Text>
              </View>
              <Text style={styles.cooldownText}>Next gift in {timeUntilNextUtcMidnightLabel(nowMs)}</Text>
            </View>
            <View style={styles.friendActions}>
              <Pressable style={[styles.smallBtn, styles.sendBtnDisabled]} disabled>
                <Text style={styles.smallBtnText}>Gifted</Text>
              </Pressable>
              <Pressable
                style={[styles.smallBtn, styles.smallBtnDanger]}
                onPress={() => void onRemoveFriend(friend.uid)}
                disabled={friendsBusy}
              >
                <Text style={styles.smallBtnText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </SocialCard>
    </>
  );
}
