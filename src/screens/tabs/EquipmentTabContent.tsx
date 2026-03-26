import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { GameState, Stats } from '../../useGameState';
import { EquipmentSlot } from '../../gameConfig';
import { fmt } from '../../utils';
import { styles } from '../GameScreen';

export interface EquipmentTabContentProps {
  tab: string;
  state: GameState;
  stats: Stats;
  equipmentSubTab: string;
  setEquipmentSubTab: (tab: string) => void;
  compareItemId: string | null;
  setCompareItemId: (id: string | null) => void;
  shardForgeCosts: any;
  getEquipmentCraftCost: (slot: EquipmentSlot) => any;
  getEquipmentItem: (itemId: string) => any;
  getUpgradePlan: (itemId: string) => any;
  equipmentRarityConfig: (rarity: string) => any;
  optimizeEquipment: () => void;
  autoDismantleEquipment: () => void;
  craftEquipment: (slot: EquipmentSlot) => void;
  equipItem: (itemId: string) => void;
  upgradeEquipmentRarity: (itemId: string) => void;
  dismantleEquipment: (itemId: string) => void;
  convertShardsToEssence: () => void;
  convertShardsToScrap: () => void;
  renderSubTabBar: (tabs: any[]) => React.ReactNode;
}

export const EquipmentTabContent: React.FC<EquipmentTabContentProps> = ({
  tab,
  state,
  stats,
  equipmentSubTab,
  setEquipmentSubTab,
  compareItemId,
  setCompareItemId,
  shardForgeCosts,
  getEquipmentCraftCost,
  getEquipmentItem,
  getUpgradePlan,
  equipmentRarityConfig,
  optimizeEquipment,
  autoDismantleEquipment,
  craftEquipment,
  equipItem,
  upgradeEquipmentRarity,
  dismantleEquipment,
  convertShardsToEssence,
  convertShardsToScrap,
  renderSubTabBar,
}) => {
  return (
    <>
      {tab === 'equipment' && (
        <View style={styles.equipmentTab}>
          <View style={styles.equipHeaderRow}>
            <Text style={styles.sectionTitle}>🎒 Equipment Inventory</Text>
          </View>
          {renderSubTabBar((['inventory', 'craft', 'forge'] as const).map(st => ({
            id: st,
            label: st === 'inventory' ? 'Inventory' : st === 'craft' ? 'Crafting' : 'Forge',
            active: equipmentSubTab === st,
            onPress: () => setEquipmentSubTab(st),
          })))}
          <Text style={styles.equipInventoryCount}>
            Total: {state.inventoryItemIds.length} items • Shards: <Text style={{ color: '#FFB347' }}>{state.heroShards}</Text>
          </Text>
          <Text style={styles.scrapLabel}>🔩 Scrap: {fmt(state.equipmentScrap)}</Text>
          <Text style={styles.mythicTierLabel}>
            Mythic Tier: {state.permanentUnlocks.includes('mythic_equipment') ? 'Unlocked' : 'Locked (Defeat Act 3 Boss)'}
          </Text>
          {equipmentSubTab === 'inventory' && (
            <View style={styles.equipOptimizeRow}>
              <Pressable style={styles.equipOptimizeBtn} onPress={optimizeEquipment}>
                <Text style={styles.equipOptimizeBtnText}>⚡ Optimize Gear</Text>
              </Pressable>
              <Pressable style={styles.equipDismantleBtn} onPress={autoDismantleEquipment}>
                <Text style={styles.equipDismantleBtnText}>🧰 Auto Dismantle</Text>
              </Pressable>
              <Text style={styles.equipOptimizeHint}>Optimize equips the highest-scoring rolled item per slot for your class. Auto dismantle scraps all unequipped items.</Text>
            </View>
          )}
          {equipmentSubTab === 'craft' && (
            <View style={styles.craftRow}>
              {(['weapon', 'armor', 'accessory'] as EquipmentSlot[]).map(slot => {
                const cost = getEquipmentCraftCost(slot);
                const canCraft = state.equipmentScrap >= cost.scrap && state.gold >= cost.gold;
                return (
                  <Pressable
                    key={slot}
                    style={[styles.craftBtn, !canCraft && styles.craftBtnDisabled]}
                    disabled={!canCraft}
                    onPress={() => craftEquipment(slot)}
                  >
                    <Text style={styles.craftBtnText}>{slot.toUpperCase()}</Text>
                    <Text style={styles.craftCostText}>{cost.scrap}🔩 • {fmt(cost.gold)}g</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {equipmentSubTab === 'inventory' && state.inventoryItemIds.length === 0 ? (
            <Text style={styles.emptyMsg}>No equipment yet! Kill monsters to find better gear.</Text>
          ) : equipmentSubTab === 'inventory' ? (
            state.inventoryItemIds.map(itemId => {
              const item = getEquipmentItem(itemId);
              if (!item) return null;
              const isEquipped = Object.values(state.equippedItems).includes(itemId);
              const rarity = equipmentRarityConfig(item.rarity);
              const upgradePlan = getUpgradePlan(item.id);
              return (
                <View key={itemId} style={[styles.invEquipCard, isEquipped && styles.invEquipCardEquipped]}>
                  <View style={[styles.invEquipRarity, { backgroundColor: rarity.color }]} />
                  <View style={styles.invEquipContent}>
                    <View style={styles.invEquipHeader}>
                      <Text style={styles.invEquipName}>{item.emoji} {item.name}</Text>
                      <Text style={[styles.invEquipRarity2, { color: rarity.color }]}>{item.rarity}</Text>
                    </View>
                    <Text style={styles.invEquipSlot}>{item.slot.toUpperCase()} • iLv {item.itemLevel ?? 1}</Text>
                    <Text style={styles.invEquipBonus}>
                      {Object.entries(item.bonus)
                        .filter(([_, v]) => v)
                        .map(([k, v]) => `+${v} ${k === 'strength' ? 'STR' : k === 'vitality' ? 'VIT' : k === 'agility' ? 'AGI' : k === 'intelligence' ? 'INT' : 'SPR'}`)
                        .join(' • ')}
                    </Text>
                    {isEquipped && <Text style={styles.invEquipActive}>✓ Equipped</Text>}
                    <View style={styles.equipActionRow}>
                      {!isEquipped && (
                        <>
                          <Pressable style={styles.equipNowBtn} onPress={() => equipItem(item.id)}>
                            <Text style={styles.equipNowBtnText}>Equip</Text>
                          </Pressable>
                          <Pressable style={styles.compareBtn} onPress={() => setCompareItemId(compareItemId === item.id ? null : item.id)}>
                            <Text style={styles.compareBtnText}>vs</Text>
                          </Pressable>
                        </>
                      )}
                      <Pressable
                        style={[styles.upgradeGearBtn, !upgradePlan.canUpgrade && styles.upgradeGearBtnDisabled]}
                        disabled={!upgradePlan.canUpgrade}
                        onPress={() => upgradeEquipmentRarity(item.id)}
                      >
                        <Text style={styles.upgradeGearBtnText}>
                          {upgradePlan.targetRarity
                            ? `Upgrade → ${upgradePlan.targetRarity.toUpperCase()} (${upgradePlan.scrapCost}🔩 ${upgradePlan.essenceCost}🜂 ${fmt(upgradePlan.goldCost)}g)`
                            : 'Upgrade Unavailable'}
                        </Text>
                      </Pressable>
                    </View>
                    {!isEquipped && compareItemId === item.id && (() => {
                      const curId = state.equippedItems[item.slot as EquipmentSlot];
                      const curItem = curId ? getEquipmentItem(curId) : null;
                      const allStats = ['strength', 'vitality', 'agility', 'intelligence', 'spirit'] as const;
                      return (
                        <View style={styles.comparePanel}>
                          <Text style={styles.comparePanelTitle}>vs Current: {curItem ? `${curItem.name} (${curItem.rarity})` : 'Empty slot'}</Text>
                          <View style={styles.compareStatRow}>
                            {allStats.map(stat => {
                              const nv = item.bonus[stat] ?? 0;
                              const cv = curItem?.bonus[stat] ?? 0;
                              const diff = nv - cv;
                              if (nv === 0 && cv === 0) return null;
                              return (
                                <Text key={stat} style={[
                                  styles.compareStat,
                                  diff > 0 ? styles.compareStatUp : diff < 0 ? styles.compareStatDown : styles.compareStatNeutral,
                                ]}>
                                  {stat.slice(0, 3).toUpperCase()}: {diff >= 0 ? '+' : ''}{diff}
                                </Text>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })()}
                    {!isEquipped && (
                      <Pressable style={styles.dismantleBtn} onPress={() => dismantleEquipment(item.id)}>
                        <Text style={styles.dismantleBtnText}>Dismantle</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })
          ) : equipmentSubTab === 'forge' ? (
            <>
              <View style={styles.shardForgeCard}>
                <Text style={styles.shardForgeTitle}>Shard Forge</Text>
                <Text style={styles.shardForgeDesc}>Spend overflow shards for persistent value and keep the roster economy under control.</Text>
                <View style={styles.shardForgeRow}>
                  <Pressable
                    style={[styles.shardForgeBtn, state.heroShards < shardForgeCosts.essenceCost && styles.shardForgeBtnDisabled]}
                    disabled={state.heroShards < shardForgeCosts.essenceCost}
                    onPress={convertShardsToEssence}
                  >
                    <Text style={styles.shardForgeBtnText}>Essence • {shardForgeCosts.essenceCost} ✨</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.shardForgeBtn, state.heroShards < shardForgeCosts.scrapCost && styles.shardForgeBtnDisabled]}
                    disabled={state.heroShards < shardForgeCosts.scrapCost}
                    onPress={convertShardsToScrap}
                  >
                    <Text style={styles.shardForgeBtnText}>Scrap • {shardForgeCosts.scrapCost} ✨</Text>
                  </Pressable>
                </View>
              </View>
            </>
          ) : (
            <Text style={styles.sectionHelperText}>Select Inventory to manage equipped items and upgrades.</Text>
          )}
        </View>
      )}
    </>
  );
};
