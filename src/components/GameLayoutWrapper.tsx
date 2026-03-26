import React, { useEffect, useState } from 'react';
import { View, StyleSheet, SafeAreaView, Platform, useWindowDimensions, ScrollView } from 'react-native';
import { THEME, Z_INDEX, SPACING } from '../theme';
import GameHeader from './GameHeader';
import BottomNavigation, { BottomTabType } from './BottomNavigation';

/**
 * Screen components (these will be extracted from GameScreen)
 * For now, they're placeholders - we'll extract the actual implementations
 */

interface GameLayoutWrapperProps {
  accountName: string;
  playerName: string;
  playerClass: string;
  currentTab: BottomTabType;
  onTabChange: (tab: BottomTabType) => void;
  
  // Game state (simplified interface)
  gold: number;
  diamonds: number;
  dps: number;
  power: number;
  wave: number;
  
  // Callbacks
  onActionPress: (action: string) => void;
  renderBattleContent: () => React.ReactNode;
  renderHeroesContent: () => React.ReactNode;
  renderProgressionContent: () => React.ReactNode;
  renderArmoryContent: () => React.ReactNode;
  renderHubContent: () => React.ReactNode;
  
  // Notifications
  notifications?: Partial<Record<BottomTabType, number>>;
}

export default function GameLayoutWrapper({
  accountName,
  playerName,
  playerClass,
  currentTab,
  onTabChange,
  gold,
  diamonds,
  dps,
  power,
  wave,
  onActionPress,
  renderBattleContent,
  renderHeroesContent,
  renderProgressionContent,
  renderArmoryContent,
  renderHubContent,
  notifications = {},
}: GameLayoutWrapperProps) {
  const { height } = useWindowDimensions();
  const isShortScreen = height < 750;

  // Render active tab content
  const renderTabContent = () => {
    switch (currentTab) {
      case 'battle':
        return renderBattleContent();
      case 'heroes':
        return renderHeroesContent();
      case 'progression':
        return renderProgressionContent();
      case 'armory':
        return renderArmoryContent();
      case 'hub':
        return renderHubContent();
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Header with condensed resources + quick actions */}
      <GameHeader
        playerName={playerName}
        playerClass={playerClass}
        gold={gold}
        diamonds={diamonds}
        dps={dps}
        power={power}
        onActionPress={onActionPress}
      />

      {/* Main content area - scrollable tab content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          styles.contentContainer,
          isShortScreen && styles.contentContainerShort,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {renderTabContent()}
      </ScrollView>

      {/* Bottom navigation - always visible */}
      <BottomNavigation
        activeTab={currentTab}
        onTabChange={onTabChange}
        notifications={notifications}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: THEME.bg.primary,
  },
  content: {
    flex: 1,
    backgroundColor: THEME.bg.primary,
  },
  contentContainer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    gap: SPACING.lg,
  },
  contentContainerShort: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
});
