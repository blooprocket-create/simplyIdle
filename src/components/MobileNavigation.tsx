import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';
import { debugLog } from '../telemetry';
import { FeedbackPressable as Pressable } from './FeedbackPressable';

export type MobileTab = 'warfront' | 'warroom' | 'roster' | 'equipment' | 'engine' | 'progress' | 'social';

interface MobileNavTab {
  id: MobileTab;
  icon: string;
  label: string;
  badge?: number | string;
}

interface MobileNavigationProps {
  currentTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  tabs: MobileNavTab[];
}

export default function MobileNavigation({ currentTab, onTabChange, tabs }: MobileNavigationProps) {
  return (
    <View style={styles.safeArea}>
      <View style={styles.navBar}>
        {tabs.map(tab => {
          const isActive = currentTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => {
                debugLog('nav', 'Mobile tab pressed', { from: currentTab, to: tab.id });
                onTabChange(tab.id);
              }}
              accessibilityRole="tab"
              accessibilityLabel={`${tab.label}${tab.badge ? `, ${tab.badge} notifications` : ''}`}
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>{tab.icon}</Text>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
              {tab.badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {typeof tab.badge === 'number' && tab.badge > 9 ? '9+' : tab.badge}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.bg.deepestBlack,
    borderTopWidth: 1,
    borderTopColor: theme.border.light,
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: theme.bg.darkest,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    minHeight: 64,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    opacity: 0.6,
  },
  tabButtonActive: {
    opacity: 1,
  },
  tabIcon: {
    fontSize: 24,
    marginBottom: 2,
  },
  tabIconActive: {
    fontSize: 28,
  },
  tabLabel: {
    fontSize: 10,
    color: theme.text.secondary,
    marginTop: 2,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: theme.accent.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 4,
    backgroundColor: theme.status.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: theme.text.primary,
    fontSize: 9,
    fontWeight: '700',
  },
});
