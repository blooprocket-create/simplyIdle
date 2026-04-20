import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { theme } from '../theme/colors';

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
            accessibilityRole="button"
            accessibilityLabel={`${chip.label}: ${chip.value}`}
          >
            <Text style={styles.chipIcon}>{chip.icon}</Text>
            <View style={styles.chipContent}>
              <Text style={styles.chipValue}>{chip.value}</Text>
              <Text style={styles.chipLabel}>{chip.label}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* Secondary resources split across 2 rows */}
      {secondary && secondary.length > 0 && (
        <View style={styles.secondaryRows}>
          <View style={styles.secondaryRow}>
            {secondary.slice(0, 3).map(chip => (
              <View key={chip.id} style={styles.resourceChip}>
                <Text style={styles.resourceChipIcon}>{chip.icon}</Text>
                <View>
                  <Text style={styles.resourceChipValue}>{chip.value}</Text>
                  <Text style={styles.resourceChipLabel}>{chip.label}</Text>
                </View>
              </View>
            ))}
          </View>
          {secondary.length > 3 && (
            <View style={styles.secondaryRow}>
              {secondary.slice(3).map(chip => (
                <View key={chip.id} style={styles.resourceChip}>
                  <Text style={styles.resourceChipIcon}>{chip.icon}</Text>
                  <View>
                    <Text style={styles.resourceChipValue}>{chip.value}</Text>
                    <Text style={styles.resourceChipLabel}>{chip.label}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Top-right action buttons */}
      <View style={styles.actions}>
        {onShopPress && (
          <Pressable
            style={styles.actionBtn}
            onPress={onShopPress}
            accessibilityRole="button"
            accessibilityLabel="Shop"
          >
            <Text style={styles.actionIcon}>🛒</Text>
          </Pressable>
        )}
        {onSettingsPress && (
          <Pressable
            style={styles.actionBtn}
            onPress={onSettingsPress}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
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
  secondaryRows: {
    gap: theme.spacing.xs,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  resourceChip: {
    flex: 1,
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
  resourceChipLabel: {
    color: theme.text.tertiary,
    fontSize: 9,
    marginTop: 1,
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
