import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { GameState, Stats, EXPEDITION_CONTRACT_REFRESH_MS, EXPEDITION_CONTRACT_REFRESH_GOLD_COST } from '../../useGameState';
import { EXPEDITION_TYPES, EXPEDITION_TYPE_META, EXPEDITION_RARITY_META, formatDurationShort, ExpeditionType, ExpeditionRarity } from '../GameScreen';
import { fmt } from '../../utils';
import { styles } from '../GameScreen';

export interface OperationsTabContentProps {
  tab: string;
  state: GameState;
  stats: Stats;
  operationsSubTab: string;
  setOperationsSubTab: (tab: string) => void;
  canPlayDiceToday: boolean;
  canRunRiftToday: boolean;
  setDiceRollResult: (result: any) => void;
  setDiceIsRolling: (rolling: boolean) => void;
  setDiceRollModalOpen: (open: boolean) => void;
  openRiftChallenge: () => void;
  upgradeFacility: (facility: string) => void;
  startExpedition: (type: string, rarity: string) => void;
  completeExpedition: (expeditionId: string) => void;
  refreshExpeditionContracts: () => void;
  renderSubTabBar: (tabs: any[]) => React.ReactNode;
}

export const OperationsTabContent: React.FC<OperationsTabContentProps> = ({
  tab,
  state,
  stats,
  operationsSubTab,
  setOperationsSubTab,
  canPlayDiceToday,
  canRunRiftToday,
  setDiceRollResult,
  setDiceIsRolling,
  setDiceRollModalOpen,
  openRiftChallenge,
  upgradeFacility,
  startExpedition,
  completeExpedition,
  refreshExpeditionContracts,
  renderSubTabBar,
}) => {
  const operationsFacilities = state.guildhallFacilities;
  const expeditionClaimableCount = state.expeditionQueue.filter(exp => (Date.now() - exp.startTime) >= exp.durationMs).length;
  const expeditionActiveTypes = new Set(state.expeditionQueue.map(exp => exp.type as ExpeditionType));
  const expeditionLaunchableAffordableCount = EXPEDITION_TYPES.filter(type => {
    if (expeditionActiveTypes.has(type)) return false;
    const rarity = state.expeditionContractOffers[type] ?? 'common';
    const cost = EXPEDITION_RARITY_META[rarity as ExpeditionRarity]?.goldCost ?? Number.MAX_SAFE_INTEGER;
    return state.gold >= cost;
  }).length;
  const facilityUpgradeCosts: Record<'training' | 'treasury' | 'forge' | 'tactics', number[]> = {
    training: [5000, 12000, 30000, 75000, 150000, 300000],
    treasury: [4000, 10000, 25000, 60000, 120000, 250000],
    forge: [6000, 15000, 40000, 90000, 180000, 350000],
    tactics: [5000, 12000, 30000, 75000, 150000, 300000],
  };
  const facilitiesUpgradeableCount = (['training', 'treasury', 'forge', 'tactics'] as const).filter(facility => {
    const level = operationsFacilities[facility].level;
    if (level >= 5) return false;
    const nextCost = facilityUpgradeCosts[facility][level] ?? Number.MAX_SAFE_INTEGER;
    return state.gold >= nextCost;
  }).length;

  return (
    <>
      {tab === 'operations' && (
        <View style={styles.operationsTab}>
          <Text style={styles.sectionTitle}>⚙️ Operations Command</Text>
          {renderSubTabBar((['miniops', 'dungeonops', 'facilities', 'expeditions'] as const).map(st => ({
            id: st,
            label: st === 'miniops' ? 'Mini Ops' : st === 'dungeonops' ? 'Dungeon Ops' : st === 'facilities' ? 'Facilities' : 'Expeditions',
            active: operationsSubTab === st,
            onPress: () => setOperationsSubTab(st),
            notificationCount:
              st === 'miniops'
                ? (canPlayDiceToday ? 1 : 0)
                : st === 'dungeonops'
                  ? (canRunRiftToday ? 1 : 0)
                  : st === 'facilities'
                    ? facilitiesUpgradeableCount
                    : expeditionClaimableCount + expeditionLaunchableAffordableCount,
          })))}

          {/* MINI OPS TAB */}
          {operationsSubTab === 'miniops' && (
            <View style={styles.facilitiesSection}>
              <Text style={styles.facilitiesTitle}>🎲 Mini Ops</Text>
              <Text style={styles.facilitiesDesc}>Daily tactical actions and quick reward bursts.</Text>
              <View style={styles.facilityCard}>
                <Text style={styles.facilityName}>Dice Protocol</Text>
                <Text style={styles.facilityBonusText}>Status: {canPlayDiceToday ? 'Ready' : 'Claimed today'}</Text>
                {state.lastDiceRollValue != null && (
                  <Text style={styles.facilityNextBonus}>Last roll: {state.lastDiceRollValue}/20</Text>
                )}
                <Pressable
                  style={[styles.warPanelActionBtn, !canPlayDiceToday && styles.warPanelActionBtnDisabled]}
                  disabled={!canPlayDiceToday}
                  onPress={() => {
                    setDiceRollResult(null);
                    setDiceIsRolling(false);
                    setDiceRollModalOpen(true);
                  }}
                >
                  <Text style={styles.warPanelActionText}>Roll Dice (+Diamonds)</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* DUNGEON OPS TAB */}
          {operationsSubTab === 'dungeonops' && (
            <View style={styles.expeditionsSection}>
              <Text style={styles.expeditionsTitle}>🕳️ Dungeon Ops</Text>
              <Text style={styles.expeditionsDesc}>Dedicated dungeon lane for focused resource runs.</Text>
              <View style={styles.facilityCard}>
                <Text style={styles.facilityName}>Rift (legacy mode)</Text>
                <Text style={styles.facilityBonusText}>Status: {canRunRiftToday ? 'Ready' : 'Cleared today'}</Text>
                {state.lastRiftWavesCleared > 0 && (
                  <Text style={styles.facilityNextBonus}>Last clear: {state.lastRiftWavesCleared}/5 waves</Text>
                )}
                <Pressable
                  style={[styles.warPanelActionBtn, !canRunRiftToday && styles.warPanelActionBtnDisabled]}
                  disabled={!canRunRiftToday}
                  onPress={openRiftChallenge}
                >
                  <Text style={styles.warPanelActionText}>Run Rift</Text>
                </Pressable>
              </View>
              <View style={styles.facilityCard}>
                <Text style={styles.facilityName}>Future Dungeon Lanes</Text>
                <Text style={styles.facilityNextBonus}>Planned tracks: Gold Ops, EXP Ops, Diamond Ops, Tear Ops, and more.</Text>
                <Text style={styles.facilityNextBonus}>This sub-tab is now the home for all dungeon systems.</Text>
              </View>
            </View>
          )}

          {/* FACILITIES TAB */}
          {operationsSubTab === 'facilities' && (
            <View style={styles.facilitiesSection}>
              <Text style={styles.facilitiesTitle}>🏰 Guild Facilities</Text>
              <Text style={styles.facilitiesDesc}>Invest gold in permanent facilities to gain passive bonuses</Text>

              {(['training', 'treasury', 'forge', 'tactics'] as const).map(facility => {
                const level = operationsFacilities[facility].level;
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
          {operationsSubTab === 'expeditions' && (
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
