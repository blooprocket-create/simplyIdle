import React from 'react';
import { Alert, Platform, View, Text, Pressable } from 'react-native';
import { GameState, Stats } from '../../useGameState';
import { PlayerClass, rarityConfig } from '../../gameConfig';
import { styles } from '../GameScreen';

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
  getClassConfig: (heroClass: PlayerClass) => any;
  usableInventory: any[];
  setCombatTempo: (tempo: 1 | 2 | 4) => void;
  burst: (hits: number) => void;
  buyPremiumCoolant: (itemId: 'coolant_mk1' | 'coolant_mk2', amount?: number) => void;
  useUsableItem: (itemId: string, amount?: number | 'all') => void;
}

export const BattleTabContent = React.memo<BattleTabContentProps>(({
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
  getClassConfig,
  usableInventory,
  setCombatTempo,
  burst,
  buyPremiumCoolant,
  useUsableItem,
}) => {
  const hasTempo4Access = (state.vipLevel ?? 0) >= 1;

  const confirmUseAll = (item: any, count: number) => {
    if (count <= 0) return;

    const needsWarning = item.effect === 'heal_team_percent' || item.effect === 'reduce_heat_flat';
    if (!needsWarning) {
      useUsableItem(item.id, 'all');
      return;
    }

    const warningText = item.effect === 'heal_team_percent'
      ? `Use all ${count} ${item.name} now? This can over-heal and waste value.`
      : `Use all ${count} ${item.name} now? This can over-cool and waste premium resources.`;

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(warningText)) {
        useUsableItem(item.id, 'all');
      }
      return;
    }

    Alert.alert('Confirm Use All', warningText, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Use All', style: 'destructive', onPress: () => useUsableItem(item.id, 'all') },
    ]);
  };

  return (
    <>
      {tab === 'battle' && (
        <View style={styles.battleTab}>
          <Text style={styles.sectionTitle}>⚔️ Battle Overview</Text>

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
                    >
                      <Text style={[styles.battleTempoBtnText, battleSpeed === mult && styles.battleTempoBtnTextActive]}>
                        {mult === 4 && locked ? '4x VIP1' : `${mult}x`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Text style={styles.battleTempoHint}>Higher tempo speeds up passive combat and burst payout.</Text>
            {!hasTempo4Access && <Text style={styles.battleTempoHint}>4x unlocks at VIP 1.</Text>}
            <Text style={styles.battleTempoHint}>Heat: {Math.ceil(state.combatHeat)}/{Math.ceil(maxHeat)} {state.combatTempo > 1 ? '(building)' : '(recovering)'}</Text>
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
                style={[styles.heatUseBtn, (state.usableItemCounts['coolant_mk1'] ?? 0) <= 0 && styles.heatStoreBtnDisabled]}
                disabled={(state.usableItemCounts['coolant_mk1'] ?? 0) <= 0}
                onPress={() => useUsableItem('coolant_mk1')}
              >
                <Text style={styles.heatStoreBtnText}>Use 🧊 ({state.usableItemCounts['coolant_mk1'] ?? 0})</Text>
              </Pressable>
              <Pressable
                style={[styles.heatUseBtn, (state.usableItemCounts['coolant_mk2'] ?? 0) <= 0 && styles.heatStoreBtnDisabled]}
                disabled={(state.usableItemCounts['coolant_mk2'] ?? 0) <= 0}
                onPress={() => useUsableItem('coolant_mk2')}
              >
                <Text style={styles.heatStoreBtnText}>Use ❄️ ({state.usableItemCounts['coolant_mk2'] ?? 0})</Text>
              </Pressable>
            </View>
            <View style={styles.burstRow}>
              <View style={styles.burstInfo}>
                <Text style={styles.burstTitle}>Burst Gauge</Text>
                <Text style={styles.burstSub}>Charge from kills ({state.burstCharge}/{burstCost}) • bosses grant +3 • spend for amplified strikes</Text>
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
            <Text style={styles.burstHint}>{canBurst ? 'Burst ready: cash in now for a wave skip push.' : `${burstCost - state.burstCharge} kills to next burst`}</Text>
          </View>

          {/* Team Composition */}
          <View style={styles.battleSection}>
            <Text style={styles.battleSectionTitle}>Your Team ({state.activeTeamHeroIds.length}/{teamSlotCap})</Text>
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
                const scalesWithProgress = item.effect !== 'heal_team_percent';
                return (
                  <View key={item.id} style={styles.usableRow}>
                    <View style={styles.usableInfo}>
                      <Text style={styles.usableName}>{item.emoji} {item.name} x{count}</Text>
                      <Text style={styles.usableDesc}>
                        {item.description}{scalesWithProgress ? ' Scales with progression.' : ''}
                      </Text>
                    </View>
                    <View style={styles.usableActionsCol}>
                      <Pressable style={styles.useItemBtn} onPress={() => useUsableItem(item.id)}>
                        <Text style={styles.useItemBtnText}>Use</Text>
                      </Pressable>
                      <Pressable style={[styles.useItemBtn, styles.useItemBtnSecondary]} onPress={() => confirmUseAll(item, count)}>
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
                <Text key={`${idx}_${line}`} style={styles.combatLogLine}>{line}</Text>
              ))
            )}
          </View>

          {state.activeTeamHeroIds.length === 0 && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>⚠️ No team selected! Tap the Edit Team button above to assemble your squad.</Text>
            </View>
          )}
        </View>
      )}
    </>
  );
});
