import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { GameState, Stats } from '../../useGameState';
import { fmt } from '../../utils';
import { styles } from '../GameScreen';

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
  unlockLabel: (unlock: string) => string;
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
  toggleWarPanel: (panel: string) => void;
  onTabChange: (tab: string) => void;
  setAchievementsSubTab: (tab: string) => void;
  setRebirthOpen: (open: boolean) => void;
  autoEquipBestHeroes: () => void;
  claimAllRewards: () => void;
  craftEquipment: (slot: string) => void;
}

export const WarroomTabContent: React.FC<WarroomTabContentProps> = ({
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
          <Text style={styles.sectionTitle}>🛰️ War Room Command</Text>
          <Text style={styles.warRoomIntro}>One-screen operations hub. Expand panels for details, jump to deep tabs when needed.</Text>

          <View style={styles.campaignRail}>
            <View style={styles.campaignRailCard}>
              <Text style={styles.campaignRailLabel}>Campaign</Text>
              <Text style={styles.campaignRailValue}>Chapter {campaignChapter} • Stage {campaignStage}</Text>
              <View style={styles.hpBarBg}>
                <View style={[styles.hpBarFill, { width: `${(campaignStage / campaignBossStage) * 100}%`, backgroundColor: '#5DA8FF' }]} />
              </View>
            </View>
            <View style={styles.campaignRailCard}>
              <Text style={styles.campaignRailLabel}>Boss Gate</Text>
              <Text style={styles.campaignRailValue}>Stage {campaignBossStage} • Every 10 Waves</Text>
              <Text style={styles.campaignRailHint}>{isBossImminent ? 'Pressure Rising' : 'Stabilize & Push'}</Text>
            </View>
            <View style={styles.campaignRailCard}>
              <Text style={styles.campaignRailLabel}>Legion Score</Text>
              <Text style={styles.campaignRailValue}>{fmt(teamPowerIndex)} ({powerTier})</Text>
              <Text style={styles.campaignRailHint}>Aim for next tier via gear + mastery</Text>
            </View>
          </View>

          <View style={styles.warNearUnlockCard}>
            <View style={styles.warNearUnlockHeader}>
              <Text style={styles.warNearUnlockTitle}>🏆 Near Unlocks</Text>
              <Pressable
                style={styles.warNearUnlockBtn}
                onPress={() => {
                  onTabChange('achievements');
                  setAchievementsSubTab('achievements');
                }}
              >
                <Text style={styles.warNearUnlockBtnText}>Open Records</Text>
              </Pressable>
            </View>
            {nearUnlockAchievements.length === 0 ? (
              <Text style={styles.warNearUnlockEmpty}>All achievements unlocked. You have completed the current records board.</Text>
            ) : (
              nearUnlockAchievements.map(item => (
                <View key={item.ach.id} style={styles.warNearUnlockRow}>
                  <View style={styles.warNearUnlockTop}>
                    <Text style={styles.warNearUnlockName}>{item.ach.emoji} {item.ach.name}</Text>
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
                    <View style={[styles.hpBarFill, { width: `${Math.max(4, Math.round(item.ratio * 100))}%`, backgroundColor: '#7BD9A8' }]} />
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.warPanel}>
            <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('frontline')}>
              <Text style={styles.warPanelTitle}>⚔️ Frontline</Text>
              <Text style={styles.warPanelChevron}>{warPanels.frontline ? '−' : '+'}</Text>
            </Pressable>
            {warPanels.frontline && (
              <View style={styles.warPanelBody}>
                <Text style={styles.warPanelStat}>Wave {state.wave} • {monster.name} {isBoss ? '(Boss)' : ''}</Text>
                <Text style={styles.warPanelStat}>Team HP: {Math.ceil(state.teamHp)} / {state.teamMaxHp}</Text>
                <Text style={styles.warPanelStat}>Danger: {dangerLabel} ({dangerScore.toFixed(0)}%)</Text>
                <Text style={styles.actTitle}>{currentAct.emoji} Act {currentAct.id}: {currentAct.name}</Text>
                <Text style={styles.actTheme}>{currentAct.theme}</Text>
                <View style={styles.hpBarBg}>
                  <View style={[styles.hpBarFill, { width: `${actProgressPct}%`, backgroundColor: '#5DA8FF' }]} />
                </View>
                <Text style={styles.actProgress}>Wave {state.wave} • Boss at Wave {currentAct.bossWave}</Text>
                {nextBossUnlock ? (
                  <Text style={styles.actUnlockHint}>Next boss unlock: {unlockLabel(nextBossUnlock)}</Text>
                ) : (
                  <Text style={styles.actUnlockHint}>Boss reward: bonus essence cache</Text>
                )}
                <View style={styles.warPanelActionRow}>
                  <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('battle')}>
                    <Text style={styles.warPanelActionText}>Open Warfront</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.warPanelActionBtn, !canRebirthNow && styles.warPanelActionBtnDisabled]}
                    disabled={!canRebirthNow}
                    onPress={() => setRebirthOpen(true)}
                  >
                    <Text style={styles.warPanelActionText}>{canRebirthNow ? 'Rebirth' : `Rebirth @ W${rebirthWaveRequirement}`}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          <View style={styles.warPanel}>
            <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('roster')}>
              <Text style={styles.warPanelTitle}>👥 Roster</Text>
              <Text style={styles.warPanelChevron}>{warPanels.roster ? '−' : '+'}</Text>
            </Pressable>
            {warPanels.roster && (
              <View style={styles.warPanelBody}>
                <Text style={styles.warPanelStat}>Active Team: {state.activeTeamHeroIds.length}/{teamSlotCap}</Text>
                <Text style={styles.warPanelStat}>Total Heroes: {state.heroRoster.length}</Text>
                <Text style={styles.warPanelStat}>Shards: {fmt(state.heroShards)}</Text>
                <Text style={styles.warPanelStat}>Boss Tears: {state.bossTears} 💧 (summon currency)</Text>
                <View style={styles.warPanelActionRow}>
                  <Pressable style={styles.warPanelActionBtn} onPress={autoEquipBestHeroes}>
                    <Text style={styles.warPanelActionText}>Auto Equip</Text>
                  </Pressable>
                  <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('heroes')}>
                    <Text style={styles.warPanelActionText}>Manage Roster</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          <View style={styles.warPanel}>
            <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('armory')}>
              <Text style={styles.warPanelTitle}>🎒 Armory</Text>
              <Text style={styles.warPanelChevron}>{warPanels.armory ? '−' : '+'}</Text>
            </Pressable>
            {warPanels.armory && (
              <View style={styles.warPanelBody}>
                <Text style={styles.warPanelStat}>Items: {state.inventoryItemIds.length}</Text>
                <Text style={styles.warPanelStat}>Scrap: {fmt(state.equipmentScrap)} • Essence: {fmt(state.essence)}</Text>
                <View style={styles.warPanelActionRow}>
                  <Pressable style={styles.warPanelActionBtn} onPress={() => craftEquipment('weapon')}>
                    <Text style={styles.warPanelActionText}>Craft Weapon</Text>
                  </Pressable>
                  <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('equipment')}>
                    <Text style={styles.warPanelActionText}>Open Armory</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          <View style={styles.warPanel}>
            <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('growth')}>
              <Text style={styles.warPanelTitle}>📈 Growth</Text>
              <Text style={styles.warPanelChevron}>{warPanels.growth ? '−' : '+'}</Text>
            </Pressable>
            {warPanels.growth && (
              <View style={styles.warPanelBody}>
                <Text style={styles.warPanelStat}>Level {state.level} • Unspent: {state.unspentStatPoints}</Text>
                <Text style={styles.warPanelStat}>Achievement Bonus: +{(stats.achievementBonusPercent * 100).toFixed(0)}% to final DPS, gold, and EXP</Text>
                <Text style={styles.warPanelStat}>Rebirth Cores: {state.rebirthCores}</Text>
                <View style={styles.warPanelActionRow}>
                  <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('stats')}>
                    <Text style={styles.warPanelActionText}>Power Grid</Text>
                  </Pressable>
                  <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('achievements')}>
                    <Text style={styles.warPanelActionText}>Legends</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          <View style={styles.warPanel}>
            <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('objectives')}>
              <Text style={styles.warPanelTitle}>🎯 Objectives</Text>
              <Text style={styles.warPanelChevron}>{warPanels.objectives ? '−' : '+'}</Text>
            </Pressable>
            {warPanels.objectives && (
              <View style={styles.warPanelBody}>
                <Text style={styles.warPanelStat}>Weekly Kills: {state.weeklyKills}</Text>
                <Text style={styles.warPanelStat}>Missions Ready: {missionCards.filter(m => !m.claimed && m.progress.done).length}</Text>
                <Text style={styles.warPanelStat}>Current Event: {weeklyEvent.emoji} {weeklyEvent.name}</Text>
                <View style={styles.warPanelActionRow}>
                  <Pressable
                    style={[styles.warPanelActionBtn, !hasClaimableRewards && styles.warPanelActionBtnDisabled]}
                    disabled={!hasClaimableRewards}
                    onPress={claimAllRewards}
                  >
                    <Text style={styles.warPanelActionText}>Claim All ({claimableWeeklyMilestones.length + claimableMissionIds.length})</Text>
                  </Pressable>
                  <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('achievements')}>
                    <Text style={styles.warPanelActionText}>Open Objectives</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          <View style={styles.warPanel}>
            <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('prestige')}>
              <Text style={styles.warPanelTitle}>♾️ Prestige Milestones</Text>
              <Text style={styles.warPanelChevron}>{warPanels.prestige ? '−' : '+'}</Text>
            </Pressable>
            {warPanels.prestige && (
              <View style={styles.warPanelBody}>
                <Text style={styles.warPanelStat}>Rebirths Completed: {state.prestigeCount ?? 0}</Text>
                <Text style={styles.warPanelStat}>
                  {canRebirthNow
                    ? 'Rebirth is ready. Reset now for permanent cores and stronger scaling.'
                    : `Rebirth unlocks at Wave ${rebirthWaveRequirement}. ${rebirthWavesLeft} waves remaining.`}
                </Text>
                {[
                  { n: 1, label: '1st Rebirth', bonus: 'Unlock Core Tree', done: prestige1Done },
                  { n: 5, label: '5th Rebirth', bonus: '+5% final team DPS and team max HP', done: prestige5Done },
                  { n: 10, label: '10th Rebirth', bonus: 'Legendary Aura visual', done: prestige10Done },
                  { n: 25, label: '25th Rebirth', bonus: '+15% rebirth core value (meta branch power per level)', done: prestige25Done },
                  { n: 50, label: '50th Rebirth', bonus: 'Grand Ascendant title', done: prestige50Done },
                ].map(m => (
                  <View key={m.n} style={styles.prestigeMilestoneRow}>
                    <Text style={[styles.prestigeMilestoneCheck, m.done && styles.prestigeMilestoneDone]}>{m.done ? '✅' : '○'}</Text>
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
                    <Text style={styles.warPanelActionText}>{canRebirthNow ? 'Rebirth Now' : `Rebirth @ W${rebirthWaveRequirement}`}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      )}
    </>
  );
};
