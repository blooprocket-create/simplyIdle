import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { GiftPreference } from '../../../gameConfig';
import { FriendListEntry, PendingFriendRequest } from '../../../services/friends';
import { SocialAsyncState, SocialCard, SocialInput, SocialPrimaryButton } from './SocialPrimitives';

interface FriendsSectionProps {
  styles: any;
  myGiftPreference: GiftPreference;
  friendsBusy: boolean;
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

      <SocialCard styles={styles} title={`Friends (${friends.length})`}>
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
                  onPress={() => void onSendDailyGift(friend)}
                  disabled={friendsBusy || giftedToday}
                >
                  <Text style={styles.smallBtnText}>{giftedToday ? 'Gifted' : 'Gift'}</Text>
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
          );
        })}
      </SocialCard>
    </>
  );
}
