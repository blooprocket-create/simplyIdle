import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { GameState, Stats } from '../../useGameState';
import {
  EquipmentSlot,
  EquipmentRarity,
  getHeroBackstory,
  getHeroUniqueEffectFamilyLabel,
  getHeroUniqueSkillDescription,
  getHeroUniqueWeaponName,
  RARITIES,
} from '../../gameConfig';
import { fmt } from '../../utils';
import { styles } from './EquipmentTabContent.styles';
import { t } from '../../i18n';

const GEAR_RARITY_POINTS: Record<string, number> = {
  common: 40,
  rare: 90,
  epic: 170,
  legendary: 280,
  mythic: 430,
  transcendent: 680,
};

const GEAR_INVENTORY_PAGE_SIZE = 30;

interface EquipmentRarityView {
  color: string;
}

interface EquipmentCraftCost {
  scrap: number;
  gold: number;
}

interface EquipmentUpgradePlan {
  canUpgrade: boolean;
  targetItemId: string | null;
  targetRarity: string | null;
  scrapCost: number;
  essenceCost: number;
  goldCost: number;
}

interface EquipmentViewItem {
  id: string;
  name: string;
  emoji: string;
  rarity: EquipmentRarity;
  slot: EquipmentSlot;
  itemLevel?: number;
  bonus: Record<string, number | null | undefined>;
}

interface ShardForgeCosts {
  essenceRefineScrapCost: number;
  shardRefineScrapCost: number;
}

interface EquipmentSubTabItem {
  id: string;
  label: string;
  active: boolean;
  onPress: () => void;
  notificationCount?: number;
}

function itemGearScore(item: { rarity: string; bonus: Record<string, number | null | undefined> }): number {
  const statValue = Object.values(item.bonus).reduce<number>((s, v) => s + (v ?? 0), 0);
  return (GEAR_RARITY_POINTS[item.rarity] ?? 0) + statValue * 12;
}

export interface EquipmentTabContentProps {
  tab: string;
  state: GameState;
  stats: Stats;
  equipmentSubTab: string;
  setEquipmentSubTab: (tab: 'inventory' | 'craft' | 'forge' | 'armory') => void;
  compareItemId: string | null;
  setCompareItemId: (id: string | null) => void;
  shardForgeCosts: ShardForgeCosts;
  getEquipmentCraftCost: (slot: EquipmentSlot) => EquipmentCraftCost;
  getEquipmentItem: (itemId: string) => EquipmentViewItem | null;
  getUpgradePlan: (itemId: string) => EquipmentUpgradePlan;
  equipmentRarityConfig: (rarity: EquipmentRarity) => EquipmentRarityView;
  optimizeEquipment: () => void;
  autoDismantleEquipment: () => void;
  setAutoDismantleRarityFloor: (rarity: EquipmentRarity) => void;
  setAutoDismantleEnabled: (enabled: boolean) => void;
  gearInventoryCap: number;
  craftEquipment: (slot: EquipmentSlot) => void;
  equipItem: (itemId: string) => void;
  toggleHeroUniqueWeapon: (heroUid: string) => void;
  upgradeEquipmentRarity: (itemId: string) => void;
  dismantleEquipment: (itemId: string) => void;
  convertScrapToEssence: (count?: number) => void;
  convertScrapToShards: (count?: number) => void;
  renderSubTabBar: (tabs: EquipmentSubTabItem[]) => React.ReactNode;
}

export const EquipmentTabContent = React.memo<EquipmentTabContentProps>(
  ({
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
    setAutoDismantleRarityFloor,
    setAutoDismantleEnabled,
    gearInventoryCap,
    craftEquipment,
    equipItem,
    toggleHeroUniqueWeapon,
    upgradeEquipmentRarity,
    dismantleEquipment,
    convertScrapToEssence,
    convertScrapToShards,
    renderSubTabBar,
  }) => {
    const [visibleCount, setVisibleCount] = useState(GEAR_INVENTORY_PAGE_SIZE);
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
    const equippedUniqueCount = uniqueArmoryEntries.filter(
      entry => entry.uniqueEquipped && entry.uniqueRank > 0,
    ).length;

    return (
      <>
        {tab === 'equipment' && (
          <View style={styles.equipmentTab}>
            <View style={styles.equipHeaderRow}>
              <Text style={styles.sectionTitle}>🎒 Equipment Inventory</Text>
            </View>
            {renderSubTabBar(
              (['inventory', 'armory', 'craft', 'forge'] as const).map(st => ({
                id: st,
                label:
                  st === 'inventory'
                    ? t('equipment.inventory')
                    : st === 'armory'
                      ? t('equipment.armory')
                      : st === 'craft'
                        ? t('equipment.crafting')
                        : t('equipment.forge'),
                active: equipmentSubTab === st,
                onPress: () => setEquipmentSubTab(st),
              })),
            )}
            <Text style={styles.equipInventoryCount}>
              Total: {state.inventoryItemIds.length}/{gearInventoryCap} items • Shards:{' '}
              <Text style={{ color: '#FFB347' }}>{state.heroShards}</Text>
            </Text>
            {state.inventoryItemIds.length >= gearInventoryCap && (
              <Text style={{ color: '#FF6B6B', fontSize: 12, fontWeight: '600', marginTop: 2 }}>
                ⚠ Inventory full! New drops are blocked. Dismantle or enable auto-dismantle.
              </Text>
            )}
            {state.inventoryItemIds.length >= gearInventoryCap * 0.9 &&
              state.inventoryItemIds.length < gearInventoryCap && (
                <Text style={{ color: '#FFB347', fontSize: 11, marginTop: 2 }}>
                  Inventory nearly full — consider dismantling low-tier gear.
                </Text>
              )}
            <Text style={styles.scrapLabel}>🔩 Scrap: {fmt(state.equipmentScrap)}</Text>
            <Text style={styles.uniqueArmorySummary}>
              🗃️ Unique Armory: {forgedUniqueCount} forged • {equippedUniqueCount} equipped • Stored separately from
              normal drops
            </Text>
            <Text style={styles.mythicTierLabel}>
              Mythic Tier:{' '}
              {state.permanentUnlocks.includes('mythic_equipment')
                ? t('equipment.mythicUnlocked')
                : t('equipment.mythicLocked')}
            </Text>
            {equipmentSubTab === 'inventory' && (
              <View style={styles.equipOptimizeRow}>
                <Pressable
                  style={styles.equipOptimizeBtn}
                  onPress={optimizeEquipment}
                  accessibilityRole="button"
                  accessibilityLabel={t('equipment.optimizeA11y')}
                >
                  <Text style={styles.equipOptimizeBtnText}>⚡ Optimize Gear</Text>
                </Pressable>
                <Pressable
                  style={styles.equipDismantleBtn}
                  onPress={autoDismantleEquipment}
                  accessibilityRole="button"
                  accessibilityLabel={t('equipment.dismantleA11y')}
                >
                  <Text style={styles.equipDismantleBtnText}>🧰 Auto Dismantle</Text>
                </Pressable>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Text style={styles.equipOptimizeHint}>Dismantle floor:</Text>
                  {(['common', 'rare', 'epic', 'legendary', 'mythic', 'transcendent'] as EquipmentRarity[]).map(r => {
                    const isActive = r === (state.autoDismantleRarityFloor ?? 'common');
                    const cfg = equipmentRarityConfig(r);
                    return (
                      <Pressable
                        key={r}
                        style={{
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 4,
                          borderWidth: 1,
                          borderColor: isActive ? cfg.color : '#444',
                          backgroundColor: isActive ? cfg.color + '33' : 'transparent',
                        }}
                        onPress={() => setAutoDismantleRarityFloor(r)}
                      >
                        <Text style={{ color: cfg.color, fontSize: 10, fontWeight: isActive ? '700' : '400' }}>
                          {r.slice(0, 3).toUpperCase()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.equipOptimizeHint}>
                  Auto dismantle scraps unequipped items at or below the selected rarity.
                </Text>
                <Pressable
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 6,
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: state.autoDismantleEnabled ? '#4CAF50' : '#555',
                    backgroundColor: state.autoDismantleEnabled ? '#4CAF5022' : 'transparent',
                  }}
                  onPress={() => setAutoDismantleEnabled(!state.autoDismantleEnabled)}
                  accessibilityRole="switch"
                  accessibilityLabel="Toggle automatic gear dismantle"
                >
                  <Text
                    style={{ color: state.autoDismantleEnabled ? '#4CAF50' : '#888', fontSize: 12, fontWeight: '600' }}
                  >
                    {state.autoDismantleEnabled ? '✓ Auto Dismantle ON' : '○ Auto Dismantle OFF'}
                  </Text>
                </Pressable>
                <Text style={styles.equipOptimizeHint}>
                  When enabled, gear at or below the dismantle floor is scrapped automatically each combat tick.
                </Text>
              </View>
            )}
            {equipmentSubTab === 'craft' && (
              <>
                {state.inventoryItemIds.length >= gearInventoryCap && (
                  <Text style={{ color: '#FF6B6B', fontSize: 12, marginBottom: 6, textAlign: 'center' }}>
                    Inventory full ({gearInventoryCap}/{gearInventoryCap}). Dismantle items to craft more.
                  </Text>
                )}
                <View style={styles.craftRow}>
                  {(['weapon', 'armor', 'accessory'] as EquipmentSlot[]).map(slot => {
                    const cost = getEquipmentCraftCost(slot);
                    const atCap = state.inventoryItemIds.length >= gearInventoryCap;
                    const canCraft = state.equipmentScrap >= cost.scrap && state.gold >= cost.gold && !atCap;
                    return (
                      <Pressable
                        key={slot}
                        style={[styles.craftBtn, !canCraft && styles.craftBtnDisabled]}
                        disabled={!canCraft}
                        onPress={() => craftEquipment(slot)}
                        accessibilityRole="button"
                        accessibilityLabel={t('equipment.craftA11y', {
                          slot,
                          suffix: !canCraft ? ', insufficient resources' : '',
                        })}
                      >
                        <Text style={styles.craftBtnText}>{slot.toUpperCase()}</Text>
                        <Text style={styles.craftCostText}>
                          {cost.scrap}🔩 • {fmt(cost.gold)}g
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
            {equipmentSubTab === 'armory' && (
              <>
                <View style={styles.uniqueArmoryHeaderCard}>
                  <Text style={styles.uniqueArmoryTitle}>Hero Unique Armory</Text>
                  <Text style={styles.uniqueArmoryHelper}>
                    Each unique weapon is hero-bound, lore-linked, and cannot enter the normal dismantle loop.
                  </Text>
                </View>
                {uniqueArmoryEntries.length === 0 ? (
                  <Text style={styles.emptyMsg}>
                    Summon heroes to start building the armory. Owned heroes appear here even before their unique weapon
                    is forged.
                  </Text>
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
                      <View
                        key={hero.id}
                        style={[
                          styles.uniqueArmoryCard,
                          uniqueEquipped && styles.uniqueArmoryCardEquipped,
                          isLocked && styles.uniqueArmoryCardLocked,
                        ]}
                      >
                        <View style={styles.uniqueArmoryCardTop}>
                          <View style={styles.uniqueArmoryIdentityBlock}>
                            <Text style={styles.uniqueArmoryHeroName}>
                              {hero.emoji} {hero.name}
                            </Text>
                            <Text style={styles.uniqueArmoryWeaponName}>{uniqueWeaponName}</Text>
                            <Text style={styles.uniqueArmoryMeta}>
                              {hero.heroClass.toUpperCase()} • {hero.rarity.toUpperCase()} • {uniqueDoctrine}
                            </Text>
                            <Text style={styles.uniqueArmoryMeta}>
                              {isLocked ? 'UNFORGED' : `Rank ${uniqueRank}/10`}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.uniqueArmoryStatePill,
                              isLocked
                                ? styles.uniqueArmoryStatePillLocked
                                : uniqueEquipped
                                  ? styles.uniqueArmoryStatePillEquipped
                                  : styles.uniqueArmoryStatePillStored,
                            ]}
                          >
                            <Text style={styles.uniqueArmoryStateText}>
                              {isLocked ? 'LOCKED' : uniqueEquipped ? 'EQUIPPED' : 'STORED'}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.uniqueArmorySkill, isLocked && styles.uniqueArmoryLockText]}>
                          {uniqueSkillText}
                        </Text>
                        {!isLocked && (
                          <Text style={styles.uniqueArmoryRule}>
                            {uniqueEquipped ? `Equipped by: ${bearerLabel}` : `Stored for bearer: ${bearerLabel}`}
                          </Text>
                        )}
                        {copyCount > 1 && (
                          <Text style={styles.uniqueArmoryRule}>
                            Duplicate copies owned: {copyCount}. Highest-priority copy is selected automatically.
                          </Text>
                        )}
                        <Text style={styles.uniqueArmoryLore}>{getHeroBackstory(hero.id)}</Text>
                        <Text style={styles.uniqueArmoryRule}>Only {hero.name} can wield this weapon.</Text>
                        {!isLocked && (
                          <Pressable
                            style={styles.uniqueArmoryToggleBtn}
                            onPress={() => toggleHeroUniqueWeapon(bearer.uid)}
                          >
                            <Text style={styles.uniqueArmoryToggleBtnText}>
                              {uniqueEquipped ? 'Unequip Unique Weapon' : 'Equip Unique Weapon'}
                            </Text>
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
              <>
                {state.inventoryItemIds.slice(0, visibleCount).map(itemId => {
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
                          <Text style={styles.invEquipName}>
                            {item.emoji} {item.name}
                          </Text>
                          <Text style={[styles.invEquipRarity2, { color: rarity.color }]}>{item.rarity}</Text>
                        </View>
                        <Text style={styles.invEquipSlot}>
                          {item.slot.toUpperCase()} • iLv {item.itemLevel ?? 1} • GS {fmt(itemGearScore(item))}
                        </Text>
                        <Text style={styles.invEquipBonus}>
                          {Object.entries(item.bonus)
                            .filter(([_, v]) => v)
                            .map(
                              ([k, v]) =>
                                `+${v} ${k === 'strength' ? 'STR' : k === 'vitality' ? 'VIT' : k === 'agility' ? 'AGI' : k === 'intelligence' ? 'INT' : 'SPR'}`,
                            )
                            .join(' • ')}
                        </Text>
                        {isEquipped && <Text style={styles.invEquipActive}>✓ Equipped</Text>}
                        <View style={styles.equipActionRow}>
                          {!isEquipped && (
                            <>
                              <Pressable style={styles.equipNowBtn} onPress={() => equipItem(item.id)}>
                                <Text style={styles.equipNowBtnText}>Equip</Text>
                              </Pressable>
                              <Pressable
                                style={styles.compareBtn}
                                onPress={() => setCompareItemId(compareItemId === item.id ? null : item.id)}
                              >
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
                        {!isEquipped &&
                          compareItemId === item.id &&
                          (() => {
                            const curId = state.equippedItems[item.slot as EquipmentSlot];
                            const curItem = curId ? getEquipmentItem(curId) : null;
                            const allStats = ['strength', 'vitality', 'agility', 'intelligence', 'spirit'] as const;
                            return (
                              <View style={styles.comparePanel}>
                                <Text style={styles.comparePanelTitle}>
                                  vs Current: {curItem ? `${curItem.name} (${curItem.rarity})` : 'Empty slot'}
                                </Text>
                                <View style={styles.compareStatRow}>
                                  {allStats.map(stat => {
                                    const nv = item.bonus[stat] ?? 0;
                                    const cv = curItem?.bonus[stat] ?? 0;
                                    const diff = nv - cv;
                                    if (nv === 0 && cv === 0) return null;
                                    return (
                                      <Text
                                        key={stat}
                                        style={[
                                          styles.compareStat,
                                          diff > 0
                                            ? styles.compareStatUp
                                            : diff < 0
                                              ? styles.compareStatDown
                                              : styles.compareStatNeutral,
                                        ]}
                                      >
                                        {stat.slice(0, 3).toUpperCase()}: {diff >= 0 ? '+' : ''}
                                        {diff}
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
                })}
                {state.inventoryItemIds.length > visibleCount && (
                  <Pressable
                    style={{
                      alignSelf: 'center',
                      paddingVertical: 10,
                      paddingHorizontal: 24,
                      marginVertical: 8,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: '#666',
                      backgroundColor: '#1a1a2e',
                    }}
                    onPress={() => setVisibleCount(prev => prev + GEAR_INVENTORY_PAGE_SIZE)}
                  >
                    <Text style={{ color: '#ccc', fontSize: 13 }}>
                      Show More ({state.inventoryItemIds.length - visibleCount} remaining)
                    </Text>
                  </Pressable>
                )}
              </>
            ) : equipmentSubTab === 'forge' ? (
              <>
                <View style={styles.shardForgeCard}>
                  <Text style={styles.shardForgeTitle}>Shard Forge</Text>
                  <Text style={styles.shardForgeDesc}>
                    Refine excess scrap into essence or shards to keep forge progression flowing.
                  </Text>
                  {/* Essence conversion */}
                  <View style={styles.shardForgeRow}>
                    <Pressable
                      style={[
                        styles.shardForgeBtn,
                        state.equipmentScrap < shardForgeCosts.essenceRefineScrapCost && styles.shardForgeBtnDisabled,
                      ]}
                      disabled={state.equipmentScrap < shardForgeCosts.essenceRefineScrapCost}
                      onPress={() => convertScrapToEssence(1)}
                    >
                      <Text style={styles.shardForgeBtnText}>
                        ×1 Essence • {shardForgeCosts.essenceRefineScrapCost} 🔩
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.shardForgeBtn,
                        state.equipmentScrap < shardForgeCosts.essenceRefineScrapCost * 5 &&
                          styles.shardForgeBtnDisabled,
                      ]}
                      disabled={state.equipmentScrap < shardForgeCosts.essenceRefineScrapCost * 5}
                      onPress={() => convertScrapToEssence(5)}
                    >
                      <Text style={styles.shardForgeBtnText}>×5</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.shardForgeBtn,
                        state.equipmentScrap < shardForgeCosts.essenceRefineScrapCost && styles.shardForgeBtnDisabled,
                      ]}
                      disabled={state.equipmentScrap < shardForgeCosts.essenceRefineScrapCost}
                      onPress={() =>
                        convertScrapToEssence(Math.floor(state.equipmentScrap / shardForgeCosts.essenceRefineScrapCost))
                      }
                    >
                      <Text style={styles.shardForgeBtnText}>MAX</Text>
                    </Pressable>
                  </View>
                  {/* Shard conversion */}
                  <View style={styles.shardForgeRow}>
                    <Pressable
                      style={[
                        styles.shardForgeBtn,
                        state.equipmentScrap < shardForgeCosts.shardRefineScrapCost && styles.shardForgeBtnDisabled,
                      ]}
                      disabled={state.equipmentScrap < shardForgeCosts.shardRefineScrapCost}
                      onPress={() => convertScrapToShards(1)}
                    >
                      <Text style={styles.shardForgeBtnText}>
                        ×1 Shards • {shardForgeCosts.shardRefineScrapCost} 🔩
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.shardForgeBtn,
                        state.equipmentScrap < shardForgeCosts.shardRefineScrapCost * 5 && styles.shardForgeBtnDisabled,
                      ]}
                      disabled={state.equipmentScrap < shardForgeCosts.shardRefineScrapCost * 5}
                      onPress={() => convertScrapToShards(5)}
                    >
                      <Text style={styles.shardForgeBtnText}>×5</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.shardForgeBtn,
                        state.equipmentScrap < shardForgeCosts.shardRefineScrapCost && styles.shardForgeBtnDisabled,
                      ]}
                      disabled={state.equipmentScrap < shardForgeCosts.shardRefineScrapCost}
                      onPress={() =>
                        convertScrapToShards(Math.floor(state.equipmentScrap / shardForgeCosts.shardRefineScrapCost))
                      }
                    >
                      <Text style={styles.shardForgeBtnText}>MAX</Text>
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
  },
);
