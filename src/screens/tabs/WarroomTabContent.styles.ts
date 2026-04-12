import { StyleSheet } from 'react-native';
import { theme } from '../../theme/colors';

export const styles = StyleSheet.create({
  warRoomTab: {
    gap: 10,
  },
  warRoomIntro: {
    fontSize: 11,
    color: '#9EB6C8',
    marginTop: -6,
    marginBottom: 4,
  },
  warRoomAlertHint: {
    fontSize: 10,
    color: '#FF9B9B',
    fontWeight: '700',
  },

  // ── Campaign Rail ────────────────────────────────────────
  campaignRail: {
    gap: 8,
    marginBottom: 2,
  },
  campaignRailCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#39597A',
    backgroundColor: '#0F1E2E',
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  campaignRailLabel: {
    fontSize: 10,
    color: '#9ABED9',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  campaignRailValue: {
    fontSize: 12,
    color: '#E5F4FF',
    fontWeight: '700',
    marginBottom: 5,
  },
  campaignRailHint: {
    fontSize: 10,
    color: '#78A6C9',
  },

  // ── Near Unlock ──────────────────────────────────────────
  warNearUnlockCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#356251',
    backgroundColor: '#0F2219',
    padding: 10,
    gap: 8,
  },
  warNearUnlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  warNearUnlockTitle: {
    fontSize: 12,
    color: '#D8F7E7',
    fontWeight: '700',
  },
  warNearUnlockBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#5C9D80',
    backgroundColor: '#1E4535',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  warNearUnlockBtnText: {
    fontSize: 10,
    color: '#DDF7EA',
    fontWeight: '700',
  },
  warNearUnlockEmpty: {
    fontSize: 11,
    color: '#A5C8B6',
  },
  warNearUnlockRow: {
    gap: 4,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1F3A2F',
  },
  warNearUnlockTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  warNearUnlockName: {
    flex: 1,
    fontSize: 11,
    color: '#D2F0DF',
    fontWeight: '700',
  },
  warNearUnlockPct: {
    fontSize: 10,
    color: '#9CDEC0',
    fontWeight: '700',
  },
  warNearUnlockDesc: {
    fontSize: 10,
    color: '#9EC1AF',
  },
  warNearUnlockProgress: {
    fontSize: 10,
    color: '#7FC39F',
  },

  // ── War Panels ───────────────────────────────────────────
  warPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#31506A',
    backgroundColor: '#101C2A',
    overflow: 'hidden',
  },
  warPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#162839',
  },
  warPanelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  warPanelAlertDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: '#FF5E5E',
    shadowColor: '#FF5E5E',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  warPanelTitle: {
    fontSize: 12,
    color: '#D6ECFF',
    fontWeight: '700',
  },
  warPanelChevron: {
    fontSize: 16,
    color: '#99C4E1',
    fontWeight: '700',
  },
  warPanelBody: {
    padding: 10,
    gap: 6,
  },
  warPanelStat: {
    fontSize: 11,
    color: '#B3CADB',
  },
  warPanelActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  warPanelActionBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#5D88AD',
    backgroundColor: '#21364A',
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  warPanelActionBtnDisabled: {
    opacity: 0.5,
  },
  warPanelActionText: {
    fontSize: 10,
    color: '#D9ECFB',
    fontWeight: '700',
  },

  // ── Act ──────────────────────────────────────────────────
  actTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E8EEFF',
    marginBottom: 2,
  },
  actTheme: {
    fontSize: 10,
    color: '#96a5bf',
    marginBottom: 8,
  },
  actProgress: {
    fontSize: 10,
    color: '#c2d2f4',
    marginTop: 6,
  },
  actUnlockHint: {
    fontSize: 10,
    color: '#8dd0ff',
    marginTop: 3,
  },

  // ── Prestige Milestones ──────────────────────────────────
  prestigeMilestoneRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: '#1A2E42',
  },
  prestigeMilestoneCheck: {
    fontSize: 12,
    color: '#6080A0',
    minWidth: 18,
    paddingTop: 2,
  },
  prestigeMilestoneDone: {
    color: '#7DFF9A',
  },
  prestigeMilestoneLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D0E8FF',
  },
  prestigeMilestoneBonus: {
    fontSize: 10,
    color: '#8AAFCC',
  },

  // ── Shared ───────────────────────────────────────────────
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text.primary,
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
});
