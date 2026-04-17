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

  // ── Act Card ─────────────────────────────────────────────
  actCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2F4B66',
    backgroundColor: '#101C2A',
    padding: 10,
    gap: 4,
  },
  actTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E8EEFF',
    marginBottom: 2,
  },
  actTheme: {
    fontSize: 10,
    color: '#96a5bf',
    marginBottom: 4,
  },
  actProgress: {
    fontSize: 10,
    color: '#c2d2f4',
    marginTop: 4,
  },
  actUnlockHint: {
    fontSize: 10,
    color: '#8dd0ff',
    marginTop: 3,
  },

  // ── Strategic Advisor ────────────────────────────────────
  advisorSection: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4A6A3A',
    backgroundColor: '#0F1F0F',
    padding: 10,
    gap: 8,
  },
  advisorTitle: {
    fontSize: 12,
    color: '#C8F0B8',
    fontWeight: '700',
  },
  advisorEmpty: {
    fontSize: 11,
    color: '#8CB88A',
    fontStyle: 'italic',
  },
  advisorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A4528',
    backgroundColor: '#152415',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 10,
  },
  advisorCardPrimary: {
    borderColor: '#5A9E48',
    backgroundColor: '#1A3518',
  },
  advisorCardText: {
    flex: 1,
    gap: 2,
  },
  advisorCardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D0ECC4',
  },
  advisorCardTitlePrimary: {
    color: '#A8F090',
  },
  advisorCardDetail: {
    fontSize: 10,
    color: '#8CB88A',
  },
  advisorCardArrow: {
    fontSize: 14,
    color: '#5A9E48',
    fontWeight: '700',
  },

  // ── Active Objectives ────────────────────────────────────
  objectivesSection: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#5A5030',
    backgroundColor: '#1A1508',
    padding: 10,
    gap: 8,
  },
  objectivesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  objectivesTitle: {
    fontSize: 12,
    color: '#F0E0A0',
    fontWeight: '700',
  },
  objectivesViewAll: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#6A6030',
    backgroundColor: '#2A2510',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  objectivesViewAllText: {
    fontSize: 10,
    color: '#E8D888',
    fontWeight: '700',
  },
  objectivesStats: {
    gap: 4,
  },
  objectivesStat: {
    fontSize: 11,
    color: '#C8B870',
  },
  claimAllBtn: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#8A7A30',
    backgroundColor: '#3A3010',
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  claimAllBtnText: {
    fontSize: 11,
    color: '#F0E0A0',
    fontWeight: '700',
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

  // ── Prestige Progress ────────────────────────────────────
  prestigeSection: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4A3570',
    backgroundColor: '#150F22',
    padding: 10,
    gap: 8,
  },
  prestigeSectionTitle: {
    fontSize: 12,
    color: '#D8B8FF',
    fontWeight: '700',
  },
  prestigeTrack: {
    gap: 0,
  },
  prestigeMilestoneRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: '#251A38',
  },
  prestigeMilestoneCheck: {
    fontSize: 12,
    color: '#6050A0',
    minWidth: 18,
    paddingTop: 2,
  },
  prestigeMilestoneDone: {
    color: '#7DFF9A',
  },
  prestigeMilestoneContent: {
    flex: 1,
  },
  prestigeMilestoneLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D0C8FF',
  },
  prestigeMilestoneLabelDone: {
    color: '#A8E8B8',
  },
  prestigeMilestoneBonus: {
    fontSize: 10,
    color: '#8A7ACC',
  },
  prestigeNextHint: {
    fontSize: 10,
    color: '#9A80CC',
    fontStyle: 'italic',
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
