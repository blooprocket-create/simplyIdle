import React from 'react';
import { Alert, Platform, View, Text } from 'react-native';
import { GameState, Stats, getUsableItemDescription, type HeroActiveStatus } from '../../useGameState';
import { PlayerClass, rarityConfig, type UsableItem } from '../../gameConfig';
import { styles } from './BattleTabContent.styles';
import { FeedbackPressable as Pressable } from '../../components/FeedbackPressable';

interface BattleClassConfig {
  emoji: string;
  name: string;
}

type BattleUsableItem = UsableItem;

interface BattleUsableInventoryEntry {
  item: BattleUsableItem | undefined;
  count: number;
}

export interface BattleTabContentProps {
  tab: string;
  state: GameState;
  stats: Stats;
  battleSpeed: number;
  heatPct: number;
  maxHeat: number;
  canBurst: boolean;
  burstCost: number;
  burstChargePct: number;
  teamSlotCap: number;
  canRebirthNow: boolean;
  rebirthWaveRequirement: number;
  getClassConfig: (heroClass: PlayerClass) => BattleClassConfig;
  usableInventory: BattleUsableInventoryEntry[];
  setCombatTempo: (tempo: 1 | 2 | 4) => void;
  burst: (hits: number) => void;
  buyPremiumCoolant: (itemId: 'coolant_mk1' | 'coolant_mk2', amount?: number) => void;
  applyUsableItem: (itemId: string, amount?: number | 'all') => void;
  setRebirthOpen: (open: boolean) => void;
  heroActiveStatuses: HeroActiveStatus[];
  castHeroActiveSkill: (uid: string) => void;
  setAutoCastHeroActivesEnabled: (enabled: boolean) => void;
}

export const BattleTabContent = React.memo<BattleTabContentProps>(
  ({
    tab,
    state,
    stats,
    battleSpeed,
    heatPct,
    maxHeat,
    canBurst,
    burstCost,
    burstChargePct,
    teamSlotCap,
    canRebirthNow,
    rebirthWaveRequirement,
    getClassConfig,
    usableInventory,
    setCombatTempo,
    burst,
    buyPremiumCoolant,
    applyUsableItem,
    setRebirthOpen,
    heroActiveStatuses,
    castHeroActiveSkill,
    setAutoCastHeroActivesEnabled,
  }) => {
    const hasTempo4Access = (state.vipLevel ?? 0) >= 1;
    const autoCastEnabled = state.autoCastHeroActivesEnabled;

    const confirmUseAll = (item: BattleUsableItem, count: number) => {
      if (count <= 0) return;

      const needsWarning = item.effect === 'heal_team_percent' || item.effect === 'reduce_heat_flat';
      if (!needsWarning) {
        applyUsableItem(item.id, 'all');
        return;
      }

      const warningText =
        item.effect === 'heal_team_percent'
          ? `Use all ${count} ${item.name} now? This can over-heal and waste value.`
          : `Use all ${count} ${item.name} now? This can over-cool and waste premium resources.`;

      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.confirm(warningText)) {
          applyUsableItem(item.id, 'all');
        }
        return;
      }

      Alert.alert('Confirm Use All', warningText, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Use All', style: 'destructive', onPress: () => applyUsableItem(item.id, 'all') },
      ]);
    };

    return (
      <>
        {tab === 'battle' && (
          <View style={styles.battleTab}>
            {canRebirthNow && (
              <Pressable style={styles.rebirthBanner} onPress={() => setRebirthOpen(true)}>
                <Text style={styles.rebirthBannerIcon}>♾️</Text>
                <View style={styles.rebirthBannerTextWrap}>
                  <Text style={styles.rebirthBannerTitle}>Rebirth Ready</Text>
                  <Text style={styles.rebirthBannerSub}>
                    Wave {rebirthWaveRequirement} reached — ascend for permanent power
                  </Text>
                </View>
                <Text style={styles.rebirthBannerCta}>Rebirth Now →</Text>
              </Pressable>
            )}
            <Text style={styles.sectionTitle}>⚔️ Battle Overview</Text>

            <View style={styles.abilityBarCard}>
              <View style={styles.abilityBarHeader}>
                <Text style={styles.abilityBarTitle}>Hero Abilities</Text>
                <Pressable
                  style={[styles.abilityBarAutoBtn, autoCastEnabled && styles.abilityBarAutoBtnActive]}
                  onPress={() => setAutoCastHeroActivesEnabled(!autoCastEnabled)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: autoCastEnabled }}
                  accessibilityLabel="Auto-cast hero abilities"
                >
                  <Text style={[styles.abilityBarAutoBtnText, autoCastEnabled && styles.abilityBarAutoBtnTextActive]}>
                    AUTO {autoCastEnabled ? 'ON' : 'OFF'}
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.abilityBarHint}>
                {autoCastEnabled
                  ? 'Abilities fire themselves the moment they come off cooldown.'
                  : 'Abilities are yours to spend — tap one the moment it lights up.'}
              </Text>
              {heroActiveStatuses.length === 0 ? (
                <Text style={styles.abilityBarEmpty}>No heroes on the active team yet.</Text>
              ) : (
                <View style={styles.abilityRow}>
                  {heroActiveStatuses.map(status => {
                    const remainingPct =
                      status.totalCooldownMs > 0
                        ? Math.max(0, Math.min(1, status.cooldownMs / status.totalCooldownMs))
                        : 0;
                    const castable = status.ready && !autoCastEnabled;

                    return (
                      <Pressable
                        key={status.uid}
                        style={[
                          styles.abilityBtn,
                          status.ready && styles.abilityBtnReady,
                          autoCastEnabled && styles.abilityBtnAuto,
                        ]}
                        disabled={!castable}
                        onPress={() => castHeroActiveSkill(status.uid)}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !castable }}
                        accessibilityLabel={`${status.heroName}: ${status.skillName}${
                          status.ready ? ', ready' : `, ${(status.cooldownMs / 1000).toFixed(1)} seconds remaining`
                        }`}
                      >
                        {remainingPct > 0 && (
                          <View style={[styles.abilityCooldownFill, { width: `${remainingPct * 100}%` }]} />
                        )}
                        <Text style={styles.abilityBtnHero} numberOfLines={1}>
                          {status.emoji} {status.heroName}
                        </Text>
                        <Text style={styles.abilityBtnSkill} numberOfLines={1}>
                          {status.skillName}
                        </Text>
                        <Text style={[styles.abilityBtnState, !status.ready && styles.abilityBtnStateCooling]}>
                          {status.ready
                            ? autoCastEnabled
                              ? 'AUTO'
                              : 'READY'
                            : `${(status.cooldownMs / 1000).toFixed(1)}s`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.battleTempoCard}>
              <View style={styles.battleTempoHeader}>
                <Text style={styles.battleTempoTitle}>Combat Tempo</Text>
                <View style={styles.battleTempoRow}>
                  {([1, 2, 4] as const).map(mult => {
                    const locked = mult === 4 && !hasTempo4Access;
                    return (
                      <Pressable
                        key={mult}
                        style={[
                          styles.battleTempoBtn,
                          battleSpeed === mult && styles.battleTempoBtnActive,
                          locked && styles.battleTempoBtnLocked,
                        ]}
                        onPress={() => setCombatTempo(mult)}
                        disabled={locked}
                        accessibilityRole="button"
                        accessibilityLabel={
                          locked
                            ? `${mult}x speed, requires VIP 1`
                            : `Set combat speed to ${mult}x${battleSpeed === mult ? ', currently active' : ''}`
                        }
                      >
                        <Text
                          style={[styles.battleTempoBtnText, battleSpeed === mult && styles.battleTempoBtnTextActive]}
                        >
                          {mult === 4 && locked ? '4x VIP1' : `${mult}x`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <Text style={styles.battleTempoHint}>Higher tempo speeds up passive combat and burst payout.</Text>
              {!hasTempo4Access && <Text style={styles.battleTempoHint}>4x unlocks at VIP 1.</Text>}
              <Text style={styles.battleTempoHint}>
                Heat: {Math.ceil(state.combatHeat)}/{Math.ceil(maxHeat)}{' '}
                {state.combatTempo > 1 ? '(building)' : '(recovering)'}
              </Text>
              <View style={styles.hpBarBg}>
                <View
                  style={[
                    styles.hpBarFill,
                    {
                      width: `${heatPct}%`,
                      backgroundColor: heatPct >= 85 ? '#FF5B5B' : heatPct >= 55 ? '#FFB347' : '#64D39D',
                    },
                  ]}
                />
              </View>
              <View style={styles.heatStoreRow}>
                <Pressable
                  style={[styles.heatStoreBtn, state.diamonds < 8 && styles.heatStoreBtnDisabled]}
                  disabled={state.diamonds < 8}
                  onPress={() => buyPremiumCoolant('coolant_mk1')}
                >
                  <Text style={styles.heatStoreBtnText}>Buy 🧊 x1 (8💎)</Text>
                </Pressable>
                <Pressable
                  style={[styles.heatStoreBtn, state.diamonds < 18 && styles.heatStoreBtnDisabled]}
                  disabled={state.diamonds < 18}
                  onPress={() => buyPremiumCoolant('coolant_mk2')}
                >
                  <Text style={styles.heatStoreBtnText}>Buy ❄️ x1 (18💎)</Text>
                </Pressable>
              </View>
              <View style={styles.heatStoreRow}>
                <Pressable
                  style={[styles.heatUseBtn, state.diamonds < 40 && styles.heatStoreBtnDisabled]}
                  disabled={state.diamonds < 40}
                  onPress={() => buyPremiumCoolant('coolant_mk1', 5)}
                >
                  <Text style={styles.heatStoreBtnText}>Buy 🧊 x5 (40💎)</Text>
                </Pressable>
                <Pressable
                  style={[styles.heatUseBtn, state.diamonds < 90 && styles.heatStoreBtnDisabled]}
                  disabled={state.diamonds < 90}
                  onPress={() => buyPremiumCoolant('coolant_mk2', 5)}
                >
                  <Text style={styles.heatStoreBtnText}>Buy ❄️ x5 (90💎)</Text>
                </Pressable>
              </View>
              <View style={styles.heatStoreRow}>
                <Pressable
                  style={[
                    styles.heatUseBtn,
                    (state.usableItemCounts['coolant_mk1'] ?? 0) <= 0 && styles.heatStoreBtnDisabled,
                  ]}
                  disabled={(state.usableItemCounts['coolant_mk1'] ?? 0) <= 0}
                  onPress={() => applyUsableItem('coolant_mk1')}
                >
                  <Text style={styles.heatStoreBtnText}>Use 🧊 ({state.usableItemCounts['coolant_mk1'] ?? 0})</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.heatUseBtn,
                    (state.usableItemCounts['coolant_mk2'] ?? 0) <= 0 && styles.heatStoreBtnDisabled,
                  ]}
                  disabled={(state.usableItemCounts['coolant_mk2'] ?? 0) <= 0}
                  onPress={() => applyUsableItem('coolant_mk2')}
                >
                  <Text style={styles.heatStoreBtnText}>Use ❄️ ({state.usableItemCounts['coolant_mk2'] ?? 0})</Text>
                </Pressable>
              </View>
              <View style={styles.burstRow}>
                <View style={styles.burstInfo}>
                  <Text style={styles.burstTitle}>Burst Gauge</Text>
                  <Text style={styles.burstSub}>
                    Charge from kills ({state.burstCharge}/{burstCost}) • bosses grant +3 • spend for amplified strikes
                  </Text>
                </View>
                <Pressable
                  style={[styles.burstBtn, !canBurst && styles.burstBtnDisabled]}
                  disabled={!canBurst}
                  onPress={() => {
                    const hits = 4 * battleSpeed;
                    burst(hits);
                  }}
                >
                  <Text style={styles.burstBtnText}>{canBurst ? `Burst x${4 * battleSpeed}` : 'Charging'}</Text>
                </Pressable>
              </View>
              <View style={styles.hpBarBg}>
                <View style={[styles.hpBarFill, { width: `${burstChargePct}%`, backgroundColor: '#FFB347' }]} />
              </View>
              <Text style={styles.burstHint}>
                {canBurst
                  ? 'Burst ready: cash in now for a wave skip push.'
                  : `${burstCost - state.burstCharge} kills to next burst`}
              </Text>
            </View>

            {/* Team Composition */}
            <View style={styles.battleSection}>
              <Text style={styles.battleSectionTitle}>
                Your Team ({state.activeTeamHeroIds.length}/{teamSlotCap})
              </Text>
              {state.activeTeamHeroIds.length === 0 ? (
                <Text style={styles.emptyMsg}>No team selected! Tap "Edit Team" above to assemble your squad.</Text>
              ) : (
                state.activeTeamHeroIds.map((heroId, idx) => {
                  const hero = state.heroRoster.find(h => h.uid === heroId);
                  if (!hero) return null;
                  const cls = getClassConfig(hero.heroClass);
                  const detail = stats.heroDetails[hero.uid];
                  const rarityColor = rarityConfig(hero.rarity).color;
                  return (
                    <View key={heroId} style={styles.battleHeroRow}>
                      <Text style={styles.battleHeroSlot}>#{idx + 1}</Text>
                      <Text style={[styles.battleHeroInfo, { color: rarityColor }]}>
                        {cls.emoji} {hero.name}
                      </Text>
                      <Text style={styles.battleHeroStats}>
                        ⭐{hero.rank} Lv{hero.level} • {cls.name}
                      </Text>
                      {detail && <Text style={styles.battleHeroDps}>{Math.floor(detail.dps)} DPS</Text>}
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.battleSection}>
              <Text style={styles.battleSectionTitle}>🧰 Usable Items</Text>
              <Text style={styles.sectionHelperText}>Automation toggles moved to Settings.</Text>
              {usableInventory.length === 0 ? (
                <Text style={styles.emptyMsg}>No consumables yet. Keep pushing waves for drops.</Text>
              ) : (
                usableInventory.map(({ item, count }) => {
                  if (!item) return null;
                  return (
                    <View key={item.id} style={styles.usableRow}>
                      <View style={styles.usableInfo}>
                        <Text style={styles.usableName}>
                          {item.emoji} {item.name} x{count}
                        </Text>
                        <Text style={styles.usableDesc}>{getUsableItemDescription(state, item)}</Text>
                      </View>
                      <View style={styles.usableActionsCol}>
                        <Pressable style={styles.useItemBtn} onPress={() => applyUsableItem(item.id)}>
                          <Text style={styles.useItemBtnText}>Use</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.useItemBtn, styles.useItemBtnSecondary]}
                          onPress={() => confirmUseAll(item, count)}
                        >
                          <Text style={styles.useItemBtnText}>Use All</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.battleSection}>
              <Text style={styles.battleSectionTitle}>Live Combat Log</Text>
              {state.combatLog.length === 0 ? (
                <Text style={styles.emptyMsg}>No events yet. Start attacking to see crits and skill triggers.</Text>
              ) : (
                state.combatLog.slice(0, 8).map((line, idx) => (
                  <Text key={`${idx}_${line}`} style={styles.combatLogLine}>
                    {line}
                  </Text>
                ))
              )}
            </View>

            {state.activeTeamHeroIds.length === 0 && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  ⚠️ No team selected! Tap the Edit Team button above to assemble your squad.
                </Text>
              </View>
            )}
          </View>
        )}
      </>
    );
  },
);
