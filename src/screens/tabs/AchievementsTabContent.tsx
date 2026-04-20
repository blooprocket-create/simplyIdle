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
import { styles } from './AchievementsTabContent.styles';

export interface AchievementsTabContentProps {
  tab: string;
  state: GameState;
  stats: Stats;
  achievementsSubTab: string;
  setAchievementsSubTab: (tab: 'overview' | 'weekly' | 'missions' | 'achievements' | 'collection' | 'codex') => void;
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
  claimCodexUniqueVip: (heroId: string) => void;
  claimAllRewards: () => void;
  renderSubTabBar: (tabs: any[]) => React.ReactNode;
}

type CodexHero = (typeof HERO_POOL)[number];
type CodexFactionFilter = 'all' | 'vanguard' | 'ranger' | 'arcanum' | 'aegis';

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
    const codexVipClaimedHeroIds = Array.isArray(state.codexVipClaimedHeroIds) ? state.codexVipClaimedHeroIds : [];
    const codexVipClaimedUniqueIds = Array.isArray(state.codexVipClaimedUniqueIds)
      ? state.codexVipClaimedUniqueIds
      : [];
    const heroUniqueGearByHeroId = state.heroUniqueGearByHeroId ?? {};
    const safeStoryEntries = Array.isArray(storyEntries) ? storyEntries : [];
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
            {renderSubTabBar(
              (['overview', 'weekly', 'missions', 'achievements', 'collection', 'codex'] as const).map(st => ({
                id: st,
                label:
                  st === 'overview'
                    ? 'Overview'
                    : st === 'weekly'
                      ? 'Weekly'
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
                  st === 'weekly'
                    ? claimableWeeklyMilestones.length
                    : st === 'missions'
                      ? claimableMissionIds.length
                      : st === 'codex'
                        ? codexNotificationCount
                        : 0,
              })),
            )}

            {(achievementsSubTab === 'overview' ||
              achievementsSubTab === 'weekly' ||
              achievementsSubTab === 'missions') && (
              <View style={styles.achievementBonusCard}>
                <View style={styles.achievementBonusHeader}>
                  <Text style={styles.achievementBonusTitle}>Legacy Bonus Engine</Text>
                  <Text style={styles.achievementBonusValue}>+{(stats.achievementBonusPercent * 100).toFixed(0)}%</Text>
                </View>
                <Text style={styles.achievementBonusDesc}>
                  Each unlocked achievement grants +{ACH_BONUS_PER_UNLOCK_PCT}% to final DPS, gold gain, and EXP gain
                  multipliers.
                </Text>
                <Text style={styles.achievementBonusDesc}>
                  Unlocked: {state.achievements.size}/{ACHIEVEMENTS.length}
                </Text>
                <Text style={styles.achievementBonusDesc}>
                  Current multiplier: x{(1 + stats.achievementBonusPercent).toFixed(2)} applied after most
                  build/class/rebirth modifiers.
                </Text>
                <Text style={styles.achievementBonusDesc}>
                  Affects now: DPS x{(1 + stats.achievementBonusPercent).toFixed(2)} • Gold x
                  {(1 + stats.achievementBonusPercent).toFixed(2)} • EXP x
                  {(1 + stats.achievementBonusPercent).toFixed(2)}
                </Text>
                <View style={styles.claimAllRow}>
                  <Text style={styles.claimAllInfo}>
                    Claimable: {claimableWeeklyMilestones.length + claimableMissionIds.length}
                  </Text>
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
                <Text style={styles.weeklyEventTitle}>
                  {weeklyEvent.emoji} Weekly Event: {weeklyEvent.name}
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
                      <Text style={styles.missionTitle}>
                        {mission.title} ({mission.horizon})
                      </Text>
                      <Text style={styles.missionDesc}>{mission.description}</Text>
                      <Text style={styles.missionProgress}>
                        {Math.min(progress.value, mission.target)}/{mission.target}
                      </Text>
                    </View>
                    <Pressable
                      style={[styles.missionClaimBtn, (!progress.done || claimed) && styles.missionClaimBtnDisabled]}
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
            )}

            {(achievementsSubTab === 'overview' || achievementsSubTab === 'achievements') && (
              <Text style={styles.sectionTitle}>🏆 Achievements</Text>
            )}
            {(achievementsSubTab === 'overview' || achievementsSubTab === 'achievements') &&
              ACHIEVEMENTS.map(ach => {
                const unlocked = state.achievements.has(ach.id);
                const isHiddenLocked = !!ach.hidden && !unlocked;
                return (
                  <View key={ach.id} style={[styles.achCard, unlocked && styles.achCardUnlocked]}>
                    <Text style={styles.achEmoji}>{isHiddenLocked ? '❔' : ach.emoji}</Text>
                    <View style={styles.achCardInfo}>
                      <Text style={[styles.achName, unlocked && styles.achNameUnlocked]}>
                        {isHiddenLocked ? 'Hidden Achievement' : ach.name}
                      </Text>
                      <Text style={styles.achDesc}>
                        {isHiddenLocked ? 'Unlock this by discovering an obscure milestone.' : ach.description}
                      </Text>
                      <Text style={[styles.achBonusLine, unlocked && styles.achBonusLineUnlocked]}>
                        {isHiddenLocked
                          ? `+${ACH_BONUS_PER_UNLOCK_PCT}% to final DPS/gold/EXP when revealed`
                          : unlocked
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
                <Text style={styles.sectionHelperText}>
                  Track everything you've collected. Completion grants bonus power.
                </Text>

                <View style={styles.collectionCard}>
                  <Text style={styles.collectionCardTitle}>👥 Heroes</Text>
                  <Text style={styles.collectionStat}>{state.heroRoster.length} heroes summoned</Text>
                  {(['common', 'rare', 'epic', 'legendary', 'mythic'] as const).map(r => {
                    const count = state.heroRoster.filter(h => h.rarity === r).length;
                    return count > 0 ? (
                      <Text key={r} style={styles.collectionStat}>
                        {' '}
                        • {r}: {count}
                      </Text>
                    ) : null;
                  })}
                  {state.heroRoster.length >= 10 && (
                    <Text style={styles.collectionBonus}>✅ Bonus: +5% final team DPS multiplier</Text>
                  )}
                  {state.heroRoster.length >= 25 && (
                    <Text style={styles.collectionBonus}>✅ Bonus: +10% hero team-boost contribution</Text>
                  )}
                </View>

                <View style={styles.collectionCard}>
                  <Text style={styles.collectionCardTitle}>🎒 Equipment</Text>
                  <Text style={styles.collectionStat}>{state.inventoryItemIds.length} items held</Text>
                  <Text style={styles.collectionStat}>
                    {Object.values(state.equippedItems).filter(Boolean).length} / 3 slots filled
                  </Text>
                  {state.permanentUnlocks.includes('mythic_equipment') && (
                    <Text style={styles.collectionBonus}>✅ Mythic Tier Unlocked</Text>
                  )}
                  {!state.permanentUnlocks.includes('mythic_equipment') && (
                    <Text style={styles.collectionHint}>🔒 Defeat Act 3 Boss to unlock Mythic</Text>
                  )}
                </View>

                <View style={styles.collectionCard}>
                  <Text style={styles.collectionCardTitle}>👑 Bosses Defeated</Text>
                  <Text style={styles.collectionStat}>Highest wave: {state.wave}</Text>
                  <Text style={styles.collectionStat}>Boss waves cleared: {Math.floor(state.wave / 10)}</Text>
                  {Math.floor(state.wave / 10) >= 5 && (
                    <Text style={styles.collectionBonus}>✅ Boss Veteran: +5% final gold multiplier</Text>
                  )}
                </View>

                <View style={styles.collectionCard}>
                  <Text style={styles.collectionCardTitle}>🔓 Unlocks & Relics</Text>
                  {state.permanentUnlocks.length === 0 ? (
                    <Text style={styles.collectionStat}>No unlocks yet. Defeat bosses to progress.</Text>
                  ) : (
                    state.permanentUnlocks.map(u => (
                      <Text key={u} style={styles.collectionBonus}>
                        ✅ {u.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </Text>
                    ))
                  )}
                </View>

                <View style={styles.collectionCard}>
                  <Text style={styles.collectionCardTitle}>♾️ Rebirths</Text>
                  <Text style={styles.collectionStat}>Times ascended: {state.prestigeCount ?? 0}</Text>
                  <Text style={styles.collectionStat}>Rebirth Cores: {state.rebirthCores}</Text>
                  {(state.prestigeCount ?? 0) >= 1 && (
                    <Text style={styles.collectionBonus}>✅ First Rebirth: Unlocked Core Tree</Text>
                  )}
                  {(state.prestigeCount ?? 0) >= 5 && (
                    <Text style={styles.collectionBonus}>✅ Veteran: +5% rebirth core branch effectiveness</Text>
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
                          onPress={() => setSelectedCodexHeroId(hero.id)}
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
