import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { THEME } from '../../../theme';
import { GiftPreference } from '../../../gameConfig';
import { FriendListEntry, PendingFriendRequest } from '../../../services/friends';

interface FriendsSectionProps {
  styles: any;
  myGiftPreference: GiftPreference;
  friendsBusy: boolean;
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
}

export function FriendsSection({
  styles,
  myGiftPreference,
  friendsBusy,
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
}: FriendsSectionProps) {
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>My Gift Preference</Text>
        <Text style={styles.metaText}>Set what friends send you at daily reset.</Text>
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
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add Friend</Text>
        <Text style={styles.metaText}>Search by exact public username.</Text>
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
          onPress={() => void onSendRequest()}
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
                <Pressable style={styles.smallBtn} onPress={() => void onAcceptRequest(request.fromUid)} disabled={friendsBusy}>
                  <Text style={styles.smallBtnText}>Accept</Text>
                </Pressable>
                <Pressable style={[styles.smallBtn, styles.smallBtnDanger]} onPress={() => void onDeclineRequest(request.fromUid)} disabled={friendsBusy}>
                  <Text style={styles.smallBtnText}>Decline</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {pendingRequests.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.metaText}>No pending requests right now.</Text>
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
      </View>
    </>
  );
}
