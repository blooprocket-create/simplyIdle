import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { FacilityId, GameState, Stats, EXPEDITION_CONTRACT_REFRESH_MS, EXPEDITION_CONTRACT_REFRESH_GOLD_COST, FACILITY_MAX_LEVEL, MINI_OPS_COOLDOWN_MS, getFacilityUpgradeCost } from '../../useGameState';
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
  canPlayReconToday: boolean;
  canPlayLockpickToday: boolean;
  canPlayTargetToday: boolean;
  canStartBountyToday: boolean;
  canClaimMiniBounty: boolean;
  activeMiniBountyProgress: number;
  riftDungeonLevel: number;
  riftEntriesUsed: number;
  riftEntriesRemaining: number;
  riftEntryCap: number;
  riftRaidTickets: number;
  lastRiftBossDamagePct: number;
  canRunRiftEntry: boolean;
  canRaidRift: boolean;
  treasureDungeonLevel: number;
  treasureEntriesUsed: number;
  treasureEntriesRemaining: number;
  treasuryEntryCap: number;
  lastTreasureHaulPct: number;
  lastTreasureWiped: boolean;
  canRunTreasuryEntry: boolean;
  canRaidTreasury: boolean;
  openTreasuryRaid: (useRaidTicket?: boolean) => void;
  setDiceRollResult: (result: any) => void;
  setDiceIsRolling: (rolling: boolean) => void;
  setDiceRollModalOpen: (open: boolean) => void;
  openReconSweepGame: () => void;
  openLockpickCacheGame: () => void;
  openTargetPracticeGame: () => void;
  startMiniBountyDraft: (draftType: 'assault' | 'push' | 'recruit') => void;
  claimMiniBountyDraft: () => void;
  openRiftChallenge: (useRaidTicket?: boolean) => void;
  upgradeFacility: (facility: string) => void;
  startExpedition: (type: string, rarity: string) => void;
  completeExpedition: (expeditionId: string) => void;
  refreshExpeditionContracts: () => void;
  renderSubTabBar: (tabs: any[]) => React.ReactNode;
}

export const OperationsTabContent = React.memo<OperationsTabContentProps>(({
  tab,
  state,
  stats: _stats,
  operationsSubTab,
  setOperationsSubTab,
  canPlayDiceToday,
  canPlayReconToday,
  canPlayLockpickToday,
  canPlayTargetToday,
  canStartBountyToday,
  canClaimMiniBounty,
  activeMiniBountyProgress,
  riftDungeonLevel,
  riftEntriesUsed,
  riftEntriesRemaining,
  riftEntryCap,
  riftRaidTickets,
  lastRiftBossDamagePct,
  canRunRiftEntry,
  canRaidRift,
  treasureDungeonLevel,
  treasureEntriesUsed,
  treasureEntriesRemaining,
  treasuryEntryCap,
  lastTreasureHaulPct,
  lastTreasureWiped,
  canRunTreasuryEntry,
  canRaidTreasury,
  openTreasuryRaid,
  setDiceRollResult,
  setDiceIsRolling,
  setDiceRollModalOpen,
  openReconSweepGame,
  openLockpickCacheGame,
  openTargetPracticeGame,
  startMiniBountyDraft,
  claimMiniBountyDraft,
  openRiftChallenge,
  upgradeFacility,
  startExpedition,
  completeExpedition,
  refreshExpeditionContracts,
  renderSubTabBar,
}) => {
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  // Some older cloud saves may not include newer operations fields yet.
  // Keep this tab resilient by falling back to safe defaults instead of crashing.
  const safeExpeditionQueue = Array.isArray(state.expeditionQueue) ? state.expeditionQueue : [];
  const safeExpeditionContractOffers = state.expeditionContractOffers ?? {};
  const operationsFacilities = state.guildhallFacilities ?? {
    training: { level: 0 },
    treasury: { level: 0 },
    forge: { level: 0 },
    tactics: { level: 0 },
  };

  const miniOpRemainingMs = (lastUsedMs: number | null) => {
    if (lastUsedMs == null) return 0;
    return Math.max(0, MINI_OPS_COOLDOWN_MS - (nowMs - lastUsedMs));
  };
  const diceRemainingMs = miniOpRemainingMs(state.lastDiceRollDay);
  const reconRemainingMs = miniOpRemainingMs(state.lastReconSweepDay);
  const lockpickRemainingMs = miniOpRemainingMs(state.lastLockpickDay);
  const targetRemainingMs = miniOpRemainingMs(state.lastTargetPracticeDay);
  const bountyRemainingMs = miniOpRemainingMs(state.lastBountyDraftDay);

  const expeditionClaimableCount = safeExpeditionQueue.filter(exp => (nowMs - exp.startTime) >= exp.durationMs).length;
  const expeditionActiveTypes = new Set(safeExpeditionQueue.map(exp => exp.type as ExpeditionType));
  const expeditionLaunchableAffordableCount = EXPEDITION_TYPES.filter(type => {
    if (expeditionActiveTypes.has(type)) return false;
    const rarity = safeExpeditionContractOffers[type] ?? 'common';
    const cost = EXPEDITION_RARITY_META[rarity as ExpeditionRarity]?.goldCost ?? Number.MAX_SAFE_INTEGER;
    return state.gold >= cost;
  }).length;
  const facilityStepPct: Record<FacilityId, number> = {
    training: 5,
    treasury: 2,
    forge: 3,
    tactics: 1,
  };
  const facilityCurrentLabel = (facility: FacilityId, level: number) => {
    const pct = facilityStepPct[facility] * level;
    if (facility === 'training') return `+${pct}% XP gain`;
    if (facility === 'treasury') return `+${pct}% gold gain`;
    if (facility === 'forge') return `+${pct}% gear stats`;
    return `+${pct}% team power`;
  };
  const facilitiesUpgradeableCount = (['training', 'treasury', 'forge', 'tactics'] as const).filter(facility => {
    const level = operationsFacilities[facility].level;
    if (level >= FACILITY_MAX_LEVEL) return false;
    const nextCost = getFacilityUpgradeCost(facility, level);
    return state.gold >= nextCost;
  }).length;
  const dungeonLanes = [
    {
      id: 'rift',
      title: 'Rift Breach',
      icon: '🕳️',
      rewardFocus: '2-minute boss run: diamonds + shard burst',
      unlockText: 'Always available',
      unlocked: true,
      actionable: canRunRiftEntry || canRaidRift,
      status: canRunRiftEntry ? `Entry ready (${riftEntriesRemaining}/${riftEntryCap} left)` : 'No free entries left',
      onPress: () => openRiftChallenge(false),
      ctaText: 'Run Rift',
    },
    {
      id: 'gold',
      title: 'Treasury Raid',
      icon: '💰',
      rewardFocus: '90s wave gauntlet: gold + equipment scrap',
      unlockText: 'Unlock at highest wave 80',
      unlocked: state.highestWaveReached >= 80,
      actionable: state.highestWaveReached >= 80 && (canRunTreasuryEntry || canRaidTreasury),
      status: !state.highestWaveReached || state.highestWaveReached < 80
        ? `Locked (${state.highestWaveReached}/80)`
        : canRunTreasuryEntry
          ? `Entry ready (${treasureEntriesRemaining}/${treasuryEntryCap} left)`
          : 'No free entries left',
      onPress: () => openTreasuryRaid(false),
      ctaText: 'Run Raid',
    },
    {
      id: 'exp',
      title: 'Archive Siege',
      icon: '📘',
      rewardFocus: 'EXP-focused dungeon lane',
      unlockText: 'Unlock at highest wave 120',
      unlocked: state.highestWaveReached >= 120,
      actionable: false,
      status: state.highestWaveReached >= 120 ? 'Coming soon' : `Locked (${state.highestWaveReached}/120)`,
      onPress: undefined,
      ctaText: 'Coming Soon',
    },
    {
      id: 'diamond',
      title: 'Crystal Vault',
      icon: '💎',
      rewardFocus: 'Diamond-focused dungeon lane',
      unlockText: 'Unlock at highest wave 180',
      unlocked: state.highestWaveReached >= 180,
      actionable: false,
      status: state.highestWaveReached >= 180 ? 'Coming soon' : `Locked (${state.highestWaveReached}/180)`,
      onPress: undefined,
      ctaText: 'Coming Soon',
    },
    {
      id: 'tears',
      title: 'Abyss Condenser',
      icon: '💧',
      rewardFocus: 'Boss Tear-focused dungeon lane',
      unlockText: 'Unlock at highest wave 240',
      unlocked: state.highestWaveReached >= 240,
      actionable: false,
      status: state.highestWaveReached >= 240 ? 'Coming soon' : `Locked (${state.highestWaveReached}/240)`,
      onPress: undefined,
      ctaText: 'Coming Soon',
    },
  ] as const;
  const dungeonOpsReadyCount = dungeonLanes.filter(lane => lane.unlocked && lane.actionable).length;

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
                ? ((canPlayDiceToday ? 1 : 0)
                  + (canPlayReconToday ? 1 : 0)
                  + (canPlayLockpickToday ? 1 : 0)
                  + (canPlayTargetToday ? 1 : 0)
                  + ((canStartBountyToday || canClaimMiniBounty) ? 1 : 0))
                : st === 'dungeonops'
                  ? dungeonOpsReadyCount
                  : st === 'facilities'
                    ? facilitiesUpgradeableCount
                    : expeditionClaimableCount + expeditionLaunchableAffordableCount,
          })))}

          {/* MINI OPS TAB */}
          {operationsSubTab === 'miniops' && (
            <View style={styles.facilitiesSection}>
              <Text style={styles.facilitiesTitle}>🎲 Mini Ops</Text>
              <Text style={styles.facilitiesDesc}>Tactical actions on a 4-hour cooldown from when each one is used.</Text>
              <View style={styles.facilityCard}>
                <Text style={styles.facilityName}>Dice Protocol</Text>
                <Text style={styles.facilityBonusText}>Status: {canPlayDiceToday ? 'Ready' : `${formatDurationShort(diceRemainingMs)} remaining`}</Text>
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

              <View style={styles.facilityCard}>
                <Text style={styles.facilityName}>🛰️ Recon Sweep</Text>
                <Text style={styles.facilityBonusText}>Reveal 1 of 3 intel outcomes (gold, shards, or combat telemetry).</Text>
                <Text style={styles.facilityBonusText}>Status: {canPlayReconToday ? 'Ready' : `${formatDurationShort(reconRemainingMs)} remaining`}</Text>
                <Pressable
                  style={[styles.warPanelActionBtn, !canPlayReconToday && styles.warPanelActionBtnDisabled]}
                  disabled={!canPlayReconToday}
                  onPress={openReconSweepGame}
                >
                  <Text style={styles.warPanelActionText}>Play Recon Sweep</Text>
                </Pressable>
              </View>

              <View style={styles.facilityCard}>
                <Text style={styles.facilityName}>🔐 Lockpick Cache</Text>
                <Text style={styles.facilityBonusText}>Crack a cache for diamonds, or salvage partial gold on a jam.</Text>
                <Text style={styles.facilityBonusText}>Status: {canPlayLockpickToday ? 'Ready' : `${formatDurationShort(lockpickRemainingMs)} remaining`}</Text>
                <Pressable
                  style={[styles.warPanelActionBtn, !canPlayLockpickToday && styles.warPanelActionBtnDisabled]}
                  disabled={!canPlayLockpickToday}
                  onPress={openLockpickCacheGame}
                >
                  <Text style={styles.warPanelActionText}>Play Lockpick</Text>
                </Pressable>
              </View>

              <View style={styles.facilityCard}>
                <Text style={styles.facilityName}>🎯 Target Practice</Text>
                <Text style={styles.facilityBonusText}>Score tier sets shard and diamond payout.</Text>
                <Text style={styles.facilityBonusText}>Status: {canPlayTargetToday ? 'Ready' : `${formatDurationShort(targetRemainingMs)} remaining`}</Text>
                <Pressable
                  style={[styles.warPanelActionBtn, !canPlayTargetToday && styles.warPanelActionBtnDisabled]}
                  disabled={!canPlayTargetToday}
                  onPress={openTargetPracticeGame}
                >
                  <Text style={styles.warPanelActionText}>Play Target Practice</Text>
                </Pressable>
              </View>

              <View style={styles.facilityCard}>
                <Text style={styles.facilityName}>📜 Bounty Draft</Text>
                <Text style={styles.facilityBonusText}>Pick one contract for this cycle and claim when objective is done.</Text>
                  {state.miniBounty ? (
                  <>
                    <Text style={styles.facilityBonusText}>Active: {state.miniBounty.title}</Text>
                    <Text style={styles.facilityNextBonus}>Progress: {Math.min(activeMiniBountyProgress, state.miniBounty.targetValue)}/{state.miniBounty.targetValue}</Text>
                    <Text style={styles.facilityNextBonus}>Reward: +{fmt(state.miniBounty.rewardGold)} gold, +{fmt(state.miniBounty.rewardShards)} shards, +{state.miniBounty.rewardDiamonds} diamonds</Text>
                    <Pressable
                      style={[styles.warPanelActionBtn, !canClaimMiniBounty && styles.warPanelActionBtnDisabled]}
                      disabled={!canClaimMiniBounty}
                      onPress={claimMiniBountyDraft}
                    >
                      <Text style={styles.warPanelActionText}>{canClaimMiniBounty ? 'Claim Bounty' : 'In Progress'}</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    {!canStartBountyToday && <Text style={styles.facilityNextBonus}>Next draft in: {formatDurationShort(bountyRemainingMs)}</Text>}
                    <View style={styles.warPanelActionRow}>
                      <Pressable
                        style={[styles.warPanelActionBtn, !canStartBountyToday && styles.warPanelActionBtnDisabled]}
                        disabled={!canStartBountyToday}
                        onPress={() => startMiniBountyDraft('assault')}
                      >
                        <Text style={styles.warPanelActionText}>Assault</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.warPanelActionBtn, !canStartBountyToday && styles.warPanelActionBtnDisabled]}
                        disabled={!canStartBountyToday}
                        onPress={() => startMiniBountyDraft('push')}
                      >
                        <Text style={styles.warPanelActionText}>Push</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.warPanelActionBtn, !canStartBountyToday && styles.warPanelActionBtnDisabled]}
                        disabled={!canStartBountyToday}
                        onPress={() => startMiniBountyDraft('recruit')}
                      >
                        <Text style={styles.warPanelActionText}>Recruit</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            </View>
          )}

          {/* DUNGEON OPS TAB */}
          {operationsSubTab === 'dungeonops' && (
            <View style={styles.expeditionsSection}>
              <Text style={styles.expeditionsTitle}>🕳️ Dungeon Ops</Text>
              <Text style={styles.expeditionsDesc}>Dedicated dungeon lane for focused resource runs.</Text>
              {dungeonLanes.map(lane => (
                <View key={lane.id} style={styles.facilityCard}>
                  <View style={{ position: 'relative', alignSelf: 'flex-start', paddingRight: 12 }}>
                    <Text style={styles.facilityName}>{lane.icon} {lane.title}</Text>
                    {lane.unlocked && lane.actionable && <View style={[styles.redDot, { top: 2, right: 0 }]} />}
                  </View>
                  <Text style={styles.facilityBonusText}>{lane.rewardFocus}</Text>
                  <Text style={styles.facilityNextBonus}>{lane.unlockText}</Text>
                  <Text style={styles.facilityBonusText}>Status: {lane.status}</Text>
                  {lane.id === 'rift' && (
                    <>
                      <Text style={styles.facilityNextBonus}>Dungeon Level: {riftDungeonLevel} (Boss Lv {riftDungeonLevel * 10})</Text>
                      <Text style={styles.facilityNextBonus}>Free entries used today: {riftEntriesUsed}/{riftEntryCap}</Text>
                      <Text style={styles.facilityNextBonus}>Raid Tickets: {riftRaidTickets}</Text>
                      <Text style={styles.facilityNextBonus}>Last run damage: {Math.round(lastRiftBossDamagePct * 100)}%</Text>
                    </>
                  )}
                  {lane.id === 'gold' && state.highestWaveReached >= 80 && (
                    <>
                      <Text style={styles.facilityNextBonus}>Vault Level: {treasureDungeonLevel} ({treasureDungeonLevel * 2 + 3} waves)</Text>
                      <Text style={styles.facilityNextBonus}>Free entries used today: {treasureEntriesUsed}/{treasuryEntryCap}</Text>
                      <Text style={styles.facilityNextBonus}>Raid Tickets: {riftRaidTickets}</Text>
                      <Text style={styles.facilityNextBonus}>Last haul: {Math.round(lastTreasureHaulPct * 100)}%{lastTreasureWiped ? ' (wiped)' : ''}</Text>
                    </>
                  )}
                  {lane.id === 'rift' || lane.id === 'gold' ? (
                    <View style={styles.warPanelActionRow}>
                      <Pressable
                        style={[styles.warPanelActionBtn, !(lane.id === 'gold' ? canRunTreasuryEntry : canRunRiftEntry) && styles.warPanelActionBtnDisabled]}
                        disabled={!(lane.id === 'gold' ? canRunTreasuryEntry : canRunRiftEntry)}
                        onPress={() => lane.id === 'gold' ? openTreasuryRaid(false) : openRiftChallenge(false)}
                      >
                        <Text style={styles.warPanelActionText}>Run Entry</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.warPanelActionBtn, !(lane.id === 'gold' ? canRaidTreasury : canRaidRift) && styles.warPanelActionBtnDisabled]}
                        disabled={!(lane.id === 'gold' ? canRaidTreasury : canRaidRift)}
                        onPress={() => lane.id === 'gold' ? openTreasuryRaid(true) : openRiftChallenge(true)}
                      >
                        <Text style={styles.warPanelActionText}>Raid Prior Lvl</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      style={[
                        styles.warPanelActionBtn,
                        !lane.actionable && styles.warPanelActionBtnDisabled,
                      ]}
                      disabled={!lane.actionable}
                      onPress={lane.onPress}
                    >
                      <Text style={styles.warPanelActionText}>{lane.ctaText}</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* FACILITIES TAB */}
          {operationsSubTab === 'facilities' && (
            <View style={styles.facilitiesSection}>
              <Text style={styles.facilitiesTitle}>🏰 Guild Facilities</Text>
              <Text style={styles.facilitiesDesc}>Invest gold in permanent facilities to gain passive bonuses</Text>

              {(['training', 'treasury', 'forge', 'tactics'] as const).map(facility => {
                const level = operationsFacilities[facility].level;
                const nextCost = getFacilityUpgradeCost(facility, level);
                const canUpgrade = level < FACILITY_MAX_LEVEL && state.gold >= nextCost;

                const icons = { training: '📚', treasury: '💰', forge: '⚒️', tactics: '🎯' };

                return (
                  <View key={facility} style={styles.facilityCard}>
                    <View style={styles.facilityHeader}>
                      <Text style={styles.facilityName}>{icons[facility]} {facility === 'training' ? 'Training Hall' : facility === 'treasury' ? 'Treasury' : facility === 'forge' ? 'Equipment Forge' : 'Tactics Room'}</Text>
                      <Text style={styles.facilityLevel}>Level {level}/{FACILITY_MAX_LEVEL}</Text>
                    </View>

                    <View style={styles.facilityBonusBar}>
                      {Array.from({ length: 10 }).map((_, i) => (
                        <View
                          key={i}
                          style={[
                            styles.facilityBonusSegment,
                            i < Math.round((level / FACILITY_MAX_LEVEL) * 10) && styles.facilityBonusSegmentActive,
                          ]}
                        />
                      ))}
                    </View>

                    {level > 0 && (
                      <Text style={styles.facilityBonusText}>Current: {facilityCurrentLabel(facility, level)}</Text>
                    )}
                    {level < FACILITY_MAX_LEVEL && (
                      <Text style={styles.facilityNextBonus}>Next: {facilityCurrentLabel(facility, level + 1)}</Text>
                    )}

                    {level < FACILITY_MAX_LEVEL ? (
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

              {safeExpeditionQueue.length > 0 && (
                <View style={styles.expeditionQueueSection}>
                  <Text style={styles.expeditionQueueTitle}>Active Expeditions</Text>
                  {safeExpeditionQueue.map(exp => {
                    const elapsed = nowMs - exp.startTime;
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
                  const activeExpeditionTypes = new Set(safeExpeditionQueue.map(exp => exp.type as string));
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
                        const rarity = safeExpeditionContractOffers[type] ?? 'common';
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
});
