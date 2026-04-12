import { StyleSheet } from 'react-native';
import { theme } from '../../theme/colors';

export const styles = StyleSheet.create({
  equipmentTab: {
    gap: 12,
  },

  // ── Header / Optimize ────────────────────────────────────
  equipHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  equipInventoryCount: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  scrapLabel: {
    fontSize: 12,
    color: '#B6D6FF',
    marginBottom: 8,
  },
  uniqueArmorySummary: {
    fontSize: 11,
    color: '#F6D38A',
    marginBottom: 8,
  },
  mythicTierLabel: {
    fontSize: 11,
    color: '#FF7EA1',
    marginBottom: 8,
  },
  equipOptimizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  equipOptimizeBtn: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#5FA870',
    backgroundColor: '#1E3D2C',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  equipOptimizeBtnText: {
    fontSize: 10,
    color: '#AFFFCA',
    fontWeight: '700',
  },
  equipDismantleBtn: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A86C5F',
    backgroundColor: '#3A251E',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  equipDismantleBtnText: {
    fontSize: 10,
    color: '#FFD1C5',
    fontWeight: '700',
  },
  equipOptimizeHint: {
    fontSize: 10,
    color: '#6FA880',
    fontStyle: 'italic',
  },

  // ── Crafting ─────────────────────────────────────────────
  craftRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  craftBtn: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#6e86a8',
    backgroundColor: '#233147',
    paddingVertical: 8,
    alignItems: 'center',
  },
  craftBtnDisabled: {
    opacity: 0.45,
  },
  craftBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EAF2FF',
  },
  craftCostText: {
    fontSize: 10,
    color: '#A8C2E9',
    marginTop: 2,
  },

  // ── Unique Armory ────────────────────────────────────────
  uniqueArmoryHeaderCard: {
    backgroundColor: '#161927',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#635330',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  uniqueArmoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FCE2A0',
    marginBottom: 4,
  },
  uniqueArmoryHelper: {
    fontSize: 11,
    lineHeight: 16,
    color: '#CDBD92',
  },
  uniqueArmoryCard: {
    backgroundColor: '#13161F',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3C465D',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  uniqueArmoryCardEquipped: {
    borderColor: '#D6B467',
    backgroundColor: '#1B1A13',
  },
  uniqueArmoryCardLocked: {
    borderColor: '#2F3645',
    backgroundColor: '#10131A',
    opacity: 0.9,
  },
  uniqueArmoryCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  uniqueArmoryIdentityBlock: {
    flex: 1,
    gap: 2,
  },
  uniqueArmoryHeroName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F4F7FF',
  },
  uniqueArmoryWeaponName: {
    fontSize: 12,
    color: '#F6D38A',
    fontWeight: '600',
  },
  uniqueArmoryMeta: {
    fontSize: 10,
    color: '#AAB6CF',
    fontWeight: '600',
  },
  uniqueArmoryStatePill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
  },
  uniqueArmoryStatePillEquipped: {
    backgroundColor: '#3F3315',
    borderColor: '#D6B467',
  },
  uniqueArmoryStatePillStored: {
    backgroundColor: '#1B2333',
    borderColor: '#51647F',
  },
  uniqueArmoryStatePillLocked: {
    backgroundColor: '#181B24',
    borderColor: '#4E5566',
  },
  uniqueArmoryStateText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F3F4F7',
  },
  uniqueArmorySkill: {
    fontSize: 11,
    lineHeight: 16,
    color: '#8ED0FF',
    marginBottom: 6,
  },
  uniqueArmoryLore: {
    fontSize: 11,
    lineHeight: 16,
    color: '#C5CDE0',
    marginBottom: 6,
  },
  uniqueArmoryLockText: {
    color: '#A8B0C2',
  },
  uniqueArmoryRule: {
    fontSize: 10,
    color: '#F1B980',
    marginBottom: 10,
    fontWeight: '600',
  },
  uniqueArmoryToggleBtn: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D6B467',
    backgroundColor: '#2E2716',
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  uniqueArmoryToggleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FCE2A0',
  },

  // ── Inventory Cards ──────────────────────────────────────
  invEquipCard: {
    flexDirection: 'row',
    backgroundColor: theme.bg.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A2A4A',
    marginBottom: 8,
    overflow: 'hidden',
  },
  invEquipCardEquipped: {
    borderColor: theme.status.positive,
    backgroundColor: '#1a2a20',
  },
  invEquipRarity: {
    width: 4,
  },
  invEquipContent: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  invEquipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  invEquipName: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.text.primary,
  },
  invEquipRarity2: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  invEquipSlot: {
    fontSize: 10,
    color: '#AAA',
    marginBottom: 4,
    fontWeight: '600',
  },
  invEquipBonus: {
    fontSize: 11,
    color: theme.status.positive,
    marginBottom: 4,
  },
  invEquipActive: {
    fontSize: 10,
    color: theme.status.positive,
    fontWeight: '700',
  },
  equipActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  equipNowBtn: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 4,
    backgroundColor: '#2E5A38',
    borderWidth: 1,
    borderColor: '#6DBB83',
  },
  equipNowBtnText: {
    fontSize: 10,
    color: '#DFFFE8',
    fontWeight: '700',
  },

  // ── Compare ──────────────────────────────────────────────
  compareBtn: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#4A6A9A',
    backgroundColor: '#152B48',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  compareBtnText: {
    fontSize: 10,
    color: '#C5DEFF',
    fontWeight: '700',
  },
  comparePanel: {
    backgroundColor: '#0C1B2C',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2E4F70',
    padding: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  comparePanelTitle: {
    fontSize: 10,
    color: '#A8C8E8',
    fontWeight: '700',
    marginBottom: 6,
  },
  compareStatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  compareStat: {
    fontSize: 10,
    fontWeight: '700',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: '#182A3E',
  },
  compareStatUp: {
    color: '#7DFF9A',
  },
  compareStatDown: {
    color: '#FF7D7D',
  },
  compareStatNeutral: {
    color: '#A0BAD0',
  },

  // ── Upgrade / Dismantle ──────────────────────────────────
  upgradeGearBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#294353',
    borderWidth: 1,
    borderColor: '#5b97c0',
  },
  upgradeGearBtnDisabled: {
    opacity: 0.45,
  },
  upgradeGearBtnText: {
    color: '#d8edff',
    fontSize: 10,
    fontWeight: '700',
  },
  dismantleBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#4a2f2f',
    borderWidth: 1,
    borderColor: '#b46464',
  },
  dismantleBtnText: {
    color: '#ffd6d6',
    fontSize: 10,
    fontWeight: '700',
  },

  // ── Shard Forge ──────────────────────────────────────────
  shardForgeCard: {
    marginBottom: 8,
    backgroundColor: '#1B2132',
    borderWidth: 1,
    borderColor: '#394971',
    borderRadius: 6,
    padding: 8,
  },
  shardForgeTitle: {
    fontSize: 11,
    color: '#DCE8FF',
    fontWeight: '700',
    marginBottom: 4,
  },
  shardForgeDesc: {
    fontSize: 10,
    color: '#A4B6D8',
    marginBottom: 6,
  },
  shardForgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  shardForgeBtn: {
    flex: 1,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#6382B4',
    backgroundColor: '#253957',
    paddingVertical: 7,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  shardForgeBtnDisabled: {
    opacity: 0.45,
  },
  shardForgeBtnText: {
    fontSize: 10,
    color: '#E3EEFF',
    fontWeight: '700',
  },

  // ── Shared ───────────────────────────────────────────────
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text.primary,
    marginBottom: 8,
  },
  sectionHelperText: {
    fontSize: 10,
    color: '#98b2c8',
    marginBottom: 8,
  },
  emptyMsg: {
    fontSize: 12,
    color: '#777',
    fontStyle: 'italic',
  },
});
