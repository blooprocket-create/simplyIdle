import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { GameState, Stats } from '../../useGameState';
import { EquipmentSlot, EquipmentRarity, getHeroBackstory, getHeroUniqueEffectFamilyLabel, getHeroUniqueSkillDescription, getHeroUniqueWeaponName, RARITIES } from '../../gameConfig';
import { fmt } from '../../utils';
import { styles } from '../GameScreen';

export interface EquipmentTabContentProps {
  tab: string;
  state: GameState;
  stats: Stats;
  equipmentSubTab: string;
  setEquipmentSubTab: (tab: 'inventory' | 'craft' | 'forge' | 'armory') => void;
  compareItemId: string | null;
  setCompareItemId: (id: string | null) => void;
  shardForgeCosts: any;
  getEquipmentCraftCost: (slot: EquipmentSlot) => any;
  getEquipmentItem: (itemId: string) => any;
  getUpgradePlan: (itemId: string) => any;
  equipmentRarityConfig: (rarity: EquipmentRarity) => any;
  optimizeEquipment: () => void;
  autoDismantleEquipment: () => void;
  craftEquipment: (slot: EquipmentSlot) => void;
  equipItem: (itemId: string) => void;
  toggleHeroUniqueWeapon: (heroUid: string) => void;
  upgradeEquipmentRarity: (itemId: string) => void;
  dismantleEquipment: (itemId: string) => void;
  convertScrapToEssence: () => void;
  convertScrapToShards: () => void;
  renderSubTabBar: (tabs: any[]) => React.ReactNode;
}

export const EquipmentTabContent = React.memo<EquipmentTabContentProps>(({
  tab,
  state,
  stats: _stats,
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
  toggleHeroUniqueWeapon,
  upgradeEquipmentRarity,
  dismantleEquipment,
  convertScrapToEssence,
  convertScrapToShards,
  renderSubTabBar,
}) => {
  const rarityRank = useMemo(() => {
    const rankMap: Record<string, number> = {};
    RARITIES.forEach((rarity, index) => {
      rankMap[rarity.id] = index;
    });
    return rankMap;
  }, []);

  const uniqueArmoryEntries = useMemo(() => {
    const bestOwnedByHeroId = new Map<string, GameState['heroRoster'][number]>();

    for (const hero of state.heroRoster) {
      const existing = bestOwnedByHeroId.get(hero.id);
      if (!existing) {
        bestOwnedByHeroId.set(hero.id, hero);
        continue;
      }

      const rarityDiff = (rarityRank[hero.rarity] ?? 0) - (rarityRank[existing.rarity] ?? 0);
      if (rarityDiff > 0 || (rarityDiff === 0 && hero.level > existing.level)) {
        bestOwnedByHeroId.set(hero.id, hero);
      }
    }

    return Array.from(bestOwnedByHeroId.values())
      .map(hero => {
        const progress = state.heroUniqueGearByHeroId[hero.id];
        const copyCount = state.heroRoster.filter(copy => copy.id === hero.id).length;
        const uniqueBearerUid = progress?.equippedByUid ?? null;
        return {
          hero,
          progress,
          copyCount,
          uniqueRank: progress?.rank ?? 0,
          uniqueEquipped: !!uniqueBearerUid,
          uniqueBearerUid,
        };
      })
      .sort((a, b) => {
        if (a.uniqueRank !== b.uniqueRank) return b.uniqueRank - a.uniqueRank;
        if (a.uniqueEquipped !== b.uniqueEquipped) return Number(b.uniqueEquipped) - Number(a.uniqueEquipped);
        const rarityDiff = (rarityRank[b.hero.rarity] ?? 0) - (rarityRank[a.hero.rarity] ?? 0);
        if (rarityDiff !== 0) return rarityDiff;
        return b.hero.level - a.hero.level;
      });
  }, [rarityRank, state.heroRoster, state.heroUniqueGearByHeroId]);

  const forgedUniqueCount = uniqueArmoryEntries.filter(entry => entry.uniqueRank > 0).length;
  const equippedUniqueCount = uniqueArmoryEntries.filter(entry => entry.uniqueEquipped && entry.uniqueRank > 0).length;

  return (
    <>
      {tab === 'equipment' && (
        <View style={styles.equipmentTab}>
          <View style={styles.equipHeaderRow}>
            <Text style={styles.sectionTitle}>🎒 Equipment Inventory</Text>
          </View>
          {renderSubTabBar((['inventory', 'armory', 'craft', 'forge'] as const).map(st => ({
            id: st,
            label: st === 'inventory' ? 'Inventory' : st === 'armory' ? 'Armory' : st === 'craft' ? 'Crafting' : 'Forge',
            active: equipmentSubTab === st,
            onPress: () => setEquipmentSubTab(st),
          })))}
          <Text style={styles.equipInventoryCount}>
            Total: {state.inventoryItemIds.length} items • Shards: <Text style={{ color: '#FFB347' }}>{state.heroShards}</Text>
          </Text>
          <Text style={styles.scrapLabel}>🔩 Scrap: {fmt(state.equipmentScrap)}</Text>
          <Text style={styles.uniqueArmorySummary}>🗃️ Unique Armory: {forgedUniqueCount} forged • {equippedUniqueCount} equipped • Stored separately from normal drops</Text>
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
          {equipmentSubTab === 'armory' && (
            <>
              <View style={styles.uniqueArmoryHeaderCard}>
                <Text style={styles.uniqueArmoryTitle}>Hero Unique Armory</Text>
                <Text style={styles.uniqueArmoryHelper}>Each unique weapon is hero-bound, lore-linked, and cannot enter the normal dismantle loop.</Text>
              </View>
              {uniqueArmoryEntries.length === 0 ? (
                <Text style={styles.emptyMsg}>Summon heroes to start building the armory. Owned heroes appear here even before their unique weapon is forged.</Text>
              ) : (
                uniqueArmoryEntries.map(({ hero, copyCount, uniqueRank, uniqueEquipped, uniqueBearerUid }) => {
                    const uniqueWeaponName = getHeroUniqueWeaponName(hero.id);
                    const uniqueDoctrine = getHeroUniqueEffectFamilyLabel(hero.id);
                    const isLocked = uniqueRank <= 0;
                    const bearer = state.heroRoster.find(copy => copy.uid === uniqueBearerUid) ?? hero;
                    const uniqueSkillText = isLocked
                      ? `Locked • ${uniqueWeaponName} has not been forged yet.`
                      : getHeroUniqueSkillDescription(hero.id, uniqueRank);
                    const bearerLabel = `${bearer.name} • ${bearer.rarity.toUpperCase()} • Lv ${bearer.level} • Rank ${bearer.rank}`;
                    return (
                      <View key={hero.id} style={[styles.uniqueArmoryCard, uniqueEquipped && styles.uniqueArmoryCardEquipped, isLocked && styles.uniqueArmoryCardLocked]}>
                        <View style={styles.uniqueArmoryCardTop}>
                          <View style={styles.uniqueArmoryIdentityBlock}>
                            <Text style={styles.uniqueArmoryHeroName}>{hero.emoji} {hero.name}</Text>
                            <Text style={styles.uniqueArmoryWeaponName}>{uniqueWeaponName}</Text>
                            <Text style={styles.uniqueArmoryMeta}>{hero.heroClass.toUpperCase()} • {hero.rarity.toUpperCase()} • {uniqueDoctrine}</Text>
                            <Text style={styles.uniqueArmoryMeta}>{isLocked ? 'UNFORGED' : `Rank ${uniqueRank}/10`}</Text>
                          </View>
                          <View style={[styles.uniqueArmoryStatePill, isLocked ? styles.uniqueArmoryStatePillLocked : uniqueEquipped ? styles.uniqueArmoryStatePillEquipped : styles.uniqueArmoryStatePillStored]}>
                            <Text style={styles.uniqueArmoryStateText}>{isLocked ? 'LOCKED' : uniqueEquipped ? 'EQUIPPED' : 'STORED'}</Text>
                          </View>
                        </View>
                        <Text style={[styles.uniqueArmorySkill, isLocked && styles.uniqueArmoryLockText]}>{uniqueSkillText}</Text>
                        {!isLocked && (
                          <Text style={styles.uniqueArmoryRule}>
                            {uniqueEquipped ? `Equipped by: ${bearerLabel}` : `Stored for bearer: ${bearerLabel}`}
                          </Text>
                        )}
                        {copyCount > 1 && (
                          <Text style={styles.uniqueArmoryRule}>Duplicate copies owned: {copyCount}. Highest-priority copy is selected automatically.</Text>
                        )}
                        <Text style={styles.uniqueArmoryLore}>{getHeroBackstory(hero.id)}</Text>
                        <Text style={styles.uniqueArmoryRule}>Only {hero.name} can wield this weapon.</Text>
                        {!isLocked && (
                          <Pressable style={styles.uniqueArmoryToggleBtn} onPress={() => toggleHeroUniqueWeapon(bearer.uid)}>
                            <Text style={styles.uniqueArmoryToggleBtnText}>{uniqueEquipped ? 'Unequip Unique Weapon' : 'Equip Unique Weapon'}</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })
              )}
            </>
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
                            ? `Upgrade → ${upgradePlan.targetRarity.toUpperCase()} (${upgradePlan.scrapCost}🔩 ${upgradePlan.essenceCost}✨ ${fmt(upgradePlan.goldCost)}💰)`
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
                <Text style={styles.shardForgeDesc}>Refine excess scrap into essence or shards to keep forge progression flowing.</Text>
                <View style={styles.shardForgeRow}>
                  <Pressable
                    style={[styles.shardForgeBtn, state.equipmentScrap < shardForgeCosts.essenceRefineScrapCost && styles.shardForgeBtnDisabled]}
                    disabled={state.equipmentScrap < shardForgeCosts.essenceRefineScrapCost}
                    onPress={convertScrapToEssence}
                  >
                    <Text style={styles.shardForgeBtnText}>Essence • {shardForgeCosts.essenceRefineScrapCost} 🔩</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.shardForgeBtn, state.equipmentScrap < shardForgeCosts.shardRefineScrapCost && styles.shardForgeBtnDisabled]}
                    disabled={state.equipmentScrap < shardForgeCosts.shardRefineScrapCost}
                    onPress={convertScrapToShards}
                  >
                    <Text style={styles.shardForgeBtnText}>Shards • {shardForgeCosts.shardRefineScrapCost} 🔩</Text>
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
});
