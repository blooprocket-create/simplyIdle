import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { theme } from '../theme/colors';
import { fmt } from '../utils';

interface HeaderChip {
  id: string;
  label: string;
  value: string;
  icon: string;
  color?: string;
  onPress?: () => void;
}

interface MobileHeaderProps {
  primary: HeaderChip[];
  secondary?: HeaderChip[];
  onSettingsPress?: () => void;
  onShopPress?: () => void;
}

export default function MobileHeader({ primary, secondary, onSettingsPress, onShopPress }: MobileHeaderProps) {
  return (
    <View style={styles.container}>
      {/* Primary row - always visible */}
      <View style={styles.chipRow}>
        {primary.map(chip => (
          <Pressable
            key={chip.id}
            style={styles.chip}
            onPress={chip.onPress}
            disabled={!chip.onPress}
          >
            <Text style={styles.chipIcon}>{chip.icon}</Text>
            <View style={styles.chipContent}>
              <Text style={styles.chipValue}>{chip.value}</Text>
              <Text style={styles.chipLabel}>{chip.label}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* Secondary row - scrollable resource chips */}
      {secondary && secondary.length > 0 && (
        <View style={styles.secondaryRow}>
          {secondary.map(chip => (
            <View key={chip.id} style={styles.resourceChip}>
              <Text style={styles.resourceChipIcon}>{chip.icon}</Text>
              <Text style={styles.resourceChipValue}>{chip.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Top-right action buttons */}
      <View style={styles.actions}>
        {onShopPress && (
          <Pressable style={styles.actionBtn} onPress={onShopPress}>
            <Text style={styles.actionIcon}>🛍️</Text>
          </Pressable>
        )}
        {onSettingsPress && (
          <Pressable style={styles.actionBtn} onPress={onSettingsPress}>
            <Text style={styles.actionIcon}>⚙️</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.bg.dark,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.light,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.bg.card,
    borderRadius: 8,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.border.subtle,
  },
  chipIcon: {
    fontSize: 18,
  },
  chipContent: {
    flex: 1,
    minWidth: 0,
  },
  chipValue: {
    color: theme.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  chipLabel: {
    color: theme.text.tertiary,
    fontSize: 10,
    marginTop: 2,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    overflow: 'hidden',
  },
  resourceChip: {
    backgroundColor: theme.bg.card,
    borderRadius: 6,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.border.subtle,
  },
  resourceChipIcon: {
    fontSize: 14,
  },
  resourceChipValue: {
    color: theme.text.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  actions: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: theme.bg.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border.subtle,
  },
  actionIcon: {
    fontSize: 18,
  },
});
