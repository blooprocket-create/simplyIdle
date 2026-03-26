import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { GameState, Stats } from '../../useGameState';
import { RARITIES, HERO_LEVEL_CAP } from '../../gameConfig';
import { fmt } from '../../utils';
import { styles } from '../GameScreen';

export interface HeroesTabContentProps {
  tab: string;
  state: GameState;
  stats: Stats;
  heroesSubTab: string;
  setHeroesSubTab: (tab: string) => void;
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
  getClassConfig: (heroClass: string) => any;
  getHeroPassiveTraitInfo: (trait: string) => any;
  getHeroActiveArchetypeInfo: (archetype: string) => any;
  calculateShardReward: (rarity: string, level: number) => number;
  getRankUpShardCost: (rarity: string, rank: number) => number;
  getHeroGoldLevelCost: (level: number) => number;
  summonHero: () => void;
  summonHeroX10: () => void;
  summonHeroX10Cinematic: () => void;
  autoEquipBestHeroes: () => void;
  autoRecycleHeroes: () => void;
  saveTeamLoadout: (slot: number) => void;
  loadTeamLoadout: (slot: number) => void;
  toggleEquipHero: (heroId: string) => void;
  rankUpHero: (heroId: string) => void;
  levelUpHeroGold: (heroId: string) => void;
  setRecycleConfirmUid: (uid: string) => void;
  renderSubTabBar: (tabs: any[]) => React.ReactNode;
}

export const HeroesTabContent: React.FC<HeroesTabContentProps> = ({
  tab,
  state,
  stats,
  heroesSubTab,
  setHeroesSubTab,
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
  getClassConfig,
  getHeroPassiveTraitInfo,
  getHeroActiveArchetypeInfo,
  calculateShardReward,
  getRankUpShardCost,
  getHeroGoldLevelCost,
  summonHero,
  summonHeroX10,
  summonHeroX10Cinematic,
  autoEquipBestHeroes,
  autoRecycleHeroes,
  saveTeamLoadout,
  loadTeamLoadout,
  toggleEquipHero,
  rankUpHero,
  levelUpHeroGold,
  setRecycleConfirmUid,
  renderSubTabBar,
}) => {
  const { width: viewportWidth } = useWindowDimensions();

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

  const rosterColumns = viewportWidth >= 980 ? 4 : viewportWidth >= 700 ? 3 : 2;
  const rosterGap = 8;
  const rosterHorizontalPadding = 44;
  const rosterCardWidth = Math.max(
    140,
    Math.floor((viewportWidth - rosterHorizontalPadding - rosterGap * (rosterColumns - 1)) / rosterColumns),
  );

  return (
    <>
      {tab === 'heroes' && (
        <View style={styles.heroesTab}>
          {renderSubTabBar((['summon', 'roster'] as const).map(st => ({
            id: st,
            label: st === 'summon' ? 'Summon Bay' : 'Roster',
            active: heroesSubTab === st,
            onPress: () => setHeroesSubTab(st),
          })))}

          {heroesSubTab === 'summon' && (
            <View style={styles.gachaSection}>
              <Text style={styles.sectionTitle}>✨ Gacha Summon</Text>
              <View style={styles.featuredSummonCard}>
                <Text style={styles.featuredSummonTitle}>🌌 Featured Banner: Astral Vanguard</Text>
                <Text style={styles.featuredSummonDesc}>Higher odds for EPIC+ drops during this rotation. Mythic trigger creates full-screen flash.</Text>
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
              <View style={styles.heroRosterHeader}>
                <Text style={styles.sectionTitle}>👥 Roster Command</Text>
                <View style={styles.heroRosterActions}>
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
              <View style={styles.loadoutRow}>
                {[0, 1, 2].map(slot => (
                  <View key={slot} style={styles.loadoutCell}>
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
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {sortedRoster.map(hero => {
                  const inActiveTeam = activeTeamSet.has(hero.uid);
                  const cls = getClassConfig(hero.heroClass);
                  const rarity = rarityConfig(hero.rarity);
                  const details = stats.heroDetails[hero.uid];
                  const isExpanded = expandedHeroes.has(hero.uid);
                  const shardValue = calculateShardReward(hero.rarity, hero.level);
                  const nextRankCost = hero.rank < 10 ? getRankUpShardCost(hero.rarity, hero.rank + 1) : null;
                  const canRankUp = !!nextRankCost && state.heroShards >= nextRankCost;
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
                        inActiveTeam && styles.heroCardActive,
                        { width: rosterCardWidth, marginBottom: 0 },
                      ]}
                    >
                      <View style={[styles.heroCardRarityBar, { backgroundColor: rarity.color }]} />
                      <View style={styles.heroCardBody}>
                        <View style={styles.heroCardTopRow}>
                          <View style={[styles.heroPortraitFrame, { borderColor: rarity.color }]}>
                            <Text style={styles.heroEmoji}>{hero.emoji}</Text>
                          </View>
                          <View style={styles.heroCardInfo}>
                            <Text style={styles.heroName}>{hero.name}</Text>
                            <Text style={styles.heroDetail}>
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

                        <Text style={styles.heroDetail}>⭐ Rank {hero.rank}/10 • +{(hero.teamBoost * 100).toFixed(1)}% boost</Text>

                        {isExpanded && (
                          <>
                            {nextRankCost && (
                              <View style={styles.rankUpSection}>
                                <Text style={styles.rankUpLabel}>Rank Up Cost: {nextRankCost} ✨</Text>
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
                            <Pressable
                              style={styles.recycleBtn}
                              onPress={() => setRecycleConfirmUid(hero.uid)}
                            >
                              <Text style={styles.recycleBtnText}>♻️ Recycle for {shardValue} ✨</Text>
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
        </View>
      )}
    </>
  );
};
