import React, { useState, useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '../theme/colors';
import MobileNavigation, { MobileTab } from '../components/MobileNavigation';
import MobileHeader from '../components/MobileHeader';
import WarfrontTab from './tabs/WarfrontTab';
import RosterTab from './tabs/RosterTab';
import EngineTab from './tabs/EngineTab';
import ProgressTab from './tabs/ProgressTab';
import { useGameState, getCharacterSaveSlot, getSaveStorageKey } from '../useGameState';
import { CLASSES } from '../gameConfig';

interface MobileGameScreenProps {
  accountName: string;
  onLogout: () => void;
}

export default function MobileGameScreen({
  accountName,
  onLogout,
}: MobileGameScreenProps) {
  const [currentTab, setCurrentTab] = useState<MobileTab>('warfront');
  const [selectedCharacterClass, setSelectedCharacterClass] = useState<string | null>(null);

  // Load game state
  const gameState = useGameState(
    selectedCharacterClass
      ? getCharacterSaveSlot(accountName, selectedCharacterClass as any)
      : '__character_slot_preview__'
  );

  const { state, stats, burst } = gameState;
  const teamSlotCap = Math.max(4, Math.min(6, state.teamSlotsUnlocked ?? 4));

  // Prepare navigation tabs with badges
  const navTabs = useMemo(() => [
    {
      id: 'warfront' as MobileTab,
      icon: '⚔️',
      label: 'Combat',
      badge: undefined,
    },
    {
      id: 'roster' as MobileTab,
      icon: '👥',
      label: 'Roster',
      badge: state.heroRoster?.length || 0,
    },
    {
      id: 'engine' as MobileTab,
      icon: '⚙️',
      label: 'Growth',
      badge: state.unspentStatPoints > 0 ? Math.min(9, state.unspentStatPoints) : undefined,
    },
    {
      id: 'progress' as MobileTab,
      icon: '🏆',
      label: 'Legends',
      badge: undefined,
    },
  ], [state.heroRoster?.length, state.unspentStatPoints]);

  // Prepare header chips (primary currency/resources)
  const headerPrimary = useMemo(() => [
    {
      id: 'wave',
      icon: '🌊',
      label: 'Wave',
      value: `${state.wave || 1}`,
    },
    {
      id: 'power',
      icon: '⚡',
      label: 'Power',
      value: `${Math.floor(stats.dps || 0)}`,
    },
    {
      id: 'team',
      icon: '👤',
      label: 'Team',
      value: `${state.activeTeamHeroIds?.length || 0}/${teamSlotCap}`,
    },
  ], [state.wave, stats.dps, state.activeTeamHeroIds, teamSlotCap]);

  // Prepare header chips (secondary resources - scrollable)
  const headerSecondary = useMemo(() => [
    {
      id: 'gold',
      icon: '💰',
      label: 'Gold',
      value: `${Math.floor(state.gold || 0)}`,
    },
    {
      id: 'diamonds',
      icon: '💎',
      label: 'Diamonds',
      value: `${state.diamonds || 0}`,
    },
    {
      id: 'tears',
      icon: '💧',
      label: 'Tears',
      value: `${state.bossTears || 0}`,
    },
    {
      id: 'shards',
      icon: '💠',
      label: 'Shards',
      value: `${Math.floor(state.heroShards || 0)}`,
    },
    {
      id: 'essence',
      icon: '✨',
      label: 'Essence',
      value: `${Math.floor(state.essence || 0)}`,
    },
  ], [state.gold, state.diamonds, state.bossTears, state.heroShards, state.essence]);

  return (
    <View style={styles.container}>
      {/* Header with resources */}
      <MobileHeader
        primary={headerPrimary}
        secondary={headerSecondary}
        onShopPress={() => {}} // TODO: Implement shop
        onSettingsPress={() => {}} // TODO: Implement settings
      />

      {/* Tab content */}
      <View style={styles.content}>
        {currentTab === 'warfront' && (
          <WarfrontTab
            wave={state.wave || 1}
            monsterName="Monster"
            teamHp={state.teamHp || 0}
            teamMaxHp={state.teamMaxHp || 1}
            monsterHp={state.monsterHp || 0}
            monsterMaxHp={state.monsterMaxHp || 1}
            teamDps={stats.dps || 0}
            dangerScore={0}
            dangerLabel="Moderate"
            isBoss={false}
            canBurst={false}
            burstCharge={state.burstCharge || 0}
            burstCost={10}
            canRebirth={false}
            rebirthWavesLeft={0}
            rebirthThreshold={300}
            activeTeamCount={state.activeTeamHeroIds?.length || 0}
            teamSlotCap={teamSlotCap}
            onBurst={() => burst(4)}
            onRebirth={() => {}}
            onEditTeam={() => {}}
            onOpenStats={() => setCurrentTab('engine')}
            combatLog={state.combatLog?.slice(0, 5) || []}
          />
        )}

        {currentTab === 'roster' && (
          <RosterTab
            heroCount={state.heroRoster?.length || 0}
            activeTeamCount={state.activeTeamHeroIds?.length || 0}
            teamSlotCap={teamSlotCap}
            heroShards={state.heroShards || 0}
            heroes={
              state.heroRoster?.map((hero: any) => ({
                uid: hero.uid,
                name: hero.name,
                emoji: hero.emoji,
                level: hero.level,
                rarity: hero.rarity,
                heroClass: hero.heroClass,
                rank: hero.rank,
                inActiveTeam: state.activeTeamHeroIds?.includes(hero.uid) || false,
              })) || []
            }
            onAutoEquip={() => {}}
            onAutoRecycle={() => {}}
            onToggleHero={() => {}}
            onEditTeam={() => {}}
            onSummon={() => {}}
            canSummon={true}
            summonCostType="free"
            summonCost={1}
            bossTearsOwned={state.bossTears || 0}
          />
        )}

        {currentTab === 'engine' && (
          <EngineTab
            playerLevel={state.level || 1}
            unspentStats={state.unspentStatPoints || 0}
            gold={state.gold || 0}
            essence={state.essence || 0}
            equipmentItemCount={state.inventoryItemIds?.length || 0}
            expeditions={[]}
            onAllocateStat={() => {}}
            onAllocateMaxStats={() => {}}
            onOpenEquipment={() => {}}
            onOpenFacilities={() => {}}
            onOpenExpeditions={() => {}}
          />
        )}

        {currentTab === 'progress' && (
          <ProgressTab
            achievementCount={state.achievements?.size || 0}
            totalAchievements={50}
            weeklyKills={state.weeklyKills || 0}
            weeklyMilestones={[]}
            missions={[]}
            nearUnlocks={[]}
            dailyLoginStreak={state.dailyLoginStreak || 0}
            highestWaveReached={state.highestWaveReached || 1}
            totalGold={state.totalGold || 0}
            totalKills={state.totalKills || 0}
            vipLevel={state.vipLevel || 0}
            vipProgress={0}
            onClaimWeekly={() => {}}
            onClaimMission={() => {}}
          />
        )}
      </View>

      {/* Bottom navigation */}
      <MobileNavigation
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        tabs={navTabs}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg.darkest,
  },
  content: {
    flex: 1,
  },
});
