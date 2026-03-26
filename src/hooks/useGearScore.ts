import { useMemo } from 'react';
import { getEquipmentItem } from '../gameConfig';

interface EquippedItem {
  id: string | null;
}

interface GameState {
  equippedItems: Record<string, string | null>;
  equipmentInventory: Record<string, Equipment>;
}

interface Equipment {
  id: string;
  name: string | null;
  rarity: string;
  bonus: Record<string, number | null>;
}

const GEAR_RARITY_POINTS: Record<string, number> = {
  common: 40,
  rare: 90,
  epic: 170,
  legendary: 280,
  mythic: 430,
  transcendent: 680,
};

export interface GearScoreRow {
  name: string;
  rarityPoints: number;
  statPoints: number;
  total: number;
}

export function useGearScore(state: GameState) {
  const equippedItemsForScore = useMemo(
    () => Object.values(state.equippedItems)
      .map(id => (id ? state.equipmentInventory[id] ?? getEquipmentItem(id) : null))
      .filter(Boolean) as Equipment[],
    [state.equippedItems, state.equipmentInventory],
  );

  const gearScore = useMemo(() => {
    return equippedItemsForScore.reduce((sum: number, item) => {
      if (!item) return sum;
      const statValue = Object.values(item.bonus).reduce((s: number, v) => s + (v ?? 0), 0);
      return sum + (GEAR_RARITY_POINTS[item.rarity] ?? 0) + statValue * 12;
    }, 0);
  }, [equippedItemsForScore]);

  const gearScoreRows = useMemo<GearScoreRow[]>(() => {
    return equippedItemsForScore
      .map(item => {
        if (!item) return null;
        const rarityPoints = GEAR_RARITY_POINTS[item.rarity] ?? 0;
        const statValue = Object.values(item.bonus).reduce((s: number, v) => s + (v ?? 0), 0);
        const statPoints = statValue * 12;
        return {
          name: item.name ?? item.id,
          rarityPoints,
          statPoints,
          total: rarityPoints + statPoints,
        };
      })
      .filter((row): row is GearScoreRow => !!row);
  }, [equippedItemsForScore]);

  return { gearScore, gearScoreRows };
}
