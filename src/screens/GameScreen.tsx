import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import {
  View,
  Text,
  Image,
  ScrollView,
  SafeAreaView,
  Platform,
  StatusBar,
  TextInput,
  Modal,
  Linking,
  Alert,
  Animated,
  Easing,
  ActivityIndicator,
  useWindowDimensions,
  AppState,
} from 'react-native';
import {
  ENABLE_SIMULATED_DOLLAR_PURCHASES,
  FACILITY_MAX_LEVEL,
  MINI_OPS_COOLDOWN_MS,
  getCharacterSaveSlot,
  getDpsBreakdown,
  getEquipmentCraftCost,
  getFacilityUpgradeCost,
  getHeroGoldLevelCost,
  getMaxHeatForLevel,
  useGameState,
} from '../useGameState';
import { debugLog, trackEvent, trackGameplayAction } from '../telemetry';
import {
  ACHIEVEMENTS,
  CLASSES,
  HERO_POOL,
  PlayerClass,
  EquipmentSlot,
  RARITIES,
  ACTIVE_TEAM_SIZE,
  getRebirthWaveRequirement,
  equipmentRarityConfig,
  getMonsterForWave,
  getActForWave,
  getBossUnlockForWave,
  unlockLabel,
  getMonsterAffixes,
  getMonsterGold,
  getMonsterExp,
  getMonsterDamage,
  rarityConfig,
  getDailyFeaturedSummonBanner,
  getHeroTemplateById,
  getHighestAvailableSummonRarity,
  getClassConfig,
  getClassPassive,
  getHeroPassiveTraitInfo,
  getHeroActiveArchetypeInfo,
  WEEKLY_TRACK_MILESTONES,
  MISSION_BOARD_GOALS,
  STORY_BEATS,
  calculateShardReward,
  getRankUpShardCost,
  getUsableItem,
  expForLevel,
  BREAKPOINTS,
  DIAMOND_SUMMON_COST,
  VIP_SUMMON_DISCOUNT_LEVEL,
  VIP_SUMMON_DISCOUNT,
} from '../gameConfig';
import { getHeroPortraitSource } from '../heroPortraits';
import { hasStoryCutsceneVideo } from '../storyCutscenes';
import { fmt } from '../utils';
import StoryBeatCutscene from '../components/StoryBeatCutscene';
import StoryBeatModal from '../components/StoryBeatModal';
import RebirthModal from '../components/PrestigeModal';
import BottomNavigation, { BottomTabType } from '../components/BottomNavigation';
import { FeedbackPressable as Pressable } from '../components/FeedbackPressable';
import GameHeader from '../components/GameHeader';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ProgressBar } from '../components/ProgressBar';
import { EXPEDITION_RARITY_META, EXPEDITION_TYPES } from './gameScreenShared';
import type { Tab } from './gameScreenShared';

// Lazy-load tab content components for code-splitting (benefits web bundle)
const WarroomTabContent = React.lazy(() =>
  import('./tabs/WarroomTabContent').then(m => ({ default: m.WarroomTabContent })),
);
const BattleTabContent = React.lazy(() =>
  import('./tabs/BattleTabContent').then(m => ({ default: m.BattleTabContent })),
);
const HeroesTabContent = React.lazy(() =>
  import('./tabs/HeroesTabContent').then(m => ({ default: m.HeroesTabContent })),
);
const StatsTabContent = React.lazy(() => import('./tabs/StatsTabContent').then(m => ({ default: m.StatsTabContent })));
const EquipmentTabContent = React.lazy(() =>
  import('./tabs/EquipmentTabContent').then(m => ({ default: m.EquipmentTabContent })),
);
const AchievementsTabContent = React.lazy(() =>
  import('./tabs/AchievementsTabContent').then(m => ({ default: m.AchievementsTabContent })),
);
const OperationsTabContent = React.lazy(() =>
  import('./tabs/OperationsTabContent').then(m => ({ default: m.OperationsTabContent })),
);
const SocialTabContent = React.lazy(() =>
  import('./tabs/SocialTabContent').then(m => ({ default: m.SocialTabContent })),
);
import { styles } from './GameScreen.styles';
import { useRenderTracker } from '../hooks/useRenderTracker';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useDevConsole } from '../hooks/useDevConsole';
import { useSummonCinematic } from '../hooks/useSummonCinematic';
import { useSocialServices } from '../hooks/useSocialServices';
import { useCharacterSlots } from '../hooks/useCharacterSlots';
import { useShopUi } from '../hooks/useShopUi';
import { useGameOverlays } from '../hooks/useGameOverlays';
import { useModalOpenTelemetry } from '../hooks/useModalOpenTelemetry';
import TutorialOverlay, {
  TutorialBanner,
  getTutorialStep,
  getTutorialAllowedTabs,
} from '../components/TutorialOverlay';
import {
  normalizeCharacterNameForCompare,
  releaseCharacterName,
  reserveCharacterName,
} from '../services/characterNameRegistry';
import { deleteOnlineSave, loadOnlineSave } from '../services/onlineSave';
import { t } from '../i18n';

/** Smoothly animated progress bar for save-slot hydration, driven by real load progress. */
function HydrationProgressBar({ progress, debugText }: { progress: number; debugText?: string }) {
  const [anim] = useState(() => new Animated.Value(0));
  const [displayPct, setDisplayPct] = useState(0);
  const [widthPct] = useState(() => anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }));

  useEffect(() => {
    const listener = anim.addListener(({ value }) => setDisplayPct(Math.round(value)));
    return () => anim.removeListener(listener);
  }, [anim]);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: progress,
      duration: 300,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [anim, progress]);

  return (
    <>
      <View
        style={{
          width: '60%',
          maxWidth: 280,
          height: 10,
          borderRadius: 5,
          backgroundColor: '#2A2A4A',
          overflow: 'hidden',
          marginVertical: 16,
        }}
      >
        <Animated.View style={{ height: '100%', borderRadius: 5, backgroundColor: '#C77DFF', width: widthPct }} />
      </View>
      <Text style={{ color: '#C77DFF', fontSize: 13, fontWeight: '600', marginBottom: 8 }}>{displayPct}%</Text>
      {!!debugText && <Text style={styles.loadingDebugText}>{debugText}</Text>}
    </>
  );
}

type HeroesSubTab = 'summon' | 'roster' | 'batch' | 'spark';
type EquipmentSubTab = 'inventory' | 'armory' | 'craft' | 'forge';
type AchievementsSubTab = 'overview' | 'missions' | 'achievements' | 'collection' | 'codex';
type OperationsSubTab = 'facilities' | 'expeditions' | 'miniops' | 'dungeonops';
type ShopTab = 'diamond' | 'gold' | 'dollar';
type ActiveModal =
  | 'rebirth'
  | 'smartCoolantConfirm'
  | 'settings'
  | 'mail'
  | 'shop'
  | 'events'
  | 'chapterMap'
  | 'cinematicSummon'
  | 'idleChest'
  | 'diceRoll'
  | 'riftDungeon'
  | 'reconGame'
  | 'lockpickGame'
  | 'targetPracticeGame'
  | null;
type RiftBuffChoice = {
  id: string;
  name: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  dpsMult: number;
  hpMult: number;
  defenseMult: number;
};

type ReconSweepOutcome = 'intel_gold' | 'intel_shards' | 'intel_buff' | 'ambush';

interface GameScreenProps {
  accountName: string;
  onLogout: () => void;
}

export const ACH_BONUS_CAP_PCT = 75;
const FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSf6txIw9UL-F9kItXZfOfr9d0qA_XCvaNIsBUf_4NZ1HZpfrw/viewform?usp=publish-editor';
const HAS_BETA_FEEDBACK_FORM = !FEEDBACK_FORM_URL.includes('replace-with-your-beta-form');
const FALLBACK_WIKI_URL = 'https://simply-idle.vercel.app/wiki/';
const GEAR_RARITY_POINTS: Record<string, number> = {
  common: 40,
  rare: 90,
  epic: 170,
  legendary: 280,
  mythic: 430,
  transcendent: 680,
};

function scoreEquipmentForClass(
  item: { rarity: string; bonus: Record<string, number | undefined | null> },
  playerClass: PlayerClass | null,
): number {
  const cls = getClassConfig(playerClass ?? 'warrior');
  const statWeights = {
    strength: cls.physWeight,
    vitality: cls.teamWeight,
    agility: playerClass === 'archer' ? cls.physWeight * 1.15 : cls.physWeight * 0.65,
    intelligence: cls.magicWeight,
    spirit: cls.magicWeight * 0.7 + cls.teamWeight * 0.35,
  };
  const statScore = Object.entries(item.bonus).reduce((sum, [key, value]) => {
    const weight = statWeights[key as keyof typeof statWeights] ?? 0;
    return sum + (value ?? 0) * weight;
  }, 0);
  return statScore * 12 + (GEAR_RARITY_POINTS[item.rarity] ?? 0);
}

function resolveWikiUrl(): string {
  if (Platform.OS === 'web') {
    const webOrigin = globalThis?.location?.origin;
    if (typeof webOrigin === 'string' && webOrigin.length > 0) {
      return `${webOrigin.replace(/\/$/, '')}/wiki/`;
    }
  }

  const expoExtra = (Constants.expoConfig?.extra ?? Constants.manifest2?.extra ?? {}) as {
    wikiUrl?: string;
    wikiUrlWeb?: string;
  };
  const preferred = Platform.OS === 'web' ? expoExtra.wikiUrlWeb : expoExtra.wikiUrl;
  const fallback = expoExtra.wikiUrl ?? FALLBACK_WIKI_URL;
  const resolved = (preferred ?? fallback ?? '').trim();
  if (resolved.length > 0) {
    return resolved;
  }
  return FALLBACK_WIKI_URL;
}
const HAS_WIKI_URL = !resolveWikiUrl().includes('replace-with-your-wiki-url');
const VIP_LEVEL_THRESHOLDS = [0, 50, 150, 350, 700, 1500, 3000, 6500, 15000, 35000, 100000] as const;
const GOLD_SHOP_OFFERS = [
  { id: 'exp_cache', name: 'Training Cache', desc: '+6 Training Scrolls', cost: 2200 },
  { id: 'potion_bundle', name: 'Field Bundle', desc: '+3 Small Potion, +1 Grand Potion, +2 Gold Cache', cost: 3600 },
  { id: 'armory_crate', name: 'Armory Crate', desc: 'Random class-compatible gear', cost: 9500 },
] as const;
const DIAMOND_SHOP_OFFERS = [
  { id: 'coolant_i_pack', name: 'Coolant Pack I', desc: '+4 Coolant Capsule I', cost: 18 },
  { id: 'coolant_ii_pack', name: 'Coolant Pack II', desc: '+3 Coolant Capsule II', cost: 42 },
  {
    id: 'rift_raid_ticket',
    name: 'Dungeon Raid Ticket',
    desc: '+1 ticket (raids prior Rift level, no free-entry cost)',
    cost: 120,
  },
  { id: 'elite_supply', name: 'Elite Supply Crate', desc: '+5 Coolant I, +3 Coolant II, +2 Grand Potions', cost: 88 },
] as const;
const DOLLAR_SHOP_OFFERS = [
  { id: 'usd_499', label: '$4.99', diamonds: 500, vipPoints: 50, firstBonusDiamonds: 500 },
  { id: 'usd_1999', label: '$19.99', diamonds: 2200, vipPoints: 200, firstBonusDiamonds: 2200 },
  { id: 'usd_4999', label: '$49.99', diamonds: 6000, vipPoints: 500, firstBonusDiamonds: 6000 },
  { id: 'usd_9999', label: '$99.99', diamonds: 13000, vipPoints: 1000, firstBonusDiamonds: 13000 },
] as const;
const VIP_REWARD_MILESTONES = [
  { level: 1, diamonds: 50, gold: 1200, shards: 50, essence: 0 },
  { level: 2, diamonds: 100, gold: 2800, shards: 90, essence: 1 },
  { level: 3, diamonds: 180, gold: 5200, shards: 140, essence: 1 },
  { level: 4, diamonds: 300, gold: 9200, shards: 220, essence: 2 },
  { level: 5, diamonds: 500, gold: 16000, shards: 340, essence: 3 },
  { level: 6, diamonds: 800, gold: 30000, shards: 500, essence: 4 },
  { level: 7, diamonds: 1250, gold: 52000, shards: 760, essence: 6 },
  { level: 8, diamonds: 2000, gold: 90000, shards: 1100, essence: 9 },
  { level: 9, diamonds: 3200, gold: 145000, shards: 1550, essence: 13 },
  { level: 10, diamonds: 5000, gold: 220000, shards: 2200, essence: 20 },
] as const;
const VIP_UNLOCK_FEATURES = [
  { level: 1, label: 'Unlock 4x combat tempo' },
  { level: 2, label: 'Rift + Treasury daily cap increased to 4' },
  { level: 3, label: '10% summon cost discount (Boss Tears & Diamonds)' },
  { level: 4, label: 'Rift + Treasury daily cap increased to 5' },
  { level: 5, label: 'Equipment inventory cap increased from 250 to 500' },
] as const;

export default function GameScreen({ accountName, onLogout }: GameScreenProps) {
  useRenderTracker('GameScreen');
  const supportsNativeDriver = Platform.OS !== 'web';
  const [selectedCharacterClass, setSelectedCharacterClass] = useState<PlayerClass | null>(null);
  const {
    hydrated,
    loadProgress,
    onlineSyncState,
    onlineSyncAt,
    state,
    stats,
    createCharacter,
    summonHero,
    summonHeroX10Cinematic,
    sparkExchange,
    autoEquipBestHeroes,
    saveTeamLoadout,
    loadTeamLoadout,
    unlockTeamSlot,
    autoRecycleHeroes,
    setAutoRecycleMaxRarity,
    setAutoRecycleEnabled,
    toggleHeroUniqueWeapon,
    toggleEquipHero,
    playDiceRoll,
    playReconSweep,
    playLockpickCache,
    playTargetPractice,
    startMiniBountyDraft,
    claimMiniBountyDraft,
    runRiftDungeon,
    runTreasuryRaid,
    allocateStat,
    allocateStatMax,
    allocateStatN,
    burst,
    equipItem,
    recycleHero,
    rankUpHero,
    rankUpHeroToMax,
    rankUpHeroToMaxAndRebirth,
    rebirthHero,
    levelUpHeroGold,
    convertScrapToEssence,
    convertScrapToShards,
    spendRebirthCore,
    applyUsableItem,
    dismantleEquipment,
    craftEquipment,
    upgradeEquipmentRarity,
    setAutoUsePotion,
    setAutoUseCoolant,
    setAutoUsePotionThreshold,
    setAutoSummonEnabled,
    setAutoSummonMode,
    setAutoBurstEnabled,
    setCombatTempo,
    setAutoTempoEnabled,
    setAutoTempoTarget,
    buyGoldShopItem,
    buyDiamondShopItem,
    simulateDollarPurchase,
    claimVipReward,
    buyPremiumCoolant,
    autoDismantleEquipment,
    setAutoDismantleRarityFloor,
    setAutoDismantleEnabled,
    gearInventoryCap,
    spendEssenceUpgrade,
    claimWeeklyTrack,
    claimMission,
    claimCodexHeroVip,
    claimCodexUniqueVip,
    markStoryBeatSeen,
    markHintSeen,
    appendMailboxMessages,
    claimMailAttachment,
    claimAllMailAttachments,
    clearRewardPopup,
    rebirth,
    getEssenceCost,
    getRebirthCoreCost,
    getShardForgeCosts,
    getNextTeamSlotUnlock,
    getUpgradePlan,
    getWeeklyEvent,
    getMissionProgress,
    batchLevelHeroes,
    upgradeFacility,
    startExpedition,
    refreshExpeditionContracts,
    completeExpedition,
    applyOfflineProgress,
    setLastActiveAt,
    setGamePaused,
    loadDebugMessage,
  } = useGameState(
    selectedCharacterClass ? getCharacterSaveSlot(accountName, selectedCharacterClass) : '__character_slot_preview__',
  );

  const {
    lastUsedCharacterClass,
    slotSummaries,
    setSlotSummaries,
    slotListLoading,
    slotLoadProgress,
    slotLoadDebugLabel,
    clearLastUsedClass,
  } = useCharacterSlots({
    accountName,
    selectedCharacterClass,
    setSelectedCharacterClass,
    hydrated,
    state,
  });

  const [tab, setTab] = useState<Tab>('warroom');

  // ─── Tutorial gating ─────────────────────────────────────────
  const tutorialStep = getTutorialStep(
    state.seenHintIds.includes('tutorial_complete'),
    state.freeSummonCharges > 0,
    state.bossTears > 0,
    state.heroRoster.length > 0,
    state.activeTeamHeroIds.length > 0,
    state.seenHintIds.includes('tutorial_welcome_seen'),
  );
  const tutorialAllowedTabs = getTutorialAllowedTabs(tutorialStep);

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [draftName, setDraftName] = useState('');
  const [characterNameError, setCharacterNameError] = useState<string | null>(null);
  const [characterCreatePending, setCharacterCreatePending] = useState(false);
  const [draftClass, setDraftClass] = useState<PlayerClass>('warrior');
  const [expandedHeroes, setExpandedHeroes] = useState<Set<string>>(new Set());
  const [recycleConfirmUid, setRecycleConfirmUid] = useState<string | null>(null);
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null);
  const [shopTab, setShopTab] = useState<ShopTab>('diamond');
  const [heroesSubTab, setHeroesSubTab] = useState<HeroesSubTab>('summon');
  const [equipmentSubTab, setEquipmentSubTab] = useState<EquipmentSubTab>('inventory');
  const [achievementsSubTab, setAchievementsSubTab] = useState<AchievementsSubTab>('overview');
  const [operationsSubTab, setOperationsSubTab] = useState<OperationsSubTab>('facilities');
  const {
    publicUsername,
    liveLeaderboardRows,
    liveLeaderboardRank,
    liveLeaderboardLoading,
    liveLeaderboardError,
    playerBoardScore,
  } = useLeaderboard({ state, accountName, activeModal });
  const { socialPendingCount, setSocialPendingCount, mailSyncError } = useSocialServices({
    characterCreated: state.characterCreated,
    playerName: state.playerName,
    level: state.level,
    accountName,
    publicUsername,
    appendMailboxMessages,
  });
  const { isAdmin, devCommandInput, setDevCommandInput, devCommandOutput, collectCharacterSnapshots, runDevCommand } =
    useDevConsole({ accountName, publicUsername, selectedCharacterClass, state, appendMailboxMessages });
  const [compareItemId, setCompareItemId] = useState<string | null>(null);
  const [hoveredTopChipId, setHoveredTopChipId] = useState<'dps' | 'power' | 'gear' | null>(null);
  const [activeAffixTooltipId, setActiveAffixTooltipId] = useState<string | null>(null);
  const [topChipTooltipAnchor, setTopChipTooltipAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const topChipRefs = useRef<Record<'dps' | 'power' | 'gear', View | null>>({ dps: null, power: null, gear: null });
  const appStateRef = useRef(AppState.currentState);
  const backgroundTimeRef = useRef<number | null>(null);
  const heroTemplateIdByName = useMemo(() => {
    const map = new Map<string, string>();
    HERO_POOL.forEach(hero => {
      map.set(hero.name, hero.id);
    });
    return map;
  }, []);
  // warPanels state removed — War Room redesigned without accordion panels

  const [diceRollResult, setDiceRollResult] = useState<{ roll: number; diamonds: number; shards: number } | null>(null);
  const [diceIsRolling, setDiceIsRolling] = useState(false);
  const diceTranslateY = useRef(new Animated.Value(0)).current;
  const diceRotate = useRef(new Animated.Value(0)).current;
  const [diceFace, setDiceFace] = useState<number>(1);

  const [riftDungeonResult, setRiftDungeonResult] = useState<{
    waves: number;
    diamonds: number;
    shards: number;
    essence: number;
  } | null>(null);
  const [riftIsSimulating] = useState(false);

  const [reconChoices, setReconChoices] = useState<ReconSweepOutcome[]>([]);
  const [reconPickedIndex, setReconPickedIndex] = useState<number | null>(null);
  const [reconRevealInProgress, setReconRevealInProgress] = useState(false);
  const [reconRevealComplete, setReconRevealComplete] = useState(false);
  const [reconCardsRevealed, setReconCardsRevealed] = useState<boolean[]>([false, false, false]);
  const reconFlipAnims = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const reconSelectedScale = useRef(new Animated.Value(1)).current;

  const [lockpickTargetCode, setLockpickTargetCode] = useState<number>(0);
  const [lockpickGuessInput, setLockpickGuessInput] = useState('');
  const [lockpickAttemptsUsed, setLockpickAttemptsUsed] = useState(0);
  const [lockpickHintText, setLockpickHintText] = useState<string | null>(null);
  const [lockpickSolved, setLockpickSolved] = useState<boolean | null>(null);

  const [targetPracticeMeter, setTargetPracticeMeter] = useState<{ position: number; direction: 1 | -1 }>({
    position: 8,
    direction: 1,
  });
  const [targetPracticeScore, setTargetPracticeScore] = useState<number | null>(null);

  // Batch leveling state
  const [batchLevelSelected, setBatchLevelSelected] = useState<Set<string>>(new Set());
  const [batchLevelMode, setBatchLevelMode] = useState<10 | 50 | 100 | 'max'>(10);

  // Rift bonus state
  const [riftBonusRound, setRiftBonusRound] = useState(0);
  const [riftSelectedBonuses, setRiftSelectedBonuses] = useState<RiftBuffChoice[]>([]);
  const [riftCurrentBonuses, setRiftCurrentBonuses] = useState<RiftBuffChoice[]>([]);
  const [riftWavePredictions, setRiftWavePredictions] = useState<number[]>([]);

  const handleAppStateChange = useCallback(
    (nextState: typeof AppState.currentState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        if (backgroundTimeRef.current && hydrated && state.characterCreated) {
          const elapsed = Date.now() - backgroundTimeRef.current;
          if (elapsed > 5000) {
            applyOfflineProgress(elapsed);
          }
        }
        backgroundTimeRef.current = null;
      } else if (nextState.match(/inactive|background/)) {
        if (!backgroundTimeRef.current) {
          backgroundTimeRef.current = Date.now();
          if (hydrated && state.characterCreated) {
            setLastActiveAt(backgroundTimeRef.current, true);
          }
        }
      }
      appStateRef.current = nextState;
    },
    [applyOfflineProgress, hydrated, setLastActiveAt, state.characterCreated],
  );

  // Handle app state changes: track time when app goes to background
  // and apply offline progression when it returns to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [handleAppStateChange]);

  useEffect(() => {
    if (!selectedCharacterClass) return;
    setDraftClass(selectedCharacterClass);
  }, [selectedCharacterClass]);

  const selectedClassConfig = selectedCharacterClass
    ? (CLASSES.find(cls => cls.id === selectedCharacterClass) ?? CLASSES[0])
    : null;
  const occupiedCharacterCount = slotSummaries.filter(slot => slot.occupied).length;

  const classConfig = getClassConfig(state.playerClass ?? 'warrior');
  const classPassive = getClassPassive(state.playerClass ?? 'warrior');

  const monster = getMonsterForWave(state.wave);
  const monsterAffixes = getMonsterAffixes(state.wave);
  const activeAffixTooltip = monsterAffixes.find(affix => affix.id === activeAffixTooltipId) ?? null;
  const affixTotals = monsterAffixes.reduce(
    (acc, affix) => ({
      hpMult: acc.hpMult * affix.enemyHpMultiplier,
      dmgMult: acc.dmgMult * affix.enemyDamageMultiplier,
    }),
    { hpMult: 1, dmgMult: 1 },
  );
  const isBoss = state.wave % 10 === 0;
  const currentAct = getActForWave(state.wave);
  const actProgressPct =
    Math.max(
      0,
      Math.min(1, (state.wave - currentAct.startWave + 1) / (currentAct.endWave - currentAct.startWave + 1)),
    ) * 100;
  const nextBossUnlock = getBossUnlockForWave(currentAct.bossWave);
  const monsterHpPct = Math.max(0, Math.min(1, state.monsterHp / state.monsterMaxHp)) * 100;
  const teamHpPct = Math.max(0, Math.min(1, state.teamHp / state.teamMaxHp)) * 100;
  const activeTeamSet = useMemo(() => new Set(state.activeTeamHeroIds), [state.activeTeamHeroIds]);
  const usableInventory = useMemo(
    () =>
      Object.entries(state.usableItemCounts)
        .map(([id, count]) => ({ item: getUsableItem(id), count }))
        .filter(entry => entry.item && entry.count > 0),
    [state.usableItemCounts],
  );

  // Boss Tears or Diamonds are summon currencies
  const vipDiscount = state.vipLevel >= VIP_SUMMON_DISCOUNT_LEVEL ? VIP_SUMMON_DISCOUNT : 0;
  const diamondPerSummon = Math.floor(DIAMOND_SUMMON_COST * (1 - vipDiscount));
  const canGachaOnce = state.freeSummonCharges > 0 || state.bossTears >= 1 || state.diamonds >= diamondPerSummon;
  const paidX10 = Math.max(0, 10 - state.freeSummonCharges);
  const canGachaX10 =
    state.freeSummonCharges >= 10 || state.bossTears >= paidX10 || state.diamonds >= paidX10 * diamondPerSummon;
  const pityRemaining = Math.max(0, 30 - state.gachaPityCounter);
  const summonTimeline = state.summonHistory.slice(0, 12);
  const hasStatsNotification = state.unspentStatPoints > 0;
  const hasGachaNotification = canGachaOnce;

  const weeklyEvent = getWeeklyEvent();
  const shardForgeCosts = getShardForgeCosts();
  const rebirthDamageCost = getRebirthCoreCost('damage');
  const rebirthEconomyCost = getRebirthCoreCost('economy');
  const rebirthSurvivalCost = getRebirthCoreCost('survival');
  const missionCards = MISSION_BOARD_GOALS.map(m => ({
    mission: m,
    progress: getMissionProgress(m),
    claimed: state.claimedMissionIds.includes(m.id),
  }));

  const hintCandidates = useMemo(() => {
    const list: Array<{ id: string; title: string; detail: string }> = [];
    const seen = state.seenHintIds;
    const h = (id: string) => seen.includes(id);

    // --- Progressive gameplay hints (tutorial covers early basics) ---
    if (state.heroRoster.length >= 1 && state.activeTeamHeroIds.length === 0 && !h('hint_onboard_equip_hero')) {
      list.push({
        id: 'hint_onboard_equip_hero',
        title: 'Deploy Your Hero',
        detail:
          'You summoned a hero! Now add them to your active team in the Heroes tab to start dealing automatic damage.',
      });
    } else if (state.wave >= 10 && Object.keys(state.equipmentInventory).length === 0 && !h('hint_onboard_equipment')) {
      list.push({
        id: 'hint_onboard_equipment',
        title: 'Gear Up',
        detail: "Check the Equipment tab — equip weapons and armor to boost your team's stats significantly.",
      });
    } else if (state.wave >= 10 && state.unspentStatPoints > 0 && !h('hint_onboard_stats')) {
      list.push({
        id: 'hint_onboard_stats',
        title: 'Spend Stat Points',
        detail: 'You have unspent stat points! Open the Stats tab to allocate them and power up your commander.',
      });
    } else if (
      state.highestWaveReached >= getRebirthWaveRequirement(state.prestigeCount) &&
      state.prestigeCount === 0 &&
      !h('hint_onboard_rebirth')
    ) {
      list.push({
        id: 'hint_onboard_rebirth',
        title: 'First Rebirth Available',
        detail:
          "You can now Rebirth in the War Room! This resets progress but grants a permanent DPS multiplier. It's worth it.",
      });
    }

    // --- Feature unlock hints ---
    if (state.permanentUnlocks.includes('advanced_consumables') && !h('hint_consumables')) {
      list.push({
        id: 'hint_consumables',
        title: 'Advanced Consumables Unlocked',
        detail: 'New consumables now drop in battles. Use them from the Battle tab.',
      });
    }
    if (state.permanentUnlocks.includes('mythic_equipment') && !h('hint_mythic_tier')) {
      list.push({
        id: 'hint_mythic_tier',
        title: 'Mythic Tier Online',
        detail: 'You can now drop and upgrade into Mythic equipment in the Equipment tab.',
      });
    }
    return list;
  }, [
    state.permanentUnlocks,
    state.seenHintIds,
    state.wave,
    state.heroRoster.length,
    state.activeTeamHeroIds.length,
    state.equipmentInventory,
    state.unspentStatPoints,
    state.prestigeCount,
    state.highestWaveReached,
  ]);
  const activeHint = hintCandidates[0] ?? null;

  const rewardPopup = state.rewardQueue[0] ?? null;
  const unreadMailCount = state.mailbox.filter(
    mail =>
      mail.attachments.shards +
        mail.attachments.gold +
        mail.attachments.diamonds +
        mail.attachments.tears +
        mail.attachments.essence >
      0,
  ).length;
  const selectedMail = state.mailbox.find(mail => mail.id === selectedMailId) ?? null;
  const rebirthWaveRequirement = getRebirthWaveRequirement(state.prestigeCount);
  const canRebirthNow = state.highestWaveReached >= rebirthWaveRequirement;
  const teamSlotCap = Math.max(4, Math.min(ACTIVE_TEAM_SIZE, state.teamSlotsUnlocked ?? 4));
  const nextTeamSlotUnlock = getNextTeamSlotUnlock();
  const nowMs = Date.now();
  const isMiniOpReady = (lastUsedMs: number | null) => lastUsedMs == null || nowMs - lastUsedMs >= MINI_OPS_COOLDOWN_MS;
  const currentDay = Math.floor(Date.now() / 86_400_000);
  const canPlayDiceToday = isMiniOpReady(state.lastDiceRollDay);
  const canPlayReconToday = isMiniOpReady(state.lastReconSweepDay);
  const canPlayLockpickToday = isMiniOpReady(state.lastLockpickDay);
  const canPlayTargetToday = isMiniOpReady(state.lastTargetPracticeDay);
  const canStartBountyToday = isMiniOpReady(state.lastBountyDraftDay) && !state.miniBounty;
  const activeMiniBountyProgress = state.miniBounty
    ? state.miniBounty.metric === 'wave'
      ? state.wave
      : state.miniBounty.metric === 'summons'
        ? state.totalSummons
        : state.totalKills
    : 0;
  const canClaimMiniBounty = !!state.miniBounty && activeMiniBountyProgress >= state.miniBounty.targetValue;
  const riftEntryCap = state.vipLevel >= 4 ? 5 : state.vipLevel >= 2 ? 4 : 3;
  const riftEntriesUsed = state.riftEntryDay === currentDay ? state.riftEntriesUsedToday : 0;
  const riftEntriesRemaining = Math.max(0, riftEntryCap - riftEntriesUsed);
  const canRunRiftEntry = riftEntriesRemaining > 0;
  const canRaidRift = state.riftRaidTickets > 0 && state.riftDungeonLevel > 1;
  const treasuryEntryCap = state.vipLevel >= 4 ? 5 : state.vipLevel >= 2 ? 4 : 3;
  const treasuryEntriesUsed = state.treasureEntryDay === currentDay ? state.treasureEntriesUsedToday : 0;
  const treasuryEntriesRemaining = Math.max(0, treasuryEntryCap - treasuryEntriesUsed);
  const canRunTreasuryEntry = state.highestWaveReached >= 80 && treasuryEntriesRemaining > 0;
  const canRaidTreasury = state.highestWaveReached >= 80 && state.riftRaidTickets > 0 && state.treasureDungeonLevel > 1;
  // rebirthWavesLeft removed — no longer needed after War Room redesign
  const expeditionClaimableCount = state.expeditionQueue.filter(
    exp => Date.now() - exp.startTime >= exp.durationMs,
  ).length;
  const expeditionActiveTypes = new Set(state.expeditionQueue.map(exp => exp.type));
  const expeditionLaunchableAffordableCount = EXPEDITION_TYPES.filter(type => {
    if (expeditionActiveTypes.has(type)) return false;
    const rarity = state.expeditionContractOffers[type] ?? 'common';
    const cost = EXPEDITION_RARITY_META[rarity]?.goldCost ?? Number.MAX_SAFE_INTEGER;
    return state.gold >= cost;
  }).length;
  const operationsFacilities = state.guildhallFacilities;
  const facilitiesUpgradeableCount = (['training', 'treasury', 'forge', 'tactics'] as const).filter(facility => {
    const level = operationsFacilities[facility].level;
    if (level >= FACILITY_MAX_LEVEL) return false;
    const nextCost = getFacilityUpgradeCost(facility, level);
    return state.gold >= nextCost;
  }).length;
  const miniOpsNotificationCount =
    (canPlayDiceToday ? 1 : 0) +
    (canPlayReconToday ? 1 : 0) +
    (canPlayLockpickToday ? 1 : 0) +
    (canPlayTargetToday ? 1 : 0) +
    (canStartBountyToday || canClaimMiniBounty ? 1 : 0);
  const dungeonOpsNotificationCount =
    (canRunRiftEntry ? 1 : 0) + (canRaidRift ? 1 : 0) + (canRunTreasuryEntry ? 1 : 0) + (canRaidTreasury ? 1 : 0);
  const operationsNotificationCount =
    expeditionClaimableCount +
    expeditionLaunchableAffordableCount +
    facilitiesUpgradeableCount +
    miniOpsNotificationCount +
    dungeonOpsNotificationCount;
  const guidanceList = useMemo(() => {
    const recs: Array<{ title: string; detail: string; tab: Tab }> = [];
    if (canRebirthNow) {
      recs.push({
        title: 'Rebirth Ready',
        detail: 'Tap the ♾️ icon in the header or the banner on the battle tab to ascend.',
        tab: 'battle',
      });
    }
    if (state.activeTeamHeroIds.length < teamSlotCap) {
      recs.push({
        title: 'Build Full Team',
        detail: `Equip ${teamSlotCap} heroes to stabilize damage and survival.`,
        tab: 'heroes',
      });
    }
    if (state.unspentStatPoints > 0) {
      recs.push({
        title: 'Spend Stat Points',
        detail: 'Use unspent points to increase immediate power.',
        tab: 'stats',
      });
    }
    const firstUnclaimedMission = missionCards.find(m => !m.claimed && m.progress.done);
    if (firstUnclaimedMission) {
      recs.push({
        title: 'Claim Mission Reward',
        detail: `Claim "${firstUnclaimedMission.mission.title}" for instant resources.`,
        tab: 'achievements',
      });
    }
    return recs.slice(0, 3);
  }, [canRebirthNow, state.activeTeamHeroIds.length, state.unspentStatPoints, missionCards, teamSlotCap]);
  const nextGuidance = guidanceList[0];
  const extraGuidanceCount = Math.max(0, guidanceList.length - 1);
  const equipmentInventory = state.equipmentInventory;
  const getOwnedEquipmentItem = useCallback(
    (id: string | null) => (id ? (equipmentInventory[id] ?? null) : null),
    [equipmentInventory],
  );
  const equippedItemsForScore = useMemo(
    () =>
      Object.values(state.equippedItems)
        .map(id => getOwnedEquipmentItem(id))
        .filter(Boolean),
    [state.equippedItems, getOwnedEquipmentItem],
  );
  const gearScore = useMemo(() => {
    return equippedItemsForScore.reduce((sum, item) => {
      if (!item) return sum;
      return sum + scoreEquipmentForClass(item, state.playerClass);
    }, 0);
  }, [equippedItemsForScore, state.playerClass]);
  const gearScoreRows = useMemo(() => {
    return equippedItemsForScore
      .map(item => {
        if (!item) return null;
        const rarityPoints = GEAR_RARITY_POINTS[item.rarity] ?? 0;
        const statValue = Object.values(item.bonus).reduce((s: number, v) => s + Number(v ?? 0), 0);
        const statPoints = statValue * 12;
        return {
          name: item.name ?? item.id,
          rarityPoints,
          statPoints,
          total: scoreEquipmentForClass(item, state.playerClass),
        };
      })
      .filter((row): row is { name: string; rarityPoints: number; statPoints: number; total: number } => !!row);
  }, [equippedItemsForScore, state.playerClass]);
  const dpsBreakdown = useMemo(() => getDpsBreakdown(state), [state]);
  const powerFromDps = stats.dps * 0.45;
  const powerFromHp = state.teamMaxHp * 0.25;
  const powerFromDefense = stats.teamDefense * 7;
  const powerFromGear = gearScore * 15;
  const teamPowerIndex = Math.floor(powerFromDps + powerFromHp + powerFromDefense + powerFromGear);
  const effectiveTeamDps = Math.max(1, stats.dps / (affixTotals.hpMult * weeklyEvent.enemyHpMultiplier));
  const ttkSeconds = state.monsterHp / effectiveTeamDps;
  const baseEnemyDps = getMonsterDamage(state.wave) * affixTotals.dmgMult;
  const incomingAfterDefense = baseEnemyDps * (1 - Math.min(0.8, stats.teamDefense / (stats.teamDefense + 100)));
  const incomingAfterBuffs = incomingAfterDefense * (1 - stats.damageReductionBuffPct);
  const dangerScore = Math.max(0, Math.min(100, (incomingAfterBuffs / Math.max(1, state.teamHp)) * 120));
  const dangerLabel = dangerScore < 25 ? 'Low' : dangerScore < 55 ? 'Moderate' : dangerScore < 80 ? 'High' : 'Critical';
  const damageEssenceCost = getEssenceCost('damage');
  const economyEssenceCost = getEssenceCost('economy');
  const survivalEssenceCost = getEssenceCost('survival');
  const isNativeApp = Platform.OS !== 'web';
  const isCompactPhone = viewportWidth < BREAKPOINTS.compactPhone;
  const isShortPhone = viewportHeight < BREAKPOINTS.shortPhone;
  const compactSubTabMinWidth = viewportWidth < BREAKPOINTS.compactSubTab ? 92 : 108;
  const claimableWeeklyMilestones = WEEKLY_TRACK_MILESTONES.filter(
    ms => state.weeklyKills >= ms && !state.weeklyTrackClaimed.includes(ms),
  );
  const claimableMissionIds = missionCards.filter(m => !m.claimed && m.progress.done).map(m => m.mission.id);
  const hasClaimableRewards = claimableWeeklyMilestones.length > 0 || claimableMissionIds.length > 0;
  const claimableCodexHeroVipCount = Array.from(new Set(state.heroRoster.map(hero => hero.id))).filter(
    heroId => !state.codexVipClaimedHeroIds.includes(heroId),
  ).length;
  const claimableCodexUniqueVipCount = Object.entries(state.heroUniqueGearByHeroId).filter(
    ([heroId, progress]) => !!progress && (progress.rank ?? 0) > 0 && !state.codexVipClaimedUniqueIds.includes(heroId),
  ).length;
  const hasCodexClaimableRewards = claimableCodexHeroVipCount > 0 || claimableCodexUniqueVipCount > 0;
  const vipLevel = Math.max(0, Math.min(10, state.vipLevel ?? 0));
  const vipPoints = Math.max(0, state.vipPoints ?? 0);
  const vipCurrentThreshold = VIP_LEVEL_THRESHOLDS[vipLevel] ?? 0;
  const vipNextThreshold =
    vipLevel >= 10 ? vipCurrentThreshold : (VIP_LEVEL_THRESHOLDS[vipLevel + 1] ?? vipCurrentThreshold + 1);
  const requiredExp = Math.max(1, expForLevel(state.level));
  const currentExp = Math.max(0, Math.min(state.exp, requiredExp));
  const vipProgressPct =
    vipLevel >= 10
      ? 100
      : Math.max(
          0,
          Math.min(
            100,
            ((vipPoints - vipCurrentThreshold) / Math.max(1, vipNextThreshold - vipCurrentThreshold)) * 100,
          ),
        );
  const vipClaimedLevels = state.vipRewardClaimedLevels ?? [];
  const dollarFirstPurchaseClaimed = new Set(state.dollarFirstPurchaseClaimedOfferIds ?? []);
  const vipUnlockedFeatures = VIP_UNLOCK_FEATURES.filter(feature => vipLevel >= feature.level);
  const vipNextFeature = VIP_UNLOCK_FEATURES.find(feature => vipLevel < feature.level) ?? null;

  const storyEntries = useMemo(
    () =>
      STORY_BEATS.map(beat => {
        const waveReady = state.highestWaveReached >= beat.unlockWave;
        const prestigeReady = beat.unlockPrestige == null || state.prestigeCount >= beat.unlockPrestige;
        return {
          ...beat,
          hasCutscene: hasStoryCutsceneVideo(beat.id),
          unlocked: waveReady && prestigeReady,
        };
      }),
    [state.highestWaveReached, state.prestigeCount],
  );
  const nextStoryEntry = storyEntries.find(entry => !entry.unlocked) ?? null;
  const { shopFlashActionId, shopFlashAnim, vipMilestoneIndex, setVipMilestoneIndex, triggerShopButtonFlash } =
    useShopUi({
      activeModal,
      vipLevel,
      vipClaimedLevels,
      vipRewardMilestones: VIP_REWARD_MILESTONES,
    });
  const currentVipMilestone =
    VIP_REWARD_MILESTONES[Math.max(0, Math.min(VIP_REWARD_MILESTONES.length - 1, vipMilestoneIndex))];
  const currentVipMilestoneClaimed = vipClaimedLevels.includes(currentVipMilestone.level);
  const currentVipMilestoneCanClaim = !currentVipMilestoneClaimed && vipLevel >= currentVipMilestone.level;

  const { idleChestReward, setIdleChestReward, storyCutscene, setStoryCutscene, storyBeatModal, setStoryBeatModal } =
    useGameOverlays({
      storyEntries,
      seenStoryBeatIds: state.seenStoryBeatIds,
      storySequenceEnabled: hydrated && state.characterCreated,
      rewardPopup,
      activeModal,
      allowInitialStoryModal: tutorialStep === 'welcome',
      markStoryBeatSeen,
      setActiveModal: modal => setActiveModal(modal as ActiveModal),
      clearRewardPopup,
    });

  useEffect(() => {
    setGamePaused(!!storyCutscene || !!storyBeatModal);
  }, [setGamePaused, storyCutscene, storyBeatModal]);
  const hasStorySequenceOpen = !!storyCutscene || !!storyBeatModal;

  useModalOpenTelemetry({
    activeModal,
    shopTab,
    wave: state.wave,
    seasonPoints: state.seasonPoints,
    level: state.level,
    diamonds: state.diamonds,
    gold: state.gold,
  });

  const nearUnlockAchievements = useMemo(() => {
    function parseMagnitudeToken(token: string): number {
      const t = token.toLowerCase();
      if (t.endsWith('k')) return Math.floor(Number(t.slice(0, -1)) * 1000);
      if (t.endsWith('m')) return Math.floor(Number(t.slice(0, -1)) * 1_000_000);
      return Number(t);
    }

    function progressForAchievement(id: string): { label: string; value: number; target: number } | null {
      if (id === 'first_blood') return { label: 'Kills', value: state.totalKills, target: 1 };
      if (id.startsWith('kills_'))
        return { label: 'Kills', value: state.totalKills, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('wave_'))
        return { label: 'Wave', value: state.wave, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('level_'))
        return { label: 'Level', value: state.level, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('gold_'))
        return { label: 'Gold', value: state.totalGold, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('summon_'))
        return { label: 'Summons', value: state.totalSummons, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id === 'equip_5') return { label: 'Active Team', value: state.activeTeamHeroIds.length, target: 4 };
      if (id.startsWith('rebirth_'))
        return { label: 'Rebirths', value: state.prestigeCount, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('roster_'))
        return { label: 'Roster Size', value: state.heroRoster.length, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('shards_'))
        return { label: 'Shards', value: state.heroShards, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('essence_'))
        return { label: 'Essence', value: state.essence, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('unlocks_'))
        return {
          label: 'Permanent Unlocks',
          value: state.permanentUnlocks.length,
          target: parseMagnitudeToken(id.split('_')[1]),
        };
      if (id.startsWith('streak_'))
        return { label: 'Login Streak', value: state.dailyLoginStreak, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('highest_wave_'))
        return {
          label: 'Highest Wave',
          value: state.highestWaveReached,
          target: parseMagnitudeToken(id.split('_')[2]),
        };
      if (id === 'legend_slate') return { label: 'Achievements', value: state.achievements.size, target: 20 };
      return null;
    }

    return ACHIEVEMENTS.filter(ach => !state.achievements.has(ach.id))
      .map(ach => {
        const progress = progressForAchievement(ach.id);
        if (!progress) {
          return {
            ach,
            ratio: 0,
            remaining: null,
            progress: null as null | { label: string; value: number; target: number },
          };
        }
        const ratio = Math.max(0, Math.min(1, progress.value / Math.max(1, progress.target)));
        const remaining = Math.max(0, progress.target - progress.value);
        return { ach, ratio, remaining, progress };
      })
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 3);
  }, [
    state.achievements,
    state.dailyLoginStreak,
    state.essence,
    state.heroRoster.length,
    state.heroShards,
    state.highestWaveReached,
    state.level,
    state.activeTeamHeroIds.length,
    state.permanentUnlocks.length,
    state.prestigeCount,
    state.totalGold,
    state.totalKills,
    state.totalSummons,
    state.wave,
  ]);
  const topChipTooltip = useMemo(() => {
    function multLine(label: string, mult: number): string {
      const deltaPct = (mult - 1) * 100;
      const sign = deltaPct >= 0 ? '+' : '';
      return `${label}: x${mult.toFixed(2)} (${sign}${deltaPct.toFixed(1)}%)`;
    }

    if (hoveredTopChipId === 'dps') {
      return {
        title: 'DPS Breakdown',
        lines: [
          `Base player DPS: ${fmt(Math.floor(dpsBreakdown.playerBaseDps))}`,
          `Base hero DPS: ${fmt(Math.floor(dpsBreakdown.heroBaseDps))}`,
          `Total multiplier: x${dpsBreakdown.totalMultiplier.toFixed(2)}`,
          multLine('Rebirth legacy', dpsBreakdown.multipliers.rebirthLegacy),
          multLine('Achievement legacy', dpsBreakdown.multipliers.achievementLegacy),
          multLine('Meta damage path', dpsBreakdown.multipliers.metaDamage),
          multLine('Rebirth damage branch', dpsBreakdown.multipliers.rebirthDamagePath),
          multLine('Class passive', dpsBreakdown.multipliers.classPassive),
          multLine('Hero passives', dpsBreakdown.multipliers.heroPassives),
          multLine('Formation + synergy', dpsBreakdown.multipliers.formation * dpsBreakdown.multipliers.synergy),
          multLine('VIP protocol', dpsBreakdown.multipliers.vipDamage),
          multLine('Unique relic skills', dpsBreakdown.multipliers.uniqueRelics),
          multLine(
            'Mastery + temporary buff',
            dpsBreakdown.multipliers.mastery * dpsBreakdown.multipliers.temporaryBuff,
          ),
        ],
      };
    }

    if (hoveredTopChipId === 'power') {
      return {
        title: 'Power Formula',
        lines: [
          'Power = floor(DPS*0.45 + TeamHP*0.25 + Defense*7 + Gear*15)',
          `DPS term: ${fmt(Math.floor(powerFromDps))} (${fmt(stats.dps)} * 0.45)`,
          `Team HP term: ${fmt(Math.floor(powerFromHp))} (${fmt(state.teamMaxHp)} * 0.25)`,
          `Defense term: ${fmt(Math.floor(powerFromDefense))} (${fmt(stats.teamDefense)} * 7)`,
          `Gear term: ${fmt(Math.floor(powerFromGear))} (${fmt(gearScore)} * 15)`,
          `Final power: ${fmt(teamPowerIndex)}`,
        ],
      };
    }

    if (hoveredTopChipId === 'gear') {
      const rows =
        gearScoreRows.length === 0
          ? ['No equipped gear in the 3 slots.']
          : gearScoreRows.map(
              row =>
                `${row.name}: rarity ${fmt(row.rarityPoints)} + stats ${fmt(Math.floor(row.statPoints))} = ${fmt(Math.floor(row.total))}`,
            );
      return {
        title: 'Gear Score Sources',
        lines: ['Per item: rarity points + (sum of item stats * 12)', ...rows, `Total gear score: ${fmt(gearScore)}`],
      };
    }

    return null;
  }, [
    hoveredTopChipId,
    dpsBreakdown,
    powerFromDps,
    powerFromHp,
    powerFromDefense,
    powerFromGear,
    stats.dps,
    state.teamMaxHp,
    stats.teamDefense,
    gearScore,
    teamPowerIndex,
    gearScoreRows,
  ]);
  const updateTopChipAnchor = (id: 'dps' | 'power' | 'gear') => {
    const ref = topChipRefs.current[id];
    if (!ref || typeof ref.measureInWindow !== 'function') return;
    ref.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setTopChipTooltipAnchor({ x, y, width, height });
      }
    });
  };
  useEffect(() => {
    if (!hoveredTopChipId) return;
    requestAnimationFrame(() => updateTopChipAnchor(hoveredTopChipId));
  }, [hoveredTopChipId, viewportWidth, viewportHeight]);
  const topChipTooltipLayout = useMemo(() => {
    if (!topChipTooltipAnchor) return null;
    const bubbleWidth = Math.max(260, Math.min(340, viewportWidth - 20));
    const centerX = topChipTooltipAnchor.x + topChipTooltipAnchor.width / 2;
    const left = Math.max(8, Math.min(viewportWidth - bubbleWidth - 8, centerX - bubbleWidth / 2));
    const top = Math.max(8, topChipTooltipAnchor.y + topChipTooltipAnchor.height + 8);
    const arrowLeft = Math.max(12, Math.min(bubbleWidth - 18, centerX - left - 6));
    return { left, top, width: bubbleWidth, arrowLeft };
  }, [topChipTooltipAnchor, viewportWidth]);

  useEffect(() => {
    if (!activeAffixTooltipId) return;
    if (!monsterAffixes.some(affix => affix.id === activeAffixTooltipId)) {
      setActiveAffixTooltipId(null);
    }
  }, [activeAffixTooltipId, monsterAffixes]);

  // Force tab to 'battle' if current tab isn't allowed by tutorial gating
  useEffect(() => {
    if (tutorialAllowedTabs.size > 0 && !tutorialAllowedTabs.has(tab)) {
      setTab('battle');
    }
  }, [tutorialAllowedTabs, tab]);

  const onTabChange = (nextTab: Tab) => {
    debugLog('ui', 'Tab changed', { from: tab, to: nextTab, wave: state.wave });
    void trackGameplayAction('ui_tab_changed', { from: tab, to: nextTab, wave: state.wave }, 500);
    setTab(nextTab);
  };

  const getDiceOutcome = (roll: number) => {
    // Exact same formula as reducer for consistency
    const diamonds = roll === 20 ? 30 : roll >= 17 ? 18 : roll >= 13 ? 12 : roll >= 9 ? 8 : 5;
    const shards = roll >= 15 ? Math.floor(roll * 1.5 * 8) : 0; // More generous shard scaling
    return { roll, diamonds, shards };
  };

  const buildRiftChoices = (wave: number): RiftBuffChoice[] => {
    const rarityRoll = () => {
      const r = Math.random();
      if (r < 0.55) return 'common' as const;
      if (r < 0.82) return 'rare' as const;
      if (r < 0.96) return 'epic' as const;
      return 'legendary' as const;
    };
    const rarityMult: Record<RiftBuffChoice['rarity'], number> = {
      common: 1,
      rare: 1.45,
      epic: 1.95,
      legendary: 2.6,
    };
    const templates = [
      { key: 'ferocity', name: 'Ferocity Sigil', description: '+DMG', dps: 0.08, hp: 0, def: 0 },
      { key: 'bulwark', name: 'Bulwark Seal', description: '+HP', dps: 0, hp: 0.1, def: 0 },
      { key: 'aegis', name: 'Aegis Script', description: '+DEF', dps: 0, hp: 0, def: 0.1 },
      { key: 'onslaught', name: 'Onslaught Rune', description: '+DMG +DEF', dps: 0.06, hp: 0, def: 0.06 },
      { key: 'vigor', name: 'Vigor Matrix', description: '+HP +DMG', dps: 0.05, hp: 0.08, def: 0 },
    ];

    const shuffled = [...templates].sort(() => Math.random() - 0.5).slice(0, 3);
    return shuffled.map((tpl, idx) => {
      const rarity = rarityRoll();
      const mult = rarityMult[rarity] * (1 + (wave - 1) * 0.05);
      const dpsMult = 1 + tpl.dps * mult;
      const hpMult = 1 + tpl.hp * mult;
      const defenseMult = 1 + tpl.def * mult;
      return {
        id: `${tpl.key}_${wave}_${idx}_${Date.now()}`,
        name: tpl.name,
        description: `${tpl.description} (${rarity})`,
        rarity,
        dpsMult,
        hpMult,
        defenseMult,
      };
    });
  };

  const openRiftChallenge = (useRaidTicket = false) => {
    debugLog('gameplay', useRaidTicket ? 'Run Rift Raid' : 'Run Rift Entry', {
      wave: state.wave,
      highestWave: state.highestWaveReached,
      riftDungeonLevel: state.riftDungeonLevel,
      useRaidTicket,
    });
    runRiftDungeon(useRaidTicket);
  };

  const openTreasuryRaid = (useRaidTicket = false) => {
    debugLog('gameplay', useRaidTicket ? 'Run Treasury Raid Ticket' : 'Run Treasury Entry', {
      wave: state.wave,
      highestWave: state.highestWaveReached,
      treasureDungeonLevel: state.treasureDungeonLevel,
      useRaidTicket,
    });
    runTreasuryRaid(useRaidTicket);
  };

  const resetReconGame = () => {
    setActiveModal(null);
    setReconChoices([]);
    setReconPickedIndex(null);
    setReconRevealInProgress(false);
    setReconRevealComplete(false);
    setReconCardsRevealed([false, false, false]);
    reconFlipAnims.forEach(anim => anim.setValue(0));
    reconSelectedScale.setValue(1);
  };

  const openReconSweepGame = () => {
    if (!canPlayReconToday) return;
    debugLog('gameplay', 'Open Recon Sweep', { wave: state.wave });
    const pool: ReconSweepOutcome[] = ['intel_gold', 'intel_shards', 'intel_buff', 'ambush'];
    const sampled = [...pool]
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .sort(() => Math.random() - 0.5);
    setReconChoices(sampled);
    setReconPickedIndex(null);
    setReconRevealInProgress(false);
    setReconRevealComplete(false);
    setReconCardsRevealed([false, false, false]);
    reconFlipAnims.forEach(anim => anim.setValue(0));
    reconSelectedScale.setValue(1);
    setActiveModal('reconGame');
  };

  const revealReconChoice = (pickIndex: number) => {
    if (reconRevealInProgress || reconRevealComplete) return;
    setReconRevealInProgress(true);
    setReconPickedIndex(pickIndex);

    const otherIndices = [0, 1, 2].filter(index => index !== pickIndex && index < reconChoices.length);

    // Swap card content at the midpoint of each flip (when scaleX reaches 0)
    setTimeout(
      () =>
        setReconCardsRevealed(prev => {
          const n = [...prev];
          n[pickIndex] = true;
          return n;
        }),
      160,
    );
    if (otherIndices[0] !== undefined) {
      setTimeout(
        () =>
          setReconCardsRevealed(prev => {
            const n = [...prev];
            n[otherIndices[0]] = true;
            return n;
          }),
        450,
      );
    }
    if (otherIndices[1] !== undefined) {
      setTimeout(
        () =>
          setReconCardsRevealed(prev => {
            const n = [...prev];
            n[otherIndices[1]] = true;
            return n;
          }),
        710,
      );
    }
    const sequences: Animated.CompositeAnimation[] = [
      Animated.timing(reconFlipAnims[pickIndex], {
        toValue: 1,
        duration: 320,
        useNativeDriver: supportsNativeDriver,
      }),
    ];
    otherIndices.forEach(index => {
      sequences.push(
        Animated.timing(reconFlipAnims[index], {
          toValue: 1,
          duration: 260,
          useNativeDriver: supportsNativeDriver,
        }),
      );
    });

    Animated.sequence(sequences).start(() => {
      Animated.spring(reconSelectedScale, {
        toValue: 1.1,
        friction: 6,
        tension: 90,
        useNativeDriver: supportsNativeDriver,
      }).start(() => {
        setReconRevealInProgress(false);
        setReconRevealComplete(true);
      });
    });
  };

  const claimReconSweepGame = () => {
    if (reconPickedIndex == null) return;
    const outcome = reconChoices[reconPickedIndex];
    if (!outcome) return;
    debugLog('gameplay', 'Claim Recon Sweep', { outcome });
    playReconSweep(outcome);
    resetReconGame();
  };

  const openLockpickCacheGame = () => {
    if (!canPlayLockpickToday) return;
    debugLog('gameplay', 'Open Lockpick Cache', { wave: state.wave });
    setLockpickTargetCode(Math.floor(Math.random() * 90) + 10);
    setLockpickGuessInput('');
    setLockpickAttemptsUsed(0);
    setLockpickHintText('Enter a 2-digit code. You get 3 attempts.');
    setLockpickSolved(null);
    setActiveModal('lockpickGame');
  };

  const submitLockpickGuess = () => {
    if (lockpickSolved != null) return;
    const parsed = Number(lockpickGuessInput.trim());
    if (!Number.isFinite(parsed) || parsed < 10 || parsed > 99) {
      setLockpickHintText('Enter a valid number from 10 to 99.');
      return;
    }

    const guess = Math.floor(parsed);
    if (guess === lockpickTargetCode) {
      setLockpickSolved(true);
      setLockpickHintText(`Code ${lockpickTargetCode} matched. Cache unlocked.`);
      return;
    }

    const nextAttempts = lockpickAttemptsUsed + 1;
    setLockpickAttemptsUsed(nextAttempts);
    if (nextAttempts >= 3) {
      setLockpickSolved(false);
      setLockpickHintText(`Lockout triggered. Correct code was ${lockpickTargetCode}.`);
      return;
    }

    const guessD1 = Math.floor(guess / 10);
    const guessD2 = guess % 10;
    const targetD1 = Math.floor(lockpickTargetCode / 10);
    const targetD2 = lockpickTargetCode % 10;
    const d1Hint = guessD1 < targetD1 ? 'higher' : guessD1 > targetD1 ? 'lower' : 'correct';
    const d2Hint = guessD2 < targetD2 ? 'higher' : guessD2 > targetD2 ? 'lower' : 'correct';
    setLockpickHintText(
      `Access denied. 1st digit: ${d1Hint}. 2nd digit: ${d2Hint}. Attempts left: ${3 - nextAttempts}.`,
    );
  };

  const claimLockpickCacheGame = () => {
    if (lockpickSolved == null) return;
    debugLog('gameplay', 'Claim Lockpick Cache', { solved: lockpickSolved });
    playLockpickCache(lockpickSolved);
    setActiveModal(null);
    setLockpickHintText(null);
  };

  const openTargetPracticeGame = () => {
    if (!canPlayTargetToday) return;
    debugLog('gameplay', 'Open Target Practice', { wave: state.wave });
    setTargetPracticeMeter({ position: 8, direction: 1 });
    setTargetPracticeScore(null);
    setActiveModal('targetPracticeGame');
  };

  const stopTargetPractice = () => {
    if (targetPracticeScore != null) return;
    const distanceFromCenter = Math.abs(targetPracticeMeter.position - 50);
    const score = Math.max(0, Math.min(100, Math.round(100 - distanceFromCenter * 2)));
    setTargetPracticeScore(score);
  };

  const claimTargetPracticeGame = () => {
    if (targetPracticeScore == null) return;
    debugLog('gameplay', 'Claim Target Practice', { score: targetPracticeScore });
    playTargetPractice(targetPracticeScore);
    setActiveModal(null);
    setTargetPracticeScore(null);
  };

  const isTargetPracticeGameOpen = activeModal === 'targetPracticeGame';
  useEffect(() => {
    if (!isTargetPracticeGameOpen || targetPracticeScore != null) return;
    const timer = setInterval(() => {
      setTargetPracticeMeter(prev => {
        const nextPosition = prev.position + prev.direction * 3;
        if (nextPosition >= 100) {
          return { position: 100, direction: -1 };
        }
        if (nextPosition <= 0) {
          return { position: 0, direction: 1 };
        }
        return { position: nextPosition, direction: prev.direction };
      });
    }, 45);

    return () => clearInterval(timer);
  }, [isTargetPracticeGameOpen, targetPracticeScore]);

  const chooseRiftBuff = (choice: RiftBuffChoice) => {
    if (riftDungeonResult || riftIsSimulating) return;

    const nextBonuses = [...riftSelectedBonuses, choice];
    setRiftSelectedBonuses(nextBonuses);

    // Calculate wave outcome with accumulated buffs for THIS wave
    const baseDps =
      Number.isFinite(dpsBreakdown.finalDps) && dpsBreakdown.finalDps > 0
        ? dpsBreakdown.finalDps
        : Math.max(1, stats.dps);
    const cumulativeBonusMultiplier = nextBonuses.reduce((acc, b) => acc * b.dpsMult, 1);
    const teamPower = Math.max(1, baseDps) * cumulativeBonusMultiplier;
    const monsterMaxHpCalc = Math.max(1, state.monsterMaxHp);
    const expected = Math.min(5, Math.max(1, Math.floor((teamPower / (monsterMaxHpCalc * 0.12)) * 2)));

    // Use same small variance as reducer for predictability
    const variance = Math.floor(Math.random() * 3) - 1;
    const predictedWaves = Math.max(1, Math.min(5, expected + variance));

    // Track the prediction for this wave
    const newPredictions = [...riftWavePredictions, predictedWaves];
    setRiftWavePredictions(newPredictions);

    if (riftBonusRound < 5) {
      const nextRound = riftBonusRound + 1;
      setRiftBonusRound(nextRound);
      setRiftCurrentBonuses(buildRiftChoices(nextRound));
      return;
    }

    // All 5 buffs selected - finalize outcome with final prediction
    const diamonds = Math.max(8, Math.floor(8 + predictedWaves * 4 + (predictedWaves === 5 ? 8 : 0)));
    const shards = Math.max(40, Math.floor(predictedWaves * 90 * (1 + state.highestWaveReached / 250)));
    const essence = predictedWaves >= 4 ? 1 : 0;
    setRiftDungeonResult({ waves: predictedWaves, diamonds, shards, essence });
  };

  const startDiceRoll = () => {
    if (diceIsRolling || !!diceRollResult) return;

    debugLog('gameplay', 'Start Dice Roll', { wave: state.wave });
    setDiceIsRolling(true);
    const rolled = 1 + Math.floor(Math.random() * 20);
    setDiceFace(rolled);

    Animated.parallel([
      Animated.timing(diceRotate, {
        toValue: 1,
        duration: 750,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: supportsNativeDriver,
      }),
      Animated.sequence([
        Animated.timing(diceTranslateY, {
          toValue: -90,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: supportsNativeDriver,
        }),
        Animated.spring(diceTranslateY, {
          toValue: 0,
          friction: 5,
          tension: 120,
          useNativeDriver: supportsNativeDriver,
        }),
      ]),
    ]).start(() => {
      setDiceRollResult(getDiceOutcome(rolled));
      setDiceIsRolling(false);
      diceRotate.setValue(0);
      diceTranslateY.setValue(0);
    });
  };

  // toggleWarPanel removed — War Room redesigned without accordion panels

  const claimAllRewards = () => {
    claimableWeeklyMilestones.forEach(ms => claimWeeklyTrack(ms));
    claimableMissionIds.forEach(id => claimMission(id));
  };
  const cycleAutoRecycleRarity = () => {
    const idx = RARITIES.findIndex(r => r.id === state.autoRecycleMaxRarity);
    const next = RARITIES[(idx + 1) % RARITIES.length];
    setAutoRecycleMaxRarity(next.id);
  };

  const featuredSummonBanner = useMemo(() => {
    const banner = getDailyFeaturedSummonBanner();
    const featuredHero = getHeroTemplateById(banner.featuredHeroId);
    const postgameUnlocked = state.highestWaveReached >= 51;
    const highestRarity = getHighestAvailableSummonRarity(postgameUnlocked);
    return {
      ...banner,
      featuredHeroName: featuredHero?.name ?? 'Unknown Hero',
      featuredHeroEmoji: featuredHero?.emoji ?? '⭐',
      highestRarity,
    };
  }, [state.highestWaveReached]);

  const {
    summonReveal,
    cinematicSummonPhase,
    cinematicSummonResults,
    cinematicPulse,
    cinematicRevealScale,
    triggerCinematicSummon,
    closeCinematicSummon,
  } = useSummonCinematic({
    activeModal,
    setActiveModal,
    canGachaX10,
    summonHistory: state.summonHistory,
    heroTemplateIdByName,
    featuredHeroId: featuredSummonBanner.featuredHeroId,
    summonHeroX10Cinematic,
  });

  const renderSummonPortrait = (heroId: string | null, emoji: string, large = false) => {
    const portraitSource = heroId ? getHeroPortraitSource(heroId) : null;
    if (portraitSource) {
      return (
        <Image
          source={portraitSource}
          style={large ? styles.summonRevealPortrait : styles.cinematicSummonResultPortrait}
          resizeMode="cover"
        />
      );
    }
    return <Text style={large ? styles.summonRevealEmoji : styles.cinematicSummonResultEmoji}>{emoji}</Text>;
  };

  const hasWarRoomNotification = canRebirthNow;
  const hasEquipmentNotification = useMemo(() => {
    const slots: EquipmentSlot[] = ['weapon', 'armor', 'accessory'];
    return slots.some(slot => {
      const equippedId = state.equippedItems[slot];
      const equippedItem = equippedId ? (equipmentInventory[equippedId] ?? null) : null;
      const equippedScore = equippedItem
        ? scoreEquipmentForClass(equippedItem, state.playerClass)
        : Number.NEGATIVE_INFINITY;

      let bestInventoryScore = Number.NEGATIVE_INFINITY;
      for (const itemId of state.inventoryItemIds) {
        const item = equipmentInventory[itemId];
        if (!item || item.slot !== slot) continue;
        const score = scoreEquipmentForClass(item, state.playerClass);
        if (score > bestInventoryScore) bestInventoryScore = score;
      }

      return bestInventoryScore > equippedScore + 0.001;
    });
  }, [equipmentInventory, state.equippedItems, state.inventoryItemIds, state.playerClass]);
  const hasAchievementsNotification = hasClaimableRewards || hasCodexClaimableRewards;

  const optimizeEquipment = () => {
    const slots: EquipmentSlot[] = ['weapon', 'armor', 'accessory'];
    slots.forEach(slot => {
      const slotItems = state.inventoryItemIds
        .map(id => equipmentInventory[id] ?? null)
        .filter(item => !!item && item.slot === slot);
      if (slotItems.length === 0) return;
      const best = [...slotItems].sort((a, b) => {
        return scoreEquipmentForClass(b, state.playerClass) - scoreEquipmentForClass(a, state.playerClass);
      })[0];
      if (best) equipItem(best.id);
    });
  };

  const renderSubTabBar = (
    items: Array<{
      id: string;
      label: string;
      active: boolean;
      onPress: () => void;
      disabled?: boolean;
      notificationCount?: number;
    }>,
  ) => {
    const buttons = items.map(item => (
      <Pressable
        key={item.id}
        style={[
          styles.subTabBtn,
          item.active && styles.subTabBtnActive,
          item.disabled && styles.subTabBtnLocked,
          isCompactPhone && styles.subTabBtnCompact,
          isCompactPhone && { minWidth: compactSubTabMinWidth },
        ]}
        onPress={item.onPress}
        disabled={item.disabled}
      >
        {!!item.notificationCount && <View style={styles.subTabRedDot} />}
        <Text style={[styles.subTabBtnText, item.active && styles.subTabBtnTextActive]}>{item.label}</Text>
      </Pressable>
    ));

    if (isCompactPhone) {
      return (
        <ScrollView
          horizontal={true}
          showsHorizontalScrollIndicator={false}
          style={styles.subTabScroll}
          contentContainerStyle={styles.subTabBarCompact}
        >
          {buttons}
        </ScrollView>
      );
    }

    return <View style={styles.subTabBar}>{buttons}</View>;
  };

  const renderCommandDeck = () => {
    const notifications: Partial<Record<Tab, number>> = {
      warroom: hasWarRoomNotification ? 1 : 0,
      heroes: hasGachaNotification ? 1 : 0,
      stats: hasStatsNotification ? 1 : 0,
      achievements: hasAchievementsNotification ? 1 : 0,
      equipment: hasEquipmentNotification ? 1 : 0,
      operations: operationsNotificationCount,
      social: socialPendingCount,
    };

    return (
      <BottomNavigation
        activeTab={tab as BottomTabType}
        onTabChange={(nextTab: BottomTabType) => onTabChange(nextTab as Tab)}
        notifications={notifications}
        allowedTabs={tutorialAllowedTabs.size > 0 ? tutorialAllowedTabs : undefined}
      />
    );
  };

  const seasonScore = state.seasonPoints;
  const seasonRank =
    seasonScore < 1000
      ? '🥉 Bronze'
      : seasonScore < 5000
        ? '🥈 Silver'
        : seasonScore < 15000
          ? '🥇 Gold'
          : seasonScore < 40000
            ? '💎 Diamond'
            : '👑 Legend';
  const classMasteryLevel = Math.floor((state.playerClass ? state.classMasteryXp[state.playerClass] : 0) / 100);
  const campaignChapter = Math.floor((Math.max(1, state.wave) - 1) / 20) + 1;
  const campaignStage = ((Math.max(1, state.wave) - 1) % 20) + 1;
  const campaignBossStage = 20;
  const powerTier =
    teamPowerIndex < 12000
      ? 'Recruit'
      : teamPowerIndex < 55000
        ? 'Elite'
        : teamPowerIndex < 180000
          ? 'Mythic'
          : 'Ascendant';
  const guildRank =
    state.totalKills < 500
      ? 'Bronze Order'
      : state.totalKills < 2500
        ? 'Silver Order'
        : state.totalKills < 9000
          ? 'Gold Order'
          : 'Eternal Order';

  const isBossImminent = state.wave % 10 >= 8;
  const burstCost = 20;
  const burstChargePct = Math.min(100, (state.burstCharge / burstCost) * 100);
  const maxHeat = getMaxHeatForLevel(state.level);
  const heatPct = Math.min(100, Math.max(0, (state.combatHeat / maxHeat) * 100));
  const canBurst = state.burstCharge >= burstCost;
  const prestige1Done = (state.prestigeCount ?? 0) >= 1;
  const prestige5Done = (state.prestigeCount ?? 0) >= 5;
  const prestige10Done = (state.prestigeCount ?? 0) >= 10;
  const prestige25Done = (state.prestigeCount ?? 0) >= 25;
  const prestige50Done = (state.prestigeCount ?? 0) >= 50;
  const cinematicGlowOpacity = cinematicPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.22, 0.86],
  });
  const cinematicGlowScale = cinematicPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  function openCharacterSlot(playerClass: PlayerClass) {
    debugLog('character', 'Open character slot', { playerClass });
    setDraftName('');
    setCharacterNameError(null);
    setSelectedCharacterClass(playerClass);
  }

  async function deleteCharacterSlot(playerClass: PlayerClass) {
    debugLog('character', 'Delete character slot requested', { playerClass });
    const saveSlot = getCharacterSaveSlot(accountName, playerClass);
    const slotResult = await loadOnlineSave<Record<string, unknown>>(saveSlot);
    let removedCharacterName = '';
    if (slotResult.ok && slotResult.data) {
      const p = slotResult.data.payload;
      const candidateName = typeof p.playerName === 'string' ? p.playerName.trim().slice(0, 24) : '';
      if (candidateName && p.characterCreated === true) {
        removedCharacterName = candidateName;
      }
    }

    await deleteOnlineSave(saveSlot);
    if (removedCharacterName) {
      await releaseCharacterName(removedCharacterName);
    }

    await clearLastUsedClass(playerClass);

    setSlotSummaries(prev =>
      prev.map(slot =>
        slot.classId === playerClass
          ? {
              ...slot,
              occupied: false,
              playerName: null,
              level: 1,
              highestWaveReached: 1,
              vipLevel: 0,
            }
          : slot,
      ),
    );
  }

  function confirmDeleteCharacterSlot(playerClass: PlayerClass) {
    const cls = CLASSES.find(entry => entry.id === playerClass) ?? CLASSES[0];
    if (Platform.OS === 'web' && typeof globalThis.confirm === 'function') {
      const confirmed = globalThis.confirm(`Delete ${cls.name} character? This permanently removes that slot save.`);
      debugLog('character', 'Delete character slot confirm dialog (web)', { playerClass, confirmed });
      if (confirmed) {
        void deleteCharacterSlot(playerClass);
      }
      return;
    }

    Alert.alert(`Delete ${cls.name} Character?`, 'This permanently removes that slot save. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteCharacterSlot(playerClass);
        },
      },
    ]);
  }

  function returnToCharacterSelect() {
    debugLog('character', 'Return to character select');
    setActiveModal(null);
    setDraftName('');
    setCharacterNameError(null);
    setSelectedCharacterClass(null);
  }

  async function handleCreateCharacter() {
    const trimmedName = draftName.trim();
    if (!trimmedName || characterCreatePending) return;

    void trackEvent('character_creation_attempt', {
      classId: draftClass,
      nameLength: trimmedName.length,
    });

    setCharacterNameError(null);
    setCharacterCreatePending(true);

    try {
      const normalizedDraftName = normalizeCharacterNameForCompare(trimmedName);
      const snapshots = await collectCharacterSnapshots();
      const alreadyUsed = snapshots.some(
        snapshot => normalizeCharacterNameForCompare(snapshot.playerName) === normalizedDraftName,
      );
      if (alreadyUsed) {
        void trackEvent('character_creation_blocked', { reason: 'name_taken' });
        setCharacterNameError('That character name is already taken. Pick another name.');
        return;
      }

      const reserveResult = await reserveCharacterName(trimmedName, accountName);
      if (!reserveResult.ok) {
        if (reserveResult.error === 'taken') {
          void trackEvent('character_creation_blocked', { reason: 'name_taken' });
          setCharacterNameError('That character name is already taken. Pick another name.');
          return;
        }
        if (reserveResult.error === 'unavailable') {
          void trackEvent('character_creation_blocked', { reason: 'name_service_unavailable' });
          setCharacterNameError('Could not verify name availability right now. Try again in a moment.');
          return;
        }
        void trackEvent('character_creation_blocked', { reason: reserveResult.error ?? 'name_reservation_failed' });
        setCharacterNameError('Unable to reserve this character name. Please try another name.');
        return;
      }

      debugLog('character', 'Create character requested', { draftClass, nameLength: trimmedName.length });
      void trackEvent('character_creation_completed', { classId: draftClass });
      createCharacter(trimmedName, draftClass);
    } finally {
      setCharacterCreatePending(false);
    }
  }

  if (slotListLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A18" />
        <View style={styles.characterLoadingWrap}>
          <ActivityIndicator size="large" color="#C77DFF" style={styles.loadingSpinner} />
          <Text style={styles.createTitle}>Loading Characters...</Text>
          <View style={{ width: '60%', maxWidth: 280, marginVertical: 16 }}>
            <ProgressBar percent={slotLoadProgress} color="#C77DFF" height={10} borderRadius={5} />
          </View>
          <Text style={{ color: '#C77DFF', fontSize: 13, fontWeight: '600', marginBottom: 8 }}>
            {Math.round(slotLoadProgress)}%
          </Text>
          <Text style={styles.loadingDebugText}>{slotLoadDebugLabel}</Text>
          <Text style={styles.createSubtitle}>Checking your class slots for this account.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!selectedCharacterClass) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A18" />
        <ScrollView contentContainerStyle={styles.createWrap}>
          <Text style={styles.createTitle}>Choose Your Character</Text>
          <Text style={styles.createSubtitle}>
            Each account can hold up to {CLASSES.length} characters, with one slot for each class. Filled:{' '}
            {occupiedCharacterCount}/{CLASSES.length}.
          </Text>

          <View style={styles.characterSlotList}>
            {slotSummaries.map(slot => {
              const cls = CLASSES.find(entry => entry.id === slot.classId) ?? CLASSES[0];
              const isLastUsed = slot.classId === lastUsedCharacterClass && slot.occupied;
              return (
                <View
                  key={slot.classId}
                  style={[styles.characterSlotCard, slot.occupied && styles.characterSlotCardFilled]}
                >
                  <Pressable onPress={() => openCharacterSlot(slot.classId)}>
                    <View style={styles.characterSlotHeader}>
                      <Text style={styles.characterSlotTitle}>
                        {cls.emoji} {cls.name}
                      </Text>
                      <View style={styles.characterSlotBadges}>
                        <Text
                          style={[
                            styles.characterSlotBadge,
                            slot.occupied ? styles.characterSlotBadgeFilled : styles.characterSlotBadgeEmpty,
                          ]}
                        >
                          {slot.occupied ? 'EXISTING' : 'EMPTY'}
                        </Text>
                        {isLastUsed && (
                          <Text style={[styles.characterSlotBadge, styles.characterSlotBadgeLastUsed]}>LAST USED</Text>
                        )}
                      </View>
                    </View>
                    <Text style={styles.characterSlotFantasy}>{cls.fantasy}</Text>
                    <Text style={styles.characterSlotBody}>
                      {slot.occupied
                        ? `${slot.playerName} • Lv ${slot.level} • VIP ${slot.vipLevel} • Peak Wave ${slot.highestWaveReached}`
                        : `Create a ${cls.name.toLowerCase()} in this slot.`}
                    </Text>
                  </Pressable>
                  {slot.occupied && (
                    <View style={styles.characterSlotActions}>
                      <Pressable
                        style={styles.characterSlotDeleteBtn}
                        onPress={() => confirmDeleteCharacterSlot(slot.classId)}
                      >
                        <Text style={styles.characterSlotDeleteBtnText}>Delete Character</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          <Pressable style={[styles.startBtn, styles.startBtnSecondary]} onPress={onLogout}>
            <Text style={styles.startBtnTextLight}>Log Out</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A18" />
        <View style={styles.characterLoadingWrap}>
          <ActivityIndicator size="large" color="#C77DFF" style={styles.loadingSpinner} />
          <Text style={styles.createTitle}>Loading {selectedClassConfig?.name ?? 'Character'}...</Text>
          <HydrationProgressBar progress={loadProgress} debugText={loadDebugMessage} />
          <Text style={styles.createSubtitle}>Preparing your save slot.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Character creation screen
  if (!state.characterCreated) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A18" />
        <ScrollView contentContainerStyle={styles.createWrap}>
          <Pressable style={styles.characterBackBtn} onPress={returnToCharacterSelect}>
            <Text style={styles.characterBackBtnText}>← Back to Character Slots</Text>
          </Pressable>
          <Text style={styles.createTitle}>Forge Your Hero</Text>
          <Text style={styles.createSubtitle}>
            This slot is locked to {selectedClassConfig?.name}. Summon allies. Rise as their leader.
          </Text>

          <Text style={styles.fieldLabel}>Hero Name</Text>
          <TextInput
            value={draftName}
            onChangeText={(value: string) => {
              setDraftName(value);
              if (characterNameError) {
                setCharacterNameError(null);
              }
            }}
            style={styles.input}
            placeholder="Enter hero name"
            placeholderTextColor="#7575A8"
            maxLength={24}
          />
          <Text style={styles.createHint}>
            Name must be 1-24 characters. You can have one character for each class slot.
          </Text>
          {!!characterNameError && <Text style={styles.createErrorText}>{characterNameError}</Text>}

          <Text style={styles.fieldLabel}>Class</Text>
          {selectedClassConfig && (
            <View style={[styles.classCard, styles.classCardSelected]}>
              <Text style={styles.className}>
                {selectedClassConfig.emoji} {selectedClassConfig.name}
              </Text>
              <Text style={styles.classFantasy}>{selectedClassConfig.fantasy}</Text>
              <Text style={styles.classStyle}>{selectedClassConfig.style}</Text>
            </View>
          )}

          <Pressable
            style={[
              styles.startBtn,
              (draftName.trim().length === 0 || characterCreatePending) && styles.startBtnDisabled,
            ]}
            disabled={draftName.trim().length === 0 || characterCreatePending}
            onPress={() => {
              void handleCreateCharacter();
            }}
          >
            <Text style={styles.startBtnText}>{characterCreatePending ? 'Checking Name...' : 'Start Adventure'}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A18" />
      {!hasStorySequenceOpen && (
        <TutorialOverlay
          step={tutorialStep}
          onDismissWelcome={() => {
            markHintSeen('tutorial_welcome_seen');
            setTab('battle');
          }}
          onFinishTutorial={() => markHintSeen('tutorial_complete')}
        />
      )}
      <View pointerEvents="none" style={styles.sceneDecor}>
        <View style={styles.sceneOrbA} />
        <View style={styles.sceneOrbB} />
        <View style={styles.sceneGrid} />
      </View>
      {summonReveal && (
        <View pointerEvents="none" style={styles.summonRevealOverlay}>
          <View
            style={[
              styles.summonRevealCard,
              {
                borderColor: rarityConfig(summonReveal.rarity).color,
                shadowColor: rarityConfig(summonReveal.rarity).color,
              },
            ]}
          >
            <Text style={styles.summonRevealLabel}>
              {rarityConfig(summonReveal.rarity).label.toUpperCase()} RECRUIT
            </Text>
            {renderSummonPortrait(summonReveal.heroId, summonReveal.emoji, true)}
            <Text style={styles.summonRevealName}>{summonReveal.heroName}</Text>
            <Text style={styles.summonRevealSub}>Joined your squad</Text>
          </View>
        </View>
      )}

      <Modal
        transparent
        visible={activeModal === 'cinematicSummon'}
        animationType="fade"
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.cinematicSummonOverlay}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.cinematicSummonGlow,
              {
                opacity: cinematicGlowOpacity,
                transform: [{ scale: cinematicGlowScale }],
              },
            ]}
          />

          <Animated.View
            style={[
              styles.cinematicSummonCard,
              cinematicSummonPhase === 'reveal' && { transform: [{ scale: cinematicRevealScale }] },
            ]}
          >
            {cinematicSummonPhase !== 'reveal' ? (
              <>
                <Text style={styles.cinematicSummonTitle}>
                  {cinematicSummonPhase === 'charge' ? 'Charging Warp Gate' : 'Warp Corridor Open'}
                </Text>
                <Text style={styles.cinematicSummonPhaseText}>
                  {cinematicSummonPhase === 'charge'
                    ? 'Synchronizing stellar signatures for 10 arrivals...'
                    : 'Pull sequence active. Locking to highest rarity echoes...'}
                </Text>
                <Text style={styles.cinematicSummonPhaseText}>
                  {featuredSummonBanner.artEmoji} {featuredSummonBanner.title} • Featured:{' '}
                  {featuredSummonBanner.featuredHeroEmoji} {featuredSummonBanner.featuredHeroName}
                </Text>
                <Text style={styles.cinematicSummonPhaseText}>
                  Focus protocol: elevated odds for featured hero at {featuredSummonBanner.highestRarity.toUpperCase()}{' '}
                  rarity.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.cinematicSummonTitle}>Cinematic Recruit Complete</Text>
                <Text style={styles.cinematicSummonPhaseText}>+1 Free Summon bonus awarded</Text>
                <View style={styles.cinematicSummonResultsGrid}>
                  {cinematicSummonResults.map(entry => {
                    const rarity = rarityConfig(entry.rarity);
                    return (
                      <View key={entry.id} style={[styles.cinematicSummonResultCard, { borderColor: rarity.color }]}>
                        {renderSummonPortrait(entry.heroId, entry.emoji, false)}
                        <Text style={styles.cinematicSummonResultName} numberOfLines={1}>
                          {entry.heroName}
                        </Text>
                        <Text style={[styles.cinematicSummonResultRarity, { color: rarity.color }]}>
                          {rarity.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <Pressable
                  style={styles.cinematicSummonCloseBtn}
                  onPress={() => {
                    debugLog('summon', 'Close cinematic summon results', { entries: cinematicSummonResults.length });
                    closeCinematicSummon();
                  }}
                >
                  <Text style={styles.cinematicSummonCloseText}>Continue</Text>
                </Pressable>
              </>
            )}
          </Animated.View>
        </View>
      </Modal>

      {/* Header */}
      <GameHeader
        playerName={state.playerName}
        playerVipStatus={
          vipLevel >= 10 ? `VIP ${vipLevel} (MAX)` : `VIP ${vipLevel} (${fmt(vipPoints)}/${fmt(vipNextThreshold)})`
        }
        playerClass={`${stats.className} • Lv ${state.level}`}
        playerExpStatus={`EXP ${fmt(currentExp)}/${fmt(requiredExp)}`}
        onlineSyncState={onlineSyncState}
        onlineSyncAt={onlineSyncAt}
        gold={state.gold}
        diamonds={state.diamonds}
        bossTearsOrdered={state.bossTears}
        heroShards={state.heroShards}
        essence={state.essence}
        dps={Math.max(1, Math.floor(stats.dps))}
        power={teamPowerIndex}
        mailUnreadCount={unreadMailCount}
        canRebirthNow={canRebirthNow}
        onActionPress={action => {
          debugLog('ui', 'Header action pressed', { action });
          if (action === 'settings') setActiveModal('settings');
          else if (action === 'mail') {
            setActiveModal('mail');
            if (!selectedMailId && state.mailbox.length > 0) {
              setSelectedMailId(state.mailbox[0].id);
            }
          } else if (action === 'shop') setActiveModal('shop');
          else if (action === 'events') setActiveModal('events');
          else if (action === 'stats') {
            onTabChange('stats');
            setAchievementsSubTab('overview');
          }
        }}
        onRebirthPress={() => setActiveModal('rebirth')}
      />

      {(onlineSyncState === 'local-only' || onlineSyncState === 'error') && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            {onlineSyncState === 'error'
              ? '⚠️ Cloud sync error — playing offline'
              : '📡 Offline — progress saved locally'}
          </Text>
        </View>
      )}

      <View style={styles.headerQuickActionsRow}>
        <Pressable
          style={styles.headerQuickActionBtn}
          onPress={() => {
            debugLog('ui', 'Header quick action pressed', { action: 'events' });
            setActiveModal('events');
          }}
        >
          <Text style={styles.headerQuickActionText}>🗓️ Events</Text>
        </Pressable>
        <Pressable
          style={styles.headerQuickActionBtn}
          onPress={() => {
            debugLog('ui', 'Header quick action pressed', { action: 'shop' });
            setActiveModal('shop');
          }}
        >
          <Text style={styles.headerQuickActionText}>🛒 Shop</Text>
        </Pressable>
        <Pressable
          style={[styles.headerQuickActionBtn, styles.headerQuickActionBtnLogout]}
          onPress={() => {
            debugLog('auth', 'Logout pressed from game header');
            onLogout();
          }}
        >
          <Text style={styles.headerQuickActionText}>⎋ Logout</Text>
        </Pressable>
      </View>

      {topChipTooltip && topChipTooltipLayout && (
        <Modal transparent visible animationType="none" onRequestClose={() => setHoveredTopChipId(null)}>
          <View pointerEvents="none" style={styles.statChipTooltipModalRoot}>
            <View
              style={[
                styles.statChipTooltipBubbleModal,
                {
                  left: topChipTooltipLayout.left,
                  top: topChipTooltipLayout.top,
                  width: topChipTooltipLayout.width,
                },
              ]}
            >
              <View style={[styles.statChipTooltipArrowModal, { left: topChipTooltipLayout.arrowLeft }]} />
              <Text style={styles.statChipTooltipTitle}>{topChipTooltip.title}</Text>
              {topChipTooltip.lines.map((line, idx) => (
                <View key={`${topChipTooltip.title}_${idx}`} style={styles.statChipTooltipLineRow}>
                  <View style={styles.statChipTooltipBullet} />
                  <Text style={styles.statChipTooltipLine}>{line}</Text>
                </View>
              ))}
            </View>
          </View>
        </Modal>
      )}

      {!hasStorySequenceOpen && <TutorialBanner step={tutorialStep} />}

      {tutorialStep === 'done' && activeHint && (
        <View style={styles.hintBanner}>
          <View style={styles.hintBannerTop}>
            <Text style={styles.hintBannerTitle}>💡 {activeHint.title}</Text>
            <Pressable onPress={() => markHintSeen(activeHint.id)} style={styles.hintDismissBtn}>
              <Text style={styles.hintDismissBtnText}>Dismiss</Text>
            </Pressable>
          </View>
          <Text style={styles.hintBannerText}>{activeHint.detail}</Text>
        </View>
      )}

      {tutorialStep === 'done' && nextGuidance && (
        <View style={styles.nextStepBannerCompact}>
          <Pressable style={styles.nextStepChipCompact} onPress={() => onTabChange(nextGuidance.tab)}>
            <Text style={styles.nextStepChipText}>💡 {nextGuidance.title}</Text>
            <Text style={styles.nextStepChipArrow}>→</Text>
          </Pressable>
          {extraGuidanceCount > 0 && <Text style={styles.nextStepCompactMore}>+{extraGuidanceCount}</Text>}
        </View>
      )}

      <ScrollView
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        style={styles.metaStripScroll}
        contentContainerStyle={styles.metaStripRail}
      >
        <View style={styles.metaChip}>
          <Text style={styles.metaChipLabel}>Campaign</Text>
          <Text style={styles.metaChipValue}>
            Ch {campaignChapter} • {campaignStage}/{campaignBossStage}
          </Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipLabel}>Season</Text>
          <Text style={styles.metaChipValue}>
            {seasonRank} • {fmt(seasonScore)}
          </Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipLabel}>Order</Text>
          <Text style={styles.metaChipValue}>{guildRank}</Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipLabel}>Power Tier</Text>
          <Text style={styles.metaChipValue}>{powerTier}</Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipLabel}>Peak Progress</Text>
          <Text style={styles.metaChipValue}>
            {getActForWave(state.highestWaveReached).emoji} W{state.highestWaveReached}
          </Text>
        </View>
        <Pressable style={[styles.metaChip, styles.metaChipAction]} onPress={() => setActiveModal('chapterMap')}>
          <Text style={styles.metaChipLabel}>Campaign Map</Text>
          <Text style={styles.metaChipValue}>Open Route</Text>
        </Pressable>
      </ScrollView>

      {tab === 'battle' && (
        <>
          {/* Team HP Bar */}
          <View style={styles.hpSection}>
            <View style={styles.hpRow}>
              <Text style={styles.hpLabel}>💪 Team</Text>
              <ProgressBar percent={teamHpPct} color={teamHpPct > 30 ? '#33CC55' : '#EE3333'} />
              <Text style={styles.hpText}>
                {Math.ceil(state.teamHp)}/{Math.ceil(state.teamMaxHp)}
              </Text>
            </View>
          </View>

          {/* Monster Zone */}
          <View style={styles.monsterZone}>
            <Text style={styles.waveLabel}>
              {currentAct.emoji} {currentAct.name} • W{state.wave}
              {isBoss ? ' 👑' : ''}
            </Text>
            {isBossImminent && !isBoss && <Text style={styles.bossImminentText}>⚠️ Boss Approaching</Text>}
            <Text style={styles.monsterEmoji}>{monster.emoji}</Text>
            <Text style={styles.monsterName}>{monster.name}</Text>
            <ProgressBar
              percent={monsterHpPct}
              color={monsterHpPct > 50 ? '#33CC55' : monsterHpPct > 25 ? '#FFCC00' : '#EE3333'}
              style={{ width: '88%', maxWidth: 460, marginTop: 6 }}
            />
            <Text style={styles.hpText}>
              {Math.ceil(state.monsterHp)}/{Math.ceil(state.monsterMaxHp)} HP
            </Text>
            <View style={styles.affixRow}>
              {monsterAffixes.map(affix => (
                <Pressable
                  key={affix.id}
                  style={[
                    styles.affixChip,
                    { borderColor: affix.color },
                    activeAffixTooltipId === affix.id && styles.affixChipActive,
                  ]}
                  onPress={() => setActiveAffixTooltipId(current => (current === affix.id ? null : affix.id))}
                  onPressIn={() => setActiveAffixTooltipId(affix.id)}
                  onHoverIn={() => setActiveAffixTooltipId(affix.id)}
                  onHoverOut={() => setActiveAffixTooltipId(current => (current === affix.id ? null : current))}
                >
                  <Text style={[styles.affixChipText, { color: affix.color }]}>{affix.name}</Text>
                </Pressable>
              ))}
            </View>
            {activeAffixTooltip && (
              <View style={styles.affixTooltipCard}>
                <Text style={[styles.affixTooltipTitle, { color: activeAffixTooltip.color }]}>
                  {activeAffixTooltip.name}
                </Text>
                <Text style={styles.affixTooltipText}>{activeAffixTooltip.description}</Text>
              </View>
            )}
            <Text style={styles.teamSynergyInline}>
              TTK {ttkSeconds >= 99 ? '99s+' : `${ttkSeconds.toFixed(1)}s`} • Danger {dangerLabel} (
              {dangerScore.toFixed(0)}%)
            </Text>
            <Text style={styles.teamSynergyInline}>
              Rewards: 💰 {fmt(getMonsterGold(state.wave))} • ⭐ {fmt(getMonsterExp(state.wave))} EXP
              {isBoss ? ' • 👹 Boss bonus' : ''}
            </Text>
            {stats.synergies.length > 0 && (
              <Text style={styles.teamSynergyInline}>Synergies: {stats.synergies.map(s => s.name).join(' • ')}</Text>
            )}
            {(stats.damageBuffPct > 0 || stats.damageReductionBuffPct > 0) && (
              <View style={styles.monsterBuffFloatWrap} pointerEvents="none">
                {stats.damageBuffPct > 0 && (
                  <View style={styles.monsterBuffIconChip}>
                    <Text style={styles.monsterBuffIconText}>⚔️ +{Math.round(stats.damageBuffPct * 100)}%</Text>
                  </View>
                )}
                {stats.damageReductionBuffPct > 0 && (
                  <View style={[styles.monsterBuffIconChip, styles.monsterBuffIconChipDefense]}>
                    <Text style={styles.monsterBuffIconText}>
                      🛡️ -{Math.round(stats.damageReductionBuffPct * 100)}%
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </>
      )}

      {/* Tab Content */}
      <ScrollView
        style={[styles.tabContent, isCompactPhone && styles.tabContentCompact, isShortPhone && styles.tabContentShort]}
        contentContainerStyle={[styles.tabContentInner, isNativeApp && styles.tabContentInnerNative]}
      >
        <Suspense
          fallback={
            <View style={styles.tabLoadingFallback}>
              <ActivityIndicator size="small" color="#C77DFF" style={styles.loadingSpinner} />
              <Text style={styles.tabLoadingText}>Loading…</Text>
              <Text style={styles.tabLoadingDebug}>Preparing tab bundle...</Text>
            </View>
          }
        >
          <ErrorBoundary label="War Room">
            <WarroomTabContent
              {...{
                tab,
                state,
                campaignChapter,
                campaignStage,
                campaignBossStage,
                isBossImminent,
                teamPowerIndex,
                powerTier,
                nearUnlockAchievements,
                currentAct,
                actProgressPct,
                nextBossUnlock,
                unlockLabel,
                missionCards,
                weeklyEvent,
                hasClaimableRewards,
                claimableWeeklyMilestones,
                claimableMissionIds,
                prestige1Done,
                prestige5Done,
                prestige10Done,
                prestige25Done,
                prestige50Done,
                guidanceList,
                onTabChange,
                setAchievementsSubTab,
                claimAllRewards,
              }}
            />
          </ErrorBoundary>

          <ErrorBoundary label="Battle">
            <BattleTabContent
              {...{
                tab,
                state,
                stats,
                battleSpeed: state.combatTempo,
                heatPct,
                maxHeat,
                canBurst,
                burstCost,
                burstChargePct,
                teamSlotCap,
                canRebirthNow,
                rebirthWaveRequirement,
                getClassConfig,
                usableInventory,
                setCombatTempo,
                burst,
                buyPremiumCoolant,
                applyUsableItem,
                setRebirthOpen: (open: boolean) => open && setActiveModal('rebirth'),
              }}
            />
          </ErrorBoundary>
          <ErrorBoundary label="Heroes">
            <HeroesTabContent
              {...{
                tab,
                state,
                stats,
                heroesSubTab,
                setHeroesSubTab,
                batchLevelMode,
                setBatchLevelMode,
                batchLevelSelected,
                setBatchLevelSelected,
                canGachaX10,
                canGachaOnce,
                pityRemaining,
                hasGachaNotification,
                paidX10,
                diamondPerSummon,
                summonTimeline,
                rarityConfig,
                expandedHeroes,
                setExpandedHeroes,
                activeTeamSet,
                teamSlotCap,
                nextTeamSlotUnlock,
                getClassConfig,
                getHeroPassiveTraitInfo,
                getHeroActiveArchetypeInfo,
                calculateShardReward,
                getRankUpShardCost,
                getHeroGoldLevelCost,
                summonHero,
                summonHeroX10Cinematic: triggerCinematicSummon,
                sparkExchange,
                featuredSummonBanner,
                autoEquipBestHeroes,
                autoRecycleHeroes,
                saveTeamLoadout,
                loadTeamLoadout,
                toggleEquipHero,
                toggleHeroUniqueWeapon,
                rankUpHero,
                rankUpHeroToMax,
                rankUpHeroToMaxAndRebirth,
                rebirthHero,
                levelUpHeroGold,
                unlockTeamSlot,
                batchLevelHeroes,
                setRecycleConfirmUid,
                renderSubTabBar,
              }}
            />
          </ErrorBoundary>

          <ErrorBoundary label="Stats">
            <StatsTabContent
              {...{
                tab,
                state,
                stats,
                classConfig,
                classMasteryLevel,
                damageEssenceCost,
                economyEssenceCost,
                survivalEssenceCost,
                rebirthDamageCost,
                rebirthEconomyCost,
                rebirthSurvivalCost,
                classPassive,
                allocateStat,
                allocateStatN,
                allocateStatMax,
                spendEssenceUpgrade,
                spendRebirthCore,
              }}
            />
          </ErrorBoundary>

          <ErrorBoundary label="Equipment">
            <EquipmentTabContent
              {...{
                tab,
                state,
                stats,
                equipmentSubTab,
                setEquipmentSubTab,
                compareItemId,
                setCompareItemId,
                shardForgeCosts,
                getEquipmentCraftCost,
                getEquipmentItem: getOwnedEquipmentItem,
                getUpgradePlan,
                equipmentRarityConfig,
                optimizeEquipment,
                autoDismantleEquipment,
                setAutoDismantleRarityFloor,
                setAutoDismantleEnabled,
                gearInventoryCap,
                craftEquipment,
                equipItem,
                toggleHeroUniqueWeapon,
                upgradeEquipmentRarity,
                dismantleEquipment,
                convertScrapToEssence,
                convertScrapToShards,
                renderSubTabBar,
              }}
            />
          </ErrorBoundary>

          <ErrorBoundary label="Achievements">
            <AchievementsTabContent
              {...{
                tab,
                state,
                stats,
                achievementsSubTab,
                setAchievementsSubTab,
                missionCards,
                claimableWeeklyMilestones,
                claimableMissionIds,
                hasClaimableRewards,
                weeklyEvent,
                storyEntries,
                nextStoryEntry,
                claimWeeklyTrack,
                claimMission,
                claimCodexHeroVip,
                claimCodexUniqueVip,
                claimAllRewards,
                renderSubTabBar,
              }}
            />
          </ErrorBoundary>

          <ErrorBoundary label="Operations">
            <OperationsTabContent
              {...{
                tab,
                state,
                stats,
                operationsSubTab,
                setOperationsSubTab,
                canPlayDiceToday,
                canPlayReconToday,
                canPlayLockpickToday,
                canPlayTargetToday,
                canStartBountyToday,
                canClaimMiniBounty,
                activeMiniBountyProgress,
                riftDungeonLevel: state.riftDungeonLevel,
                riftEntriesUsed,
                riftEntriesRemaining,
                riftEntryCap,
                riftRaidTickets: state.riftRaidTickets,
                lastRiftBossDamagePct: state.lastRiftBossDamagePct,
                canRunRiftEntry,
                canRaidRift,
                treasureDungeonLevel: state.treasureDungeonLevel,
                treasureEntriesUsed: treasuryEntriesUsed,
                treasureEntriesRemaining: treasuryEntriesRemaining,
                treasuryEntryCap,
                lastTreasureHaulPct: state.lastTreasureHaulPct,
                lastTreasureWiped: state.lastTreasureWiped,
                canRunTreasuryEntry,
                canRaidTreasury,
                openTreasuryRaid,
                setDiceRollResult,
                setDiceIsRolling,
                setDiceRollModalOpen: (v: boolean) => (v ? setActiveModal('diceRoll') : setActiveModal(null)),
                openReconSweepGame,
                openLockpickCacheGame,
                openTargetPracticeGame,
                startMiniBountyDraft,
                claimMiniBountyDraft,
                openRiftChallenge,
                upgradeFacility,
                startExpedition,
                completeExpedition,
                refreshExpeditionContracts,
                renderSubTabBar,
              }}
            />
          </ErrorBoundary>

          <ErrorBoundary label="Social">
            <SocialTabContent
              {...{
                tab,
                accountName,
                publicUsername,
                level: state.level,
                highestWaveReached: state.highestWaveReached,
                vipLevel: state.vipLevel,
                diamonds: state.diamonds,
                saveSlotId: selectedCharacterClass ? getCharacterSaveSlot(accountName, selectedCharacterClass) : '',
                isAdmin,
                onPendingRequestsCountChange: setSocialPendingCount,
              }}
            />
          </ErrorBoundary>
        </Suspense>
      </ScrollView>

      {/* Bottom Navigation */}
      {renderCommandDeck()}

      <StoryBeatCutscene
        visible={!!storyCutscene}
        beatId={storyCutscene?.id ?? ''}
        chapter={storyCutscene?.chapter ?? ''}
        title={storyCutscene?.title ?? ''}
        body={storyCutscene?.body ?? ''}
        onContinue={() => {
          if (storyCutscene) {
            setStoryBeatModal({
              ...storyCutscene,
              presentationMode: 'brief',
            });
          }
          setStoryCutscene(null);
        }}
      />

      <StoryBeatModal
        visible={!!storyBeatModal}
        chapter={storyBeatModal?.chapter ?? ''}
        title={storyBeatModal?.title ?? ''}
        body={storyBeatModal?.body ?? ''}
        wave={storyBeatModal?.wave ?? 0}
        presentationMode={storyBeatModal?.presentationMode ?? 'full'}
        onDismiss={() => setStoryBeatModal(null)}
      />

      <Modal
        visible={activeModal === 'chapterMap'}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          debugLog('ui', 'Close campaign map modal');
          setActiveModal(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.chapterMapModalBox}>
            <View style={styles.settingsHeaderRow}>
              <Text style={styles.modalTitle}>🧭 {t('gameScreen.campaignRoute')}</Text>
              <Pressable
                style={styles.settingsCloseBtn}
                onPress={() => {
                  debugLog('ui', 'Close campaign map modal');
                  setActiveModal(null);
                }}
              >
                <Text style={styles.settingsCloseBtnText}>{t('common.close')}</Text>
              </Pressable>
            </View>
            <Text style={styles.chapterMapSubtitle}>
              {t('gameScreen.chapterStage', {
                chapter: campaignChapter,
                stage: campaignStage,
                bossStage: campaignBossStage,
              })}
            </Text>
            <View style={styles.chapterNodesWrap}>
              {Array.from({ length: campaignBossStage }, (_, i) => i + 1).map(stage => {
                const done = stage < campaignStage;
                const active = stage === campaignStage;
                const boss = stage === campaignBossStage;
                const chest = !boss && stage % 5 === 0;
                return (
                  <View
                    key={stage}
                    style={[
                      styles.chapterNode,
                      done && styles.chapterNodeDone,
                      active && styles.chapterNodeActive,
                      boss && styles.chapterNodeBoss,
                    ]}
                  >
                    <Text style={styles.chapterNodeText}>{boss ? '👑' : chest ? '🎁' : stage}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.chapterMapHint}>{t('gameScreen.chapterMapHint')}</Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={activeModal === 'idleChest'}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          debugLog('ui', 'Close idle chest modal');
          setActiveModal(null);
          setIdleChestReward(null);
          clearRewardPopup();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.idleChestModalBox}>
            <Text style={styles.idleChestModalTitle}>🎁 {t('gameScreen.returnChest')}</Text>
            <Text style={styles.idleChestModalLine}>{idleChestReward?.title ?? t('gameScreen.offlineProgress')}</Text>
            <Text style={styles.idleChestModalLine}>{idleChestReward?.detail ?? ''}</Text>
            <Pressable
              style={styles.idleChestClaimBtn}
              onPress={() => {
                debugLog('reward', 'Claim idle chest');
                setActiveModal(null);
                setIdleChestReward(null);
                clearRewardPopup();
              }}
            >
              <Text style={styles.idleChestClaimText}>{t('gameScreen.claimRewards')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Shop Modal */}
      <Modal
        visible={activeModal === 'shop'}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          debugLog('ui', 'Close shop modal', { tab: shopTab });
          setActiveModal(null);
        }}
      >
        <View style={styles.bottomSheetOverlay}>
          <View style={[styles.eventsModalBox, styles.bottomSheetBox]}>
            <View style={styles.eventsHeaderRow}>
              <Text style={styles.eventsModalTitle}>🛒 {t('gameScreen.shopTitle')}</Text>
              <Pressable
                style={styles.settingsCloseBtn}
                onPress={() => {
                  debugLog('ui', 'Close shop modal from button', { tab: shopTab });
                  setActiveModal(null);
                }}
              >
                <Text style={styles.settingsCloseBtnText}>{t('common.close')}</Text>
              </Pressable>
            </View>

            {renderSubTabBar([
              {
                id: 'diamond',
                label: t('gameScreen.diamondShop'),
                active: shopTab === 'diamond',
                onPress: () => {
                  debugLog('shop', 'Switch shop tab', { from: shopTab, to: 'diamond' });
                  setShopTab('diamond');
                },
              },
              {
                id: 'gold',
                label: t('gameScreen.goldShop'),
                active: shopTab === 'gold',
                onPress: () => {
                  debugLog('shop', 'Switch shop tab', { from: shopTab, to: 'gold' });
                  setShopTab('gold');
                },
              },
              {
                id: 'dollar',
                label: t('gameScreen.dollarShop'),
                active: shopTab === 'dollar',
                onPress: () => {
                  debugLog('shop', 'Switch shop tab', { from: shopTab, to: 'dollar' });
                  setShopTab('dollar');
                },
              },
            ])}

            <ScrollView style={styles.eventsScroll} contentContainerStyle={styles.eventsScrollContent}>
              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>👑 VIP Status</Text>
                <Text style={styles.eventsStatLine}>
                  Level: {vipLevel}/10 • Points: {fmt(vipPoints)}
                </Text>
                <Text style={styles.eventsStatLine}>
                  Bonuses: +{stats.vipDamageBonusPct.toFixed(1)}% DPS • +{stats.vipGoldBonusPct.toFixed(1)}% Gold • +
                  {stats.vipExpBonusPct.toFixed(1)}% EXP
                </Text>
                <ProgressBar percent={vipProgressPct} color="#FFE07A" />
                <Text style={styles.eventsHint}>
                  {vipLevel >= 10
                    ? 'MAX VIP reached.'
                    : `Next VIP at ${fmt(vipNextThreshold)} points (${fmt(Math.max(0, vipNextThreshold - vipPoints))} to go).`}
                </Text>
                <Text style={styles.eventsSubtitle}>Unlocked Features</Text>
                {vipUnlockedFeatures.length === 0 ? (
                  <Text style={styles.eventsHint}>
                    No VIP feature unlocks yet. Reach VIP 1 to unlock 4x combat tempo.
                  </Text>
                ) : (
                  vipUnlockedFeatures.map(feature => (
                    <Text key={feature.label} style={styles.shopFeatureUnlocked}>
                      ✓ VIP {feature.level}: {feature.label}
                    </Text>
                  ))
                )}
                {!!vipNextFeature && (
                  <Text style={styles.shopFeatureLocked}>
                    Next unlock at VIP {vipNextFeature.level}: {vipNextFeature.label}
                  </Text>
                )}
              </View>

              {shopTab === 'diamond' && (
                <View style={styles.eventsCard}>
                  <Text style={styles.eventsCardTitle}>💎 Diamond Shop</Text>
                  <Text style={styles.eventsHint}>Spend diamonds on premium consumables like heat coolants.</Text>
                  {DIAMOND_SHOP_OFFERS.map(offer => {
                    const canBuy = state.diamonds >= offer.cost;
                    const flashId = `diamond_${offer.id}`;
                    const isFlashing = shopFlashActionId === flashId;
                    const shortBy = Math.max(0, offer.cost - state.diamonds);
                    const owned =
                      offer.id === 'coolant_i_pack'
                        ? `${state.usableItemCounts.coolant_mk1 ?? 0} owned`
                        : offer.id === 'coolant_ii_pack'
                          ? `${state.usableItemCounts.coolant_mk2 ?? 0} owned`
                          : offer.id === 'elite_supply'
                            ? `${state.usableItemCounts.grand_potion ?? 0} grand potions owned`
                            : `${state.riftRaidTickets} raid tickets owned`;
                    return (
                      <View key={offer.id} style={styles.shopOfferRow}>
                        <View style={styles.shopOfferInfo}>
                          <Text style={styles.shopOfferTitle}>{offer.name}</Text>
                          <Text style={styles.shopOfferDesc}>{offer.desc}</Text>
                          <Text style={styles.shopOfferPrice}>Cost: {offer.cost} 💎</Text>
                          <Text style={styles.shopOfferHint}>{owned}</Text>
                          {!canBuy && <Text style={styles.shopOfferNeed}>Need {shortBy} more diamonds</Text>}
                        </View>
                        <Pressable
                          style={[
                            styles.eventsActionBtn,
                            styles.shopActionBtnFrame,
                            !canBuy && styles.shopBuyBtnDisabled,
                          ]}
                          disabled={!canBuy}
                          onPress={() => {
                            debugLog('shop', 'Buy diamond shop item', { offerId: offer.id, cost: offer.cost });
                            void trackGameplayAction(
                              'shop_diamond_purchase',
                              { offerId: offer.id, cost: offer.cost },
                              0,
                            );
                            buyDiamondShopItem(offer.id);
                            triggerShopButtonFlash(flashId);
                          }}
                        >
                          <Animated.View
                            pointerEvents="none"
                            style={[
                              styles.shopActionFlash,
                              {
                                opacity: isFlashing ? shopFlashAnim : 0,
                              },
                            ]}
                          />
                          <Text style={[styles.eventsActionBtnText, styles.shopActionBtnText]}>
                            {canBuy ? 'Buy Now' : 'Need 💎'}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}

              {shopTab === 'gold' && (
                <View style={styles.eventsCard}>
                  <Text style={styles.eventsCardTitle}>🪙 Gold Shop</Text>
                  <Text style={styles.eventsHint}>Spend gold on progression items, potions, and gear crates.</Text>
                  {GOLD_SHOP_OFFERS.map(offer => {
                    const canBuy = state.gold >= offer.cost;
                    const flashId = `gold_${offer.id}`;
                    const isFlashing = shopFlashActionId === flashId;
                    const shortBy = Math.max(0, offer.cost - state.gold);
                    const owned =
                      offer.id === 'exp_cache'
                        ? `${state.usableItemCounts.exp_scroll ?? 0} scrolls owned`
                        : offer.id === 'potion_bundle'
                          ? `${state.usableItemCounts.small_potion ?? 0} small / ${state.usableItemCounts.grand_potion ?? 0} grand potions`
                          : `${state.inventoryItemIds.length} gear in inventory`;
                    return (
                      <View key={offer.id} style={styles.shopOfferRow}>
                        <View style={styles.shopOfferInfo}>
                          <Text style={styles.shopOfferTitle}>{offer.name}</Text>
                          <Text style={styles.shopOfferDesc}>{offer.desc}</Text>
                          <Text style={styles.shopOfferPrice}>Cost: {fmt(offer.cost)} gold</Text>
                          <Text style={styles.shopOfferHint}>{owned}</Text>
                          {!canBuy && <Text style={styles.shopOfferNeed}>Need {fmt(shortBy)} more gold</Text>}
                        </View>
                        <Pressable
                          style={[
                            styles.eventsActionBtn,
                            styles.shopActionBtnFrame,
                            !canBuy && styles.shopBuyBtnDisabled,
                          ]}
                          disabled={!canBuy}
                          onPress={() => {
                            debugLog('shop', 'Buy gold shop item', { offerId: offer.id, cost: offer.cost });
                            void trackGameplayAction('shop_gold_purchase', { offerId: offer.id, cost: offer.cost }, 0);
                            buyGoldShopItem(offer.id);
                            triggerShopButtonFlash(flashId);
                          }}
                        >
                          <Animated.View
                            pointerEvents="none"
                            style={[
                              styles.shopActionFlash,
                              {
                                opacity: isFlashing ? shopFlashAnim : 0,
                              },
                            ]}
                          />
                          <Text style={[styles.eventsActionBtnText, styles.shopActionBtnText]}>
                            {canBuy ? 'Buy Now' : 'Need Gold'}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}

              {shopTab === 'dollar' && (
                <View style={styles.eventsCard}>
                  <Text style={styles.eventsCardTitle}>💵 Dollar Shop</Text>
                  <Text style={styles.eventsHint}>
                    {ENABLE_SIMULATED_DOLLAR_PURCHASES
                      ? 'Standard IAP flow simulation: every pack has a one-time first-purchase bonus (x2 diamonds).'
                      : 'Disabled in live balance builds to avoid free premium-currency exploits.'}
                  </Text>

                  <View style={styles.shopVipRailCard}>
                    <Text style={styles.eventsCardTitle}>🎁 VIP Milestone Rewards</Text>
                    <Text style={styles.eventsHint}>Browse tiers with arrows and claim once eligible.</Text>
                    <View style={styles.shopVipRailRow}>
                      <Pressable
                        style={[styles.shopVipArrowBtn, vipMilestoneIndex <= 0 && styles.shopBuyBtnDisabled]}
                        disabled={vipMilestoneIndex <= 0}
                        onPress={() => setVipMilestoneIndex(prev => Math.max(0, prev - 1))}
                      >
                        <Text style={styles.shopVipArrowText}>{'<'}</Text>
                      </Pressable>
                      <View style={styles.shopVipRailCenter}>
                        <Text style={styles.shopOfferTitle}>VIP {currentVipMilestone.level} Milestone</Text>
                        <Text style={styles.shopOfferDesc}>
                          +{fmt(currentVipMilestone.diamonds)} diamonds • +{fmt(currentVipMilestone.gold)} gold • +
                          {fmt(currentVipMilestone.shards)} shards
                          {currentVipMilestone.essence > 0 ? ` • +${fmt(currentVipMilestone.essence)} essence` : ''}
                        </Text>
                        <Text style={styles.shopVipTierIndex}>
                          Tier {vipMilestoneIndex + 1}/{VIP_REWARD_MILESTONES.length}
                        </Text>
                      </View>
                      <Pressable
                        style={[
                          styles.shopVipArrowBtn,
                          vipMilestoneIndex >= VIP_REWARD_MILESTONES.length - 1 && styles.shopBuyBtnDisabled,
                        ]}
                        disabled={vipMilestoneIndex >= VIP_REWARD_MILESTONES.length - 1}
                        onPress={() =>
                          setVipMilestoneIndex(prev => Math.min(VIP_REWARD_MILESTONES.length - 1, prev + 1))
                        }
                      >
                        <Text style={styles.shopVipArrowText}>{'>'}</Text>
                      </Pressable>
                    </View>
                    <Pressable
                      style={[
                        styles.eventsActionBtn,
                        styles.shopActionBtnFrame,
                        !currentVipMilestoneCanClaim && styles.shopBuyBtnDisabled,
                      ]}
                      disabled={!currentVipMilestoneCanClaim}
                      onPress={() => {
                        const flashId = `vip_reward_${currentVipMilestone.level}`;
                        debugLog('shop', 'Claim VIP reward', { level: currentVipMilestone.level });
                        void trackGameplayAction('shop_vip_reward_claimed', { level: currentVipMilestone.level }, 0);
                        claimVipReward(currentVipMilestone.level);
                        triggerShopButtonFlash(flashId);
                      }}
                    >
                      <Animated.View
                        pointerEvents="none"
                        style={[
                          styles.shopActionFlash,
                          {
                            opacity:
                              shopFlashActionId === `vip_reward_${currentVipMilestone.level}` ? shopFlashAnim : 0,
                          },
                        ]}
                      />
                      <Text style={[styles.eventsActionBtnText, styles.shopActionBtnText]}>
                        {currentVipMilestoneClaimed
                          ? 'Claimed'
                          : currentVipMilestoneCanClaim
                            ? 'Claim Reward'
                            : `Unlocks at VIP ${currentVipMilestone.level}`}
                      </Text>
                    </Pressable>
                  </View>

                  {DOLLAR_SHOP_OFFERS.map(offer => {
                    const firstBonusAvailable = !dollarFirstPurchaseClaimed.has(offer.id);
                    const flashId = `dollar_${offer.id}`;
                    const isFlashing = shopFlashActionId === flashId;
                    const totalDiamonds = offer.diamonds + (firstBonusAvailable ? offer.firstBonusDiamonds : 0);
                    return (
                      <View key={offer.id} style={styles.shopOfferRow}>
                        <View style={styles.shopOfferInfo}>
                          <Text style={styles.shopOfferTitle}>{offer.label} Pack</Text>
                          <Text style={styles.shopOfferDesc}>
                            +{fmt(totalDiamonds)} diamonds • +{offer.vipPoints} VIP points
                          </Text>
                          <Text style={styles.shopOfferPrice}>
                            {firstBonusAvailable
                              ? `First Purchase Bonus: +${fmt(offer.firstBonusDiamonds)} diamonds`
                              : 'First purchase bonus already claimed'}
                          </Text>
                        </View>
                        <Pressable
                          style={[
                            styles.eventsActionBtn,
                            styles.shopActionBtnFrame,
                            !ENABLE_SIMULATED_DOLLAR_PURCHASES && styles.shopBuyBtnDisabled,
                          ]}
                          disabled={!ENABLE_SIMULATED_DOLLAR_PURCHASES}
                          onPress={() => {
                            debugLog('shop', 'Simulate IAP dollar purchase', {
                              offerId: offer.id,
                              firstBonus: firstBonusAvailable,
                            });
                            void trackGameplayAction(
                              'shop_iap_simulated',
                              { offerId: offer.id, firstBonus: firstBonusAvailable },
                              0,
                            );
                            simulateDollarPurchase(offer.id);
                            triggerShopButtonFlash(flashId);
                          }}
                        >
                          <Animated.View
                            pointerEvents="none"
                            style={[
                              styles.shopActionFlash,
                              {
                                opacity: isFlashing ? shopFlashAnim : 0,
                              },
                            ]}
                          />
                          <Text style={[styles.eventsActionBtnText, styles.shopActionBtnText]}>
                            {ENABLE_SIMULATED_DOLLAR_PURCHASES
                              ? firstBonusAvailable
                                ? 'Sim Buy x2'
                                : 'Sim Buy'
                              : 'Unavailable'}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Events Modal */}
      <Modal
        visible={activeModal === 'events'}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          debugLog('ui', 'Close events modal');
          setActiveModal(null);
        }}
      >
        <View style={styles.bottomSheetOverlay}>
          <View style={[styles.eventsModalBox, styles.bottomSheetBox]}>
            <View style={styles.eventsHeaderRow}>
              <Text style={styles.eventsModalTitle}>🗓️ Events & Seasons</Text>
              <Pressable
                style={styles.settingsCloseBtn}
                onPress={() => {
                  debugLog('ui', 'Close events modal from button');
                  setActiveModal(null);
                }}
              >
                <Text style={styles.settingsCloseBtnText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.eventsScroll} contentContainerStyle={styles.eventsScrollContent}>
              {/* Streak Insurance */}
              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>🔥 Login Streak</Text>
                <Text style={styles.eventsStatLine}>Current Streak: {state.dailyLoginStreak ?? 0} days</Text>
                <Text style={styles.eventsStatLine}>Streak Insurance Charges: {state.streakInsuranceCharges}</Text>
                <ProgressBar percent={Math.min(100, ((state.dailyLoginStreak ?? 0) / 30) * 100)} color="#FFB347" />
                <Text style={styles.eventsHint}>
                  {Math.max(0, 30 - (state.dailyLoginStreak ?? 0))} days to streak milestone (30 days). Gain +1
                  insurance every 7-day streak.
                </Text>
              </View>

              {/* Weekly Event */}
              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>
                  {weeklyEvent.emoji} Weekly Event: {weeklyEvent.name}
                </Text>
                <Text style={styles.eventsStatLine}>{weeklyEvent.description}</Text>
                <Text style={styles.eventsStatLine}>Weekly Kills: {state.weeklyKills}</Text>
                <Text style={styles.eventsHint}>Earn kills to claim milestone rewards on the Achievements tab.</Text>
                <Pressable
                  style={styles.eventsActionBtn}
                  onPress={() => {
                    debugLog('ui', 'Navigate to weekly achievements from events');
                    setActiveModal(null);
                    onTabChange('achievements');
                    setAchievementsSubTab('missions');
                  }}
                >
                  <Text style={styles.eventsActionBtnText}>View Mission Board</Text>
                </Pressable>
              </View>

              {/* Seasonal Ladder */}
              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>🏆 Season Ladder</Text>
                <Text style={styles.eventsSubtitle}>Season score: {fmt(seasonScore)} pts</Text>
                <Text style={styles.eventsStatLine}>Best this season: {fmt(state.bestSeasonPoints)} pts</Text>
                <Text style={styles.eventsStatLine}>
                  Peak progress: {getActForWave(state.highestWaveReached).emoji}{' '}
                  {getActForWave(state.highestWaveReached).name} • W{state.highestWaveReached}
                </Text>
                <Text style={[styles.seasonRankBadge]}>{seasonRank}</Text>
                <Text style={styles.eventsHint}>
                  Score based on wave progression + rebirths. Top ranks earn cosmetic banners at season end.
                </Text>
                {[
                  { rank: '🥉 Bronze', threshold: 0, banner: 'Iron Commander' },
                  { rank: '🥈 Silver', threshold: 1000, banner: 'Silver Vanguard' },
                  { rank: '🥇 Gold', threshold: 5000, banner: 'Gold Legion' },
                  { rank: '💎 Diamond', threshold: 15000, banner: 'Diamond Warlord' },
                  { rank: '👑 Legend', threshold: 40000, banner: 'Eternal Legend' },
                ].map(tier => (
                  <View
                    key={tier.rank}
                    style={[styles.ladderTierRow, seasonScore >= tier.threshold && styles.ladderTierActive]}
                  >
                    <Text style={styles.ladderTierRank}>{tier.rank}</Text>
                    <Text style={styles.ladderTierInfo}>
                      {tier.threshold > 0 ? `${fmt(tier.threshold)} pts` : 'Start'} — Banner: {tier.banner}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>🌐 Global Leaderboard</Text>
                <Text style={styles.eventsSubtitle}>
                  Current rank: #{liveLeaderboardRank ?? '-'} • Score {fmt(playerBoardScore)}
                </Text>
                {liveLeaderboardLoading && <Text style={styles.eventsHint}>Updating leaderboard...</Text>}
                {!!liveLeaderboardError && <Text style={styles.eventsHint}>{liveLeaderboardError}</Text>}
                {liveLeaderboardRows.map(row => (
                  <View
                    key={`${row.name}_${row.rank}`}
                    style={[styles.betaBoardRow, row.isYou && styles.betaBoardRowYou]}
                  >
                    <Text style={styles.betaBoardRank}>#{row.rank}</Text>
                    <Text style={styles.betaBoardName}>
                      {row.badge} {row.name}
                      {row.isYou ? ' (You)' : ''}
                    </Text>
                    <Text style={styles.betaBoardScore}>{fmt(row.score)}</Text>
                  </View>
                ))}
                <Text style={styles.eventsHint}>Live leaderboard is synced to Firebase while you are signed in.</Text>
              </View>

              {/* Formation Info */}
              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>⚔️ Formation Bonuses</Text>
                <Text style={styles.eventsSubtitle}>Assign hero roles in your active team (tap badge to cycle)</Text>
                {[
                  { role: '🛡️ Front', perk: 'Tank stance: higher survivability, slower casts' },
                  { role: '⚔️ Mid', perk: 'Balanced stance: mixed offense/defense' },
                  { role: '🏹 Back', perk: 'Artillery stance: more DPS and faster active procs, squishier' },
                ].map(row => (
                  <View key={row.role} style={styles.formationInfoRow}>
                    <Text style={styles.formationInfoRole}>{row.role}</Text>
                    <Text style={styles.formationInfoPerk}>{row.perk}</Text>
                  </View>
                ))}
                <Text style={styles.eventsHint}>
                  Live Team Effect: {stats.formation.dpsBonusPct >= 0 ? '+' : ''}
                  {stats.formation.dpsBonusPct.toFixed(1)}% DPS • {stats.formation.hpBonusPct >= 0 ? '+' : ''}
                  {stats.formation.hpBonusPct.toFixed(1)}% HP • {stats.formation.incomingDeltaPct >= 0 ? '-' : '+'}
                  {Math.abs(stats.formation.incomingDeltaPct).toFixed(1)}% incoming damage
                </Text>
              </View>

              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>🧬 Team Synergy Sets</Text>
                <Text style={styles.eventsSubtitle}>Class and faction combos unlock passive bonuses.</Text>
                {stats.synergies.length === 0 ? (
                  <Text style={styles.eventsHint}>
                    No active set bonuses yet. Mix classes and factions in your active team.
                  </Text>
                ) : (
                  stats.synergies.map(syn => (
                    <View key={syn.id} style={styles.formationInfoRow}>
                      <Text style={styles.formationInfoRole}>{syn.name}</Text>
                      <Text style={styles.formationInfoPerk}>{syn.effect}</Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Recycle Confirmation Modal */}
      {recycleConfirmUid &&
        (() => {
          const hero = state.heroRoster.find(h => h.uid === recycleConfirmUid);
          if (!hero) return null;
          const shardValue = calculateShardReward(hero.rarity, hero.level);
          return (
            <Modal
              visible={true}
              transparent={true}
              animationType="fade"
              onRequestClose={() => {
                debugLog('ui', 'Close recycle confirm modal');
                setRecycleConfirmUid(null);
              }}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.modalBox}>
                  <Text style={styles.modalTitle}>Recycle Hero?</Text>
                  <Text style={styles.modalContent}>
                    {hero.emoji} {hero.name} will be sacrificed for {shardValue} ✨
                  </Text>
                  <Text style={styles.modalWarning}>This is irreversible!</Text>
                  <View style={styles.modalButtons}>
                    <Pressable
                      style={[styles.modalBtn, styles.modalBtnCancel]}
                      onPress={() => {
                        debugLog('ui', 'Cancel recycle hero');
                        setRecycleConfirmUid(null);
                      }}
                    >
                      <Text style={styles.modalBtnText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalBtn, styles.modalBtnConfirm]}
                      onPress={() => {
                        debugLog('hero', 'Confirm recycle hero', { heroId: recycleConfirmUid, reward: shardValue });
                        void trackGameplayAction('hero_recycled', { heroId: recycleConfirmUid, reward: shardValue }, 0);
                        recycleHero(recycleConfirmUid);
                        setRecycleConfirmUid(null);
                      }}
                    >
                      <Text style={styles.modalBtnTextConfirm}>Recycle</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>
          );
        })()}

      <Modal
        visible={activeModal === 'smartCoolantConfirm'}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          debugLog('ui', 'Close smart coolant confirm modal');
          setActiveModal(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Enable Smart Coolant?</Text>
            <Text style={styles.modalContent}>
              Smart Use will automatically spend coolant when combat heat gets close to overheat.
            </Text>
            <Text style={styles.modalWarning}>
              Coolant is a premium consumable and costs diamonds to replace. Only enable this if you want automation
              spending those items.
            </Text>
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => {
                  debugLog('ui', 'Cancel smart coolant enable');
                  setActiveModal(null);
                }}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={() => {
                  debugLog('settings', 'Enable smart coolant');
                  void trackGameplayAction('smart_coolant_enabled', {}, 0);
                  setAutoUseCoolant(true);
                  setActiveModal(null);
                }}
              >
                <Text style={styles.modalBtnTextConfirm}>Enable</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={activeModal === 'settings'}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          debugLog('ui', 'Close settings modal');
          setActiveModal(null);
        }}
      >
        <View style={styles.bottomSheetOverlay}>
          <View style={[styles.settingsModalBox, styles.bottomSheetBox]}>
            <View style={styles.settingsHeaderRow}>
              <Text style={styles.modalTitle}>⚙️ Settings & Automation</Text>
              <Pressable
                style={styles.settingsCloseBtn}
                onPress={() => {
                  debugLog('ui', 'Close settings modal from button');
                  setActiveModal(null);
                }}
              >
                <Text style={styles.settingsCloseBtnText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.settingsScroll}>
              <View style={styles.settingsCard}>
                <Text style={styles.settingsCardTitle}>Character Slots</Text>
                <Text style={styles.settingsLabel}>
                  Switch between your class-bound character slots or create a new one if an empty slot remains.
                </Text>
                <Pressable
                  style={styles.settingsCycleBtn}
                  onPress={() => {
                    debugLog('settings', 'Switch character from settings');
                    returnToCharacterSelect();
                  }}
                >
                  <Text style={styles.settingsCycleBtnText}>Switch Character</Text>
                </Pressable>
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsCardTitle}>Beta Feedback</Text>
                <Text style={styles.settingsLabel}>
                  {HAS_BETA_FEEDBACK_FORM
                    ? 'Send bugs, balance notes, and QoL requests to the beta board.'
                    : 'Feedback form is not configured yet. Add a live form URL before enabling this action.'}
                </Text>
                <Pressable
                  style={[styles.settingsCycleBtn, !HAS_BETA_FEEDBACK_FORM && styles.shopBuyBtnDisabled]}
                  disabled={!HAS_BETA_FEEDBACK_FORM}
                  onPress={() => {
                    debugLog('settings', 'Open feedback form');
                    void trackEvent('feedback_link_opened', { source: 'settings' });
                    void Linking.openURL(FEEDBACK_FORM_URL);
                  }}
                >
                  <Text style={styles.settingsCycleBtnText}>
                    {HAS_BETA_FEEDBACK_FORM ? 'Open Feedback Form' : 'Feedback Form Soon'}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsCardTitle}>Wiki & Guides</Text>
                <Text style={styles.settingsLabel}>
                  {HAS_WIKI_URL
                    ? 'Open the official SimplyIdle wiki for guides, formulas, and system references.'
                    : 'Wiki URL is not configured yet. Add a live wiki URL before enabling this action.'}
                </Text>
                <Pressable
                  style={[styles.settingsCycleBtn, !HAS_WIKI_URL && styles.shopBuyBtnDisabled]}
                  disabled={!HAS_WIKI_URL}
                  onPress={() => {
                    const wikiUrl = resolveWikiUrl();
                    debugLog('settings', 'Open wiki', { wikiUrl });
                    void trackEvent('wiki_link_opened', { source: 'settings', wikiUrl });
                    void Linking.openURL(wikiUrl);
                  }}
                >
                  <Text style={styles.settingsCycleBtnText}>
                    {HAS_WIKI_URL ? 'Open Wiki Home' : 'Wiki Coming Soon'}
                  </Text>
                </Pressable>
                {HAS_WIKI_URL && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {[
                      { label: '⚙️ Core Mechanics', path: 'core-mechanics' },
                      { label: '🦸 Heroes', path: 'heroes' },
                      { label: '🎒 Equipment', path: 'equipment' },
                      { label: '📈 Strategy', path: 'strategy' },
                      { label: '🏆 Seasons', path: 'seasons-leaderboard' },
                      { label: '👥 Social', path: 'social' },
                    ].map(link => (
                      <Pressable
                        key={link.path}
                        style={{
                          backgroundColor: '#1a2a3a',
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 6,
                        }}
                        onPress={() => {
                          const url = `${resolveWikiUrl()}${link.path}`;
                          void trackEvent('wiki_link_opened', { source: 'settings_quick', page: link.path });
                          void Linking.openURL(url);
                        }}
                      >
                        <Text style={{ color: '#8BB8E8', fontSize: 12 }}>{link.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              {isAdmin && (
                <View style={styles.settingsCard}>
                  <Text style={styles.settingsCardTitle}>Dev Mail Console</Text>
                  <Text style={styles.settingsLabel}>Use /devHelp to list all available commands.</Text>
                  <View style={styles.devCommandRow}>
                    <TextInput
                      style={styles.devCommandInput}
                      placeholder="/devHelp"
                      placeholderTextColor="#7F9CB8"
                      value={devCommandInput}
                      onChangeText={setDevCommandInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Pressable
                      style={styles.settingsCycleBtn}
                      onPress={() => {
                        void runDevCommand();
                      }}
                    >
                      <Text style={styles.settingsCycleBtnText}>Run</Text>
                    </Pressable>
                  </View>
                  {!!devCommandOutput && <Text style={styles.devCommandOutput}>{devCommandOutput}</Text>}
                </View>
              )}

              <View style={styles.settingsCard}>
                <Text style={styles.settingsCardTitle}>Auto Potion</Text>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Enabled</Text>
                  <Pressable
                    style={[styles.settingsToggleBtn, state.autoUsePotionEnabled && styles.settingsToggleBtnActive]}
                    onPress={() => {
                      debugLog('settings', 'Toggle auto potion', { nextState: !state.autoUsePotionEnabled });
                      void trackGameplayAction(
                        'setting_auto_potion_toggled',
                        { enabled: !state.autoUsePotionEnabled },
                        0,
                      );
                      setAutoUsePotion(!state.autoUsePotionEnabled);
                    }}
                  >
                    <Text style={styles.settingsToggleText}>{state.autoUsePotionEnabled ? 'ON' : 'OFF'}</Text>
                  </Pressable>
                </View>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Trigger HP</Text>
                  <View style={styles.settingsAdjustWrap}>
                    <Pressable
                      style={styles.autoPotionAdjustBtn}
                      onPress={() => {
                        const nextValue = state.autoUsePotionThresholdPct - 0.05;
                        debugLog('settings', 'Decrease auto potion threshold', {
                          from: state.autoUsePotionThresholdPct,
                          to: nextValue,
                        });
                        setAutoUsePotionThreshold(nextValue);
                      }}
                    >
                      <Text style={styles.autoPotionAdjustText}>-</Text>
                    </Pressable>
                    <Text style={styles.settingsValueText}>{(state.autoUsePotionThresholdPct * 100).toFixed(0)}%</Text>
                    <Pressable
                      style={styles.autoPotionAdjustBtn}
                      onPress={() => {
                        const nextValue = state.autoUsePotionThresholdPct + 0.05;
                        debugLog('settings', 'Increase auto potion threshold', {
                          from: state.autoUsePotionThresholdPct,
                          to: nextValue,
                        });
                        setAutoUsePotionThreshold(nextValue);
                      }}
                    >
                      <Text style={styles.autoPotionAdjustText}>+</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.settingsSubCard}>
                  <View style={styles.settingsRowBetween}>
                    <View style={styles.settingsSubLabelWrap}>
                      <Text style={styles.settingsLabel}>Smart Use Coolant</Text>
                      <Text style={styles.settingsHintText}>
                        Adds premium coolant to auto-consumables. Auto Potion remains the master toggle for this
                        section.
                      </Text>
                    </View>
                    <Pressable
                      style={[styles.settingsToggleBtn, state.autoUseCoolantEnabled && styles.settingsToggleBtnActive]}
                      onPress={() => {
                        if (state.autoUseCoolantEnabled) {
                          debugLog('settings', 'Disable smart coolant');
                          void trackGameplayAction('smart_coolant_disabled', {}, 0);
                          setAutoUseCoolant(false);
                          return;
                        }
                        debugLog('settings', 'Open smart coolant confirmation');
                        setActiveModal(null);
                        setActiveModal('smartCoolantConfirm');
                      }}
                    >
                      <Text style={styles.settingsToggleText}>{state.autoUseCoolantEnabled ? 'ON' : 'OFF'}</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.settingsSubtleText}>
                    Smart Use prefers 🧊 first and escalates to ❄️ only when heat is close to cap.
                  </Text>
                </View>
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsCardTitle}>Auto Recycle</Text>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Enabled</Text>
                  <Pressable
                    style={[styles.settingsToggleBtn, state.autoRecycleEnabled && styles.settingsToggleBtnActive]}
                    onPress={() => {
                      debugLog('settings', 'Toggle auto recycle', { nextState: !state.autoRecycleEnabled });
                      void trackGameplayAction(
                        'setting_auto_recycle_toggled',
                        { enabled: !state.autoRecycleEnabled },
                        0,
                      );
                      setAutoRecycleEnabled(!state.autoRecycleEnabled);
                    }}
                  >
                    <Text style={styles.settingsToggleText}>{state.autoRecycleEnabled ? 'ON' : 'OFF'}</Text>
                  </Pressable>
                </View>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Max Rarity</Text>
                  <Pressable
                    style={styles.settingsCycleBtn}
                    onPress={() => {
                      debugLog('settings', 'Cycle auto recycle max rarity', { from: state.autoRecycleMaxRarity });
                      cycleAutoRecycleRarity();
                    }}
                  >
                    <Text style={styles.settingsCycleBtnText}>{state.autoRecycleMaxRarity.toUpperCase()}</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsCardTitle}>Auto Summon</Text>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Enabled</Text>
                  <Pressable
                    style={[styles.settingsToggleBtn, state.autoSummonEnabled && styles.settingsToggleBtnActive]}
                    onPress={() => {
                      debugLog('settings', 'Toggle auto summon', { nextState: !state.autoSummonEnabled });
                      void trackGameplayAction('setting_auto_summon_toggled', { enabled: !state.autoSummonEnabled }, 0);
                      setAutoSummonEnabled(!state.autoSummonEnabled);
                    }}
                  >
                    <Text style={styles.settingsToggleText}>{state.autoSummonEnabled ? 'ON' : 'OFF'}</Text>
                  </Pressable>
                </View>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Mode</Text>
                  <Pressable
                    style={styles.settingsCycleBtn}
                    onPress={() => {
                      const nextMode = state.autoSummonMode === 'single' ? 'x10' : 'single';
                      debugLog('settings', 'Change auto summon mode', { from: state.autoSummonMode, to: nextMode });
                      void trackGameplayAction('setting_auto_summon_mode_changed', { mode: nextMode }, 0);
                      setAutoSummonMode(nextMode);
                    }}
                  >
                    <Text style={styles.settingsCycleBtnText}>{state.autoSummonMode.toUpperCase()}</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsCardTitle}>Auto Burst</Text>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Enabled</Text>
                  <Pressable
                    style={[styles.settingsToggleBtn, state.autoBurstEnabled && styles.settingsToggleBtnActive]}
                    onPress={() => setAutoBurstEnabled(!state.autoBurstEnabled)}
                  >
                    <Text style={styles.settingsToggleText}>{state.autoBurstEnabled ? 'ON' : 'OFF'}</Text>
                  </Pressable>
                </View>
                <Text style={styles.settingsHintText}>
                  When burst charge reaches 15, it auto-fires with tempo-scaled hits.
                </Text>
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsCardTitle}>Auto Tempo</Text>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Enabled</Text>
                  <Pressable
                    style={[styles.settingsToggleBtn, state.autoTempoEnabled && styles.settingsToggleBtnActive]}
                    onPress={() => setAutoTempoEnabled(!state.autoTempoEnabled)}
                  >
                    <Text style={styles.settingsToggleText}>{state.autoTempoEnabled ? 'ON' : 'OFF'}</Text>
                  </Pressable>
                </View>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Tempo At Heat 0</Text>
                  <Pressable
                    style={[styles.settingsCycleBtn, (state.vipLevel ?? 0) < 1 && styles.settingsCycleBtnDisabled]}
                    onPress={() =>
                      setAutoTempoTarget((state.vipLevel ?? 0) < 1 ? 2 : state.autoTempoTarget === 2 ? 4 : 2)
                    }
                    disabled={(state.vipLevel ?? 0) < 1}
                  >
                    <Text style={styles.settingsCycleBtnText}>{state.autoTempoTarget}x</Text>
                  </Pressable>
                </View>
                <Text style={styles.settingsHintText}>
                  At heat 0, auto tempo re-engages from 1x to your selected target.
                </Text>
                {(state.vipLevel ?? 0) < 1 && (
                  <Text style={styles.settingsHintText}>4x auto tempo unlocks at VIP 1.</Text>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={activeModal === 'mail'}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          debugLog('ui', 'Close mail modal');
          setActiveModal(null);
        }}
      >
        <View style={styles.bottomSheetOverlay}>
          <View style={[styles.settingsModalBox, styles.bottomSheetBox]}>
            <View style={styles.settingsHeaderRow}>
              <Text style={styles.modalTitle}>✉️ Mailbox</Text>
              <Pressable style={styles.settingsCloseBtn} onPress={() => setActiveModal(null)}>
                <Text style={styles.settingsCloseBtnText}>Close</Text>
              </Pressable>
            </View>
            <View style={styles.mailboxHeaderRow}>
              <Text style={styles.settingsLabel}>Letters: {state.mailbox.length}</Text>
              <Pressable
                style={[styles.settingsCycleBtn, unreadMailCount === 0 && styles.settingsCycleBtnDisabled]}
                disabled={unreadMailCount === 0}
                onPress={() => claimAllMailAttachments()}
              >
                <Text style={styles.settingsCycleBtnText}>Quick Claim All</Text>
              </Pressable>
            </View>

            {mailSyncError && (
              <View style={{ backgroundColor: '#3a1c1c', padding: 8, borderRadius: 6, marginBottom: 6 }}>
                <Text style={{ color: '#ff6b6b', fontSize: 12, textAlign: 'center' }}>{mailSyncError}</Text>
              </View>
            )}

            <View style={styles.mailboxBodyRow}>
              <ScrollView style={styles.mailboxListPane}>
                {state.mailbox
                  .slice()
                  .sort((a, b) => b.sentAt - a.sentAt)
                  .map(mail => {
                    const hasAttachments =
                      mail.attachments.shards +
                        mail.attachments.gold +
                        mail.attachments.diamonds +
                        mail.attachments.tears +
                        mail.attachments.essence >
                      0;
                    return (
                      <Pressable
                        key={mail.id}
                        style={[styles.mailCard, selectedMailId === mail.id && styles.mailCardActive]}
                        onPress={() => setSelectedMailId(mail.id)}
                      >
                        <View style={styles.mailCardTopRow}>
                          <Text style={styles.mailCardSubject} numberOfLines={1}>
                            {mail.subject}
                          </Text>
                          <Text style={styles.mailCardAttachmentIcon}>{hasAttachments ? '📎' : '✓'}</Text>
                        </View>
                        <Text style={styles.mailCardMeta} numberOfLines={1}>
                          From {mail.from}
                        </Text>
                      </Pressable>
                    );
                  })}
              </ScrollView>

              <View style={styles.mailboxDetailPane}>
                {selectedMail ? (
                  <>
                    <Text style={styles.mailDetailSubject}>{selectedMail.subject}</Text>
                    <Text style={styles.mailDetailFrom}>From {selectedMail.from}</Text>
                    <ScrollView style={styles.mailDetailMessageWrap}>
                      <Text style={styles.mailDetailMessage}>{selectedMail.message}</Text>
                    </ScrollView>
                    <View style={styles.mailAttachmentRow}>
                      {(() => {
                        const attachmentKeys: Array<'shards' | 'gold' | 'diamonds' | 'tears' | 'essence'> = [
                          'shards',
                          'gold',
                          'diamonds',
                          'tears',
                          'essence',
                        ];
                        const rows = attachmentKeys.filter(key => {
                          const amount = selectedMail.attachments[key] ?? 0;
                          const claimedAmount = selectedMail.claimedAttachments?.[key] ?? 0;
                          return amount > 0 || claimedAmount > 0;
                        });

                        if (rows.length === 0) {
                          return <Text style={styles.settingsLabel}>No claimable attachments.</Text>;
                        }

                        return rows.map(key => {
                          const amount = selectedMail.attachments[key] ?? 0;
                          const claimedAmount = selectedMail.claimedAttachments?.[key] ?? 0;
                          const label =
                            key === 'shards'
                              ? 'Shards'
                              : key === 'gold'
                                ? 'Gold'
                                : key === 'diamonds'
                                  ? 'Diamonds'
                                  : key === 'tears'
                                    ? 'Tears'
                                    : 'Essence';
                          const isClaimed = amount <= 0 && claimedAmount > 0;

                          return (
                            <Pressable
                              key={`${selectedMail.id}_${key}`}
                              style={[styles.mailAttachmentBtn, isClaimed && styles.mailAttachmentBtnClaimed]}
                              onPress={() => !isClaimed && amount > 0 && claimMailAttachment(selectedMail.id, key)}
                              disabled={isClaimed || amount <= 0}
                            >
                              {isClaimed ? (
                                <Text style={styles.mailAttachmentBtnText}>
                                  Claimed {fmt(claimedAmount)} {label} ✓
                                </Text>
                              ) : (
                                <Text style={styles.mailAttachmentBtnText}>
                                  Claim {fmt(amount)} {label}
                                </Text>
                              )}
                            </Pressable>
                          );
                        });
                      })()}
                    </View>
                  </>
                ) : (
                  <Text style={styles.settingsLabel}>Select a letter to view message and attachments.</Text>
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Dice Roll Modal */}
      <Modal
        visible={activeModal === 'diceRoll'}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!diceIsRolling) {
            setActiveModal(null);
            setDiceRollResult(null);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.diceRollModalContent}>
            <Text style={styles.diceRollTitle}>🎲 Dice Protocol</Text>
            {!diceIsRolling && diceRollResult ? (
              <>
                <View style={styles.diceResultContainer}>
                  <Text style={styles.diceResultNumber}>{diceRollResult.roll}</Text>
                  <Text style={styles.diceResultLabel}>/ 20</Text>
                </View>
                <View style={styles.rewardsList}>
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardLabel}>Diamonds</Text>
                    <Text style={styles.rewardValue}>💎 +{diceRollResult.diamonds}</Text>
                  </View>
                  {diceRollResult.shards > 0 && (
                    <View style={styles.rewardItem}>
                      <Text style={styles.rewardLabel}>Shards</Text>
                      <Text style={styles.rewardValue}>💠 +{diceRollResult.shards}</Text>
                    </View>
                  )}
                </View>
                <Pressable
                  style={styles.modalCloseBtn}
                  onPress={() => {
                    playDiceRoll(diceRollResult.roll);
                    setActiveModal(null);
                    setDiceRollResult(null);
                  }}
                >
                  <Text style={styles.modalCloseBtnText}>Claim Rewards</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.diceRollHint}>Tap the die to roll. It tumbles and bounces before landing.</Text>
                <Pressable style={styles.diceButton} onPress={startDiceRoll} disabled={diceIsRolling}>
                  <Animated.View
                    style={[
                      styles.diceFace,
                      {
                        transform: [
                          { translateY: diceTranslateY },
                          {
                            rotate: diceRotate.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['0deg', '1080deg'],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <Text style={styles.diceFaceText}>{diceFace}</Text>
                  </Animated.View>
                </Pressable>
                {diceIsRolling && <Text style={styles.diceRollingText}>Rolling...</Text>}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Rift Dungeon Modal */}
      <Modal
        visible={activeModal === 'riftDungeon'}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!riftIsSimulating) {
            setActiveModal(null);
            setRiftDungeonResult(null);
            setRiftSelectedBonuses([]);
            setRiftCurrentBonuses([]);
            setRiftWavePredictions([]);
            setRiftBonusRound(0);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.riftModalContent}>
            <Text style={styles.riftTitle}>⚔️ Rift Breach Challenge</Text>
            {!riftIsSimulating && riftDungeonResult ? (
              <>
                <View style={styles.wavesClearedContainer}>
                  <Text style={styles.wavesClearedNumber}>{riftDungeonResult.waves}</Text>
                  <Text style={styles.wavesClearedLabel}>/ 5 Waves Cleared</Text>
                </View>
                <View style={styles.rewardsList}>
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardLabel}>Diamonds</Text>
                    <Text style={styles.rewardValue}>💎 +{riftDungeonResult.diamonds}</Text>
                  </View>
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardLabel}>Shards</Text>
                    <Text style={styles.rewardValue}>💠 +{riftDungeonResult.shards}</Text>
                  </View>
                  {riftDungeonResult.essence > 0 && (
                    <View style={styles.rewardItem}>
                      <Text style={styles.rewardLabel}>Essence</Text>
                      <Text style={styles.rewardValue}>✨ +{riftDungeonResult.essence}</Text>
                    </View>
                  )}
                </View>
                <Pressable
                  style={styles.modalCloseBtn}
                  onPress={() => {
                    runRiftDungeon(false);
                    setActiveModal(null);
                    setRiftDungeonResult(null);
                    setRiftSelectedBonuses([]);
                    setRiftCurrentBonuses([]);
                    setRiftWavePredictions([]);
                    setRiftBonusRound(0);
                  }}
                >
                  <Text style={styles.modalCloseBtnText}>Claim Rewards</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.riftSimulationHint}>
                  Wave {Math.max(1, riftBonusRound)}/5: choose 1 of 3 buffs.
                </Text>
                <View style={styles.waveBarsContainer}>
                  {[1, 2, 3, 4, 5].map(wave => {
                    const isCleared = wave < Math.max(1, riftBonusRound);
                    const isActive = wave === Math.max(1, riftBonusRound);
                    return (
                      <View
                        key={wave}
                        style={[styles.waveBar, isCleared && styles.waveBarCleared, isActive && styles.waveBarActive]}
                      >
                        <Text style={styles.waveBarLabel}>W{wave}</Text>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.riftBuffList}>
                  {riftCurrentBonuses.map(choice => (
                    <Pressable
                      key={choice.id}
                      style={[
                        styles.riftBuffCard,
                        choice.rarity === 'rare' && styles.riftBuffCardRare,
                        choice.rarity === 'epic' && styles.riftBuffCardEpic,
                        choice.rarity === 'legendary' && styles.riftBuffCardLegendary,
                      ]}
                      onPress={() => chooseRiftBuff(choice)}
                    >
                      <Text style={styles.riftBuffTitle}>{choice.name}</Text>
                      <Text style={styles.riftBuffDesc}>{choice.description}</Text>
                      <Text style={styles.riftBuffStat}>
                        {choice.dpsMult > 1 ? `DMG +${Math.round((choice.dpsMult - 1) * 100)}% ` : ''}
                        {choice.hpMult > 1 ? `HP +${Math.round((choice.hpMult - 1) * 100)}% ` : ''}
                        {choice.defenseMult > 1 ? `DEF +${Math.round((choice.defenseMult - 1) * 100)}%` : ''}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {riftSelectedBonuses.length > 0 && (
                  <>
                    <Text style={styles.riftPickedCount}>Chosen buffs: {riftSelectedBonuses.length}/5</Text>
                    {riftWavePredictions.length > 0 && (
                      <Text style={styles.riftWavePredictionFeedback}>
                        Predicted outcome: {riftWavePredictions[riftWavePredictions.length - 1]}/5 waves cleared
                      </Text>
                    )}
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={activeModal === 'reconGame'} transparent animationType="fade" onRequestClose={resetReconGame}>
        <View style={styles.modalOverlay}>
          <View style={styles.miniGameModalContent}>
            <Text style={styles.diceRollTitle}>🛰️ Recon Sweep</Text>
            <Text style={styles.miniGameHint}>
              Pick one intel card. It flips first, then the remaining intel is revealed.
            </Text>
            <View style={styles.reconChoiceGrid}>
              {reconChoices.map((choice, index) => {
                const picked = reconPickedIndex === index;
                const label =
                  choice === 'intel_gold'
                    ? 'Supply Route'
                    : choice === 'intel_shards'
                      ? 'Shard Cache'
                      : choice === 'intel_buff'
                        ? 'Telemetry Feed'
                        : 'Enemy Ambush';
                const scaleX = reconFlipAnims[index].interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [1, 0.01, 1],
                });
                const scale = picked ? reconSelectedScale : 1;
                return (
                  <Pressable
                    key={`${choice}_${index}`}
                    style={styles.reconChoiceCardTapTarget}
                    disabled={reconRevealInProgress || reconRevealComplete}
                    onPress={() => revealReconChoice(index)}
                  >
                    <Animated.View
                      style={[
                        styles.reconChoiceCard,
                        picked && styles.reconChoiceCardPicked,
                        choice === 'ambush' && reconRevealComplete && styles.reconChoiceCardDanger,
                        {
                          transform: [{ scaleX }, { scale }],
                        },
                      ]}
                    >
                      {!reconCardsRevealed[index] ? (
                        <View style={styles.reconCardFaceFront}>
                          <Text style={styles.reconCardBackSymbol}>🂠</Text>
                          <View style={styles.reconCardBackStripe} />
                          <Text style={styles.reconCardBackLabel}>RECON</Text>
                        </View>
                      ) : (
                        <View style={styles.reconCardFaceBack}>
                          <Text style={styles.reconChoiceLabel}>{label}</Text>
                        </View>
                      )}
                    </Animated.View>
                  </Pressable>
                );
              })}
            </View>
            {!reconRevealComplete ? (
              <Pressable style={styles.modalBtn} onPress={resetReconGame}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.modalCloseBtn} onPress={claimReconSweepGame}>
                <Text style={styles.modalCloseBtnText}>Claim Recon Rewards</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={activeModal === 'lockpickGame'}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.miniGameModalContent}>
            <Text style={styles.diceRollTitle}>🔐 Lockpick Cache</Text>
            <Text style={styles.miniGameHint}>Guess the 2-digit lock code before security lockout.</Text>
            <Text style={styles.miniGameStatusText}>Attempts: {lockpickAttemptsUsed}/3</Text>
            <TextInput
              style={styles.lockpickInput}
              keyboardType="number-pad"
              maxLength={2}
              value={lockpickGuessInput}
              editable={lockpickSolved == null}
              onChangeText={setLockpickGuessInput}
              placeholder="10-99"
              placeholderTextColor="#6F89A7"
            />
            <Text style={styles.miniGameStatusText}>{lockpickHintText ?? ''}</Text>

            {lockpickSolved == null ? (
              <View style={styles.warPanelActionRow}>
                <Pressable style={styles.warPanelActionBtn} onPress={submitLockpickGuess}>
                  <Text style={styles.warPanelActionText}>Submit Guess</Text>
                </Pressable>
                <Pressable style={styles.modalBtn} onPress={() => setActiveModal(null)}>
                  <Text style={styles.modalBtnText}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.modalCloseBtn} onPress={claimLockpickCacheGame}>
                <Text style={styles.modalCloseBtnText}>
                  {lockpickSolved ? 'Claim Diamond Cache' : 'Claim Salvage Gold'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={activeModal === 'targetPracticeGame'}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setActiveModal(null);
          setTargetPracticeScore(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.miniGameModalContent}>
            <Text style={styles.diceRollTitle}>🎯 Target Practice</Text>
            <Text style={styles.miniGameHint}>Stop the moving marker as close to center as possible.</Text>

            <View style={styles.targetTrack}>
              <View style={styles.targetBullseyeZone} />
              <View style={[styles.targetMarker, { left: `${targetPracticeMeter.position}%` }]} />
            </View>

            <Text style={styles.miniGameStatusText}>
              {targetPracticeScore == null ? 'Timer running...' : `Final score: ${targetPracticeScore}`}
            </Text>

            {targetPracticeScore == null ? (
              <Pressable style={[styles.warPanelActionBtn, { alignSelf: 'center' }]} onPress={stopTargetPractice}>
                <Text style={styles.warPanelActionText}>Stop Shot</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.modalCloseBtn} onPress={claimTargetPracticeGame}>
                <Text style={styles.modalCloseBtnText}>Claim Practice Rewards</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      {/* Rebirth Modal */}
      <RebirthModal
        visible={activeModal === 'rebirth'}
        wave={state.wave}
        highestWave={state.highestWaveReached}
        requiredWave={rebirthWaveRequirement}
        prestigeCount={state.prestigeCount}
        onConfirm={rebirth}
        onCancel={() => setActiveModal(null)}
      />
    </SafeAreaView>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────────────

export { styles };
