import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Text, StatusBar, useWindowDimensions } from 'react-native';
import { THEME, TYPOGRAPHY, SPACING, Z_INDEX, RADIUS } from '../theme';
import { debugLog } from '../telemetry';
import { t } from '../i18n';
import { FeedbackPressable as Pressable } from './FeedbackPressable';

interface GameHeaderProps {
  playerName: string;
  playerVipStatus: string;
  playerClass: string;
  playerExpStatus: string;
  onlineSyncState: 'local-only' | 'syncing' | 'synced' | 'conflict' | 'error';
  onlineSyncAt: number | null;
  gold: number;
  diamonds: number;
  bossTearsOrdered: number;
  heroShards: number;
  essence: number;
  dps: number;
  power: number;
  mailUnreadCount: number;
  canRebirthNow: boolean;
  onActionPress: (action: 'stats' | 'shop' | 'settings' | 'events' | 'mail') => void;
  onRebirthPress: () => void;
}

export default function GameHeader({
  playerName,
  playerVipStatus,
  playerClass,
  playerExpStatus,
  onlineSyncState,
  onlineSyncAt,
  gold,
  diamonds,
  bossTearsOrdered,
  heroShards,
  essence,
  dps,
  power,
  mailUnreadCount,
  canRebirthNow,
  onActionPress,
  onRebirthPress,
}: GameHeaderProps) {
  const [showStatTip, setShowStatTip] = useState(false);
  const { width } = useWindowDimensions();
  const twoRowResources = width <= 980;

  const formatNumber = (num: number): string => {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
  };

  const syncMeta = useMemo(() => {
    if (onlineSyncState === 'synced') {
      // eslint-disable-next-line react-hooks/purity -- intentional: sync age display needs current time
      const ageSec = onlineSyncAt ? Math.max(0, Math.floor((Date.now() - onlineSyncAt) / 1000)) : 0;
      return {
        label: ageSec <= 10 ? t('header.cloudSyncedNow') : t('header.cloudSyncedAgo', { seconds: ageSec }),
        color: '#7CE58D',
      };
    }
    if (onlineSyncState === 'syncing') return { label: t('header.cloudSyncing'), color: '#FFCC66' };
    if (onlineSyncState === 'conflict') return { label: t('header.cloudConflict'), color: '#FFB86B' };
    if (onlineSyncState === 'error') return { label: t('header.cloudSyncError'), color: '#FF7C7C' };
    return { label: t('header.localSaveOnly'), color: '#A8B0C3' };
  }, [onlineSyncState, onlineSyncAt]);

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
        <Text style={styles.playerExpStatus} numberOfLines={1}>
          {playerExpStatus}
        </Text>
        <Text style={[styles.syncStatus, { color: syncMeta.color }]} numberOfLines={1}>
          {syncMeta.label}
        </Text>
      </View>

      {/* Center: Core Resources */}
      <View style={[styles.center, !twoRowResources && styles.centerSingleRow]}>
        {twoRowResources ? (
          <>
            <View style={styles.resourceRow}>
              <Pressable
                style={styles.resourceChip}
                onPress={() => {}}
                accessibilityRole="text"
                accessibilityLabel={t('header.goldA11y', { amount: formatNumber(gold) })}
              >
                <Text style={styles.resourceIcon}>💰</Text>
                <Text style={styles.resourceValue}>{formatNumber(gold)}</Text>
              </Pressable>
              <Pressable
                style={styles.resourceChip}
                onPress={() => {}}
                accessibilityRole="text"
                accessibilityLabel={t('header.diamondsA11y', { amount: formatNumber(diamonds) })}
              >
                <Text style={styles.resourceIcon}>💎</Text>
                <Text style={styles.resourceValue}>{formatNumber(diamonds)}</Text>
              </Pressable>
              <Pressable
                style={styles.resourceChip}
                onPress={() => {}}
                accessibilityRole="text"
                accessibilityLabel={t('header.bossTearsA11y', { amount: formatNumber(bossTearsOrdered) })}
              >
                <Text style={styles.resourceIcon}>💧</Text>
                <Text style={styles.resourceValue}>{formatNumber(bossTearsOrdered)}</Text>
              </Pressable>
            </View>
            <View style={styles.resourceRow}>
              <Pressable
                style={styles.resourceChip}
                onPress={() => {}}
                accessibilityRole="text"
                accessibilityLabel={t('header.heroShardsA11y', { amount: formatNumber(heroShards) })}
              >
                <Text style={styles.resourceIcon}>💠</Text>
                <Text style={styles.resourceValue}>{formatNumber(heroShards)}</Text>
              </Pressable>
              <Pressable
                style={styles.resourceChip}
                onPress={() => {}}
                accessibilityRole="text"
                accessibilityLabel={t('header.essenceA11y', { amount: formatNumber(essence) })}
              >
                <Text style={styles.resourceIcon}>✨</Text>
                <Text style={styles.resourceValue}>{formatNumber(essence)}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Pressable
              style={styles.resourceChip}
              onPress={() => {}}
              accessibilityRole="text"
              accessibilityLabel={t('header.goldA11y', { amount: formatNumber(gold) })}
            >
              <Text style={styles.resourceIcon}>💰</Text>
              <Text style={styles.resourceValue}>{formatNumber(gold)}</Text>
            </Pressable>
            <Pressable
              style={styles.resourceChip}
              onPress={() => {}}
              accessibilityRole="text"
              accessibilityLabel={t('header.diamondsA11y', { amount: formatNumber(diamonds) })}
            >
              <Text style={styles.resourceIcon}>💎</Text>
              <Text style={styles.resourceValue}>{formatNumber(diamonds)}</Text>
            </Pressable>
            <Pressable
              style={styles.resourceChip}
              onPress={() => {}}
              accessibilityRole="text"
              accessibilityLabel={t('header.bossTearsA11y', { amount: formatNumber(bossTearsOrdered) })}
            >
              <Text style={styles.resourceIcon}>💧</Text>
              <Text style={styles.resourceValue}>{formatNumber(bossTearsOrdered)}</Text>
            </Pressable>
            <Pressable
              style={styles.resourceChip}
              onPress={() => {}}
              accessibilityRole="text"
              accessibilityLabel={t('header.heroShardsA11y', { amount: formatNumber(heroShards) })}
            >
              <Text style={styles.resourceIcon}>💠</Text>
              <Text style={styles.resourceValue}>{formatNumber(heroShards)}</Text>
            </Pressable>
            <Pressable
              style={styles.resourceChip}
              onPress={() => {}}
              accessibilityRole="text"
              accessibilityLabel={t('header.essenceA11y', { amount: formatNumber(essence) })}
            >
              <Text style={styles.resourceIcon}>✨</Text>
              <Text style={styles.resourceValue}>{formatNumber(essence)}</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Right: Key Stats + Actions */}
      <View style={styles.right}>
        {canRebirthNow && (
          <Pressable
            style={[styles.actionButton, styles.rebirthButton]}
            onPress={onRebirthPress}
            accessibilityRole="button"
            accessibilityLabel="Rebirth ready, tap to ascend"
          >
            <Text style={styles.actionIcon}>♾️</Text>
            <View style={styles.rebirthPulse} />
          </Pressable>
        )}

        <Pressable
          style={styles.actionButton}
          onPress={() => {
            debugLog('header', 'Settings action pressed');
            onActionPress('settings');
          }}
          accessibilityRole="button"
          accessibilityLabel={t('header.settingsA11y')}
        >
          <Text style={styles.actionIcon}>⚙️</Text>
        </Pressable>

        <Pressable
          style={styles.actionButton}
          onPress={() => {
            debugLog('header', 'Mail action pressed');
            onActionPress('mail');
          }}
          accessibilityRole="button"
          accessibilityLabel={t('header.mailA11y', {
            unreadSuffix: mailUnreadCount > 0 ? `, ${mailUnreadCount} unread` : '',
          })}
        >
          <Text style={styles.actionIcon}>✉️</Text>
          {mailUnreadCount > 0 && (
            <View style={styles.actionBadge}>
              <Text style={styles.actionBadgeText}>{mailUnreadCount > 99 ? '99+' : `${mailUnreadCount}`}</Text>
            </View>
          )}
        </Pressable>

        <Pressable
          style={styles.statButton}
          onPress={() => {
            debugLog('header', 'Stat tooltip toggled', { nextOpen: !showStatTip });
            setShowStatTip(!showStatTip);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('header.dpsA11y', { amount: formatNumber(dps) })}
        >
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>{t('header.dps')}</Text>
            <Text style={styles.statValueDps}>{formatNumber(dps)}</Text>
          </View>
        </Pressable>
      </View>

      {/* Stat Tooltip (optional expanded view) */}
      {showStatTip && (
        <View style={styles.statTooltip}>
          <Text style={styles.tooltipLabel}>{t('header.combatStats')}</Text>
          <View style={styles.tooltipRow}>
            <Text style={styles.tooltipKey}>{t('header.dpsLabel')}</Text>
            <Text style={styles.tooltipValue}>{formatNumber(dps)}</Text>
          </View>
          <View style={styles.tooltipRow}>
            <Text style={styles.tooltipKey}>{t('header.powerLabel')}</Text>
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
  playerExpStatus: {
    fontSize: 8,
    color: '#9BC8FF',
    fontWeight: '700',
    marginTop: 1,
  },
  syncStatus: {
    fontSize: 8,
    fontWeight: '700',
    marginTop: 2,
  },

  center: {
    flex: 0.5,
    gap: SPACING.xs,
  },
  centerSingleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resourceRow: {
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
  actionBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#B3261E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  actionBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#FFFFFF',
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

  rebirthButton: {
    borderWidth: 1,
    borderColor: '#C084FC',
    backgroundColor: '#2D1854',
    borderRadius: 6,
  },
  rebirthPulse: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C084FC',
  },
});
