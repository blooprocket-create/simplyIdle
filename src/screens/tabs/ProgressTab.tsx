import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../../theme/colors';
import MobileCard from '../../components/MobileCard';
import SectionHeader from '../../components/SectionHeader';
import MobileScrollContainer from '../../components/MobileScrollContainer';
import { fmt } from '../../utils';

interface Achievement {
  id: string;
  name: string;
  emoji: string;
  progress: number;
  target: number;
  description: string;
  claimed?: boolean;
}

interface ProgressTabProps {
  achievementCount: number;
  totalAchievements: number;
  weeklyKills: number;
  weeklyMilestones: Array<{
    kills: number;
    reward: string;
    claimed: boolean;
  }>;
  missions: Array<{
    id: string;
    title: string;
    progress: number;
    target: number;
    reward: string;
    claimed: boolean;
  }>;
  nearUnlocks: Achievement[];
  dailyLoginStreak: number;
  highestWaveReached: number;
  totalGold: number;
  totalKills: number;
  vipLevel: number;
  vipProgress: number;
  onClaimWeekly: (milestone: number) => void;
  onClaimMission: (missionId: string) => void;
  onOpenLeaderboard?: () => void;
}

export default function ProgressTab(props: ProgressTabProps) {
  const [expandedSection, setExpandedSection] = useState<string>('near-unlocks');

  return (
    <MobileScrollContainer>
      <SectionHeader
        icon="🏆"
        title="Progress"
        subtitle={`${props.achievementCount}/${props.totalAchievements} achievements`}
      />

      {/* Milestones snippet */}
      <MobileCard
        icon="📈"
        title="Account Stats"
        sections={[
          {
            items: [
              {
                label: 'Daily Streak',
                value: `${props.dailyLoginStreak} 🔥`,
                highlight: props.dailyLoginStreak > 0,
              },
              {
                label: 'Peak Wave',
                value: props.highestWaveReached,
              },
              {
                label: 'Total Kills',
                value: fmt(props.totalKills),
              },
              {
                label: 'Total Gold Earned',
                value: fmt(props.totalGold),
              },
            ],
          },
        ]}
      />

      {/* VIP Level */}
      {props.vipLevel > 0 && (
        <MobileCard
          icon="👑"
          title={`VIP Level ${props.vipLevel}`}
          sections={[
            {
              items: [
                {
                  label: 'Progress',
                  value: `${Math.round(props.vipProgress)}%`,
                },
              ],
            },
          ]}
        />
      )}

      {/* Weekly Milestones */}
      {props.weeklyMilestones.length > 0 && (
        <MobileCard
          icon="📅"
          title="Weekly Milestones"
          sections={[
            {
              items: props.weeklyMilestones.map(milestone => ({
                label: `${milestone.kills} Kills`,
                value: milestone.claimed ? 'Claimed ✓' : milestone.reward,
                color: milestone.claimed ? theme.text.tertiary : theme.status.positive,
              })),
            },
          ]}
        />
      )}

      {/* Weekly Kills */}
      <MobileCard
        icon="🗡️"
        title="Weekly Kills"
        sections={[
          {
            items: [
              {
                label: 'This Week',
                value: props.weeklyKills,
                highlight: props.weeklyKills > 0,
              },
            ],
          },
        ]}
      />

      {/* Near Unlocks */}
      {props.nearUnlocks.length > 0 && (
        <Pressable
          style={styles.collapsibleHeader}
          onPress={() => setExpandedSection(expandedSection === 'near-unlocks' ? '' : 'near-unlocks')}
        >
          <View style={styles.collapsibleTitle}>
            <Text style={styles.collapsibleIcon}>🎯</Text>
            <Text style={styles.collapsibleText}>Near Unlocks ({props.nearUnlocks.length})</Text>
          </View>
          <Text style={styles.collapsibleChevron}>{expandedSection === 'near-unlocks' ? '−' : '+'}</Text>
        </Pressable>
      )}
      {expandedSection === 'near-unlocks' &&
        props.nearUnlocks.map(achievement => (
          <View key={achievement.id} style={styles.achievementRow}>
            <Text style={styles.achievementEmoji}>{achievement.emoji}</Text>
            <View style={styles.achievementContent}>
              <Text style={styles.achievementName}>{achievement.name}</Text>
              <Text style={styles.achievementDesc}>{achievement.description}</Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.max(5, Math.min(95, (achievement.progress / achievement.target) * 100))}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {achievement.progress} / {achievement.target}
              </Text>
            </View>
          </View>
        ))}

      {/* Missions */}
      {props.missions.length > 0 && (
        <>
          <Pressable
            style={[styles.collapsibleHeader, { marginTop: theme.spacing.lg }]}
            onPress={() => setExpandedSection(expandedSection === 'missions' ? '' : 'missions')}
          >
            <View style={styles.collapsibleTitle}>
              <Text style={styles.collapsibleIcon}>📋</Text>
              <Text style={styles.collapsibleText}>Missions</Text>
            </View>
            <Text style={styles.collapsibleChevron}>{expandedSection === 'missions' ? '−' : '+'}</Text>
          </Pressable>
          {expandedSection === 'missions' &&
            props.missions.map(mission => (
              <View key={mission.id} style={styles.missionRow}>
                <View style={styles.missionContent}>
                  <Text style={styles.missionTitle}>{mission.title}</Text>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.max(5, Math.min(95, (mission.progress / mission.target) * 100))}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {mission.progress} / {mission.target} • {mission.reward}
                  </Text>
                </View>
                {mission.claimed ? (
                  <Text style={styles.claimed}>✓</Text>
                ) : (
                  <Pressable style={styles.claimBtn} onPress={() => props.onClaimMission(mission.id)}>
                    <Text style={styles.claimBtnText}>Claim</Text>
                  </Pressable>
                )}
              </View>
            ))}
        </>
      )}
    </MobileScrollContainer>
  );
}

const styles = StyleSheet.create({
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
    marginTop: theme.spacing.lg,
  },
  collapsibleTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  collapsibleIcon: {
    fontSize: 18,
  },
  collapsibleText: {
    color: theme.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  collapsibleChevron: {
    color: theme.text.secondary,
    fontSize: 16,
    fontWeight: '700',
  },
  achievementRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
    alignItems: 'flex-start',
  },
  achievementEmoji: {
    fontSize: 24,
    marginTop: theme.spacing.xs,
  },
  achievementContent: {
    flex: 1,
  },
  achievementName: {
    color: theme.text.primary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: theme.spacing.xs,
  },
  achievementDesc: {
    color: theme.text.secondary,
    fontSize: 11,
    marginBottom: theme.spacing.sm,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: theme.bg.dark,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: theme.spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.accent.primary,
    borderRadius: 2,
  },
  progressText: {
    color: theme.text.tertiary,
    fontSize: 10,
  },
  missionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
    gap: theme.spacing.md,
  },
  missionContent: {
    flex: 1,
  },
  missionTitle: {
    color: theme.text.primary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
  claimBtn: {
    backgroundColor: theme.accent.primary,
    borderRadius: 6,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  claimBtnText: {
    color: theme.bg.deepestBlack,
    fontSize: 11,
    fontWeight: '700',
  },
  claimed: {
    color: theme.status.positive,
    fontSize: 16,
    fontWeight: '700',
  },
});
