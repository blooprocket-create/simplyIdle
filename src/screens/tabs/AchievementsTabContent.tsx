import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { GameState, Stats } from '../../useGameState';
import { ACHIEVEMENTS, HERO_POOL, WEEKLY_TRACK_MILESTONES, getHeroBackstory } from '../../gameConfig';
import { ACH_BONUS_PER_UNLOCK_PCT, ACH_BONUS_CAP_PCT } from '../GameScreen';
import { styles } from '../GameScreen';

export interface AchievementsTabContentProps {
  tab: string;
  state: GameState;
  stats: Stats;
  achievementsSubTab: string;
  setAchievementsSubTab: (tab: string) => void;
  missionCards: any[];
  claimableWeeklyMilestones: any[];
  claimableMissionIds: any[];
  hasClaimableRewards: boolean;
  weeklyEvent: any;
  storyEntries: any[];
  nextStoryEntry: any;
  claimWeeklyTrack: (ms: number) => void;
  claimMission: (missionId: string) => void;
  claimCodexHeroVip: (heroId: string) => void;
  claimAllRewards: () => void;
  renderSubTabBar: (tabs: any[]) => React.ReactNode;
}

export const AchievementsTabContent: React.FC<AchievementsTabContentProps> = ({
  tab,
  state,
  stats,
  achievementsSubTab,
  setAchievementsSubTab,
  missionCards,
  claimableWeeklyMilestones,
  claimableMissionIds,
  hasClaimableRewards,
  weeklyEvent,
  storyEntries,
  nextStoryEntry,
  claimWeeklyTrack,
  claimMission,
  claimCodexHeroVip,
  claimAllRewards,
  renderSubTabBar,
}) => {
  const unlockedHeroIds = useMemo(() => new Set(state.heroRoster.map(hero => hero.id)), [state.heroRoster]);
  const codexHeroes = useMemo(() => HERO_POOL.filter(hero => unlockedHeroIds.has(hero.id)), [unlockedHeroIds]);

  return (
    <>
      {tab === 'achievements' && (
        <View style={styles.achievementsTab}>
          {renderSubTabBar((['overview', 'weekly', 'missions', 'achievements', 'collection', 'codex'] as const).map(st => ({
            id: st,
            label: st === 'overview' ? 'Overview' : st === 'weekly' ? 'Weekly' : st === 'missions' ? 'Missions' : st === 'achievements' ? 'Records' : st === 'collection' ? 'Collection' : 'Codex',
            active: achievementsSubTab === st,
            onPress: () => setAchievementsSubTab(st),
            notificationCount: st === 'weekly'
              ? claimableWeeklyMilestones.length
              : st === 'missions'
                ? claimableMissionIds.length
                : 0,
          })))}

          {(achievementsSubTab === 'overview' || achievementsSubTab === 'weekly' || achievementsSubTab === 'missions') && (
            <View style={styles.achievementBonusCard}>
              <View style={styles.achievementBonusHeader}>
                <Text style={styles.achievementBonusTitle}>Legacy Bonus Engine</Text>
                <Text style={styles.achievementBonusValue}>+{(stats.achievementBonusPercent * 100).toFixed(0)}%</Text>
              </View>
              <Text style={styles.achievementBonusDesc}>
                Each unlocked achievement grants +{ACH_BONUS_PER_UNLOCK_PCT}% to final DPS, gold gain, and EXP gain multipliers.
              </Text>
              <Text style={styles.achievementBonusDesc}>
                Cap: +{ACH_BONUS_CAP_PCT}% • Unlocked: {state.achievements.size}/{ACHIEVEMENTS.length}
              </Text>
              <Text style={styles.achievementBonusDesc}>
                Current multiplier: x{(1 + stats.achievementBonusPercent).toFixed(2)} applied after most build/class/rebirth modifiers.
              </Text>
              <Text style={styles.achievementBonusDesc}>
                Affects now: DPS x{(1 + stats.achievementBonusPercent).toFixed(2)} • Gold x{(1 + stats.achievementBonusPercent).toFixed(2)} • EXP x{(1 + stats.achievementBonusPercent).toFixed(2)}
              </Text>
              <View style={styles.claimAllRow}>
                <Text style={styles.claimAllInfo}>Claimable: {claimableWeeklyMilestones.length + claimableMissionIds.length}</Text>
                <Pressable
                  style={[styles.claimAllBtn, !hasClaimableRewards && styles.claimAllBtnDisabled]}
                  disabled={!hasClaimableRewards}
                  onPress={claimAllRewards}
                >
                  <Text style={styles.claimAllBtnText}>Claim All Rewards</Text>
                </Pressable>
              </View>
            </View>
          )}

          {(achievementsSubTab === 'overview' || achievementsSubTab === 'weekly') && (
            <View style={styles.weeklyEventCard}>
              <Text style={styles.weeklyEventTitle}>{weeklyEvent.emoji} Weekly Event: {weeklyEvent.name}</Text>
              <Text style={styles.weeklyEventDesc}>{weeklyEvent.description}</Text>
              <Text style={styles.weeklyProgressLabel}>Weekly Kills: {state.weeklyKills}</Text>
              {WEEKLY_TRACK_MILESTONES.map(ms => {
                const done = state.weeklyKills >= ms;
                const claimed = state.weeklyTrackClaimed.includes(ms);
                return (
                  <View key={ms} style={styles.weeklyTrackRow}>
                    <Text style={styles.weeklyTrackText}>Milestone {ms}</Text>
                    <Pressable
                      style={[
                        styles.weeklyClaimBtn,
                        (!done || claimed) && styles.weeklyClaimBtnDisabled,
                      ]}
                      disabled={!done || claimed}
                      onPress={() => claimWeeklyTrack(ms)}
                    >
                      <Text style={styles.weeklyClaimBtnText}>{claimed ? 'Claimed' : done ? 'Claim' : 'Locked'}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {(achievementsSubTab === 'overview' || achievementsSubTab === 'missions') && (
            <View style={styles.missionBoardCard}>
              <Text style={styles.sectionTitle}>🎯 Mission Board</Text>
              {missionCards.map(({ mission, progress, claimed }) => (
                <View key={mission.id} style={styles.missionRow}>
                  <View style={styles.missionInfo}>
                    <Text style={styles.missionTitle}>{mission.title} ({mission.horizon})</Text>
                    <Text style={styles.missionDesc}>{mission.description}</Text>
                    <Text style={styles.missionProgress}>{Math.min(progress.value, mission.target)}/{mission.target}</Text>
                  </View>
                  <Pressable
                    style={[styles.missionClaimBtn, (!progress.done || claimed) && styles.missionClaimBtnDisabled]}
                    disabled={!progress.done || claimed}
                    onPress={() => claimMission(mission.id)}
                  >
                    <Text style={styles.missionClaimBtnText}>{claimed ? 'Claimed' : progress.done ? 'Claim' : 'Locked'}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {(achievementsSubTab === 'overview' || achievementsSubTab === 'achievements') && <Text style={styles.sectionTitle}>🏆 Achievements</Text>}
          {(achievementsSubTab === 'overview' || achievementsSubTab === 'achievements') && ACHIEVEMENTS.map(ach => {
            const unlocked = state.achievements.has(ach.id);
            return (
              <View key={ach.id} style={[styles.achCard, unlocked && styles.achCardUnlocked]}>
                <Text style={styles.achEmoji}>{ach.emoji}</Text>
                <View style={styles.achCardInfo}>
                  <Text style={[styles.achName, unlocked && styles.achNameUnlocked]}>{ach.name}</Text>
                  <Text style={styles.achDesc}>{ach.description}</Text>
                  <Text style={[styles.achBonusLine, unlocked && styles.achBonusLineUnlocked]}>
                    {unlocked
                      ? `+${ACH_BONUS_PER_UNLOCK_PCT}% to final DPS/gold/EXP applied`
                      : `+${ACH_BONUS_PER_UNLOCK_PCT}% to final DPS/gold/EXP on unlock`}
                  </Text>
                </View>
              </View>
            );
          })}

          {achievementsSubTab === 'collection' && (
            <View>
              <Text style={styles.sectionTitle}>📚 Collection Log</Text>
              <Text style={styles.sectionHelperText}>Track everything you've collected. Completion grants bonus power.</Text>

              <View style={styles.collectionCard}>
                <Text style={styles.collectionCardTitle}>👥 Heroes</Text>
                <Text style={styles.collectionStat}>{state.heroRoster.length} heroes summoned</Text>
                {(['common','rare','epic','legendary','mythic'] as const).map(r => {
                  const count = state.heroRoster.filter(h => h.rarity === r).length;
                  return count > 0 ? (
                    <Text key={r} style={styles.collectionStat}> • {r}: {count}</Text>
                  ) : null;
                })}
                {state.heroRoster.length >= 10 && <Text style={styles.collectionBonus}>✅ Bonus: +5% final team DPS multiplier</Text>}
                {state.heroRoster.length >= 25 && <Text style={styles.collectionBonus}>✅ Bonus: +10% hero team-boost contribution</Text>}
              </View>

              <View style={styles.collectionCard}>
                <Text style={styles.collectionCardTitle}>🎒 Equipment</Text>
                <Text style={styles.collectionStat}>{state.inventoryItemIds.length} items held</Text>
                <Text style={styles.collectionStat}>{Object.values(state.equippedItems).filter(Boolean).length} / 3 slots filled</Text>
                {state.permanentUnlocks.includes('mythic_equipment') && <Text style={styles.collectionBonus}>✅ Mythic Tier Unlocked</Text>}
                {!state.permanentUnlocks.includes('mythic_equipment') && <Text style={styles.collectionHint}>🔒 Defeat Act 3 Boss to unlock Mythic</Text>}
              </View>

              <View style={styles.collectionCard}>
                <Text style={styles.collectionCardTitle}>👑 Bosses Defeated</Text>
                <Text style={styles.collectionStat}>Highest wave: {state.wave}</Text>
                <Text style={styles.collectionStat}>Boss waves cleared: {Math.floor(state.wave / 10)}</Text>
                {Math.floor(state.wave / 10) >= 5 && <Text style={styles.collectionBonus}>✅ Boss Veteran: +5% final gold multiplier</Text>}
              </View>

              <View style={styles.collectionCard}>
                <Text style={styles.collectionCardTitle}>🔓 Unlocks & Relics</Text>
                {state.permanentUnlocks.length === 0 ? (
                  <Text style={styles.collectionStat}>No unlocks yet. Defeat bosses to progress.</Text>
                ) : (
                  state.permanentUnlocks.map(u => (
                    <Text key={u} style={styles.collectionBonus}>✅ {u.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Text>
                  ))
                )}
              </View>

              <View style={styles.collectionCard}>
                <Text style={styles.collectionCardTitle}>♾️ Rebirths</Text>
                <Text style={styles.collectionStat}>Times ascended: {state.prestigeCount ?? 0}</Text>
                <Text style={styles.collectionStat}>Rebirth Cores: {state.rebirthCores}</Text>
                {(state.prestigeCount ?? 0) >= 1 && <Text style={styles.collectionBonus}>✅ First Rebirth: Unlocked Core Tree</Text>}
                {(state.prestigeCount ?? 0) >= 5 && <Text style={styles.collectionBonus}>✅ Veteran: +5% rebirth core branch effectiveness</Text>}
              </View>
            </View>
          )}

          {achievementsSubTab === 'codex' && (
            <View>
              <Text style={styles.sectionTitle}>📖 Legacy Codex</Text>
              <Text style={styles.sectionHelperText}>Long-term milestones that define your legend. Each grants a permanent title.</Text>

              <View style={styles.collectionCard}>
                <Text style={styles.collectionCardTitle}>👥 Hero Codex</Text>
                <Text style={styles.collectionStat}>Discovered heroes: {codexHeroes.length}/{HERO_POOL.length}</Text>
                <Text style={styles.collectionHint}>Tap a discovered hero icon to claim +10 VIP points once.</Text>
                {codexHeroes.length === 0 ? (
                  <Text style={styles.collectionStat}>Summon heroes to unlock their backstories.</Text>
                ) : (
                  codexHeroes.map(hero => {
                    const claimed = state.codexVipClaimedHeroIds.includes(hero.id);
                    return (
                      <View key={hero.id} style={[styles.codexEntry, claimed && styles.codexEntryDone]}>
                        <Pressable
                          style={[styles.toggleBtn, claimed && { opacity: 0.55 }]}
                          disabled={claimed}
                          onPress={() => claimCodexHeroVip(hero.id)}
                        >
                          <Text style={styles.toggleBtnText}>{hero.emoji}</Text>
                        </Pressable>
                        <View style={styles.codexEntryLeft}>
                          <Text style={[styles.codexTitle, claimed && styles.codexTitleDone]}>
                            {claimed ? '✅' : '📜'} {hero.name}
                          </Text>
                          <Text style={styles.codexDesc}>{getHeroBackstory(hero.id)}</Text>
                          <Text style={styles.codexReward}>{claimed ? 'VIP claimed (+10)' : 'Tap icon: +10 VIP points'}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>

              <View style={styles.storyCardWrap}>
                <Text style={styles.storyCardTitle}>🧭 War Chronicle</Text>
                <Text style={styles.storyCardSubtitle}>
                  Unlocked chapters: {storyEntries.filter(entry => entry.unlocked).length}/{storyEntries.length}
                </Text>
                {storyEntries.map(entry => (
                  <View key={entry.id} style={[styles.storyBeatCard, entry.unlocked && styles.storyBeatCardUnlocked]}>
                    <Text style={[styles.storyBeatChapter, entry.unlocked && styles.storyBeatChapterUnlocked]}>
                      {entry.unlocked ? '✅' : '🔒'} {entry.chapter} - {entry.title}
                    </Text>
                    <Text style={styles.storyBeatBody}>{entry.unlocked ? entry.body : 'Classified until campaign requirements are met.'}</Text>
                    <Text style={styles.storyBeatReq}>
                      Req: Wave {entry.unlockWave}
                      {entry.unlockPrestige != null ? ` • Rebirth ${entry.unlockPrestige}+` : ''}
                    </Text>
                  </View>
                ))}
                {nextStoryEntry && (
                  <Text style={styles.storyNextHint}>
                    Next chapter unlock: Wave {nextStoryEntry.unlockWave}
                    {nextStoryEntry.unlockPrestige != null ? ` and Rebirth ${nextStoryEntry.unlockPrestige}+` : ''}
                  </Text>
                )}
              </View>
              {[
                { id: 'codex_wave100', title: 'Warlord', desc: 'Reach Wave 100', done: state.wave >= 100, reward: 'Title: Warlord' },
                { id: 'codex_wave500', title: 'Conqueror', desc: 'Reach Wave 500', done: state.wave >= 500, reward: 'Title: Conqueror' },
                { id: 'codex_wave1000', title: 'Legend', desc: 'Reach Wave 1000', done: state.wave >= 1000, reward: 'Title: Legend' },
                { id: 'codex_rebirth1', title: 'Reborn', desc: 'Complete 1 Rebirth', done: (state.prestigeCount ?? 0) >= 1, reward: 'Title: Reborn' },
                { id: 'codex_rebirth10', title: 'Eternal', desc: 'Complete 10 Rebirths', done: (state.prestigeCount ?? 0) >= 10, reward: 'Title: Eternal' },
                { id: 'codex_rebirth25', title: 'Immortal', desc: 'Complete 25 Rebirths', done: (state.prestigeCount ?? 0) >= 25, reward: 'Title: Immortal' },
                { id: 'codex_heroes25', title: 'Commander', desc: 'Summon 25 heroes', done: state.heroRoster.length >= 25, reward: 'Title: Commander' },
                { id: 'codex_ach10', title: 'Achiever', desc: 'Unlock 10 achievements', done: state.achievements.size >= 10, reward: 'Title: Achiever' },
                { id: 'codex_allunlocks', title: 'Sovereign', desc: 'Collect all permanent unlocks', done: state.permanentUnlocks.length >= 3, reward: 'Title: Sovereign' },
                { id: 'codex_streak30', title: 'Devoted', desc: 'Maintain a 30-day login streak', done: (state.dailyLoginStreak ?? 0) >= 30, reward: 'Title: Devoted' },
              ].map(entry => (
                <View key={entry.id} style={[styles.codexEntry, entry.done && styles.codexEntryDone]}>
                  <View style={styles.codexEntryLeft}>
                    <Text style={[styles.codexTitle, entry.done && styles.codexTitleDone]}>{entry.done ? '✅' : '🔒'} {entry.title}</Text>
                    <Text style={styles.codexDesc}>{entry.desc}</Text>
                    <Text style={styles.codexReward}>{entry.reward}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </>
  );
};
