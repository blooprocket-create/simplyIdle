import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, Image, Modal, Platform, useWindowDimensions } from 'react-native';
import { GameState, Stats } from '../../useGameState';
import {
  ACHIEVEMENTS,
  HERO_POOL,
  WEEKLY_TRACK_MILESTONES,
  getHeroBackstory,
  getHeroUniqueEffectFamilyLabel,
  getHeroUniqueSkillDescription,
  getHeroUniqueWeaponName,
} from '../../gameConfig';
import { getHeroPortraitSource } from '../../heroPortraits';
import { getHeroAnimationUri } from '../../heroAnimations';
import { ACH_BONUS_PER_UNLOCK_PCT } from '../gameScreenShared';
import { theme } from '../../theme/colors';
import MobileCard from '../../components/MobileCard';
import SectionHeader from '../../components/SectionHeader';
import { styles } from './AchievementsTabContent.styles';

export interface AchievementsTabContentProps {
  tab: string;
  state: GameState;
  stats: Stats;
  achievementsSubTab: string;
  setAchievementsSubTab: (tab: 'overview' | 'missions' | 'achievements' | 'collection' | 'codex') => void;
  missionCards: MissionCard[];
  claimableWeeklyMilestones: number[];
  claimableMissionIds: string[];
  hasClaimableRewards: boolean;
  weeklyEvent: WeeklyEventSummary;
  storyEntries: StoryEntry[];
  nextStoryEntry: StoryEntry | null;
  claimWeeklyTrack: (ms: number) => void;
  claimMission: (missionId: string) => void;
  claimCodexHeroVip: (heroId: string) => void;
  claimCodexUniqueVip: (heroId: string) => void;
  claimAllRewards: () => void;
  renderSubTabBar: (tabs: SubTabItem[]) => React.ReactNode;
}

type CodexHero = (typeof HERO_POOL)[number];
type CodexFactionFilter = 'all' | 'vanguard' | 'ranger' | 'arcanum' | 'aegis';
type RecordsFilter = 'all' | 'unlocked' | 'locked' | 'hidden';
type MissionHorizon = 'short' | 'medium' | 'long';

interface MissionCard {
  mission: {
    id: string;
    title: string;
    description: string;
    horizon: MissionHorizon;
    target: number;
  };
  progress: {
    value: number;
    done: boolean;
  };
  claimed: boolean;
}

interface WeeklyEventSummary {
  emoji: string;
  name: string;
  description: string;
}

interface StoryEntry {
  id: string;
  chapter: string;
  title: string;
  body: string;
  unlockWave: number;
  unlockPrestige?: number | null;
  unlocked: boolean;
}

interface SubTabItem {
  id: string;
  label: string;
  active: boolean;
  onPress: () => void;
  notificationCount?: number;
}

function getMissionHorizonLabel(horizon: 'short' | 'medium' | 'long'): string {
  if (horizon === 'short') return 'Daily';
  if (horizon === 'medium') return 'Weekly';
  return 'Lifetime';
}

function getMissionHorizonFlavor(horizon: 'short' | 'medium' | 'long'): string {
  if (horizon === 'short') return 'Fast tactical objectives for today.';
  if (horizon === 'medium') return 'Extended campaign tasks for this week.';
  return 'Long-haul legacy milestones that define your account.';
}

function getCodexFaction(hero: CodexHero): Exclude<CodexFactionFilter, 'all'> {
  if (hero.heroClass === 'warrior' || hero.heroClass === 'berserker') return 'vanguard';
  if (hero.heroClass === 'archer') return 'ranger';
  if (hero.heroClass === 'mage') return 'arcanum';
  return 'aegis';
}

function getCodexFactionLabel(filter: CodexFactionFilter): string {
  switch (filter) {
    case 'vanguard':
      return 'Vanguard';
    case 'ranger':
      return 'Ranger Wings';
    case 'arcanum':
      return 'Arcanum';
    case 'aegis':
      return 'Aegis Orders';
    default:
      return 'All Fronts';
  }
}

function formatHeroClass(heroClass: CodexHero['heroClass']): string {
  return heroClass.charAt(0).toUpperCase() + heroClass.slice(1);
}

function getHeroTierLabel(tier: number): string {
  if (tier >= 5) return 'Transcendent';
  if (tier >= 4) return 'Godlike';
  if (tier >= 3) return 'Legendary';
  if (tier >= 2) return 'Veteran';
  return 'Common';
}

function getTierAccent(tier: CodexHero['tier']): string {
  if (tier >= 5) return theme.rarity.transcendent;
  if (tier >= 4) return theme.rarity.mythic;
  if (tier >= 3) return theme.rarity.legendary;
  if (tier >= 2) return theme.rarity.epic;
  return theme.rarity.rare;
}

export const AchievementsTabContent = React.memo<AchievementsTabContentProps>(
  ({
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
    claimCodexUniqueVip,
    claimAllRewards,
    renderSubTabBar,
  }) => {
    const { width: viewportWidth } = useWindowDimensions();
    const codexVipClaimedHeroIds = useMemo(
      () => (Array.isArray(state.codexVipClaimedHeroIds) ? state.codexVipClaimedHeroIds : []),
      [state.codexVipClaimedHeroIds],
    );
    const codexVipClaimedUniqueIds = useMemo(
      () => (Array.isArray(state.codexVipClaimedUniqueIds) ? state.codexVipClaimedUniqueIds : []),
      [state.codexVipClaimedUniqueIds],
    );
    const heroUniqueGearByHeroId = useMemo(() => state.heroUniqueGearByHeroId ?? {}, [state.heroUniqueGearByHeroId]);
    const safeStoryEntries = useMemo(() => (Array.isArray(storyEntries) ? storyEntries : []), [storyEntries]);
    const unlockedHeroIds = useMemo(() => new Set(state.heroRoster.map(hero => hero.id)), [state.heroRoster]);
    const codexHeroes = useMemo(() => HERO_POOL.filter(hero => unlockedHeroIds.has(hero.id)), [unlockedHeroIds]);
    const codexUniqueEntries = useMemo(() => {
      const entries = HERO_POOL.map(hero => {
        const uniqueProgress = heroUniqueGearByHeroId[hero.id];
        const uniqueRank = uniqueProgress?.rank ?? 0;
        if (uniqueRank <= 0) return null;
        return { hero, uniqueRank };
      })
        .filter((entry): entry is { hero: (typeof HERO_POOL)[number]; uniqueRank: number } => !!entry)
        .sort((a, b) => {
          if (a.uniqueRank !== b.uniqueRank) return b.uniqueRank - a.uniqueRank;
          return a.hero.name.localeCompare(b.hero.name);
        });
      return entries;
    }, [heroUniqueGearByHeroId]);
    const claimableCodexHeroVipCount = useMemo(
      () => codexHeroes.filter(hero => !codexVipClaimedHeroIds.includes(hero.id)).length,
      [codexHeroes, codexVipClaimedHeroIds],
    );
    const claimableCodexUniqueVipCount = useMemo(
      () => codexUniqueEntries.filter(({ hero }) => !codexVipClaimedUniqueIds.includes(hero.id)).length,
      [codexUniqueEntries, codexVipClaimedUniqueIds],
    );
    const codexNotificationCount = claimableCodexHeroVipCount + claimableCodexUniqueVipCount;
    const [codexFactionFilter, setCodexFactionFilter] = useState<CodexFactionFilter>('all');
    const [selectedCodexHeroId, setSelectedCodexHeroId] = useState<string | null>(null);
    const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
    const [portraitModalHero, setPortraitModalHero] = useState<(typeof HERO_POOL)[number] | null>(null);
    const closePortraitModal = useCallback(() => setPortraitModalHero(null), []);
    const codexColumns = viewportWidth < 420 ? 2 : viewportWidth < 840 ? 3 : 4;
    const filteredArchiveHeroes = useMemo(
      () =>
        HERO_POOL.filter(hero => codexFactionFilter === 'all' || getCodexFaction(hero) === codexFactionFilter).sort(
          (a, b) => {
            const aUnlocked = unlockedHeroIds.has(a.id) ? 1 : 0;
            const bUnlocked = unlockedHeroIds.has(b.id) ? 1 : 0;
            if (aUnlocked !== bUnlocked) return bUnlocked - aUnlocked;
            if (a.tier !== b.tier) return b.tier - a.tier;
            return a.name.localeCompare(b.name);
          },
        ),
      [codexFactionFilter, unlockedHeroIds],
    );
    const archiveSpotlightHero = useMemo(() => {
      if (filteredArchiveHeroes.length === 0) return null;
      return filteredArchiveHeroes.find(hero => hero.id === selectedCodexHeroId) ?? filteredArchiveHeroes[0];
    }, [filteredArchiveHeroes, selectedCodexHeroId]);
    const codexUniqueRankByHeroId = useMemo(() => {
      const ranks: Record<string, number> = {};
      for (const entry of codexUniqueEntries) {
        ranks[entry.hero.id] = entry.uniqueRank;
      }
      return ranks;
    }, [codexUniqueEntries]);
    const storySpotlightEntry = useMemo(() => {
      if (safeStoryEntries.length === 0) return null;
      return (
        safeStoryEntries.find(entry => entry.id === selectedStoryId) ??
        safeStoryEntries.find(entry => entry.unlocked) ??
        safeStoryEntries[0]
      );
    }, [safeStoryEntries, selectedStoryId]);
    const codexFrontCounts = useMemo(() => {
      const counts: Record<CodexFactionFilter, number> = {
        all: 0,
        vanguard: 0,
        ranger: 0,
        arcanum: 0,
        aegis: 0,
      };
      for (const hero of codexHeroes) {
        counts.all += 1;
        counts[getCodexFaction(hero)] += 1;
      }
      return counts;
    }, [codexHeroes]);
    const [recordsFilter, setRecordsFilter] = useState<RecordsFilter>('all');
    const achievementRows = useMemo(
      () =>
        ACHIEVEMENTS.map(ach => {
          const unlocked = state.achievements.has(ach.id);
          const hiddenLocked = !!ach.hidden && !unlocked;
          return { ach, unlocked, hiddenLocked };
        }),
      [state.achievements],
    );
    const unlockedAchievements = useMemo(() => achievementRows.filter(row => row.unlocked), [achievementRows]);
    const hiddenLockedAchievements = useMemo(() => achievementRows.filter(row => row.hiddenLocked), [achievementRows]);
    const openLockedAchievements = useMemo(
      () => achievementRows.filter(row => !row.unlocked && !row.hiddenLocked),
      [achievementRows],
    );
    const filteredAchievementRows = useMemo(() => {
      if (recordsFilter === 'unlocked') return unlockedAchievements;
      if (recordsFilter === 'hidden') return hiddenLockedAchievements;
      if (recordsFilter === 'locked') return openLockedAchievements;
      return achievementRows;
    }, [achievementRows, hiddenLockedAchievements, openLockedAchievements, recordsFilter, unlockedAchievements]);
    const missionGroups = useMemo(() => {
      const grouped: Record<MissionHorizon, MissionCard[]> = {
        short: [],
        medium: [],
        long: [],
      };
      for (const missionCard of missionCards) {
        grouped[missionCard.mission.horizon].push(missionCard);
      }
      return grouped;
    }, [missionCards]);
    const missionCompletionCounts = useMemo(() => {
      let done = 0;
      for (const card of missionCards) {
        if (card.claimed) done += 1;
      }
      return {
        done,
        total: missionCards.length,
      };
    }, [missionCards]);
    const collectionProgress = useMemo(() => {
      const heroCompletionPct = Math.min(100, (state.heroRoster.length / Math.max(1, HERO_POOL.length)) * 100);
      const unlockCompletionPct = Math.min(100, (state.permanentUnlocks.length / 3) * 100);
      const rebirthCompletionPct = Math.min(100, ((state.prestigeCount ?? 0) / 10) * 100);
      return {
        heroCompletionPct,
        unlockCompletionPct,
        rebirthCompletionPct,
      };
    }, [state.heroRoster.length, state.permanentUnlocks.length, state.prestigeCount]);
    const overviewClaimableCount = claimableWeeklyMilestones.length + claimableMissionIds.length;
    const renderCodexHeroIcon = (heroId: string, emoji: string, size: 'sm' | 'md' | 'lg' = 'sm') => {
      const portraitSource = getHeroPortraitSource(heroId);
      const portraitStyle =
        size === 'lg'
          ? styles.codexHeroPortraitLarge
          : size === 'md'
            ? styles.codexHeroPortraitMedium
            : styles.codexHeroPortrait;
      const emojiStyle =
        size === 'lg' ? styles.codexHeroEmojiLarge : size === 'md' ? styles.codexHeroEmojiMedium : styles.toggleBtnText;
      if (portraitSource) {
        return <Image source={portraitSource} style={portraitStyle} resizeMode="cover" />;
      }
      return <Text style={emojiStyle}>{emoji}</Text>;
    };

    return (
      <>
        {tab === 'achievements' && (
          <View style={styles.achievementsTab}>
            <View pointerEvents="none" style={styles.achievementsAtmosphere}>
              <Image
                source={achievementsAtmosphereNoise}
                style={styles.achievementsAtmosphereNoise}
                resizeMode="cover"
              />
              <View style={styles.achievementsAtmosphereOrbPrimary} />
              <View style={styles.achievementsAtmosphereOrbSecondary} />
              <View style={styles.achievementsAtmosphereGrid} />
            </View>

            {renderSubTabBar(
              (['overview', 'missions', 'achievements', 'collection', 'codex'] as const).map(st => ({
                id: st,
                label:
                  st === 'overview'
                    ? 'Overview'
                    : st === 'missions'
                      ? 'Missions'
                      : st === 'achievements'
                        ? 'Records'
                        : st === 'collection'
                          ? 'Collection'
                          : 'Codex',
                active: achievementsSubTab === st,
                onPress: () => setAchievementsSubTab(st),
                notificationCount:
                  st === 'missions'
                    ? claimableWeeklyMilestones.length + claimableMissionIds.length
                    : st === 'codex'
                      ? codexNotificationCount
                      : 0,
              })),
            )}

            {(achievementsSubTab === 'overview' || achievementsSubTab === 'missions') && (
              <View style={styles.achievementBonusCard}>
                <Image source={achievementsCommandDeckBanner} style={styles.achievementBonusArt} resizeMode="cover" />
                <View pointerEvents="none" style={styles.achievementBonusScrim} />
                <View style={styles.achievementBonusHeader}>
                  <Text style={styles.achievementBonusTitle}>Legacy Bonus Engine</Text>
                  <Text style={styles.achievementBonusValue}>+{(stats.achievementBonusPercent * 100).toFixed(0)}%</Text>
                </View>
                <Text style={styles.achievementBonusDesc}>
                  Each unlocked achievement grants +{ACH_BONUS_PER_UNLOCK_PCT}% to final DPS, gold gain, and EXP gain
                  multipliers.
                </Text>
                <Text style={styles.achievementBonusDesc}>
                  Unlocked: {state.achievements.size}/{ACHIEVEMENTS.length} • Current multiplier: x
                  {(1 + stats.achievementBonusPercent).toFixed(2)}
                </Text>
                <View style={styles.claimAllRow}>
                  <Text style={styles.claimAllInfo}>Ready to claim: {overviewClaimableCount}</Text>
                  <Pressable
                    style={[styles.claimAllBtn, !hasClaimableRewards && styles.claimAllBtnDisabled]}
                    disabled={!hasClaimableRewards}
                    onPress={claimAllRewards}
                  >
                    <Text style={styles.claimAllBtnText}>Claim All Rewards</Text>
                  </Pressable>
                </View>
                <View style={styles.achievementOverviewGrid}>
                  <View style={styles.achievementOverviewCard}>
                    <Text style={styles.achievementOverviewLabel}>Records Secured</Text>
                    <Text style={styles.achievementOverviewValue}>{unlockedAchievements.length}</Text>
                    <Text style={styles.achievementOverviewHint}>
                      {ACHIEVEMENTS.length - unlockedAchievements.length} remaining
                    </Text>
                  </View>
                  <View style={styles.achievementOverviewCard}>
                    <Text style={styles.achievementOverviewLabel}>Mission Board</Text>
                    <Text style={styles.achievementOverviewValue}>{missionCompletionCounts.done}</Text>
                    <Text style={styles.achievementOverviewHint}>of {missionCompletionCounts.total} claimed</Text>
                  </View>
                  <View style={styles.achievementOverviewCard}>
                    <Text style={styles.achievementOverviewLabel}>Collection Depth</Text>
                    <Text style={styles.achievementOverviewValue}>
                      {Math.floor(collectionProgress.heroCompletionPct)}%
                    </Text>
                    <Text style={styles.achievementOverviewHint}>hero archive discovered</Text>
                  </View>
                </View>
              </View>
            )}

            {achievementsSubTab === 'overview' && (
              <View style={styles.achievementQuickGrid}>
                <Pressable style={styles.achievementQuickCard} onPress={() => setAchievementsSubTab('missions')}>
                  <Text style={styles.achievementQuickTitle}>Mission Board</Text>
                  <Text style={styles.achievementQuickBody}>Claim {overviewClaimableCount} available rewards now.</Text>
                </Pressable>
                <Pressable style={styles.achievementQuickCard} onPress={() => setAchievementsSubTab('achievements')}>
                  <Text style={styles.achievementQuickTitle}>Records Hall</Text>
                  <Text style={styles.achievementQuickBody}>Hidden leads: {hiddenLockedAchievements.length}</Text>
                </Pressable>
                <Pressable style={styles.achievementQuickCard} onPress={() => setAchievementsSubTab('collection')}>
                  <Text style={styles.achievementQuickTitle}>Collection Matrix</Text>
                  <Text style={styles.achievementQuickBody}>Unlocks cataloged: {state.permanentUnlocks.length}</Text>
                </Pressable>
              </View>
            )}

            {(achievementsSubTab === 'overview' || achievementsSubTab === 'missions') && (
              <View style={styles.missionBoardCard}>
                <Image source={achievementsMissionOverlay} style={styles.missionBoardArt} resizeMode="cover" />
                <View pointerEvents="none" style={styles.missionBoardScrim} />
                <Text style={styles.sectionTitle}>🎯 Mission Board</Text>
                <Text style={styles.sectionHelperText}>
                  Weekly progression now lives here with daily, weekly, and lifetime categories.
                </Text>

                <View style={styles.weeklyEventCard}>
                  <Text style={styles.weeklyEventTitle}>
                    {weeklyEvent.emoji} Weekly Directive: {weeklyEvent.name}
                  </Text>
                  <Text style={styles.weeklyEventDesc}>{weeklyEvent.description}</Text>
                  <Text style={styles.weeklyProgressLabel}>Weekly Kills: {state.weeklyKills}</Text>
                  {WEEKLY_TRACK_MILESTONES.map(ms => {
                    const done = state.weeklyKills >= ms;
                    const claimed = state.weeklyTrackClaimed.includes(ms);
                    return (
                      <View key={ms} style={styles.weeklyTrackRow}>
                        <Text style={styles.weeklyTrackText}>Milestone {ms}</Text>
                        <Pressable
                          style={[styles.weeklyClaimBtn, (!done || claimed) && styles.weeklyClaimBtnDisabled]}
                          disabled={!done || claimed}
                          onPress={() => claimWeeklyTrack(ms)}
                        >
                          <Text style={styles.weeklyClaimBtnText}>
                            {claimed ? 'Claimed' : done ? 'Claim' : 'Locked'}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>

                {(['short', 'medium', 'long'] as const).map(horizon => (
                  <View key={horizon} style={styles.missionGroupCard}>
                    <View style={styles.missionGroupHeader}>
                      <Text style={styles.missionGroupTitle}>{getMissionHorizonLabel(horizon)} Orders</Text>
                      <Text style={styles.missionGroupMeta}>
                        {missionGroups[horizon].filter(card => card.claimed).length}/{missionGroups[horizon].length}
                      </Text>
                    </View>
                    <Text style={styles.missionGroupFlavor}>{getMissionHorizonFlavor(horizon)}</Text>
                    {missionGroups[horizon].map(({ mission, progress, claimed }) => (
                      <View key={mission.id} style={styles.missionRow}>
                        <View style={[styles.missionStateRail, progress.done && styles.missionStateRailDone]} />
                        <View style={styles.missionInfo}>
                          <View style={styles.missionTitleRow}>
                            <Text style={styles.missionTitle}>{mission.title}</Text>
                            <Text style={styles.missionChip}>
                              {claimed ? 'SECURED' : progress.done ? 'READY' : 'ACTIVE'}
                            </Text>
                          </View>
                          <Text style={styles.missionDesc}>{mission.description}</Text>
                          <Text style={styles.missionProgress}>
                            {Math.min(progress.value, mission.target)}/{mission.target}
                          </Text>
                          <View style={styles.missionProgressBarBg}>
                            <View
                              style={[
                                styles.missionProgressBarFill,
                                {
                                  width: `${Math.min(100, (Math.min(progress.value, mission.target) / Math.max(1, mission.target)) * 100)}%`,
                                },
                              ]}
                            />
                          </View>
                        </View>
                        <Pressable
                          style={[
                            styles.missionClaimBtn,
                            (!progress.done || claimed) && styles.missionClaimBtnDisabled,
                          ]}
                          disabled={!progress.done || claimed}
                          onPress={() => claimMission(mission.id)}
                        >
                          <Text style={styles.missionClaimBtnText}>
                            {claimed ? 'Claimed' : progress.done ? 'Claim' : 'Locked'}
                          </Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}

            {achievementsSubTab === 'achievements' && (
              <View>
                <Text style={styles.sectionTitle}>🏆 Records Hall</Text>
                <Text style={styles.sectionHelperText}>Filter by state to avoid scrolling a full wall of records.</Text>
                <View style={styles.recordsFilterRow}>
                  {(
                    [
                      { id: 'all', label: `All (${achievementRows.length})` },
                      { id: 'unlocked', label: `Unlocked (${unlockedAchievements.length})` },
                      { id: 'locked', label: `Open (${openLockedAchievements.length})` },
                      { id: 'hidden', label: `Hidden (${hiddenLockedAchievements.length})` },
                    ] as const
                  ).map(option => (
                    <Pressable
                      key={option.id}
                      style={[styles.recordsFilterChip, recordsFilter === option.id && styles.recordsFilterChipActive]}
                      onPress={() => setRecordsFilter(option.id)}
                    >
                      <Text
                        style={[
                          styles.recordsFilterChipText,
                          recordsFilter === option.id && styles.recordsFilterChipTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {filteredAchievementRows.map(({ ach, unlocked, hiddenLocked }) => (
                  <View key={ach.id} style={[styles.achCard, unlocked && styles.achCardUnlocked]}>
                    <Image source={achievementsRecordsPlaque} style={styles.recordPlaqueArt} resizeMode="cover" />
                    <View pointerEvents="none" style={styles.recordPlaqueScrim} />
                    <View style={[styles.recordStateRail, unlocked && styles.recordStateRailUnlocked]} />
                    <Text style={styles.achEmoji}>{hiddenLocked ? '❔' : ach.emoji}</Text>
                    <View style={styles.achCardInfo}>
                      <View style={styles.recordTitleRow}>
                        <Text style={[styles.achName, unlocked && styles.achNameUnlocked]}>
                          {hiddenLocked ? 'Hidden Record' : ach.name}
                        </Text>
                        <Text style={[styles.recordStateChip, unlocked && styles.recordStateChipUnlocked]}>
                          {hiddenLocked ? 'CLASSIFIED' : unlocked ? 'SECURED' : 'PENDING'}
                        </Text>
                      </View>
                      <Text style={styles.achDesc}>
                        {hiddenLocked ? 'Unseal this by discovering an obscure milestone.' : ach.description}
                      </Text>
                      <Text style={[styles.achBonusLine, unlocked && styles.achBonusLineUnlocked]}>
                        {hiddenLocked
                          ? `+${ACH_BONUS_PER_UNLOCK_PCT}% final DPS/gold/EXP when revealed`
                          : unlocked
                            ? `+${ACH_BONUS_PER_UNLOCK_PCT}% final DPS/gold/EXP active`
                            : `+${ACH_BONUS_PER_UNLOCK_PCT}% final DPS/gold/EXP on unlock`}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {achievementsSubTab === 'collection' && (
              <View>
                <Text style={styles.sectionTitle}>📚 Collection Matrix</Text>
                <Text style={styles.sectionHelperText}>
                  Collection now tracks category completion and milestone power thresholds.
                </Text>

                <View style={styles.collectionCard}>
                  <Image source={achievementsCollectionPanel} style={styles.collectionVaultArt} resizeMode="cover" />
                  <View pointerEvents="none" style={styles.collectionVaultScrim} />
                  <Text style={styles.collectionCardTitle}>Archive Completion</Text>
                  <View style={styles.collectionProgressRow}>
                    <Text style={styles.collectionProgressLabel}>Heroes</Text>
                    <Text style={styles.collectionProgressValue}>
                      {state.heroRoster.length}/{HERO_POOL.length}
                    </Text>
                  </View>
                  <View style={styles.collectionProgressBarBg}>
                    <View
                      style={[styles.collectionProgressBarFill, { width: `${collectionProgress.heroCompletionPct}%` }]}
                    />
                  </View>
                  <View style={styles.collectionProgressRow}>
                    <Text style={styles.collectionProgressLabel}>Permanent Unlocks</Text>
                    <Text style={styles.collectionProgressValue}>{state.permanentUnlocks.length}/3</Text>
                  </View>
                  <View style={styles.collectionProgressBarBg}>
                    <View
                      style={[
                        styles.collectionProgressBarFill,
                        { width: `${collectionProgress.unlockCompletionPct}%` },
                      ]}
                    />
                  </View>
                  <View style={styles.collectionProgressRow}>
                    <Text style={styles.collectionProgressLabel}>Rebirth Legacy</Text>
                    <Text style={styles.collectionProgressValue}>{state.prestigeCount ?? 0}/10</Text>
                  </View>
                  <View style={styles.collectionProgressBarBg}>
                    <View
                      style={[
                        styles.collectionProgressBarFill,
                        { width: `${collectionProgress.rebirthCompletionPct}%` },
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.collectionGrid}>
                  <View style={styles.collectionCardCompact}>
                    <Image
                      source={achievementsCollectionPanel}
                      style={styles.collectionVaultArtCompact}
                      resizeMode="cover"
                    />
                    <View pointerEvents="none" style={styles.collectionVaultScrimCompact} />
                    <Text style={styles.collectionCardTitle}>Heroes</Text>
                    <Text style={styles.collectionStat}>{state.heroRoster.length} summoned</Text>
                    <Text style={styles.collectionHint}>Boss waves cleared: {Math.floor(state.wave / 10)}</Text>
                  </View>
                  <View style={styles.collectionCardCompact}>
                    <Image
                      source={achievementsCollectionPanel}
                      style={styles.collectionVaultArtCompact}
                      resizeMode="cover"
                    />
                    <View pointerEvents="none" style={styles.collectionVaultScrimCompact} />
                    <Text style={styles.collectionCardTitle}>Equipment</Text>
                    <Text style={styles.collectionStat}>{state.inventoryItemIds.length} total items</Text>
                    <Text style={styles.collectionHint}>
                      {Object.values(state.equippedItems).filter(Boolean).length} / 3 slots equipped
                    </Text>
                  </View>
                  <View style={styles.collectionCardCompact}>
                    <Image
                      source={achievementsCollectionPanel}
                      style={styles.collectionVaultArtCompact}
                      resizeMode="cover"
                    />
                    <View pointerEvents="none" style={styles.collectionVaultScrimCompact} />
                    <Text style={styles.collectionCardTitle}>Rebirth</Text>
                    <Text style={styles.collectionStat}>Ascensions: {state.prestigeCount ?? 0}</Text>
                    <Text style={styles.collectionHint}>Rebirth Cores: {state.rebirthCores}</Text>
                  </View>
                </View>

                <View style={styles.collectionCard}>
                  <Image source={achievementsCollectionPanel} style={styles.collectionVaultArt} resizeMode="cover" />
                  <View pointerEvents="none" style={styles.collectionVaultScrim} />
                  <Text style={styles.collectionCardTitle}>Permanent Unlock Registry</Text>
                  {state.permanentUnlocks.length === 0 ? (
                    <Text style={styles.collectionStat}>No permanent unlocks cataloged yet.</Text>
                  ) : (
                    <View style={styles.unlockChipRow}>
                      {state.permanentUnlocks.map(unlockId => (
                        <Text key={unlockId} style={styles.unlockChip}>
                          {unlockId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}

            {achievementsSubTab === 'codex' && (
              <View>
                <Text style={styles.sectionTitle}>📖 Legacy Codex</Text>
                <Text style={styles.sectionHelperText}>
                  Build your war archive. Heroes, relics, and chapters should feel discovered, not merely listed.
                </Text>

                <View style={styles.codexOverviewRow}>
                  <View style={[styles.codexOverviewCard, styles.codexOverviewCardPrimary]}>
                    <Text style={styles.codexOverviewEyebrow}>Hero Archive</Text>
                    <Text style={styles.codexOverviewValue}>
                      {codexHeroes.length}/{HERO_POOL.length}
                    </Text>
                    <Text style={styles.codexOverviewBody}>Discovered across all fronts</Text>
                  </View>
                  <View style={styles.codexOverviewCard}>
                    <Text style={styles.codexOverviewEyebrow}>Hero Relics</Text>
                    <Text style={styles.codexOverviewValue}>{codexUniqueEntries.length}</Text>
                    <Text style={styles.codexOverviewBody}>Forged and linked to hero dossiers</Text>
                  </View>
                  <View style={styles.codexOverviewCard}>
                    <Text style={styles.codexOverviewEyebrow}>War Chronicle</Text>
                    <Text style={styles.codexOverviewValue}>
                      {safeStoryEntries.filter(entry => entry.unlocked).length}
                    </Text>
                    <Text style={styles.codexOverviewBody}>Unlocked campaign chapters</Text>
                  </View>
                </View>

                <View style={styles.codexSectionShell}>
                  <View style={styles.codexSectionHeaderRow}>
                    <View style={styles.codexSectionHeaderCopy}>
                      <Text style={styles.codexSectionKicker}>Archive Wing</Text>
                      <Text style={styles.codexSectionTitle}>Hero Archive</Text>
                      <Text style={styles.codexSectionDescription}>
                        Review your commanders by front, class, and rarity. Classified files stay on the wall until you
                        summon them.
                      </Text>
                    </View>
                    <View style={styles.codexSectionBadge}>
                      <Text style={styles.codexSectionBadgeValue}>{codexFrontCounts.all}</Text>
                      <Text style={styles.codexSectionBadgeLabel}>Known dossiers</Text>
                    </View>
                  </View>

                  <View style={styles.codexFilterRow}>
                    {(['all', 'vanguard', 'ranger', 'arcanum', 'aegis'] as const).map(filter => (
                      <Pressable
                        key={filter}
                        style={[styles.codexFilterChip, codexFactionFilter === filter && styles.codexFilterChipActive]}
                        onPress={() => setCodexFactionFilter(filter)}
                      >
                        <Text
                          style={[
                            styles.codexFilterChipText,
                            codexFactionFilter === filter && styles.codexFilterChipTextActive,
                          ]}
                        >
                          {getCodexFactionLabel(filter)} {filter !== 'all' ? `(${codexFrontCounts[filter]})` : ''}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {archiveSpotlightHero ? (
                    <View style={styles.codexSpotlightCard}>
                      <View style={styles.codexSpotlightMedia}>
                        {unlockedHeroIds.has(archiveSpotlightHero.id) ? (
                          renderCodexHeroIcon(archiveSpotlightHero.id, archiveSpotlightHero.emoji, 'lg')
                        ) : (
                          <View style={styles.codexClassifiedPortrait}>
                            <Text style={styles.codexClassifiedPortraitText}>?</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.codexSpotlightBody}>
                        <View style={styles.codexSpotlightHeader}>
                          <View style={styles.codexSpotlightTitleWrap}>
                            <Text style={styles.codexSpotlightEyebrow}>
                              {getCodexFactionLabel(getCodexFaction(archiveSpotlightHero))}
                            </Text>
                            <Text style={styles.codexSpotlightTitle}>
                              {unlockedHeroIds.has(archiveSpotlightHero.id)
                                ? archiveSpotlightHero.name
                                : 'Classified Operative'}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.codexTierBadge,
                              {
                                borderColor: getTierAccent(archiveSpotlightHero.tier),
                                backgroundColor: `${getTierAccent(archiveSpotlightHero.tier)}22`,
                              },
                            ]}
                          >
                            <Text
                              style={[styles.codexTierBadgeText, { color: getTierAccent(archiveSpotlightHero.tier) }]}
                            >
                              Tier {archiveSpotlightHero.tier} {getHeroTierLabel(archiveSpotlightHero.tier)}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.codexMetaRow}>
                          <Text style={styles.codexMetaChip}>{formatHeroClass(archiveSpotlightHero.heroClass)}</Text>
                          <Text style={styles.codexMetaChip}>TIER {archiveSpotlightHero.tier}</Text>
                          <Text style={styles.codexMetaChip}>
                            {getHeroUniqueEffectFamilyLabel(archiveSpotlightHero.id)}
                          </Text>
                        </View>
                        <Text style={styles.codexSpotlightDescription}>
                          {unlockedHeroIds.has(archiveSpotlightHero.id)
                            ? getHeroBackstory(archiveSpotlightHero.id)
                            : 'Signal fragments detected. Summon this operative to unseal their dossier, doctrine, and battlefield history.'}
                        </Text>
                        {unlockedHeroIds.has(archiveSpotlightHero.id) && (
                          <View style={styles.codexRelicInlineCard}>
                            <Text style={styles.codexRelicInlineLabel}>Bound Relic</Text>
                            {codexUniqueRankByHeroId[archiveSpotlightHero.id] ? (
                              <>
                                <Text style={styles.codexRelicInlineName}>
                                  {getHeroUniqueWeaponName(archiveSpotlightHero.id)}
                                </Text>
                                <Text style={styles.codexRelicInlineMeta}>
                                  Rank {codexUniqueRankByHeroId[archiveSpotlightHero.id]}/10 •{' '}
                                  {getHeroUniqueEffectFamilyLabel(archiveSpotlightHero.id)}
                                </Text>
                                <Text style={styles.codexRelicInlineDesc}>
                                  {getHeroUniqueSkillDescription(
                                    archiveSpotlightHero.id,
                                    codexUniqueRankByHeroId[archiveSpotlightHero.id],
                                  )}
                                </Text>
                              </>
                            ) : (
                              <Text style={styles.codexRelicInlineMeta}>
                                Not forged yet. Secure this hero's signature relic to unlock doctrine bonuses.
                              </Text>
                            )}
                          </View>
                        )}
                        <View style={styles.codexSpotlightActionRow}>
                          {unlockedHeroIds.has(archiveSpotlightHero.id) &&
                          !codexVipClaimedHeroIds.includes(archiveSpotlightHero.id) ? (
                            <Pressable
                              style={styles.codexActionPrimary}
                              onPress={() => {
                                claimCodexHeroVip(archiveSpotlightHero.id);
                                setPortraitModalHero(archiveSpotlightHero);
                              }}
                            >
                              <Text style={styles.codexActionPrimaryText}>Reveal Dossier +10 VIP</Text>
                            </Pressable>
                          ) : unlockedHeroIds.has(archiveSpotlightHero.id) ? (
                            <Pressable
                              style={styles.codexActionPrimary}
                              onPress={() => setPortraitModalHero(archiveSpotlightHero)}
                            >
                              <Text style={styles.codexActionPrimaryText}>Inspect Full Dossier</Text>
                            </Pressable>
                          ) : null}
                          {unlockedHeroIds.has(archiveSpotlightHero.id) &&
                          codexUniqueRankByHeroId[archiveSpotlightHero.id] > 0 &&
                          !codexVipClaimedUniqueIds.includes(archiveSpotlightHero.id) ? (
                            <Pressable
                              style={styles.codexActionSecondary}
                              onPress={() => {
                                claimCodexUniqueVip(archiveSpotlightHero.id);
                              }}
                            >
                              <Text style={styles.codexActionSecondaryText}>Archive Relic +10 VIP</Text>
                            </Pressable>
                          ) : null}
                          <Text style={styles.codexActionHint}>
                            {unlockedHeroIds.has(archiveSpotlightHero.id)
                              ? codexVipClaimedHeroIds.includes(archiveSpotlightHero.id)
                                ? 'Archive reward claimed'
                                : 'First reveal claims VIP points'
                              : 'Currently classified'}
                          </Text>
                          {unlockedHeroIds.has(archiveSpotlightHero.id) &&
                            codexUniqueRankByHeroId[archiveSpotlightHero.id] > 0 && (
                              <Text style={styles.codexActionHint}>
                                {codexVipClaimedUniqueIds.includes(archiveSpotlightHero.id)
                                  ? 'Relic archive reward claimed'
                                  : 'Relic archive reward available'}
                              </Text>
                            )}
                        </View>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.collectionStat}>Summon heroes to begin filling the archive wall.</Text>
                  )}

                  <View style={styles.codexGalleryGrid}>
                    {filteredArchiveHeroes.map(hero => {
                      const unlocked = unlockedHeroIds.has(hero.id);
                      const claimed = codexVipClaimedHeroIds.includes(hero.id);
                      return (
                        <Pressable
                          key={hero.id}
                          style={[
                            styles.codexGalleryCard,
                            { width: `${100 / codexColumns - 2}%` },
                            unlocked && styles.codexGalleryCardUnlocked,
                            selectedCodexHeroId === hero.id && styles.codexGalleryCardSelected,
                          ]}
                          onPress={() => {
                            setSelectedCodexHeroId(hero.id);
                            if (unlocked) {
                              setPortraitModalHero(hero);
                            }
                          }}
                        >
                          <View style={[styles.codexGalleryPortraitWrap, { borderColor: getTierAccent(hero.tier) }]}>
                            {unlocked ? (
                              renderCodexHeroIcon(hero.id, hero.emoji, 'md')
                            ) : (
                              <View style={styles.codexGalleryLockedPortrait}>
                                <Text style={styles.codexGalleryLockedPortraitText}>CLASSIFIED</Text>
                              </View>
                            )}
                            {unlocked && !claimed && <View style={styles.codexClaimDot} />}
                          </View>
                          <Text style={styles.codexGalleryName} numberOfLines={1}>
                            {unlocked ? hero.name : 'Unknown'}
                          </Text>
                          <Text style={styles.codexGalleryMeta} numberOfLines={1}>
                            {unlocked
                              ? `${formatHeroClass(hero.heroClass)} • T${hero.tier}`
                              : `${getCodexFactionLabel(getCodexFaction(hero))} file`}
                          </Text>
                          {unlocked ? (
                            <Text style={styles.codexGalleryRelicState} numberOfLines={1}>
                              {codexUniqueRankByHeroId[hero.id]
                                ? `Relic Rank ${codexUniqueRankByHeroId[hero.id]}`
                                : 'Relic not forged'}
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.codexSectionShell}>
                  <View style={styles.codexSectionHeaderRow}>
                    <View style={styles.codexSectionHeaderCopy}>
                      <Text style={styles.codexSectionKicker}>Campaign Record</Text>
                      <Text style={styles.codexSectionTitle}>War Chronicle</Text>
                      <Text style={styles.codexSectionDescription}>
                        Chapters should feel unlocked along a campaign route, with the next frontier clearly visible.
                      </Text>
                    </View>
                    <View style={styles.codexSectionBadge}>
                      <Text style={styles.codexSectionBadgeValue}>
                        {safeStoryEntries.filter(entry => entry.unlocked).length}
                      </Text>
                      <Text style={styles.codexSectionBadgeLabel}>Open chapters</Text>
                    </View>
                  </View>

                  <View style={styles.storyNodeRow}>
                    {safeStoryEntries.map(entry => (
                      <Pressable
                        key={entry.id}
                        style={[
                          styles.storyNode,
                          entry.unlocked && styles.storyNodeUnlocked,
                          storySpotlightEntry?.id === entry.id && styles.storyNodeSelected,
                        ]}
                        onPress={() => setSelectedStoryId(entry.id)}
                      >
                        <Text style={styles.storyNodeChapter}>{entry.chapter}</Text>
                        <Text style={styles.storyNodeTitle} numberOfLines={2}>
                          {entry.title}
                        </Text>
                        <Text style={styles.storyNodeState}>{entry.unlocked ? 'Unlocked' : 'Classified'}</Text>
                      </Pressable>
                    ))}
                  </View>

                  {storySpotlightEntry && (
                    <View style={styles.storyCardWrap}>
                      <Text style={styles.storyCardTitle}>
                        {storySpotlightEntry.unlocked ? '🧭' : '🔒'} {storySpotlightEntry.chapter} -{' '}
                        {storySpotlightEntry.title}
                      </Text>
                      <Text style={styles.storyCardSubtitle}>
                        {storySpotlightEntry.unlocked
                          ? 'Campaign intelligence recovered'
                          : 'This chapter remains sealed by campaign progression'}
                      </Text>
                      <Text style={styles.storyBeatBody}>
                        {storySpotlightEntry.unlocked
                          ? storySpotlightEntry.body
                          : 'Classified until campaign requirements are met.'}
                      </Text>
                      <Text style={styles.storyBeatReq}>
                        Req: Wave {storySpotlightEntry.unlockWave}
                        {storySpotlightEntry.unlockPrestige != null
                          ? ` • Rebirth ${storySpotlightEntry.unlockPrestige}+`
                          : ''}
                      </Text>
                      {nextStoryEntry && (
                        <Text style={styles.storyNextHint}>
                          Next frontier opens at Wave {nextStoryEntry.unlockWave}
                          {nextStoryEntry.unlockPrestige != null
                            ? ` and Rebirth ${nextStoryEntry.unlockPrestige}+`
                            : ''}
                        </Text>
                      )}
                    </View>
                  )}
                </View>

                <View style={styles.codexSectionShell}>
                  <View style={styles.codexSectionHeaderRow}>
                    <View style={styles.codexSectionHeaderCopy}>
                      <Text style={styles.codexSectionKicker}>Legacy Titles</Text>
                      <Text style={styles.codexSectionTitle}>Mastery Ladder</Text>
                      <Text style={styles.codexSectionDescription}>
                        Your long-war titles should read like rising command prestige, not a loose pile of milestone
                        rows.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.masteryTitleGrid}>
                    {[
                      {
                        id: 'codex_wave100',
                        title: 'Warlord',
                        desc: 'Reach Wave 100',
                        done: state.wave >= 100,
                        reward: 'Title: Warlord',
                      },
                      {
                        id: 'codex_wave500',
                        title: 'Conqueror',
                        desc: 'Reach Wave 500',
                        done: state.wave >= 500,
                        reward: 'Title: Conqueror',
                      },
                      {
                        id: 'codex_wave1000',
                        title: 'Legend',
                        desc: 'Reach Wave 1000',
                        done: state.wave >= 1000,
                        reward: 'Title: Legend',
                      },
                      {
                        id: 'codex_rebirth1',
                        title: 'Reborn',
                        desc: 'Complete 1 Rebirth',
                        done: (state.prestigeCount ?? 0) >= 1,
                        reward: 'Title: Reborn',
                      },
                      {
                        id: 'codex_rebirth10',
                        title: 'Eternal',
                        desc: 'Complete 10 Rebirths',
                        done: (state.prestigeCount ?? 0) >= 10,
                        reward: 'Title: Eternal',
                      },
                      {
                        id: 'codex_rebirth25',
                        title: 'Immortal',
                        desc: 'Complete 25 Rebirths',
                        done: (state.prestigeCount ?? 0) >= 25,
                        reward: 'Title: Immortal',
                      },
                      {
                        id: 'codex_heroes25',
                        title: 'Commander',
                        desc: 'Summon 25 heroes',
                        done: state.heroRoster.length >= 25,
                        reward: 'Title: Commander',
                      },
                      {
                        id: 'codex_ach10',
                        title: 'Achiever',
                        desc: 'Unlock 10 achievements',
                        done: state.achievements.size >= 10,
                        reward: 'Title: Achiever',
                      },
                      {
                        id: 'codex_allunlocks',
                        title: 'Sovereign',
                        desc: 'Collect all permanent unlocks',
                        done: state.permanentUnlocks.length >= 3,
                        reward: 'Title: Sovereign',
                      },
                      {
                        id: 'codex_streak30',
                        title: 'Devoted',
                        desc: 'Maintain a 30-day login streak',
                        done: (state.dailyLoginStreak ?? 0) >= 30,
                        reward: 'Title: Devoted',
                      },
                    ].map(entry => (
                      <View key={entry.id} style={[styles.masteryTitleCard, entry.done && styles.masteryTitleCardDone]}>
                        <Text style={styles.masteryTitleState}>{entry.done ? 'TITLE SECURED' : 'PENDING'}</Text>
                        <Text style={[styles.masteryTitleName, entry.done && styles.masteryTitleNameDone]}>
                          {entry.title}
                        </Text>
                        <Text style={styles.masteryTitleDesc}>{entry.desc}</Text>
                        <Text style={styles.masteryTitleReward}>{entry.reward}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Hero Portrait Viewer Modal */}
        <Modal visible={!!portraitModalHero} transparent animationType="fade" onRequestClose={closePortraitModal}>
          <Pressable style={styles.portraitModalOverlay} onPress={closePortraitModal}>
            <Pressable style={styles.portraitModalContent} onPress={e => e.stopPropagation()}>
              {portraitModalHero &&
                (() => {
                  const animUri = getHeroAnimationUri(portraitModalHero.id);
                  const source = getHeroPortraitSource(portraitModalHero.id);
                  const tierLabel =
                    portraitModalHero.tier >= 5
                      ? '⭐ Transcendent'
                      : portraitModalHero.tier >= 4
                        ? '🔥 Godlike'
                        : portraitModalHero.tier >= 3
                          ? '💎 Legendary'
                          : portraitModalHero.tier >= 2
                            ? '🛡️ Veteran'
                            : '⚔️ Common';
                  return (
                    <>
                      {animUri && Platform.OS === 'web' ? (
                        React.createElement('video', {
                          src: animUri,
                          autoPlay: true,
                          loop: true,
                          muted: true,
                          playsInline: true,
                          style: { width: 240, height: 240, borderRadius: 8, objectFit: 'cover' },
                        })
                      ) : source ? (
                        <Image source={source} style={styles.portraitModalImage} resizeMode="contain" />
                      ) : (
                        <Text style={styles.portraitModalEmoji}>{portraitModalHero.emoji}</Text>
                      )}
                      <Text style={styles.portraitModalName}>{portraitModalHero.name}</Text>
                      <Text style={styles.portraitModalTier}>
                        Tier {portraitModalHero.tier} — {tierLabel}
                      </Text>
                      <Text style={styles.portraitModalClass}>
                        {formatHeroClass(portraitModalHero.heroClass)} •{' '}
                        {getHeroUniqueEffectFamilyLabel(portraitModalHero.id)}
                      </Text>
                      <Text style={styles.portraitModalBackstory}>{getHeroBackstory(portraitModalHero.id)}</Text>
                      <Text style={styles.portraitModalWeaponName}>
                        {getHeroUniqueWeaponName(portraitModalHero.id)}
                      </Text>
                      <Text style={styles.portraitModalWeaponSkill}>
                        {getHeroUniqueSkillDescription(portraitModalHero.id, 1)}
                      </Text>
                    </>
                  );
                })()}
              <Pressable style={styles.portraitModalCloseBtn} onPress={closePortraitModal}>
                <Text style={styles.portraitModalCloseBtnText}>Close</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  },
);
