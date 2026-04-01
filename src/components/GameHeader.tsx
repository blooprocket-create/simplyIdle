import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Text, StatusBar } from 'react-native';
import { THEME, TYPOGRAPHY, SPACING, Z_INDEX, RADIUS } from '../theme';

interface GameHeaderProps {
  playerName: string;
  playerVipStatus: string;
  playerClass: string;
  gold: number;
  diamonds: number;
  bossTearsOrdered: number;
  heroShards: number;
  essence: number;
  dps: number;
  power: number;
  onActionPress: (action: 'stats' | 'shop' | 'settings' | 'events') => void;
}

export default function GameHeader({
  playerName,
  playerVipStatus,
  playerClass,
  gold,
  diamonds,
  bossTearsOrdered,
  heroShards,
  essence,
  dps,
  power,
  onActionPress,
}: GameHeaderProps) {
  const [showStatTip, setShowStatTip] = useState(false);

 const formatNumber = (num: number): string => {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.header.bg} />

      {/* Left: Player Identity */}
      <View style={styles.left}>
        <View style={styles.playerIdentityRow}>
          <Text style={styles.playerName} numberOfLines={1}>
            {playerName}
          </Text>
          <Text style={styles.playerVipStatus} numberOfLines={1}>
            {playerVipStatus}
          </Text>
        </View>
        <Text style={styles.playerClass}>{playerClass}</Text>
      </View>

      {/* Center: Core Resources */}
      <View style={styles.center}>
        <Pressable style={styles.resourceChip} onPress={() => {}}>
          <Text style={styles.resourceIcon}>💰</Text>
          <Text style={styles.resourceValue}>{formatNumber(gold)}</Text>
        </Pressable>
        <Pressable style={styles.resourceChip} onPress={() => {}}>
          <Text style={styles.resourceIcon}>💎</Text>
          <Text style={styles.resourceValue}>{formatNumber(diamonds)}</Text>
        </Pressable>
        <Pressable style={styles.resourceChip} onPress={() => {}}>
          <Text style={styles.resourceIcon}>💧</Text>
          <Text style={styles.resourceValue}>{formatNumber(bossTearsOrdered)}</Text>
        </Pressable>
        <Pressable style={styles.resourceChip} onPress={() => {}}>
          <Text style={styles.resourceIcon}>💠</Text>
          <Text style={styles.resourceValue}>{formatNumber(heroShards)}</Text>
        </Pressable>
        <Pressable style={styles.resourceChip} onPress={() => {}}>
          <Text style={styles.resourceIcon}>✨</Text>
          <Text style={styles.resourceValue}>{formatNumber(essence)}</Text>
        </Pressable>
      </View>

      {/* Right: Key Stats + Actions */}
      <View style={styles.right}>
        <Pressable
          style={styles.statButton}
          onPress={() => setShowStatTip(!showStatTip)}
        >
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>DPS</Text>
            <Text style={styles.statValueDps}>{formatNumber(dps)}</Text>
          </View>
        </Pressable>

        <Pressable style={styles.actionButton} onPress={() => onActionPress('settings')}>
          <Text style={styles.actionIcon}>⚙️</Text>
        </Pressable>
      </View>

      {/* Stat Tooltip (optional expanded view) */}
      {showStatTip && (
        <View style={styles.statTooltip}>
          <Text style={styles.tooltipLabel}>Combat Stats</Text>
          <View style={styles.tooltipRow}>
            <Text style={styles.tooltipKey}>DPS:</Text>
            <Text style={styles.tooltipValue}>{formatNumber(dps)}</Text>
          </View>
          <View style={styles.tooltipRow}>
            <Text style={styles.tooltipKey}>Power:</Text>
            <Text style={styles.tooltipValue}>{formatNumber(power)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: THEME.header.bg,
    borderBottomWidth: 1,
    borderBottomColor: THEME.header.border,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    zIndex: Z_INDEX.header,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    minHeight: 50,
  },

  left: {
    flex: 0.32,
    minWidth: 94,
  },
  playerIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  playerName: {
    ...TYPOGRAPHY.section,
    color: THEME.text.primary,
    flexShrink: 1,
  },
  playerVipStatus: {
    fontSize: 9,
    color: '#FFE07A',
    fontWeight: '700',
    flexShrink: 1,
  },
  playerClass: {
    fontSize: 9,
    color: THEME.text.tertiary,
    fontWeight: '600',
    marginTop: 2,
  },

  center: {
    flex: 0.5,
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  resourceChip: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.card.default,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.xs,
    gap: 2,
    borderWidth: 1,
    borderColor: THEME.surface.border,
  },
  resourceIcon: {
    fontSize: 10,
  },
  resourceValue: {
    fontSize: 8,
    fontWeight: '700',
    color: THEME.text.primary,
  },

  right: {
    flex: 0.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.xs,
  },
  statButton: {
    backgroundColor: THEME.card.highlight,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: THEME.surface.border,
  },
  statRow: {
    alignItems: 'center',
    gap: 2,
  },
  statLabel: {
    fontSize: 8,
    color: THEME.text.secondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValueDps: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.combat.dps,
  },

  actionButton: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    backgroundColor: THEME.header.actionBtn,
    borderWidth: 1,
    borderColor: THEME.header.actionBtnBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: {
    fontSize: 14,
  },

  statTooltip: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    backgroundColor: THEME.card.highlight,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minWidth: 140,
    zIndex: Z_INDEX.modal,
  },
  tooltipLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: THEME.text.secondary,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
    letterSpacing: 0.5,
  },
  tooltipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  tooltipKey: {
    fontSize: 9,
    color: THEME.text.secondary,
    fontWeight: '600',
  },
  tooltipValue: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.text.primary,
  },
});
