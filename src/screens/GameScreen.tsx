import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Pressable,
  Platform,
  StatusBar,
  TextInput,
  Modal,
  Linking,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENABLE_SIMULATED_DOLLAR_PURCHASES, EXPEDITION_CONTRACT_REFRESH_GOLD_COST, EXPEDITION_CONTRACT_REFRESH_MS, getCharacterSaveSlot, getDpsBreakdown, getEquipmentCraftCost, getHeroGoldLevelCost, getMaxHeatForLevel, getSaveStorageKey, useGameState, VALID_FORMATION_ROLES_FOR_CLASS } from '../useGameState';
import { trackEvent } from '../telemetry';
import {
  ACHIEVEMENTS,
  CLASSES,
  PlayerClass,
  StatKey,
  EquipmentSlot,
  RARITIES,
  ACTIVE_TEAM_SIZE,
  REBIRTH_WAVE_THRESHOLD,
  TUTORIAL_QUESTS,
  TutorialEvent,
  getEquipmentItem,
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
  HERO_LEVEL_CAP,
} from '../gameConfig';
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
  GuildhallTabContent,
} from './tabs';

export type Tab = 'warroom' | 'battle' | 'heroes' | 'stats' | 'achievements' | 'equipment' | 'guildhall';
type HeroesSubTab = 'summon' | 'roster';
type EquipmentSubTab = 'inventory' | 'craft' | 'forge';
type AchievementsSubTab = 'overview' | 'weekly' | 'missions' | 'achievements' | 'collection' | 'codex';
type GuildhallSubTab = 'batch' | 'facilities' | 'expeditions';
type ShopTab = 'diamond' | 'gold' | 'dollar';
export type ExpeditionType = 'artifact' | 'merchant' | 'ruins' | 'vault' | 'abyss';
export type ExpeditionRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'godly';

type SummonReveal = {
  id: string;
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

const TAB_META: Record<Tab, { icon: string; label: string; mood: string }> = {
  warroom: { icon: '🛰️', label: 'War Room', mood: 'All Systems' },
  battle: { icon: '⚔️', label: 'Warfront', mood: 'Push Waves' },
  heroes: { icon: '👥', label: 'Roster', mood: 'Squad Ops' },
  stats: { icon: '📊', label: 'Growth', mood: 'Power Grid' },
  equipment: { icon: '🎒', label: 'Armory', mood: 'Forge Gear' },
  achievements: { icon: '🏆', label: 'Legends', mood: 'Milestones' },
  guildhall: { icon: '🏰', label: 'Guild Hall', mood: 'Infrastructure' },
};

export const ACH_BONUS_PER_UNLOCK_PCT = 3;
export const ACH_BONUS_CAP_PCT = 75;
const FEEDBACK_FORM_URL = 'https://forms.gle/replace-with-your-beta-form';
const HAS_BETA_FEEDBACK_FORM = !FEEDBACK_FORM_URL.includes('replace-with-your-beta-form');
const GEAR_RARITY_POINTS: Record<string, number> = { common: 40, rare: 90, epic: 170, legendary: 280, mythic: 430, transcendent: 680 };
const VIP_LEVEL_THRESHOLDS = [0, 50, 150, 350, 700, 1500, 3000, 6500, 15000, 35000, 100000] as const;
const GOLD_SHOP_OFFERS = [
  { id: 'exp_cache', name: 'Training Cache', desc: '+6 Training Scrolls', cost: 2800 },
  { id: 'potion_bundle', name: 'Field Bundle', desc: '+3 Small Potion, +1 Grand Potion, +2 Gold Cache', cost: 4200 },
  { id: 'armory_crate', name: 'Armory Crate', desc: 'Random class-compatible gear', cost: 12000 },
] as const;
const DIAMOND_SHOP_OFFERS = [
  { id: 'coolant_i_pack', name: 'Coolant Pack I', desc: '+4 Coolant Capsule I', cost: 24 },
  { id: 'coolant_ii_pack', name: 'Coolant Pack II', desc: '+3 Coolant Capsule II', cost: 58 },
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
  common: { goldCost: 25_000, durationMs: 5 * 60 * 1000, rewardsLabel: '+35💎 +150✨' },
  rare: { goldCost: 75_000, durationMs: 20 * 60 * 1000, rewardsLabel: '+75💎 +320✨ +1⚡' },
  epic: { goldCost: 220_000, durationMs: 90 * 60 * 1000, rewardsLabel: '+140💎 +700✨ +1⚡' },
  legendary: { goldCost: 500_000, durationMs: 4 * 60 * 60 * 1000, rewardsLabel: '+240💎 +1300✨ +2⚡' },
  godly: { goldCost: 1_000_000, durationMs: 8 * 60 * 60 * 1000, rewardsLabel: '+400💎 +2400✨ +4⚡' },
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
  occupied: boolean;
}

function getLastCharacterSlotKey(accountName: string): string {
  return `idlerpg_last_character_slot_v1_${accountName}`;
}

export default function GameScreen({ accountName, onLogout }: GameScreenProps) {
  const [selectedCharacterClass, setSelectedCharacterClass] = useState<PlayerClass | null>(null);
  const [slotSummaries, setSlotSummaries] = useState<CharacterSlotSummary[]>([]);
  const [slotListLoading, setSlotListLoading] = useState(true);
  const {
    hydrated,
    state,
    stats,
    createCharacter,
    notifyQuestEvent,
    attack,
    setActiveTeam,
    summonHero,
    summonHeroX10,
    autoEquipBestHeroes,
    saveTeamLoadout,
    loadTeamLoadout,
    unlockTeamSlot,
    autoRecycleHeroes,
    setAutoRecycleMaxRarity,
    setAutoRecycleEnabled,
    toggleEquipHero,
    setHeroFormation,
    playDiceRoll,
    runRiftDungeon,
    allocateStat,
    allocateStatMax,
    allocateStatN,
    burst,
    equipItem,
    recycleHero,
    rankUpHero,
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
    markHintSeen,
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
  } = useGameState(selectedCharacterClass ? getCharacterSaveSlot(accountName, selectedCharacterClass) : '__character_slot_preview__');

  const [tab, setTab] = useState<Tab>('warroom');
  const [rebirthOpen, setRebirthOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftClass, setDraftClass] = useState<PlayerClass>('warrior');
  const [teamSelectionMode, setTeamSelectionMode] = useState(false);
  const [activeTeamCollapsed, setActiveTeamCollapsed] = useState(false);
  const [tempTeam, setTempTeam] = useState<string[]>(state.activeTeamHeroIds);
  const [expandedHeroes, setExpandedHeroes] = useState<Set<string>>(new Set());
  const [recycleConfirmUid, setRecycleConfirmUid] = useState<string | null>(null);
  const [smartCoolantConfirmOpen, setSmartCoolantConfirmOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopTab, setShopTab] = useState<ShopTab>('diamond');
  const [heroesSubTab, setHeroesSubTab] = useState<HeroesSubTab>('summon');
  const [equipmentSubTab, setEquipmentSubTab] = useState<EquipmentSubTab>('inventory');
  const [achievementsSubTab, setAchievementsSubTab] = useState<AchievementsSubTab>('overview');
  const [guildhallSubTab, setGuildhallSubTab] = useState<GuildhallSubTab>('batch');
  const [eventsOpen, setEventsOpen] = useState(false);
  const [chapterMapOpen, setChapterMapOpen] = useState(false);
  const [compareItemId, setCompareItemId] = useState<string | null>(null);
  const [summonReveal, setSummonReveal] = useState<SummonReveal | null>(null);
  const [idleChestReady, setIdleChestReady] = useState(false);
  const [idleChestOpen, setIdleChestOpen] = useState(false);
  const [idleChestReward, setIdleChestReward] = useState<{ title: string; detail: string } | null>(null);
  const [storyUnlockToast, setStoryUnlockToast] = useState<{ id: string; title: string; chapter: string } | null>(null);
  const [hoveredTopChipId, setHoveredTopChipId] = useState<'dps' | 'power' | 'gear' | null>(null);
  const [activeAffixTooltipId, setActiveAffixTooltipId] = useState<string | null>(null);
  const [topChipTooltipAnchor, setTopChipTooltipAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const lastSummonIdRef = useRef<string | null>(null);
  const topChipRefs = useRef<Record<'dps' | 'power' | 'gear', View | null>>({ dps: null, power: null, gear: null });
  const storyUnlockInitRef = useRef(false);
  const seenStoryUnlockIdsRef = useRef<Set<string>>(new Set());
  const [warPanels, setWarPanels] = useState({
    frontline: true,
    roster: true,
    operations: true,
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

  // Batch leveling state
  const [batchLevelSelected, setBatchLevelSelected] = useState<Set<string>>(new Set());
  const [batchLevelMode, setBatchLevelMode] = useState<10 | 50 | 100 | 'max'>(10);

  // Rift bonus state
  const [riftBonusRound, setRiftBonusRound] = useState(0);
  const [riftSelectedBonuses, setRiftSelectedBonuses] = useState<RiftBuffChoice[]>([]);
  const [riftCurrentBonuses, setRiftCurrentBonuses] = useState<RiftBuffChoice[]>([]);
  const [riftWavePredictions, setRiftWavePredictions] = useState<number[]>([]);

  // Timer tick for expedition countdown display
  const [timerTick, setTimerTick] = useState(0);

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
            occupied: false,
          } satisfies CharacterSlotSummary;
        }

        try {
          const parsed = JSON.parse(raw) as {
            playerName?: string;
            level?: number;
            highestWaveReached?: number;
            wave?: number;
            characterCreated?: boolean;
          };
          const playerName = typeof parsed.playerName === 'string' ? parsed.playerName.trim().slice(0, 24) : '';
          const occupied = !!playerName && parsed.characterCreated === true;
          return {
            classId: cls.id,
            playerName: occupied ? playerName : null,
            level: typeof parsed.level === 'number' && Number.isFinite(parsed.level) ? Math.max(1, Math.floor(parsed.level)) : 1,
            highestWaveReached: typeof parsed.highestWaveReached === 'number' && Number.isFinite(parsed.highestWaveReached)
              ? Math.max(1, Math.floor(parsed.highestWaveReached))
              : typeof parsed.wave === 'number' && Number.isFinite(parsed.wave)
                ? Math.max(1, Math.floor(parsed.wave))
                : 1,
            occupied,
          } satisfies CharacterSlotSummary;
        } catch {
          return {
            classId: cls.id,
            playerName: null,
            level: 1,
            highestWaveReached: 1,
            occupied: false,
          } satisfies CharacterSlotSummary;
        }
      }));

      if (cancelled) return;
      setSlotSummaries(summaries);

      const occupiedClasses = summaries.filter(slot => slot.occupied).map(slot => slot.classId);
      const lastSelected = await AsyncStorage.getItem(getLastCharacterSlotKey(accountName));
      if (cancelled) return;

      if (lastSelected && occupiedClasses.includes(lastSelected as PlayerClass)) {
        setSelectedCharacterClass(lastSelected as PlayerClass);
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
      }
      : slot));
  }, [hydrated, selectedCharacterClass, state.characterCreated, state.highestWaveReached, state.level, state.playerName]);

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
  const paidSingles = state.freeSummonCharges > 0 ? 0 : 1;
  const canGachaOnce = state.freeSummonCharges > 0 || state.bossTears >= 1;
  const paidX10 = Math.max(0, 10 - state.freeSummonCharges);
  const canGachaX10 = state.freeSummonCharges >= 10 || state.bossTears >= paidX10;
  const pityRemaining = Math.max(0, 30 - state.gachaPityCounter);
  const summonTimeline = state.summonHistory.slice(0, 12);
  const hasStatsNotification = state.unspentStatPoints > 0;
  const hasGachaNotification = canGachaOnce;

  const currentQuest = state.tutorialEnabled
    ? TUTORIAL_QUESTS[state.tutorialCurrentQuestIndex] ?? null
    : null;
  const tutorialTargetTab = state.tutorialEnabled && currentQuest ? currentQuest.targetTab : null;
  const tutorialStepId = currentQuest?.id ?? null;
  const forceFreeSummonStep = tutorialStepId === 'q_use_free_summon';
  const forceBuildTeamStep = tutorialStepId === 'q_build_team';
  const forceSpendStatStep = tutorialStepId === 'q_spend_stat';
  const tutorialActionHint = useMemo(() => {
    if (!currentQuest) return null;
    if (forceFreeSummonStep) return 'Tap the highlighted Summon Hero button.';
    if (forceBuildTeamStep) return 'Tap Edit, pick a hero, then Confirm Team.';
    if (forceSpendStatStep) return 'Tap a highlighted +1 button to spend exactly one stat point.';
    return 'Only the highlighted tab is enabled for this step.';
  }, [currentQuest, forceFreeSummonStep, forceBuildTeamStep, forceSpendStatStep]);
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

  const tutorialProgressLabel = `${Math.min(state.tutorialCurrentQuestIndex, TUTORIAL_QUESTS.length)}/${TUTORIAL_QUESTS.length}`;
  const rewardPopup = state.rewardQueue[0] ?? null;
  const isOfflineRewardPopup = !!rewardPopup && `${rewardPopup.title} ${rewardPopup.detail}`.toLowerCase().includes('offline progress');
  const classCutinTone = useMemo(() => {
    const byClass: Record<PlayerClass, { stripe: string; glow: string; callout: string }> = {
      warrior: { stripe: '#6E7FA8', glow: '#9AB3E6', callout: 'Aegis Impact' },
      berserker: { stripe: '#A0472A', glow: '#E77A50', callout: 'Rage Breaker' },
      archer: { stripe: '#3C8C63', glow: '#7FD7A6', callout: 'Skyline Volley' },
      mage: { stripe: '#5B4AA6', glow: '#A993F0', callout: 'Astral Collapse' },
      monk: { stripe: '#B19135', glow: '#EACE77', callout: 'Zen Tempest' },
    };
    return byClass[state.playerClass ?? 'warrior'];
  }, [state.playerClass]);
  const canRebirthNow = state.wave >= REBIRTH_WAVE_THRESHOLD;
  const teamSlotCap = Math.max(4, Math.min(ACTIVE_TEAM_SIZE, state.teamSlotsUnlocked ?? 4));
  const nextTeamSlotUnlock = getNextTeamSlotUnlock();
  const currentDay = Math.floor(Date.now() / 86_400_000);
  const canPlayDiceToday = state.lastDiceRollDay !== currentDay;
  const canRunRiftToday = state.lastRiftRunDay !== currentDay;
  const rebirthProgressPct = Math.max(0, Math.min(1, state.wave / REBIRTH_WAVE_THRESHOLD)) * 100;
  const rebirthWavesLeft = Math.max(0, REBIRTH_WAVE_THRESHOLD - state.wave);
  const guidanceList = useMemo(() => {
    const recs: Array<{ title: string; detail: string; tab: Tab }> = [];
    if (canRebirthNow) {
      recs.push({ title: 'Rebirth Ready', detail: 'Reset now for permanent cores and stronger scaling.', tab: 'battle' });
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
  const equippedItemsForScore = useMemo(
    () => Object.values(state.equippedItems).map(id => (id ? getEquipmentItem(id) : null)).filter(Boolean),
    [state.equippedItems],
  );
  const gearScore = useMemo(() => {
    return equippedItemsForScore.reduce((sum, item) => {
      if (!item) return sum;
      const statValue = Object.values(item.bonus).reduce((s, v) => s + (v ?? 0), 0);
      return sum + (GEAR_RARITY_POINTS[item.rarity] ?? 0) + statValue * 12;
    }, 0);
  }, [equippedItemsForScore]);
  const gearScoreRows = useMemo(() => {
    return equippedItemsForScore.map(item => {
      if (!item) return null;
      const rarityPoints = GEAR_RARITY_POINTS[item.rarity] ?? 0;
      const statValue = Object.values(item.bonus).reduce((s, v) => s + (v ?? 0), 0);
      const statPoints = statValue * 12;
      return {
        name: item.name ?? item.id,
        rarityPoints,
        statPoints,
        total: rarityPoints + statPoints,
      };
    }).filter((row): row is { name: string; rarityPoints: number; statPoints: number; total: number } => !!row);
  }, [equippedItemsForScore]);
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
  const tabSignals: Record<Tab, string> = {
    warroom: canRebirthNow ? 'READY' : 'LIVE',
    battle: `W${state.wave}`,
    heroes: `${state.heroRoster.length}`,
    stats: state.unspentStatPoints > 0 ? `+${state.unspentStatPoints}` : 'OK',
    equipment: `${state.inventoryItemIds.length}`,
    achievements: `${state.achievements.size}/${ACHIEVEMENTS.length}`,
    guildhall: `${state.expeditionQueue.length}`,
  };
  const isNativeApp = Platform.OS !== 'web';
  const isCompactPhone = viewportWidth < 430;
  const isShortPhone = viewportHeight < 780;
  const compactCommandTabWidth = viewportWidth < 390 ? 106 : viewportWidth < 520 ? 118 : 126;
  const useCompactCommandTabs = isCompactPhone || viewportWidth <= 560;
  const compactSubTabMinWidth = viewportWidth < 390 ? 92 : 108;
  const claimableWeeklyMilestones = WEEKLY_TRACK_MILESTONES.filter(ms => state.weeklyKills >= ms && !state.weeklyTrackClaimed.includes(ms));
  const claimableMissionIds = missionCards.filter(m => !m.claimed && m.progress.done).map(m => m.mission.id);
  const hasClaimableRewards = claimableWeeklyMilestones.length > 0 || claimableMissionIds.length > 0;
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
  const expPct = Math.floor((state.exp / Math.max(1, stats.expNeeded)) * 100);
  const topStatChips = [
    { id: 'gold', label: 'Gold 💰', value: fmt(state.gold) },
    { id: 'diamonds', label: 'Diamonds 💎', value: `${state.diamonds}` },
    { id: 'tears', label: 'Tears 💧', value: `${state.bossTears}` },
    { id: 'shards', label: 'Shards ✨', value: fmt(state.heroShards) },
    { id: 'essence', label: 'Essence ⚡', value: fmt(state.essence) },
    { id: 'dps', label: 'DPS', value: fmt(stats.dps) },
    { id: 'power', label: 'Power', value: fmt(teamPowerIndex) },
    { id: 'gear', label: 'Gear', value: fmt(gearScore) },
    { id: 'exp', label: 'EXP', value: `${expPct}%` },
    { id: 'streak', label: 'Streak', value: `${state.dailyLoginStreak}` },
    { id: 'peakwave', label: 'Peak Wave', value: `${state.highestWaveReached}` },
  ];
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
  const isTopChipWithTooltip = (id: string): id is 'dps' | 'power' | 'gear' => id === 'dps' || id === 'power' || id === 'gear';
  const updateTopChipAnchor = (id: 'dps' | 'power' | 'gear') => {
    const ref = topChipRefs.current[id];
    if (!ref || typeof ref.measureInWindow !== 'function') return;
    ref.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setTopChipTooltipAnchor({ x, y, width, height });
      }
    });
  };
  const showTopChipTooltip = (id: 'dps' | 'power' | 'gear') => {
    setHoveredTopChipId(id);
    requestAnimationFrame(() => updateTopChipAnchor(id));
  };
  const hideTopChipTooltip = (id: 'dps' | 'power' | 'gear') => {
    setHoveredTopChipId(current => (current === id ? null : current));
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
    const latest = state.summonHistory[0];
    if (!latest) return;
    if (lastSummonIdRef.current === latest.id) return;
    lastSummonIdRef.current = latest.id;
    setSummonReveal({ id: latest.id, heroName: latest.heroName, emoji: latest.heroEmoji, rarity: latest.rarity });
    const timer = setTimeout(() => setSummonReveal(null), 2000);
    return () => clearTimeout(timer);
  }, [state.summonHistory]);

  useEffect(() => {
    if (!rewardPopup && !idleChestOpen) {
      setIdleChestReady(false);
      setIdleChestReward(null);
    }
  }, [rewardPopup, idleChestOpen]);

  useEffect(() => {
    if (!state.tutorialEnabled || !currentQuest) return;
    if (forceFreeSummonStep && heroesSubTab !== 'summon') setHeroesSubTab('summon');
    if (forceBuildTeamStep && heroesSubTab !== 'roster') setHeroesSubTab('roster');
  }, [state.tutorialEnabled, currentQuest, forceFreeSummonStep, forceBuildTeamStep, heroesSubTab]);

  const onTabChange = (nextTab: Tab) => {
    if (tutorialTargetTab && nextTab !== tutorialTargetTab) return;
    setTab(nextTab);
    const eventMap: Record<Tab, TutorialEvent | null> = {
      warroom: null,
      battle: 'open_battle_tab',
      heroes: 'open_heroes_tab',
      stats: 'open_stats_tab',
      equipment: null,
      achievements: 'open_achievements_tab',
      guildhall: null,
    };
    const event = eventMap[nextTab];
    if (event) notifyQuestEvent(event);
  };

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

  const openRiftChallenge = () => {
    setRiftDungeonResult(null);
    setRiftIsSimulating(false);
    setRiftSelectedBonuses([]);
    setRiftWavePredictions([]);
    setRiftBonusRound(1);
    setRiftCurrentBonuses(buildRiftChoices(1));
    setRiftDungeonModalOpen(true);
  };

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

  const canCraftWeapon = state.equipmentScrap >= 130;

  const hasWarRoomNotification = canRebirthNow || (nextTeamSlotUnlock?.canUnlock ?? false);
  const hasEquipmentNotification = Object.values(state.equippedItems).filter(Boolean).length < 3;
  const hasAchievementsNotification = hasClaimableRewards;

  const optimizeEquipment = () => {
    const slots: EquipmentSlot[] = ['weapon', 'armor', 'accessory'];
    const rarityOrder: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
    slots.forEach(slot => {
      const slotItems = state.inventoryItemIds
        .map(id => getEquipmentItem(id))
        .filter((item): item is NonNullable<ReturnType<typeof getEquipmentItem>> => !!item && item.slot === slot);
      if (slotItems.length === 0) return;
      const best = [...slotItems].sort((a, b) => {
        const rd = (rarityOrder[b.rarity] ?? 0) - (rarityOrder[a.rarity] ?? 0);
        if (rd !== 0) return rd;
        const aVal = Object.values(a.bonus).reduce((s, v) => s + (v ?? 0), 0);
        const bVal = Object.values(b.bonus).reduce((s, v) => s + (v ?? 0), 0);
        return bVal - aVal;
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
    pulse?: boolean;
  }>) => {
    const buttons = items.map(item => (
      <Pressable
        key={item.id}
        style={[
          styles.subTabBtn,
          item.active && styles.subTabBtnActive,
          item.disabled && styles.subTabBtnLocked,
          item.pulse && styles.tutorialPulse,
          isCompactPhone && styles.subTabBtnCompact,
          isCompactPhone && { minWidth: compactSubTabMinWidth },
        ]}
        onPress={item.onPress}
        disabled={item.disabled}
      >
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
      guildhall: state.expeditionQueue.length > 0 ? 1 : 0,
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
    const watchingExpeditionsTab = tab === 'guildhall' && guildhallSubTab === 'expeditions';
    if (state.expeditionQueue.length === 0 && !watchingExpeditionsTab) return;
    const timer = setInterval(() => {
      setTimerTick(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [state.expeditionQueue, tab, guildhallSubTab]);


  const isBossImminent = state.wave % 10 >= 8;
  const burstCost = 20;
  const burstChargePct = Math.min(100, (state.burstCharge / burstCost) * 100);
  const maxHeat = getMaxHeatForLevel(state.level);
  const heatPct = Math.min(100, Math.max(0, (state.combatHeat / maxHeat) * 100));
  const canBurst = state.burstCharge >= burstCost;
  const battleSpeed = state.combatTempo;
  const prestige1Done = (state.prestigeCount ?? 0) >= 1;
  const prestige5Done = (state.prestigeCount ?? 0) >= 5;
  const prestige10Done = (state.prestigeCount ?? 0) >= 10;
  const prestige25Done = (state.prestigeCount ?? 0) >= 25;
  const prestige50Done = (state.prestigeCount ?? 0) >= 50;

  function openCharacterSlot(playerClass: PlayerClass) {
    setDraftName('');
    setSelectedCharacterClass(playerClass);
  }

  function returnToCharacterSelect() {
    setSettingsOpen(false);
    setDraftName('');
    setSelectedCharacterClass(null);
  }

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
              return (
                <Pressable
                  key={slot.classId}
                  style={[styles.characterSlotCard, slot.occupied && styles.characterSlotCardFilled]}
                  onPress={() => openCharacterSlot(slot.classId)}
                >
                  <View style={styles.characterSlotHeader}>
                    <Text style={styles.characterSlotTitle}>{cls.emoji} {cls.name}</Text>
                    <Text style={[styles.characterSlotBadge, slot.occupied ? styles.characterSlotBadgeFilled : styles.characterSlotBadgeEmpty]}>
                      {slot.occupied ? 'EXISTING' : 'EMPTY'}
                    </Text>
                  </View>
                  <Text style={styles.characterSlotFantasy}>{cls.fantasy}</Text>
                  <Text style={styles.characterSlotBody}>
                    {slot.occupied
                      ? `${slot.playerName} • Lv ${slot.level} • Peak Wave ${slot.highestWaveReached}`
                      : `Create a ${cls.name.toLowerCase()} in this slot.`}
                  </Text>
                </Pressable>
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
            onPress={() => createCharacter(draftName, draftClass)}
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
            <Text style={styles.summonRevealEmoji}>{summonReveal.emoji}</Text>
            <Text style={styles.summonRevealName}>{summonReveal.heroName}</Text>
            <Text style={styles.summonRevealSub}>Joined your squad</Text>
          </View>
        </View>
      )}


      {/* Header */}
      <GameHeader
        playerName={state.playerName}
        playerClass={`${stats.className} • Lv ${state.level}`}
        gold={state.gold}
        diamonds={state.diamonds}
        bossTearsOrdered={state.bossTears}
        essenceShards={state.essence}
        dps={Math.max(1, Math.floor(stats.dps))}
        power={teamPowerIndex}
        onActionPress={(action) => {
          if (action === 'settings') setSettingsOpen(true);
          else if (action === 'shop') setShopOpen(true);
          else if (action === 'events') setEventsOpen(true);
          else if (action === 'stats') {
            onTabChange('stats');
            setAchievementsSubTab('overview');
          }
        }}
      />

      <View style={styles.headerQuickActionsRow}>
        <Pressable style={styles.headerQuickActionBtn} onPress={() => setEventsOpen(true)}>
          <Text style={styles.headerQuickActionText}>🗓️ Events</Text>
        </Pressable>
        <Pressable style={styles.headerQuickActionBtn} onPress={() => setShopOpen(true)}>
          <Text style={styles.headerQuickActionText}>🛒 Shop</Text>
        </Pressable>
        <Pressable style={[styles.headerQuickActionBtn, styles.headerQuickActionBtnLogout]} onPress={onLogout}>
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

      {currentQuest && (
        <View style={styles.questBanner}>
          <View style={styles.questBannerHeader}>
            <Text style={styles.questBannerTitle}>📜 Tutorial Quest</Text>
            <Text style={styles.questProgress}>{tutorialProgressLabel}</Text>
          </View>
          <Text style={styles.questName}>{currentQuest.title}</Text>
          <Text style={styles.questDesc}>{currentQuest.description}</Text>
          <Text style={styles.questHint}>Go to: {currentQuest.targetTab.toUpperCase()} tab</Text>
          {tutorialActionHint && <Text style={styles.questForceHint}>👉 {tutorialActionHint}</Text>}
        </View>
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
          <Text style={styles.metaChipLabel}>Highest Wave</Text>
          <Text style={styles.metaChipValue}>Wave {state.highestWaveReached}</Text>
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
            <Text style={styles.waveLabel}>Wave {state.wave} {isBoss ? '👑' : ''}</Text>
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
                <View key={affix.id} style={[styles.affixChip, { borderColor: affix.color }]}>
                  <Text style={[styles.affixChipText, { color: affix.color }]}>{affix.name}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.teamSynergyInline}>
              TTK {ttkSeconds >= 99 ? '99s+' : `${ttkSeconds.toFixed(1)}s`} • Danger {dangerLabel} ({dangerScore.toFixed(0)}%)
            </Text>
            <Text style={styles.teamSynergyInline}>
              Rewards: 💰 {fmt(getMonsterGold(state.wave))} • ✨ {fmt(getMonsterExp(state.wave))} {isBoss ? '• 👹 Boss bonus' : ''}
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
            rebirthWavesLeft,
            currentAct,
            actProgressPct,
            nextBossUnlock,
            unlockLabel,
            dangerLabel,
            dangerScore,
            teamSlotCap,
            canPlayDiceToday,
            canRunRiftToday,
            nextTeamSlotUnlock,
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
            setDiceRollResult,
            setDiceIsRolling,
            setDiceRollModalOpen,
            openRiftChallenge,
            unlockTeamSlot,
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
            forceFreeSummonStep,
            forceBuildTeamStep,
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
            getClassConfig,
            getHeroPassiveTraitInfo,
            getHeroActiveArchetypeInfo,
            calculateShardReward,
            getRankUpShardCost,
            getHeroGoldLevelCost,
            summonHero,
            summonHeroX10,
            autoEquipBestHeroes,
            autoRecycleHeroes,
            saveTeamLoadout,
            loadTeamLoadout,
            toggleEquipHero,
            rankUpHero,
            levelUpHeroGold,
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
            forceSpendStatStep,
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
            getEquipmentItem,
            getUpgradePlan,
            equipmentRarityConfig,
            optimizeEquipment,
            autoDismantleEquipment,
            craftEquipment,
            equipItem,
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
            claimAllRewards,
            renderSubTabBar,
          } as any)}
        />

        <GuildhallTabContent
          {...({
            tab,
            state,
            stats,
            guildhallSubTab,
            setGuildhallSubTab,
            batchLevelMode,
            setBatchLevelMode,
            batchLevelSelected,
            setBatchLevelSelected,
            getHeroGoldLevelCost,
            batchLevelHeroes,
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
        onRequestClose={() => setChapterMapOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.chapterMapModalBox}>
            <View style={styles.settingsHeaderRow}>
              <Text style={styles.modalTitle}>🧭 Campaign Route</Text>
              <Pressable style={styles.settingsCloseBtn} onPress={() => setChapterMapOpen(false)}>
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
        onRequestClose={() => setShopOpen(false)}
      >
        <View style={styles.bottomSheetOverlay}>
          <View style={[styles.eventsModalBox, styles.bottomSheetBox]}>
            <View style={styles.eventsHeaderRow}>
              <Text style={styles.eventsModalTitle}>🛒 Shop</Text>
              <Pressable style={styles.settingsCloseBtn} onPress={() => setShopOpen(false)}>
                <Text style={styles.settingsCloseBtnText}>Close</Text>
              </Pressable>
            </View>

            {renderSubTabBar([
              { id: 'diamond', label: 'Diamond Shop', active: shopTab === 'diamond', onPress: () => setShopTab('diamond') },
              { id: 'gold', label: 'Gold Shop', active: shopTab === 'gold', onPress: () => setShopTab('gold') },
              { id: 'dollar', label: 'Dollar Shop', active: shopTab === 'dollar', onPress: () => setShopTab('dollar') },
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
                        onPress={() => claimVipReward(row.level)}
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
                          onPress={() => buyDiamondShopItem(offer.id)}
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
                          onPress={() => buyGoldShopItem(offer.id)}
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
                          onPress={() => simulateDollarPurchase(offer.id)}
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
        onRequestClose={() => setEventsOpen(false)}
      >
        <View style={styles.bottomSheetOverlay}>
          <View style={[styles.eventsModalBox, styles.bottomSheetBox]}>
            <View style={styles.eventsHeaderRow}>
              <Text style={styles.eventsModalTitle}>🗓️ Events & Seasons</Text>
              <Pressable style={styles.settingsCloseBtn} onPress={() => setEventsOpen(false)}>
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
                <Pressable style={styles.eventsActionBtn} onPress={() => { setEventsOpen(false); onTabChange('achievements'); setAchievementsSubTab('weekly'); }}>
                  <Text style={styles.eventsActionBtnText}>View Weekly Track</Text>
                </Pressable>
              </View>

              {/* Seasonal Ladder */}
              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>🏆 Season Ladder</Text>
                <Text style={styles.eventsSubtitle}>Season score: {fmt(seasonScore)} pts</Text>
                <Text style={styles.eventsStatLine}>Best this season: {fmt(state.bestSeasonPoints)} pts</Text>
                <Text style={styles.eventsStatLine}>Highest wave reached: Wave {state.highestWaveReached}</Text>
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
            onRequestClose={() => setRecycleConfirmUid(null)}
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
                    onPress={() => setRecycleConfirmUid(null)}
                  >
                    <Text style={styles.modalBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalBtn, styles.modalBtnConfirm]}
                    onPress={() => {
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
        onRequestClose={() => setSmartCoolantConfirmOpen(false)}
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
                onPress={() => setSmartCoolantConfirmOpen(false)}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={() => {
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
        onRequestClose={() => setSettingsOpen(false)}
      >
        <View style={styles.bottomSheetOverlay}>
          <View style={[styles.settingsModalBox, styles.bottomSheetBox]}>
            <View style={styles.settingsHeaderRow}>
              <Text style={styles.modalTitle}>⚙️ Settings & Automation</Text>
              <Pressable style={styles.settingsCloseBtn} onPress={() => setSettingsOpen(false)}>
                <Text style={styles.settingsCloseBtnText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.settingsScroll}>
              <View style={styles.settingsCard}>
                <Text style={styles.settingsCardTitle}>Character Slots</Text>
                <Text style={styles.settingsLabel}>Switch between your class-bound character slots or create a new one if an empty slot remains.</Text>
                <Pressable
                  style={styles.settingsCycleBtn}
                  onPress={returnToCharacterSelect}
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
                    void trackEvent('feedback_link_opened', { source: 'settings' });
                    void Linking.openURL(FEEDBACK_FORM_URL);
                  }}
                >
                  <Text style={styles.settingsCycleBtnText}>{HAS_BETA_FEEDBACK_FORM ? 'Open Feedback Form' : 'Feedback Form Soon'}</Text>
                </Pressable>
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsCardTitle}>Auto Potion</Text>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Enabled</Text>
                  <Pressable
                    style={[styles.settingsToggleBtn, state.autoUsePotionEnabled && styles.settingsToggleBtnActive]}
                    onPress={() => setAutoUsePotion(!state.autoUsePotionEnabled)}
                  >
                    <Text style={styles.settingsToggleText}>{state.autoUsePotionEnabled ? 'ON' : 'OFF'}</Text>
                  </Pressable>
                </View>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Trigger HP</Text>
                  <View style={styles.settingsAdjustWrap}>
                    <Pressable style={styles.autoPotionAdjustBtn} onPress={() => setAutoUsePotionThreshold(state.autoUsePotionThresholdPct - 0.05)}>
                      <Text style={styles.autoPotionAdjustText}>-</Text>
                    </Pressable>
                    <Text style={styles.settingsValueText}>{(state.autoUsePotionThresholdPct * 100).toFixed(0)}%</Text>
                    <Pressable style={styles.autoPotionAdjustBtn} onPress={() => setAutoUsePotionThreshold(state.autoUsePotionThresholdPct + 0.05)}>
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
                          setAutoUseCoolant(false);
                          return;
                        }
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
                    onPress={() => setAutoRecycleEnabled(!state.autoRecycleEnabled)}
                  >
                    <Text style={styles.settingsToggleText}>{state.autoRecycleEnabled ? 'ON' : 'OFF'}</Text>
                  </Pressable>
                </View>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Max Rarity</Text>
                  <Pressable style={styles.settingsCycleBtn} onPress={cycleAutoRecycleRarity}>
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
                    onPress={() => setAutoSummonEnabled(!state.autoSummonEnabled)}
                  >
                    <Text style={styles.settingsToggleText}>{state.autoSummonEnabled ? 'ON' : 'OFF'}</Text>
                  </Pressable>
                </View>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Mode</Text>
                  <Pressable style={styles.settingsCycleBtn} onPress={() => setAutoSummonMode(state.autoSummonMode === 'single' ? 'x10' : 'single')}>
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
                  <Pressable style={styles.settingsCycleBtn} onPress={() => setAutoTempoTarget(state.autoTempoTarget === 2 ? 4 : 2)}>
                    <Text style={styles.settingsCycleBtnText}>{state.autoTempoTarget}x</Text>
                  </Pressable>
                </View>
                <Text style={styles.settingsHintText}>At heat 0, auto tempo re-engages from 1x to your selected target.</Text>
              </View>
            </ScrollView>
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
                      <Text style={styles.rewardValue}>✨ +{diceRollResult.shards}</Text>
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
                    <Text style={styles.rewardValue}>✨ +{riftDungeonResult.shards}</Text>
                  </View>
                  {riftDungeonResult.essence > 0 && (
                    <View style={styles.rewardItem}>
                      <Text style={styles.rewardLabel}>Essence</Text>
                      <Text style={styles.rewardValue}>⚡ +{riftDungeonResult.essence}</Text>
                    </View>
                  )}
                </View>
                <Pressable
                  style={styles.modalCloseBtn}
                  onPress={() => {
                    runRiftDungeon(riftDungeonResult);
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

      {/* Rebirth Modal */}
      <RebirthModal
        visible={rebirthOpen}
        wave={state.wave}
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

export const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#060B12',
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
  },
  sceneDecor: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  sceneOrbA: {
    position: 'absolute',
    top: -80,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#18455D',
    opacity: 0.28,
  },
  sceneOrbB: {
    position: 'absolute',
    top: 90,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#7A3F1F',
    opacity: 0.22,
  },
  sceneGrid: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: 1,
    borderTopColor: '#1A2A34',
    opacity: 0.2,
  },
  summonRevealOverlay: {
    position: 'absolute',
    top: 88,
    left: 14,
    right: 14,
    zIndex: 5,
    alignItems: 'center',
  },
  summonRevealCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: '#101828',
    alignItems: 'center',
    paddingVertical: 10,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 10,
  },
  summonRevealLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#DCE8FF',
  },
  summonRevealEmoji: {
    fontSize: 28,
    marginTop: 2,
  },
  summonRevealName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F6F8FF',
  },
  summonRevealSub: {
    fontSize: 11,
    color: '#A9C0E8',
    marginTop: 2,
  },

  // Character Creation
  createWrap: {
    padding: 20,
    paddingTop: 40,
  },
  createTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 8,
  },
  createSubtitle: {
    fontSize: 14,
    color: '#AAA',
    marginBottom: 24,
    lineHeight: 20,
  },
  createHint: {
    fontSize: 11,
    color: '#8F95B2',
    lineHeight: 16,
    marginBottom: 8,
  },
  characterLoadingWrap: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  characterSlotList: {
    gap: 10,
  },
  characterSlotCard: {
    borderWidth: 1,
    borderColor: '#374358',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#121927',
    gap: 4,
  },
  characterSlotCardFilled: {
    borderColor: '#6DDB7B',
    backgroundColor: '#17231C',
  },
  characterSlotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  characterSlotTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  characterSlotBadge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  characterSlotBadgeFilled: {
    color: '#041108',
    backgroundColor: '#6DDB7B',
  },
  characterSlotBadgeEmpty: {
    color: '#D2D8E8',
    backgroundColor: '#2B3447',
  },
  characterSlotFantasy: {
    fontSize: 12,
    color: '#8FA1C0',
  },
  characterSlotBody: {
    fontSize: 13,
    color: '#D4DCF2',
    lineHeight: 18,
  },
  characterBackBtn: {
    alignSelf: 'flex-start',
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#364560',
    backgroundColor: '#111827',
  },
  characterBackBtnText: {
    color: '#D9E4FF',
    fontSize: 12,
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#AAA',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#4A4A7A',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#15151F',
    color: '#FFF',
    fontSize: 16,
    marginBottom: 8,
  },
  classList: {
    gap: 8,
  },
  classCard: {
    borderWidth: 1,
    borderColor: '#4A4A7A',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#15151F',
    marginBottom: 8,
  },
  classCardSelected: {
    borderColor: '#6DDB7B',
    backgroundColor: '#1a2a20',
  },
  className: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  classFantasy: {
    fontSize: 12,
    color: '#AAA',
    marginBottom: 2,
  },
  classStyle: {
    fontSize: 11,
    color: '#777',
    fontStyle: 'italic',
  },
  startBtn: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#6DDB7B',
    borderRadius: 8,
    alignItems: 'center',
  },
  startBtnDisabled: {
    opacity: 0.5,
  },
  startBtnSecondary: {
    backgroundColor: '#2A3344',
  },
  startBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  startBtnTextLight: {
    color: '#F4F7FF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Header
  headerCompact: {
    backgroundColor: '#0F1722',
    borderBottomWidth: 1,
    borderBottomColor: '#2F4358',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 7,
    zIndex: 1,
    gap: 6,
    position: 'relative',
    overflow: 'visible',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  identityCluster: {
    flex: 1,
    minWidth: 0,
  },
  headerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionBtn: {
    width: 28,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#1D2D41',
    borderWidth: 1,
    borderColor: '#345270',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionBtnLogout: {
    backgroundColor: '#2C2338',
    borderColor: '#614C84',
  },
  headerActionBtnText: {
    fontSize: 12,
    color: '#E6F1FF',
    fontWeight: '700',
  },
  statChipRail: {
    gap: 6,
    paddingRight: 8,
  },
  statChip: {
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#2F4760',
    backgroundColor: '#122131',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  statChipActive: {
    borderColor: '#78B4E6',
    backgroundColor: '#17314A',
  },
  statChipHighlight: {
    borderColor: '#83602A',
    backgroundColor: '#2C2412',
  },
  statChipLabel: {
    fontSize: 9,
    color: '#8DB4D2',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  statChipValue: {
    fontSize: 11,
    color: '#E3F4FF',
    fontWeight: '700',
  },
  statChipValueWarn: {
    color: '#FBD484',
  },
  statChipTooltipModalRoot: {
    flex: 1,
    position: 'relative',
    zIndex: 9999,
    elevation: 999,
  },
  statChipTooltipBubbleModal: {
    position: 'absolute',
    zIndex: 10000,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4C6A89',
    backgroundColor: '#0B1522',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.34,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 18,
  },
  statChipTooltipArrowModal: {
    position: 'absolute',
    top: -7,
    width: 12,
    height: 12,
    backgroundColor: '#0B1522',
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: '#4C6A89',
    transform: [{ rotate: '45deg' }],
  },
  statChipTooltipTitle: {
    color: '#F2F9FF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  statChipTooltipLineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  statChipTooltipBullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#74B4E8',
    marginTop: 5,
  },
  statChipTooltipLine: {
    flex: 1,
    color: '#C4DDF0',
    fontSize: 10,
    lineHeight: 15,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F1722',
    borderBottomWidth: 1,
    borderBottomColor: '#2F4358',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    zIndex: 1,
  },
  gold: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFD700',
    marginBottom: 2,
  },
  shardLabel: {
    fontSize: 11,
    color: '#7ad1ff',
    marginBottom: 2,
  },
  essenceLabel: {
    fontSize: 11,
    color: '#FF9F7A',
    marginBottom: 2,
  },
  dpsLabel: {
    fontSize: 11,
    color: '#9bb9d1',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  playerLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  buffText: {
    marginTop: 6,
    fontSize: 10,
    color: '#8BD39E',
    fontWeight: '700',
  },
  dangerLow: {
    color: '#8BDB9D',
  },
  dangerHigh: {
    color: '#FFB347',
  },
  dangerCritical: {
    color: '#FF6B86',
  },
  combatLogLine: {
    fontSize: 10,
    color: '#B3C2DA',
    marginBottom: 4,
    lineHeight: 14,
  },
  classLabel: {
    fontSize: 11,
    color: '#9BB3C6',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  accountLabel: {
    fontSize: 10,
    color: '#6DDB7B',
    marginBottom: 2,
  },
  headerStat: {
    fontSize: 11,
    color: '#A5BED1',
    marginBottom: 2,
  },
  headerHighlight: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFB347',
  },
  logoutBtn: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#2A2A4A',
  },
  logoutBtnText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '600',
  },
  settingsBtn: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#2E4363',
  },
  settingsBtnText: {
    fontSize: 10,
    color: '#E8F2FF',
    fontWeight: '700',
  },
  headerQuickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
  },
  headerQuickActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A4055',
    backgroundColor: '#0E1622',
    paddingVertical: 7,
  },
  headerQuickActionBtnLogout: {
    backgroundColor: '#201A2A',
    borderColor: '#4B3E61',
  },
  headerQuickActionText: {
    fontSize: 10,
    color: '#E6F1FF',
    fontWeight: '700',
  },

  questBanner: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#6DDB7B',
    backgroundColor: '#131D1A',
  },
  questBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  questBannerTitle: {
    fontSize: 11,
    color: '#6DDB7B',
    fontWeight: '700',
  },
  questProgress: {
    fontSize: 10,
    color: '#AAC9B0',
  },
  questName: {
    fontSize: 13,
    color: '#FFF',
    fontWeight: '700',
    marginBottom: 2,
  },
  questDesc: {
    fontSize: 11,
    color: '#B7C8BC',
    lineHeight: 16,
  },
  questHint: {
    fontSize: 10,
    color: '#6DDB7B',
    marginTop: 4,
  },
  questForceHint: {
    fontSize: 10,
    color: '#FFE4A8',
    marginTop: 4,
    fontWeight: '700',
  },
  hintBanner: {
    marginHorizontal: 12,
    marginBottom: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#1C1A2C',
    borderLeftWidth: 3,
    borderLeftColor: '#8DA7FF',
  },
  hintBannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  hintBannerTitle: {
    fontSize: 11,
    color: '#D8E0FF',
    fontWeight: '700',
  },
  hintBannerText: {
    fontSize: 10,
    color: '#A9B8DD',
    lineHeight: 15,
  },
  hintDismissBtn: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#32365A',
  },
  hintDismissBtnText: {
    fontSize: 10,
    color: '#EAF0FF',
    fontWeight: '700',
  },
  nextStepBannerCompact: {
    marginHorizontal: 12,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nextStepChipCompact: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#1A3B2E',
    borderWidth: 1,
    borderColor: '#4BA070',
  },
  nextStepChipText: {
    fontSize: 10,
    color: '#CFFFE4',
    fontWeight: '700',
    flex: 1,
  },
  nextStepChipArrow: {
    fontSize: 11,
    color: '#7BD9A8',
    fontWeight: '700',
    marginLeft: 4,
  },
  nextStepCompactMore: {
    fontSize: 9,
    color: '#8FA8A0',
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#14201D',
  },
  metaStripScroll: {
    flexGrow: 0,
    marginBottom: 8,
  },
  metaStripRail: {
    marginHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingRight: 10,
  },
  metaChip: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#345470',
    backgroundColor: '#122131',
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  metaChipLabel: {
    fontSize: 9,
    color: '#8DB4D2',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  metaChipValue: {
    fontSize: 10,
    color: '#E3F4FF',
    fontWeight: '700',
  },
  metaChipAction: {
    borderColor: '#5D7EA0',
    backgroundColor: '#1A3048',
  },
  rebirthBanner: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#5E3B56',
    backgroundColor: '#231926',
  },
  rebirthBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  rebirthBannerTitle: {
    fontSize: 11,
    color: '#FFD2E2',
    fontWeight: '700',
  },
  rebirthBannerInfo: {
    fontSize: 10,
    color: '#D5B2C2',
    marginBottom: 6,
  },
  rebirthBannerBtn: {
    borderRadius: 4,
    backgroundColor: '#6A2E4A',
    borderWidth: 1,
    borderColor: '#C17295',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  rebirthBannerBtnDisabled: {
    opacity: 0.5,
  },
  rebirthBannerBtnText: {
    fontSize: 10,
    color: '#FFE7F1',
    fontWeight: '700',
  },
  uiModeCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#36506A',
    backgroundColor: '#111F2E',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  uiModeTitle: {
    fontSize: 11,
    color: '#D8EEFF',
    fontWeight: '700',
  },
  uiModeDesc: {
    fontSize: 10,
    color: '#9DBDD6',
    marginTop: 2,
  },
  uiModeBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#5F9FCF',
    backgroundColor: '#23405A',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  uiModeBtnAlt: {
    borderColor: '#7CB08E',
    backgroundColor: '#2D5743',
  },
  uiModeBtnText: {
    fontSize: 10,
    color: '#E7F5FF',
    fontWeight: '700',
  },
  sectionToggle: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#35516D',
    backgroundColor: '#152536',
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  sectionToggleText: {
    fontSize: 10,
    color: '#CFE6FA',
    fontWeight: '700',
  },

  // HP Section
  hpSection: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0A0A18',
  },
  hpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hpLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    minWidth: 50,
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
  hpText: {
    fontSize: 10,
    color: '#AAA',
    minWidth: 70,
    textAlign: 'right',
  },

  // Monster Zone
  monsterZone: {
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#10101C',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A4A',
    marginBottom: 8,
    position: 'relative',
  },
  monsterHpBarBg: {
    width: '88%',
    maxWidth: 460,
    height: 18,
    backgroundColor: '#2A2A4A',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 6,
  },
  waveLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginBottom: 4,
  },
  bossImminentText: {
    fontSize: 11,
    color: '#FF8FA6',
    fontWeight: '800',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  monsterEmoji: {
    fontSize: 48,
    marginBottom: 4,
  },
  monsterName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
  },
  monsterBuffFloatWrap: {
    position: 'absolute',
    top: 10,
    right: 10,
    alignItems: 'flex-end',
    gap: 6,
  },
  monsterBuffIconChip: {
    borderWidth: 1,
    borderColor: '#3E7A5C',
    backgroundColor: 'rgba(16, 38, 30, 0.95)',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  monsterBuffIconChipDefense: {
    borderColor: '#4B6E98',
    backgroundColor: 'rgba(20, 30, 46, 0.95)',
  },
  monsterBuffIconText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D8F6E5',
  },

  // Team Info
  teamInfo: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#15151F',
    marginBottom: 8,
    borderRadius: 8,
    marginHorizontal: 12,
  },
  teamHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teamTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#4A4A7A',
    borderRadius: 4,
  },
  editBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },
  teamCollapseBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#2D3F54',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3E5772',
  },
  teamCollapseBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D8EBFF',
  },
  teamCollapsedHint: {
    fontSize: 11,
    color: '#98B9D7',
    paddingVertical: 6,
  },
  selectMsg: {
    fontSize: 11,
    color: '#AAA',
    marginBottom: 8,
  },
  heroSelector: {
    maxHeight: 250,
    marginBottom: 8,
  },
  heroSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#0A0A18',
    borderRadius: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#2A2A4A',
  },
  heroSelectCardSelected: {
    backgroundColor: '#1a2a20',
    borderColor: '#6DDB7B',
  },
  selectCheckbox: {
    width: 16,
    height: 16,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#4A4A7A',
    marginRight: 8,
  },
  selectCheckboxChecked: {
    backgroundColor: '#6DDB7B',
    borderColor: '#6DDB7B',
  },
  heroSelectInfo: {
    flex: 1,
  },
  heroSelectName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#6DDB7B',
    borderRadius: 4,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },

  activeTeamDisplay: {
    gap: 6,
  },
  noTeamMsg: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    paddingVertical: 12,
  },
  activeTeamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#0A0A18',
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#FFB347',
  },
  slotIdx: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFB347',
    marginRight: 8,
    minWidth: 20,
  },
  activeTeamCardContent: {
    flex: 1,
  },
  activeTeamHeroName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 2,
  },
  activeTeamHeroClass: {
    fontSize: 10,
    color: '#AAA',
  },
  teamSynergyInline: {
    marginTop: 6,
    fontSize: 11,
    color: '#9BC2FF',
    fontWeight: '600',
  },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0E1622',
    borderTopWidth: 1,
    borderTopColor: '#2A4055',
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginTop: 4,
    gap: 4,
    zIndex: 1,
  },
  tabBarScroll: {
    flexGrow: 0,
    marginTop: 6,
    width: '100%',
    maxWidth: '100%',
  },
  tabBarCompact: {
    paddingHorizontal: 4,
    paddingRight: 10,
    gap: 6,
  },
  tab: {
    flex: 1,
    minHeight: 72,
    paddingVertical: 7,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C3D4E',
    borderRadius: 8,
    backgroundColor: '#101B29',
  },
  tabCompact: {
    flex: 0,
    minHeight: 76,
    paddingHorizontal: 12,
  },
  tabActive: {
    borderColor: '#8FD2FF',
    backgroundColor: '#15334A',
  },
  tabLocked: {
    opacity: 0.35,
  },
  tutorialPulse: {
    borderColor: '#FFD36B',
    shadowColor: '#FFD36B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 8,
  },
  tabIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  tabIconActive: {
    transform: [{ scale: 1.05 }],
  },
  tabText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8FA7BC',
  },
  tabTextActive: {
    color: '#E6F8FF',
  },
  tabSubText: {
    fontSize: 9,
    color: '#6F8BA1',
    marginTop: 1,
  },
  tabSubTextActive: {
    color: '#BFE9FF',
  },
  tabIconWrap: {
    position: 'relative',
    minWidth: 22,
    alignItems: 'center',
  },
  tabSignalPill: {
    marginTop: 5,
    borderRadius: 10,
    backgroundColor: '#1F2F40',
    borderWidth: 1,
    borderColor: '#3E5C77',
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  tabSignalText: {
    fontSize: 9,
    color: '#CDE5F7',
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
  smallText: {
    fontSize: 11,
  },

  // Tab Content
  tabContent: {
    flex: 1,
    padding: 12,
    marginHorizontal: 10,
    marginBottom: 10,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2B4258',
    backgroundColor: '#0C131D',
  },
  tabContentCompact: {
    marginHorizontal: 4,
    padding: 8,
    marginBottom: 6,
  },
  tabContentShort: {
    marginBottom: 6,
  },
  tabContentInner: {
    paddingBottom: 80,
    flexGrow: 1,
  },
  tabContentInnerNative: {
    paddingBottom: 32,
  },
  subTabScroll: {
    flexGrow: 0,
    marginBottom: 8,
  },
  subTabBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  subTabBarCompact: {
    gap: 8,
    paddingRight: 12,
  },
  subTabBtn: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3a5471',
    backgroundColor: '#16283B',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  subTabBtnCompact: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  subTabBtnActive: {
    borderColor: '#7fd0a6',
    backgroundColor: '#214435',
  },
  subTabBtnLocked: {
    opacity: 0.35,
  },
  subTabBtnText: {
    fontSize: 10,
    color: '#b8d2e6',
    fontWeight: '700',
  },
  subTabBtnTextActive: {
    color: '#e6fff1',
  },
  sectionHelperText: {
    fontSize: 10,
    color: '#98b2c8',
    marginBottom: 8,
  },
  primaryActionBar: {
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#35516B',
    backgroundColor: '#132132',
    padding: 8,
  },
  primaryActionTitle: {
    fontSize: 10,
    color: '#B7D4EA',
    fontWeight: '700',
    marginBottom: 6,
  },
  primaryActionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  primaryActionBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#567A9A',
    backgroundColor: '#1D3248',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  primaryActionBtnAccent: {
    borderColor: '#71BF9A',
    backgroundColor: '#214A3C',
  },
  primaryActionBtnDisabled: {
    opacity: 0.45,
  },
  primaryActionBtnText: {
    fontSize: 10,
    color: '#E5F1FA',
    fontWeight: '700',
  },

  // Battle Tab
  warRoomTab: {
    gap: 10,
  },
  warRoomIntro: {
    fontSize: 11,
    color: '#9EB6C8',
    marginTop: -6,
    marginBottom: 4,
  },
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
  battleTab: {
    gap: 12,
  },
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
  battleTempoBtnText: {
    fontSize: 10,
    color: '#BFD7EC',
    fontWeight: '700',
  },
  battleTempoBtnTextActive: {
    color: '#EDFAFF',
  },
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
  warningBox: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#3a2a1a',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#FFB347',
  },
  warningText: {
    fontSize: 12,
    color: '#FFB347',
    lineHeight: 18,
  },
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
  useItemBtn: {
    backgroundColor: '#355a3b',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  useItemBtnText: {
    fontSize: 11,
    color: '#C7FFD2',
    fontWeight: '700',
  },
  autoPotionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  autoPotionToggle: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#54657A',
    backgroundColor: '#1A2230',
  },
  autoPotionToggleActive: {
    borderColor: '#6DDB7B',
    backgroundColor: '#1f3a2a',
  },
  autoPotionToggleText: {
    color: '#D5E3FF',
    fontSize: 10,
    fontWeight: '700',
  },
  autoPotionThresholdWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  autoPotionAdjustBtn: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#263348',
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoPotionAdjustText: {
    color: '#d3e0ff',
    fontSize: 12,
    fontWeight: '700',
  },
  autoPotionThresholdText: {
    color: '#AFC7F4',
    fontSize: 10,
    minWidth: 56,
    textAlign: 'center',
  },

  // Heroes Tab
  heroesTab: {
    gap: 16,
  },
  gachaSection: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#15151F',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4A4A7A',
  },
  gachaCost: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFD700',
    marginBottom: 8,
  },
  gachaFree: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6DDB7B',
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
    backgroundColor: '#6DDB7B',
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
  rarityInfo: {
    gap: 6,
  },
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
  lastSummonText: {
    fontSize: 10,
    color: '#B5C5EA',
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

  heroRosterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroRosterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  autoEquipBtn: {
    backgroundColor: '#2A2A4A',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  autoEquipBtnText: {
    color: '#FFF',
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
  recyclePickerWrap: {
    marginBottom: 8,
    backgroundColor: '#111728',
    borderWidth: 1,
    borderColor: '#2a3654',
    borderRadius: 6,
    padding: 8,
  },
  recyclePickerLabel: {
    fontSize: 10,
    color: '#99A9C9',
    marginBottom: 6,
  },
  recycleToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  recycleToggleLabel: {
    fontSize: 10,
    color: '#AFC4EA',
  },
  recycleToggleBtn: {
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#2D3550',
  },
  recycleToggleBtnActive: {
    backgroundColor: '#2d5b3e',
  },
  recycleToggleBtnText: {
    fontSize: 10,
    color: '#E8F0FF',
    fontWeight: '700',
  },
  recyclePickerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 5,
    backgroundColor: '#1B2640',
    borderWidth: 1,
    borderColor: '#3a4f82',
    alignSelf: 'flex-start',
  },
  recyclePickerBtnText: {
    color: '#DCE8FF',
    fontSize: 11,
    fontWeight: '700',
  },
  recycleDropdown: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#304062',
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#0F1524',
  },
  recycleOption: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2a43',
  },
  recycleOptionActive: {
    backgroundColor: '#1b2a20',
  },
  recycleOptionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  shardForgeCard: {
    marginBottom: 8,
    backgroundColor: '#1B2132',
    borderWidth: 1,
    borderColor: '#394971',
    borderRadius: 6,
    padding: 8,
  },
  shardForgeTitle: {
    fontSize: 11,
    color: '#DCE8FF',
    fontWeight: '700',
    marginBottom: 4,
  },
  shardForgeDesc: {
    fontSize: 10,
    color: '#A4B6D8',
    marginBottom: 6,
  },
  shardForgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  shardForgeBtn: {
    flex: 1,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#6382B4',
    backgroundColor: '#253957',
    paddingVertical: 7,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  shardForgeBtnDisabled: {
    opacity: 0.45,
  },
  shardForgeBtnText: {
    fontSize: 10,
    color: '#E3EEFF',
    fontWeight: '700',
  },
  autoSummonCard: {
    marginBottom: 8,
    backgroundColor: '#15282B',
    borderWidth: 1,
    borderColor: '#2B5960',
    borderRadius: 6,
    padding: 8,
  },
  autoSummonTopRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  autoSummonToggle: {
    flex: 1,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#426E78',
    backgroundColor: '#1D3940',
    paddingVertical: 7,
    alignItems: 'center',
  },
  autoSummonToggleActive: {
    backgroundColor: '#2c6a55',
    borderColor: '#5bb58f',
  },
  autoSummonToggleText: {
    color: '#D8FFF0',
    fontSize: 10,
    fontWeight: '700',
  },
  autoSummonModeBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#617CA3',
    backgroundColor: '#2A3956',
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoSummonModeText: {
    color: '#E4ECFF',
    fontSize: 10,
    fontWeight: '700',
  },
  autoSummonReserveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  autoSummonReserveText: {
    fontSize: 10,
    color: '#BBE9DF',
    fontWeight: '700',
  },
  loadoutRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  loadoutCell: {
    flex: 1,
    backgroundColor: '#151d30',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2c3a5b',
    padding: 6,
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
  emptyMsg: {
    fontSize: 12,
    color: '#777',
    fontStyle: 'italic',
  },
  heroCard: {
    flexDirection: 'row',
    backgroundColor: '#15151F',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A2A4A',
    marginBottom: 8,
    overflow: 'hidden',
  },
  heroCardActive: {
    borderColor: '#6DDB7B',
    backgroundColor: '#1a2a20',
  },
  heroCardRarityBar: {
    width: 4,
    borderRadius: 0,
  },
  heroCardBody: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
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
  heroPortraitFrame: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D1523',
  },
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
  heroCardRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  heroLevel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFB347',
  },
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
    color: '#FFF',
    marginTop: 1,
  },
  expandBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#2A2A4A',
    borderRadius: 4,
  },
  expandBtnText: {
    fontSize: 10,
    color: '#AAA',
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
    color: '#6DDB7B',
  },
  heroStatItemValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
    marginTop: 2,
  },
  heroEmoji: {
    fontSize: 24,
  },
  heroName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 2,
  },
  heroDetail: {
    fontSize: 10,
    color: '#AAA',
  },
  toggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#4A4A7A',
    borderRadius: 4,
  },
  toggleBtnActive: {
    backgroundColor: '#6DDB7B',
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },

  // Stats Tab
  statsTab: {
    gap: 16,
  },
  unspentLabel: {
    fontSize: 12,
    color: '#AAA',
    marginBottom: 8,
  },
  unspentCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFB347',
  },
  statsGrid: {
    gap: 8,
  },
  statRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#15151F',
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
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    marginTop: 2,
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
    color: '#FFF',
  },
  heroBoostBox: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#15151F',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#FFB347',
  },
  heroBoostLabel: {
    fontSize: 11,
    color: '#AAA',
    marginBottom: 4,
  },
  heroBoostValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFB347',
  },
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
  equipmentBox: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#15151F',
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
  equipSlotRow: {
    borderTopWidth: 1,
    borderTopColor: '#24243A',
    paddingTop: 8,
    gap: 6,
  },
  equipSlotTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6DDB7B',
  },
  equipSlotCurrent: {
    fontSize: 11,
    color: '#DDD',
  },
  equipChoices: {
    gap: 6,
  },
  equipChoiceBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3B3B5F',
    backgroundColor: '#10101C',
  },
  equipChoiceBtnActive: {
    borderColor: '#6DDB7B',
    backgroundColor: '#1a2a20',
  },
  equipChoiceText: {
    fontSize: 11,
    color: '#EEE',
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

  // Achievements Tab
  achievementsTab: {
    gap: 8,
  },
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

  // Rebirth
  rebirthInlineText: {
    fontSize: 11,
    color: '#D0C2E8',
    lineHeight: 16,
    marginBottom: 8,
  },
  rebirthInlineBtn: {
    alignSelf: 'flex-start',
    borderRadius: 5,
    backgroundColor: '#6A2E4A',
    borderWidth: 1,
    borderColor: '#C17295',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  rebirthInlineBtnDisabled: {
    opacity: 0.5,
  },
  rebirthInlineBtnText: {
    fontSize: 11,
    color: '#FFE7F1',
    fontWeight: '700',
  },
  storyToast: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#1D2232',
    borderLeftWidth: 3,
    borderLeftColor: '#7EA7FF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  storyToastActive: {
    shadowColor: '#7EA7FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 5,
  },
  storyToastIcon: {
    fontSize: 16,
  },
  storyToastContent: {
    flex: 1,
  },
  storyToastTitle: {
    color: '#E6EEFF',
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 2,
  },
  storyToastDetail: {
    color: '#B7C6E8',
    fontSize: 11,
  },
  storyToastHint: {
    color: '#D1DEFF',
    fontSize: 10,
    fontWeight: '700',
  },
  rewardToast: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#1A2A1F',
    borderLeftWidth: 3,
    borderLeftColor: '#6DDB7B',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 99,
    pointerEvents: 'box-none',
  },
  rewardToastActive: {
    shadowColor: '#6DDB7B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 5,
  },
  rewardToastSparkle: {
    fontSize: 16,
  },
  rewardToastTitle: {
    color: '#E9FFE5',
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 2,
  },
  rewardToastDetail: {
    color: '#B7D0BB',
    fontSize: 11,
  },
  idleChestPopIn: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7A6231',
    backgroundColor: '#2A2111',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#E6B75D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  idleChestEmoji: {
    fontSize: 20,
  },
  idleChestInfo: {
    flex: 1,
  },
  idleChestTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFEFC3',
  },
  idleChestDetail: {
    fontSize: 11,
    color: '#D9C68F',
  },
  idleChestOpenText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F8D985',
  },
  idleChestModalBox: {
    width: '82%',
    maxWidth: 380,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#8A6A2A',
    backgroundColor: '#1B1408',
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  idleChestModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFE6A6',
    marginBottom: 10,
  },
  idleChestModalLine: {
    fontSize: 12,
    color: '#E8D7AC',
    marginBottom: 4,
    textAlign: 'center',
  },
  idleChestClaimBtn: {
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D7B56D',
    backgroundColor: '#5A4519',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  idleChestClaimText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF1CA',
    letterSpacing: 0.5,
  },
  // Sections
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 8,
  },
  sectionDesc: {
    fontSize: 12,
    color: '#AAA',
    lineHeight: 18,
    marginBottom: 12,
  },

  // Battle Tab  
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
    color: '#6DDB7B',
    marginBottom: 8,
  },
  battleMonsterName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 4,
  },
  battleMonsterWave: {
    fontSize: 11,
    color: '#AAA',
  },
  affixRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    marginBottom: 4,
  },
  affixChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
    backgroundColor: '#101728',
  },
  affixChipActive: {
    backgroundColor: '#162236',
    shadowColor: '#8FC8FF',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  affixChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  affixTooltipCard: {
    width: '88%',
    maxWidth: 460,
    borderWidth: 1,
    borderColor: '#355270',
    backgroundColor: '#0F1A29',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  affixTooltipTitle: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 4,
  },
  affixTooltipText: {
    fontSize: 10,
    lineHeight: 14,
    color: '#C4D9EC',
  },
  affixDesc: {
    fontSize: 10,
    color: '#94a3bc',
    marginTop: 2,
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
    color: '#FFB347',
    minWidth: 25,
  },
  battleHeroInfo: {
    flex: 1,
    fontSize: 11,
    color: '#FFF',
  },
  battleHeroStats: {
    fontSize: 10,
    color: '#AAA',
  },
  battleHeroDps: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6DDB7B',
    minWidth: 55,
    textAlign: 'right',
  },
  battleStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  battleStatLabel: {
    fontSize: 11,
    color: '#AAA',
  },
  battleStatValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  battleRewardLabel: {
    fontSize: 11,
    color: '#DDD',
    marginVertical: 4,
  },
  battleBossReward: {
    fontSize: 11,
    color: '#FF5B8A',
    fontWeight: '600',
    marginTop: 4,
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
  actUnlockOwned: {
    fontSize: 10,
    color: '#9fcf9d',
    marginTop: 4,
  },

  // Equipment Tab
  equipmentTab: {
    gap: 12,
  },
  equipInventoryCount: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  scrapLabel: {
    fontSize: 12,
    color: '#B6D6FF',
    marginBottom: 8,
  },
  mythicTierLabel: {
    fontSize: 11,
    color: '#FF7EA1',
    marginBottom: 8,
  },
  craftRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  craftBtn: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#6e86a8',
    backgroundColor: '#233147',
    paddingVertical: 8,
    alignItems: 'center',
  },
  craftBtnDisabled: {
    opacity: 0.45,
  },
  craftBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EAF2FF',
  },
  craftCostText: {
    fontSize: 10,
    color: '#A8C2E9',
    marginTop: 2,
  },
  invEquipCard: {
    flexDirection: 'row',
    backgroundColor: '#15151F',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A2A4A',
    marginBottom: 8,
    overflow: 'hidden',
  },
  invEquipCardEquipped: {
    borderColor: '#6DDB7B',
    backgroundColor: '#1a2a20',
  },
  invEquipRarity: {
    width: 4,
  },
  invEquipContent: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  invEquipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  invEquipName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  invEquipRarity2: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  invEquipSlot: {
    fontSize: 10,
    color: '#AAA',
    marginBottom: 4,
    fontWeight: '600',
  },
  invEquipBonus: {
    fontSize: 11,
    color: '#6DDB7B',
    marginBottom: 4,
  },
  invEquipActive: {
    fontSize: 10,
    color: '#6DDB7B',
    fontWeight: '700',
  },
  equipActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  equipNowBtn: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 4,
    backgroundColor: '#2E5A38',
    borderWidth: 1,
    borderColor: '#6DBB83',
  },
  equipNowBtnText: {
    fontSize: 10,
    color: '#DFFFE8',
    fontWeight: '700',
  },
  upgradeGearBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#294353',
    borderWidth: 1,
    borderColor: '#5b97c0',
  },
  upgradeGearBtnDisabled: {
    opacity: 0.45,
  },
  upgradeGearBtnText: {
    color: '#d8edff',
    fontSize: 10,
    fontWeight: '700',
  },
  dismantleBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#4a2f2f',
    borderWidth: 1,
    borderColor: '#b46464',
  },
  dismantleBtnText: {
    color: '#ffd6d6',
    fontSize: 10,
    fontWeight: '700',
  },

  // Hero Card Extensions
  heroRank: {
    fontSize: 10,
    color: '#FFB347',
    marginTop: 2,
  },
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
    backgroundColor: '#FFB347',
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
  maxRankMsg: {
    fontSize: 11,
    color: '#6DDB7B',
    fontWeight: '700',
    marginBottom: 8,
  },
  recycleBtn: {
    backgroundColor: '#3A4A3A',
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#6DDB7B',
  },
  recycleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6DDB7B',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bottomSheetBox: {
    width: '100%',
    maxWidth: 900,
    maxHeight: '70%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingBottom: Platform.OS === 'ios' ? 18 : 12,
  },
  modalBox: {
    backgroundColor: '#15151F',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#2A2A4A',
    minWidth: '70%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalContent: {
    fontSize: 13,
    color: '#DDD',
    marginBottom: 8,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalWarning: {
    fontSize: 12,
    color: '#FF5B8A',
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    alignItems: 'center',
    minWidth: 100,
  },
  modalBtnCancel: {
    backgroundColor: '#2A2A4A',
  },
  modalBtnConfirm: {
    backgroundColor: '#FF5B8A',
  },
  modalBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#AAA',
  },
  modalBtnTextConfirm: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  settingsModalBox: {
    backgroundColor: '#121A26',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2E425A',
    width: '88%',
    maxHeight: '80%',
    padding: 14,
  },
  settingsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  settingsCloseBtn: {
    borderRadius: 5,
    backgroundColor: '#314A66',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  settingsCloseBtnText: {
    fontSize: 10,
    color: '#E5F2FF',
    fontWeight: '700',
  },
  settingsScroll: {
    maxHeight: 520,
  },
  settingsCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#304761',
    backgroundColor: '#162336',
    padding: 10,
    marginBottom: 8,
    gap: 8,
  },
  settingsCardTitle: {
    fontSize: 12,
    color: '#D8EDFF',
    fontWeight: '700',
  },
  settingsRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  settingsLabel: {
    fontSize: 11,
    color: '#A9C4DB',
  },
  settingsToggleBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#567795',
    backgroundColor: '#243C57',
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  settingsToggleBtnActive: {
    borderColor: '#6FC59B',
    backgroundColor: '#27503F',
  },
  settingsToggleText: {
    fontSize: 10,
    color: '#E3F4FF',
    fontWeight: '700',
  },
  settingsCycleBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#6A84A4',
    backgroundColor: '#273B55',
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  settingsCycleBtnText: {
    fontSize: 10,
    color: '#E7F0FF',
    fontWeight: '700',
  },
  settingsAdjustWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settingsValueText: {
    minWidth: 72,
    textAlign: 'center',
    fontSize: 10,
    color: '#CFE6FF',
    fontWeight: '700',
  },
  settingsHintText: {
    fontSize: 10,
    color: '#9DB7CF',
  },
  settingsSubCard: {
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#29415F',
    backgroundColor: '#122033',
    padding: 8,
    gap: 6,
  },
  settingsSubLabelWrap: {
    flex: 1,
    paddingRight: 8,
    gap: 4,
  },
  settingsSubtleText: {
    fontSize: 10,
    color: '#82A3C4',
  },
  chapterMapModalBox: {
    backgroundColor: '#0F1A2A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3A5278',
    width: '92%',
    maxHeight: '70%',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  chapterMapSubtitle: {
    fontSize: 11,
    color: '#B9D4E9',
    marginBottom: 8,
    textAlign: 'center',
  },
  chapterNodesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 8,
  },
  chapterNode: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#4B6684',
    backgroundColor: '#1B2C40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterNodeDone: {
    borderColor: '#67AE7A',
    backgroundColor: '#234632',
  },
  chapterNodeActive: {
    borderColor: '#99D2FF',
    backgroundColor: '#2F5376',
    transform: [{ scale: 1.06 }],
  },
  chapterNodeBoss: {
    borderColor: '#D98DAA',
    backgroundColor: '#4A2E40',
  },
  chapterNodeText: {
    fontSize: 11,
    color: '#EFF7FF',
    fontWeight: '700',
  },
  chapterMapHint: {
    fontSize: 10,
    color: '#8FAECC',
    textAlign: 'center',
  },

  // Events button
  eventsBtn: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#3C2E5C',
    borderWidth: 1,
    borderColor: '#7B5FC0',
  },
  eventsBtnText: {
    fontSize: 10,
    color: '#E0D0FF',
    fontWeight: '700',
  },

  // Events modal
  eventsModalBox: {
    backgroundColor: '#121A26',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2E425A',
    width: '88%',
    maxHeight: '80%',
    padding: 14,
  },
  eventsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  eventsModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  eventsScroll: {
    maxHeight: 520,
  },
  eventsScrollContent: {
    paddingBottom: 6,
    gap: 8,
  },
  eventsCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#304761',
    backgroundColor: '#162336',
    padding: 10,
  },
  eventsCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D8EDFF',
    marginBottom: 6,
  },
  eventsSubtitle: {
    fontSize: 10,
    color: '#A9C4DB',
    marginBottom: 8,
  },
  eventsStatLine: {
    fontSize: 11,
    color: '#B9D4EA',
    marginBottom: 4,
  },
  eventsHint: {
    fontSize: 10,
    color: '#88A9C4',
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 6,
  },
  eventsActionBtn: {
    alignSelf: 'flex-start',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#5A80A8',
    backgroundColor: '#1E3450',
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  eventsActionBtnText: {
    fontSize: 10,
    color: '#D4EAFF',
    fontWeight: '700',
  },
  shopBuyBtnDisabled: {
    opacity: 0.45,
  },
  shopOfferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E3348',
    paddingTop: 8,
    marginTop: 8,
  },
  shopOfferInfo: {
    flex: 1,
    gap: 2,
  },
  shopOfferTitle: {
    fontSize: 11,
    color: '#E1F2FF',
    fontWeight: '700',
  },
  shopOfferDesc: {
    fontSize: 10,
    color: '#A9C4DB',
  },
  shopOfferPrice: {
    fontSize: 10,
    color: '#FFE39A',
  },

  // Daily quest rows
  dailyQuestRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E3348',
  },
  dailyQuestRowDone: {
    opacity: 0.7,
  },
  dailyQuestCheck: {
    fontSize: 14,
    paddingTop: 2,
    minWidth: 20,
  },
  dailyQuestInfo: {
    flex: 1,
    gap: 3,
  },
  dailyQuestTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DDEFFF',
  },
  dailyQuestDesc: {
    fontSize: 10,
    color: '#9ABBD5',
  },
  dailyQuestProgress: {
    fontSize: 10,
    color: '#7FA3BF',
  },
  dailyQuestReward: {
    fontSize: 10,
    color: '#FFD98A',
    fontWeight: '700',
    alignSelf: 'center',
  },

  // Seasonal ladder
  seasonRankBadge: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFE080',
    marginBottom: 6,
  },
  ladderTierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
    borderRadius: 5,
    paddingHorizontal: 6,
    marginBottom: 3,
    opacity: 0.5,
  },
  ladderTierActive: {
    backgroundColor: '#1C3250',
    opacity: 1,
    borderWidth: 1,
    borderColor: '#3F6899',
  },
  ladderTierRank: {
    fontSize: 12,
    minWidth: 80,
    fontWeight: '700',
    color: '#DDF1FF',
  },
  ladderTierInfo: {
    fontSize: 10,
    color: '#A4C0D8',
    flex: 1,
  },
  betaBoardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#28435D',
    backgroundColor: '#102033',
    marginBottom: 5,
  },
  betaBoardRowYou: {
    borderColor: '#63A7D8',
    backgroundColor: '#153048',
  },
  betaBoardRank: {
    minWidth: 34,
    fontSize: 10,
    color: '#B6D0E7',
    fontWeight: '700',
  },
  betaBoardName: {
    flex: 1,
    fontSize: 10,
    color: '#E2F1FF',
    fontWeight: '600',
  },
  betaBoardScore: {
    fontSize: 10,
    color: '#FFDB8F',
    fontWeight: '800',
  },

  // Formation info (in events modal)
  formationInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#1D3248',
  },
  formationInfoRole: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D5ECFF',
    minWidth: 80,
  },
  formationInfoPerk: {
    fontSize: 10,
    color: '#93B9D6',
    flex: 1,
  },

  // Formation badge (active team display)
  formationBadge: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#3E5C7A',
    backgroundColor: '#192A3D',
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignSelf: 'center',
  },
  formationBadgeLocked: {
    opacity: 0.6,
  },
  formationBadgeText: {
    fontSize: 10,
    color: '#C8DEF0',
    fontWeight: '700',
  },

  // Equipment optimize
  equipHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  equipOptimizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  equipOptimizeBtn: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#5FA870',
    backgroundColor: '#1E3D2C',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  equipOptimizeBtnText: {
    fontSize: 10,
    color: '#AFFFCA',
    fontWeight: '700',
  },
  equipDismantleBtn: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A86C5F',
    backgroundColor: '#3A251E',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  equipDismantleBtnText: {
    fontSize: 10,
    color: '#FFD1C5',
    fontWeight: '700',
  },
  equipOptimizeHint: {
    fontSize: 10,
    color: '#6FA880',
    fontStyle: 'italic',
  },

  // Compare UI
  compareBtn: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#4A6A9A',
    backgroundColor: '#152B48',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  compareBtnText: {
    fontSize: 10,
    color: '#C5DEFF',
    fontWeight: '700',
  },
  comparePanel: {
    backgroundColor: '#0C1B2C',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2E4F70',
    padding: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  comparePanelTitle: {
    fontSize: 10,
    color: '#A8C8E8',
    fontWeight: '700',
    marginBottom: 6,
  },
  compareStatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  compareStat: {
    fontSize: 10,
    fontWeight: '700',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: '#182A3E',
  },
  compareStatUp: {
    color: '#7DFF9A',
  },
  compareStatDown: {
    color: '#FF7D7D',
  },
  compareStatNeutral: {
    color: '#A0BAD0',
  },

  // Collection Log
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

  // Legacy Codex
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

  // Mastery Tracks
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

  // Prestige Milestones (War Room)
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

  // Dice Roll Modal
  diceRollModalContent: {
    backgroundColor: '#15151F',
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#2A2A4A',
    minWidth: '80%',
    maxWidth: '85%',
    alignItems: 'center',
  },
  diceRollTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 20,
  },
  diceRollHint: {
    fontSize: 14,
    color: '#AAA',
    marginBottom: 16,
  },
  diceButton: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: '#2A3956',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  diceFace: {
    width: 70,
    height: 70,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#8FAED1',
    backgroundColor: '#112136',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7BB8FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  diceFaceText: {
    fontSize: 34,
    fontWeight: '800',
    color: '#F4FBFF',
  },
  diceEmoji: {
    fontSize: 60,
  },
  diceRollingText: {
    fontSize: 14,
    color: '#6DDB7B',
    fontWeight: '700',
    marginTop: 8,
  },
  diceResultContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  diceResultNumber: {
    fontSize: 72,
    fontWeight: '700',
    color: '#FFD700',
  },
  diceResultLabel: {
    fontSize: 18,
    color: '#AAA',
    marginTop: -8,
  },

  // Rift Dungeon Modal
  riftModalContent: {
    backgroundColor: '#15151F',
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#2A2A4A',
    minWidth: '80%',
    maxWidth: '85%',
    alignItems: 'center',
  },
  riftTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 20,
  },
  riftSimulationHint: {
    fontSize: 14,
    color: '#AAA',
    marginBottom: 20,
  },
  waveBarsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 20,
    height: 80,
  },
  riftBuffList: {
    width: '100%',
    gap: 8,
    marginBottom: 12,
  },
  riftBuffCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3A5674',
    backgroundColor: '#0E1827',
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 3,
  },
  riftBuffCardRare: {
    borderColor: '#4E89D8',
    backgroundColor: '#10223D',
  },
  riftBuffCardEpic: {
    borderColor: '#A264E8',
    backgroundColor: '#201637',
  },
  riftBuffCardLegendary: {
    borderColor: '#E2B148',
    backgroundColor: '#35270F',
  },
  riftBuffTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E5F3FF',
  },
  riftBuffDesc: {
    fontSize: 11,
    color: '#A8C8E5',
  },
  riftBuffStat: {
    fontSize: 11,
    fontWeight: '700',
    color: '#79EAA3',
  },
  riftPickedCount: {
    fontSize: 11,
    color: '#A4C6DE',
    fontWeight: '700',
  },
  riftWavePredictionFeedback: {
    fontSize: 12,
    color: '#FFD700',
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
  waveBar: {
    width: 40,
    height: 20,
    backgroundColor: '#2A3956',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4A5C7A',
  },
  waveBarCleared: {
    backgroundColor: '#2F7547',
    borderColor: '#5BB58F',
  },
  waveBarActive: {
    backgroundColor: '#6DDB7B',
    borderColor: '#A8FF6B',
  },
  waveBarLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  wavesClearedContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  wavesClearedNumber: {
    fontSize: 72,
    fontWeight: '700',
    color: '#FF6B6B',
  },
  wavesClearedLabel: {
    fontSize: 18,
    color: '#AAA',
    marginTop: -8,
  },

  // Shared modal styles
  rewardsList: {
    width: '100%',
    marginBottom: 20,
  },
  rewardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#0D1523',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2A4258',
  },
  rewardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A9C4DB',
  },
  rewardValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFD700',
  },
  modalCloseBtn: {
    backgroundColor: '#6DDB7B',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  startSimulationBtn: {
    backgroundColor: '#6DDB7B',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  startSimulationBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },

  // Guild Hall Tab
  guildhallTab: {
    padding: 12,
    gap: 16,
  },
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
    backgroundColor: '#6DDB7B',
    borderColor: '#6DDB7B',
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
  batchHeroCardSelected: {
    borderColor: '#6DDB7B',
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
    backgroundColor: '#6DDB7B',
  },
  batchHeroInfo: {
    flex: 1,
    gap: 2,
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
    color: '#6DDB7B',
  },
  batchHerosCost: {
    fontSize: 11,
    color: '#FFD700',
    fontWeight: '700',
  },
  batchLevelConfirmBtn: {
    backgroundColor: '#6DDB7B',
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

  // Facilities Tab
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
    backgroundColor: '#6DDB7B',
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

  // Expeditions Tab
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
    backgroundColor: '#6DDB7B',
  },
  expeditionTimeRemaining: {
    fontSize: 11,
    color: '#A9C0E8',
    fontWeight: '600',
  },
  expeditionClaimBtn: {
    backgroundColor: '#6DDB7B',
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
    color: '#FFD700',
    fontWeight: '600',
  },
  expeditionStartCardRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  expeditionStartCardCost: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFD700',
  },
  expeditionStartCardCostDisabled: {
    color: '#7F6B47',
  },
  expeditionStartCardStatus: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6DDB7B',
  },
  expeditionStartCardStatusDisabled: {
    color: '#7F6B47',
  },
});
