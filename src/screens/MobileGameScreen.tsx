import React, { useState, useMemo, Suspense } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Modal, Pressable, ScrollView } from 'react-native';
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
import { t } from '../i18n';

const SocialTabContent = React.lazy(() =>
  import('./tabs/SocialTabContent').then(m => ({ default: m.SocialTabContent })),
);

interface MobileGameScreenProps {
  accountName: string;
  onLogout: () => void;
}

export default function MobileGameScreen({ accountName, onLogout: _onLogout }: MobileGameScreenProps) {
  const [currentTab, setCurrentTab] = useState<MobileTab>('warfront');
  const [activeModal, setActiveModal] = useState<'shop' | 'settings' | null>(null);
  const [selectedCharacterClass] = useState<PlayerClass | null>(null);

  // Load game state
  const gameState = useGameState(
    selectedCharacterClass ? getCharacterSaveSlot(accountName, selectedCharacterClass) : '__character_slot_preview__',
  );

  const {
    state,
    stats,
    burst,
    rebirth,
    autoEquipBestHeroes,
    autoRecycleHeroes,
    autoDismantleEquipment,
    toggleEquipHero,
    summonHero,
    allocateStat,
    buyGoldShopItem,
    buyDiamondShopItem,
    setAutoUsePotion,
    setAutoUsePotionThreshold,
    setAutoSummonEnabled,
    setAutoBurstEnabled,
    setAutoTempoEnabled,
    setAutoTempoTarget,
    claimWeeklyTrack,
    claimMission,
  } = gameState;
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
  const dangerScore =
    state.teamHp > 0 ? Math.max(0, Math.min(100, (1 - state.teamHp / Math.max(1, state.teamMaxHp)) * 120)) : 0;
  const dangerLabel = dangerScore < 25 ? 'Low' : dangerScore < 55 ? 'Moderate' : dangerScore < 80 ? 'High' : 'Critical';

  const [socialPendingCount, setSocialPendingCount] = useState(0);

  // Prepare navigation tabs with badges
  const navTabs = useMemo(
    () => [
      {
        id: 'warfront' as MobileTab,
        icon: '⚔️',
        label: 'Combat',
        badge: undefined,
      },
      {
        id: 'warroom' as MobileTab,
        icon: '🛰️',
        label: 'War Room',
        badge: canRebirth ? 1 : undefined,
      },
      {
        id: 'roster' as MobileTab,
        icon: '👥',
        label: 'Roster',
        badge: state.heroRoster?.length || 0,
      },
      {
        id: 'equipment' as MobileTab,
        icon: '🎒',
        label: 'Armory',
        badge: state.inventoryItemIds?.length ? Math.min(9, state.inventoryItemIds.length) : undefined,
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
    ],
    [canRebirth, state.heroRoster?.length, state.inventoryItemIds?.length, state.unspentStatPoints, socialPendingCount],
  );

  // Prepare header chips (primary currency/resources)
  const headerPrimary = useMemo(
    () => [
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
    ],
    [state.wave, stats.dps, state.activeTeamHeroIds, teamSlotCap],
  );

  // Prepare header chips (secondary resources - scrollable)
  const headerSecondary = useMemo(
    () => [
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
    ],
    [state.gold, state.diamonds, state.bossTears, state.heroShards, state.essence],
  );

  return (
    <View style={styles.container}>
      {/* Header with resources */}
      <MobileHeader
        primary={headerPrimary}
        secondary={headerSecondary}
        onShopPress={() => setActiveModal('shop')}
        onSettingsPress={() => setActiveModal('settings')}
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

        {currentTab === 'warroom' && (
          <ScrollView contentContainerStyle={styles.panelWrap}>
            <View style={styles.panelCard}>
              <Text style={styles.panelTitle}>🛰️ War Room</Text>
              <Text style={styles.panelLine}>
                Wave {state.wave || 1} • Peak {state.highestWaveReached || 1}
              </Text>
              <Text style={styles.panelLine}>
                Danger: {dangerLabel} ({dangerScore.toFixed(0)}%)
              </Text>
              <Text style={styles.panelLine}>
                Team: {state.activeTeamHeroIds?.length || 0}/{teamSlotCap}
              </Text>
              <Pressable style={styles.primaryBtn} onPress={() => setCurrentTab('warfront')}>
                <Text style={styles.primaryBtnText}>{t('mobile.openWarfront')}</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, !canRebirth && styles.btnDisabled]}
                disabled={!canRebirth}
                onPress={() => rebirth()}
              >
                <Text style={styles.primaryBtnText}>
                  {canRebirth ? t('mobile.rebirthNow') : t('mobile.rebirthAt', { wave: rebirthWaveRequirement })}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
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

        {currentTab === 'equipment' && (
          <ScrollView contentContainerStyle={styles.panelWrap}>
            <View style={styles.panelCard}>
              <Text style={styles.panelTitle}>🎒 {t('mobile.armory')}</Text>
              <Text style={styles.panelLine}>
                {t('mobile.inventoryItems', { count: state.inventoryItemIds?.length || 0 })}
              </Text>
              <Text style={styles.panelLine}>{t('mobile.scrap', { value: fmt(state.equipmentScrap || 0) })}</Text>
              <Text style={styles.panelLine}>{t('mobile.essence', { value: fmt(state.essence || 0) })}</Text>
              <View style={styles.rowBtns}>
                <Pressable style={styles.primaryBtn} onPress={() => autoDismantleEquipment()}>
                  <Text style={styles.primaryBtnText}>{t('mobile.autoDismantle')}</Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={() => setCurrentTab('engine')}>
                  <Text style={styles.primaryBtnText}>{t('mobile.openEngine')}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
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

        {currentTab === 'social' && (
          <Suspense
            fallback={
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={theme.accent.gold} />
                <Text style={styles.loadingText}>{t('mobile.loadingSocial')}</Text>
              </View>
            }
          >
            <SocialTabContent
              tab="social"
              accountName={accountName}
              publicUsername={accountName}
              level={state.level || 1}
              highestWaveReached={state.highestWaveReached || 1}
              vipLevel={state.vipLevel || 0}
              diamonds={state.diamonds || 0}
              saveSlotId={
                selectedCharacterClass
                  ? getCharacterSaveSlot(accountName, selectedCharacterClass)
                  : '__character_slot_preview__'
              }
              isAdmin={false}
              onPendingRequestsCountChange={setSocialPendingCount}
            />
          </Suspense>
        )}
      </View>

      <Modal
        visible={activeModal === 'shop'}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>🛒 {t('mobile.mobileShop')}</Text>
            <Text style={styles.panelLine}>
              Gold: {fmt(state.gold || 0)} • Diamonds: {fmt(state.diamonds || 0)}
            </Text>
            <ScrollView style={styles.modalScroll}>
              <Pressable style={styles.primaryBtn} onPress={() => buyGoldShopItem('exp_cache')}>
                <Text style={styles.primaryBtnText}>{t('mobile.buyTrainingCacheGold')}</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={() => buyGoldShopItem('potion_bundle')}>
                <Text style={styles.primaryBtnText}>{t('mobile.buyFieldBundleGold')}</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={() => buyDiamondShopItem('coolant_i_pack')}>
                <Text style={styles.primaryBtnText}>{t('mobile.buyCoolantPack1')}</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={() => buyDiamondShopItem('coolant_ii_pack')}>
                <Text style={styles.primaryBtnText}>{t('mobile.buyCoolantPack2')}</Text>
              </Pressable>
            </ScrollView>
            <Pressable style={styles.secondaryBtn} onPress={() => setActiveModal(null)}>
              <Text style={styles.secondaryBtnText}>{t('common.close')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={activeModal === 'settings'}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>⚙️ {t('mobile.mobileSettings')}</Text>
            <ScrollView style={styles.modalScroll}>
              <Pressable style={styles.primaryBtn} onPress={() => setAutoUsePotion(!state.autoUsePotionEnabled)}>
                <Text style={styles.primaryBtnText}>
                  {t('mobile.autoPotion', {
                    state: state.autoUsePotionEnabled ? t('mobile.stateOn') : t('mobile.stateOff'),
                  })}
                </Text>
              </Pressable>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => setAutoUsePotionThreshold(state.autoUsePotionThresholdPct - 0.05)}
              >
                <Text style={styles.primaryBtnText}>{t('mobile.potionThresholdMinus')}</Text>
              </Pressable>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => setAutoUsePotionThreshold(state.autoUsePotionThresholdPct + 0.05)}
              >
                <Text style={styles.primaryBtnText}>{t('mobile.potionThresholdPlus')}</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={() => setAutoSummonEnabled(!state.autoSummonEnabled)}>
                <Text style={styles.primaryBtnText}>
                  {t('mobile.autoSummon', {
                    state: state.autoSummonEnabled ? t('mobile.stateOn') : t('mobile.stateOff'),
                  })}
                </Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={() => setAutoBurstEnabled(!state.autoBurstEnabled)}>
                <Text style={styles.primaryBtnText}>
                  {t('mobile.autoBurst', {
                    state: state.autoBurstEnabled ? t('mobile.stateOn') : t('mobile.stateOff'),
                  })}
                </Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={() => setAutoTempoEnabled(!state.autoTempoEnabled)}>
                <Text style={styles.primaryBtnText}>
                  {t('mobile.autoTempo', {
                    state: state.autoTempoEnabled ? t('mobile.stateOn') : t('mobile.stateOff'),
                  })}
                </Text>
              </Pressable>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => setAutoTempoTarget(state.autoTempoTarget === 2 ? 4 : 2)}
              >
                <Text style={styles.primaryBtnText}>
                  {t('mobile.autoTempoTarget', { target: state.autoTempoTarget })}
                </Text>
              </Pressable>
            </ScrollView>
            <Pressable style={styles.secondaryBtn} onPress={() => setActiveModal(null)}>
              <Text style={styles.secondaryBtnText}>{t('common.close')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Bottom navigation */}
      <MobileNavigation currentTab={currentTab} onTabChange={setCurrentTab} tabs={navTabs} />
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
  panelWrap: {
    padding: 12,
    gap: 10,
  },
  panelCard: {
    backgroundColor: theme.bg.card,
    borderColor: theme.border.light,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  panelTitle: {
    color: theme.text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  panelLine: {
    color: theme.text.secondary,
    fontSize: 12,
  },
  rowBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtn: {
    backgroundColor: theme.accent.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  primaryBtnText: {
    color: theme.bg.deepestBlack,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: theme.bg.dark,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderColor: theme.border.light,
    borderWidth: 1,
    padding: 14,
    maxHeight: '70%',
  },
  modalTitle: {
    color: theme.text.primary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalScroll: {
    maxHeight: 340,
  },
  secondaryBtn: {
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border.medium,
    paddingVertical: 10,
  },
  secondaryBtnText: {
    color: theme.text.primary,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 12,
  },
});
