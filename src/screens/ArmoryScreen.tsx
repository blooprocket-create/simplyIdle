import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Text, ScrollView } from 'react-native';
import { THEME, TYPOGRAPHY, SPACING, RADIUS } from '../theme';

interface EquipmentItem {
  id: string;
  name: string;
  slot: string;
  rarity: string;
  equipped: boolean;
}

interface ArmoryScreenProps {
  equipmentCount: number;
  gearScore: number;
  scrap: number;
  equippedItems: EquipmentItem[];
  availableItems: EquipmentItem[];
  onEquip: (itemId: string) => void;
  onCraft: (type: string) => void;
  onOptimize: () => void;
  onShowCraft: () => void;
}

export default function ArmoryScreen({
  equipmentCount,
  gearScore,
  scrap,
  equippedItems,
  availableItems,
  onEquip,
  onCraft,
  onOptimize,
  onShowCraft,
}: ArmoryScreenProps) {
  const [craftTab, setCraftTab] = useState<'craft' | 'forge'>('craft');

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      {/* Gear Score & Resources */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerStat}>
            <Text style={styles.headerLabel}>Gear Score</Text>
            <Text style={styles.headerValue}>{gearScore}</Text>
          </View>
          <View style={styles.headerStat}>
            <Text style={styles.headerLabel}>Equipment</Text>
            <Text style={styles.headerValue}>{equipmentCount}</Text>
          </View>
          <View style={styles.headerStat}>
            <Text style={styles.headerLabel}>Scrap</Text>
            <Text style={styles.headerValue}>{Math.floor(scrap)}</Text>
          </View>
        </View>
      </View>

      {/* Equipped Gear */}
      <View>
        <Text style={styles.sectionTitle}>⚔️ Equipped Gear</Text>
        <View style={styles.equippedList}>
          {equippedItems.length === 0 ? (
            <Text style={styles.emptyText}>No equipment equipped yet</Text>
          ) : (
            equippedItems.map(item => (
              <View key={item.id} style={styles.equipCard}>
                <View style={styles.equipCardLeft}>
                  <Text style={styles.equipSlot}>{item.slot}</Text>
                  <Text style={styles.equipName}>{item.name}</Text>
                  <Text style={[styles.equipRarity, { color: getRarityColor(item.rarity) }]}>
                    {item.rarity.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.equipCardRight}>
                  <Text style={styles.equippedBadge}>✓ Equipped</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </View>

      {/* Crafting Section */}
      <View style={styles.craftCard}>
        <Text style={styles.sectionTitle}>🔨 Crafting</Text>

        {/* Craft Tabs */}
        <View style={styles.craftTabs}>
          <Pressable
            style={[styles.craftTab, craftTab === 'craft' && styles.craftTabActive]}
            onPress={() => setCraftTab('craft')}
          >
            <Text style={[styles.craftTabText, craftTab === 'craft' && styles.craftTabTextActive]}>
              Craft New
            </Text>
          </Pressable>
          <Pressable
            style={[styles.craftTab, craftTab === 'forge' && styles.craftTabActive]}
            onPress={() => setCraftTab('forge')}
          >
            <Text style={[styles.craftTabText, craftTab === 'forge' && styles.craftTabTextActive]}>
              Forge (Upgrade)
            </Text>
          </Pressable>
        </View>

        {/* Craft Content */}
        {craftTab === 'craft' ? (
          <View style={styles.craftContent}>
            <Text style={styles.craftDesc}>Create new equipment from scrap materials.</Text>
            <Pressable style={styles.craftCategoryBtn} onPress={() => onCraft('helmet')}>
              <Text style={styles.craftCategoryBtnText}>🪖 Helm</Text>
            </Pressable>
            <Pressable style={styles.craftCategoryBtn} onPress={() => onCraft('chest')}>
              <Text style={styles.craftCategoryBtnText}>🛡️ Chest</Text>
            </Pressable>
            <Pressable style={styles.craftCategoryBtn} onPress={() => onCraft('weapon')}>
              <Text style={styles.craftCategoryBtnText}>⚔️ Weapon</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.craftContent}>
            <Text style={styles.craftDesc}>Upgrade equipment to increase rarity and stats.</Text>
            <Pressable style={styles.craftCategoryBtn} onPress={onShowCraft}>
              <Text style={styles.craftCategoryBtnText}>View Forge</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Available Items */}
      <View>
        <View style={styles.availableHeader}>
          <Text style={styles.sectionTitle}>📦 Available Gear</Text>
          <Pressable style={styles.optimizeBtn} onPress={onOptimize}>
            <Text style={styles.optimizeBtnText}>Optimize</Text>
          </Pressable>
        </View>

        <View style={styles.availableList}>
          {availableItems.length === 0 ? (
            <Text style={styles.emptyText}>No equipment available</Text>
          ) : (
            availableItems.map(item => (
              <Pressable
                key={item.id}
                style={styles.availableCard}
                onPress={() => onEquip(item.id)}
              >
                <View style={styles.availableCardLeft}>
                  <Text style={styles.equipSlot}>{item.slot}</Text>
                  <Text style={styles.equipName}>{item.name}</Text>
                  <Text style={[styles.equipRarity, { color: getRarityColor(item.rarity) }]}>
                    {item.rarity.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.equipAction}>→</Text>
              </Pressable>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const getRarityColor = (rarity: string): string => {
  const rarityMap: Record<string, string> = {
    common: THEME.text.secondary,
    rare: THEME.status.info,
    epic: THEME.status.epic,
    legendary: THEME.status.legendary,
    mythic: THEME.status.godly,
  };
  return rarityMap[rarity.toLowerCase()] || THEME.text.secondary;
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    gap: SPACING.lg,
    paddingBottom: SPACING.lg,
  },

  headerCard: {
    backgroundColor: THEME.card.highlight,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    padding: SPACING.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: SPACING.md,
  },
  headerStat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: THEME.card.default,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: THEME.surface.border,
  },
  headerLabel: {
    ...TYPOGRAPHY.label,
    color: THEME.text.secondary,
    marginBottom: 4,
  },
  headerValue: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.text.primary,
  },

  sectionTitle: {
    ...TYPOGRAPHY.section,
    color: THEME.text.primary,
    marginBottom: SPACING.md,
  },

  equippedList: {
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  equipCard: {
    backgroundColor: THEME.card.default,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: `${THEME.status.success}40`,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  equipCardLeft: {
    flex: 1,
  },
  equipSlot: {
    ...TYPOGRAPHY.label,
    color: THEME.text.secondary,
    marginBottom: 4,
  },
  equipName: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.text.primary,
    marginBottom: 2,
  },
  equipRarity: {
    fontSize: 10,
    fontWeight: '800',
  },
  equipCardRight: {
    alignItems: 'flex-end',
  },
  equippedBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.status.success,
  },

  craftCard: {
    backgroundColor: THEME.card.highlight,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    padding: SPACING.lg,
  },

  craftTabs: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  craftTab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    alignItems: 'center',
  },
  craftTabActive: {
    borderBottomColor: THEME.status.success,
  },
  craftTabText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.text.secondary,
  },
  craftTabTextActive: {
    color: THEME.status.success,
  },

  craftContent: {
    gap: SPACING.md,
  },
  craftDesc: {
    fontSize: 11,
    color: THEME.text.secondary,
  },
  craftCategoryBtn: {
    backgroundColor: THEME.status.info,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  craftCategoryBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000',
  },

  availableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  optimizeBtn: {
    backgroundColor: THEME.status.success,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  optimizeBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#000',
  },

  availableList: {
    gap: SPACING.md,
  },
  availableCard: {
    backgroundColor: THEME.card.default,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  availableCardLeft: {
    flex: 1,
  },
  equipAction: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.text.tertiary,
  },

  emptyText: {
    fontSize: 11,
    color: THEME.text.tertiary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: SPACING.lg,
  },
});
