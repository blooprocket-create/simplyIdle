import { StyleSheet } from 'react-native';
import { THEME, RADIUS } from '../../../theme';

/**
 * Shared styles for all Social Tab v2 components.
 * Extracted from the monolithic SocialTabContent.tsx.
 * All child sections (Chat, Friends, Guild, Profile, etc.) import from here
 * instead of receiving `styles` as a prop.
 */
export const socialStyles = StyleSheet.create({
  root: {
    gap: 12,
  },
  sectionTransition: {
    gap: 12,
  },

  // ── Hero Card ──────────────────────────────────────────────────────────────
  heroCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#2A5A84',
    backgroundColor: '#0E1A2A',
    padding: 14,
    gap: 10,
  },
  heroTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroTitle: {
    color: '#E9F4FF',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  heroPulse: {
    color: '#A4FFD6',
    backgroundColor: 'rgba(40, 140, 105, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(125, 234, 188, 0.45)',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  heroSubtitle: {
    color: '#9EC1DE',
    fontSize: 12,
    lineHeight: 18,
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  heroChip: {
    minWidth: 88,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#33526D',
    backgroundColor: '#142436',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  heroChipWide: {
    flex: 1,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#33526D',
    backgroundColor: '#142436',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  heroChipLabel: {
    color: '#9CB9D1',
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  heroChipValue: {
    color: '#F1FAFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // ── Sub-tab Row ────────────────────────────────────────────────────────────
  subTabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  subTabBtn: {
    position: 'relative',
    flex: 1,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#314B63',
    minHeight: 46,
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101D2B',
  },
  subTabBtnActive: {
    borderColor: '#83D0FF',
    backgroundColor: '#17314A',
    shadowColor: '#56B4FF',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  subTabDot: {
    position: 'absolute',
    top: 5,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: '#FF5A7A',
  },
  subTabText: {
    color: '#AFC3D6',
    fontWeight: '700',
    fontSize: 11,
    textAlign: 'center',
  },
  subTabTextActive: {
    color: '#F2FAFF',
  },

  // ── Card ───────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#111D2A',
    borderWidth: 1,
    borderColor: '#2B4258',
    borderRadius: RADIUS.lg,
    padding: 12,
    gap: 10,
  },
  chatListCard: {
    minHeight: 260,
    maxHeight: 360,
    backgroundColor: '#0B1520',
  },

  // ── Chat Shell ─────────────────────────────────────────────────────────────
  chatShell: {
    minHeight: 430,
    maxHeight: 560,
    backgroundColor: '#0B1520',
    padding: 10,
  },
  chatChannelRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 2,
  },
  chatChannelChip: {
    position: 'relative',
    borderWidth: 1,
    borderColor: '#2F4C64',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#0E1F2E',
  },
  chatChannelChipActive: {
    borderColor: '#7EC8FF',
    backgroundColor: '#1A3550',
  },
  chatChannelChipText: {
    color: '#98BCD8',
    fontSize: 11,
    fontWeight: '700',
  },
  chatChannelChipTextActive: {
    color: '#EAF7FF',
  },
  chatChannelBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF5A7A',
    borderWidth: 1,
    borderColor: '#FFD2DC',
    paddingHorizontal: 4,
  },
  chatChannelBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  chatStreamArea: {
    flex: 1,
    minHeight: 220,
    borderWidth: 1,
    borderColor: '#284158',
    borderRadius: RADIUS.md,
    backgroundColor: '#0E1A28',
    overflow: 'hidden',
  },
  chatStreamList: {
    flex: 1,
  },
  chatStreamContent: {
    padding: 8,
    paddingBottom: 12,
  },
  chatDayDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 8,
  },
  chatDayDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2A445B',
  },
  chatDayDividerText: {
    color: '#8EAFC7',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chatComposerWrap: {
    borderTopWidth: 1,
    borderTopColor: '#2E4B63',
    paddingTop: 8,
    gap: 8,
  },
  chatJumpToLatestBtn: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#6EB7EA',
    backgroundColor: '#16344B',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 6,
  },
  chatJumpToLatestText: {
    color: '#DDF3FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  chatComposerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatComposerInput: {
    flex: 1,
    minHeight: 40,
  },

  // ── Typography ─────────────────────────────────────────────────────────────
  cardTitle: {
    color: '#E8F3FF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  metaText: {
    color: '#9AB4CA',
    fontSize: 12,
  },

  // ── Async States ───────────────────────────────────────────────────────────
  asyncInlineContainer: {
    borderWidth: 1,
    borderColor: '#2F465D',
    borderRadius: RADIUS.md,
    backgroundColor: '#0E1B29',
    padding: 10,
    gap: 6,
  },
  asyncInlineTitle: {
    color: '#E8F3FF',
    fontSize: 13,
    fontWeight: '700',
  },
  skeletonStack: {
    gap: 8,
    marginTop: 2,
  },
  skeletonBlock: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#1F3247',
    borderWidth: 1,
    borderColor: '#2C465F',
  },
  skeletonBlockShort: {
    width: '62%',
  },
  skeletonBlockMedium: {
    width: '78%',
  },

  // ── Metrics ────────────────────────────────────────────────────────────────
  metricGrid: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  metricChip: {
    minWidth: 96,
    flex: 1,
    borderWidth: 1,
    borderColor: '#2E4E68',
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#0D1A28',
    gap: 2,
  },
  metricLabel: {
    color: '#99BAD3',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricValue: {
    color: '#E7F5FF',
    fontSize: 12,
    fontWeight: '800',
  },
  cooldownText: {
    color: '#9DD8FF',
    fontSize: 11,
    marginTop: 3,
  },
  mutedText: {
    color: '#F9D66D',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Chat Rows ──────────────────────────────────────────────────────────────
  chatRow: {
    borderWidth: 1,
    borderColor: '#2A415A',
    borderRadius: RADIUS.md,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#121F2E',
  },
  chatRowCompact: {
    marginTop: -6,
    paddingTop: 6,
  },
  chatRowMine: {
    borderColor: '#7CC3FF',
    backgroundColor: '#1A2F45',
  },
  chatHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
    gap: 8,
  },
  chatName: {
    flex: 1,
    flexShrink: 1,
    color: '#EAF6FF',
    fontWeight: '700',
    fontSize: 12,
  },
  chatTime: {
    color: '#87A6BF',
    fontSize: 11,
  },
  chatTimeCompact: {
    color: '#7396B4',
    fontSize: 10,
    marginBottom: 3,
    fontWeight: '700',
  },
  chatText: {
    color: '#D5E6F5',
    fontSize: 13,
    lineHeight: 19,
  },

  // ── Reactions ──────────────────────────────────────────────────────────────
  reactionRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 7,
    flexWrap: 'wrap',
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#3A5E79',
    borderRadius: 999,
    minHeight: 30,
    minWidth: 38,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#162B3D',
  },
  reactionChipActive: {
    borderColor: '#8AD0FF',
    backgroundColor: '#214661',
  },
  reactionChipText: {
    color: '#EAF7FF',
    fontSize: 11,
    fontWeight: '700',
  },
  reactionChipCount: {
    color: '#B6D8EF',
    fontSize: 10,
    fontWeight: '800',
  },

  // ── Mute / Admin ───────────────────────────────────────────────────────────
  muteBtn: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#FF7788',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  muteActionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  muteBtnPerm: {
    borderColor: '#FFA23D',
  },
  muteBtnText: {
    color: '#FF96A3',
    fontWeight: '700',
    fontSize: 11,
  },

  // ── Input / Buttons ────────────────────────────────────────────────────────
  input: {
    borderWidth: 1,
    borderColor: '#33506A',
    borderRadius: RADIUS.md,
    backgroundColor: '#091320',
    color: '#E8F5FF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendBtn: {
    alignSelf: 'flex-end',
    borderRadius: RADIUS.md,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#67E6B6',
    backgroundColor: '#79F0C6',
  },
  sendBtnPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    color: '#053024',
    fontWeight: '800',
    fontSize: 12,
  },
  errorText: {
    color: '#FF8694',
    fontSize: 12,
  },

  // ── Friends ────────────────────────────────────────────────────────────────
  prefRow: {
    flexDirection: 'row',
    gap: 8,
  },
  prefBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#304960',
    borderRadius: RADIUS.md,
    minHeight: 44,
    paddingVertical: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E1A29',
  },
  prefBtnActive: {
    borderColor: '#8CCBFF',
    backgroundColor: '#1C3550',
  },
  prefBtnText: {
    color: '#DCEEFF',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  friendRow: {
    borderWidth: 1,
    borderColor: '#2F465D',
    borderRadius: RADIUS.md,
    padding: 9,
    backgroundColor: '#122133',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
  },
  friendMeta: {
    flex: 1,
  },
  friendName: {
    color: '#E8F5FF',
    fontWeight: '700',
    fontSize: 13,
  },
  friendActions: {
    flexDirection: 'row',
    gap: 8,
  },
  sectionLabel: {
    color: '#B6D8F1',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statusDotReady: {
    backgroundColor: '#67E6B6',
  },
  statusDotCooldown: {
    backgroundColor: '#F9D66D',
  },
  statusText: {
    color: '#C6E2F5',
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadge: {
    color: '#E2F3FF',
    borderWidth: 1,
    borderColor: '#4F7898',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: '#1B334A',
    overflow: 'hidden',
  },

  // ── Progress Bars ──────────────────────────────────────────────────────────
  progressBlock: {
    gap: 6,
    marginTop: 4,
  },
  progressLabel: {
    color: '#A7C8DF',
    fontSize: 11,
    fontWeight: '700',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: '#12283A',
    borderWidth: 1,
    borderColor: '#2A4B66',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#7EC8FF',
  },

  // ── Small Buttons ──────────────────────────────────────────────────────────
  smallBtn: {
    borderWidth: 1,
    borderColor: '#7EC8FF',
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1B3C5C',
  },
  smallBtnDanger: {
    borderColor: '#FF7A90',
    backgroundColor: '#4D2230',
  },
  smallBtnText: {
    color: '#F2FAFF',
    fontWeight: '700',
    fontSize: 12,
  },
  smallBtnPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.88,
  },

  // ── User Menu Modal ────────────────────────────────────────────────────────
  userMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 8, 16, 0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  userMenuCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#132133',
    borderWidth: 1,
    borderColor: '#35516A',
    borderRadius: RADIUS.lg,
    padding: 12,
    gap: 10,
  },

  // ── Profile ────────────────────────────────────────────────────────────────
  profileCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#132133',
    borderWidth: 1,
    borderColor: '#35516A',
    borderRadius: RADIUS.lg,
    padding: 14,
    gap: 10,
  },
  profileName: {
    color: '#EAF6FF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  profileTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  profileTag: {
    color: '#DDF5FF',
    borderWidth: 1,
    borderColor: '#4B7695',
    borderRadius: 999,
    backgroundColor: '#17334A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
  },
  compareCard: {
    borderWidth: 1,
    borderColor: '#3C5D77',
    borderRadius: RADIUS.md,
    backgroundColor: '#102636',
    padding: 10,
    gap: 4,
  },
  compareTitle: {
    color: '#E7F4FF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // ── Confirm Modals ─────────────────────────────────────────────────────────
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 8, 16, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#132133',
    borderWidth: 1,
    borderColor: '#35516A',
    borderRadius: RADIUS.lg,
    padding: 16,
    gap: 12,
  },
  confirmTitle: {
    color: THEME.text.primary,
    fontSize: 17,
    fontWeight: '800',
  },
  confirmTitleDanger: {
    color: '#FF5555',
    fontSize: 17,
    fontWeight: '800',
  },
  confirmText: {
    color: '#C8DAEA',
    fontSize: 14,
  },
  confirmWarning: {
    color: '#FFB347',
    fontSize: 12,
  },
  confirmButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  confirmBtn: {
    flex: 1,
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  confirmBtnCancel: {
    borderWidth: 1,
    borderColor: '#46627B',
    backgroundColor: '#1A2A3D',
  },
  confirmBtnDanger: {
    backgroundColor: THEME.status.error,
  },
  confirmBtnText: {
    fontWeight: '800',
    fontSize: 12,
    color: '#FFFFFF',
  },
});
