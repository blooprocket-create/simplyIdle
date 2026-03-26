import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { GameState, Stats } from '../../useGameState';
import { REBIRTH_WAVE_THRESHOLD, StatKey, EquipmentSlot, rarityConfig } from '../../gameConfig';
import { STAT_LABELS } from '../GameScreen';
import { fmt } from '../../utils';
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
  canRebirthNow: boolean;
  rebirthWavesLeft: number;
  currentAct: any;
  actProgressPct: number;
  isBoss: boolean;
  monster: any;
  monsterAffixes: any[];
  teamSlotCap: number;
  getClassConfig: (heroClass: string) => any;
  ttkSeconds: number;
  dangerScore: number;
  dangerLabel: string;
  usableInventory: any[];
  nextBossUnlock: any;
  unlockLabel: (unlock: string) => string;
  setCombatTempo: (tempo: number) => void;
  burst: (hits: number) => void;
  buyPremiumCoolant: (itemId: string) => void;
  useUsableItem: (itemId: string) => void;
  setRebirthOpen: (open: boolean) => void;
}

export const BattleTabContent: React.FC<BattleTabContentProps> = ({
  tab,
  state,
  stats,
  battleSpeed,
  heatPct,
  maxHeat,
  canBurst,
  burstCost,
  burstChargePct,
  canRebirthNow,
  rebirthWavesLeft,
  currentAct,
  actProgressPct,
  isBoss,
  monster,
  monsterAffixes,
  teamSlotCap,
  getClassConfig,
  ttkSeconds,
  dangerScore,
  dangerLabel,
  usableInventory,
  nextBossUnlock,
  unlockLabel,
  setCombatTempo,
  burst,
  buyPremiumCoolant,
  useUsableItem,
  setRebirthOpen,
}) => {
  return (
    <>
      {tab === 'battle' && (
        <View style={styles.battleTab}>
          <Text style={styles.sectionTitle}>⚔️ Battle Overview</Text>

          <View style={styles.battleTempoCard}>
            <View style={styles.battleTempoHeader}>
              <Text style={styles.battleTempoTitle}>Combat Tempo</Text>
              <View style={styles.battleTempoRow}>
                {([1, 2, 4] as const).map(mult => (
                  <Pressable
                    key={mult}
                    style={[styles.battleTempoBtn, battleSpeed === mult && styles.battleTempoBtnActive]}
                    onPress={() => setCombatTempo(mult)}
                  >
                    <Text style={[styles.battleTempoBtnText, battleSpeed === mult && styles.battleTempoBtnTextActive]}>{mult}x</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Text style={styles.battleTempoHint}>Higher tempo speeds up passive combat and burst payout.</Text>
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

          <View style={styles.battleSection}>
            <Text style={styles.battleSectionTitle}>♾️ Rebirth</Text>
            <Text style={styles.rebirthInlineText}>
              {canRebirthNow
                ? 'You can rebirth now. This resets run progress for permanent cores and scaling.'
                : `Reach Wave ${REBIRTH_WAVE_THRESHOLD} to unlock rebirth. ${rebirthWavesLeft} waves remaining.`}
            </Text>
            <Pressable
              style={[styles.rebirthInlineBtn, !canRebirthNow && styles.rebirthInlineBtnDisabled]}
              disabled={!canRebirthNow}
              onPress={() => setRebirthOpen(true)}
            >
              <Text style={styles.rebirthInlineBtnText}>{canRebirthNow ? 'Open Rebirth' : 'Rebirth Locked'}</Text>
            </Pressable>
          </View>

          <View style={styles.battleSection}>
            <Text style={styles.battleSectionTitle}>Act Progression</Text>
            <Text style={styles.actTitle}>{currentAct.emoji} Act {currentAct.id}: {currentAct.name}</Text>
            <Text style={styles.actTheme}>{currentAct.theme}</Text>
            <View style={styles.hpBarBg}>
              <View style={[styles.hpBarFill, { width: `${actProgressPct}%`, backgroundColor: '#5DA8FF' }]} />
            </View>
            <Text style={styles.actProgress}>Wave {state.wave} • Boss at Wave {currentAct.bossWave}</Text>
            {nextBossUnlock ? (
              <Text style={styles.actUnlockHint}>Next boss unlock: {unlockLabel(nextBossUnlock)}</Text>
            ) : (
              <Text style={styles.actUnlockHint}>Boss reward: bonus essence cache</Text>
            )}
            <Text style={styles.actUnlockOwned}>
              Unlocks: {state.permanentUnlocks.length === 0 ? 'None yet' : state.permanentUnlocks.map(unlockLabel).join(' • ')}
            </Text>
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
                      {hero.emoji} {hero.name}
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
                      <Text style={styles.usableName}>{item.emoji} {item.name} x{count}</Text>
                      <Text style={styles.usableDesc}>{item.description}</Text>
                    </View>
                    <Pressable style={styles.useItemBtn} onPress={() => useUsableItem(item.id)}>
                      <Text style={styles.useItemBtnText}>Use</Text>
                    </Pressable>
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
};
