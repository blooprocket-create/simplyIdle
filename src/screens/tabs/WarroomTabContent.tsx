import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { GameState } from '../../useGameState';
import { PermanentUnlockId } from '../../gameConfig';
import { fmt } from '../../utils';
import type { Tab } from '../gameScreenShared';
import { styles } from './WarroomTabContent.styles';
import { t } from '../../i18n';

export interface GuidanceItem {
  title: string;
  detail: string;
  tab: Tab;
}

interface NearUnlockAchievement {
  ach: {
    id: string;
    emoji: string;
    name: string;
    description: string;
  };
  ratio: number;
  progress?: {
    label: string;
    value: number;
    target: number;
  };
  remaining?: number;
}

interface WarroomAct {
  id: number;
  name: string;
  emoji: string;
  theme: string;
  bossWave: number;
}

interface MissionCardSummary {
  claimed: boolean;
  progress: {
    done: boolean;
  };
}

interface WeeklyEventSummary {
  emoji: string;
  name: string;
}

export interface WarroomTabContentProps {
  tab: string;
  state: GameState;
  campaignChapter: number;
  campaignStage: number;
  campaignBossStage: number;
  isBossImminent: boolean;
  teamPowerIndex: number;
  powerTier: string;
  nearUnlockAchievements: NearUnlockAchievement[];
  currentAct: WarroomAct;
  actProgressPct: number;
  nextBossUnlock: PermanentUnlockId | null;
  unlockLabel: (unlock: PermanentUnlockId) => string;
  missionCards: MissionCardSummary[];
  weeklyEvent: WeeklyEventSummary;
  hasClaimableRewards: boolean;
  claimableWeeklyMilestones: number[];
  claimableMissionIds: string[];
  prestige1Done: boolean;
  prestige5Done: boolean;
  prestige10Done: boolean;
  prestige25Done: boolean;
  prestige50Done: boolean;
  guidanceList: GuidanceItem[];
  onTabChange: (tab: Tab) => void;
  setAchievementsSubTab: (tab: 'overview' | 'missions' | 'achievements' | 'collection' | 'codex') => void;
  claimAllRewards: () => void;
}

export const WarroomTabContent = React.memo<WarroomTabContentProps>(
  ({
    tab,
    state,
    // stats — reserved for future advisor analytics
    campaignChapter,
    campaignStage,
    campaignBossStage,
    isBossImminent,
    teamPowerIndex,
    powerTier,
    nearUnlockAchievements,
    // canRebirthNow / rebirthWaveRequirement — rebirth UI moved to battle tab & header
    currentAct,
    actProgressPct,
    nextBossUnlock,
    unlockLabel,
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
    guidanceList,
    onTabChange,
    setAchievementsSubTab,
    claimAllRewards,
  }) => {
    const prestigeMilestones = [
      { n: 1, label: '1st Rebirth', bonus: 'Unlock Core Tree', done: prestige1Done },
      { n: 5, label: '5th Rebirth', bonus: '+5% final team DPS and team max HP', done: prestige5Done },
      { n: 10, label: '10th Rebirth', bonus: 'Legendary Aura visual', done: prestige10Done },
      { n: 25, label: '25th Rebirth', bonus: '+15% rebirth core value', done: prestige25Done },
      { n: 50, label: '50th Rebirth', bonus: 'Grand Ascendant title', done: prestige50Done },
    ];
    const nextMilestone = prestigeMilestones.find(m => !m.done);
    const completedCount = prestigeMilestones.filter(m => m.done).length;

    return (
      <>
        {tab === 'warroom' && (
          <View style={styles.warRoomTab}>
            <Text style={styles.sectionTitle}>🛰️ {t('warroom.title')}</Text>
            <Text style={styles.warRoomIntro}>{t('warroom.intro')}</Text>

            {/* ── Campaign Rail ────────────────────────────── */}
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

            {/* ── Act Progress ─────────────────────────────── */}
            <View style={styles.actCard}>
              <Text style={styles.actTitle}>
                {currentAct.emoji} Act {currentAct.id}: {currentAct.name}
              </Text>
              <Text style={styles.actTheme}>{currentAct.theme}</Text>
              <View style={styles.hpBarBg}>
                <View style={[styles.hpBarFill, { width: `${actProgressPct}%`, backgroundColor: '#5DA8FF' }]} />
              </View>
              <Text style={styles.actProgress}>
                W{state.wave} → Boss at W{currentAct.bossWave}
              </Text>
              {nextBossUnlock && (
                <Text style={styles.actUnlockHint}>
                  {t('warroom.nextBossUnlock', { label: unlockLabel(nextBossUnlock) })}
                </Text>
              )}
            </View>

            {/* ── Strategic Advisor ────────────────────────── */}
            <View style={styles.advisorSection}>
              <Text style={styles.advisorTitle}>📋 Strategic Advisor</Text>
              {guidanceList.length === 0 ? (
                <Text style={styles.advisorEmpty}>All clear — keep pushing waves.</Text>
              ) : (
                guidanceList.map((item, i) => (
                  <Pressable
                    key={i}
                    style={[styles.advisorCard, i === 0 && styles.advisorCardPrimary]}
                    onPress={() => onTabChange(item.tab)}
                  >
                    <View style={styles.advisorCardText}>
                      <Text style={[styles.advisorCardTitle, i === 0 && styles.advisorCardTitlePrimary]}>
                        {item.title}
                      </Text>
                      <Text style={styles.advisorCardDetail}>{item.detail}</Text>
                    </View>
                    <Text style={styles.advisorCardArrow}>→</Text>
                  </Pressable>
                ))
              )}
            </View>

            {/* ── Active Objectives ────────────────────────── */}
            <View style={styles.objectivesSection}>
              <View style={styles.objectivesHeader}>
                <Text style={styles.objectivesTitle}>🎯 Active Objectives</Text>
                <Pressable
                  style={styles.objectivesViewAll}
                  onPress={() => {
                    onTabChange('achievements');
                    setAchievementsSubTab('missions');
                  }}
                >
                  <Text style={styles.objectivesViewAllText}>View All →</Text>
                </Pressable>
              </View>
              <View style={styles.objectivesStats}>
                <Text style={styles.objectivesStat}>🗡️ Weekly Kills: {fmt(state.weeklyKills)}</Text>
                <Text style={styles.objectivesStat}>
                  📦 Ready to Claim: {missionCards.filter(m => !m.claimed && m.progress.done).length}
                </Text>
                <Text style={styles.objectivesStat}>
                  {weeklyEvent.emoji} Event: {weeklyEvent.name}
                </Text>
              </View>
              {hasClaimableRewards && (
                <Pressable style={styles.claimAllBtn} onPress={claimAllRewards}>
                  <Text style={styles.claimAllBtnText}>
                    Claim All ({claimableWeeklyMilestones.length + claimableMissionIds.length})
                  </Text>
                </Pressable>
              )}
            </View>

            {/* ── Near Unlocks ─────────────────────────────── */}
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

            {/* ── Prestige Progress ────────────────────────── */}
            <View style={styles.prestigeSection}>
              <Text style={styles.prestigeSectionTitle}>
                ♾️ Prestige Progress — {state.prestigeCount ?? 0} Rebirths
              </Text>
              <View style={styles.prestigeTrack}>
                {prestigeMilestones.map(m => (
                  <View key={m.n} style={styles.prestigeMilestoneRow}>
                    <Text style={[styles.prestigeMilestoneCheck, m.done && styles.prestigeMilestoneDone]}>
                      {m.done ? '✅' : '○'}
                    </Text>
                    <View style={styles.prestigeMilestoneContent}>
                      <Text style={[styles.prestigeMilestoneLabel, m.done && styles.prestigeMilestoneLabelDone]}>
                        {m.label}
                      </Text>
                      <Text style={styles.prestigeMilestoneBonus}>{m.bonus}</Text>
                    </View>
                  </View>
                ))}
              </View>
              {nextMilestone && (
                <Text style={styles.prestigeNextHint}>
                  Next milestone: {nextMilestone.label} ({completedCount}/5 completed)
                </Text>
              )}
            </View>
          </View>
        )}
      </>
    );
  },
);
