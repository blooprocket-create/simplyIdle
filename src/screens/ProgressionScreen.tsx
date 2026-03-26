import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Text, ScrollView } from 'react-native';
import { THEME, TYPOGRAPHY, SPACING, RADIUS } from '../theme';

type ProgressionStatKey = 'strength' | 'vitality' | 'agility' | 'intelligence' | 'spirit';

interface ProgressionScreenProps {
  wave: number;
  unspentPoints: number;
  prestigeCount: number;
  rebirthReady: boolean;
  essence: number;
  essencePerLevel: number;
  stats: {
    strength: number;
    vitality: number;
    agility: number;
    intelligence: number;
    spirit: number;
  };
  onStatUpgrade: (stat: ProgressionStatKey) => void;
  onStatUpgradeMulti: (stat: ProgressionStatKey, count: number) => void;
  onRebirth: () => void;
  onShowRebirthPath: () => void;
}

export default function ProgressionScreen({
  wave,
  unspentPoints,
  prestigeCount,
  rebirthReady,
  essence,
  essencePerLevel,
  stats,
  onStatUpgrade,
  onStatUpgradeMulti,
  onRebirth,
  onShowRebirthPath,
}: ProgressionScreenProps) {
  const [expandedStat, setExpandedStat] = useState<string | null>(null);

  const statData = [
    { key: 'strength' as const, label: 'Strength', icon: '💪', color: THEME.status.error },
    { key: 'vitality' as const, label: 'Vitality', icon: '❤️', color: THEME.status.success },
    { key: 'agility' as const, label: 'Agility', icon: '⚡', color: THEME.combat.dps },
    { key: 'intelligence' as const, label: 'Intelligence', icon: '🧠', color: THEME.status.epic },
    { key: 'spirit' as const, label: 'Spirit', icon: '✨', color: THEME.resource.essence },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      {/* Unspent Points Banner */}
      {unspentPoints > 0 && (
        <View style={styles.unspentBanner}>
          <Text style={styles.unspentLabel}>💡 Unspent Points</Text>
          <Text style={styles.unspentCount}>{unspentPoints} available</Text>
        </View>
      )}

      {/* Progress Info */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Current Wave</Text>
          <Text style={styles.infoValue}>{wave}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Rebirths</Text>
          <Text style={styles.infoValue}>{prestigeCount}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Essence Balance</Text>
          <Text style={styles.infoValue}>{essence} ⚡</Text>
        </View>
      </View>

      {/* Stat Upgrades */}
      <View>
        <Text style={styles.sectionTitle}>📊 Core Stats</Text>
        <View style={styles.statsList}>
          {statData.map(({ key, label, icon, color }) => {
            const value = stats[key];
            const isExpanded = expandedStat === key;

            return (
              <View key={key} style={styles.statCard}>
                <Pressable
                  style={styles.statCardHeader}
                  onPress={() => setExpandedStat(isExpanded ? null : key)}
                >
                  <View style={styles.statCardTitleWrap}>
                    <Text style={styles.statCardEmoji}>{icon}</Text>
                    <View style={styles.statCardTitleText}>
                      <Text style={styles.statCardLabel}>{label}</Text>
                      <Text style={[styles.statCardValue, { color }]}>{value}%</Text>
                    </View>
                  </View>
                  <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
                </Pressable>

                {isExpanded && (
                  <View style={styles.statCardExpanded}>
                    <View style={styles.statUpgradeRow}>
                      <Pressable
                        style={styles.statUpgradeBtn}
                        onPress={() => onStatUpgrade(key)}
                        disabled={unspentPoints === 0}
                      >
                        <Text style={styles.statUpgradeBtnText}>+1</Text>
                      </Pressable>
                      <Pressable
                        style={styles.statUpgradeBtn}
                        onPress={() => onStatUpgradeMulti(key, 10)}
                        disabled={unspentPoints < 10}
                      >
                        <Text style={styles.statUpgradeBtnText}>+10</Text>
                      </Pressable>
                      <Pressable
                        style={styles.statUpgradeBtn}
                        onPress={() => onStatUpgradeMulti(key, 100)}
                        disabled={unspentPoints < 100}
                      >
                        <Text style={styles.statUpgradeBtnText}>+MAX</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* Rebirth Section */}
      <View style={styles.rebirthCard}>
        <View style={styles.rebirthHeader}>
          <Text style={styles.rebirthTitle}>🔄 Rebirth</Text>
          {rebirthReady && <View style={styles.readyBadge} />}
        </View>

        <Text style={styles.rebirthDesc}>
          Start a new journey and reset to Wave 1 to earn rebirth milestones and permanent bonuses.
        </Text>

        {rebirthReady && <Text style={styles.rebirthReady}>✨ Ready to rebirth!</Text>}

        <View style={styles.rebirthButtonRow}>
          <Pressable
            style={styles.rebirthInfoBtn}
            onPress={onShowRebirthPath}
          >
            <Text style={styles.rebirthInfoBtnText}>View Paths</Text>
          </Pressable>

          <Pressable
            style={[styles.rebirthBtn, !rebirthReady && styles.rebirthBtnDisabled]}
            onPress={onRebirth}
            disabled={!rebirthReady}
          >
            <Text style={styles.rebirthBtnText}>
              {rebirthReady ? '🌟 REBIRTH' : 'Reach Wave 50'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Essence Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>⚡ Essence System</Text>
        <Text style={styles.infoCardDesc}>
          Combine essence with shards at shrines to unlock hero ranks. You earn {essencePerLevel} essence per rebirth level.
        </Text>
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

  unspentBanner: {
    backgroundColor: `${THEME.status.warning}15`,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: `${THEME.status.warning}40`,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  unspentLabel: {
    ...TYPOGRAPHY.label,
    color: THEME.status.warning,
  },
  unspentCount: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.status.warning,
  },

  infoCard: {
    backgroundColor: THEME.card.default,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: THEME.surface.divider,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.text.secondary,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.text.primary,
  },

  sectionTitle: {
    ...TYPOGRAPHY.section,
    color: THEME.text.primary,
    marginBottom: SPACING.md,
  },

  statsList: {
    gap: SPACING.md,
  },
  statCard: {
    backgroundColor: THEME.card.highlight,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    overflow: 'hidden',
  },
  statCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  statCardTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  statCardEmoji: {
    fontSize: 24,
  },
  statCardTitleText: {
    flex: 1,
  },
  statCardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.text.secondary,
  },
  statCardValue: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  expandIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.text.tertiary,
  },

  statCardExpanded: {
    borderTopWidth: 1,
    borderTopColor: THEME.surface.divider,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: `${THEME.card.default}80`,
  },
  statUpgradeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  statUpgradeBtn: {
    flex: 1,
    backgroundColor: THEME.status.info,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  statUpgradeBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#000',
  },

  rebirthCard: {
    backgroundColor: `${THEME.status.epic}15`,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: `${THEME.status.epic}40`,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  rebirthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rebirthTitle: {
    ...TYPOGRAPHY.section,
    color: THEME.status.epic,
  },
  readyBadge: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: THEME.status.success,
  },
  rebirthDesc: {
    fontSize: 11,
    color: THEME.text.secondary,
    lineHeight: 16,
  },
  rebirthReady: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.status.success,
  },
  rebirthButtonRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  rebirthInfoBtn: {
    flex: 1,
    backgroundColor: THEME.card.default,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  rebirthInfoBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.text.primary,
  },
  rebirthBtn: {
    flex: 1,
    backgroundColor: THEME.status.epic,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  rebirthBtnDisabled: {
    opacity: 0.4,
  },
  rebirthBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFF',
  },

  infoCardTitle: {
    ...TYPOGRAPHY.section,
    color: THEME.text.primary,
    marginBottom: SPACING.sm,
  },
  infoCardDesc: {
    fontSize: 11,
    color: THEME.text.secondary,
    lineHeight: 16,
  },
});
