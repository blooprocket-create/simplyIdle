import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { THEME, RADIUS } from '../../../theme';
import {
  fetchFriendRelationshipStatus,
  FriendRelationshipStatus,
  sendFriendRequestByUid,
} from '../../../services/friends';
import { fetchPublicPlayerProfile, PublicPlayerProfile } from '../../../services/publicProfile';
import { sendGuildInvite } from '../../../services/guild';
import { trackEvent } from '../../../telemetry';

interface ProfileModalProps {
  targetUid: string | null;
  meUid: string;
  meName: string;
  meLevel: number;
  meVipLevel: number;
  meHighestWave: number;
  canInviteToGuild: boolean;
  socialSubTab: string;
  onClose: () => void;
}

const PROFILE_CACHE_MAX = 50;

function buildProfileHighlights(profile: PublicPlayerProfile): string[] {
  const highlights: string[] = [];
  if (profile.vipLevel >= 10) highlights.push('Elite Patron');
  if (profile.vipLevel >= 1 && profile.vipLevel < 10) highlights.push('VIP Member');
  if (profile.prestigeCount >= 25) highlights.push('Legacy Commander');
  if (profile.highestWaveReached >= 2500) highlights.push('Wavebreaker');
  if (profile.leaderboardRank !== null && profile.leaderboardRank <= 100) highlights.push('Top 100');
  if (profile.guildRank === 'leader') highlights.push('Guild Leader');
  if (profile.guildRank === 'officer') highlights.push('Guild Officer');
  return highlights.slice(0, 4);
}

function formatSigned(value: number): string {
  if (value === 0) return '0';
  return value > 0 ? `+${value}` : `${value}`;
}

export function ProfileModal({
  targetUid,
  meUid,
  meName,
  meLevel,
  meVipLevel,
  meHighestWave,
  canInviteToGuild,
  socialSubTab,
  onClose,
}: ProfileModalProps) {
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<FriendRelationshipStatus>('none');
  const [actionBusy, setActionBusy] = useState(false);
  const cacheRef = useRef<Map<string, PublicPlayerProfile>>(new Map());

  const handleClose = useCallback(() => {
    setLoading(false);
    setError(null);
    setActionBusy(false);
    onClose();
  }, [onClose]);

  // Escape key dismiss on web
  useEffect(() => {
    if (Platform.OS !== 'web' || !targetUid) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [targetUid, handleClose]);

  useEffect(() => {
    if (!meUid || !targetUid) {
      setRelationship('none');
      return;
    }
    void fetchFriendRelationshipStatus(meUid, targetUid)
      .then(setRelationship)
      .catch(() => setRelationship('none'));
  }, [targetUid, meUid]);

  useEffect(() => {
    if (!targetUid) return;
    setError(null);

    const cached = cacheRef.current.get(targetUid);
    if (cached) {
      setProfile(cached);
      void trackEvent('social_profile_opened', { sourceTab: socialSubTab, source: 'modal', cached: true });
      void fetchPublicPlayerProfile(targetUid)
        .then(p => {
          if (!p) return;
          // LRU: delete and re-insert to move to end
          cacheRef.current.delete(targetUid);
          cacheRef.current.set(targetUid, p);
          setProfile(p);
        })
        .catch(() => {});
      return;
    }

    setProfile(null);
    setLoading(true);
    void fetchPublicPlayerProfile(targetUid)
      .then(p => {
        if (!p) {
          setError('Profile unavailable right now.');
          return;
        }
        // LRU eviction: remove oldest entry if at capacity
        if (cacheRef.current.size >= PROFILE_CACHE_MAX) {
          const oldestKey = cacheRef.current.keys().next().value;
          if (oldestKey !== undefined) cacheRef.current.delete(oldestKey);
        }
        cacheRef.current.set(targetUid, p);
        setProfile(p);
        void trackEvent('social_profile_opened', { sourceTab: socialSubTab, source: 'modal', cached: false });
      })
      .catch(() => setError('Failed to load player profile.'))
      .finally(() => setLoading(false));
  }, [targetUid, socialSubTab]);

  return (
    <Modal visible={!!targetUid} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.cardTitle}>Player Profile</Text>

          {loading && <Text style={styles.metaText}>Loading profile data...</Text>}
          {!!error && <Text style={styles.errorText}>⚠️ {error}</Text>}

          {!loading && !error && !!profile && (
            <>
              <Text style={styles.profileName}>{profile.publicUsername}</Text>
              {buildProfileHighlights(profile).length > 0 && (
                <View style={styles.tagRow}>
                  {buildProfileHighlights(profile).map(tag => (
                    <Text key={tag} style={styles.tag}>
                      {tag}
                    </Text>
                  ))}
                </View>
              )}
              <View style={styles.metricGrid}>
                {(
                  [
                    ['Level', profile.level],
                    ['VIP', profile.vipLevel],
                    ['Prestige', profile.prestigeCount],
                    ['Rank', profile.leaderboardRank ? `#${profile.leaderboardRank}` : 'N/A'],
                    ['Friends', profile.friendCount],
                    ['Guild Damage', profile.guildContribution.toLocaleString()],
                  ] as [string, string | number][]
                ).map(([label, value]) => (
                  <View key={label} style={styles.metricChip}>
                    <Text style={styles.metricLabel}>{label}</Text>
                    <Text style={styles.metricValue}>{value}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.metaText}>Wave Peak: {profile.highestWaveReached.toLocaleString()}</Text>
              <Text style={styles.metaText}>Score: {profile.score.toLocaleString()}</Text>
              <Text style={styles.metaText}>Gift Preference: {profile.giftPreference}</Text>
              <Text style={styles.metaText}>
                Guild:{' '}
                {profile.guildName
                  ? `${profile.guildName}${profile.guildRank ? ` (${profile.guildRank})` : ''}`
                  : 'No guild'}
              </Text>

              <View style={styles.compareCard}>
                <Text style={styles.compareTitle}>Compare With You</Text>
                <Text style={styles.metaText}>Level Delta: {formatSigned(profile.level - meLevel)}</Text>
                <Text style={styles.metaText}>VIP Delta: {formatSigned(profile.vipLevel - meVipLevel)}</Text>
                <Text style={styles.metaText}>
                  Wave Delta: {formatSigned(profile.highestWaveReached - meHighestWave)}
                </Text>
              </View>

              <View style={styles.actions}>
                <Pressable
                  style={[
                    styles.btn,
                    (relationship !== 'none' || actionBusy || profile.uid === meUid) && styles.btnDisabled,
                  ]}
                  disabled={relationship !== 'none' || actionBusy || profile.uid === meUid}
                  onPress={async () => {
                    if (!meUid || !profile || relationship !== 'none') return;
                    setActionBusy(true);
                    void trackEvent('social_profile_friend_cta_clicked', {
                      relation: relationship,
                      sourceTab: socialSubTab,
                    });
                    try {
                      await sendFriendRequestByUid(meUid, meName, profile.uid);
                      setRelationship('outgoing');
                      void trackEvent('social_profile_friend_request_sent', {
                        sourceTab: socialSubTab,
                        relationBefore: 'none',
                      });
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Failed to send friend request.';
                      setError(msg);
                      void trackEvent('social_profile_friend_request_failed', {
                        reason: msg.slice(0, 80),
                        sourceTab: socialSubTab,
                      });
                    } finally {
                      setActionBusy(false);
                    }
                  }}
                >
                  <Text style={styles.btnText}>
                    {actionBusy
                      ? 'Sending...'
                      : relationship === 'self'
                        ? 'You'
                        : relationship === 'friends'
                          ? 'Friends'
                          : relationship === 'outgoing'
                            ? 'Request Sent'
                            : relationship === 'incoming'
                              ? 'Incoming Request'
                              : 'Add Friend'}
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.btn,
                    (!canInviteToGuild || actionBusy || !profile || profile.uid === meUid || !!profile.guildName) &&
                      styles.btnDisabled,
                  ]}
                  disabled={!canInviteToGuild || actionBusy || !profile || profile.uid === meUid || !!profile.guildName}
                  onPress={async () => {
                    if (!meUid || !profile || !canInviteToGuild) return;
                    setActionBusy(true);
                    try {
                      await sendGuildInvite({ actorUid: meUid, targetUid: profile.uid, actorDisplayName: meName });
                      setError('Guild invite sent.');
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Failed to send guild invite.';
                      setError(msg);
                    } finally {
                      setActionBusy(false);
                    }
                  }}
                >
                  <Text style={styles.btnText}>
                    {!canInviteToGuild
                      ? 'Invite Locked'
                      : actionBusy
                        ? 'Inviting...'
                        : profile?.uid === meUid
                          ? 'You'
                          : profile?.guildName
                            ? 'Already in Guild'
                            : 'Invite to Guild'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          <View style={styles.closeRow}>
            <Pressable style={styles.closeBtn} onPress={handleClose}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: THEME.bg.elevated,
    borderRadius: RADIUS.lg,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: THEME.surface.border,
  },
  cardTitle: {
    fontWeight: '900',
    fontSize: 16,
    color: THEME.text.primary,
    textAlign: 'center',
  },
  metaText: {
    fontSize: 12,
    color: THEME.text.secondary,
  },
  errorText: {
    fontSize: 12,
    color: THEME.status.error,
  },
  profileName: {
    fontWeight: '900',
    fontSize: 18,
    color: THEME.text.primary,
    textAlign: 'center',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  tag: {
    backgroundColor: '#2A3D54',
    color: '#90DFFF',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  metricChip: {
    backgroundColor: '#172232',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 70,
  },
  metricLabel: {
    fontSize: 9,
    color: THEME.text.secondary,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  metricValue: {
    fontSize: 14,
    color: THEME.text.primary,
    fontWeight: '900',
  },
  compareCard: {
    backgroundColor: '#1A2A3D',
    borderRadius: RADIUS.md,
    padding: 12,
    gap: 4,
    marginTop: 4,
  },
  compareTitle: {
    fontWeight: '800',
    fontSize: 12,
    color: THEME.text.primary,
    marginBottom: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    backgroundColor: '#0D3B66',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    fontWeight: '800',
    fontSize: 12,
    color: '#FFFFFF',
  },
  closeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 4,
  },
  closeBtn: {
    borderWidth: 1,
    borderColor: '#46627B',
    backgroundColor: '#1A2A3D',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
  },
  closeBtnText: {
    fontWeight: '800',
    fontSize: 12,
    color: '#FFFFFF',
  },
});
