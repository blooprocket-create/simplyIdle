import React, { useState, useMemo, Suspense } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { theme } from '../theme/colors';
import MobileNavigation, { MobileTab } from '../components/MobileNavigation';
import MobileHeader from '../components/MobileHeader';
import WarfrontTab from './tabs/WarfrontTab';
import RosterTab from './tabs/RosterTab';
import EngineTab from './tabs/EngineTab';
import ProgressTab from './tabs/ProgressTab';
import { useGameState, getCharacterSaveSlot, getMaxHeatForLevel } from '../useGameState';
import { PlayerClass, getMonsterForWave, getRebirthWaveRequirement } from '../gameConfig';
import { fmt } from '../utils';

const SocialTabContent = React.lazy(() =>
  import('./tabs/SocialTabContent').then(m => ({ default: m.SocialTabContent })),
);

interface MobileGameScreenProps {
  accountName: string;
  onLogout: () => void;
}

export default function MobileGameScreen({
  accountName,
  onLogout: _onLogout,
}: MobileGameScreenProps) {
  const [currentTab, setCurrentTab] = useState<MobileTab>('warfront');
  const [selectedCharacterClass] = useState<PlayerClass | null>(null);

  // Load game state
  const gameState = useGameState(
    selectedCharacterClass
      ? getCharacterSaveSlot(accountName, selectedCharacterClass)
      : '__character_slot_preview__'
  );

  const { state, stats, burst, rebirth, autoEquipBestHeroes, autoRecycleHeroes, toggleEquipHero, summonHero, allocateStat, claimWeeklyTrack, claimMission } = gameState;
  const teamSlotCap = Math.max(4, Math.min(6, state.teamSlotsUnlocked ?? 4));

  // Computed combat values
  const monster = getMonsterForWave(state.wave || 1);
  const isBoss = (state.wave || 1) % 10 === 0;
  const burstCost = 20;
  const canBurst = (state.burstCharge || 0) >= burstCost;
  const maxHeat = getMaxHeatForLevel(state.level || 1);
  const rebirthWaveRequirement = getRebirthWaveRequirement(state.prestigeCount || 0);
  const canRebirth = (state.highestWaveReached || 1) >= rebirthWaveRequirement;
  const rebirthWavesLeft = Math.max(0, rebirthWaveRequirement - (state.highestWaveReached || 1));

  // Approximate danger score (simplified — no affix data on mobile yet)
  const dangerScore = state.teamHp > 0
    ? Math.max(0, Math.min(100, (1 - state.teamHp / Math.max(1, state.teamMaxHp)) * 120))
    : 0;
  const dangerLabel = dangerScore < 25 ? 'Low' : dangerScore < 55 ? 'Moderate' : dangerScore < 80 ? 'High' : 'Critical';

  const [socialPendingCount, setSocialPendingCount] = useState(0);

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
    {
      id: 'social' as MobileTab,
      icon: '💬',
      label: 'Social',
      badge: socialPendingCount > 0 ? socialPendingCount : undefined,
    },
  ], [state.heroRoster?.length, state.unspentStatPoints, socialPendingCount]);

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
      value: fmt(stats.dps || 0),
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
      value: fmt(state.gold || 0),
    },
    {
      id: 'diamonds',
      icon: '💎',
      label: 'Diamonds',
      value: fmt(state.diamonds || 0),
    },
    {
      id: 'tears',
      icon: '💧',
      label: 'Tears',
      value: fmt(state.bossTears || 0),
    },
    {
      id: 'shards',
      icon: '💠',
      label: 'Shards',
      value: fmt(state.heroShards || 0),
    },
    {
      id: 'essence',
      icon: '✨',
      label: 'Essence',
      value: fmt(state.essence || 0),
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
            monsterName={monster.name}
            teamHp={state.teamHp || 0}
            teamMaxHp={state.teamMaxHp || 1}
            monsterHp={state.monsterHp || 0}
            monsterMaxHp={state.monsterMaxHp || 1}
            teamDps={stats.dps || 0}
            dangerScore={dangerScore}
            dangerLabel={dangerLabel}
            isBoss={isBoss}
            canBurst={canBurst}
            burstCharge={state.burstCharge || 0}
            burstCost={burstCost}
            canRebirth={canRebirth}
            rebirthWavesLeft={rebirthWavesLeft}
            rebirthThreshold={rebirthWaveRequirement}
            activeTeamCount={state.activeTeamHeroIds?.length || 0}
            teamSlotCap={teamSlotCap}
            onBurst={() => burst(4)}
            onRebirth={() => rebirth()}
            onEditTeam={() => setCurrentTab('roster')}
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
            onAutoEquip={() => autoEquipBestHeroes()}
            onAutoRecycle={() => autoRecycleHeroes()}
            onToggleHero={(heroId: string) => toggleEquipHero(heroId)}
            onEditTeam={() => setCurrentTab('warfront')}
            onSummon={() => summonHero()}
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
            onAllocateStat={(stat: string) => allocateStat(stat as any)}
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
            onClaimWeekly={(ms: number) => claimWeeklyTrack(ms)}
            onClaimMission={(missionId: string) => claimMission(missionId)}
          />
        )}

        {currentTab === 'social' && selectedCharacterClass && (
          <Suspense fallback={<View style={styles.loadingWrap}><ActivityIndicator color={theme.accent.gold} /><Text style={styles.loadingText}>Loading Social...</Text></View>}>
            <SocialTabContent
              tab="social"
              accountName={accountName}
              publicUsername={accountName}
              level={state.level || 1}
              highestWaveReached={state.highestWaveReached || 1}
              vipLevel={state.vipLevel || 0}
              diamonds={state.diamonds || 0}
              saveSlotId={getCharacterSaveSlot(accountName, selectedCharacterClass)}
              isAdmin={false}
              onPendingRequestsCountChange={setSocialPendingCount}
            />
          </Suspense>
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
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: theme.text.secondary,
  },
});
