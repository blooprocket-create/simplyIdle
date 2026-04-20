import { StyleSheet } from 'react-native';
import { theme } from '../../theme/colors';

export const styles = StyleSheet.create({
  heroesTab: {
    gap: 16,
  },

  // ── Gacha Section ────────────────────────────────────────
  gachaSection: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: theme.bg.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4A4A7A',
  },
  gachaCost: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.accent.gold,
    marginBottom: 8,
  },
  gachaFree: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.status.positive,
    marginBottom: 8,
  },
  pityLabel: {
    fontSize: 11,
    color: '#BFC7FF',
    marginBottom: 8,
  },
  gachaBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  gachaBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.status.positive,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  gachaBtnNotify: {
    borderWidth: 1,
    borderColor: '#ff6b6b',
  },
  gachaBtnDot: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff3b30',
  },
  gachaBtnX10: {
    backgroundColor: '#4A4A7A',
  },
  gachaBtnDisabled: {
    opacity: 0.5,
  },
  gachaBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  gachaBtnTextLight: {
    color: '#F2F4FF',
  },
  gachaX10Cost: {
    fontSize: 11,
    color: '#E8E8FF',
    marginTop: 3,
    fontWeight: '600',
  },

  // ── Featured Summon ──────────────────────────────────────
  featuredSummonCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#694AA8',
    backgroundColor: '#1B1532',
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  featuredSummonTitle: {
    fontSize: 12,
    color: '#E8D9FF',
    fontWeight: '700',
    marginBottom: 3,
  },
  featuredSummonDesc: {
    fontSize: 10,
    color: '#B7A5D7',
    marginBottom: 8,
  },
  featuredSummonMeterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  featuredSummonMeterLabel: {
    fontSize: 10,
    color: '#C9B6F0',
    fontWeight: '600',
  },
  featuredSummonMeterValue: {
    fontSize: 10,
    color: '#F0E4FF',
    fontWeight: '700',
  },
  featuredSummonBtn: {
    marginTop: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A785E8',
    backgroundColor: '#4A2F7A',
    alignItems: 'center',
    paddingVertical: 8,
  },
  featuredSummonBtnDisabled: {
    opacity: 0.45,
  },
  featuredSummonBtnText: {
    fontSize: 11,
    color: '#F6ECFF',
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  // ── Rarity Info ──────────────────────────────────────────
  rarityInfo: {
    gap: 6,
  },
  rarityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rarityDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  rarityLabel: {
    flex: 1,
    fontSize: 11,
    color: '#AAA',
  },
  rarityChance: {
    fontSize: 10,
    color: '#777',
  },

  // ── Summon History ───────────────────────────────────────
  summonHistoryBox: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2a3350',
    paddingTop: 8,
  },
  summonHistoryTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DCE6FF',
    marginBottom: 6,
  },
  timelineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    minHeight: 12,
    marginBottom: 6,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  timelineEmpty: {
    fontSize: 10,
    color: '#7f8ba7',
  },

  // ── Roster Header ────────────────────────────────────────
  heroRosterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroRosterHeaderStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 10,
  },
  heroRosterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroRosterActionsStacked: {
    width: '100%',
    gap: 8,
  },
  autoEquipBtn: {
    backgroundColor: '#2A2A4A',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  autoEquipBtnText: {
    color: theme.text.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  autoRecycleBtn: {
    backgroundColor: '#294135',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  autoRecycleBtnText: {
    color: '#9ae8bf',
    fontSize: 10,
    fontWeight: '700',
  },
  rosterCount: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },

  // ── Slot Unlock ──────────────────────────────────────────
  heroSlotUnlockCard: {
    marginBottom: 8,
    backgroundColor: '#122032',
    borderWidth: 1,
    borderColor: '#2c4d73',
    borderRadius: 6,
    padding: 8,
    gap: 6,
  },
  heroSlotUnlockTitle: {
    fontSize: 11,
    color: '#D8E9FF',
    fontWeight: '700',
  },
  heroSlotUnlockMeta: {
    fontSize: 10,
    color: '#AFC8E8',
  },
  heroSlotUnlockBtn: {
    alignSelf: 'flex-start',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#67A1D8',
    backgroundColor: '#234062',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  heroSlotUnlockBtnDisabled: {
    opacity: 0.45,
  },
  heroSlotUnlockBtnText: {
    fontSize: 10,
    color: '#E7F1FF',
    fontWeight: '700',
  },

  // ── Loadout ──────────────────────────────────────────────
  loadoutRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  loadoutRowMobile: {
    flexWrap: 'wrap',
  },
  loadoutCell: {
    flex: 1,
    backgroundColor: '#151d30',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2c3a5b',
    padding: 6,
  },
  loadoutCellMobile: {
    minWidth: '31%',
  },
  loadoutLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9FB8E8',
    marginBottom: 4,
  },
  loadoutBtnsWrap: {
    flexDirection: 'row',
    gap: 6,
  },
  loadoutSaveBtn: {
    flex: 1,
    backgroundColor: '#3b4f74',
    borderRadius: 4,
    paddingVertical: 5,
    alignItems: 'center',
  },
  loadoutLoadBtn: {
    flex: 1,
    backgroundColor: '#355a3b',
    borderRadius: 4,
    paddingVertical: 5,
    alignItems: 'center',
  },
  loadoutBtnText: {
    fontSize: 10,
    color: '#f2f6ff',
    fontWeight: '700',
  },

  // ── Hero Card ────────────────────────────────────────────
  heroCard: {
    position: 'relative',
    flexDirection: 'row',
    backgroundColor: theme.bg.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A2A4A',
    marginBottom: 8,
    overflow: 'hidden',
  },
  heroCardBackdropImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    aspectRatio: 1,
    opacity: 0.38,
  },
  heroCardBackdropFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#11111D',
  },
  heroCardBackdropEmoji: {
    fontSize: 56,
    opacity: 0.25,
  },
  heroCardBackdropScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 10, 16, 0.58)',
  },
  heroCardActive: {
    borderColor: theme.status.positive,
    backgroundColor: '#1a2a20',
  },
  heroCardMobile: {
    borderRadius: 18,
    borderColor: '#35587D',
    backgroundColor: '#101A27',
    shadowColor: '#09111D',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.34,
    shadowRadius: 18,
    elevation: 8,
  },
  heroCardMobileActive: {
    borderColor: '#69D59A',
    backgroundColor: '#14241D',
    shadowColor: '#1E5D3D',
    shadowOpacity: 0.28,
  },
  heroCardRarityBar: {
    width: 4,
    borderRadius: 0,
    zIndex: 2,
  },
  heroCardBody: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    zIndex: 2,
  },
  heroCardBodyMobile: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  heroCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  heroCardInfo: {
    flex: 1,
  },
  heroCardHeaderMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  // ── Portrait ─────────────────────────────────────────────
  heroPortraitFrame: {
    width: 38,
    height: 38,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D1523',
    overflow: 'hidden',
  },
  heroPortraitFrameMobile: {
    width: 58,
    height: 58,
    borderRadius: 6,
    backgroundColor: '#0B1522',
    shadowColor: '#4FA8FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  heroPortraitImage: {
    width: '100%',
    height: '100%',
  },
  heroPortraitImageMobile: {
    width: '100%',
    height: '100%',
  },
  heroEmoji: {
    fontSize: 24,
  },
  heroEmojiMobile: {
    fontSize: 27,
  },
  heroCardInfoMobile: {
    flex: 1,
    minWidth: 0,
  },
  heroNameRowMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroName: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.text.primary,
    marginBottom: 2,
  },
  heroNameMobile: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#F4F8FF',
    marginBottom: 0,
  },
  heroLevelPillMobile: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#866126',
    backgroundColor: '#352711',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  heroLevelPillTextMobile: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFCA6B',
  },
  heroMetaMobile: {
    fontSize: 12,
    color: '#AEBED7',
    marginTop: 4,
  },
  heroSubMetaMobile: {
    fontSize: 11,
    color: '#7FA5C7',
    marginTop: 3,
  },

  // ── Chips ────────────────────────────────────────────────
  heroChipRowMobile: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  heroChipMobile: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  heroChipMobileFaction: {
    backgroundColor: '#18364E',
    borderColor: '#355D83',
  },
  heroChipMobileRank: {
    backgroundColor: '#34234B',
    borderColor: '#64478B',
  },
  heroChipMobileArchetype: {
    backgroundColor: '#1A3341',
    borderColor: '#3F738A',
  },
  heroChipTextMobile: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EDF5FF',
    letterSpacing: 0.2,
  },

  // ── Utility Row ──────────────────────────────────────────
  heroUtilityRowMobile: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  heroBoostPillMobile: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#275D53',
    backgroundColor: '#132B28',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  heroBoostPillTextMobile: {
    fontSize: 10,
    fontWeight: '700',
    color: '#87E6C9',
  },
  heroTeamPillMobile: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#4E8E68',
    backgroundColor: '#173123',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroTeamPillTextMobile: {
    fontSize: 10,
    fontWeight: '800',
    color: '#A8F1BD',
  },

  // ── Action Row ───────────────────────────────────────────
  heroActionRowMobile: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#4A4A7A',
    borderRadius: 4,
  },
  toggleBtnMobile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: '#395586',
  },
  toggleBtnActive: {
    backgroundColor: theme.status.positive,
  },
  toggleBtnMobileActive: {
    backgroundColor: '#63D783',
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.text.primary,
  },
  expandBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#2A2A4A',
    borderRadius: 4,
  },
  expandBtnMobile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: '#222E46',
    borderWidth: 1,
    borderColor: '#3B4E75',
  },
  expandBtnText: {
    fontSize: 10,
    color: '#AAA',
  },

  // ── Tags ─────────────────────────────────────────────────
  heroTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 2,
    marginBottom: 2,
  },
  heroFactionTag: {
    fontSize: 9,
    color: '#DDF0FF',
    backgroundColor: '#27435F',
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 1,
    overflow: 'hidden',
    fontWeight: '700',
  },
  heroArchetypeTag: {
    fontSize: 9,
    color: '#EFE1FF',
    backgroundColor: '#4D3A67',
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 1,
    overflow: 'hidden',
    fontWeight: '700',
  },
  heroRank: {
    fontSize: 10,
    color: theme.text.warning,
    marginTop: 2,
  },
  heroCardRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  heroLevel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.text.warning,
  },

  // ── Stats ────────────────────────────────────────────────
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroStatBadge: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    backgroundColor: '#0A0A18',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#2A2A4A',
  },
  heroStatBadgeLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#777',
    textTransform: 'uppercase',
  },
  heroStatBadgeValue: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.text.primary,
    marginTop: 1,
  },
  heroExpandedStats: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 6,
  },
  heroIdentityBox: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#2F3754',
    backgroundColor: '#0D1121',
  },
  heroIdentityLine: {
    fontSize: 10,
    color: '#DCE6FF',
    fontWeight: '700',
    marginBottom: 2,
  },
  heroIdentitySub: {
    fontSize: 10,
    color: '#91A7CD',
    marginBottom: 4,
    lineHeight: 13,
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    backgroundColor: '#0E0E1E',
    borderRadius: 4,
  },
  heroStatItemLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: theme.status.positive,
  },
  heroStatItemValue: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.text.primary,
    marginTop: 2,
  },
  heroDetail: {
    fontSize: 10,
    color: '#AAA',
  },

  // ── Rank Up / Level Up ───────────────────────────────────
  rankUpSection: {
    backgroundColor: '#0A0A18',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  rankUpLabel: {
    fontSize: 10,
    color: '#AAA',
    marginBottom: 6,
  },
  rankUpBtn: {
    backgroundColor: theme.text.warning,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  rankUpBtnDisabled: {
    backgroundColor: '#4A4A4A',
    opacity: 0.6,
  },
  rankUpBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
  },
  maxRankMsg: {
    fontSize: 11,
    color: theme.status.positive,
    fontWeight: '700',
    marginBottom: 8,
  },
  heroLvlUpBtn: {
    backgroundColor: '#2E5FA3',
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginBottom: 6,
  },
  heroLvlUpBtnDisabled: {
    backgroundColor: '#2A2A3A',
    opacity: 0.5,
  },
  heroLvlUpBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#CDE',
  },
  recycleBtn: {
    backgroundColor: '#3A4A3A',
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.status.positive,
  },
  recycleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.status.positive,
  },

  // ── Batch Leveling ───────────────────────────────────────
  batchLevelingSection: {
    gap: 12,
  },
  batchLevelTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#D9ECFF',
    marginBottom: 8,
  },
  batchLevelControls: {
    gap: 8,
  },
  targetLevelControl: {
    gap: 8,
  },
  targetLevelLabel: {
    fontSize: 12,
    color: '#A9C0E8',
    fontWeight: '700',
  },
  targetLevelButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  levelBtn: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4A6FA5',
    backgroundColor: '#1A2F47',
    paddingVertical: 6,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  levelBtnActive: {
    backgroundColor: theme.status.positive,
    borderColor: theme.status.positive,
  },
  levelBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A9C0E8',
  },
  levelBtnTextActive: {
    color: '#000',
  },
  selectHeroesLabel: {
    fontSize: 12,
    color: '#A9C0E8',
    fontWeight: '700',
  },
  batchHeroList: {
    maxHeight: 280,
    gap: 8,
  },
  batchHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#31506A',
    backgroundColor: '#101C2A',
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 10,
  },
  batchHeroCardMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  batchHeroCardSelected: {
    borderColor: theme.status.positive,
    backgroundColor: 'rgba(109, 219, 123, 0.08)',
  },
  batchHeroCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#4A6FA5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  batchHeroCheckboxInner: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: theme.status.positive,
  },
  batchHeroInfo: {
    flex: 1,
    gap: 2,
  },
  batchHeroHeaderMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  batchHeroHeaderLeftMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  batchHeroInfoMobile: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  batchHeroNameMobile: {
    fontSize: 15,
    fontWeight: '800',
    color: '#E5F2FF',
  },
  batchHeroLevelMobile: {
    fontSize: 11,
    color: '#95B7D8',
  },
  batchHeroProjectedRowMobile: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  batchHeroProjectedPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#516F92',
    backgroundColor: '#162739',
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  batchHeroProjectedPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#CDE6FF',
  },
  batchHeroTagRowMobile: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  batchHeroMetaPillMobile: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#415B78',
    backgroundColor: '#162536',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  batchHeroMetaPillTeamMobile: {
    borderColor: '#548A66',
    backgroundColor: '#173123',
  },
  batchHeroMetaPillRankMobile: {
    borderColor: '#5F4E8A',
    backgroundColor: '#241E38',
  },
  batchHeroMetaPillCostMobile: {
    borderColor: '#8F7531',
    backgroundColor: '#312812',
  },
  batchHeroMetaPillTextMobile: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E3F2FF',
  },
  batchHeroMetaPillTextCostMobile: {
    color: '#FFD36B',
  },
  batchHeroName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D9ECFF',
  },
  batchHeroLevel: {
    fontSize: 11,
    color: '#A9C0E8',
  },
  batchHeroTeamTag: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.status.positive,
  },
  batchHerosCost: {
    fontSize: 11,
    color: theme.accent.gold,
    fontWeight: '700',
  },
  batchLevelConfirmBtn: {
    backgroundColor: theme.status.positive,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  batchLevelConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },

  // ── Shared ───────────────────────────────────────────────
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text.primary,
    marginBottom: 8,
  },
  emptyMsg: {
    fontSize: 12,
    color: '#777',
    fontStyle: 'italic',
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
