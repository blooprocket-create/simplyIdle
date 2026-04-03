import React from 'react';
import { View, StyleSheet, Pressable, Text, Platform } from 'react-native';
import { THEME, RADIUS, Z_INDEX } from '../theme';
import { debugLog } from '../telemetry';

export type BottomTabType = 'warroom' | 'battle' | 'heroes' | 'stats' | 'achievements' | 'equipment' | 'operations' | 'social';

interface BottomNavigationProps {
  activeTab: BottomTabType;
  onTabChange: (tab: BottomTabType) => void;
  notifications?: Partial<Record<BottomTabType, number>>; // count badges
}

const TAB_CONFIG: Record<BottomTabType, { icon: string; label: string }> = {
  warroom: { icon: '🎖️', label: 'War' },
  battle: { icon: '⚔️', label: 'Battle' },
  heroes: { icon: '👥', label: 'Heroes' },
  stats: { icon: '📊', label: 'Stats' },
  achievements: { icon: '🏆', label: 'Achv' },
  equipment: { icon: '🎒', label: 'Gear' },
  operations: { icon: '🏛️', label: 'Ops' },
  social: { icon: '🌐', label: 'Social' },
};

export default function BottomNavigation({ activeTab, onTabChange, notifications = {} }: BottomNavigationProps) {
  return (
    <View style={styles.root}>
      {(Object.keys(TAB_CONFIG) as BottomTabType[]).map(tab => {
        const isActive = tab === activeTab;
        const { icon, label } = TAB_CONFIG[tab];
        const notificationCount = notifications[tab];

        return (
          <Pressable
            key={tab}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => {
              debugLog('nav', 'Bottom tab pressed', { from: activeTab, to: tab });
              onTabChange(tab);
            }}
          >
            <View style={styles.tabIconWrap}>
              <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>{icon}</Text>
              {notificationCount !== undefined && notificationCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    backgroundColor: THEME.header.bg,
    borderTopWidth: 1,
    borderTopColor: THEME.header.border,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingTop: 8,
    paddingHorizontal: 4,
    justifyContent: 'space-around',
    zIndex: Z_INDEX.header,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    marginHorizontal: 2,
  },
  tabActive: {
    backgroundColor: `${THEME.nav.active.bg}80`,
  },
  tabIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tabIcon: {
    fontSize: 20,
  },
  tabIconActive: {
    transform: [{ scale: 1.1 }],
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    backgroundColor: THEME.status.error,
    borderRadius: RADIUS.full,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '800',
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: THEME.nav.inactive.text,
    textAlign: 'center',
  },
  tabLabelActive: {
    color: THEME.nav.active.text,
    fontWeight: '700',
  },
});
