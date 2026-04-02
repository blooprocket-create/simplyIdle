import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  SafeAreaView,
  Pressable,
  Platform,
  StatusBar,
  TextInput,
  Modal,
  Linking,
  Alert,
  Animated,
  Easing,
  useWindowDimensions,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENABLE_SIMULATED_DOLLAR_PURCHASES, FACILITY_MAX_LEVEL, MINI_OPS_COOLDOWN_MS, getCharacterSaveSlot, getDpsBreakdown, getEquipmentCraftCost, getFacilityUpgradeCost, getHeroGoldLevelCost, getMaxHeatForLevel, getSaveStorageKey, useGameState } from '../useGameState';
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
  Rarity,
} from '../gameConfig';
import { getHeroPortraitSource } from '../heroPortraits';
import { fmt } from '../utils';
import AchievementToast from '../components/AchievementToast';
import RebirthModal from '../components/PrestigeModal';
import BottomNavigation, { BottomTabType } from '../components/BottomNavigation';
import GameHeader from '../components/GameHeader';
import {
  BattleTabContent,
  WarroomTabContent,
  HeroesTabContent,
  StatsTabContent,
  EquipmentTabContent,
  AchievementsTabContent,
  OperationsTabContent,
} from './tabs';
import { styles } from './GameScreen.styles';

export type Tab = 'warroom' | 'battle' | 'heroes' | 'stats' | 'achievements' | 'equipment' | 'operations';
type HeroesSubTab = 'summon' | 'roster' | 'batch';
type EquipmentSubTab = 'inventory' | 'craft' | 'forge';
type AchievementsSubTab = 'overview' | 'weekly' | 'missions' | 'achievements' | 'collection' | 'codex';
type OperationsSubTab = 'facilities' | 'expeditions' | 'miniops' | 'dungeonops';
type ShopTab = 'diamond' | 'gold' | 'dollar';
export type ExpeditionType = 'artifact' | 'merchant' | 'ruins' | 'vault' | 'abyss';
export type ExpeditionRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'godly';

type SummonReveal = {
  id: string;
  heroId: string | null;
  heroName: string;
  emoji: string;
  rarity: Rarity;
};

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

export const STAT_LABELS = {
  strength: 'STR',
  vitality: 'VIT',
  agility: 'AGI',
  intelligence: 'INT',
  spirit: 'SPR',
} as const;

export const ACH_BONUS_PER_UNLOCK_PCT = 3;
export const ACH_BONUS_CAP_PCT = 75;
const FEEDBACK_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSf6txIw9UL-F9kItXZfOfr9d0qA_XCvaNIsBUf_4NZ1HZpfrw/viewform?usp=publish-editor';
const HAS_BETA_FEEDBACK_FORM = !FEEDBACK_FORM_URL.includes('replace-with-your-beta-form');
const GEAR_RARITY_POINTS: Record<string, number> = { common: 40, rare: 90, epic: 170, legendary: 280, mythic: 430, transcendent: 680 };
const ACCOUNTS_KEY = 'idlerpg_accounts_v1';
const SESSION_KEY = 'idlerpg_current_account_v1';
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

type CharacterSnapshot = {
  account: string;
  classId: PlayerClass;
  playerName: string;
  level: number;
  highestWaveReached: number;
  lastActiveAt: number;
  isOnline: boolean;
};

type SaveMailboxEntry = {
  id: string;
  subject: string;
  message: string;
  from: string;
  sentAt: number;
  attachments: {
    shards: number;
    gold: number;
    diamonds: number;
    tears: number;
    essence: number;
  };
};

function scoreEquipmentForClass(item: { rarity: string; bonus: Record<string, number | undefined | null> }, playerClass: PlayerClass | null): number {
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
const VIP_LEVEL_THRESHOLDS = [0, 50, 150, 350, 700, 1500, 3000, 6500, 15000, 35000, 100000] as const;
const GOLD_SHOP_OFFERS = [
  { id: 'exp_cache', name: 'Training Cache', desc: '+6 Training Scrolls', cost: 2800 },
  { id: 'potion_bundle', name: 'Field Bundle', desc: '+3 Small Potion, +1 Grand Potion, +2 Gold Cache', cost: 4200 },
  { id: 'armory_crate', name: 'Armory Crate', desc: 'Random class-compatible gear', cost: 12000 },
] as const;
const DIAMOND_SHOP_OFFERS = [
  { id: 'coolant_i_pack', name: 'Coolant Pack I', desc: '+4 Coolant Capsule I', cost: 24 },
  { id: 'coolant_ii_pack', name: 'Coolant Pack II', desc: '+3 Coolant Capsule II', cost: 58 },
  { id: 'rift_raid_ticket', name: 'Dungeon Raid Ticket', desc: '+1 ticket (raids prior Rift level, no free-entry cost)', cost: 150 },
  { id: 'elite_supply', name: 'Elite Supply Crate', desc: '+5 Coolant I, +3 Coolant II, +2 Grand Potions', cost: 120 },
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

export const EXPEDITION_TYPES: ExpeditionType[] = ['artifact', 'merchant', 'ruins', 'vault', 'abyss'];
export const EXPEDITION_TYPE_META: Record<ExpeditionType, { icon: string; name: string }> = {
  artifact: { icon: '🗿', name: 'Artifact Hunt' },
  merchant: { icon: '🏪', name: 'Merchant Convoy' },
  ruins: { icon: '🏛️', name: 'Ancient Ruins' },
  vault: { icon: '🔐', name: 'Vault Heist' },
  abyss: { icon: '🌑', name: 'Abyss Dive' },
};
export const EXPEDITION_RARITY_META: Record<ExpeditionRarity, { goldCost: number; durationMs: number; rewardsLabel: string }> = {
  common: { goldCost: 25_000, durationMs: 5 * 60 * 1000, rewardsLabel: '+35💎 +150💠' },
  rare: { goldCost: 75_000, durationMs: 20 * 60 * 1000, rewardsLabel: '+75💎 +320💠 +1✨' },
  epic: { goldCost: 220_000, durationMs: 90 * 60 * 1000, rewardsLabel: '+140💎 +700💠 +1✨' },
  legendary: { goldCost: 500_000, durationMs: 4 * 60 * 60 * 1000, rewardsLabel: '+240💎 +1300💠 +2✨' },
  godly: { goldCost: 1_000_000, durationMs: 8 * 60 * 60 * 1000, rewardsLabel: '+400💎 +2400💠 +4✨' },
};

export function formatDurationShort(ms: number): string {
  const totalMinutes = Math.max(1, Math.floor(ms / 60_000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

interface CharacterSlotSummary {
  classId: PlayerClass;
  playerName: string | null;
  level: number;
  highestWaveReached: number;
  vipLevel: number;
  occupied: boolean;
}

function getLastCharacterSlotKey(accountName: string): string {
  return `idlerpg_last_character_slot_v1_${accountName}`;
}

function getVipLevelFromPoints(points: number): number {
  let level = 0;
  for (let i = 0; i < VIP_LEVEL_THRESHOLDS.length; i += 1) {
    if (points >= VIP_LEVEL_THRESHOLDS[i]) {
      level = i;
    } else {
      break;
    }
  }
  return Math.max(0, Math.min(10, level));
}

export default function GameScreen({ accountName, onLogout }: GameScreenProps) {
  const [selectedCharacterClass, setSelectedCharacterClass] = useState<PlayerClass | null>(null);
  const [lastUsedCharacterClass, setLastUsedCharacterClass] = useState<PlayerClass | null>(null);
  const [slotSummaries, setSlotSummaries] = useState<CharacterSlotSummary[]>([]);
  const [slotListLoading, setSlotListLoading] = useState(true);
  const {
    hydrated,
    state,
    stats,
    createCharacter,
    summonHero,
    summonHeroX10,
    summonHeroX10Cinematic,
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
    rebirthHero,
    levelUpHeroGold,
    convertShardsToEssence,
    convertShardsToScrap,
    spendRebirthCore,
    useUsableItem,
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
    spendEssenceUpgrade,
    claimWeeklyTrack,
    claimMission,
    claimCodexHeroVip,
    claimCodexUniqueVip,
    markHintSeen,
    appendMailboxMessages,
    claimMailAttachment,
    claimAllMailAttachments,
    clearAchievement,
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
  } = useGameState(selectedCharacterClass ? getCharacterSaveSlot(accountName, selectedCharacterClass) : '__character_slot_preview__');

  const [tab, setTab] = useState<Tab>('warroom');
  const [rebirthOpen, setRebirthOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftClass, setDraftClass] = useState<PlayerClass>('warrior');
  const [expandedHeroes, setExpandedHeroes] = useState<Set<string>>(new Set());
  const [recycleConfirmUid, setRecycleConfirmUid] = useState<string | null>(null);
  const [smartCoolantConfirmOpen, setSmartCoolantConfirmOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopTab, setShopTab] = useState<ShopTab>('diamond');
  const [heroesSubTab, setHeroesSubTab] = useState<HeroesSubTab>('summon');
  const [equipmentSubTab, setEquipmentSubTab] = useState<EquipmentSubTab>('inventory');
  const [achievementsSubTab, setAchievementsSubTab] = useState<AchievementsSubTab>('overview');
  const [operationsSubTab, setOperationsSubTab] = useState<OperationsSubTab>('facilities');
  const [eventsOpen, setEventsOpen] = useState(false);
  const [devCommandInput, setDevCommandInput] = useState('');
  const [devCommandOutput, setDevCommandOutput] = useState<string>('');
  const [chapterMapOpen, setChapterMapOpen] = useState(false);
  const [compareItemId, setCompareItemId] = useState<string | null>(null);
  const [summonReveal, setSummonReveal] = useState<SummonReveal | null>(null);
  const [cinematicSummonOpen, setCinematicSummonOpen] = useState(false);
  const [cinematicSummonPhase, setCinematicSummonPhase] = useState<'charge' | 'warp' | 'reveal'>('charge');
  const [cinematicSummonResults, setCinematicSummonResults] = useState<SummonReveal[]>([]);
  const [idleChestReady, setIdleChestReady] = useState(false);
  const [idleChestOpen, setIdleChestOpen] = useState(false);
  const [idleChestReward, setIdleChestReward] = useState<{ title: string; detail: string } | null>(null);
  const [storyUnlockToast, setStoryUnlockToast] = useState<{ id: string; title: string; chapter: string } | null>(null);
  const [hoveredTopChipId, setHoveredTopChipId] = useState<'dps' | 'power' | 'gear' | null>(null);
  const [activeAffixTooltipId, setActiveAffixTooltipId] = useState<string | null>(null);
  const [topChipTooltipAnchor, setTopChipTooltipAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const lastSummonIdRef = useRef<string | null>(null);
  const pendingCinematicSummonRef = useRef(false);
  const cinematicTimersRef = useRef<number[]>([]);
  const cinematicPulse = useRef(new Animated.Value(0)).current;
  const cinematicRevealScale = useRef(new Animated.Value(0.8)).current;
  const topChipRefs = useRef<Record<'dps' | 'power' | 'gear', View | null>>({ dps: null, power: null, gear: null });
  const storyUnlockInitRef = useRef(false);
  const seenStoryUnlockIdsRef = useRef<Set<string>>(new Set());
  const appStateRef = useRef(AppState.currentState);
  const backgroundTimeRef = useRef<number | null>(null);
  const heroTemplateIdByName = useMemo(() => {
    const map = new Map<string, string>();
    HERO_POOL.forEach(hero => {
      map.set(hero.name, hero.id);
    });
    return map;
  }, []);
  const [warPanels, setWarPanels] = useState({
    frontline: true,
    roster: true,
    armory: false,
    growth: false,
    objectives: true,
    prestige: false,
  });

  const [diceRollModalOpen, setDiceRollModalOpen] = useState(false);
  const [diceRollResult, setDiceRollResult] = useState<{ roll: number; diamonds: number; shards: number } | null>(null);
  const [diceIsRolling, setDiceIsRolling] = useState(false);
  const diceTranslateY = useRef(new Animated.Value(0)).current;
  const diceRotate = useRef(new Animated.Value(0)).current;
  const [diceFace, setDiceFace] = useState<number>(1);

  const [riftDungeonModalOpen, setRiftDungeonModalOpen] = useState(false);
  const [riftDungeonResult, setRiftDungeonResult] = useState<{ waves: number; diamonds: number; shards: number; essence: number } | null>(null);
  const [riftIsSimulating, setRiftIsSimulating] = useState(false);

  const [reconGameOpen, setReconGameOpen] = useState(false);
  const [reconChoices, setReconChoices] = useState<ReconSweepOutcome[]>([]);
  const [reconPickedIndex, setReconPickedIndex] = useState<number | null>(null);
  const [reconRevealInProgress, setReconRevealInProgress] = useState(false);
  const [reconRevealComplete, setReconRevealComplete] = useState(false);
  const [reconCardsRevealed, setReconCardsRevealed] = useState<boolean[]>([false, false, false]);
  const reconFlipAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const reconSelectedScale = useRef(new Animated.Value(1)).current;

  const [lockpickGameOpen, setLockpickGameOpen] = useState(false);
  const [lockpickTargetCode, setLockpickTargetCode] = useState<number>(0);
  const [lockpickGuessInput, setLockpickGuessInput] = useState('');
  const [lockpickAttemptsUsed, setLockpickAttemptsUsed] = useState(0);
  const [lockpickHintText, setLockpickHintText] = useState<string | null>(null);
  const [lockpickSolved, setLockpickSolved] = useState<boolean | null>(null);

  const [targetPracticeGameOpen, setTargetPracticeGameOpen] = useState(false);
  const [targetPracticeMeter, setTargetPracticeMeter] = useState<{ position: number; direction: 1 | -1 }>({ position: 8, direction: 1 });
  const [targetPracticeScore, setTargetPracticeScore] = useState<number | null>(null);

  // Batch leveling state
  const [batchLevelSelected, setBatchLevelSelected] = useState<Set<string>>(new Set());
  const [batchLevelMode, setBatchLevelMode] = useState<10 | 50 | 100 | 'max'>(10);

  // Rift bonus state
  const [riftBonusRound, setRiftBonusRound] = useState(0);
  const [riftSelectedBonuses, setRiftSelectedBonuses] = useState<RiftBuffChoice[]>([]);
  const [riftCurrentBonuses, setRiftCurrentBonuses] = useState<RiftBuffChoice[]>([]);
  const [riftWavePredictions, setRiftWavePredictions] = useState<number[]>([]);

  // Timer tick for expedition countdown display
  const [, setTimerTick] = useState(0);

  // Handle app state changes: track time when app goes to background
  // and apply offline progression when it returns to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [hydrated, state.lastActiveAt]);

  const handleAppStateChange = (nextState: typeof AppState.currentState) => {
    if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
      // App has come to foreground
      if (backgroundTimeRef.current && hydrated && state.characterCreated) {
        const elapsed = Date.now() - backgroundTimeRef.current;
        if (elapsed > 5000) {
          // Apply offline progression if away for > 5 seconds
          applyOfflineProgress(elapsed);
        }
      }
      backgroundTimeRef.current = null;
    } else if (nextState.match(/inactive|background/)) {
      // App going to background or becoming inactive
      backgroundTimeRef.current = Date.now();
    }
    appStateRef.current = nextState;
  };

  useEffect(() => {
    let cancelled = false;

    async function loadCharacterSlots() {
      setSlotListLoading(true);
      const summaries = await Promise.all(CLASSES.map(async cls => {
        const raw = await AsyncStorage.getItem(getSaveStorageKey(getCharacterSaveSlot(accountName, cls.id)));
        if (!raw) {
          return {
            classId: cls.id,
            playerName: null,
            level: 1,
            highestWaveReached: 1,
            vipLevel: 0,
            occupied: false,
          } satisfies CharacterSlotSummary;
        }

        try {
          const parsed = JSON.parse(raw) as {
            playerName?: string;
            level?: number;
            highestWaveReached?: number;
            wave?: number;
            vipLevel?: number;
            vipPoints?: number;
            characterCreated?: boolean;
          };
          const playerName = typeof parsed.playerName === 'string' ? parsed.playerName.trim().slice(0, 24) : '';
          const occupied = !!playerName && parsed.characterCreated === true;
          const parsedVipPoints = typeof parsed.vipPoints === 'number' && Number.isFinite(parsed.vipPoints)
            ? Math.max(0, Math.floor(parsed.vipPoints))
            : 0;
          const parsedVipLevel = typeof parsed.vipLevel === 'number' && Number.isFinite(parsed.vipLevel)
            ? Math.max(0, Math.min(10, Math.floor(parsed.vipLevel)))
            : getVipLevelFromPoints(parsedVipPoints);
          return {
            classId: cls.id,
            playerName: occupied ? playerName : null,
            level: typeof parsed.level === 'number' && Number.isFinite(parsed.level) ? Math.max(1, Math.floor(parsed.level)) : 1,
            highestWaveReached: typeof parsed.highestWaveReached === 'number' && Number.isFinite(parsed.highestWaveReached)
              ? Math.max(1, Math.floor(parsed.highestWaveReached))
              : typeof parsed.wave === 'number' && Number.isFinite(parsed.wave)
                ? Math.max(1, Math.floor(parsed.wave))
                : 1,
            vipLevel: occupied ? parsedVipLevel : 0,
            occupied,
          } satisfies CharacterSlotSummary;
        } catch {
          return {
            classId: cls.id,
            playerName: null,
            level: 1,
            highestWaveReached: 1,
            vipLevel: 0,
            occupied: false,
          } satisfies CharacterSlotSummary;
        }
      }));

      if (cancelled) return;
      setSlotSummaries(summaries);

      const occupiedClasses = summaries.filter(slot => slot.occupied).map(slot => slot.classId);
      const lastSelected = await AsyncStorage.getItem(getLastCharacterSlotKey(accountName));
      const normalizedLastSelected = lastSelected && CLASSES.some(cls => cls.id === lastSelected)
        ? lastSelected as PlayerClass
        : null;
      setLastUsedCharacterClass(normalizedLastSelected);
      if (cancelled) return;

      if (normalizedLastSelected && occupiedClasses.includes(normalizedLastSelected)) {
        setSelectedCharacterClass(normalizedLastSelected);
      } else if (occupiedClasses.length === 1) {
        setSelectedCharacterClass(occupiedClasses[0]);
      } else {
        setSelectedCharacterClass(null);
      }

      setSlotListLoading(false);
    }

    void loadCharacterSlots();
    return () => {
      cancelled = true;
    };
  }, [accountName]);

  useEffect(() => {
    if (!selectedCharacterClass) return;
    setLastUsedCharacterClass(selectedCharacterClass);
    void AsyncStorage.setItem(getLastCharacterSlotKey(accountName), selectedCharacterClass);
  }, [accountName, selectedCharacterClass]);

  useEffect(() => {
    if (!selectedCharacterClass || !hydrated || !state.characterCreated) return;
    setSlotSummaries(prev => prev.map(slot => slot.classId === selectedCharacterClass
      ? {
        ...slot,
        occupied: true,
        playerName: state.playerName,
        level: state.level,
        highestWaveReached: state.highestWaveReached,
          vipLevel: Math.max(0, Math.min(10, state.vipLevel ?? 0)),
      }
      : slot));
        }, [hydrated, selectedCharacterClass, state.characterCreated, state.highestWaveReached, state.level, state.playerName, state.vipLevel]);

  useEffect(() => {
    if (!selectedCharacterClass) return;
    setDraftClass(selectedCharacterClass);
  }, [selectedCharacterClass]);

  const selectedClassConfig = selectedCharacterClass
    ? CLASSES.find(cls => cls.id === selectedCharacterClass) ?? CLASSES[0]
    : null;
  const occupiedCharacterCount = slotSummaries.filter(slot => slot.occupied).length;

  const classConfig = getClassConfig(state.playerClass ?? 'warrior');
  const classPassive = getClassPassive(state.playerClass ?? 'warrior');

  const monster = getMonsterForWave(state.wave);
  const monsterAffixes = getMonsterAffixes(state.wave);
  const activeAffixTooltip = monsterAffixes.find(affix => affix.id === activeAffixTooltipId) ?? null;
  const affixTotals = monsterAffixes.reduce((acc, affix) => ({
    hpMult: acc.hpMult * affix.enemyHpMultiplier,
    dmgMult: acc.dmgMult * affix.enemyDamageMultiplier,
  }), { hpMult: 1, dmgMult: 1 });
  const isBoss = state.wave % 10 === 0;
  const currentAct = getActForWave(state.wave);
  const actProgressPct = Math.max(0, Math.min(1, (state.wave - currentAct.startWave + 1) / (currentAct.endWave - currentAct.startWave + 1))) * 100;
  const nextBossUnlock = getBossUnlockForWave(currentAct.bossWave);
  const monsterHpPct = Math.max(0, Math.min(1, state.monsterHp / state.monsterMaxHp)) * 100;
  const teamHpPct = Math.max(0, Math.min(1, state.teamHp / state.teamMaxHp)) * 100;
  const activeTeamSet = useMemo(() => new Set(state.activeTeamHeroIds), [state.activeTeamHeroIds]);
  const usableInventory = useMemo(
    () => Object.entries(state.usableItemCounts)
      .map(([id, count]) => ({ item: getUsableItem(id), count }))
      .filter(entry => entry.item && entry.count > 0),
    [state.usableItemCounts],
  );

  // Boss Tears is the real summon currency; gold cost line kept for reference in tooltips
  const canGachaOnce = state.freeSummonCharges > 0 || state.bossTears >= 1;
  const paidX10 = Math.max(0, 10 - state.freeSummonCharges);
  const canGachaX10 = state.freeSummonCharges >= 10 || state.bossTears >= paidX10;
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
    if (!state.seenHintIds.includes('hint_mission_board')) {
      list.push({
        id: 'hint_mission_board',
        title: 'Mission Board Online',
        detail: 'Check Achievements for short/medium/long goals and claim rewards when complete.',
      });
    }
    if (state.permanentUnlocks.includes('advanced_consumables') && !state.seenHintIds.includes('hint_consumables')) {
      list.push({
        id: 'hint_consumables',
        title: 'Advanced Consumables Unlocked',
        detail: 'New consumables now drop in battles. Use them from the Battle tab.',
      });
    }
    if (state.permanentUnlocks.includes('mythic_equipment') && !state.seenHintIds.includes('hint_mythic_tier')) {
      list.push({
        id: 'hint_mythic_tier',
        title: 'Mythic Tier Online',
        detail: 'You can now drop and upgrade into Mythic equipment in the Equipment tab.',
      });
    }
    return list;
  }, [state.permanentUnlocks, state.seenHintIds]);
  const activeHint = hintCandidates[0] ?? null;

  const rewardPopup = state.rewardQueue[0] ?? null;
  const unreadMailCount = state.mailbox.filter(mail =>
    (mail.attachments.shards + mail.attachments.gold + mail.attachments.diamonds + mail.attachments.tears + mail.attachments.essence) > 0,
  ).length;
  const selectedMail = state.mailbox.find(mail => mail.id === selectedMailId) ?? null;
  const isOfflineRewardPopup = !!rewardPopup && `${rewardPopup.title} ${rewardPopup.detail}`.toLowerCase().includes('offline progress');
  const rebirthWaveRequirement = getRebirthWaveRequirement(state.prestigeCount);
  const canRebirthNow = state.highestWaveReached >= rebirthWaveRequirement;
  const teamSlotCap = Math.max(4, Math.min(ACTIVE_TEAM_SIZE, state.teamSlotsUnlocked ?? 4));
  const nextTeamSlotUnlock = getNextTeamSlotUnlock();
  const nowMs = Date.now();
  const isMiniOpReady = (lastUsedMs: number | null) => lastUsedMs == null || (nowMs - lastUsedMs) >= MINI_OPS_COOLDOWN_MS;
  const currentDay = Math.floor(Date.now() / 86_400_000);
  const canPlayDiceToday = isMiniOpReady(state.lastDiceRollDay);
  const canPlayReconToday = isMiniOpReady(state.lastReconSweepDay);
  const canPlayLockpickToday = isMiniOpReady(state.lastLockpickDay);
  const canPlayTargetToday = isMiniOpReady(state.lastTargetPracticeDay);
  const canStartBountyToday = isMiniOpReady(state.lastBountyDraftDay) && !state.miniBounty;
  const activeMiniBountyProgress = state.miniBounty
    ? (state.miniBounty.metric === 'wave'
      ? state.wave
      : state.miniBounty.metric === 'summons'
        ? state.totalSummons
        : state.totalKills)
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
  const rebirthWavesLeft = Math.max(0, rebirthWaveRequirement - state.highestWaveReached);
  const expeditionClaimableCount = state.expeditionQueue.filter(exp => (Date.now() - exp.startTime) >= exp.durationMs).length;
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
    (canPlayDiceToday ? 1 : 0)
    + (canPlayReconToday ? 1 : 0)
    + (canPlayLockpickToday ? 1 : 0)
    + (canPlayTargetToday ? 1 : 0)
    + (canStartBountyToday || canClaimMiniBounty ? 1 : 0);
  const dungeonOpsNotificationCount = (canRunRiftEntry ? 1 : 0) + (canRaidRift ? 1 : 0) + (canRunTreasuryEntry ? 1 : 0) + (canRaidTreasury ? 1 : 0);
  const operationsNotificationCount = expeditionClaimableCount + expeditionLaunchableAffordableCount + facilitiesUpgradeableCount + miniOpsNotificationCount + dungeonOpsNotificationCount;
  const guidanceList = useMemo(() => {
    const recs: Array<{ title: string; detail: string; tab: Tab }> = [];
    if (canRebirthNow) {
      recs.push({ title: 'Rebirth Ready', detail: 'Open War Room and trigger rebirth for permanent cores.', tab: 'warroom' });
    }
    if (state.activeTeamHeroIds.length < teamSlotCap) {
      recs.push({ title: 'Build Full Team', detail: `Equip ${teamSlotCap} heroes to stabilize damage and survival.`, tab: 'heroes' });
    }
    if (state.unspentStatPoints > 0) {
      recs.push({ title: 'Spend Stat Points', detail: 'Use unspent points to increase immediate power.', tab: 'stats' });
    }
    const firstUnclaimedMission = missionCards.find(m => !m.claimed && m.progress.done);
    if (firstUnclaimedMission) {
      recs.push({ title: 'Claim Mission Reward', detail: `Claim \"${firstUnclaimedMission.mission.title}\" for instant resources.`, tab: 'achievements' });
    }
    recs.push({ title: 'Push Act Boss', detail: `Advance to Wave ${currentAct.bossWave} for permanent unlock progress.`, tab: 'battle' });
    return recs.slice(0, 3);
  }, [canRebirthNow, state.activeTeamHeroIds.length, state.unspentStatPoints, missionCards, currentAct.bossWave, teamSlotCap]);
  const nextGuidance = guidanceList[0];
  const extraGuidanceCount = Math.max(0, guidanceList.length - 1);
  const equipmentInventory = state.equipmentInventory;
  const getOwnedEquipmentItem = (id: string | null) => (id ? equipmentInventory[id] ?? null : null);
  const equippedItemsForScore = useMemo(
    () => Object.values(state.equippedItems).map(id => getOwnedEquipmentItem(id)).filter(Boolean),
    [state.equippedItems, state.equipmentInventory],
  );
  const gearScore = useMemo(() => {
    return equippedItemsForScore.reduce((sum, item) => {
      if (!item) return sum;
      return sum + scoreEquipmentForClass(item, state.playerClass);
    }, 0);
  }, [equippedItemsForScore, state.playerClass]);
  const gearScoreRows = useMemo(() => {
    return equippedItemsForScore.map(item => {
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
    }).filter((row): row is { name: string; rarityPoints: number; statPoints: number; total: number } => !!row);
  }, [equippedItemsForScore, state.playerClass]);
  const dpsBreakdown = useMemo(() => getDpsBreakdown(state), [state]);
  const powerFromDps = stats.dps * 0.45;
  const powerFromHp = state.teamMaxHp * 0.25;
  const powerFromDefense = stats.teamDefense * 7;
  const powerFromGear = gearScore * 15;
  const teamPowerIndex = Math.floor(powerFromDps + powerFromHp + powerFromDefense + powerFromGear);
  const effectiveTeamDps = Math.max(1, stats.dps / affixTotals.hpMult);
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
  const isCompactPhone = viewportWidth < 430;
  const isShortPhone = viewportHeight < 780;
  const compactSubTabMinWidth = viewportWidth < 390 ? 92 : 108;
  const claimableWeeklyMilestones = WEEKLY_TRACK_MILESTONES.filter(ms => state.weeklyKills >= ms && !state.weeklyTrackClaimed.includes(ms));
  const claimableMissionIds = missionCards.filter(m => !m.claimed && m.progress.done).map(m => m.mission.id);
  const hasClaimableRewards = claimableWeeklyMilestones.length > 0 || claimableMissionIds.length > 0;
  const claimableCodexHeroVipCount = Array.from(new Set(state.heroRoster.map(hero => hero.id)))
    .filter(heroId => !state.codexVipClaimedHeroIds.includes(heroId)).length;
  const claimableCodexUniqueVipCount = Object.entries(state.heroUniqueGearByHeroId)
    .filter(([heroId, progress]) => !!progress && (progress.rank ?? 0) > 0 && !state.codexVipClaimedUniqueIds.includes(heroId)).length;
  const hasCodexClaimableRewards = claimableCodexHeroVipCount > 0 || claimableCodexUniqueVipCount > 0;
  const vipLevel = Math.max(0, Math.min(10, state.vipLevel ?? 0));
  const vipPoints = Math.max(0, state.vipPoints ?? 0);
  const vipCurrentThreshold = VIP_LEVEL_THRESHOLDS[vipLevel] ?? 0;
  const vipNextThreshold = vipLevel >= 10 ? vipCurrentThreshold : (VIP_LEVEL_THRESHOLDS[vipLevel + 1] ?? vipCurrentThreshold + 1);
  const vipProgressPct = vipLevel >= 10
    ? 100
    : Math.max(0, Math.min(100, ((vipPoints - vipCurrentThreshold) / Math.max(1, vipNextThreshold - vipCurrentThreshold)) * 100));
  const vipClaimedLevels = state.vipRewardClaimedLevels ?? [];
  const dollarFirstPurchaseClaimed = new Set(state.dollarFirstPurchaseClaimedOfferIds ?? []);
  const storyEntries = useMemo(
    () => STORY_BEATS.map(beat => {
      const waveReady = state.highestWaveReached >= beat.unlockWave;
      const prestigeReady = beat.unlockPrestige == null || state.prestigeCount >= beat.unlockPrestige;
      return {
        ...beat,
        unlocked: waveReady && prestigeReady,
      };
    }),
    [state.highestWaveReached, state.prestigeCount],
  );
  const nextStoryEntry = storyEntries.find(entry => !entry.unlocked) ?? null;
  const nearUnlockAchievements = useMemo(() => {
    function parseMagnitudeToken(token: string): number {
      const t = token.toLowerCase();
      if (t.endsWith('k')) return Math.floor(Number(t.slice(0, -1)) * 1000);
      if (t.endsWith('m')) return Math.floor(Number(t.slice(0, -1)) * 1_000_000);
      return Number(t);
    }

    function progressForAchievement(id: string): { label: string; value: number; target: number } | null {
      if (id === 'first_blood') return { label: 'Kills', value: state.totalKills, target: 1 };
      if (id.startsWith('kills_')) return { label: 'Kills', value: state.totalKills, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('wave_')) return { label: 'Wave', value: state.wave, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('level_')) return { label: 'Level', value: state.level, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('gold_')) return { label: 'Gold', value: state.totalGold, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('summon_')) return { label: 'Summons', value: state.totalSummons, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id === 'equip_5') return { label: 'Active Team', value: state.activeTeamHeroIds.length, target: 4 };
      if (id.startsWith('rebirth_')) return { label: 'Rebirths', value: state.prestigeCount, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('roster_')) return { label: 'Roster Size', value: state.heroRoster.length, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('shards_')) return { label: 'Shards', value: state.heroShards, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('essence_')) return { label: 'Essence', value: state.essence, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('unlocks_')) return { label: 'Permanent Unlocks', value: state.permanentUnlocks.length, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('streak_')) return { label: 'Login Streak', value: state.dailyLoginStreak, target: parseMagnitudeToken(id.split('_')[1]) };
      if (id.startsWith('highest_wave_')) return { label: 'Highest Wave', value: state.highestWaveReached, target: parseMagnitudeToken(id.split('_')[2]) };
      if (id === 'legend_slate') return { label: 'Achievements', value: state.achievements.size, target: 20 };
      return null;
    }

    return ACHIEVEMENTS
      .filter(ach => !state.achievements.has(ach.id))
      .map(ach => {
        const progress = progressForAchievement(ach.id);
        if (!progress) {
          return { ach, ratio: 0, remaining: null, progress: null as null | { label: string; value: number; target: number } };
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
          multLine('Mastery + temporary buff', dpsBreakdown.multipliers.mastery * dpsBreakdown.multipliers.temporaryBuff),
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
      const rows = gearScoreRows.length === 0
        ? ['No equipped gear in the 3 slots.']
        : gearScoreRows.map(row => `${row.name}: rarity ${fmt(row.rarityPoints)} + stats ${fmt(Math.floor(row.statPoints))} = ${fmt(Math.floor(row.total))}`);
      return {
        title: 'Gear Score Sources',
        lines: [
          'Per item: rarity points + (sum of item stats * 12)',
          ...rows,
          `Total gear score: ${fmt(gearScore)}`,
        ],
      };
    }

    return null;
  }, [hoveredTopChipId, dpsBreakdown, powerFromDps, powerFromHp, powerFromDefense, powerFromGear, stats.dps, state.teamMaxHp, stats.teamDefense, gearScore, teamPowerIndex, gearScoreRows]);
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

  useEffect(() => {
    const unlockedIds = storyEntries.filter(entry => entry.unlocked).map(entry => entry.id);
    if (!storyUnlockInitRef.current) {
      seenStoryUnlockIdsRef.current = new Set(unlockedIds);
      storyUnlockInitRef.current = true;
      return;
    }

    const newlyUnlocked = unlockedIds.filter(id => !seenStoryUnlockIdsRef.current.has(id));
    if (newlyUnlocked.length === 0) return;

    const latestId = newlyUnlocked[newlyUnlocked.length - 1];
    const latestEntry = storyEntries.find(entry => entry.id === latestId);
    newlyUnlocked.forEach(id => seenStoryUnlockIdsRef.current.add(id));

    if (latestEntry) {
      setStoryUnlockToast({
        id: latestEntry.id,
        title: latestEntry.title,
        chapter: latestEntry.chapter,
      });
    }
  }, [storyEntries]);

  useEffect(() => {
    if (!storyUnlockToast) return;
    const timer = setTimeout(() => setStoryUnlockToast(null), 4500);
    return () => clearTimeout(timer);
  }, [storyUnlockToast]);

  useEffect(() => {
    if (!rewardPopup) return;
    const text = `${rewardPopup.title} ${rewardPopup.detail}`.toLowerCase();
    if (text.includes('offline progress')) return;
    const timer = setTimeout(() => {
      clearRewardPopup();
    }, 1500);
    return () => clearTimeout(timer);
  }, [rewardPopup, clearRewardPopup]);

  useEffect(() => {
    if (!rewardPopup) return;
    const t = `${rewardPopup.title} ${rewardPopup.detail}`.toLowerCase();
    if (t.includes('offline progress')) {
      setIdleChestReward(rewardPopup);
      setIdleChestReady(false);
      setIdleChestOpen(true);
      return;
    }
  }, [rewardPopup]);

  useEffect(() => {
    if (!cinematicSummonOpen) {
      cinematicPulse.stopAnimation();
      cinematicPulse.setValue(0);
      return;
    }
    Animated.loop(
      Animated.sequence([
        Animated.timing(cinematicPulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(cinematicPulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [cinematicPulse, cinematicSummonOpen]);

  useEffect(() => {
    if (cinematicSummonPhase !== 'reveal') return;
    cinematicRevealScale.setValue(0.8);
    Animated.spring(cinematicRevealScale, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [cinematicRevealScale, cinematicSummonPhase]);

  useEffect(() => {
    return () => {
      cinematicTimersRef.current.forEach(timer => clearTimeout(timer));
      cinematicTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const latest = state.summonHistory[0];
    if (!latest) return;
    if (lastSummonIdRef.current === latest.id) return;
    lastSummonIdRef.current = latest.id;
    if (pendingCinematicSummonRef.current) {
      pendingCinematicSummonRef.current = false;
      const latestTen = state.summonHistory.slice(0, 10).map(entry => ({
        id: entry.id,
        heroId: heroTemplateIdByName.get(entry.heroName) ?? null,
        heroName: entry.heroName,
        emoji: entry.heroEmoji,
        rarity: entry.rarity,
      }));
      setCinematicSummonResults(latestTen);
      setCinematicSummonPhase('reveal');
      return;
    }
    if (cinematicSummonOpen) return;
    setSummonReveal({
      id: latest.id,
      heroId: heroTemplateIdByName.get(latest.heroName) ?? null,
      heroName: latest.heroName,
      emoji: latest.heroEmoji,
      rarity: latest.rarity,
    });
    const timer = setTimeout(() => setSummonReveal(null), 2000);
    return () => clearTimeout(timer);
  }, [cinematicSummonOpen, heroTemplateIdByName, state.summonHistory]);

  useEffect(() => {
    if (!rewardPopup && !idleChestOpen) {
      setIdleChestReady(false);
      setIdleChestReward(null);
    }
  }, [rewardPopup, idleChestOpen]);

  const onTabChange = (nextTab: Tab) => {
    debugLog('ui', 'Tab changed', { from: tab, to: nextTab, wave: state.wave });
    void trackGameplayAction('ui_tab_changed', { from: tab, to: nextTab, wave: state.wave }, 500);
    setTab(nextTab);
  };

  useEffect(() => {
    if (!eventsOpen) return;
    debugLog('ui', 'Events panel opened', { wave: state.wave, seasonPoints: state.seasonPoints });
    void trackGameplayAction('ui_events_opened', { wave: state.wave, seasonPoints: state.seasonPoints }, 1000);
  }, [eventsOpen, state.wave, state.seasonPoints]);

  useEffect(() => {
    if (!shopOpen) return;
    debugLog('ui', 'Shop opened', { shopTab, diamonds: state.diamonds, gold: state.gold });
    void trackGameplayAction('ui_shop_opened', { shopTab, diamonds: state.diamonds, gold: state.gold }, 1000);
  }, [shopOpen, shopTab, state.diamonds, state.gold]);

  useEffect(() => {
    if (!settingsOpen) return;
    debugLog('ui', 'Settings opened', { wave: state.wave, level: state.level });
    void trackGameplayAction('ui_settings_opened', { wave: state.wave, level: state.level }, 1000);
  }, [settingsOpen, state.wave, state.level]);

  const getDiceOutcome = (roll: number) => {
    // Exact same formula as reducer for consistency
    const diamonds = roll === 20 ? 30 : roll >= 17 ? 18 : roll >= 13 ? 12 : roll >= 9 ? 8 : 5;
    const shards = roll >= 15 ? Math.floor(roll * 1.5 * 8) : 0;  // More generous shard scaling
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
      { key: 'bulwark', name: 'Bulwark Seal', description: '+HP', dps: 0, hp: 0.10, def: 0 },
      { key: 'aegis', name: 'Aegis Script', description: '+DEF', dps: 0, hp: 0, def: 0.10 },
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
    setReconGameOpen(false);
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
    setReconGameOpen(true);
  };

  const revealReconChoice = (pickIndex: number) => {
    if (reconRevealInProgress || reconRevealComplete) return;
    setReconRevealInProgress(true);
    setReconPickedIndex(pickIndex);

    const otherIndices = [0, 1, 2].filter(index => index !== pickIndex && index < reconChoices.length);

    // Swap card content at the midpoint of each flip (when scaleX reaches 0)
    setTimeout(() => setReconCardsRevealed(prev => { const n = [...prev]; n[pickIndex] = true; return n; }), 160);
    if (otherIndices[0] !== undefined) {
      setTimeout(() => setReconCardsRevealed(prev => { const n = [...prev]; n[otherIndices[0]] = true; return n; }), 450);
    }
    if (otherIndices[1] !== undefined) {
      setTimeout(() => setReconCardsRevealed(prev => { const n = [...prev]; n[otherIndices[1]] = true; return n; }), 710);
    }
    const sequences: Animated.CompositeAnimation[] = [
      Animated.timing(reconFlipAnims[pickIndex], {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
    ];
    otherIndices.forEach(index => {
      sequences.push(
        Animated.timing(reconFlipAnims[index], {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      );
    });

    Animated.sequence(sequences).start(() => {
      Animated.spring(reconSelectedScale, {
        toValue: 1.1,
        friction: 6,
        tension: 90,
        useNativeDriver: true,
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
    setLockpickGameOpen(true);
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
    setLockpickHintText(`Access denied. 1st digit: ${d1Hint}. 2nd digit: ${d2Hint}. Attempts left: ${3 - nextAttempts}.`);
  };

  const claimLockpickCacheGame = () => {
    if (lockpickSolved == null) return;
    debugLog('gameplay', 'Claim Lockpick Cache', { solved: lockpickSolved });
    playLockpickCache(lockpickSolved);
    setLockpickGameOpen(false);
    setLockpickHintText(null);
  };

  const openTargetPracticeGame = () => {
    if (!canPlayTargetToday) return;
    debugLog('gameplay', 'Open Target Practice', { wave: state.wave });
    setTargetPracticeMeter({ position: 8, direction: 1 });
    setTargetPracticeScore(null);
    setTargetPracticeGameOpen(true);
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
    setTargetPracticeGameOpen(false);
    setTargetPracticeScore(null);
  };

  useEffect(() => {
    if (!targetPracticeGameOpen || targetPracticeScore != null) return;
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
  }, [targetPracticeGameOpen, targetPracticeScore]);

  const chooseRiftBuff = (choice: RiftBuffChoice) => {
    if (riftDungeonResult || riftIsSimulating) return;

    const nextBonuses = [...riftSelectedBonuses, choice];
    setRiftSelectedBonuses(nextBonuses);

    // Calculate wave outcome with accumulated buffs for THIS wave
    const baseDps = Number.isFinite(dpsBreakdown.finalDps) && dpsBreakdown.finalDps > 0 ? dpsBreakdown.finalDps : Math.max(1, stats.dps);
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
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(diceTranslateY, {
          toValue: -90,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(diceTranslateY, {
          toValue: 0,
          friction: 5,
          tension: 120,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setDiceRollResult(getDiceOutcome(rolled));
      setDiceIsRolling(false);
      diceRotate.setValue(0);
      diceTranslateY.setValue(0);
    });
  };

  const toggleWarPanel = (key: keyof typeof warPanels) => {
    setWarPanels(prev => ({ ...prev, [key]: !prev[key] }));
  };

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


  const triggerCinematicSummon = () => {
    if (!canGachaX10 || cinematicSummonOpen) return;
    cinematicTimersRef.current.forEach(timer => clearTimeout(timer));
    cinematicTimersRef.current = [];
    setCinematicSummonResults([]);
    setCinematicSummonOpen(true);
    setCinematicSummonPhase('charge');

    const phaseWarp = setTimeout(() => {
      setCinematicSummonPhase('warp');
      pendingCinematicSummonRef.current = true;
      summonHeroX10Cinematic(featuredSummonBanner.featuredHeroId);
    }, 850);

    const fallbackReveal = setTimeout(() => {
      if (!pendingCinematicSummonRef.current) return;
      pendingCinematicSummonRef.current = false;
      const latestTen = state.summonHistory.slice(0, 10).map(entry => ({
        id: entry.id,
        heroId: heroTemplateIdByName.get(entry.heroName) ?? null,
        heroName: entry.heroName,
        emoji: entry.heroEmoji,
        rarity: entry.rarity,
      }));
      setCinematicSummonResults(latestTen);
      setCinematicSummonPhase('reveal');
    }, 2600);

    const autoClose = setTimeout(() => {
      setCinematicSummonOpen(false);
      setCinematicSummonResults([]);
      setCinematicSummonPhase('charge');
    }, 6800);

    cinematicTimersRef.current.push(phaseWarp as unknown as number, fallbackReveal as unknown as number, autoClose as unknown as number);
  };

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
      const equippedItem = equippedId ? equipmentInventory[equippedId] ?? null : null;
      const equippedScore = equippedItem ? scoreEquipmentForClass(equippedItem, state.playerClass) : Number.NEGATIVE_INFINITY;

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

  const renderSubTabBar = (items: Array<{
    id: string;
    label: string;
    active: boolean;
    onPress: () => void;
    disabled?: boolean;
    notificationCount?: number;
  }>) => {
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
    };

    return (
      <BottomNavigation
        activeTab={tab as BottomTabType}
        onTabChange={(nextTab: BottomTabType) => onTabChange(nextTab as Tab)}
        notifications={notifications}
      />
    );
  };

  const seasonScore = state.seasonPoints;
  const seasonRank = seasonScore < 1000 ? '🥉 Bronze' : seasonScore < 5000 ? '🥈 Silver' : seasonScore < 15000 ? '🥇 Gold' : seasonScore < 40000 ? '💎 Diamond' : '👑 Legend';
  const classMasteryLevel = Math.floor((state.playerClass ? state.classMasteryXp[state.playerClass] : 0) / 100);
  const campaignChapter = Math.floor((Math.max(1, state.wave) - 1) / 20) + 1;
  const campaignStage = ((Math.max(1, state.wave) - 1) % 20) + 1;
  const campaignBossStage = 20;
  const powerTier = teamPowerIndex < 12000 ? 'Recruit' : teamPowerIndex < 55000 ? 'Elite' : teamPowerIndex < 180000 ? 'Mythic' : 'Ascendant';
  const guildRank = state.totalKills < 500 ? 'Bronze Order' : state.totalKills < 2500 ? 'Silver Order' : state.totalKills < 9000 ? 'Gold Order' : 'Eternal Order';
  const betaLeaderboardRows = useMemo(() => {
    const playerBoardScore =
      seasonScore
      + Math.floor(state.bestSeasonPoints * 0.35)
      + state.wave * 12
      + state.highestWaveReached * 9
      + state.prestigeCount * 280;

    const seeded = [
      { name: 'NovaMarshal', score: Math.floor(playerBoardScore * 1.22), badge: '👑', isYou: false },
      { name: 'AsterVow', score: Math.floor(playerBoardScore * 1.14), badge: '💎', isYou: false },
      { name: 'RiftKite', score: Math.floor(playerBoardScore * 1.07), badge: '🥇', isYou: false },
      { name: 'NightRelay', score: Math.floor(playerBoardScore * 0.98), badge: '🥈', isYou: false },
      { name: 'LumenForge', score: Math.floor(playerBoardScore * 0.9), badge: '🥉', isYou: false },
      { name: 'ShardNomad', score: Math.floor(playerBoardScore * 0.83), badge: '⚔️', isYou: false },
    ];

    const allRows = [
      ...seeded,
      { name: state.playerName || 'You', score: playerBoardScore, badge: '🛰️', isYou: true },
    ]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((row, idx) => ({ ...row, rank: idx + 1 }));

    const myRank = allRows.find(r => r.isYou)?.rank ?? allRows.length;
    return {
      rows: allRows,
      myRank,
      playerBoardScore,
    };
  }, [seasonScore, state.bestSeasonPoints, state.wave, state.highestWaveReached, state.prestigeCount, state.playerName]);

  useEffect(() => {
    if (!eventsOpen) return;
    void trackEvent('leaderboard_viewed', {
      rank: betaLeaderboardRows.myRank,
      score: betaLeaderboardRows.playerBoardScore,
    });
    void trackEvent('leaderboard_rank', {
      rank: betaLeaderboardRows.myRank,
      score: betaLeaderboardRows.playerBoardScore,
    });
  }, [eventsOpen, betaLeaderboardRows.myRank, betaLeaderboardRows.playerBoardScore]);

  // Manage expedition queue timer display (ticks every second to update countdown display)
  useEffect(() => {
    const watchingExpeditionsTab = tab === 'operations' && operationsSubTab === 'expeditions';
    if (state.expeditionQueue.length === 0 && !watchingExpeditionsTab) return;
    const timer = setInterval(() => {
      setTimerTick(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [state.expeditionQueue, tab, operationsSubTab]);


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
    setSelectedCharacterClass(playerClass);
  }

  async function deleteCharacterSlot(playerClass: PlayerClass) {
    debugLog('character', 'Delete character slot requested', { playerClass });
    const saveKey = getSaveStorageKey(getCharacterSaveSlot(accountName, playerClass));
    await AsyncStorage.removeItem(saveKey);

    const lastSlotKey = getLastCharacterSlotKey(accountName);
    const lastSelected = await AsyncStorage.getItem(lastSlotKey);
    if (lastSelected === playerClass) {
      await AsyncStorage.removeItem(lastSlotKey);
      setLastUsedCharacterClass(null);
    }

    setSlotSummaries(prev => prev.map(slot => (
      slot.classId === playerClass
        ? {
          ...slot,
          occupied: false,
          playerName: null,
          level: 1,
          highestWaveReached: 1,
          vipLevel: 0,
        }
        : slot
    )));
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

    Alert.alert(
      `Delete ${cls.name} Character?`,
      'This permanently removes that slot save. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteCharacterSlot(playerClass);
          },
        },
      ],
    );
  }

  function returnToCharacterSelect() {
    debugLog('character', 'Return to character select');
    setSettingsOpen(false);
    setDraftName('');
    setSelectedCharacterClass(null);
  }

  const collectCharacterSnapshots = useCallback(async (): Promise<CharacterSnapshot[]> => {
    const rawAccounts = await AsyncStorage.getItem(ACCOUNTS_KEY);
    const rawSession = await AsyncStorage.getItem(SESSION_KEY);
    const currentSession = (rawSession ?? '').trim().toLowerCase();
    const now = Date.now();

    let accounts: string[] = [];
    try {
      const parsed = JSON.parse(rawAccounts ?? '[]') as Array<{ username?: string }>;
      accounts = parsed
        .map(entry => (typeof entry.username === 'string' ? entry.username.trim().toLowerCase() : ''))
        .filter(Boolean);
    } catch {
      accounts = [];
    }

    const snapshots: CharacterSnapshot[] = [];
    for (const username of accounts) {
      for (const cls of CLASSES) {
        const saveSlot = getCharacterSaveSlot(username, cls.id);
        const saveKey = getSaveStorageKey(saveSlot);
        const raw = await AsyncStorage.getItem(saveKey);
        if (!raw) continue;

        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          if (parsed.characterCreated !== true) continue;
          const playerName = typeof parsed.playerName === 'string' ? parsed.playerName.trim().slice(0, 24) : '';
          if (!playerName) continue;
          const level = typeof parsed.level === 'number' && Number.isFinite(parsed.level)
            ? Math.max(1, Math.floor(parsed.level))
            : 1;
          const highestWaveReached = typeof parsed.highestWaveReached === 'number' && Number.isFinite(parsed.highestWaveReached)
            ? Math.max(1, Math.floor(parsed.highestWaveReached))
            : 1;
          const lastActiveAt = typeof parsed.lastActiveAt === 'number' && Number.isFinite(parsed.lastActiveAt)
            ? Math.max(0, Math.floor(parsed.lastActiveAt))
            : 0;
          const isOnline = currentSession === username && (now - lastActiveAt) <= ONLINE_WINDOW_MS;
          snapshots.push({
            account: username,
            classId: cls.id,
            playerName,
            level,
            highestWaveReached,
            lastActiveAt,
            isOnline,
          });
        } catch {
          // Ignore corrupted slot snapshot entries.
        }
      }
    }

    return snapshots.sort((a, b) => {
      if (a.account !== b.account) return a.account.localeCompare(b.account);
      if (a.playerName !== b.playerName) return a.playerName.localeCompare(b.playerName);
      return a.classId.localeCompare(b.classId);
    });
  }, []);

  const runDevCommand = useCallback(async () => {
    const rawCommand = devCommandInput.trim();
    if (!rawCommand) {
      setDevCommandOutput('Enter a command first.');
      return;
    }

    const tokens = rawCommand.split(/\s+/);
    const command = (tokens[0] ?? '').toLowerCase();

    if (command === '/showonlineusersandcharacters') {
      const snapshots = await collectCharacterSnapshots();
      if (snapshots.length === 0) {
        setDevCommandOutput('No accounts or characters found.');
        return;
      }

      const onlineCount = snapshots.filter(s => s.isOnline).length;
      const lines = snapshots.map(snapshot => `${snapshot.isOnline ? 'ONLINE' : 'offline'} • ${snapshot.account} • ${snapshot.playerName} (${snapshot.classId}) • Lv ${snapshot.level} • Wave ${snapshot.highestWaveReached}`);
      setDevCommandOutput(`Users+Characters (${onlineCount}/${snapshots.length} online)\n${lines.join('\n')}`);
      return;
    }

    if (command === '/sendmsg') {
      const parsed = rawCommand.match(/^\/sendMsg\s+(\S+)\s+#([^#]+)#\s+##([\s\S]*?)##\s*(.*)$/i);
      if (!parsed) {
        setDevCommandOutput('Usage: /sendMsg (sendAll|User|User+CharName) #subject# ##message## $shard X, $gold X, $diamond X, $tears X, $essence X');
        return;
      }

      const targetSpec = (parsed[1] ?? '').trim();
      const subject = (parsed[2] ?? '').trim();
      const message = (parsed[3] ?? '').trim();
      const attachmentText = (parsed[4] ?? '').trim();
      if (!subject || !message) {
        setDevCommandOutput('Subject and message are required.');
        return;
      }

      const attachments: SaveMailboxEntry['attachments'] = { shards: 0, gold: 0, diamonds: 0, tears: 0, essence: 0 };
      const regex = /\$(shard|gold|diamond|tears|essence)\s+(\d+)/gi;
      let match: RegExpExecArray | null = regex.exec(attachmentText);
      while (match) {
        const key = (match[1] ?? '').toLowerCase();
        const amount = Math.max(0, Math.floor(Number(match[2])));
        if (Number.isFinite(amount) && amount > 0) {
          if (key === 'shard') attachments.shards += amount;
          if (key === 'gold') attachments.gold += amount;
          if (key === 'diamond') attachments.diamonds += amount;
          if (key === 'tears') attachments.tears += amount;
          if (key === 'essence') attachments.essence += amount;
        }
        match = regex.exec(attachmentText);
      }

      const senderName = state.playerName || 'Dev Team';
      const buildMail = (): SaveMailboxEntry => ({
        id: `mail_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        subject: subject.slice(0, 80),
        message: message.slice(0, 280),
        from: senderName,
        sentAt: Date.now(),
        attachments: {
          shards: attachments.shards,
          gold: attachments.gold,
          diamonds: attachments.diamonds,
          tears: attachments.tears,
          essence: attachments.essence,
        },
      });

      const appendMailToSnapshot = async (snapshot: CharacterSnapshot): Promise<SaveMailboxEntry | null> => {
        const saveSlot = getCharacterSaveSlot(snapshot.account, snapshot.classId);
        const saveKey = getSaveStorageKey(saveSlot);
        const raw = await AsyncStorage.getItem(saveKey);
        if (!raw) return null;

        try {
          const savePayload = JSON.parse(raw) as Record<string, unknown>;
          const mailbox = Array.isArray(savePayload.mailbox)
            ? savePayload.mailbox.filter(entry => !!entry && typeof entry === 'object') as SaveMailboxEntry[]
            : [];
          const outgoingMail = buildMail();
          mailbox.push(outgoingMail);
          savePayload.mailbox = mailbox.slice(-100);
          await AsyncStorage.setItem(saveKey, JSON.stringify(savePayload));
          return outgoingMail;
        } catch {
          return null;
        }
      };

      const snapshots = await collectCharacterSnapshots();
      const currentSnapshot = (state.characterCreated && selectedCharacterClass)
        ? {
          account: accountName,
          classId: selectedCharacterClass,
          playerName: state.playerName,
          level: state.level,
          highestWaveReached: state.highestWaveReached,
          lastActiveAt: Date.now(),
          isOnline: true,
        } as CharacterSnapshot
        : null;

      const allSnapshots = currentSnapshot && !snapshots.some(snapshot => snapshot.account === currentSnapshot.account && snapshot.classId === currentSnapshot.classId)
        ? [currentSnapshot, ...snapshots]
        : snapshots;

      if (allSnapshots.length === 0) {
        setDevCommandOutput('No character targets found.');
        return;
      }

      let targets: CharacterSnapshot[] = [];
      if (targetSpec.toLowerCase() === 'sendall') {
        targets = allSnapshots;
      } else if (targetSpec.includes('+')) {
        const [userRaw, charRaw] = targetSpec.split('+');
        const user = (userRaw ?? '').trim().toLowerCase();
        const char = (charRaw ?? '').trim().toLowerCase();
        targets = allSnapshots.filter(snapshot =>
          snapshot.account === user
          && (snapshot.classId.toLowerCase() === char || snapshot.playerName.trim().toLowerCase() === char),
        );
      } else {
        const user = targetSpec.trim().toLowerCase();
        targets = allSnapshots.filter(snapshot => snapshot.account === user);
      }

      if (targets.length === 0) {
        setDevCommandOutput(`No matching targets for "${targetSpec}".`);
        return;
      }

      let delivered = 0;
      const localMails: SaveMailboxEntry[] = [];
      for (const target of targets) {
        const createdMail = await appendMailToSnapshot(target);
        if (createdMail) {
          delivered += 1;
          if (target.account === accountName && target.classId === selectedCharacterClass) {
            localMails.push(createdMail);
          }
        }
      }

      if (localMails.length > 0) {
        appendMailboxMessages(localMails);
      }

      setDevCommandOutput(`Mail sent to ${delivered}/${targets.length} target character(s). Subject: ${subject}`);
      return;
    }

    setDevCommandOutput(`Unknown command: ${tokens[0]}. Supported: /sendMsg, /showOnlineusersAndCharacters`);
  }, [accountName, appendMailboxMessages, collectCharacterSnapshots, devCommandInput, selectedCharacterClass, state.characterCreated, state.highestWaveReached, state.level, state.playerName]);

  if (slotListLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A18" />
        <View style={styles.characterLoadingWrap}>
          <Text style={styles.createTitle}>Loading Characters...</Text>
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
          <Text style={styles.createSubtitle}>Each account can hold up to {CLASSES.length} characters, with one slot for each class. Filled: {occupiedCharacterCount}/{CLASSES.length}.</Text>

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
                      <Text style={styles.characterSlotTitle}>{cls.emoji} {cls.name}</Text>
                      <View style={styles.characterSlotBadges}>
                        <Text style={[styles.characterSlotBadge, slot.occupied ? styles.characterSlotBadgeFilled : styles.characterSlotBadgeEmpty]}>
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
          <Text style={styles.createTitle}>Loading {selectedClassConfig?.name ?? 'Character'}...</Text>
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
          <Text style={styles.createSubtitle}>This slot is locked to {selectedClassConfig?.name}. Summon allies. Rise as their leader.</Text>

          <Text style={styles.fieldLabel}>Hero Name</Text>
          <TextInput
            value={draftName}
            onChangeText={setDraftName}
            style={styles.input}
            placeholder="Enter hero name"
            placeholderTextColor="#7575A8"
            maxLength={24}
          />
          <Text style={styles.createHint}>Name must be 1-24 characters. You can have one character for each class slot.</Text>

          <Text style={styles.fieldLabel}>Class</Text>
          {selectedClassConfig && (
            <View style={[styles.classCard, styles.classCardSelected]}>
              <Text style={styles.className}>{selectedClassConfig.emoji} {selectedClassConfig.name}</Text>
              <Text style={styles.classFantasy}>{selectedClassConfig.fantasy}</Text>
              <Text style={styles.classStyle}>{selectedClassConfig.style}</Text>
            </View>
          )}

          <Pressable
            style={[styles.startBtn, draftName.trim().length === 0 && styles.startBtnDisabled]}
            disabled={draftName.trim().length === 0}
            onPress={() => {
              debugLog('character', 'Create character requested', { draftClass, nameLength: draftName.trim().length });
              createCharacter(draftName, draftClass);
            }}
          >
            <Text style={styles.startBtnText}>Start Adventure</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A18" />
      <View pointerEvents="none" style={styles.sceneDecor}>
        <View style={styles.sceneOrbA} />
        <View style={styles.sceneOrbB} />
        <View style={styles.sceneGrid} />
      </View>
      {summonReveal && (
        <View pointerEvents="none" style={styles.summonRevealOverlay}>
          <View style={[
            styles.summonRevealCard,
            {
              borderColor: rarityConfig(summonReveal.rarity).color,
              shadowColor: rarityConfig(summonReveal.rarity).color,
            },
          ]}>
            <Text style={styles.summonRevealLabel}>{rarityConfig(summonReveal.rarity).label.toUpperCase()} RECRUIT</Text>
            {renderSummonPortrait(summonReveal.heroId, summonReveal.emoji, true)}
            <Text style={styles.summonRevealName}>{summonReveal.heroName}</Text>
            <Text style={styles.summonRevealSub}>Joined your squad</Text>
          </View>
        </View>
      )}

      <Modal
        transparent
        visible={cinematicSummonOpen}
        animationType="fade"
        onRequestClose={() => setCinematicSummonOpen(false)}
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
                  {featuredSummonBanner.artEmoji} {featuredSummonBanner.title} • Featured: {featuredSummonBanner.featuredHeroEmoji} {featuredSummonBanner.featuredHeroName}
                </Text>
                <Text style={styles.cinematicSummonPhaseText}>
                  Focus protocol: elevated odds for featured hero at {featuredSummonBanner.highestRarity.toUpperCase()} rarity.
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
                        <Text style={styles.cinematicSummonResultName} numberOfLines={1}>{entry.heroName}</Text>
                        <Text style={[styles.cinematicSummonResultRarity, { color: rarity.color }]}>{rarity.label}</Text>
                      </View>
                    );
                  })}
                </View>
                <Pressable
                  style={styles.cinematicSummonCloseBtn}
                  onPress={() => {
                    debugLog('summon', 'Close cinematic summon results', { entries: cinematicSummonResults.length });
                    setCinematicSummonOpen(false);
                    setCinematicSummonResults([]);
                    setCinematicSummonPhase('charge');
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
        playerVipStatus={vipLevel >= 10 ? `VIP ${vipLevel} (MAX)` : `VIP ${vipLevel} (${fmt(vipPoints)}/${fmt(vipNextThreshold)})`}
        playerClass={`${stats.className} • Lv ${state.level}`}
        gold={state.gold}
        diamonds={state.diamonds}
        bossTearsOrdered={state.bossTears}
        heroShards={state.heroShards}
        essence={state.essence}
        dps={Math.max(1, Math.floor(stats.dps))}
        power={teamPowerIndex}
        mailUnreadCount={unreadMailCount}
        onActionPress={(action) => {
          debugLog('ui', 'Header action pressed', { action });
          if (action === 'settings') setSettingsOpen(true);
          else if (action === 'mail') {
            setMailOpen(true);
            if (!selectedMailId && state.mailbox.length > 0) {
              setSelectedMailId(state.mailbox[0].id);
            }
          }
          else if (action === 'shop') setShopOpen(true);
          else if (action === 'events') setEventsOpen(true);
          else if (action === 'stats') {
            onTabChange('stats');
            setAchievementsSubTab('overview');
          }
        }}
      />

      <View style={styles.headerQuickActionsRow}>
        <Pressable
          style={styles.headerQuickActionBtn}
          onPress={() => {
            debugLog('ui', 'Header quick action pressed', { action: 'events' });
            setEventsOpen(true);
          }}
        >
          <Text style={styles.headerQuickActionText}>🗓️ Events</Text>
        </Pressable>
        <Pressable
          style={styles.headerQuickActionBtn}
          onPress={() => {
            debugLog('ui', 'Header quick action pressed', { action: 'shop' });
            setShopOpen(true);
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

      {activeHint && (
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

      <View style={styles.nextStepBannerCompact}>
        <Pressable style={styles.nextStepChipCompact} onPress={() => onTabChange(nextGuidance.tab)}>
          <Text style={styles.nextStepChipText}>💡 {nextGuidance.title}</Text>
          <Text style={styles.nextStepChipArrow}>→</Text>
        </Pressable>
        {extraGuidanceCount > 0 && <Text style={styles.nextStepCompactMore}>+{extraGuidanceCount}</Text>}
      </View>

      <ScrollView
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        style={styles.metaStripScroll}
        contentContainerStyle={styles.metaStripRail}
      >
        <View style={styles.metaChip}>
          <Text style={styles.metaChipLabel}>Campaign</Text>
          <Text style={styles.metaChipValue}>Ch {campaignChapter} • {campaignStage}/{campaignBossStage}</Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipLabel}>Season</Text>
          <Text style={styles.metaChipValue}>{seasonRank} • {fmt(seasonScore)}</Text>
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
          <Text style={styles.metaChipValue}>{getActForWave(state.highestWaveReached).emoji} W{state.highestWaveReached}</Text>
        </View>
        <Pressable style={[styles.metaChip, styles.metaChipAction]} onPress={() => setChapterMapOpen(true)}>
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
              <View style={styles.hpBarBg}>
                <View
                  style={[
                    styles.hpBarFill,
                    {
                      width: `${teamHpPct}%`,
                      backgroundColor: teamHpPct > 30 ? '#33CC55' : '#EE3333',
                    },
                  ]}
                />
              </View>
              <Text style={styles.hpText}>{Math.ceil(state.teamHp)}/{Math.ceil(state.teamMaxHp)}</Text>
            </View>
          </View>

          {/* Monster Zone */}
          <View style={styles.monsterZone}>
            <Text style={styles.waveLabel}>{currentAct.emoji} {currentAct.name} • W{state.wave}{isBoss ? ' 👑' : ''}</Text>
            {isBossImminent && !isBoss && <Text style={styles.bossImminentText}>⚠️ Boss Approaching</Text>}
            <Text style={styles.monsterEmoji}>{monster.emoji}</Text>
            <Text style={styles.monsterName}>{monster.name}</Text>
            <View style={styles.monsterHpBarBg}>
              <View
                style={[
                  styles.hpBarFill,
                  {
                    width: `${monsterHpPct}%`,
                    backgroundColor: monsterHpPct > 50 ? '#33CC55' : monsterHpPct > 25 ? '#FFCC00' : '#EE3333',
                  },
                ]}
              />
            </View>
            <Text style={styles.hpText}>{Math.ceil(state.monsterHp)}/{Math.ceil(state.monsterMaxHp)} HP</Text>
            <View style={styles.affixRow}>
              {monsterAffixes.map(affix => (
                <Pressable
                  key={affix.id}
                  style={[
                    styles.affixChip,
                    { borderColor: affix.color },
                    activeAffixTooltipId === affix.id && styles.affixChipActive,
                  ]}
                  onPress={() => setActiveAffixTooltipId(current => current === affix.id ? null : affix.id)}
                  onPressIn={() => setActiveAffixTooltipId(affix.id)}
                  onHoverIn={() => setActiveAffixTooltipId(affix.id)}
                  onHoverOut={() => setActiveAffixTooltipId(current => current === affix.id ? null : current)}
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
              TTK {ttkSeconds >= 99 ? '99s+' : `${ttkSeconds.toFixed(1)}s`} • Danger {dangerLabel} ({dangerScore.toFixed(0)}%)
            </Text>
            <Text style={styles.teamSynergyInline}>
              Rewards: 💰 {fmt(getMonsterGold(state.wave))} • ⭐ {fmt(getMonsterExp(state.wave))} EXP{isBoss ? ' • 👹 Boss bonus' : ''}
            </Text>
            {stats.synergies.length > 0 && (
              <Text style={styles.teamSynergyInline}>
                Synergies: {stats.synergies.map(s => s.name).join(' • ')}
              </Text>
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
                    <Text style={styles.monsterBuffIconText}>🛡️ -{Math.round(stats.damageReductionBuffPct * 100)}%</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </>
      )}

      {/* Tab Content */}
      <ScrollView
        style={[
          styles.tabContent,
          isCompactPhone && styles.tabContentCompact,
          isShortPhone && styles.tabContentShort,
        ]}
        contentContainerStyle={[
          styles.tabContentInner,
          isNativeApp && styles.tabContentInnerNative,
        ]}
      >

        <WarroomTabContent
          {...({
            tab,
            state,
            stats,
            campaignChapter,
            campaignStage,
            campaignBossStage,
            isBossImminent,
            teamPowerIndex,
            powerTier,
            nearUnlockAchievements,
            isBoss,
            monster,
            canRebirthNow,
            rebirthWaveRequirement,
            rebirthWavesLeft,
            currentAct,
            actProgressPct,
            nextBossUnlock,
            unlockLabel,
            dangerLabel,
            dangerScore,
            teamSlotCap,
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
            warPanels,
            toggleWarPanel,
            onTabChange,
            setAchievementsSubTab,
            setRebirthOpen,
            autoEquipBestHeroes,
            claimAllRewards,
            craftEquipment,
          } as any)}
        />

        <BattleTabContent
          {...({
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
            getClassConfig,
            usableInventory,
            setCombatTempo,
            burst,
            buyPremiumCoolant,
            useUsableItem,
          } as any)}
        />
        <HeroesTabContent
          {...({
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
            summonHeroX10,
            summonHeroX10Cinematic: triggerCinematicSummon,
            featuredSummonBanner,
            autoEquipBestHeroes,
            autoRecycleHeroes,
            saveTeamLoadout,
            loadTeamLoadout,
            toggleEquipHero,
            toggleHeroUniqueWeapon,
            rankUpHero,
            rebirthHero,
            levelUpHeroGold,
            unlockTeamSlot,
            batchLevelHeroes,
            setRecycleConfirmUid,
            renderSubTabBar,
          } as any)}
        />

        <StatsTabContent
          {...({
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
          } as any)}
        />

        <EquipmentTabContent
          {...({
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
            craftEquipment,
            equipItem,
            toggleHeroUniqueWeapon,
            upgradeEquipmentRarity,
            dismantleEquipment,
            convertShardsToEssence,
            convertShardsToScrap,
            renderSubTabBar,
          } as any)}
        />

        <AchievementsTabContent
          {...({
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
          } as any)}
        />

        <OperationsTabContent
          {...({
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
            setDiceRollModalOpen,
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
          } as any)}
        />
      </ScrollView>

      {/* Bottom Navigation */}
      {renderCommandDeck()}

      {storyUnlockToast && (
        <Pressable
          style={[styles.rewardToast, styles.rewardToastActive]}
          onPress={() => {
            setStoryUnlockToast(null);
            onTabChange('achievements');
            setAchievementsSubTab('codex');
          }}
        >
          <Text style={styles.rewardToastSparkle}>📖</Text>
          <View>
            <Text style={styles.rewardToastTitle}>New Chronicle Unlocked</Text>
            <Text style={styles.rewardToastDetail}>{storyUnlockToast.chapter} - {storyUnlockToast.title}</Text>
          </View>
          <Text style={styles.rewardToastSparkle}>View</Text>
        </Pressable>
      )}

      {rewardPopup && !idleChestReady && !isOfflineRewardPopup && (
        <Pressable style={[styles.rewardToast, styles.rewardToastActive]} onPress={clearRewardPopup}>
          <Text style={styles.rewardToastSparkle}>✨</Text>
          <View>
            <Text style={styles.rewardToastTitle}>{rewardPopup.title}</Text>
            <Text style={styles.rewardToastDetail}>{rewardPopup.detail}</Text>
          </View>
          <Text style={styles.rewardToastSparkle}>✨</Text>
        </Pressable>
      )}

      {/* Achievement Toast */}
      <AchievementToast
        achievementId={state.newAchievement}
        onDismiss={clearAchievement}
      />

      <Modal
        visible={chapterMapOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          debugLog('ui', 'Close campaign map modal');
          setChapterMapOpen(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.chapterMapModalBox}>
            <View style={styles.settingsHeaderRow}>
              <Text style={styles.modalTitle}>🧭 Campaign Route</Text>
              <Pressable style={styles.settingsCloseBtn} onPress={() => {
                debugLog('ui', 'Close campaign map modal');
                setChapterMapOpen(false);
              }}>
                <Text style={styles.settingsCloseBtnText}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.chapterMapSubtitle}>Chapter {campaignChapter} • Stage {campaignStage}/{campaignBossStage}</Text>
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
            <Text style={styles.chapterMapHint}>Every 5 stages: chest node • Stage 20: boss gate</Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={idleChestOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          debugLog('ui', 'Close idle chest modal');
          setIdleChestOpen(false);
          setIdleChestReward(null);
          clearRewardPopup();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.idleChestModalBox}>
            <Text style={styles.idleChestModalTitle}>🎁 Return Chest</Text>
            <Text style={styles.idleChestModalLine}>{idleChestReward?.title ?? 'Offline Progress'}</Text>
            <Text style={styles.idleChestModalLine}>{idleChestReward?.detail ?? ''}</Text>
            <Pressable
              style={styles.idleChestClaimBtn}
              onPress={() => {
                debugLog('reward', 'Claim idle chest');
                setIdleChestOpen(false);
                setIdleChestReward(null);
                clearRewardPopup();
              }}
            >
              <Text style={styles.idleChestClaimText}>Claim Rewards</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Shop Modal */}
      <Modal
        visible={shopOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          debugLog('ui', 'Close shop modal', { tab: shopTab });
          setShopOpen(false);
        }}
      >
        <View style={styles.bottomSheetOverlay}>
          <View style={[styles.eventsModalBox, styles.bottomSheetBox]}>
            <View style={styles.eventsHeaderRow}>
              <Text style={styles.eventsModalTitle}>🛒 Shop</Text>
              <Pressable style={styles.settingsCloseBtn} onPress={() => {
                debugLog('ui', 'Close shop modal from button', { tab: shopTab });
                setShopOpen(false);
              }}>
                <Text style={styles.settingsCloseBtnText}>Close</Text>
              </Pressable>
            </View>

            {renderSubTabBar([
              { id: 'diamond', label: 'Diamond Shop', active: shopTab === 'diamond', onPress: () => { debugLog('shop', 'Switch shop tab', { from: shopTab, to: 'diamond' }); setShopTab('diamond'); } },
              { id: 'gold', label: 'Gold Shop', active: shopTab === 'gold', onPress: () => { debugLog('shop', 'Switch shop tab', { from: shopTab, to: 'gold' }); setShopTab('gold'); } },
              { id: 'dollar', label: 'Dollar Shop', active: shopTab === 'dollar', onPress: () => { debugLog('shop', 'Switch shop tab', { from: shopTab, to: 'dollar' }); setShopTab('dollar'); } },
            ])}

            <ScrollView style={styles.eventsScroll} contentContainerStyle={styles.eventsScrollContent}>
              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>👑 VIP Status</Text>
                <Text style={styles.eventsStatLine}>Level: {vipLevel}/10 • Points: {fmt(vipPoints)}</Text>
                <Text style={styles.eventsStatLine}>Bonuses: +{stats.vipDamageBonusPct.toFixed(1)}% DPS • +{stats.vipGoldBonusPct.toFixed(1)}% Gold • +{stats.vipExpBonusPct.toFixed(1)}% EXP</Text>
                <View style={styles.hpBarBg}>
                  <View style={[styles.hpBarFill, { width: `${vipProgressPct}%`, backgroundColor: '#FFE07A' }]} />
                </View>
                <Text style={styles.eventsHint}>
                  {vipLevel >= 10
                    ? 'MAX VIP reached.'
                    : `Next VIP at ${fmt(vipNextThreshold)} points (${fmt(Math.max(0, vipNextThreshold - vipPoints))} to go).`}
                </Text>
              </View>

              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>🎁 VIP Milestone Rewards</Text>
                <Text style={styles.eventsHint}>Each VIP level reward is one-time claimable after reaching that level.</Text>
                {VIP_REWARD_MILESTONES.map(row => {
                  const claimed = vipClaimedLevels.includes(row.level);
                  const canClaim = !claimed && vipLevel >= row.level;
                  return (
                    <View key={row.level} style={styles.shopOfferRow}>
                      <View style={styles.shopOfferInfo}>
                        <Text style={styles.shopOfferTitle}>VIP {row.level} Milestone</Text>
                        <Text style={styles.shopOfferDesc}>
                          +{fmt(row.diamonds)} diamonds • +{fmt(row.gold)} gold • +{fmt(row.shards)} shards{row.essence > 0 ? ` • +${fmt(row.essence)} essence` : ''}
                        </Text>
                      </View>
                      <Pressable
                        style={[styles.eventsActionBtn, !canClaim && styles.shopBuyBtnDisabled]}
                        disabled={!canClaim}
                        onPress={() => {
                          debugLog('shop', 'Claim VIP reward', { level: row.level });
                          void trackGameplayAction('shop_vip_reward_claimed', { level: row.level }, 0);
                          claimVipReward(row.level);
                        }}
                      >
                        <Text style={styles.eventsActionBtnText}>{claimed ? 'Claimed' : canClaim ? 'Claim' : `VIP ${row.level}`}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>

              {shopTab === 'diamond' && (
                <View style={styles.eventsCard}>
                  <Text style={styles.eventsCardTitle}>💎 Diamond Shop</Text>
                  <Text style={styles.eventsHint}>Spend diamonds on premium consumables like heat coolants.</Text>
                  {DIAMOND_SHOP_OFFERS.map(offer => {
                    const canBuy = state.diamonds >= offer.cost;
                    return (
                      <View key={offer.id} style={styles.shopOfferRow}>
                        <View style={styles.shopOfferInfo}>
                          <Text style={styles.shopOfferTitle}>{offer.name}</Text>
                          <Text style={styles.shopOfferDesc}>{offer.desc}</Text>
                          <Text style={styles.shopOfferPrice}>Cost: {offer.cost} 💎</Text>
                        </View>
                        <Pressable
                          style={[styles.eventsActionBtn, !canBuy && styles.shopBuyBtnDisabled]}
                          disabled={!canBuy}
                          onPress={() => {
                            debugLog('shop', 'Buy diamond shop item', { offerId: offer.id, cost: offer.cost });
                            void trackGameplayAction('shop_diamond_purchase', { offerId: offer.id, cost: offer.cost }, 0);
                            buyDiamondShopItem(offer.id);
                          }}
                        >
                          <Text style={styles.eventsActionBtnText}>{canBuy ? 'Buy' : 'Need 💎'}</Text>
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
                    return (
                      <View key={offer.id} style={styles.shopOfferRow}>
                        <View style={styles.shopOfferInfo}>
                          <Text style={styles.shopOfferTitle}>{offer.name}</Text>
                          <Text style={styles.shopOfferDesc}>{offer.desc}</Text>
                          <Text style={styles.shopOfferPrice}>Cost: {fmt(offer.cost)} gold</Text>
                        </View>
                        <Pressable
                          style={[styles.eventsActionBtn, !canBuy && styles.shopBuyBtnDisabled]}
                          disabled={!canBuy}
                          onPress={() => {
                            debugLog('shop', 'Buy gold shop item', { offerId: offer.id, cost: offer.cost });
                            void trackGameplayAction('shop_gold_purchase', { offerId: offer.id, cost: offer.cost }, 0);
                            buyGoldShopItem(offer.id);
                          }}
                        >
                          <Text style={styles.eventsActionBtnText}>{canBuy ? 'Buy' : 'Need Gold'}</Text>
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
                  {DOLLAR_SHOP_OFFERS.map(offer => {
                    const firstBonusAvailable = !dollarFirstPurchaseClaimed.has(offer.id);
                    const totalDiamonds = offer.diamonds + (firstBonusAvailable ? offer.firstBonusDiamonds : 0);
                    return (
                      <View key={offer.id} style={styles.shopOfferRow}>
                        <View style={styles.shopOfferInfo}>
                          <Text style={styles.shopOfferTitle}>{offer.label} Pack</Text>
                          <Text style={styles.shopOfferDesc}>+{fmt(totalDiamonds)} diamonds • +{offer.vipPoints} VIP points</Text>
                          <Text style={styles.shopOfferPrice}>{firstBonusAvailable ? `First Purchase Bonus: +${fmt(offer.firstBonusDiamonds)} diamonds` : 'First purchase bonus already claimed'}</Text>
                        </View>
                        <Pressable
                          style={[styles.eventsActionBtn, !ENABLE_SIMULATED_DOLLAR_PURCHASES && styles.shopBuyBtnDisabled]}
                          disabled={!ENABLE_SIMULATED_DOLLAR_PURCHASES}
                          onPress={() => {
                            debugLog('shop', 'Simulate IAP dollar purchase', { offerId: offer.id, firstBonus: firstBonusAvailable });
                            void trackGameplayAction('shop_iap_simulated', { offerId: offer.id, firstBonus: firstBonusAvailable }, 0);
                            simulateDollarPurchase(offer.id);
                          }}
                        >
                          <Text style={styles.eventsActionBtnText}>
                            {ENABLE_SIMULATED_DOLLAR_PURCHASES
                              ? firstBonusAvailable ? 'Sim Buy x2' : 'Sim Buy'
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
        visible={eventsOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          debugLog('ui', 'Close events modal');
          setEventsOpen(false);
        }}
      >
        <View style={styles.bottomSheetOverlay}>
          <View style={[styles.eventsModalBox, styles.bottomSheetBox]}>
            <View style={styles.eventsHeaderRow}>
              <Text style={styles.eventsModalTitle}>🗓️ Events & Seasons</Text>
              <Pressable style={styles.settingsCloseBtn} onPress={() => {
                debugLog('ui', 'Close events modal from button');
                setEventsOpen(false);
              }}>
                <Text style={styles.settingsCloseBtnText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.eventsScroll} contentContainerStyle={styles.eventsScrollContent}>

              {/* Streak Insurance */}
              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>🔥 Login Streak</Text>
                <Text style={styles.eventsStatLine}>Current Streak: {state.dailyLoginStreak ?? 0} days</Text>
                <Text style={styles.eventsStatLine}>Streak Insurance Charges: {state.streakInsuranceCharges}</Text>
                <View style={styles.hpBarBg}>
                  <View style={[styles.hpBarFill, { width: `${Math.min(100, ((state.dailyLoginStreak ?? 0) / 30) * 100)}%`, backgroundColor: '#FFB347' }]} />
                </View>
                <Text style={styles.eventsHint}>{Math.max(0, 30 - (state.dailyLoginStreak ?? 0))} days to streak milestone (30 days). Gain +1 insurance every 7-day streak.</Text>
              </View>

              {/* Daily Quest Chain */}
              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>📋 Daily Chain</Text>
                <Text style={styles.eventsSubtitle}>Complete all 3 for bonus essence cache</Text>
                {[
                  { id: 'd1', title: 'Wave Pusher', desc: `Defeat ${Math.ceil(state.wave / 10) * 10 + 10} waves`, progress: state.wave, target: Math.ceil(state.wave / 10) * 10 + 10, reward: '10 Shards' },
                  { id: 'd2', title: 'Recruiter', desc: 'Have 5 heroes in your roster', progress: state.heroRoster.length, target: 5, reward: '200 Gold' },
                  { id: 'd3', title: 'Gear Up', desc: 'Fill all 3 equipment slots', progress: Object.values(state.equippedItems).filter(Boolean).length, target: 3, reward: '50 Scrap' },
                ].map(q => {
                  const done = q.progress >= q.target;
                  return (
                    <View key={q.id} style={[styles.dailyQuestRow, done && styles.dailyQuestRowDone]}>
                      <Text style={styles.dailyQuestCheck}>{done ? '✅' : '○'}</Text>
                      <View style={styles.dailyQuestInfo}>
                        <Text style={styles.dailyQuestTitle}>{q.title}</Text>
                        <Text style={styles.dailyQuestDesc}>{q.desc}</Text>
                        <Text style={styles.dailyQuestProgress}>{Math.min(q.progress, q.target)}/{q.target}</Text>
                        <View style={styles.hpBarBg}>
                          <View style={[styles.hpBarFill, { width: `${Math.min(100, (q.progress / q.target) * 100)}%`, backgroundColor: done ? '#6DDB7B' : '#5DA8FF' }]} />
                        </View>
                      </View>
                      <Text style={styles.dailyQuestReward}>{q.reward}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Weekly Event */}
              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>{weeklyEvent.emoji} Weekly Event: {weeklyEvent.name}</Text>
                <Text style={styles.eventsStatLine}>{weeklyEvent.description}</Text>
                <Text style={styles.eventsStatLine}>Weekly Kills: {state.weeklyKills}</Text>
                <Text style={styles.eventsHint}>Earn kills to claim milestone rewards on the Achievements tab.</Text>
                <Pressable style={styles.eventsActionBtn} onPress={() => { 
                  debugLog('ui', 'Navigate to weekly achievements from events');
                  setEventsOpen(false); 
                  onTabChange('achievements'); 
                  setAchievementsSubTab('weekly'); 
                }}>
                  <Text style={styles.eventsActionBtnText}>View Weekly Track</Text>
                </Pressable>
              </View>

              {/* Seasonal Ladder */}
              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>🏆 Season Ladder</Text>
                <Text style={styles.eventsSubtitle}>Season score: {fmt(seasonScore)} pts</Text>
                <Text style={styles.eventsStatLine}>Best this season: {fmt(state.bestSeasonPoints)} pts</Text>
                <Text style={styles.eventsStatLine}>Peak progress: {getActForWave(state.highestWaveReached).emoji} {getActForWave(state.highestWaveReached).name} • W{state.highestWaveReached}</Text>
                <Text style={[styles.seasonRankBadge]}>{seasonRank}</Text>
                <Text style={styles.eventsHint}>Score based on wave progression + rebirths. Top ranks earn cosmetic banners at season end.</Text>
                {[
                  { rank: '🥉 Bronze', threshold: 0, banner: 'Iron Commander' },
                  { rank: '🥈 Silver', threshold: 1000, banner: 'Silver Vanguard' },
                  { rank: '🥇 Gold', threshold: 5000, banner: 'Gold Legion' },
                  { rank: '💎 Diamond', threshold: 15000, banner: 'Diamond Warlord' },
                  { rank: '👑 Legend', threshold: 40000, banner: 'Eternal Legend' },
                ].map(tier => (
                  <View key={tier.rank} style={[styles.ladderTierRow, seasonScore >= tier.threshold && styles.ladderTierActive]}>
                    <Text style={styles.ladderTierRank}>{tier.rank}</Text>
                    <Text style={styles.ladderTierInfo}>{tier.threshold > 0 ? `${fmt(tier.threshold)} pts` : 'Start'} — Banner: {tier.banner}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>🌐 Beta Leaderboard</Text>
                <Text style={styles.eventsSubtitle}>Multiplayer snapshot rank: #{betaLeaderboardRows.myRank} • Score {fmt(betaLeaderboardRows.playerBoardScore)}</Text>
                {betaLeaderboardRows.rows.map(row => (
                  <View key={`${row.name}_${row.rank}`} style={[styles.betaBoardRow, row.isYou && styles.betaBoardRowYou]}>
                    <Text style={styles.betaBoardRank}>#{row.rank}</Text>
                    <Text style={styles.betaBoardName}>{row.badge} {row.name}{row.isYou ? ' (You)' : ''}</Text>
                    <Text style={styles.betaBoardScore}>{fmt(row.score)}</Text>
                  </View>
                ))}
                <Text style={styles.eventsHint}>Beta note: global server board will replace this local snapshot in public beta.</Text>
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
                  Live Team Effect: {stats.formation.dpsBonusPct >= 0 ? '+' : ''}{stats.formation.dpsBonusPct.toFixed(1)}% DPS •
                  {' '} {stats.formation.hpBonusPct >= 0 ? '+' : ''}{stats.formation.hpBonusPct.toFixed(1)}% HP •
                  {' '} {stats.formation.incomingDeltaPct >= 0 ? '-' : '+'}{Math.abs(stats.formation.incomingDeltaPct).toFixed(1)}% incoming damage
                </Text>
              </View>

              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>🧬 Team Synergy Sets</Text>
                <Text style={styles.eventsSubtitle}>Class and faction combos unlock passive bonuses.</Text>
                {stats.synergies.length === 0 ? (
                  <Text style={styles.eventsHint}>No active set bonuses yet. Mix classes and factions in your active team.</Text>
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
      {recycleConfirmUid && (() => {
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
                <Text style={styles.modalWarning}>
                  This is irreversible!
                </Text>
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
        visible={smartCoolantConfirmOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          debugLog('ui', 'Close smart coolant confirm modal');
          setSmartCoolantConfirmOpen(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Enable Smart Coolant?</Text>
            <Text style={styles.modalContent}>
              Smart Use will automatically spend coolant when combat heat gets close to overheat.
            </Text>
            <Text style={styles.modalWarning}>
              Coolant is a premium consumable and costs diamonds to replace. Only enable this if you want automation spending those items.
            </Text>
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => {
                  debugLog('ui', 'Cancel smart coolant enable');
                  setSmartCoolantConfirmOpen(false);
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
                  setSmartCoolantConfirmOpen(false);
                }}
              >
                <Text style={styles.modalBtnTextConfirm}>Enable</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={settingsOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          debugLog('ui', 'Close settings modal');
          setSettingsOpen(false);
        }}
      >
        <View style={styles.bottomSheetOverlay}>
          <View style={[styles.settingsModalBox, styles.bottomSheetBox]}>
            <View style={styles.settingsHeaderRow}>
              <Text style={styles.modalTitle}>⚙️ Settings & Automation</Text>
              <Pressable style={styles.settingsCloseBtn} onPress={() => {
                debugLog('ui', 'Close settings modal from button');
                setSettingsOpen(false);
              }}>
                <Text style={styles.settingsCloseBtnText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.settingsScroll}>
              <View style={styles.settingsCard}>
                <Text style={styles.settingsCardTitle}>Character Slots</Text>
                <Text style={styles.settingsLabel}>Switch between your class-bound character slots or create a new one if an empty slot remains.</Text>
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
                  <Text style={styles.settingsCycleBtnText}>{HAS_BETA_FEEDBACK_FORM ? 'Open Feedback Form' : 'Feedback Form Soon'}</Text>
                </Pressable>
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsCardTitle}>Dev Mail Console</Text>
                <Text style={styles.settingsLabel}>Commands: /sendMsg (sendAll|User|User+CharName) #subject# ##message## $shard X, $gold X, $diamond X, $tears X, $essence X</Text>
                <Text style={styles.settingsLabel}>Commands: /showOnlineusersAndCharacters</Text>
                <View style={styles.devCommandRow}>
                  <TextInput
                    style={styles.devCommandInput}
                    placeholder="/sendMsg sendAll #WELCOME# ##message## $shard 100"
                    placeholderTextColor="#7F9CB8"
                    value={devCommandInput}
                    onChangeText={setDevCommandInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Pressable style={styles.settingsCycleBtn} onPress={() => { void runDevCommand(); }}>
                    <Text style={styles.settingsCycleBtnText}>Run</Text>
                  </Pressable>
                </View>
                {!!devCommandOutput && <Text style={styles.devCommandOutput}>{devCommandOutput}</Text>}
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsCardTitle}>Auto Potion</Text>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Enabled</Text>
                  <Pressable
                    style={[styles.settingsToggleBtn, state.autoUsePotionEnabled && styles.settingsToggleBtnActive]}
                    onPress={() => {
                      debugLog('settings', 'Toggle auto potion', { nextState: !state.autoUsePotionEnabled });
                      void trackGameplayAction('setting_auto_potion_toggled', { enabled: !state.autoUsePotionEnabled }, 0);
                      setAutoUsePotion(!state.autoUsePotionEnabled);
                    }}
                  >
                    <Text style={styles.settingsToggleText}>{state.autoUsePotionEnabled ? 'ON' : 'OFF'}</Text>
                  </Pressable>
                </View>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Trigger HP</Text>
                  <View style={styles.settingsAdjustWrap}>
                    <Pressable style={styles.autoPotionAdjustBtn} onPress={() => {
                      const nextValue = state.autoUsePotionThresholdPct - 0.05;
                      debugLog('settings', 'Decrease auto potion threshold', { from: state.autoUsePotionThresholdPct, to: nextValue });
                      setAutoUsePotionThreshold(nextValue);
                    }}>
                      <Text style={styles.autoPotionAdjustText}>-</Text>
                    </Pressable>
                    <Text style={styles.settingsValueText}>{(state.autoUsePotionThresholdPct * 100).toFixed(0)}%</Text>
                    <Pressable style={styles.autoPotionAdjustBtn} onPress={() => {
                      const nextValue = state.autoUsePotionThresholdPct + 0.05;
                      debugLog('settings', 'Increase auto potion threshold', { from: state.autoUsePotionThresholdPct, to: nextValue });
                      setAutoUsePotionThreshold(nextValue);
                    }}>
                      <Text style={styles.autoPotionAdjustText}>+</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.settingsSubCard}>
                  <View style={styles.settingsRowBetween}>
                    <View style={styles.settingsSubLabelWrap}>
                      <Text style={styles.settingsLabel}>Smart Use Coolant</Text>
                      <Text style={styles.settingsHintText}>Adds premium coolant to auto-consumables. Auto Potion remains the master toggle for this section.</Text>
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
                        setSettingsOpen(false);
                        setSmartCoolantConfirmOpen(true);
                      }}
                    >
                      <Text style={styles.settingsToggleText}>{state.autoUseCoolantEnabled ? 'ON' : 'OFF'}</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.settingsSubtleText}>Smart Use prefers 🧊 first and escalates to ❄️ only when heat is close to cap.</Text>
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
                      void trackGameplayAction('setting_auto_recycle_toggled', { enabled: !state.autoRecycleEnabled }, 0);
                      setAutoRecycleEnabled(!state.autoRecycleEnabled);
                    }}
                  >
                    <Text style={styles.settingsToggleText}>{state.autoRecycleEnabled ? 'ON' : 'OFF'}</Text>
                  </Pressable>
                </View>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Max Rarity</Text>
                  <Pressable style={styles.settingsCycleBtn} onPress={() => {
                    debugLog('settings', 'Cycle auto recycle max rarity', { from: state.autoRecycleMaxRarity });
                    cycleAutoRecycleRarity();
                  }}>
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
                  <Pressable style={styles.settingsCycleBtn} onPress={() => {
                    const nextMode = state.autoSummonMode === 'single' ? 'x10' : 'single';
                    debugLog('settings', 'Change auto summon mode', { from: state.autoSummonMode, to: nextMode });
                    void trackGameplayAction('setting_auto_summon_mode_changed', { mode: nextMode }, 0);
                    setAutoSummonMode(nextMode);
                  }}>
                    <Text style={styles.settingsCycleBtnText}>{state.autoSummonMode.toUpperCase()}</Text>
                  </Pressable>
                </View>
                <Text style={styles.settingsHintText}>Summons consume Boss Tears, so reserve gold controls were removed.</Text>
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
                <Text style={styles.settingsHintText}>When burst charge reaches 20, it auto-fires with tempo-scaled hits.</Text>
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
                    onPress={() => setAutoTempoTarget((state.vipLevel ?? 0) < 1 ? 2 : state.autoTempoTarget === 2 ? 4 : 2)}
                    disabled={(state.vipLevel ?? 0) < 1}
                  >
                    <Text style={styles.settingsCycleBtnText}>{state.autoTempoTarget}x</Text>
                  </Pressable>
                </View>
                <Text style={styles.settingsHintText}>At heat 0, auto tempo re-engages from 1x to your selected target.</Text>
                {(state.vipLevel ?? 0) < 1 && <Text style={styles.settingsHintText}>4x auto tempo unlocks at VIP 1.</Text>}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={mailOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          debugLog('ui', 'Close mail modal');
          setMailOpen(false);
        }}
      >
        <View style={styles.bottomSheetOverlay}>
          <View style={[styles.settingsModalBox, styles.bottomSheetBox]}>
            <View style={styles.settingsHeaderRow}>
              <Text style={styles.modalTitle}>✉️ Mailbox</Text>
              <Pressable style={styles.settingsCloseBtn} onPress={() => setMailOpen(false)}>
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

            <View style={styles.mailboxBodyRow}>
              <ScrollView style={styles.mailboxListPane}>
                {state.mailbox
                  .slice()
                  .sort((a, b) => b.sentAt - a.sentAt)
                  .map(mail => {
                    const hasAttachments = (mail.attachments.shards + mail.attachments.gold + mail.attachments.diamonds + mail.attachments.tears + mail.attachments.essence) > 0;
                    return (
                      <Pressable
                        key={mail.id}
                        style={[
                          styles.mailCard,
                          selectedMailId === mail.id && styles.mailCardActive,
                        ]}
                        onPress={() => setSelectedMailId(mail.id)}
                      >
                        <View style={styles.mailCardTopRow}>
                          <Text style={styles.mailCardSubject} numberOfLines={1}>{mail.subject}</Text>
                          <Text style={styles.mailCardAttachmentIcon}>{hasAttachments ? '📎' : '✓'}</Text>
                        </View>
                        <Text style={styles.mailCardMeta} numberOfLines={1}>From {mail.from}</Text>
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
                      {(Object.keys(selectedMail.attachments) as Array<'shards' | 'gold' | 'diamonds' | 'tears' | 'essence'>).map(key => {
                        const amount = selectedMail.attachments[key];
                        if (amount <= 0) return null;
                        const label = key === 'shards'
                          ? 'Shards'
                          : key === 'gold'
                            ? 'Gold'
                            : key === 'diamonds'
                              ? 'Diamonds'
                              : key === 'tears'
                                ? 'Tears'
                                : 'Essence';
                        return (
                          <Pressable
                            key={`${selectedMail.id}_${key}`}
                            style={styles.mailAttachmentBtn}
                            onPress={() => claimMailAttachment(selectedMail.id, key)}
                          >
                            <Text style={styles.mailAttachmentBtnText}>Claim {label} +{amount}</Text>
                          </Pressable>
                        );
                      })}
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
        visible={diceRollModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!diceIsRolling) {
            setDiceRollModalOpen(false);
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
                    setDiceRollModalOpen(false);
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
        visible={riftDungeonModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!riftIsSimulating) {
            setRiftDungeonModalOpen(false);
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
                    setRiftDungeonModalOpen(false);
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
                <Text style={styles.riftSimulationHint}>Wave {Math.max(1, riftBonusRound)}/5: choose 1 of 3 buffs.</Text>
                <View style={styles.waveBarsContainer}>
                  {[1, 2, 3, 4, 5].map(wave => {
                    const isCleared = wave < Math.max(1, riftBonusRound);
                    const isActive = wave === Math.max(1, riftBonusRound);
                    return (
                      <View
                        key={wave}
                        style={[
                          styles.waveBar,
                          isCleared && styles.waveBarCleared,
                          isActive && styles.waveBarActive,
                        ]}
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

      <Modal
        visible={reconGameOpen}
        transparent
        animationType="fade"
        onRequestClose={resetReconGame}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.miniGameModalContent}>
            <Text style={styles.diceRollTitle}>🛰️ Recon Sweep</Text>
            <Text style={styles.miniGameHint}>Pick one intel card. It flips first, then the remaining intel is revealed.</Text>
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
        visible={lockpickGameOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLockpickGameOpen(false)}
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
                <Pressable style={styles.modalBtn} onPress={() => setLockpickGameOpen(false)}>
                  <Text style={styles.modalBtnText}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.modalCloseBtn} onPress={claimLockpickCacheGame}>
                <Text style={styles.modalCloseBtnText}>{lockpickSolved ? 'Claim Diamond Cache' : 'Claim Salvage Gold'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={targetPracticeGameOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setTargetPracticeGameOpen(false);
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
        visible={rebirthOpen}
        wave={state.wave}
        highestWave={state.highestWaveReached}
        requiredWave={rebirthWaveRequirement}
        prestigeCount={state.prestigeCount}
        onConfirm={rebirth}
        onCancel={() => setRebirthOpen(false)}
      />
    </SafeAreaView>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────────────

export { styles };

