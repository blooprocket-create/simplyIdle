import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme/colors';
import MobileCard from '../../components/MobileCard';
import SectionHeader from '../../components/SectionHeader';
import MobileScrollContainer from '../../components/MobileScrollContainer';
import { FeedbackPressable as Pressable } from '../../components/FeedbackPressable';
import { fmt } from '../../utils';
import type { StatKey } from '../../gameConfig';

interface EngineTabProps {
  playerLevel: number;
  unspentStats: number;
  gold: number;
  essence: number;
  equipmentItemCount: number;
  expeditions: Array<{
    id: string;
    name: string;
    timeLeft: string;
  }>;
  onAllocateStat: (stat: StatKey) => void;
  onAllocateMaxStats: () => void;
  onOpenEquipment: () => void;
  onOpenFacilities: () => void;
  onOpenExpeditions: () => void;
}

export default function EngineTab(props: EngineTabProps) {
  const [statFocus, setStatFocus] = useState<string | null>(null);
  const statButtons: Array<{ label: string; key: StatKey }> = [
    { label: 'STR', key: 'strength' },
    { label: 'VIT', key: 'vitality' },
    { label: 'AGI', key: 'agility' },
    { label: 'INT', key: 'intelligence' },
    { label: 'SPR', key: 'spirit' },
  ];

  return (
    <MobileScrollContainer>
      <SectionHeader icon="⚙️" title="Growth Engine" subtitle="Stats, gear, and infrastructure" />

      {/* Level and XP */}
      <MobileCard
        icon="📊"
        title={`Level ${props.playerLevel}`}
        sections={[
          {
            items: [
              {
                label: 'Unspent Stat Points',
                value: props.unspentStats,
                highlight: props.unspentStats > 0,
              },
            ],
          },
        ]}
      />

      {/* Stat allocation */}
      {props.unspentStats > 0 && (
        <View style={styles.statGrid}>
          <Text style={styles.gridTitle}>Allocate Stats</Text>
          <View style={styles.statButtons}>
            {statButtons.map(stat => (
              <Pressable
                key={stat.key}
                style={[styles.statBtn, statFocus === stat.label && styles.statBtnFocused]}
                onPress={() => {
                  props.onAllocateStat(stat.key);
                  setStatFocus(stat.label);
                  setTimeout(() => setStatFocus(null), 300);
                }}
              >
                <Text style={styles.statBtnText}>{stat.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.allocateMaxBtn} onPress={props.onAllocateMaxStats}>
            <Text style={styles.allocateMaxBtnText}>Allocate All ({props.unspentStats})</Text>
          </Pressable>
        </View>
      )}

      {/* Resources */}
      <View style={styles.resourcesGrid}>
        <View style={styles.resourceCard}>
          <Text style={styles.resourceIcon}>💰</Text>
          <Text style={styles.resourceLabel}>Gold</Text>
          <Text style={styles.resourceValue}>{fmt(props.gold)}</Text>
        </View>
        <View style={styles.resourceCard}>
          <Text style={styles.resourceIcon}>⚡</Text>
          <Text style={styles.resourceLabel}>Essence</Text>
          <Text style={styles.resourceValue}>{fmt(props.essence)}</Text>
        </View>
      </View>

      {/* Equipment */}
      <MobileCard
        icon="🎒"
        title="Armory"
        sections={[
          {
            items: [
              {
                label: 'Items in Inventory',
                value: props.equipmentItemCount,
              },
            ],
          },
        ]}
        action={{
          label: 'Manage Equipment',
          onPress: props.onOpenEquipment,
          variant: 'primary',
        }}
      />

      {/* Expeditions */}
      <MobileCard
        icon="🗺️"
        title="Expeditions"
        sections={[
          {
            items:
              props.expeditions.length === 0
                ? [{ label: 'Status', value: 'No expeditions active' }]
                : props.expeditions.map(exp => ({
                    label: exp.name,
                    value: exp.timeLeft,
                  })),
          },
        ]}
        action={{
          label: 'Manage Expeditions',
          onPress: props.onOpenExpeditions,
          variant: 'secondary',
        }}
      />

      {/* Facilities */}
      <MobileCard
        icon="🏛️"
        title="Facilities"
        sections={[
          {
            items: [
              {
                label: 'Status',
                value: 'Upgrade infrastructure for bonuses',
              },
            ],
          },
        ]}
        action={{
          label: 'Manage Facilities',
          onPress: props.onOpenFacilities,
          variant: 'secondary',
        }}
      />
    </MobileScrollContainer>
  );
}

const styles = StyleSheet.create({
  statGrid: {
    backgroundColor: theme.bg.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border.light,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  gridTitle: {
    color: theme.text.primary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: theme.spacing.md,
  },
  statButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  statBtn: {
    flex: 1,
    backgroundColor: theme.bg.darker,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border.medium,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  statBtnFocused: {
    backgroundColor: theme.accent.primary,
    borderColor: theme.accent.primary,
  },
  statBtnText: {
    color: theme.text.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  allocateMaxBtn: {
    backgroundColor: theme.accent.primary,
    borderRadius: 8,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  allocateMaxBtnText: {
    color: theme.bg.deepestBlack,
    fontSize: 12,
    fontWeight: '700',
  },
  resourcesGrid: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  resourceCard: {
    flex: 1,
    backgroundColor: theme.bg.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border.light,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
  },
  resourceIcon: {
    fontSize: 28,
    marginBottom: theme.spacing.sm,
  },
  resourceLabel: {
    color: theme.text.secondary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
  },
  resourceValue: {
    color: theme.text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});
