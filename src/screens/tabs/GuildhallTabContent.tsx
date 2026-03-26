import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { GameState, Stats, EXPEDITION_CONTRACT_REFRESH_MS, EXPEDITION_CONTRACT_REFRESH_GOLD_COST } from '../../useGameState';
import { HERO_LEVEL_CAP, RARITIES } from '../../gameConfig';
import { EXPEDITION_TYPES, EXPEDITION_TYPE_META, EXPEDITION_RARITY_META, formatDurationShort, ExpeditionType, ExpeditionRarity } from '../GameScreen';
import { fmt } from '../../utils';
import { styles } from '../GameScreen';

export interface GuildhallTabContentProps {
  tab: string;
  state: GameState;
  stats: Stats;
  guildhallSubTab: string;
  setGuildhallSubTab: (tab: string) => void;
  batchLevelMode: number | 'max';
  setBatchLevelMode: (mode: number | 'max') => void;
  batchLevelSelected: Set<string>;
  setBatchLevelSelected: (set: Set<string>) => void;
  getHeroGoldLevelCost: (level: number) => number;
  batchLevelHeroes: (heroIds: string[], mode: number | 'max') => void;
  upgradeFacility: (facility: string) => void;
  startExpedition: (type: string, rarity: string) => void;
  completeExpedition: (expeditionId: string) => void;
  refreshExpeditionContracts: () => void;
  renderSubTabBar: (tabs: any[]) => React.ReactNode;
}

export const GuildhallTabContent: React.FC<GuildhallTabContentProps> = ({
  tab,
  state,
  stats,
  guildhallSubTab,
  setGuildhallSubTab,
  batchLevelMode,
  setBatchLevelMode,
  batchLevelSelected,
  setBatchLevelSelected,
  getHeroGoldLevelCost,
  batchLevelHeroes,
  upgradeFacility,
  startExpedition,
  completeExpedition,
  refreshExpeditionContracts,
  renderSubTabBar,
}) => {
  const { width: viewportWidth } = useWindowDimensions();
  const isPhoneWidth = viewportWidth < 700;
  const isSingleColumnBatch = viewportWidth < 520;
  const isNarrow = viewportWidth < 390;
  const isUltraNarrow = viewportWidth < 330;
  const activeTeamSet = useMemo(() => new Set(state.activeTeamHeroIds), [state.activeTeamHeroIds]);

  const rarityRank = useMemo(() => {
    const rankMap: Record<string, number> = {};
    RARITIES.forEach((rarity, index) => {
      rankMap[rarity.id] = index;
    });
    return rankMap;
  }, []);

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

  const batchColumns = isSingleColumnBatch ? 1 : viewportWidth >= 1180 ? 4 : viewportWidth >= 860 ? 3 : 2;
  const batchGap = isPhoneWidth ? 10 : 8;
  const batchHorizontalPadding = isPhoneWidth ? 28 : 44;
  const batchCardWidth = Math.max(
    isSingleColumnBatch ? viewportWidth - batchHorizontalPadding : isUltraNarrow ? 220 : 180,
    Math.floor((viewportWidth - batchHorizontalPadding - batchGap * (batchColumns - 1)) / batchColumns),
  );

  return (
    <>
      {tab === 'guildhall' && (
        <View style={styles.guildhallTab}>
          <Text style={styles.sectionTitle}>⚔️ Guild Headquarters</Text>
          {renderSubTabBar((['batch', 'facilities', 'expeditions'] as const).map(st => ({
            id: st,
            label: st === 'batch' ? 'Batch Level' : st === 'facilities' ? 'Facilities' : 'Expeditions',
            active: guildhallSubTab === st,
            onPress: () => setGuildhallSubTab(st),
          })))}

          {/* BATCH LEVELING TAB */}
          {guildhallSubTab === 'batch' && (
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

          {/* FACILITIES TAB */}
          {guildhallSubTab === 'facilities' && (
            <View style={styles.facilitiesSection}>
              <Text style={styles.facilitiesTitle}>🏰 Guild Facilities</Text>
              <Text style={styles.facilitiesDesc}>Invest gold in permanent facilities to gain passive bonuses</Text>

              {(['training', 'treasury', 'forge', 'tactics'] as const).map(facility => {
                const level = state.guildhallFacilities[facility].level;
                const costs: Record<string, number[]> = {
                  training: [5000, 12000, 30000, 75000, 150000, 300000],
                  treasury: [4000, 10000, 25000, 60000, 120000, 250000],
                  forge: [6000, 15000, 40000, 90000, 180000, 350000],
                  tactics: [5000, 12000, 30000, 75000, 150000, 300000],
                };

                const nextCost = costs[facility][level];
                const canUpgrade = level < 5 && state.gold >= nextCost;
                const bonuses: Record<string, string[]> = {
                  training: ['+5% XP gain', '+10% XP gain', '+15% XP gain', '+20% XP gain', '+25% XP gain'],
                  treasury: ['+2% gold gain', '+4% gold gain', '+6% gold gain', '+8% gold gain', '+10% gold gain'],
                  forge: ['+3% gear rarity', '+6% gear rarity', '+9% gear rarity', '+12% gear rarity', '+15% gear rarity'],
                  tactics: ['+1% team power', '+2% team power', '+3% team power', '+4% team power', '+5% team power'],
                };

                const icons = { training: '📚', treasury: '💰', forge: '⚒️', tactics: '🎯' };

                return (
                  <View key={facility} style={styles.facilityCard}>
                    <View style={styles.facilityHeader}>
                      <Text style={styles.facilityName}>{icons[facility]} {facility === 'training' ? 'Training Hall' : facility === 'treasury' ? 'Treasury' : facility === 'forge' ? 'Equipment Forge' : 'Tactics Room'}</Text>
                      <Text style={styles.facilityLevel}>Level {level}/5</Text>
                    </View>

                    <View style={styles.facilityBonusBar}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <View
                          key={i}
                          style={[
                            styles.facilityBonusSegment,
                            i < level && styles.facilityBonusSegmentActive,
                          ]}
                        />
                      ))}
                    </View>

                    {level > 0 && (
                      <Text style={styles.facilityBonusText}>Current: {bonuses[facility][level - 1]}</Text>
                    )}
                    {level < 5 && (
                      <Text style={styles.facilityNextBonus}>Next: {bonuses[facility][level]}</Text>
                    )}

                    {level < 5 ? (
                      <Pressable
                        style={[styles.facilityUpgradeBtn, !canUpgrade && styles.facilityUpgradeBtnDisabled]}
                        disabled={!canUpgrade}
                        onPress={() => upgradeFacility(facility)}
                      >
                        <Text style={styles.facilityUpgradeBtnText}>Upgrade • {fmt(nextCost)} 💰</Text>
                      </Pressable>
                    ) : (
                      <View style={[styles.facilityUpgradeBtn, styles.facilityUpgradeBtnMaxed]}>
                        <Text style={styles.facilityUpgradeBtnText}>Maxed</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* EXPEDITIONS TAB */}
          {guildhallSubTab === 'expeditions' && (
            <View style={styles.expeditionsSection}>
              <Text style={styles.expeditionsTitle}>🗺️ Expeditions</Text>
              <Text style={styles.expeditionsDesc}>Send parties on time-gated expeditions for rewards</Text>

              {state.expeditionQueue.length > 0 && (
                <View style={styles.expeditionQueueSection}>
                  <Text style={styles.expeditionQueueTitle}>Active Expeditions</Text>
                  {state.expeditionQueue.map(exp => {
                    const elapsed = Date.now() - exp.startTime;
                    const remaining = Math.max(0, exp.durationMs - elapsed);
                    const progress = (elapsed / exp.durationMs) * 100;
                    const isComplete = remaining <= 0;

                    return (
                      <View key={exp.id} style={styles.expeditionQueueCard}>
                        <Text style={styles.expeditionQueueName}>
                          {exp.type === 'artifact' && '🗿'}
                          {exp.type === 'merchant' && '🏪'}
                          {exp.type === 'ruins' && '🏛️'}
                          {exp.type === 'vault' && '🔐'}
                          {exp.type === 'abyss' && '🌑'}
                          {' '}{exp.type.charAt(0).toUpperCase() + exp.type.slice(1)} • {exp.rarity}
                        </Text>

                        <View style={styles.expeditionProgressBg}>
                          <View style={[styles.expeditionProgressFill, { width: `${Math.min(100, progress)}%` }]} />
                        </View>

                        <Text style={styles.expeditionTimeRemaining}>
                          {isComplete ? '✓ Ready to claim' : `${formatDurationShort(remaining)} remaining`}
                        </Text>

                        {isComplete && (
                          <Pressable
                            style={styles.expeditionClaimBtn}
                            onPress={() => completeExpedition(exp.id)}
                          >
                            <Text style={styles.expeditionClaimBtnText}>Claim Rewards</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={styles.expeditionStartSection}>
                {(() => {
                  const nowMs = Date.now();
                  const autoRefreshRemainingMs = Math.max(
                    0,
                    EXPEDITION_CONTRACT_REFRESH_MS - (nowMs - (state.expeditionContractsRefreshedAt ?? nowMs)),
                  );
                  const activeExpeditionTypes = new Set(state.expeditionQueue.map(exp => exp.type as string));
                  const launchableTypes = EXPEDITION_TYPES.filter(type => !activeExpeditionTypes.has(type));
                  const canAffordRefresh = state.gold >= EXPEDITION_CONTRACT_REFRESH_GOLD_COST;

                  return (
                    <>
                      <View style={styles.expeditionStartHeaderRow}>
                        <Text style={styles.expeditionStartTitle}>Launch Expedition</Text>
                        <Pressable
                          style={[styles.expeditionRefreshBtn, !canAffordRefresh && styles.expeditionRefreshBtnDisabled]}
                          disabled={!canAffordRefresh}
                          onPress={refreshExpeditionContracts}
                        >
                          <Text style={styles.expeditionRefreshBtnText}>Refresh ({fmt(EXPEDITION_CONTRACT_REFRESH_GOLD_COST)} 💰)</Text>
                        </Pressable>
                      </View>
                      <Text style={styles.expeditionRefreshTimerText}>
                        Next free contract refresh in {formatDurationShort(autoRefreshRemainingMs)}
                      </Text>
                      {launchableTypes.length === 0 && (
                        <Text style={styles.expeditionNoLaunchText}>All contracts are currently active. Claim one to launch a new run.</Text>
                      )}
                      {launchableTypes.map((type: ExpeditionType) => {
                        const rarity = state.expeditionContractOffers[type] ?? 'common';
                        const typeMeta = EXPEDITION_TYPE_META[type];
                        const rarityMeta = EXPEDITION_RARITY_META[rarity as ExpeditionRarity];
                        const cfg = {
                          icon: typeMeta.icon,
                          name: typeMeta.name,
                          rarity,
                          goldCost: rarityMeta.goldCost,
                          durationMs: rarityMeta.durationMs,
                          rewardsLabel: rarityMeta.rewardsLabel,
                        };
                        const hasGold = state.gold >= cfg.goldCost;
                        const canStartNow = hasGold;

                        return (
                          <Pressable
                            key={type}
                            style={[styles.expeditionStartCard, !canStartNow && styles.expeditionStartCardDisabled]}
                            disabled={!canStartNow}
                            onPress={() => startExpedition(type, cfg.rarity)}
                          >
                            <View style={styles.expeditionStartCardLeft}>
                              <Text style={styles.expeditionStartCardName}>{cfg.icon} {cfg.name}</Text>
                              <Text style={styles.expeditionStartCardMeta}>{cfg.rarity} • {formatDurationShort(cfg.durationMs)}</Text>
                              <Text style={styles.expeditionStartCardRewards}>{cfg.rewardsLabel}</Text>
                            </View>
                            <View style={styles.expeditionStartCardRight}>
                              <Text style={[styles.expeditionStartCardCost, !canStartNow && styles.expeditionStartCardCostDisabled]}>
                                {fmt(cfg.goldCost)} 💰
                              </Text>
                              <Text style={[styles.expeditionStartCardStatus, !canStartNow && styles.expeditionStartCardStatusDisabled]}>
                                {hasGold ? 'Available' : 'Need Gold'}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </>
                  );
                })()}
              </View>
            </View>
          )}
        </View>
      )}
    </>
  );
};
