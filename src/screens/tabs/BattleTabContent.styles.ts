import { StyleSheet } from 'react-native';
import { theme } from '../../theme/colors';

export const styles = StyleSheet.create({
  battleTab: {
    gap: 12,
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
  emptyMsg: {
    fontSize: 12,
    color: '#777',
    fontStyle: 'italic',
  },
  combatLogLine: {
    fontSize: 10,
    color: '#B3C2DA',
    marginBottom: 4,
    lineHeight: 14,
  },

  // ── Tempo Card ───────────────────────────────────────────
  battleTempoCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#5C6F87',
    backgroundColor: '#172432',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  battleTempoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  battleTempoTitle: {
    fontSize: 11,
    color: '#D9ECFF',
    fontWeight: '700',
  },
  battleTempoHint: {
    fontSize: 10,
    color: '#95B4CF',
  },
  battleTempoRow: {
    flexDirection: 'row',
    gap: 6,
  },
  battleTempoBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#536B86',
    backgroundColor: '#22364C',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  battleTempoBtnActive: {
    borderColor: '#8FD2FF',
    backgroundColor: '#2F5275',
  },
  battleTempoBtnLocked: {
    opacity: 0.45,
  },
  battleTempoBtnText: {
    fontSize: 10,
    color: '#BFD7EC',
    fontWeight: '700',
  },
  battleTempoBtnTextActive: {
    color: '#EDFAFF',
  },

  // ── Heat / Coolant ───────────────────────────────────────
  heatStoreRow: {
    flexDirection: 'row',
    gap: 6,
  },
  heatStoreBtn: {
    flex: 1,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#6FA6E0',
    backgroundColor: '#1E3956',
    paddingVertical: 6,
    alignItems: 'center',
  },
  heatUseBtn: {
    flex: 1,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#7BBE9B',
    backgroundColor: '#1E4D3B',
    paddingVertical: 6,
    alignItems: 'center',
  },
  heatStoreBtnDisabled: {
    opacity: 0.45,
  },
  heatStoreBtnText: {
    fontSize: 10,
    color: '#EAF3FF',
    fontWeight: '700',
  },

  // ── Burst ────────────────────────────────────────────────
  burstRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  burstInfo: {
    flex: 1,
  },
  burstTitle: {
    fontSize: 10,
    color: '#FFDFA8',
    fontWeight: '700',
  },
  burstSub: {
    fontSize: 10,
    color: '#A7BDD4',
  },
  burstHint: {
    fontSize: 10,
    color: '#E4CFA8',
  },
  burstBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#D18F45',
    backgroundColor: '#6C4323',
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  burstBtnDisabled: {
    opacity: 0.45,
  },
  burstBtnText: {
    fontSize: 10,
    color: '#FFECD0',
    fontWeight: '800',
  },

  // ── Battle Section / Heroes ──────────────────────────────
  battleSection: {
    backgroundColor: '#121C29',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2C4156',
  },
  battleSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.status.positive,
    marginBottom: 8,
  },
  battleHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: '#0A0A18',
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 4,
    gap: 8,
  },
  battleHeroSlot: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.text.warning,
    minWidth: 25,
  },
  battleHeroInfo: {
    flex: 1,
    fontSize: 11,
    color: theme.text.primary,
  },
  battleHeroStats: {
    fontSize: 10,
    color: '#AAA',
  },
  battleHeroDps: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.status.positive,
    minWidth: 55,
    textAlign: 'right',
  },

  // ── Usables / Items ──────────────────────────────────────
  usableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0A0A18',
    borderWidth: 1,
    borderColor: '#2A2A4A',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  usableInfo: {
    flex: 1,
  },
  usableName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EDEDED',
    marginBottom: 2,
  },
  usableDesc: {
    fontSize: 10,
    color: '#99A3B2',
  },
  usableActionsCol: {
    gap: 6,
    alignItems: 'stretch',
  },
  useItemBtn: {
    backgroundColor: '#355a3b',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  useItemBtnSecondary: {
    backgroundColor: '#3D4A6A',
  },
  useItemBtnText: {
    fontSize: 11,
    color: '#C7FFD2',
    fontWeight: '700',
    textAlign: 'center',
  },

  // ── Warnings ─────────────────────────────────────────────
  warningBox: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#3a2a1a',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: theme.text.warning,
  },
  warningText: {
    fontSize: 12,
    color: theme.text.warning,
    lineHeight: 18,
  },
});
