import { StyleSheet } from 'react-native';
import { theme } from '../../theme/colors';

export const styles = StyleSheet.create({
  operationsTab: {
    padding: 12,
    gap: 16,
  },

  // ── Shared ───────────────────────────────────────────────
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text.primary,
    marginBottom: 8,
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
  redDot: {
    position: 'absolute',
    top: -1,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff3b30',
  },

  // ── Facilities ───────────────────────────────────────────
  facilitiesSection: {
    gap: 12,
  },
  facilitiesTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#D9ECFF',
    marginBottom: 4,
  },
  facilitiesDesc: {
    fontSize: 11,
    color: '#9CDEC0',
    marginBottom: 8,
  },
  facilityCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#31506A',
    backgroundColor: '#101C2A',
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 8,
    marginBottom: 8,
  },
  facilityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  facilityName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D9ECFF',
    flex: 1,
  },
  facilityLevel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A9C0E8',
  },
  facilityBonusBar: {
    flexDirection: 'row',
    gap: 4,
  },
  facilityBonusSegment: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#21364A',
  },
  facilityBonusSegmentActive: {
    backgroundColor: theme.status.positive,
  },
  facilityBonusText: {
    fontSize: 11,
    color: '#9CDEC0',
    fontWeight: '600',
  },
  facilityNextBonus: {
    fontSize: 10,
    color: '#7FC39F',
    fontStyle: 'italic',
  },
  facilityUpgradeBtn: {
    backgroundColor: '#4A6FA5',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  facilityUpgradeBtnDisabled: {
    backgroundColor: '#1A2F47',
    opacity: 0.5,
  },
  facilityUpgradeBtnMaxed: {
    backgroundColor: '#1A2F47',
  },
  facilityUpgradeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D9ECFF',
  },

  // ── Expeditions ──────────────────────────────────────────
  expeditionsSection: {
    gap: 12,
  },
  expeditionsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#D9ECFF',
    marginBottom: 4,
  },
  expeditionsDesc: {
    fontSize: 11,
    color: '#9CDEC0',
    marginBottom: 8,
  },
  expeditionQueueSection: {
    gap: 8,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#31506A',
  },
  expeditionQueueTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A9C0E8',
  },
  expeditionQueueCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#5D88AD',
    backgroundColor: '#0D1A27',
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  expeditionQueueName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D9ECFF',
  },
  expeditionProgressBg: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1A2F47',
    overflow: 'hidden',
  },
  expeditionProgressFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: theme.status.positive,
  },
  expeditionTimeRemaining: {
    fontSize: 11,
    color: '#A9C0E8',
    fontWeight: '600',
  },
  expeditionClaimBtn: {
    backgroundColor: theme.status.positive,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  expeditionClaimBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
  },
  expeditionStartSection: {
    gap: 8,
  },
  expeditionStartTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A9C0E8',
  },
  expeditionStartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expeditionRefreshBtn: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4A6FA5',
    backgroundColor: '#1A2F47',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  expeditionRefreshBtnDisabled: {
    opacity: 0.45,
  },
  expeditionRefreshBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D9ECFF',
  },
  expeditionRefreshTimerText: {
    fontSize: 10,
    color: '#A9C0E8',
    fontWeight: '600',
  },
  expeditionNoLaunchText: {
    fontSize: 10,
    color: '#9CDEC0',
    fontStyle: 'italic',
  },
  expeditionStartCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#31506A',
    backgroundColor: '#101C2A',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  expeditionStartCardDisabled: {
    opacity: 0.5,
  },
  expeditionStartCardLeft: {
    flex: 1,
    gap: 2,
  },
  expeditionStartCardName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D9ECFF',
  },
  expeditionStartCardMeta: {
    fontSize: 10,
    color: '#A9C0E8',
  },
  expeditionStartCardRewards: {
    fontSize: 10,
    color: theme.accent.gold,
    fontWeight: '600',
  },
  expeditionStartCardRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  expeditionStartCardCost: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.accent.gold,
  },
  expeditionStartCardCostDisabled: {
    color: '#7F6B47',
  },
  expeditionStartCardStatus: {
    fontSize: 9,
    fontWeight: '700',
    color: theme.status.positive,
  },
  expeditionStartCardStatusDisabled: {
    color: '#7F6B47',
  },
});
