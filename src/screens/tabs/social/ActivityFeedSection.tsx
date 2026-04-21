import React, { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { ActivityEvent, subscribeToFriendActivity } from '../../../services/activityFeed';
import { SocialCard } from './SocialPrimitives';
import { socialStyles as styles } from './social.styles';
import { useSocialFriends } from './SocialContext';
import { FeedbackPressable as Pressable } from '../../../components/FeedbackPressable';

const ACTIVITY_ICONS: Record<string, string> = {
  prestige_completed: '🔄',
  boss_defeated: '⚔️',
  achievement_unlocked: '🏆',
  guild_joined: '🏰',
  wave_milestone: '🌊',
  leaderboard_rank_change: '📊',
};

const ACTIVITY_LABELS: Record<string, string> = {
  prestige_completed: 'prestiged',
  boss_defeated: 'defeated a boss',
  achievement_unlocked: 'earned an achievement',
  guild_joined: 'joined a guild',
  wave_milestone: 'reached a wave milestone',
  leaderboard_rank_change: 'moved up the leaderboard',
};

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function ActivityFeedSection({ onViewProfile }: { onViewProfile: (uid: string) => void }) {
  const { friends } = useSocialFriends();
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    const friendUids = friends.map(f => f.uid);
    if (friendUids.length === 0) return;
    return subscribeToFriendActivity(friendUids, setEvents);
  }, [friends]);

  const renderItem = ({ item }: { item: ActivityEvent }) => {
    const icon = ACTIVITY_ICONS[item.type] ?? '📌';
    const label = ACTIVITY_LABELS[item.type] ?? item.type;
    return (
      <Pressable style={styles.friendRow} onPress={() => onViewProfile(item.uid)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Text style={{ fontSize: 18 }}>{icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.friendName}>{item.displayName}</Text>
            <Text style={styles.metaText}>
              {label}
              {item.data.wave ? ` (Wave ${item.data.wave})` : ''}
              {item.data.bossName ? ` — ${item.data.bossName}` : ''}
              {item.data.achievementName ? ` — ${item.data.achievementName}` : ''}
            </Text>
          </View>
          <Text style={[styles.metaText, { fontSize: 10 }]}>{formatRelativeTime(item.createdAt)}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SocialCard styles={styles} title="Activity Feed" subtitle="See what your friends are up to">
      {friends.length === 0 && <Text style={styles.metaText}>Add friends to see their activity here!</Text>}

      {friends.length > 0 && events.length === 0 && (
        <Text style={styles.metaText}>No recent activity from your friends.</Text>
      )}

      {events.length > 0 && (
        <FlatList data={events} keyExtractor={item => item.id} renderItem={renderItem} scrollEnabled={false} />
      )}
    </SocialCard>
  );
}
