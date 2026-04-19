import { StyleSheet } from 'react-native';
import { theme } from '../../theme/colors';

export const styles = StyleSheet.create({
  achievementsTab: {
    gap: 8,
  },

  // ── Bonus Card ───────────────────────────────────────────
  achievementBonusCard: {
    backgroundColor: '#17232B',
    borderWidth: 1,
    borderColor: '#385A66',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  achievementBonusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  achievementBonusTitle: {
    fontSize: 12,
    color: '#D5F2FF',
    fontWeight: '700',
  },
  achievementBonusValue: {
    fontSize: 14,
    color: '#7EE2A9',
    fontWeight: '800',
  },
  achievementBonusDesc: {
    fontSize: 10,
    color: '#A6C8D4',
    lineHeight: 15,
  },

  // ── Claim All ────────────────────────────────────────────
  claimAllRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  claimAllInfo: {
    fontSize: 10,
    color: '#B5D5E5',
    fontWeight: '700',
  },
  claimAllBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#6DA98B',
    backgroundColor: '#264A3A',
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  claimAllBtnDisabled: {
    opacity: 0.5,
  },
  claimAllBtnText: {
    fontSize: 10,
    color: '#DBFFEC',
    fontWeight: '700',
  },

  // ── Weekly Event ─────────────────────────────────────────
  weeklyEventCard: {
    backgroundColor: '#121f2e',
    borderWidth: 1,
    borderColor: '#2f4d71',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  weeklyEventTitle: {
    fontSize: 12,
    color: '#DCEFFF',
    fontWeight: '700',
    marginBottom: 4,
  },
  weeklyEventDesc: {
    fontSize: 10,
    color: '#AFC5DD',
    marginBottom: 8,
    lineHeight: 15,
  },
  weeklyProgressLabel: {
    fontSize: 11,
    color: '#90D0FF',
    marginBottom: 6,
    fontWeight: '700',
  },
  weeklyTrackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  weeklyTrackText: {
    fontSize: 11,
    color: '#D2E0F0',
  },
  weeklyClaimBtn: {
    backgroundColor: '#2e6948',
    borderWidth: 1,
    borderColor: '#5ea280',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  weeklyClaimBtnDisabled: {
    opacity: 0.45,
  },
  weeklyClaimBtnText: {
    fontSize: 10,
    color: '#d8ffeb',
    fontWeight: '700',
  },

  // ── Mission Board ────────────────────────────────────────
  missionBoardCard: {
    backgroundColor: '#1A182B',
    borderWidth: 1,
    borderColor: '#3A3161',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  missionRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2B254A',
  },
  missionInfo: {
    flex: 1,
  },
  missionTitle: {
    fontSize: 11,
    color: '#E3DBFF',
    fontWeight: '700',
    marginBottom: 2,
  },
  missionDesc: {
    fontSize: 10,
    color: '#B7ADDC',
    marginBottom: 2,
  },
  missionProgress: {
    fontSize: 10,
    color: '#8ED5FF',
    fontWeight: '700',
  },
  missionClaimBtn: {
    backgroundColor: '#3B3D73',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#7C82D3',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  missionClaimBtnDisabled: {
    opacity: 0.45,
  },
  missionClaimBtnText: {
    fontSize: 10,
    color: '#E8E9FF',
    fontWeight: '700',
  },

  // ── Achievement Cards ────────────────────────────────────
  achCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#121B28',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A4257',
    marginBottom: 8,
    opacity: 0.6,
  },
  achCardUnlocked: {
    opacity: 1,
    borderColor: '#68D69D',
    backgroundColor: '#152723',
  },
  achEmoji: {
    fontSize: 20,
  },
  achCardInfo: {
    flex: 1,
  },
  achName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#95A8B7',
    marginBottom: 2,
  },
  achNameUnlocked: {
    color: '#EDFFF6',
  },
  achDesc: {
    fontSize: 10,
    color: '#8DA3B5',
  },
  achBonusLine: {
    marginTop: 3,
    fontSize: 10,
    color: '#8CB2C4',
    fontWeight: '700',
  },
  achBonusLineUnlocked: {
    color: '#79D89F',
  },

  // ── Collection ───────────────────────────────────────────
  collectionCard: {
    backgroundColor: '#111E2C',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A4260',
    padding: 10,
    marginBottom: 8,
  },
  collectionCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DAEEFF',
    marginBottom: 6,
  },
  collectionStat: {
    fontSize: 11,
    color: '#9BB6CC',
    marginBottom: 2,
  },
  collectionBonus: {
    fontSize: 10,
    color: '#7DFF9A',
    marginTop: 3,
    fontWeight: '700',
  },
  collectionHint: {
    fontSize: 10,
    color: '#AA8855',
    marginTop: 3,
    fontStyle: 'italic',
  },

  // ── Story ────────────────────────────────────────────────
  storyCardWrap: {
    backgroundColor: '#111E2B',
    borderWidth: 1,
    borderColor: '#28465F',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  storyCardTitle: {
    color: '#EAF3FF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  storyCardSubtitle: {
    color: '#9DB4C9',
    fontSize: 11,
    marginBottom: 8,
  },
  storyBeatCard: {
    backgroundColor: '#0D1722',
    borderWidth: 1,
    borderColor: '#243A4E',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  storyBeatCardUnlocked: {
    borderColor: '#3B6A8E',
    backgroundColor: '#132636',
  },
  storyBeatChapter: {
    color: '#AFC6DA',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  storyBeatChapterUnlocked: {
    color: '#D8ECFF',
  },
  storyBeatBody: {
    color: '#C7D8E7',
    fontSize: 11,
    lineHeight: 16,
  },
  storyBeatReq: {
    color: '#8FA7BC',
    fontSize: 10,
    marginTop: 6,
  },
  storyNextHint: {
    color: '#FFE4A8',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },

  // ── Codex ────────────────────────────────────────────────
  codexEntry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A3C55',
    backgroundColor: '#0F1A28',
    marginBottom: 6,
    opacity: 0.6,
  },
  codexEntryDone: {
    opacity: 1,
    borderColor: '#4A8E6A',
    backgroundColor: '#122218',
  },
  codexEntryLeft: {
    flex: 1,
  },
  codexHeroIconBtn: {
    position: 'relative',
    marginRight: 8,
  },
  codexClaimDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ff3b30',
    borderWidth: 1,
    borderColor: theme.text.primary,
  },
  codexHeroPortrait: {
    width: 28,
    height: 28,
    borderRadius: 3,
  },
  codexTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A0C0DD',
    marginBottom: 2,
  },
  codexTitleDone: {
    color: '#7DFF9A',
  },
  codexDesc: {
    fontSize: 10,
    color: '#7A9BB5',
    marginBottom: 2,
  },
  codexReward: {
    fontSize: 10,
    color: '#FFD88A',
    fontWeight: '700',
  },

  // ── Toggle / Shared ──────────────────────────────────────
  toggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#4A4A7A',
    borderRadius: 4,
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.text.primary,
  },
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
});
