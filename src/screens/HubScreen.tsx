import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Text, ScrollView } from 'react-native';
import { THEME, TYPOGRAPHY, SPACING, RADIUS } from '../theme';

interface HubScreenProps {
  achievementBonus: number;
  unclaimedAchievements: number;
  weeklyProgress: number;
  expeditionsRunning: number;
  facilityCount: number;
  
  // Callbacks
  onViewAchievements: () => void;
  onViewWeekly: () => void;
  onViewWarRoom: () => void;
  onViewGuildHall: () => void;
  onViewExpeditions: () => void;
  onOpenShop: () => void;
  onOpenLeaderboard: () => void;
}

export default function HubScreen({
  achievementBonus,
  unclaimedAchievements,
  weeklyProgress,
  expeditionsRunning,
  facilityCount,
  onViewAchievements,
  onViewWeekly,
  onViewWarRoom,
  onViewGuildHall,
  onViewExpeditions,
  onOpenShop,
  onOpenLeaderboard,
}: HubScreenProps) {
  const [expandedPanel, setExpandedPanel] = useState<string | null>('achievements');

  const panels = [
    {
      id: 'achievements',
      title: '🏆 Achievements',
      icon: '🏆',
      badge: unclaimedAchievements,
      description: `${achievementBonus}% bonus from unlocks`,
      action: onViewAchievements,
      action2: onViewWeekly,
      action2Label: 'Weekly Track',
    },
    {
      id: 'warroom',
      title: '🛰️ Command Center',
      icon: '🛰️',
      description: 'Strategy & team setup',
      action: onViewWarRoom,
      sub: 'War Room • Formations • Synergies',
    },
    {
      id: 'guildhall',
      title: '🏰 Guild Hall',
      icon: '🏰',
      badge: facilityCount,
      description: `${facilityCount} facilities to upgrade`,
      action: onViewGuildHall,
      sub: 'Facilities • Batch Leveling • Expeditions',
    },
    {
      id: 'expeditions',
      title: '🗺️ Expeditions',
      icon: '🗺️',
      badge: expeditionsRunning,
      description: `${expeditionsRunning} active contracts`,
      action: onViewExpeditions,
      sub: 'Artifact Hunt • Merchant • Ruins • Vault • Abyss',
    },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      {/* Quick Actions */}
      <View style={styles.quickActionRow}>
        <Pressable style={styles.quickActionBtn} onPress={onOpenShop}>
          <Text style={styles.quickActionEmoji}>🛒</Text>
          <Text style={styles.quickActionLabel}>Shop</Text>
        </Pressable>
        <Pressable style={styles.quickActionBtn} onPress={onOpenLeaderboard}>
          <Text style={styles.quickActionEmoji}>📊</Text>
          <Text style={styles.quickActionLabel}>Rankings</Text>
        </Pressable>
        <Pressable style={styles.quickActionBtn} onPress={onOpenLeaderboard}>
          <Text style={styles.quickActionEmoji}>🌐</Text>
          <Text style={styles.quickActionLabel}>Events</Text>
        </Pressable>
      </View>

      {/* Main Panels */}
      <View style={styles.panelList}>
        {panels.map(panel => {
          const isExpanded = expandedPanel === panel.id;

          return (
            <View key={panel.id} style={styles.panel}>
              <Pressable
                style={styles.panelHeader}
                onPress={() => setExpandedPanel(isExpanded ? null : panel.id)}
              >
                <View style={styles.panelHeaderLeft}>
                  <Text style={styles.panelEmoji}>{panel.icon}</Text>
                  <View style={styles.panelTitleWrap}>
                    <Text style={styles.panelTitle}>{panel.title}</Text>
                    <Text style={styles.panelSub}>{panel.description}</Text>
                  </View>
                </View>
                <View style={styles.panelHeaderRight}>
                  {panel.badge !== undefined && panel.badge > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{panel.badge}</Text>
                    </View>
                  )}
                  <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
                </View>
              </Pressable>

              {isExpanded && (
                <View style={styles.panelExpanded}>
                  {panel.sub && <Text style={styles.panelSubtitle}>{panel.sub}</Text>}

                  <View style={styles.panelActionRow}>
                    <Pressable style={styles.panelActionBtn} onPress={panel.action}>
                      <Text style={styles.panelActionBtnText}>Open</Text>
                    </Pressable>
                    {panel.action2 && (
                      <Pressable style={styles.panelActionBtnAlt} onPress={panel.action2}>
                        <Text style={styles.panelActionBtnText}>{panel.action2Label}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>💡 Pro Tips</Text>
        <View style={styles.tipList}>
          <Text style={styles.tip}>
            • Complete achievements to unlock permanent bonuses (+{achievementBonus}% now)
          </Text>
          <Text style={styles.tip}>
            • Form teams with matching factions for synergy bonuses
          </Text>
          <Text style={styles.tip}>
            • Upgrade guild facilities for passive income and stat boosts
          </Text>
          <Text style={styles.tip}>
            • Launch expeditions to earn bonus resources passively
          </Text>
        </View>
      </View>

      {/* Version Info */}
      <View style={styles.footerCard}>
        <Text style={styles.footerText}>SimplyIdle Redesigned</Text>
        <Text style={styles.footerSubtext}>Mobile-first • Cleaner • Better UX</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    gap: SPACING.lg,
    paddingBottom: SPACING.lg,
  },

  quickActionRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    justifyContent: 'space-around',
  },
  quickActionBtn: {
    flex: 1,
    backgroundColor: THEME.card.highlight,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  quickActionEmoji: {
    fontSize: 24,
  },
  quickActionLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: THEME.text.primary,
  },

  panelList: {
    gap: SPACING.md,
  },
  panel: {
    backgroundColor: THEME.card.default,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  panelHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'center',
  },
  panelEmoji: {
    fontSize: 24,
  },
  panelTitleWrap: {
    flex: 1,
  },
  panelTitle: {
    ...TYPOGRAPHY.section,
    color: THEME.text.primary,
    marginBottom: 2,
  },
  panelSub: {
    fontSize: 10,
    color: THEME.text.secondary,
  },
  panelHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  badge: {
    backgroundColor: THEME.status.error,
    borderRadius: RADIUS.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  expandIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.text.tertiary,
  },

  panelExpanded: {
    borderTopWidth: 1,
    borderTopColor: THEME.surface.divider,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: `${THEME.card.highlight}50`,
    gap: SPACING.md,
  },
  panelSubtitle: {
    fontSize: 10,
    color: THEME.text.secondary,
    fontStyle: 'italic',
  },

  panelActionRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  panelActionBtn: {
    flex: 1,
    backgroundColor: THEME.status.success,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  panelActionBtnAlt: {
    flex: 1,
    backgroundColor: THEME.status.info,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  panelActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#000',
  },

  infoCard: {
    backgroundColor: `${THEME.status.info}15`,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: `${THEME.status.info}40`,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  infoTitle: {
    ...TYPOGRAPHY.section,
    color: THEME.status.info,
  },
  tipList: {
    gap: SPACING.sm,
  },
  tip: {
    fontSize: 10,
    color: THEME.text.secondary,
    lineHeight: 14,
  },

  footerCard: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.xs,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.text.primary,
  },
  footerSubtext: {
    fontSize: 10,
    color: THEME.text.tertiary,
  },
});
