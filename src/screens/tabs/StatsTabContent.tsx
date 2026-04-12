import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { GameState, Stats } from '../../useGameState';
import { StatKey } from '../../gameConfig';
import { STAT_LABELS } from '../GameScreen';
import { fmt } from '../../utils';
import { styles } from './StatsTabContent.styles';

export interface StatsTabContentProps {
  tab: string;
  state: GameState;
  stats: Stats;
  classConfig: any;
  classMasteryLevel: number;
  damageEssenceCost: number;
  economyEssenceCost: number;
  survivalEssenceCost: number;
  rebirthDamageCost: number;
  rebirthEconomyCost: number;
  rebirthSurvivalCost: number;
  classPassive: any;
  allocateStat: (stat: StatKey) => void;
  allocateStatN: (stat: StatKey, n: number) => void;
  allocateStatMax: (stat: StatKey) => void;
  spendEssenceUpgrade: (path: 'damage' | 'economy' | 'survival') => void;
  spendRebirthCore: (path: 'damage' | 'economy' | 'survival') => void;
}

export const StatsTabContent = React.memo<StatsTabContentProps>(({
  tab,
  state,
  stats,
  classConfig,
  classMasteryLevel,
  damageEssenceCost,
  economyEssenceCost,
  survivalEssenceCost,
  rebirthDamageCost,
  rebirthEconomyCost,
  rebirthSurvivalCost,
  classPassive,
  allocateStat,
  allocateStatN,
  allocateStatMax,
  spendEssenceUpgrade,
  spendRebirthCore,
}) => {
  return (
    <>
      {tab === 'stats' && (
        <View style={styles.statsTab}>
          <Text style={styles.sectionTitle}>⬆️ Stat Allocation</Text>
          <Text style={styles.unspentLabel}>
            Unspent Points: <Text style={styles.unspentCount}>{state.unspentStatPoints}</Text>
          </Text>

          <View style={styles.statsGrid}>
            {(Object.keys(STAT_LABELS) as Array<keyof typeof STAT_LABELS>).map(stat => {
              const gearBonus = stats.equipmentBonus[stat];
              const total = stats.combined[stat];
              const val = total - gearBonus;
              const desc = classConfig.statDescriptions[stat as StatKey];
              return (
                <View key={stat} style={styles.statRow}>
                  <View style={styles.statRowTop}>
                    <View style={styles.statLabel}>
                      <Text style={styles.statAbr}>{STAT_LABELS[stat]}</Text>
                      <View style={styles.statTotalRow}>
                        <Text style={styles.statTotalLabel}>Total</Text>
                        <Text style={styles.statTotalValue}>{total}</Text>
                      </View>
                      <View style={styles.statValueRow}>
                        <Text style={styles.statValue}>{val}</Text>
                        {gearBonus > 0 && <Text style={styles.statGearValue}>(+{gearBonus} gear)</Text>}
                      </View>
                    </View>
                    <View style={styles.statBtnGroup}>
                      <Pressable
                        style={[styles.statBtn, state.unspentStatPoints === 0 && styles.statBtnDisabled]}
                        disabled={state.unspentStatPoints === 0}
                        onPress={() => allocateStat(stat as any)}
                      >
                        <Text style={styles.statBtnText}>+1</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.statBtn, state.unspentStatPoints === 0 && styles.statBtnDisabled]}
                        disabled={state.unspentStatPoints === 0}
                        onPress={() => allocateStatN(stat as any, 5)}
                      >
                        <Text style={styles.statBtnText}>+5</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.statBtn, state.unspentStatPoints === 0 && styles.statBtnDisabled]}
                        disabled={state.unspentStatPoints === 0}
                        onPress={() => allocateStatN(stat as any, 10)}
                      >
                        <Text style={styles.statBtnText}>+10</Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.statBtn,
                          styles.statBtnMax,
                          state.unspentStatPoints === 0 && styles.statBtnDisabled,
                        ]}
                        disabled={state.unspentStatPoints === 0}
                        onPress={() => allocateStatMax(stat as any)}
                      >
                        <Text style={styles.statBtnText}>+MAX</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text style={styles.statDesc}>{desc}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.heroBoostBox}>
            <Text style={styles.heroBoostLabel}>💪 Hero Boost (Equipped Heroes)</Text>
            <Text style={styles.heroBoostValue}>
              +{(stats.teamBoostPercent * 100).toFixed(2)}% to Team DPS
            </Text>
          </View>

          <View style={styles.metaBox}>
            <Text style={styles.sectionTitle}>🧭 Permanent Progression</Text>
            <Text style={styles.metaEssence}>Essence: {fmt(state.essence)}</Text>
            <Text style={styles.sectionHelperText}>ⓘ Meta paths modify final run multipliers: Damage to DPS, Economy to gold, Survival to HP/defense.</Text>
            <View style={styles.passiveBanner}>
              <Text style={styles.passiveTitle}>Class Passive: {classPassive.name}</Text>
              <Text style={styles.passiveDesc}>{classPassive.description}</Text>
              <Text style={styles.passiveState}>
                {state.permanentUnlocks.includes('class_passive') ? 'Unlocked' : 'Locked (Defeat Act 1 Boss)'}
              </Text>
            </View>

            <View style={styles.metaUpgradeRow}>
              <View style={styles.metaUpgradeInfo}>
                <Text style={styles.metaUpgradeName}>Damage Path Lv {state.metaDamageLevel}</Text>
                <Text style={styles.metaUpgradeDesc}>+5% to final auto-DPS and active skill damage per level</Text>
              </View>
              <Pressable
                style={[styles.metaUpgradeBtn, state.essence < damageEssenceCost && styles.metaUpgradeBtnDisabled]}
                disabled={state.essence < damageEssenceCost}
                onPress={() => spendEssenceUpgrade('damage')}
              >
                <Text style={styles.metaUpgradeBtnText}>{damageEssenceCost} ✨</Text>
              </Pressable>
            </View>

            <View style={styles.metaUpgradeRow}>
              <View style={styles.metaUpgradeInfo}>
                <Text style={styles.metaUpgradeName}>Economy Path Lv {state.metaEconomyLevel}</Text>
                <Text style={styles.metaUpgradeDesc}>+5% to final gold gain multiplier per level</Text>
              </View>
              <Pressable
                style={[styles.metaUpgradeBtn, state.essence < economyEssenceCost && styles.metaUpgradeBtnDisabled]}
                disabled={state.essence < economyEssenceCost}
                onPress={() => spendEssenceUpgrade('economy')}
              >
                <Text style={styles.metaUpgradeBtnText}>{economyEssenceCost} ✨</Text>
              </Pressable>
            </View>

            <View style={styles.metaUpgradeRow}>
              <View style={styles.metaUpgradeInfo}>
                <Text style={styles.metaUpgradeName}>Survival Path Lv {state.metaSurvivalLevel}</Text>
                <Text style={styles.metaUpgradeDesc}>+5% to team max HP and defense scaling per level</Text>
              </View>
              <Pressable
                style={[styles.metaUpgradeBtn, state.essence < survivalEssenceCost && styles.metaUpgradeBtnDisabled]}
                disabled={state.essence < survivalEssenceCost}
                onPress={() => spendEssenceUpgrade('survival')}
              >
                <Text style={styles.metaUpgradeBtnText}>{survivalEssenceCost} ✨</Text>
              </Pressable>
            </View>

            <View style={styles.rebirthTreeCard}>
              <Text style={styles.rebirthTreeTitle}>♾️ Rebirth Tree</Text>
              <Text style={styles.rebirthTreeCores}>Cores: {state.rebirthCores}</Text>
              <Text style={styles.sectionHelperText}>ⓘ Rebirth branches are permanent multipliers applied on top of run stats after each ascension.</Text>
              <View style={styles.metaUpgradeRow}>
                <View style={styles.metaUpgradeInfo}>
                  <Text style={styles.metaUpgradeName}>Damage Branch Lv {state.rebirthDamagePath}</Text>
                  <Text style={styles.metaUpgradeDesc}>+7% to final DPS multiplier per level (rebirth-only track)</Text>
                </View>
                <Pressable
                  style={[styles.metaUpgradeBtn, state.rebirthCores < rebirthDamageCost && styles.metaUpgradeBtnDisabled]}
                  disabled={state.rebirthCores < rebirthDamageCost}
                  onPress={() => spendRebirthCore('damage')}
                >
                  <Text style={styles.metaUpgradeBtnText}>{rebirthDamageCost} Core</Text>
                </Pressable>
              </View>
              <View style={styles.metaUpgradeRow}>
                <View style={styles.metaUpgradeInfo}>
                  <Text style={styles.metaUpgradeName}>Economy Branch Lv {state.rebirthEconomyPath}</Text>
                  <Text style={styles.metaUpgradeDesc}>+7% to final gold multiplier per level (rebirth-only track)</Text>
                </View>
                <Pressable
                  style={[styles.metaUpgradeBtn, state.rebirthCores < rebirthEconomyCost && styles.metaUpgradeBtnDisabled]}
                  disabled={state.rebirthCores < rebirthEconomyCost}
                  onPress={() => spendRebirthCore('economy')}
                >
                  <Text style={styles.metaUpgradeBtnText}>{rebirthEconomyCost} Core</Text>
                </Pressable>
              </View>
              <View style={styles.metaUpgradeRow}>
                <View style={styles.metaUpgradeInfo}>
                  <Text style={styles.metaUpgradeName}>Survival Branch Lv {state.rebirthSurvivalPath}</Text>
                  <Text style={styles.metaUpgradeDesc}>+7% to team HP and defense scaling per level (rebirth-only track)</Text>
                </View>
                <Pressable
                  style={[styles.metaUpgradeBtn, state.rebirthCores < rebirthSurvivalCost && styles.metaUpgradeBtnDisabled]}
                  disabled={state.rebirthCores < rebirthSurvivalCost}
                  onPress={() => spendRebirthCore('survival')}
                >
                  <Text style={styles.metaUpgradeBtnText}>{rebirthSurvivalCost} Core</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.equipmentBox}>
            <Text style={styles.sectionTitle}>🧰 Equipment Bonuses</Text>
            <Text style={styles.equipmentDesc}>Manage equip/upgrade actions in the Equipment tab.</Text>
            <View style={styles.equipmentBonusRow}>
              <Text style={styles.equipmentBonusText}>+STR {stats.equipmentBonus.strength}</Text>
              <Text style={styles.equipmentBonusText}>+VIT {stats.equipmentBonus.vitality}</Text>
              <Text style={styles.equipmentBonusText}>+AGI {stats.equipmentBonus.agility}</Text>
              <Text style={styles.equipmentBonusText}>+INT {stats.equipmentBonus.intelligence}</Text>
              <Text style={styles.equipmentBonusText}>+SPR {stats.equipmentBonus.spirit}</Text>
            </View>
          </View>

          <View style={styles.masteryCard}>
            <Text style={styles.masteryTitle}>⚡ Class Mastery: {stats.className}</Text>
            <Text style={styles.masteryLevel}>Mastery Level {classMasteryLevel} <Text style={styles.masteryLevelSub}>(1 level per 100 mastery XP)</Text></Text>
            <View style={styles.hpBarBg}>
              <View style={[styles.hpBarFill, { width: `${((state.playerClass ? state.classMasteryXp[state.playerClass] : 0) % 100)}%`, backgroundColor: '#7BD9A8' }]} />
            </View>
            <Text style={styles.masteryHint}>{(state.playerClass ? state.classMasteryXp[state.playerClass] : 0) % 100}/100 mastery XP to next level</Text>
            {[
              { lvl: 1, perk: '+10% to class base stats used in DPS/HP formulas', done: classMasteryLevel >= 1 },
              { lvl: 5, perk: '+5% to final gold gain multiplier', done: classMasteryLevel >= 5 },
              { lvl: 10, perk: '+15% to passive-skill damage contribution', done: classMasteryLevel >= 10 },
              { lvl: 25, perk: 'Mastery Aura: team-wide +8% max HP', done: classMasteryLevel >= 25 },
              { lvl: 50, perk: 'Grand Mastery: unlock legendary passive', done: classMasteryLevel >= 50 },
            ].map(m => (
              <View key={m.lvl} style={styles.masteryMilestoneRow}>
                <Text style={[styles.masteryMilestoneCheck, m.done && styles.masteryMilestoneDone]}>{m.done ? '✅' : '○'}</Text>
                <View>
                  <Text style={styles.masteryMilestoneLvl}>Lv {m.lvl}</Text>
                  <Text style={styles.masteryMilestonePerk}>{m.perk}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </>
  );
});
