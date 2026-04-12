import { StyleSheet } from 'react-native';
import { theme } from '../../theme/colors';

export const styles = StyleSheet.create({
  statsTab: {
    gap: 16,
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
  hpBarBg: {
    flex: 1,
    height: 18,
    backgroundColor: '#2A2A4A',
    borderRadius: 4,
    overflow: 'hidden',
  },
  hpBarFill: {
    height: '100%',
    borderRadius: 4,
  },

  // ── Stat Allocation ──────────────────────────────────────
  unspentLabel: {
    fontSize: 12,
    color: '#AAA',
    marginBottom: 8,
  },
  unspentCount: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.text.warning,
  },
  statsGrid: {
    gap: 8,
  },
  statRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: theme.bg.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A2A4A',
  },
  statRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  statLabel: {
    flex: 1,
  },
  statAbr: {
    fontSize: 10,
    color: '#777',
    fontWeight: '700',
  },
  statTotalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 2,
  },
  statTotalLabel: {
    fontSize: 11,
    color: '#92A3C4',
    fontWeight: '700',
  },
  statTotalValue: {
    fontSize: 13,
    color: '#F0F6FF',
    fontWeight: '800',
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text.primary,
    marginTop: 2,
  },
  statGearValue: {
    fontSize: 11,
    color: '#8BC6FF',
    fontWeight: '600',
  },
  statDesc: {
    fontSize: 11,
    color: '#9090B8',
    lineHeight: 16,
  },
  statBtnGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  statBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#4A4A7A',
    borderRadius: 4,
  },
  statBtnMax: {
    backgroundColor: '#355a3b',
  },
  statBtnDisabled: {
    opacity: 0.5,
  },
  statBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.text.primary,
  },

  // ── Hero Boost ───────────────────────────────────────────
  heroBoostBox: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: theme.bg.card,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: theme.text.warning,
  },
  heroBoostLabel: {
    fontSize: 11,
    color: '#AAA',
    marginBottom: 4,
  },
  heroBoostValue: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text.warning,
  },

  // ── Meta / Essence Progression ───────────────────────────
  metaBox: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#16172A',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#303564',
    gap: 8,
  },
  metaEssence: {
    fontSize: 12,
    color: '#FFB68D',
    fontWeight: '700',
  },
  passiveBanner: {
    backgroundColor: '#0E1120',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A335A',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  passiveTitle: {
    fontSize: 11,
    color: '#DCE6FF',
    fontWeight: '700',
    marginBottom: 2,
  },
  passiveDesc: {
    fontSize: 10,
    color: '#9CB0D4',
    marginBottom: 4,
  },
  passiveState: {
    fontSize: 10,
    color: '#8bd39e',
    fontWeight: '700',
  },
  metaUpgradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F1120',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2C3158',
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  metaUpgradeInfo: {
    flex: 1,
  },
  metaUpgradeName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E6EDFF',
    marginBottom: 2,
  },
  metaUpgradeDesc: {
    fontSize: 10,
    color: '#9FB0D3',
  },
  metaUpgradeBtn: {
    borderRadius: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#2f6d4f',
    borderWidth: 1,
    borderColor: '#5ea97b',
  },
  metaUpgradeBtnDisabled: {
    opacity: 0.45,
  },
  metaUpgradeBtnText: {
    fontSize: 11,
    color: '#D6FFE7',
    fontWeight: '700',
  },

  // ── Rebirth Tree ─────────────────────────────────────────
  rebirthTreeCard: {
    marginTop: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4A3664',
    backgroundColor: '#191227',
    padding: 8,
    gap: 6,
  },
  rebirthTreeTitle: {
    fontSize: 11,
    color: '#E9D6FF',
    fontWeight: '700',
  },
  rebirthTreeCores: {
    fontSize: 10,
    color: '#D9B6FF',
    fontWeight: '700',
  },

  // ── Equipment Summary ────────────────────────────────────
  equipmentBox: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: theme.bg.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A2A4A',
    gap: 8,
  },
  equipmentDesc: {
    fontSize: 11,
    color: '#999',
    marginTop: -4,
  },
  equipmentBonusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  equipmentBonusText: {
    fontSize: 10,
    color: '#AAB4D1',
  },

  // ── Class Mastery ────────────────────────────────────────
  masteryCard: {
    backgroundColor: '#111D2C',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2E4A6A',
    padding: 12,
    marginTop: 10,
  },
  masteryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C8E6FF',
    marginBottom: 4,
  },
  masteryLevel: {
    fontSize: 11,
    color: '#A5C8E0',
    marginBottom: 6,
  },
  masteryLevelSub: {
    fontSize: 10,
    color: '#6A90B0',
    fontStyle: 'italic',
  },
  masteryHint: {
    fontSize: 10,
    color: '#7BA0BC',
    marginBottom: 8,
    marginTop: 4,
  },
  masteryMilestoneRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: '#1E324A',
  },
  masteryMilestoneCheck: {
    fontSize: 12,
    color: '#6A90B0',
    paddingTop: 2,
    minWidth: 18,
  },
  masteryMilestoneDone: {
    color: '#7DFF9A',
  },
  masteryMilestoneLvl: {
    fontSize: 10,
    color: '#FFD98A',
    fontWeight: '700',
  },
  masteryMilestonePerk: {
    fontSize: 10,
    color: '#9ABCD8',
  },
});
