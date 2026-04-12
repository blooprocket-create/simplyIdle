import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { GameState, Stats } from '../../useGameState';
import { PermanentUnlockId, EquipmentSlot } from '../../gameConfig';
import { fmt } from '../../utils';
import { Tab } from '../GameScreen';
import { styles } from './WarroomTabContent.styles';
import { t } from '../../i18n';

export interface WarroomTabContentProps {
  tab: string;
  state: GameState;
  stats: Stats;
  campaignChapter: number;
  campaignStage: number;
  campaignBossStage: number;
  isBossImminent: boolean;
  teamPowerIndex: number;
  powerTier: string;
  nearUnlockAchievements: any[];
  isBoss: boolean;
  monster: any;
  canRebirthNow: boolean;
  rebirthWaveRequirement: number;
  rebirthWavesLeft: number;
  currentAct: any;
  actProgressPct: number;
  nextBossUnlock: any;
  unlockLabel: (unlock: PermanentUnlockId) => string;
  dangerLabel: string;
  dangerScore: number;
  teamSlotCap: number;
  missionCards: any[];
  weeklyEvent: any;
  hasClaimableRewards: boolean;
  claimableWeeklyMilestones: any[];
  claimableMissionIds: any[];
  prestige1Done: boolean;
  prestige5Done: boolean;
  prestige10Done: boolean;
  prestige25Done: boolean;
  prestige50Done: boolean;
  warPanels: Record<string, boolean>;
  toggleWarPanel: (panel: 'frontline' | 'prestige' | 'roster' | 'armory' | 'growth' | 'objectives') => void;
  onTabChange: (tab: Tab) => void;
  setAchievementsSubTab: (tab: 'overview' | 'weekly' | 'missions' | 'achievements' | 'collection' | 'codex') => void;
  setRebirthOpen: (open: boolean) => void;
  autoEquipBestHeroes: () => void;
  claimAllRewards: () => void;
  craftEquipment: (slot: EquipmentSlot) => void;
}

export const WarroomTabContent = React.memo<WarroomTabContentProps>(
  ({
    tab,
    state,
    stats,
    campaignChapter,
    campaignStage,
    campaignBossStage,
    isBossImminent,
    teamPowerIndex,
    powerTier,
    nearUnlockAchievements,
    isBoss,
    monster,
    canRebirthNow,
    rebirthWaveRequirement,
    rebirthWavesLeft,
    currentAct,
    actProgressPct,
    nextBossUnlock,
    unlockLabel,
    dangerLabel,
    dangerScore,
    teamSlotCap,
    missionCards,
    weeklyEvent,
    hasClaimableRewards,
    claimableWeeklyMilestones,
    claimableMissionIds,
    prestige1Done,
    prestige5Done,
    prestige10Done,
    prestige25Done,
    prestige50Done,
    warPanels,
    toggleWarPanel,
    onTabChange,
    setAchievementsSubTab,
    setRebirthOpen,
    autoEquipBestHeroes,
    claimAllRewards,
    craftEquipment,
  }) => {
    return (
      <>
        {tab === 'warroom' && (
          <View style={styles.warRoomTab}>
            <Text style={styles.sectionTitle}>🛰️ {t('warroom.title')}</Text>
            <Text style={styles.warRoomIntro}>{t('warroom.intro')}</Text>
            {canRebirthNow && <Text style={styles.warRoomAlertHint}>{t('warroom.alertHint')}</Text>}

            <View style={styles.campaignRail}>
              <View style={styles.campaignRailCard}>
                <Text style={styles.campaignRailLabel}>{t('warroom.campaign')}</Text>
                <Text style={styles.campaignRailValue}>
                  Chapter {campaignChapter} • Stage {campaignStage}
                </Text>
                <View style={styles.hpBarBg}>
                  <View
                    style={[
                      styles.hpBarFill,
                      { width: `${(campaignStage / campaignBossStage) * 100}%`, backgroundColor: '#5DA8FF' },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.campaignRailCard}>
                <Text style={styles.campaignRailLabel}>{t('warroom.bossGate')}</Text>
                <Text style={styles.campaignRailValue}>Stage {campaignBossStage} • Every 10 Waves</Text>
                <Text style={styles.campaignRailHint}>
                  {isBossImminent ? t('warroom.pressureRising') : t('warroom.stabilizePush')}
                </Text>
              </View>
              <View style={styles.campaignRailCard}>
                <Text style={styles.campaignRailLabel}>{t('warroom.legionScore')}</Text>
                <Text style={styles.campaignRailValue}>
                  {fmt(teamPowerIndex)} ({powerTier})
                </Text>
                <Text style={styles.campaignRailHint}>{t('warroom.nextTierHint')}</Text>
              </View>
            </View>

            <View style={styles.warNearUnlockCard}>
              <View style={styles.warNearUnlockHeader}>
                <Text style={styles.warNearUnlockTitle}>🏆 {t('warroom.nearUnlocks')}</Text>
                <Pressable
                  style={styles.warNearUnlockBtn}
                  onPress={() => {
                    onTabChange('achievements');
                    setAchievementsSubTab('achievements');
                  }}
                >
                  <Text style={styles.warNearUnlockBtnText}>{t('warroom.openRecords')}</Text>
                </Pressable>
              </View>
              {nearUnlockAchievements.length === 0 ? (
                <Text style={styles.warNearUnlockEmpty}>{t('warroom.allUnlocked')}</Text>
              ) : (
                nearUnlockAchievements.map(item => (
                  <View key={item.ach.id} style={styles.warNearUnlockRow}>
                    <View style={styles.warNearUnlockTop}>
                      <Text style={styles.warNearUnlockName}>
                        {item.ach.emoji} {item.ach.name}
                      </Text>
                      <Text style={styles.warNearUnlockPct}>{Math.round(item.ratio * 100)}%</Text>
                    </View>
                    <Text style={styles.warNearUnlockDesc}>{item.ach.description}</Text>
                    {item.progress && (
                      <Text style={styles.warNearUnlockProgress}>
                        {item.progress.label}: {fmt(item.progress.value)} / {fmt(item.progress.target)}
                        {item.remaining != null ? ` • ${fmt(item.remaining)} to go` : ''}
                      </Text>
                    )}
                    <View style={styles.hpBarBg}>
                      <View
                        style={[
                          styles.hpBarFill,
                          { width: `${Math.max(4, Math.round(item.ratio * 100))}%`, backgroundColor: '#7BD9A8' },
                        ]}
                      />
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={styles.warPanel}>
              <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('frontline')}>
                <View style={styles.warPanelTitleRow}>
                  {canRebirthNow && <View style={styles.warPanelAlertDot} />}
                  <Text style={styles.warPanelTitle}>⚔️ {t('warroom.frontline')}</Text>
                </View>
                <Text style={styles.warPanelChevron}>{warPanels.frontline ? '−' : '+'}</Text>
              </Pressable>
              {warPanels.frontline && (
                <View style={styles.warPanelBody}>
                  <Text style={styles.warPanelStat}>
                    {currentAct.emoji} {currentAct.name} • W{state.wave} • {monster.name} {isBoss ? '(Boss)' : ''}
                  </Text>
                  <Text style={styles.warPanelStat}>
                    {t('warroom.teamHp', { current: Math.ceil(state.teamHp), max: state.teamMaxHp })}
                  </Text>
                  <Text style={styles.warPanelStat}>
                    {t('warroom.danger', { label: dangerLabel, score: dangerScore.toFixed(0) })}
                  </Text>
                  <Text style={styles.actTitle}>
                    {currentAct.emoji} Act {currentAct.id}: {currentAct.name}
                  </Text>
                  <Text style={styles.actTheme}>{currentAct.theme}</Text>
                  <View style={styles.hpBarBg}>
                    <View style={[styles.hpBarFill, { width: `${actProgressPct}%`, backgroundColor: '#5DA8FF' }]} />
                  </View>
                  <Text style={styles.actProgress}>
                    {currentAct.emoji} W{state.wave} • Boss at W{currentAct.bossWave}
                  </Text>
                  {nextBossUnlock ? (
                    <Text style={styles.actUnlockHint}>
                      {t('warroom.nextBossUnlock', { label: unlockLabel(nextBossUnlock) })}
                    </Text>
                  ) : (
                    <Text style={styles.actUnlockHint}>{t('warroom.bossReward')}</Text>
                  )}
                  <View style={styles.warPanelActionRow}>
                    <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('battle')}>
                      <Text style={styles.warPanelActionText}>{t('warroom.openWarfront')}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.warPanelActionBtn, !canRebirthNow && styles.warPanelActionBtnDisabled]}
                      disabled={!canRebirthNow}
                      onPress={() => setRebirthOpen(true)}
                    >
                      <Text style={styles.warPanelActionText}>
                        {canRebirthNow
                          ? t('warroom.rebirth')
                          : t('warroom.rebirthAt', { wave: rebirthWaveRequirement })}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.warPanel}>
              <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('roster')}>
                <Text style={styles.warPanelTitle}>👥 {t('warroom.roster')}</Text>
                <Text style={styles.warPanelChevron}>{warPanels.roster ? '−' : '+'}</Text>
              </Pressable>
              {warPanels.roster && (
                <View style={styles.warPanelBody}>
                  <Text style={styles.warPanelStat}>
                    {t('warroom.activeTeam', { current: state.activeTeamHeroIds.length, cap: teamSlotCap })}
                  </Text>
                  <Text style={styles.warPanelStat}>
                    {t('warroom.totalHeroes', { count: state.heroRoster.length })}
                  </Text>
                  <Text style={styles.warPanelStat}>{t('warroom.shards', { count: fmt(state.heroShards) })}</Text>
                  <Text style={styles.warPanelStat}>{t('warroom.bossTears', { count: state.bossTears })}</Text>
                  <View style={styles.warPanelActionRow}>
                    <Pressable style={styles.warPanelActionBtn} onPress={autoEquipBestHeroes}>
                      <Text style={styles.warPanelActionText}>{t('warroom.autoEquip')}</Text>
                    </Pressable>
                    <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('heroes')}>
                      <Text style={styles.warPanelActionText}>{t('warroom.manageRoster')}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.warPanel}>
              <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('armory')}>
                <Text style={styles.warPanelTitle}>🎒 {t('warroom.armory')}</Text>
                <Text style={styles.warPanelChevron}>{warPanels.armory ? '−' : '+'}</Text>
              </Pressable>
              {warPanels.armory && (
                <View style={styles.warPanelBody}>
                  <Text style={styles.warPanelStat}>
                    {t('warroom.items', { count: state.inventoryItemIds.length })}
                  </Text>
                  <Text style={styles.warPanelStat}>
                    {t('warroom.scrapEssence', { scrap: fmt(state.equipmentScrap), essence: fmt(state.essence) })}
                  </Text>
                  <View style={styles.warPanelActionRow}>
                    <Pressable style={styles.warPanelActionBtn} onPress={() => craftEquipment('weapon')}>
                      <Text style={styles.warPanelActionText}>{t('warroom.craftWeapon')}</Text>
                    </Pressable>
                    <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('equipment')}>
                      <Text style={styles.warPanelActionText}>{t('warroom.openArmory')}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.warPanel}>
              <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('growth')}>
                <Text style={styles.warPanelTitle}>📈 {t('warroom.growth')}</Text>
                <Text style={styles.warPanelChevron}>{warPanels.growth ? '−' : '+'}</Text>
              </Pressable>
              {warPanels.growth && (
                <View style={styles.warPanelBody}>
                  <Text style={styles.warPanelStat}>
                    {t('warroom.levelUnspent', { level: state.level, points: state.unspentStatPoints })}
                  </Text>
                  <Text style={styles.warPanelStat}>
                    {t('warroom.achievementBonus', { pct: (stats.achievementBonusPercent * 100).toFixed(0) })}
                  </Text>
                  <Text style={styles.warPanelStat}>{t('warroom.rebirthCores', { count: state.rebirthCores })}</Text>
                  <View style={styles.warPanelActionRow}>
                    <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('stats')}>
                      <Text style={styles.warPanelActionText}>{t('warroom.powerGrid')}</Text>
                    </Pressable>
                    <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('achievements')}>
                      <Text style={styles.warPanelActionText}>{t('warroom.legends')}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.warPanel}>
              <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('objectives')}>
                <Text style={styles.warPanelTitle}>🎯 {t('warroom.objectives')}</Text>
                <Text style={styles.warPanelChevron}>{warPanels.objectives ? '−' : '+'}</Text>
              </Pressable>
              {warPanels.objectives && (
                <View style={styles.warPanelBody}>
                  <Text style={styles.warPanelStat}>{t('warroom.weeklyKills', { count: state.weeklyKills })}</Text>
                  <Text style={styles.warPanelStat}>
                    {t('warroom.missionsReady', {
                      count: missionCards.filter(m => !m.claimed && m.progress.done).length,
                    })}
                  </Text>
                  <Text style={styles.warPanelStat}>
                    {t('warroom.currentEvent', { emoji: weeklyEvent.emoji, name: weeklyEvent.name })}
                  </Text>
                  <View style={styles.warPanelActionRow}>
                    <Pressable
                      style={[styles.warPanelActionBtn, !hasClaimableRewards && styles.warPanelActionBtnDisabled]}
                      disabled={!hasClaimableRewards}
                      onPress={claimAllRewards}
                    >
                      <Text style={styles.warPanelActionText}>
                        {t('warroom.claimAll', {
                          count: claimableWeeklyMilestones.length + claimableMissionIds.length,
                        })}
                      </Text>
                    </Pressable>
                    <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('achievements')}>
                      <Text style={styles.warPanelActionText}>{t('warroom.openObjectives')}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.warPanel}>
              <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('prestige')}>
                <View style={styles.warPanelTitleRow}>
                  {canRebirthNow && <View style={styles.warPanelAlertDot} />}
                  <Text style={styles.warPanelTitle}>♾️ {t('warroom.prestigeMilestones')}</Text>
                </View>
                <Text style={styles.warPanelChevron}>{warPanels.prestige ? '−' : '+'}</Text>
              </Pressable>
              {warPanels.prestige && (
                <View style={styles.warPanelBody}>
                  <Text style={styles.warPanelStat}>
                    {t('warroom.rebirthsCompleted', { count: state.prestigeCount ?? 0 })}
                  </Text>
                  <Text style={styles.warPanelStat}>
                    {canRebirthNow
                      ? t('warroom.rebirthReadyDetail')
                      : t('warroom.rebirthLockedDetail', { wave: rebirthWaveRequirement, remaining: rebirthWavesLeft })}
                  </Text>
                  {[
                    { n: 1, label: '1st Rebirth', bonus: 'Unlock Core Tree', done: prestige1Done },
                    { n: 5, label: '5th Rebirth', bonus: '+5% final team DPS and team max HP', done: prestige5Done },
                    { n: 10, label: '10th Rebirth', bonus: 'Legendary Aura visual', done: prestige10Done },
                    {
                      n: 25,
                      label: '25th Rebirth',
                      bonus: '+15% rebirth core value (meta branch power per level)',
                      done: prestige25Done,
                    },
                    { n: 50, label: '50th Rebirth', bonus: 'Grand Ascendant title', done: prestige50Done },
                  ].map(m => (
                    <View key={m.n} style={styles.prestigeMilestoneRow}>
                      <Text style={[styles.prestigeMilestoneCheck, m.done && styles.prestigeMilestoneDone]}>
                        {m.done ? '✅' : '○'}
                      </Text>
                      <View>
                        <Text style={styles.prestigeMilestoneLabel}>{m.label}</Text>
                        <Text style={styles.prestigeMilestoneBonus}>{m.bonus}</Text>
                      </View>
                    </View>
                  ))}
                  <View style={styles.warPanelActionRow}>
                    <Pressable
                      style={[styles.warPanelActionBtn, !canRebirthNow && styles.warPanelActionBtnDisabled]}
                      disabled={!canRebirthNow}
                      onPress={() => setRebirthOpen(true)}
                    >
                      <Text style={styles.warPanelActionText}>
                        {canRebirthNow
                          ? t('warroom.rebirthNow')
                          : t('warroom.rebirthAt', { wave: rebirthWaveRequirement })}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}
      </>
    );
  },
);
