import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Text, ScrollView } from 'react-native';
import { THEME, TYPOGRAPHY, SPACING, RADIUS } from '../theme';

interface HeroesScreenProps {
  heroCount: number;
  rosterSize: number;
  canSummon: boolean;
  summonCost: number;
  pity: number;
  pityTarget: number;
  onSummon: () => void;
  onSummonX10: () => void;
  onAutoEquip: () => void;
  onAutoRecycle: () => void;
  onShowRoster: () => void;
}

export default function HeroesScreen({
  heroCount,
  rosterSize,
  canSummon,
  summonCost,
  pity,
  pityTarget,
  onSummon,
  onSummonX10,
  onAutoEquip,
  onAutoRecycle,
  onShowRoster,
}: HeroesScreenProps) {
  const [summonTab, setSummonTab] = useState<'single' | 'x10'>('single');
  const pityPct = (pity / pityTarget) * 100;

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      {/* Summon Section */}
      <View style={styles.summonCard}>
        <View style={styles.summonHeader}>
          <Text style={styles.summonTitle}>🎲 Summon Heroes</Text>
          <Text style={styles.rosterLabel}>{heroCount}/{rosterSize}</Text>
        </View>

        {/* Pity Progress */}
        <View style={styles.pitySection}>
          <View style={styles.pityRow}>
            <Text style={styles.pityLabel}>Special Pity</Text>
            <Text style={styles.pityValue}>{pity}/{pityTarget}</Text>
          </View>
          <View style={styles.pityBarBg}>
            <View style={[styles.pityBarFill, { width: `${pityPct}%` }]} />
          </View>
        </View>

        {/* Summon Cost */}
        <View style={styles.costRow}>
          <Text style={styles.costLabel}>Tears Required</Text>
          <Text style={styles.costValue}>💧 {formatNumber(summonCost)}</Text>
        </View>

        {/* Summon Buttons */}
        <View style={styles.summonButtons}>
          <Pressable
            style={[styles.summonBtn, !canSummon && styles.summonBtnDisabled]}
            onPress={onSummon}
            disabled={!canSummon}
          >
            <Text style={styles.summonBtnText}>Single</Text>
          </Pressable>
          <Pressable
            style={[styles.summonBtnX10, !canSummon && styles.summonBtnDisabled]}
            onPress={onSummonX10}
            disabled={!canSummon}
          >
            <Text style={styles.summonBtnX10Text}>x10</Text>
          </Pressable>
        </View>
      </View>

      {/* Roster Management */}
      <View style={styles.managementCard}>
        <Text style={styles.managementTitle}>🛠️ Team & Equipment</Text>

        <View style={styles.actionButtons}>
          <Pressable style={styles.actionBtn} onPress={onAutoEquip}>
            <View style={styles.actionBtnContent}>
              <Text style={styles.actionBtnIcon}>⚔️</Text>
              <Text style={styles.actionBtnText}>Auto Equip</Text>
            </View>
          </Pressable>

          <Pressable style={styles.actionBtn} onPress={onAutoRecycle}>
            <View style={styles.actionBtnContent}>
              <Text style={styles.actionBtnIcon}>♻️</Text>
              <Text style={styles.actionBtnText}>Auto Recycle</Text>
            </View>
          </Pressable>
        </View>

        <Pressable style={styles.rosterBtn} onPress={onShowRoster}>
          <Text style={styles.rosterBtnText}>View Roster & Details</Text>
        </Pressable>
      </View>

      {/* Hero Types Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>📚 Rarity System</Text>
        <View style={styles.rarityList}>
          {[
            { emoji: '⚪', name: 'Common', color: '#8A96A8' },
            { emoji: '🟦', name: 'Rare', color: '#5DA8FF' },
            { emoji: '🟪', name: 'Epic', color: '#C77DFF' },
            { emoji: '⭐', name: 'Legendary', color: '#FFD700' },
            { emoji: '✨', name: 'Godly', color: '#FF8866' },
          ].map(({ emoji, name, color }) => (
            <View key={name} style={styles.rarityRow}>
              <Text style={styles.rarityEmoji}>{emoji}</Text>
              <Text style={[styles.rarityName, { color }]}>{name}</Text>
            </View>
          ))}
        </View>
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

  summonCard: {
    backgroundColor: THEME.card.highlight,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  summonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summonTitle: {
    ...TYPOGRAPHY.section,
    color: THEME.text.primary,
  },
  rosterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.text.secondary,
  },

  pitySection: {
    gap: SPACING.sm,
  },
  pityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pityLabel: {
    ...TYPOGRAPHY.label,
    color: THEME.text.secondary,
  },
  pityValue: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.status.epic,
  },
  pityBarBg: {
    height: 8,
    backgroundColor: `${THEME.text.muted}20`,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  pityBarFill: {
    height: '100%',
    backgroundColor: THEME.status.epic,
    borderRadius: RADIUS.sm,
  },

  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: THEME.card.default,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: THEME.surface.border,
  },
  costLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.text.secondary,
  },
  costValue: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.resource.tears,
  },

  summonButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  summonBtn: {
    flex: 1,
    backgroundColor: THEME.status.success,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  summonBtnDisabled: {
    opacity: 0.5,
  },
  summonBtnText: {
    ...TYPOGRAPHY.section,
    color: '#000',
    fontWeight: '800',
  },
  summonBtnX10: {
    flex: 1,
    backgroundColor: THEME.card.default,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.surface.border,
  },
  summonBtnX10Text: {
    ...TYPOGRAPHY.section,
    color: THEME.text.primary,
    fontWeight: '800',
  },

  managementCard: {
    backgroundColor: THEME.card.default,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  managementTitle: {
    ...TYPOGRAPHY.section,
    color: THEME.text.primary,
  },

  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: THEME.card.highlight,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  actionBtnContent: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  actionBtnIcon: {
    fontSize: 20,
  },
  actionBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.text.secondary,
    textAlign: 'center',
  },

  rosterBtn: {
    backgroundColor: THEME.nav.active.bg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.nav.active.border,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  rosterBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.nav.active.text,
  },

  infoCard: {
    backgroundColor: THEME.card.default,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  infoTitle: {
    ...TYPOGRAPHY.section,
    color: THEME.text.primary,
  },

  rarityList: {
    gap: SPACING.sm,
  },
  rarityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: THEME.surface.divider,
  },
  rarityEmoji: {
    fontSize: 16,
  },
  rarityName: {
    fontSize: 12,
    fontWeight: '700',
  },
});
