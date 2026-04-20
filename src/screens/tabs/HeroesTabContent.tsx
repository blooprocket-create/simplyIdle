import React, { useMemo, useState, type CSSProperties } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  useWindowDimensions,
  Image,
  Modal,
  StyleSheet as RNStyleSheet,
  Platform,
} from 'react-native';
import { GameState, Stats } from '../../useGameState';
import {
  RARITIES,
  Rarity,
  PlayerClass,
  HeroPassiveTraitId,
  HeroActiveSkillArchetypeId,
  HERO_LEVEL_CAP,
  HERO_POOL,
  getHeroBackstory,
  getHeroRebirthPlan,
  getHeroUniqueEffectFamilyLabel,
  getHeroUniqueSkillDescription,
  getHeroUniqueWeaponName,
  SPARK_EXCHANGE_OPTIONS,
  SUMMON_MILESTONES,
} from '../../gameConfig';
import { getHeroPortraitSource } from '../../heroPortraits';
import { getHeroAnimationUri } from '../../heroAnimations';
import { fmt } from '../../utils';
import { styles } from './HeroesTabContent.styles';

interface FeaturedSummonBannerView {
  id: string;
  title: string;
  description: string;
  featuredHeroId: string;
  artEmoji: string;
  featuredHeroName: string;
  featuredHeroEmoji: string;
  highestRarity: string;
}

interface HeroSummonTimelineEntry {
  id: string;
  rarity: Rarity;
}

interface HeroRarityView {
  color: string;
}

interface HeroClassView {
  emoji: string;
  name: string;
}

interface HeroPassiveTraitView {
  name: string;
  description: string;
}

interface HeroActiveArchetypeView {
  name: string;
  description: string;
}

interface TeamSlotUnlockView {
  targetSlots: number;
  requiredWave: number;
  goldCost: number;
  shardCost: number;
  waveMet: boolean;
  goldMet: boolean;
  shardMet: boolean;
  canUnlock: boolean;
}

interface HeroesSubTabItem {
  id: string;
  label: string;
  active: boolean;
  onPress: () => void;
  notificationCount?: number;
}

export interface HeroesTabContentProps {
  tab: string;
  state: GameState;
  stats: Stats;
  heroesSubTab: string;
  setHeroesSubTab: (tab: 'summon' | 'roster' | 'batch' | 'spark') => void;
  batchLevelMode: 10 | 50 | 100 | 'max';
  setBatchLevelMode: (mode: 10 | 50 | 100 | 'max') => void;
  batchLevelSelected: Set<string>;
  setBatchLevelSelected: (set: Set<string>) => void;
  canGachaX10: boolean;
  canGachaOnce: boolean;
  pityRemaining: number;
  hasGachaNotification: boolean;
  paidX10: number;
  diamondPerSummon: number;
  summonTimeline: HeroSummonTimelineEntry[];
  rarityConfig: (rarity: Rarity) => HeroRarityView;
  expandedHeroes: Set<string>;
  setExpandedHeroes: (set: Set<string>) => void;
  activeTeamSet: Set<string>;
  teamSlotCap: number;
  nextTeamSlotUnlock: TeamSlotUnlockView | null;
  getClassConfig: (heroClass: PlayerClass) => HeroClassView;
  getHeroPassiveTraitInfo: (trait: HeroPassiveTraitId) => HeroPassiveTraitView;
  getHeroActiveArchetypeInfo: (archetype: HeroActiveSkillArchetypeId) => HeroActiveArchetypeView;
  calculateShardReward: (rarity: Rarity, level: number) => number;
  getRankUpShardCost: (rarity: Rarity, rank: number) => number;
  getHeroGoldLevelCost: (level: number) => number;
  summonHero: (payWithDiamonds?: boolean) => void;
  summonHeroX10Cinematic: (featuredHeroId?: string, payWithDiamonds?: boolean) => void;
  sparkExchange: (optionId: string, targetHeroId?: string) => void;
  featuredSummonBanner: FeaturedSummonBannerView;
  autoEquipBestHeroes: () => void;
  autoRecycleHeroes: () => void;
  toggleEquipHero: (heroId: string) => void;
  toggleHeroUniqueWeapon: (heroUid: string) => void;
  rankUpHero: (heroId: string) => void;
  rankUpHeroToMax: (heroId: string) => void;
  rankUpHeroToMaxAndRebirth: (heroId: string) => void;
  rebirthHero: (heroId: string) => void;
  levelUpHeroGold: (heroId: string) => void;
  unlockTeamSlot: () => void;
  batchLevelHeroes: (heroIds: string[], mode: number | 'max') => void;
  setRecycleConfirmUid: (uid: string) => void;
  renderSubTabBar: (tabs: HeroesSubTabItem[]) => React.ReactNode;
}

function getRankUpCostToMax(
  rarity: Rarity,
  currentRank: number,
  getRankUpShardCost: (rarity: Rarity, rank: number) => number,
): number {
  if (currentRank >= 10) return 0;
  let total = 0;
  for (let rank = currentRank + 1; rank <= 10; rank += 1) {
    total += getRankUpShardCost(rarity, rank);
  }
  return total;
}

export const HeroesTabContent = React.memo<HeroesTabContentProps>(
  ({
    tab,
    state,
    stats,
    heroesSubTab,
    setHeroesSubTab,
    batchLevelMode,
    setBatchLevelMode,
    batchLevelSelected,
    setBatchLevelSelected,
    canGachaX10,
    canGachaOnce: _canGachaOnce,
    pityRemaining,
    hasGachaNotification,
    paidX10: _paidX10,
    diamondPerSummon,
    summonTimeline,
    rarityConfig,
    expandedHeroes,
    setExpandedHeroes,
    activeTeamSet,
    teamSlotCap,
    nextTeamSlotUnlock,
    getClassConfig,
    getHeroPassiveTraitInfo,
    getHeroActiveArchetypeInfo,
    calculateShardReward,
    getRankUpShardCost,
    getHeroGoldLevelCost,
    summonHero,
    summonHeroX10Cinematic,
    sparkExchange,
    featuredSummonBanner,
    autoEquipBestHeroes,
    autoRecycleHeroes,
    toggleEquipHero,
    toggleHeroUniqueWeapon,
    rankUpHero,
    rankUpHeroToMax,
    rankUpHeroToMaxAndRebirth,
    rebirthHero,
    levelUpHeroGold,
    unlockTeamSlot,
    batchLevelHeroes,
    setRecycleConfirmUid,
    renderSubTabBar,
  }) => {
    const [diamondConfirm, setDiamondConfirm] = useState<{
      type: 'single' | 'x10';
      cost: number;
    } | null>(null);

    const { width: viewportWidth } = useWindowDimensions();
    const isPhoneWidth = viewportWidth < 700;
    const isSingleColumnRoster = viewportWidth < 520;
    const isSingleColumnBatch = viewportWidth < 520;
    const isNarrow = viewportWidth < 390;
    const isUltraNarrow = viewportWidth < 330;

    const rarityRank = useMemo(() => {
      const rankMap: Record<string, number> = {};
      RARITIES.forEach((rarity, index) => {
        rankMap[rarity.id] = index;
      });
      return rankMap;
    }, []);

    const sortedRoster = useMemo(() => {
      return [...state.heroRoster].sort((a, b) => {
        const aOnTeam = activeTeamSet.has(a.uid) ? 1 : 0;
        const bOnTeam = activeTeamSet.has(b.uid) ? 1 : 0;
        if (aOnTeam !== bOnTeam) return bOnTeam - aOnTeam;

        const aRarity = rarityRank[a.rarity] ?? -1;
        const bRarity = rarityRank[b.rarity] ?? -1;
        if (aRarity !== bRarity) return bRarity - aRarity;

        if (a.level !== b.level) return b.level - a.level;
        return a.name.localeCompare(b.name);
      });
    }, [activeTeamSet, rarityRank, state.heroRoster]);

    const sortedBatchHeroes = useMemo(() => {
      return state.heroRoster
        .filter(hero => hero.level < HERO_LEVEL_CAP)
        .sort((a, b) => {
          const aOnTeam = activeTeamSet.has(a.uid) ? 1 : 0;
          const bOnTeam = activeTeamSet.has(b.uid) ? 1 : 0;
          if (aOnTeam !== bOnTeam) return bOnTeam - aOnTeam;

          const aRarity = rarityRank[a.rarity] ?? -1;
          const bRarity = rarityRank[b.rarity] ?? -1;
          if (aRarity !== bRarity) return bRarity - aRarity;

          if (a.level !== b.level) return b.level - a.level;
          return a.name.localeCompare(b.name);
        });
    }, [activeTeamSet, rarityRank, state.heroRoster]);

    const uniqueBearerByHeroId = useMemo(() => {
      const bearerByHeroId: Record<string, string> = {};

      for (const [heroId, progress] of Object.entries(state.heroUniqueGearByHeroId)) {
        if (!progress || progress.rank <= 0 || !progress.equippedByUid) continue;
        const bearer = state.heroRoster.find(hero => hero.uid === progress.equippedByUid && hero.id === heroId);
        if (bearer) bearerByHeroId[heroId] = bearer.uid;
      }

      return bearerByHeroId;
    }, [state.heroRoster, state.heroUniqueGearByHeroId]);

    const rosterColumns = isSingleColumnRoster ? 1 : viewportWidth >= 1180 ? 4 : viewportWidth >= 860 ? 3 : 2;
    const rosterGap = isPhoneWidth ? 10 : 8;
    const rosterHorizontalPadding = isPhoneWidth ? 28 : 44;
    const rosterCardWidth = Math.max(
      isSingleColumnRoster ? viewportWidth - rosterHorizontalPadding : isUltraNarrow ? 220 : 180,
      Math.floor((viewportWidth - rosterHorizontalPadding - rosterGap * (rosterColumns - 1)) / rosterColumns),
    );
    const batchColumns = isSingleColumnBatch ? 1 : viewportWidth >= 1180 ? 4 : viewportWidth >= 860 ? 3 : 2;
    const batchGap = isPhoneWidth ? 10 : 8;
    const batchHorizontalPadding = isPhoneWidth ? 28 : 44;
    const batchCardWidth = Math.max(
      isSingleColumnBatch ? viewportWidth - batchHorizontalPadding : isUltraNarrow ? 220 : 180,
      Math.floor((viewportWidth - batchHorizontalPadding - batchGap * (batchColumns - 1)) / batchColumns),
    );
    const hasBatchNotification = sortedBatchHeroes.some(hero => state.gold >= getHeroGoldLevelCost(hero.level));
    const hasUnlockableTeamSlot = !!nextTeamSlotUnlock?.canUnlock;
    const uniqueOwnedCount = useMemo(
      () =>
        HERO_POOL.reduce((count, hero) => count + ((state.heroUniqueGearByHeroId[hero.id]?.rank ?? 0) > 0 ? 1 : 0), 0),
      [state.heroUniqueGearByHeroId],
    );

    return (
      <>
        {tab === 'heroes' && (
          <View style={styles.heroesTab}>
            {renderSubTabBar(
              (['summon', 'roster', 'batch', 'spark'] as const).map(st => ({
                id: st,
                label:
                  st === 'summon'
                    ? 'Summon Bay'
                    : st === 'roster'
                      ? 'Roster'
                      : st === 'batch'
                        ? 'Batch Level'
                        : 'Spark Exchange',
                active: heroesSubTab === st,
                onPress: () => setHeroesSubTab(st),
                notificationCount:
                  st === 'summon' && hasGachaNotification
                    ? 1
                    : st === 'batch' && hasBatchNotification
                      ? 1
                      : st === 'roster' && hasUnlockableTeamSlot
                        ? 1
                        : st === 'spark' && state.sparkTokens > 0
                          ? 1
                          : 0,
              })),
            )}

            {heroesSubTab === 'summon' && (
              <View style={styles.gachaSection}>
                <Text style={styles.sectionTitle}>✨ Gacha Summon</Text>
                <View style={styles.featuredSummonCard}>
                  <Text style={styles.featuredSummonTitle}>
                    {featuredSummonBanner.artEmoji} Featured Banner: {featuredSummonBanner.title}
                  </Text>
                  <Text style={styles.featuredSummonDesc}>{featuredSummonBanner.description}</Text>
                  <Text style={styles.featuredSummonDesc}>
                    Focus Hero: {featuredSummonBanner.featuredHeroEmoji} {featuredSummonBanner.featuredHeroName} •
                    Boosted at Legendary+ rarity.
                  </Text>
                  <Text style={styles.featuredSummonDesc}>
                    Hero Unique Relics owned: {uniqueOwnedCount}/{HERO_POOL.length}
                  </Text>
                  <View style={styles.featuredSummonMeterRow}>
                    <Text style={styles.featuredSummonMeterLabel}>Legendary Pity</Text>
                    <Text style={styles.featuredSummonMeterValue}>{state.gachaPityCounter}/30</Text>
                  </View>
                  <View style={styles.hpBarBg}>
                    <View
                      style={[
                        styles.hpBarFill,
                        { width: `${Math.min(100, (state.gachaPityCounter / 30) * 100)}%`, backgroundColor: '#C77DFF' },
                      ]}
                    />
                  </View>
                  <Pressable
                    style={[styles.featuredSummonBtn, !canGachaX10 && styles.featuredSummonBtnDisabled]}
                    disabled={!canGachaX10}
                    onPress={() => {
                      const freeUses = Math.min(state.freeSummonCharges, 10);
                      const paidNeeded = 10 - freeUses;
                      const shouldPayDiamonds = state.bossTears < paidNeeded;
                      if (shouldPayDiamonds && paidNeeded > 0) {
                        setDiamondConfirm({ type: 'x10', cost: paidNeeded * diamondPerSummon });
                      } else {
                        summonHeroX10Cinematic(undefined, false);
                      }
                    }}
                  >
                    <Text style={styles.featuredSummonBtnText}>Cinematic x10 Summon (11 Heroes)</Text>
                  </Pressable>
                </View>
                <Text style={styles.pityLabel}>
                  Pity: {state.gachaPityCounter}/30 • {pityRemaining} until guaranteed Legendary+
                </Text>
                {state.freeSummonCharges > 0 ? (
                  <Text style={styles.gachaFree}>Free Summon Ready ({state.freeSummonCharges})</Text>
                ) : (
                  <Text style={styles.gachaCost}>
                    Cost: 💧 1 Boss Tear ({state.bossTears} owned) or 💎 {diamondPerSummon} Diamonds ({state.diamonds}{' '}
                    owned)
                  </Text>
                )}
                <View style={styles.gachaBtnRow}>
                  <Pressable
                    style={[
                      styles.gachaBtn,
                      !(state.freeSummonCharges > 0 || state.bossTears >= 1) && styles.gachaBtnDisabled,
                      hasGachaNotification && styles.gachaBtnNotify,
                    ]}
                    disabled={!(state.freeSummonCharges > 0 || state.bossTears >= 1)}
                    onPress={() => summonHero(false)}
                  >
                    <Text style={styles.gachaBtnText}>
                      {state.freeSummonCharges > 0 ? 'Use Free Summon' : '💧 Summon (Boss Tear)'}
                    </Text>
                    {hasGachaNotification && <View style={styles.gachaBtnDot} />}
                  </Pressable>
                  <Pressable
                    style={[
                      styles.gachaBtn,
                      state.diamonds < diamondPerSummon && styles.gachaBtnDisabled,
                      { marginLeft: 8 },
                    ]}
                    disabled={state.diamonds < diamondPerSummon}
                    onPress={() => setDiamondConfirm({ type: 'single', cost: diamondPerSummon })}
                  >
                    <Text style={styles.gachaBtnText}>💎 Summon ({diamondPerSummon})</Text>
                  </Pressable>
                </View>

                {/* Summon Milestones */}
                <View style={styles.featuredSummonCard}>
                  <Text style={styles.featuredSummonTitle}>🏆 Summon Milestones</Text>
                  <Text style={styles.featuredSummonDesc}>Total Summons: {state.totalSummons}</Text>
                  {SUMMON_MILESTONES.map(m => {
                    const claimed = state.claimedSummonMilestones.includes(m.threshold);
                    const progress = Math.min(state.totalSummons, m.threshold);
                    return (
                      <View key={m.threshold} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <Text style={[styles.rarityLabel, { opacity: claimed ? 0.5 : 1 }]}>
                          {claimed ? '✓' : '○'} {m.threshold} summons — {m.rewardLabel}
                        </Text>
                        {!claimed && (
                          <Text style={styles.rarityChance}>
                            {' '}
                            ({progress}/{m.threshold})
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
                <View style={styles.rarityInfo}>
                  {RARITIES.map(r => (
                    <View key={r.id} style={styles.rarityRow}>
                      <View style={[styles.rarityDot, { backgroundColor: r.color }]} />
                      <Text style={styles.rarityLabel}>{r.label}</Text>
                      <Text style={styles.rarityChance}>{(r.chance * 100).toFixed(1)}%</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.summonHistoryBox}>
                  <Text style={styles.summonHistoryTitle}>Recent Summons</Text>
                  <View style={styles.timelineRow}>
                    {summonTimeline.length === 0 ? (
                      <Text style={styles.timelineEmpty}>No summons yet</Text>
                    ) : (
                      summonTimeline.map(entry => {
                        const rarity = rarityConfig(entry.rarity);
                        return <View key={entry.id} style={[styles.timelineDot, { backgroundColor: rarity.color }]} />;
                      })
                    )}
                  </View>
                </View>
              </View>
            )}

            {heroesSubTab === 'spark' && (
              <View style={styles.gachaSection}>
                <Text style={styles.sectionTitle}>✧ Spark Exchange</Text>
                <View style={styles.featuredSummonCard}>
                  <Text style={styles.featuredSummonDesc}>
                    Spark Tokens: ⚡ {state.sparkTokens} — Earned from duplicate hero summons.
                  </Text>
                  {SPARK_EXCHANGE_OPTIONS.map(opt => (
                    <Pressable
                      key={opt.id}
                      style={[
                        styles.gachaBtn,
                        state.sparkTokens < opt.sparkCost && styles.gachaBtnDisabled,
                        { marginTop: 6 },
                      ]}
                      disabled={state.sparkTokens < opt.sparkCost}
                      onPress={() => sparkExchange(opt.id)}
                    >
                      <Text style={styles.gachaBtnText}>{opt.label}</Text>
                      <Text style={styles.gachaX10Cost}>⚡ {opt.sparkCost} Sparks</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {heroesSubTab === 'roster' && (
              <>
                <View style={[styles.heroRosterHeader, isPhoneWidth && styles.heroRosterHeaderStacked]}>
                  <Text style={styles.sectionTitle}>👥 Roster Command</Text>
                  <View style={[styles.heroRosterActions, isPhoneWidth && styles.heroRosterActionsStacked]}>
                    <Pressable
                      style={styles.autoEquipBtn}
                      onPress={autoEquipBestHeroes}
                      accessibilityRole="button"
                      accessibilityLabel="Auto equip best heroes"
                    >
                      <Text style={styles.autoEquipBtnText}>⚡ Auto Equip</Text>
                    </Pressable>
                    <Pressable
                      style={styles.autoRecycleBtn}
                      onPress={autoRecycleHeroes}
                      accessibilityRole="button"
                      accessibilityLabel="Auto recycle low-tier heroes"
                    >
                      <Text style={styles.autoRecycleBtnText}>♻ Auto Recycle</Text>
                    </Pressable>
                  </View>
                </View>
                <Text style={styles.rosterCount}>
                  {state.heroRoster.length} heroes • {state.activeTeamHeroIds.length}/{teamSlotCap} in active team
                </Text>
                <View style={styles.heroSlotUnlockCard}>
                  <Text style={styles.heroSlotUnlockTitle}>Formation Slots</Text>
                  {nextTeamSlotUnlock ? (
                    <>
                      <Text style={styles.heroSlotUnlockMeta}>
                        Next slot {nextTeamSlotUnlock.targetSlots}: Wave {nextTeamSlotUnlock.requiredWave} •{' '}
                        {fmt(nextTeamSlotUnlock.goldCost)} gold • {fmt(nextTeamSlotUnlock.shardCost)} shards
                      </Text>
                      <Text style={styles.heroSlotUnlockMeta}>
                        Wave:{' '}
                        {nextTeamSlotUnlock.waveMet
                          ? 'OK'
                          : `${state.highestWaveReached}/${nextTeamSlotUnlock.requiredWave}`}{' '}
                        • Gold:{' '}
                        {nextTeamSlotUnlock.goldMet ? 'OK' : `${fmt(state.gold)}/${fmt(nextTeamSlotUnlock.goldCost)}`} •
                        Shards:{' '}
                        {nextTeamSlotUnlock.shardMet
                          ? 'OK'
                          : `${fmt(state.heroShards)}/${fmt(nextTeamSlotUnlock.shardCost)}`}
                      </Text>
                      <Pressable
                        style={[
                          styles.heroSlotUnlockBtn,
                          !nextTeamSlotUnlock.canUnlock && styles.heroSlotUnlockBtnDisabled,
                        ]}
                        disabled={!nextTeamSlotUnlock.canUnlock}
                        onPress={unlockTeamSlot}
                      >
                        <Text style={styles.heroSlotUnlockBtnText}>
                          {nextTeamSlotUnlock.canUnlock
                            ? `Unlock Slot ${nextTeamSlotUnlock.targetSlots}`
                            : 'Need More Resources'}
                        </Text>
                      </Pressable>
                    </>
                  ) : (
                    <Text style={styles.heroSlotUnlockMeta}>All team slots unlocked.</Text>
                  )}
                </View>
                {state.heroRoster.length === 0 ? (
                  <Text style={styles.emptyMsg}>Summon your first hero!</Text>
                ) : (
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: rosterGap,
                      alignItems: 'stretch',
                      justifyContent: 'center',
                    }}
                  >
                    {sortedRoster.map(hero => {
                      const inActiveTeam = activeTeamSet.has(hero.uid);
                      const cls = getClassConfig(hero.heroClass);
                      const rarity = rarityConfig(hero.rarity);
                      const details = stats.heroDetails[hero.uid];
                      const isExpanded = expandedHeroes.has(hero.uid);
                      const shardValue = calculateShardReward(hero.rarity, hero.level);
                      const heroRebirthPlan = getHeroRebirthPlan(hero);
                      const heroRebirthShardCost = heroRebirthPlan.shardCost;
                      const heroRebirthEssenceCost = heroRebirthPlan.essenceCost;
                      const nextRankCost = hero.rank < 10 ? getRankUpShardCost(hero.rarity, hero.rank + 1) : null;
                      const rankUpCostToMax = getRankUpCostToMax(hero.rarity, hero.rank, getRankUpShardCost);
                      const canRankUp = !!nextRankCost && state.heroShards >= nextRankCost;
                      const canRankUpToMax = hero.rank < 10 && state.heroShards >= rankUpCostToMax;
                      const canRankUpToMaxAndRebirth =
                        hero.rank < 10 &&
                        hero.level >= HERO_LEVEL_CAP &&
                        state.heroShards >= rankUpCostToMax + heroRebirthShardCost &&
                        state.essence >= heroRebirthEssenceCost;
                      const canHeroRebirth =
                        hero.rank >= 10 &&
                        hero.level >= HERO_LEVEL_CAP &&
                        state.heroShards >= heroRebirthShardCost &&
                        state.essence >= heroRebirthEssenceCost;
                      const trait = getHeroPassiveTraitInfo(hero.passiveTrait);
                      const activeArchetype = getHeroActiveArchetypeInfo(hero.activeSkillArchetype);
                      const uniqueProgress = state.heroUniqueGearByHeroId[hero.id];
                      const uniqueRank = uniqueProgress?.rank ?? 0;
                      const uniqueBearerUid = uniqueBearerByHeroId[hero.id] ?? null;
                      const uniqueEquipped = !!uniqueBearerUid;
                      const isUniqueBearer = uniqueBearerUid === hero.uid;
                      const highestEligibleCopy =
                        state.heroRoster
                          .filter(copy => copy.id === hero.id)
                          .sort((a, b) => {
                            const rarityDiff = (rarityRank[b.rarity] ?? 0) - (rarityRank[a.rarity] ?? 0);
                            if (rarityDiff !== 0) return rarityDiff;
                            if (b.level !== a.level) return b.level - a.level;
                            if (b.rank !== a.rank) return b.rank - a.rank;
                            if (b.teamBoost !== a.teamBoost) return b.teamBoost - a.teamBoost;
                            return a.uid.localeCompare(b.uid);
                          })[0] ?? null;
                      const canToggleUnique = uniqueRank > 0 && highestEligibleCopy?.uid === hero.uid;
                      const uniqueWeaponName = getHeroUniqueWeaponName(hero.id);
                      const uniqueDoctrine = getHeroUniqueEffectFamilyLabel(hero.id);
                      const uniqueSkill =
                        uniqueRank > 0
                          ? getHeroUniqueSkillDescription(hero.id, uniqueRank)
                          : `Locked • ${uniqueWeaponName} has not been forged yet.`;
                      const faction =
                        hero.heroClass === 'warrior' || hero.heroClass === 'berserker'
                          ? 'Vanguard'
                          : hero.heroClass === 'archer'
                            ? 'Ranger'
                            : hero.heroClass === 'mage'
                              ? 'Arcanum'
                              : 'Aegis';
                      const uniqueWeaponLore =
                        uniqueRank > 0
                          ? `Forged for ${hero.name}: ${getHeroBackstory(hero.id)}`
                          : `Unforged concept: ${getHeroBackstory(hero.id)}`;
                      const heroAnimationUri =
                        hero.tier >= 5 && Platform.OS === 'web' ? getHeroAnimationUri(hero.id) : null;
                      const heroPortraitSource = getHeroPortraitSource(hero.id);

                      return (
                        <View
                          key={hero.uid}
                          style={[
                            styles.heroCard,
                            isPhoneWidth && styles.heroCardMobile,
                            inActiveTeam && styles.heroCardActive,
                            isPhoneWidth && inActiveTeam && styles.heroCardMobileActive,
                            { width: rosterCardWidth, marginBottom: 0 },
                          ]}
                        >
                          {heroAnimationUri ? (
                            React.createElement('video', {
                              src: heroAnimationUri,
                              autoPlay: true,
                              loop: true,
                              muted: true,
                              playsInline: true,
                              style: {
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                objectPosition: 'center center',
                                opacity: 0.38,
                              } as CSSProperties,
                            })
                          ) : heroPortraitSource ? (
                            <View style={styles.heroCardBackdropImageContainer}>
                              <Image
                                source={heroPortraitSource}
                                style={styles.heroCardBackdropImage}
                                resizeMode="cover"
                              />
                            </View>
                          ) : (
                            <View style={styles.heroCardBackdropFallback}>
                              <Text style={styles.heroCardBackdropEmoji}>{hero.emoji}</Text>
                            </View>
                          )}
                          <View style={styles.heroCardBackdropScrim} />
                          <View style={[styles.heroCardRarityBar, { backgroundColor: rarity.color }]} />
                          <View style={[styles.heroCardBody, isPhoneWidth && styles.heroCardBodyMobile]}>
                            {isPhoneWidth ? (
                              <>
                                <View style={styles.heroCardHeaderMobile}>
                                  <View style={styles.heroCardInfoMobile}>
                                    <View style={styles.heroNameRowMobile}>
                                      <Text style={[styles.heroName, styles.heroNameMobile]} numberOfLines={1}>
                                        {hero.name}
                                      </Text>
                                      <View style={styles.heroLevelPillMobile}>
                                        <Text style={styles.heroLevelPillTextMobile} numberOfLines={1}>
                                          Lv {hero.level}
                                        </Text>
                                      </View>
                                    </View>
                                    <Text style={styles.heroMetaMobile} numberOfLines={1}>
                                      <Text style={{ color: rarity.color }}>{hero.rarity}</Text>
                                      {' • '}
                                      {cls.name}
                                    </Text>
                                    <Text style={styles.heroSubMetaMobile} numberOfLines={1}>
                                      {activeArchetype.name} doctrine
                                    </Text>
                                  </View>
                                </View>

                                <View style={styles.heroChipRowMobile}>
                                  <View style={[styles.heroChipMobile, styles.heroChipMobileFaction]}>
                                    <Text style={styles.heroChipTextMobile}>{faction}</Text>
                                  </View>
                                  <View style={[styles.heroChipMobile, styles.heroChipMobileRank]}>
                                    <Text style={styles.heroChipTextMobile}>Rank {hero.rank}</Text>
                                  </View>
                                  <View style={[styles.heroChipMobile, styles.heroChipMobileArchetype]}>
                                    <Text style={styles.heroChipTextMobile}>{activeArchetype.name}</Text>
                                  </View>
                                </View>

                                <View style={styles.heroUtilityRowMobile}>
                                  <View style={styles.heroBoostPillMobile}>
                                    <Text style={styles.heroBoostPillTextMobile}>
                                      +{(hero.teamBoost * 100).toFixed(1)}% team boost
                                    </Text>
                                  </View>
                                  {inActiveTeam && (
                                    <View style={styles.heroTeamPillMobile}>
                                      <Text style={styles.heroTeamPillTextMobile}>Active Team</Text>
                                    </View>
                                  )}
                                </View>

                                <View style={styles.heroActionRowMobile}>
                                  <Pressable
                                    style={[
                                      styles.toggleBtn,
                                      styles.toggleBtnMobile,
                                      inActiveTeam && styles.toggleBtnActive,
                                      inActiveTeam && styles.toggleBtnMobileActive,
                                    ]}
                                    onPress={() => toggleEquipHero(hero.uid)}
                                  >
                                    <Text style={styles.toggleBtnText}>{inActiveTeam ? '✔ Team' : '+ Add'}</Text>
                                  </Pressable>
                                  <Pressable
                                    style={[styles.expandBtn, styles.expandBtnMobile]}
                                    onPress={() => {
                                      const s = new Set(expandedHeroes);
                                      if (s.has(hero.uid)) s.delete(hero.uid);
                                      else s.add(hero.uid);
                                      setExpandedHeroes(s);
                                    }}
                                  >
                                    <Text style={styles.expandBtnText}>{isExpanded ? 'Hide' : 'More'}</Text>
                                  </Pressable>
                                </View>
                              </>
                            ) : (
                              <>
                                <View style={styles.heroCardTopRow}>
                                  <View style={styles.heroCardInfo}>
                                    <Text style={styles.heroName} numberOfLines={1}>
                                      {hero.name}
                                    </Text>
                                    <Text style={styles.heroDetail} numberOfLines={1}>
                                      <Text style={{ color: rarity.color }}>{hero.rarity}</Text>
                                      {' • '}
                                      {cls.name}
                                    </Text>
                                    <View style={styles.heroTagRow}>
                                      <Text style={styles.heroFactionTag}>{faction}</Text>
                                      <Text style={styles.heroArchetypeTag}>{activeArchetype.name}</Text>
                                    </View>
                                    <Text style={styles.heroRank}>⭐ Rank {hero.rank}/10</Text>
                                  </View>
                                  <View style={styles.heroCardRight}>
                                    <Text style={styles.heroLevel}>Lv {hero.level}</Text>
                                    <Pressable
                                      style={[styles.toggleBtn, inActiveTeam && styles.toggleBtnActive]}
                                      onPress={() => toggleEquipHero(hero.uid)}
                                    >
                                      <Text style={styles.toggleBtnText}>{inActiveTeam ? '✔ Team' : '+ Add'}</Text>
                                    </Pressable>
                                    <Pressable
                                      style={styles.expandBtn}
                                      onPress={() => {
                                        const s = new Set(expandedHeroes);
                                        if (s.has(hero.uid)) s.delete(hero.uid);
                                        else s.add(hero.uid);
                                        setExpandedHeroes(s);
                                      }}
                                    >
                                      <Text style={styles.expandBtnText}>{isExpanded ? 'Hide' : 'More'}</Text>
                                    </Pressable>
                                  </View>
                                </View>

                                <Text style={styles.heroDetail} numberOfLines={1}>
                                  ⭐ Rank {hero.rank}/10 • +{(hero.teamBoost * 100).toFixed(1)}% boost
                                </Text>
                                <Text style={styles.heroDetail} numberOfLines={1}>
                                  Rebirth Power x{(hero.rebirthStatMult ?? 1).toFixed(2)}
                                </Text>
                              </>
                            )}

                            {isExpanded && (
                              <>
                                {nextRankCost && (
                                  <View style={styles.rankUpSection}>
                                    <Text style={styles.rankUpLabel}>Rank Up Cost: {nextRankCost} 💠</Text>
                                    {canRankUpToMax ? (
                                      <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <Pressable
                                          style={[
                                            styles.rankUpBtn,
                                            !canRankUp && styles.rankUpBtnDisabled,
                                            { flex: 1 },
                                          ]}
                                          disabled={!canRankUp}
                                          onPress={() => rankUpHero(hero.uid)}
                                        >
                                          <Text style={styles.rankUpBtnText}>
                                            {canRankUp ? 'Rank Up' : `Need ${nextRankCost - state.heroShards} more`}
                                          </Text>
                                        </Pressable>
                                        <Pressable
                                          style={[styles.rankUpBtn, { flex: 1 }]}
                                          onPress={() => {
                                            if (canRankUpToMaxAndRebirth) {
                                              rankUpHeroToMaxAndRebirth(hero.uid);
                                            } else {
                                              rankUpHeroToMax(hero.uid);
                                            }
                                          }}
                                        >
                                          <Text style={styles.rankUpBtnText}>
                                            {canRankUpToMaxAndRebirth
                                              ? `Rank 10 + Rebirth (${rankUpCostToMax + heroRebirthShardCost}💠 + ${heroRebirthEssenceCost}✨)`
                                              : `Rank to 10 (${rankUpCostToMax}💠)`}
                                          </Text>
                                        </Pressable>
                                      </View>
                                    ) : (
                                      <Pressable
                                        style={[styles.rankUpBtn, !canRankUp && styles.rankUpBtnDisabled]}
                                        disabled={!canRankUp}
                                        onPress={() => rankUpHero(hero.uid)}
                                      >
                                        <Text style={styles.rankUpBtnText}>
                                          {canRankUp ? 'Rank Up' : `Need ${nextRankCost - state.heroShards} more`}
                                        </Text>
                                      </Pressable>
                                    )}
                                  </View>
                                )}
                                {hero.rank === 10 && <Text style={styles.maxRankMsg}>✓ Max Rank!</Text>}

                                {details && (
                                  <View style={styles.heroStatsRow}>
                                    <View style={styles.heroStatBadge}>
                                      <Text style={styles.heroStatBadgeLabel}>DPS</Text>
                                      <Text style={styles.heroStatBadgeValue}>{details.dps.toFixed(1)}</Text>
                                    </View>
                                    <View style={styles.heroStatBadge}>
                                      <Text style={styles.heroStatBadgeLabel}>HP</Text>
                                      <Text style={styles.heroStatBadgeValue}>{details.hp}</Text>
                                    </View>
                                  </View>
                                )}

                                <View style={styles.heroIdentityBox}>
                                  <Text style={styles.heroIdentityLine}>Passive: {trait.name}</Text>
                                  <Text style={styles.heroIdentitySub}>{trait.description}</Text>
                                  <Text style={styles.heroIdentityLine}>Active: {activeArchetype.name}</Text>
                                  <Text style={styles.heroIdentitySub}>{activeArchetype.description}</Text>
                                  <Text style={styles.heroIdentityLine}>
                                    Unique Weapon:{' '}
                                    {uniqueRank > 0 ? `${uniqueWeaponName} (Rank ${uniqueRank}/10)` : 'Locked'}
                                  </Text>
                                  <Text style={styles.heroIdentitySub}>Doctrine: {uniqueDoctrine}</Text>
                                  <Text style={styles.heroIdentitySub}>{uniqueSkill}</Text>
                                  <Text style={styles.heroIdentitySub}>{uniqueWeaponLore}</Text>
                                </View>

                                {uniqueRank > 0 && (
                                  <Pressable
                                    style={[styles.rankUpBtn, !canToggleUnique && styles.rankUpBtnDisabled]}
                                    disabled={!canToggleUnique}
                                    onPress={() => toggleHeroUniqueWeapon(hero.uid)}
                                  >
                                    <Text style={styles.rankUpBtnText}>
                                      {canToggleUnique
                                        ? uniqueEquipped
                                          ? 'Unequip Unique Weapon'
                                          : 'Equip Unique Weapon'
                                        : 'Only highest-rarity copy can equip'}
                                    </Text>
                                  </Pressable>
                                )}

                                {uniqueEquipped && uniqueRank > 0 && !isUniqueBearer && (
                                  <Text style={styles.heroDetail}>Assigned to higher-rarity copy</Text>
                                )}

                                {details && (
                                  <View style={styles.heroExpandedStats}>
                                    {(['STR', 'VIT', 'AGI', 'INT', 'SPR'] as const).map((lbl, i) => {
                                      const val = [details.str, details.vit, details.agi, details.int, details.spr][i];
                                      return (
                                        <View key={lbl} style={styles.heroStatItem}>
                                          <Text style={styles.heroStatItemLabel}>{lbl}</Text>
                                          <Text style={styles.heroStatItemValue}>{val}</Text>
                                        </View>
                                      );
                                    })}
                                  </View>
                                )}

                                {hero.level < 999 &&
                                  (() => {
                                    const lvlCost = getHeroGoldLevelCost(hero.level);
                                    const canAfford = state.gold >= lvlCost;
                                    return (
                                      <Pressable
                                        style={[styles.heroLvlUpBtn, !canAfford && styles.heroLvlUpBtnDisabled]}
                                        disabled={!canAfford}
                                        onPress={() => levelUpHeroGold(hero.uid)}
                                      >
                                        <Text style={styles.heroLvlUpBtnText}>⬆ Level Up {fmt(lvlCost)}g</Text>
                                      </Pressable>
                                    );
                                  })()}
                                {hero.rank >= 10 && hero.level >= HERO_LEVEL_CAP && (
                                  <Pressable
                                    style={[styles.rankUpBtn, !canHeroRebirth && styles.rankUpBtnDisabled]}
                                    disabled={!canHeroRebirth}
                                    onPress={() => rebirthHero(hero.uid)}
                                  >
                                    <Text style={styles.rankUpBtnText}>
                                      {canHeroRebirth
                                        ? `Hero Rebirth (${heroRebirthShardCost}💠 + ${heroRebirthEssenceCost}✨, +${heroRebirthPlan.statGainPct}% stats)`
                                        : `Need ${Math.max(0, heroRebirthShardCost - state.heroShards)}💠 / ${Math.max(0, heroRebirthEssenceCost - state.essence)}✨`}
                                    </Text>
                                  </Pressable>
                                )}
                                <Pressable
                                  style={[styles.recycleBtn, isUniqueBearer && styles.rankUpBtnDisabled]}
                                  disabled={isUniqueBearer}
                                  onPress={() => setRecycleConfirmUid(hero.uid)}
                                >
                                  <Text style={styles.recycleBtnText}>
                                    {isUniqueBearer
                                      ? '🔒 Unique Weapon Equipped - Cannot Recycle'
                                      : `♻️ Recycle for ${shardValue} 💠`}
                                  </Text>
                                </Pressable>
                              </>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            {heroesSubTab === 'batch' && (
              <View style={styles.batchLevelingSection}>
                <Text style={styles.batchLevelTitle}>📚 Level Multiple Heroes at Once</Text>
                <View style={styles.batchLevelControls}>
                  <View style={[styles.targetLevelControl, isNarrow && { gap: 6 }]}>
                    <Text style={styles.targetLevelLabel}>Level Increase: </Text>
                    <View style={[styles.targetLevelButtons, isNarrow && { flexWrap: 'wrap' }]}>
                      {([10, 50, 100, 'max'] as const).map(mode => (
                        <Pressable
                          key={String(mode)}
                          style={[styles.levelBtn, batchLevelMode === mode && styles.levelBtnActive]}
                          onPress={() => setBatchLevelMode(mode)}
                        >
                          <Text style={[styles.levelBtnText, batchLevelMode === mode && styles.levelBtnTextActive]}>
                            {mode === 'max' ? '+MAX' : `+${mode}`}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>

                <Text style={styles.selectHeroesLabel}>Select Heroes to Level</Text>
                <ScrollView
                  style={styles.batchHeroList}
                  nestedScrollEnabled
                  contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: batchGap, paddingBottom: 8 }}
                >
                  {sortedBatchHeroes.map(hero => {
                    const isSelected = batchLevelSelected.has(hero.uid);
                    const maxLevel = HERO_LEVEL_CAP;
                    const isOnTeam = activeTeamSet.has(hero.uid);
                    const cls = getClassConfig(hero.heroClass);

                    let totalCost = 0;
                    let projectedLevel = hero.level;

                    if (batchLevelMode === 'max') {
                      let remainingGold = state.gold;
                      for (let lvl = hero.level; lvl < maxLevel; lvl++) {
                        const levelCost = getHeroGoldLevelCost(lvl);
                        if (remainingGold < levelCost) break;
                        totalCost += levelCost;
                        remainingGold -= levelCost;
                        projectedLevel = lvl + 1;
                      }
                    } else {
                      for (let lvl = hero.level; lvl < Math.min(hero.level + batchLevelMode, maxLevel); lvl++) {
                        totalCost += getHeroGoldLevelCost(lvl);
                      }
                      projectedLevel = Math.min(hero.level + batchLevelMode, maxLevel);
                    }

                    return (
                      <Pressable
                        key={hero.uid}
                        style={[
                          styles.batchHeroCard,
                          isPhoneWidth && styles.batchHeroCardMobile,
                          {
                            width: isSingleColumnBatch ? '100%' : batchCardWidth,
                            alignItems: isPhoneWidth ? 'stretch' : 'center',
                          },
                          isSelected && styles.batchHeroCardSelected,
                          isOnTeam && styles.heroCardActive,
                        ]}
                        onPress={() => {
                          const updated = new Set(batchLevelSelected);
                          if (updated.has(hero.uid)) {
                            updated.delete(hero.uid);
                          } else {
                            updated.add(hero.uid);
                          }
                          setBatchLevelSelected(updated);
                        }}
                      >
                        {isPhoneWidth ? (
                          <>
                            <View style={styles.batchHeroHeaderMobile}>
                              <View style={styles.batchHeroHeaderLeftMobile}>
                                <View style={styles.batchHeroCheckbox}>
                                  {isSelected && <View style={styles.batchHeroCheckboxInner} />}
                                </View>
                                <View style={styles.batchHeroInfoMobile}>
                                  <Text style={styles.batchHeroNameMobile} numberOfLines={1}>
                                    {cls.emoji} {hero.name}
                                  </Text>
                                  <Text style={styles.batchHeroLevelMobile} numberOfLines={1}>
                                    Level {hero.level} → {projectedLevel}
                                  </Text>
                                </View>
                              </View>
                            </View>

                            <View style={styles.batchHeroProjectedRowMobile}>
                              <View style={styles.batchHeroProjectedPill}>
                                <Text style={styles.batchHeroProjectedPillText}>
                                  +{projectedLevel - hero.level} levels
                                </Text>
                              </View>
                            </View>

                            <View style={styles.batchHeroTagRowMobile}>
                              <View
                                style={[
                                  styles.batchHeroMetaPillMobile,
                                  isOnTeam ? styles.batchHeroMetaPillTeamMobile : styles.batchHeroMetaPillRankMobile,
                                ]}
                              >
                                <Text style={styles.batchHeroMetaPillTextMobile}>
                                  {isOnTeam ? 'Active Team' : `Rank ${hero.rank}/10`}
                                </Text>
                              </View>
                              <View style={styles.batchHeroMetaPillMobile}>
                                <Text style={styles.batchHeroMetaPillTextMobile}>{hero.rarity}</Text>
                              </View>
                              <View style={[styles.batchHeroMetaPillMobile, styles.batchHeroMetaPillCostMobile]}>
                                <Text
                                  style={[styles.batchHeroMetaPillTextMobile, styles.batchHeroMetaPillTextCostMobile]}
                                >
                                  {batchLevelMode === 'max' ? `Now ${fmt(totalCost)} 💰` : `${fmt(totalCost)} 💰`}
                                </Text>
                              </View>
                            </View>
                          </>
                        ) : (
                          <>
                            <View style={[styles.batchHeroCheckbox, isNarrow && { marginTop: 2 }]}>
                              {isSelected && <View style={styles.batchHeroCheckboxInner} />}
                            </View>
                            <View style={[styles.batchHeroInfo, isNarrow && { gap: 3, minWidth: 0 }]}>
                              <Text style={[styles.batchHeroName, isNarrow && { fontSize: 12 }]} numberOfLines={1}>
                                {cls.emoji} {hero.name}
                              </Text>
                              <Text style={[styles.batchHeroLevel, isNarrow && { fontSize: 11 }]} numberOfLines={1}>
                                {isNarrow
                                  ? `Lv ${hero.level} -> ${projectedLevel}`
                                  : `Level ${hero.level} → ${projectedLevel}`}
                              </Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                                <Text style={[styles.batchHeroTeamTag, isNarrow && { fontSize: 10 }]} numberOfLines={1}>
                                  {isOnTeam ? '🛡️ Active Team' : `⭐ Rank ${hero.rank}/10`}
                                </Text>
                              </View>
                              <Text style={[styles.batchHerosCost, isNarrow && { fontSize: 10 }]} numberOfLines={1}>
                                {batchLevelMode === 'max'
                                  ? `Affordable now: ${fmt(totalCost)} 💰`
                                  : `Cost: ${fmt(totalCost)} 💰`}
                              </Text>
                            </View>
                          </>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {batchLevelSelected.size > 0 && (
                  <Pressable
                    style={styles.batchLevelConfirmBtn}
                    onPress={() => {
                      batchLevelHeroes(Array.from(batchLevelSelected), batchLevelMode);
                      setBatchLevelSelected(new Set());
                    }}
                  >
                    <Text style={styles.batchLevelConfirmText}>
                      Apply {batchLevelMode === 'max' ? '+MAX' : `+${batchLevelMode}`} to {batchLevelSelected.size}{' '}
                      Heroes
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}

        {diamondConfirm && (
          <Modal transparent animationType="fade" visible onRequestClose={() => setDiamondConfirm(null)}>
            <View style={confirmStyles.backdrop}>
              <View style={confirmStyles.card}>
                <Text style={confirmStyles.title}>💎 Confirm Diamond Summon</Text>
                <Text style={confirmStyles.body}>
                  Spend {fmt(diamondConfirm.cost)} Diamonds on{' '}
                  {diamondConfirm.type === 'x10' ? 'x10 Cinematic' : 'a single'} summon?
                </Text>
                <Text style={confirmStyles.balance}>
                  Balance: {fmt(state.diamonds)} → {fmt(state.diamonds - diamondConfirm.cost)}
                </Text>
                <View style={confirmStyles.btnRow}>
                  <Pressable style={confirmStyles.cancelBtn} onPress={() => setDiamondConfirm(null)}>
                    <Text style={confirmStyles.cancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={confirmStyles.confirmBtn}
                    onPress={() => {
                      if (diamondConfirm.type === 'x10') {
                        summonHeroX10Cinematic(undefined, true);
                      } else {
                        summonHero(true);
                      }
                      setDiamondConfirm(null);
                    }}
                  >
                    <Text style={confirmStyles.confirmText}>Summon</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </>
    );
  },
);

const confirmStyles = RNStyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#1e1e2e',
    borderRadius: 14,
    padding: 24,
    width: 300,
    borderWidth: 1,
    borderColor: '#C77DFF',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    color: '#ccc',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 6,
  },
  balance: {
    color: '#aaa',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 18,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#333',
    alignItems: 'center',
  },
  cancelText: { color: '#aaa', fontWeight: '600', fontSize: 14 },
  confirmBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#C77DFF',
    alignItems: 'center',
  },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
