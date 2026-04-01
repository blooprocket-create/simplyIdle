import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { GameState, Stats } from '../../useGameState';
import { RARITIES, HERO_LEVEL_CAP, getHeroRebirthPlan } from '../../gameConfig';
import { fmt } from '../../utils';
import { styles } from '../GameScreen';

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

export interface HeroesTabContentProps {
  tab: string;
  state: GameState;
  stats: Stats;
  heroesSubTab: string;
  setHeroesSubTab: (tab: string) => void;
  batchLevelMode: number | 'max';
  setBatchLevelMode: (mode: number | 'max') => void;
  batchLevelSelected: Set<string>;
  setBatchLevelSelected: (set: Set<string>) => void;
  canGachaX10: boolean;
  canGachaOnce: boolean;
  pityRemaining: number;
  hasGachaNotification: boolean;
  paidX10: number;
  summonTimeline: any[];
  rarityConfig: (rarity: string) => any;
  expandedHeroes: Set<string>;
  setExpandedHeroes: (set: Set<string>) => void;
  activeTeamSet: Set<string>;
  teamSlotCap: number;
  nextTeamSlotUnlock: any;
  getClassConfig: (heroClass: string) => any;
  getHeroPassiveTraitInfo: (trait: string) => any;
  getHeroActiveArchetypeInfo: (archetype: string) => any;
  calculateShardReward: (rarity: string, level: number) => number;
  getRankUpShardCost: (rarity: string, rank: number) => number;
  getHeroGoldLevelCost: (level: number) => number;
  summonHero: () => void;
  summonHeroX10: () => void;
  summonHeroX10Cinematic: () => void;
  featuredSummonBanner: FeaturedSummonBannerView;
  autoEquipBestHeroes: () => void;
  autoRecycleHeroes: () => void;
  saveTeamLoadout: (slot: number) => void;
  loadTeamLoadout: (slot: number) => void;
  toggleEquipHero: (heroId: string) => void;
  rankUpHero: (heroId: string) => void;
  rebirthHero: (heroId: string) => void;
  levelUpHeroGold: (heroId: string) => void;
  unlockTeamSlot: () => void;
  batchLevelHeroes: (heroIds: string[], mode: number | 'max') => void;
  setRecycleConfirmUid: (uid: string) => void;
  renderSubTabBar: (tabs: any[]) => React.ReactNode;
}

export const HeroesTabContent: React.FC<HeroesTabContentProps> = ({
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
  canGachaOnce,
  pityRemaining,
  hasGachaNotification,
  paidX10,
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
  summonHeroX10,
  summonHeroX10Cinematic,
  featuredSummonBanner,
  autoEquipBestHeroes,
  autoRecycleHeroes,
  saveTeamLoadout,
  loadTeamLoadout,
  toggleEquipHero,
  rankUpHero,
  rebirthHero,
  levelUpHeroGold,
  unlockTeamSlot,
  batchLevelHeroes,
  setRecycleConfirmUid,
  renderSubTabBar,
}) => {
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

  return (
    <>
      {tab === 'heroes' && (
        <View style={styles.heroesTab}>
          {renderSubTabBar((['summon', 'roster', 'batch'] as const).map(st => ({
            id: st,
            label: st === 'summon' ? 'Summon Bay' : st === 'roster' ? 'Roster' : 'Batch Level',
            active: heroesSubTab === st,
            onPress: () => setHeroesSubTab(st),
            notificationCount: st === 'summon' && hasGachaNotification ? 1 : st === 'batch' && hasBatchNotification ? 1 : st === 'roster' && hasUnlockableTeamSlot ? 1 : 0,
          })))}

          {heroesSubTab === 'summon' && (
            <View style={styles.gachaSection}>
              <Text style={styles.sectionTitle}>✨ Gacha Summon</Text>
              <View style={styles.featuredSummonCard}>
                <Text style={styles.featuredSummonTitle}>{featuredSummonBanner.artEmoji} Featured Banner: {featuredSummonBanner.title}</Text>
                <Text style={styles.featuredSummonDesc}>{featuredSummonBanner.description}</Text>
                <Text style={styles.featuredSummonDesc}>
                  Focus Hero: {featuredSummonBanner.featuredHeroEmoji} {featuredSummonBanner.featuredHeroName} • Boosted at {featuredSummonBanner.highestRarity.toUpperCase()} rarity on cinematic pulls.
                </Text>
                <View style={styles.featuredSummonMeterRow}>
                  <Text style={styles.featuredSummonMeterLabel}>Legendary Pity</Text>
                  <Text style={styles.featuredSummonMeterValue}>{state.gachaPityCounter}/30</Text>
                </View>
                <View style={styles.hpBarBg}>
                  <View style={[styles.hpBarFill, { width: `${Math.min(100, (state.gachaPityCounter / 30) * 100)}%`, backgroundColor: '#C77DFF' }]} />
                </View>
                <Pressable
                  style={[
                    styles.featuredSummonBtn,
                    !canGachaX10 && styles.featuredSummonBtnDisabled,
                  ]}
                  disabled={!canGachaX10}
                  onPress={summonHeroX10Cinematic}
                >
                  <Text style={styles.featuredSummonBtnText}>Cinematic x10 Summon</Text>
                </Pressable>
              </View>
              <Text style={styles.pityLabel}>Pity: {state.gachaPityCounter}/30 • {pityRemaining} until guaranteed Legendary+</Text>
              {state.freeSummonCharges > 0 ? (
                <Text style={styles.gachaFree}>Free Summon Ready ({state.freeSummonCharges})</Text>
              ) : (
                <Text style={styles.gachaCost}>Cost: 💧 1 Boss Tear ({state.bossTears} owned)</Text>
              )}
              <View style={styles.gachaBtnRow}>
                <Pressable
                  style={[
                    styles.gachaBtn,
                    !canGachaOnce && styles.gachaBtnDisabled,
                    hasGachaNotification && styles.gachaBtnNotify,
                  ]}
                  disabled={!canGachaOnce}
                  onPress={summonHero}
                >
                  <Text style={styles.gachaBtnText}>{state.freeSummonCharges > 0 ? 'Use Free Summon' : 'Summon Hero'}</Text>
                  {hasGachaNotification && <View style={styles.gachaBtnDot} />}
                </Pressable>
                <Pressable
                  style={[
                    styles.gachaBtn,
                    styles.gachaBtnX10,
                    !canGachaX10 && styles.gachaBtnDisabled,
                  ]}
                  disabled={!canGachaX10}
                  onPress={summonHeroX10}
                >
                  <Text style={[styles.gachaBtnText, styles.gachaBtnTextLight]}>Summon x10</Text>
                  <Text style={styles.gachaX10Cost}>💧 {paidX10} Boss Tears</Text>
                </Pressable>
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

          {heroesSubTab === 'roster' && (
            <>
              <View style={[styles.heroRosterHeader, isPhoneWidth && styles.heroRosterHeaderStacked]}>
                <Text style={styles.sectionTitle}>👥 Roster Command</Text>
                <View style={[styles.heroRosterActions, isPhoneWidth && styles.heroRosterActionsStacked]}>
                  <Pressable style={styles.autoEquipBtn} onPress={autoEquipBestHeroes}>
                    <Text style={styles.autoEquipBtnText}>⚡ Auto Equip</Text>
                  </Pressable>
                  <Pressable style={styles.autoRecycleBtn} onPress={autoRecycleHeroes}>
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
                      Next slot {nextTeamSlotUnlock.targetSlots}: Wave {nextTeamSlotUnlock.requiredWave} • {fmt(nextTeamSlotUnlock.goldCost)} gold • {fmt(nextTeamSlotUnlock.shardCost)} shards
                    </Text>
                    <Text style={styles.heroSlotUnlockMeta}>
                      Wave: {nextTeamSlotUnlock.waveMet ? 'OK' : `${state.highestWaveReached}/${nextTeamSlotUnlock.requiredWave}`} •
                      Gold: {nextTeamSlotUnlock.goldMet ? 'OK' : `${fmt(state.gold)}/${fmt(nextTeamSlotUnlock.goldCost)}`} •
                      Shards: {nextTeamSlotUnlock.shardMet ? 'OK' : `${fmt(state.heroShards)}/${fmt(nextTeamSlotUnlock.shardCost)}`}
                    </Text>
                    <Pressable
                      style={[styles.heroSlotUnlockBtn, !nextTeamSlotUnlock.canUnlock && styles.heroSlotUnlockBtnDisabled]}
                      disabled={!nextTeamSlotUnlock.canUnlock}
                      onPress={unlockTeamSlot}
                    >
                      <Text style={styles.heroSlotUnlockBtnText}>
                        {nextTeamSlotUnlock.canUnlock ? `Unlock Slot ${nextTeamSlotUnlock.targetSlots}` : 'Need More Resources'}
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <Text style={styles.heroSlotUnlockMeta}>All team slots unlocked.</Text>
                )}
              </View>
              <View style={[styles.loadoutRow, isPhoneWidth && styles.loadoutRowMobile]}>
                {[0, 1, 2].map(slot => (
                  <View key={slot} style={[styles.loadoutCell, isPhoneWidth && styles.loadoutCellMobile]}>
                    <Text style={styles.loadoutLabel}>L{slot + 1}</Text>
                    <View style={styles.loadoutBtnsWrap}>
                      <Pressable style={styles.loadoutSaveBtn} onPress={() => saveTeamLoadout(slot)}>
                        <Text style={styles.loadoutBtnText}>Save</Text>
                      </Pressable>
                      <Pressable style={styles.loadoutLoadBtn} onPress={() => loadTeamLoadout(slot)}>
                        <Text style={styles.loadoutBtnText}>Load</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
              {state.heroRoster.length === 0 ? (
                <Text style={styles.emptyMsg}>Summon your first hero!</Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: rosterGap, alignItems: 'stretch' }}>
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
                  const canRankUp = !!nextRankCost && state.heroShards >= nextRankCost;
                  const canHeroRebirth = hero.rank >= 10 && hero.level >= HERO_LEVEL_CAP && state.heroShards >= heroRebirthShardCost && state.essence >= heroRebirthEssenceCost;
                  const trait = getHeroPassiveTraitInfo(hero.passiveTrait);
                  const activeArchetype = getHeroActiveArchetypeInfo(hero.activeSkillArchetype);
                  const faction = hero.heroClass === 'warrior' || hero.heroClass === 'berserker'
                    ? 'Vanguard'
                    : hero.heroClass === 'archer'
                      ? 'Ranger'
                      : hero.heroClass === 'mage'
                        ? 'Arcanum'
                        : 'Aegis';

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
                      <View style={[styles.heroCardRarityBar, { backgroundColor: rarity.color }]} />
                      <View style={[styles.heroCardBody, isPhoneWidth && styles.heroCardBodyMobile]}> 
                        {isPhoneWidth ? (
                          <>
                            <View style={styles.heroCardHeaderMobile}>
                              <View style={[styles.heroPortraitFrame, styles.heroPortraitFrameMobile, { borderColor: rarity.color }]}>
                                <Text style={[styles.heroEmoji, styles.heroEmojiMobile]}>{hero.emoji}</Text>
                              </View>
                              <View style={styles.heroCardInfoMobile}>
                                <View style={styles.heroNameRowMobile}>
                                  <Text style={[styles.heroName, styles.heroNameMobile]} numberOfLines={1}>{hero.name}</Text>
                                  <View style={styles.heroLevelPillMobile}>
                                    <Text style={styles.heroLevelPillTextMobile} numberOfLines={1}>Lv {hero.level}</Text>
                                  </View>
                                </View>
                                <Text style={styles.heroMetaMobile} numberOfLines={1}>
                                  <Text style={{ color: rarity.color }}>{hero.rarity}</Text>
                                  {' • '}{cls.name}
                                </Text>
                                <Text style={styles.heroSubMetaMobile} numberOfLines={1}>{activeArchetype.name} doctrine</Text>
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
                                <Text style={styles.heroBoostPillTextMobile}>+{(hero.teamBoost * 100).toFixed(1)}% team boost</Text>
                              </View>
                              {inActiveTeam && (
                                <View style={styles.heroTeamPillMobile}>
                                  <Text style={styles.heroTeamPillTextMobile}>Active Team</Text>
                                </View>
                              )}
                            </View>

                            <View style={styles.heroActionRowMobile}>
                              <Pressable
                                style={[styles.toggleBtn, styles.toggleBtnMobile, inActiveTeam && styles.toggleBtnActive, inActiveTeam && styles.toggleBtnMobileActive]}
                                onPress={() => toggleEquipHero(hero.uid)}
                              >
                                <Text style={styles.toggleBtnText}>{inActiveTeam ? '✔ Team' : '+ Add'}</Text>
                              </Pressable>
                              <Pressable
                                style={[styles.expandBtn, styles.expandBtnMobile]}
                                onPress={() => {
                                  const s = new Set(expandedHeroes);
                                  if (s.has(hero.uid)) s.delete(hero.uid); else s.add(hero.uid);
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
                              <View style={[styles.heroPortraitFrame, { borderColor: rarity.color }]}>
                                <Text style={styles.heroEmoji}>{hero.emoji}</Text>
                              </View>
                              <View style={styles.heroCardInfo}>
                                <Text style={styles.heroName} numberOfLines={1}>{hero.name}</Text>
                                <Text style={styles.heroDetail} numberOfLines={1}>
                                  <Text style={{ color: rarity.color }}>{hero.rarity}</Text>
                                  {' • '}{cls.name}
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
                                    if (s.has(hero.uid)) s.delete(hero.uid); else s.add(hero.uid);
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
                                <Pressable
                                  style={[styles.rankUpBtn, !canRankUp && styles.rankUpBtnDisabled]}
                                  disabled={!canRankUp}
                                  onPress={() => rankUpHero(hero.uid)}
                                >
                                  <Text style={styles.rankUpBtnText}>{canRankUp ? 'Rank Up' : `Need ${nextRankCost - state.heroShards} more`}</Text>
                                </Pressable>
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
                            </View>

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

                            {hero.level < 999 && (() => {
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
                              style={styles.recycleBtn}
                              onPress={() => setRecycleConfirmUid(hero.uid)}
                            >
                              <Text style={styles.recycleBtnText}>♻️ Recycle for {shardValue} 💠</Text>
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
                <View style={[styles.targetLevelControl, isNarrow && { gap: 6 }] }>
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
                        { width: isSingleColumnBatch ? '100%' : batchCardWidth, alignItems: isPhoneWidth ? 'stretch' : 'center' },
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
                                <Text style={styles.batchHeroNameMobile} numberOfLines={1}>{hero.emoji} {hero.name}</Text>
                                <Text style={styles.batchHeroLevelMobile} numberOfLines={1}>
                                  Level {hero.level} → {projectedLevel}
                                </Text>
                              </View>
                            </View>
                          </View>

                          <View style={styles.batchHeroProjectedRowMobile}>
                            <View style={styles.batchHeroProjectedPill}>
                              <Text style={styles.batchHeroProjectedPillText}>+{projectedLevel - hero.level} levels</Text>
                            </View>
                          </View>

                          <View style={styles.batchHeroTagRowMobile}>
                            <View style={[styles.batchHeroMetaPillMobile, isOnTeam ? styles.batchHeroMetaPillTeamMobile : styles.batchHeroMetaPillRankMobile]}>
                              <Text style={styles.batchHeroMetaPillTextMobile}>{isOnTeam ? 'Active Team' : `Rank ${hero.rank}/10`}</Text>
                            </View>
                            <View style={styles.batchHeroMetaPillMobile}>
                              <Text style={styles.batchHeroMetaPillTextMobile}>{hero.rarity}</Text>
                            </View>
                            <View style={[styles.batchHeroMetaPillMobile, styles.batchHeroMetaPillCostMobile]}>
                              <Text style={[styles.batchHeroMetaPillTextMobile, styles.batchHeroMetaPillTextCostMobile]}>
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
                            <Text style={[styles.batchHeroName, isNarrow && { fontSize: 12 }]} numberOfLines={1}>{hero.emoji} {hero.name}</Text>
                            <Text style={[styles.batchHeroLevel, isNarrow && { fontSize: 11 }]} numberOfLines={1}>
                              {isNarrow ? `Lv ${hero.level} -> ${projectedLevel}` : `Level ${hero.level} → ${projectedLevel}`}
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
                    Apply {batchLevelMode === 'max' ? '+MAX' : `+${batchLevelMode}`} to {batchLevelSelected.size} Heroes
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}
    </>
  );
};
