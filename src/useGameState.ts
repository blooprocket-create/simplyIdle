import { useEffect, useRef, useCallback, useReducer, useState, useMemo } from 'react';
import {
  SKILLS,
  ACHIEVEMENTS,
  REBIRTH_BONUS,
  PlayerClass,
  StatKey,
  StatBlock,
  EquipmentSlot,
  HeroUnit,
  Rarity,
  PermanentUnlockId,
  HeroPassiveTraitId,
  HeroActiveSkillArchetypeId,
  HERO_POOL,
  ACTIVE_TEAM_SIZE,
  HERO_LEVEL_CAP,
  WeeklyEventConfig,
  MissionBoardGoal,
  getMonsterMaxHp,
  getMonsterForWave,
  getMonsterGold,
  getMonsterExp,
  getMonsterDamage,
  WEEKLY_TRACK_MILESTONES,
  MISSION_BOARD_GOALS,
  getWeeklyEventByWeek,
  getWeeklyEventForTimestamp,
  weekNumberForTimestamp,
  getActForWave,
  getBossUnlockForWave,
  getClassPassive,
  getHeroActiveArchetypeInfo,
  ACTIVE_SKILL_COOLDOWN_MS,
  MENDING_PULSE_BASE_HEAL,
  MENDING_PULSE_LEVEL_SCALE,
  getMonsterAffixes,
  expForLevel,
  getClassConfig,
  getEquipmentItem,
  getStarterEquipmentForClass,
  EQUIPMENT_CATALOG,
  equipmentRarityConfig,
  EquipmentItem,
  EquipmentRarity,
  getUsableItem,
  rollUsableItem,
  UsableItem,
  rollEquipmentRarityByTier,
  rollRarity,
  rarityConfig,
  getSummonRarityPool,
  getRankStatMultiplier,
  calculateShardReward,
  getHeroBackstory,
  getHeroUniqueCombatModifiers,
  getHeroUniqueSkillDescription,
  getHeroUniqueWeaponName,
  getHeroUniqueSkillParams,
  unlockLabel,
  SPARK_TOKEN_BY_RARITY,
  SOFT_PITY_START,
  SOFT_PITY_BOOST_PER_PULL,
  getHeroStatProfile,
} from './gameConfig';
import { safeDivide, roundTo4, safeMultiplier, fmt } from './utils';
import { debugLog, trackEvent, trackGameplayAction } from './telemetry';
import { isOnlineSaveAvailable, loadOnlineSave, writeOnlineSave } from './services/onlineSave';
import { claimCloudMail, fetchCloudMail } from './services/cloudMail';
import { minigamesReducer, MINIGAME_ACTION_TYPES } from './reducers/minigamesReducer';
import type { MinigameAction } from './reducers/minigamesReducer';
import { progressionReducer, PROGRESSION_ACTION_TYPES } from './reducers/progressionReducer';
import type { ProgressionAction } from './reducers/progressionReducer';
import { rosterReducer, ROSTER_ACTION_TYPES } from './reducers/rosterReducer';
import type { RosterAction } from './reducers/rosterReducer';
import { getSparkTokensForSummon, checkSummonMilestones, pickHeroWithBanner } from './reducers/rosterReducer';
import { economyReducer, ECONOMY_ACTION_TYPES } from './reducers/economyReducer';
import type { EconomyAction } from './reducers/economyReducer';
import { settingsReducer, SETTINGS_ACTION_TYPES } from './reducers/settingsReducer';
import type { SettingsAction } from './reducers/settingsReducer';

const TICK_MS = 100;
const SAVE_INTERVAL_MS = 5000;
const ONLINE_SAVE_INTERVAL_MS = 12000;
const STAT_POINTS_PER_LEVEL = 5;
const OFFLINE_PROGRESS_CAP_MS = 8 * 60 * 60 * 1000;
const OFFLINE_SIM_MAX_SLICE_MS = 1000;
const OFFLINE_SIM_MAX_ITERATIONS = 300000;
const PITY_THRESHOLD = 30;
// Use MAX_VALUE instead of MAX_SAFE_INTEGER so gold and other currencies are not
// artificially capped at ~9.01 Qa. JS IEEE-754 doubles can hold values up to
// ~1.8e308; precision is approximate above MAX_SAFE_INTEGER, but that is
// acceptable for an idle game with large-number mechanics.
const SAFE_INTEGER_CAP = Number.MAX_VALUE;
const MAX_SAVE_WAVE = 1_000_000;
const MAX_SAVE_PLAYER_LEVEL = 1_000_000;
const MAX_SAVE_COLLECTION = 500;
const MAX_SAVE_LOG_ENTRIES = 100;
const MAX_SAVE_SUMMON_HISTORY = 50;
const HEAT_BASE_RATE_PER_SEC = 7;
const HEAT_RECOVERY_RATE_PER_SEC = HEAT_BASE_RATE_PER_SEC * 0.66;
const HEAT_MAX_BASE = 100;
const HEAT_MAX_PER_LEVEL = 2;
export const FACILITY_MAX_LEVEL = 999;
const BURST_COST = 15;
const BURST_BOSS_CHARGE_GAIN = 3;
const EQUIPMENT_RARITY_SET = new Set<string>(['common', 'rare', 'epic', 'legendary', 'mythic', 'transcendent']);
const EQUIPMENT_RARITY_RANK: Record<string, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
  mythic: 4,
  transcendent: 5,
};
const GEAR_INVENTORY_CAP = 250;
const GEAR_INVENTORY_CAP_VIP5 = 500;
const GEAR_CAP_VIP_THRESHOLD = 5;
const BURST_STRIKE_DPS_MULT = 1.8;
const DIAMOND_SHOP_COSTS: Record<DiamondShopOfferId, number> = {
  coolant_i_pack: 18,
  coolant_ii_pack: 42,
  elite_supply: 88,
  rift_raid_ticket: 120,
};
const DOLLAR_SHOP_PACKS: Record<DollarShopOfferId, { usdCents: number; diamonds: number }> = {
  usd_499: { usdCents: 499, diamonds: 500 },
  usd_1999: { usdCents: 1999, diamonds: 2200 },
  usd_4999: { usdCents: 4999, diamonds: 6000 },
  usd_9999: { usdCents: 9999, diamonds: 13000 },
};
export const ENABLE_SIMULATED_DOLLAR_PURCHASES = false;
const VIP_LEVEL_THRESHOLDS = [0, 50, 150, 350, 700, 1500, 3000, 6500, 15000, 35000, 100000] as const;
const VIP_DAMAGE_PER_LEVEL = 0.03;
const VIP_GOLD_PER_LEVEL = 0.025;
const VIP_EXP_PER_LEVEL = 0.025;
const MAX_FORMATION_ROLE_HEROES = 2;
const TEAM_SLOT_UNLOCK_RULES: Record<number, { requiredWave: number; goldCost: number; shardCost: number }> = {
  5: { requiredWave: 50, goldCost: 125000, shardCost: 450 },
  6: { requiredWave: 100, goldCost: 550000, shardCost: 1600 },
};

export function getMaxHeatForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return HEAT_MAX_BASE + (safeLevel - 1) * HEAT_MAX_PER_LEVEL;
}

const VALID_PLAYER_CLASSES = new Set<PlayerClass>(['warrior', 'berserker', 'archer', 'mage', 'monk']);
const VALID_RARITIES = new Set<Rarity>([
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
  'godly',
  'transcendent',
]);
const VALID_AUTO_RECYCLE_RARITIES = new Set<Rarity>([
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
  'godly',
  'transcendent',
]);
const VALID_PERMANENT_UNLOCKS = new Set<PermanentUnlockId>([
  'class_passive',
  'advanced_consumables',
  'mythic_equipment',
]);
const VALID_HERO_TEMPLATE_IDS = new Set(HERO_POOL.map(hero => hero.id));
const HERO_TEMPLATE_MAP = new Map(HERO_POOL.map(h => [h.id, h]));
const VALID_HERO_FORMATION_ROLES = new Set<HeroFormationRole>(['front', 'mid', 'back']);
const VALID_SKILL_IDS = new Set(SKILLS.map(skill => skill.id));
const VALID_ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map(achievement => achievement.id));
const VALID_MISSION_IDS = new Set(MISSION_BOARD_GOALS.map(mission => mission.id));
const VALID_WEEKLY_TRACK_MILESTONES = new Set(WEEKLY_TRACK_MILESTONES);
const VALID_DOLLAR_SHOP_OFFER_IDS = new Set<DollarShopOfferId>(['usd_499', 'usd_1999', 'usd_4999', 'usd_9999']);
const ACTION_TELEMETRY_SAMPLE: Partial<Record<Action['type'], number>> = {
  CREATE_CHARACTER: 0,
  SUMMON_HERO: 1500,
  SUMMON_HERO_X10_CINEMATIC: 1500,
  SPARK_EXCHANGE: 0,
  REBIRTH: 0,
  PLAY_DICE_ROLL: 0,
  PLAY_RECON_SWEEP: 0,
  PLAY_LOCKPICK_CACHE: 0,
  PLAY_TARGET_PRACTICE: 0,
  START_MINI_BOUNTY_DRAFT: 0,
  CLAIM_MINI_BOUNTY_DRAFT: 0,
  RUN_RIFT_DUNGEON: 0,
  START_EXPEDITION: 1000,
  COMPLETE_EXPEDITION: 1000,
  UPGRADE_FACILITY: 1000,
  SPEND_ESSENCE_UPGRADE: 1000,
  SPEND_REBIRTH_CORE: 1000,
  BUY_GOLD_SHOP_ITEM: 1000,
  BUY_DIAMOND_SHOP_ITEM: 1000,
  SIMULATE_DOLLAR_PURCHASE: 1000,
  APPLY_OFFLINE_PROGRESS: 0,
};

export function getCharacterSaveSlot(accountName: string, playerClass: PlayerClass): string {
  return `${accountName}_${playerClass}`;
}

export interface RewardPopup {
  id: string;
  kind: 'gold' | 'item' | 'shard' | 'system';
  title: string;
  detail: string;
}

export interface MailAttachments {
  shards: number;
  gold: number;
  diamonds: number;
  tears: number;
  essence: number;
}

export interface MailMessage {
  id: string;
  subject: string;
  message: string;
  from: string;
  sentAt: number;
  attachments: MailAttachments;
  claimedAttachments?: MailAttachments;
}

const WELCOME_GIFT_MAIL_ID = 'mail_welcome_gift_v1';
const WELCOME_GIFT_ATTACHMENTS: MailAttachments = {
  gold: 10_000_000,
  shards: 50_000,
  diamonds: 500,
  essence: 500,
  tears: 20,
};

function createWelcomeGiftMail(): MailMessage {
  return {
    id: `${WELCOME_GIFT_MAIL_ID}_${Date.now()}`,
    subject: 'Welcome to SimplyIdle',
    from: 'SimplyIdle Team',
    sentAt: Date.now(),
    message:
      'Thank you for joining SimplyIdle. We are grateful to have you with us at launch, and we hope this Welcome Gift helps you begin your journey with momentum. Build your roster, push deeper waves, and we will continue improving the experience with every update.',
    attachments: {
      gold: WELCOME_GIFT_ATTACHMENTS.gold,
      shards: WELCOME_GIFT_ATTACHMENTS.shards,
      diamonds: WELCOME_GIFT_ATTACHMENTS.diamonds,
      essence: WELCOME_GIFT_ATTACHMENTS.essence,
      tears: WELCOME_GIFT_ATTACHMENTS.tears,
    },
    claimedAttachments: emptyAttachments(),
  };
}

interface SummonHistoryEntry {
  id: string;
  heroName: string;
  heroEmoji: string;
  rarity: Rarity;
  ts: number;
  pityTriggered: boolean;
}

type HeroFormationRole = 'front' | 'mid' | 'back';
type CombatTempo = 1 | 2 | 4;
type AutoTempoTarget = 2 | 4;
export type FacilityId = 'training' | 'treasury' | 'forge' | 'tactics';
type MiniBountyMetric = 'kills' | 'wave' | 'summons';
type MiniBountyDraftType = 'assault' | 'push' | 'recruit';
type ExpeditionType = 'artifact' | 'merchant' | 'ruins' | 'vault' | 'abyss';
type ExpeditionRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'godly';
type GoldShopOfferId = 'exp_cache' | 'potion_bundle' | 'armory_crate';
type DiamondShopOfferId = 'coolant_i_pack' | 'coolant_ii_pack' | 'elite_supply' | 'rift_raid_ticket';
type DollarShopOfferId = 'usd_499' | 'usd_1999' | 'usd_4999' | 'usd_9999';

const ACHIEVEMENT_BONUS_PER_UNLOCK = 0.03;
export const EXPEDITION_CONTRACT_REFRESH_MS = 8 * 60 * 60 * 1000;
export const EXPEDITION_CONTRACT_REFRESH_GOLD_COST = 100_000;
export const MINI_OPS_COOLDOWN_MS = 4 * 60 * 60 * 1000;

const EXPEDITION_TYPES: ExpeditionType[] = ['artifact', 'merchant', 'ruins', 'vault', 'abyss'];
const EXPEDITION_RARITIES: ExpeditionRarity[] = ['common', 'rare', 'epic', 'legendary', 'godly'];

const FACILITY_INITIAL_UPGRADE_COSTS: Record<FacilityId, number[]> = {
  // Preserve the original 1-5 era curve exactly.
  training: [5000, 12000, 30000, 75000, 150000, 300000],
  treasury: [4000, 10000, 25000, 60000, 120000, 250000],
  forge: [6000, 15000, 40000, 90000, 180000, 350000],
  tactics: [5000, 12000, 30000, 75000, 150000, 300000],
};

const FACILITY_POST_5_GROWTH_RATE: Record<FacilityId, number> = {
  training: 2,
  treasury: 2,
  forge: 2,
  tactics: 2,
};

export function getFacilityUpgradeCost(facilityId: FacilityId, currentLevel: number): number {
  const safeLevel = Math.max(0, Math.floor(currentLevel));
  if (safeLevel >= FACILITY_MAX_LEVEL) return Infinity;
  const openingCurve = FACILITY_INITIAL_UPGRADE_COSTS[facilityId];
  if (safeLevel < openingCurve.length) return openingCurve[safeLevel];

  // Use a closed-form exponential formula instead of an iterative loop to avoid
  // premature overflow. JS doubles (IEEE-754) represent values up to ~1.8e308,
  // so costs stay finite well past the FACILITY_MAX_LEVEL of 999.
  const growth = FACILITY_POST_5_GROWTH_RATE[facilityId];
  const stepsAboveBase = safeLevel - (openingCurve.length - 1);
  const cost = openingCurve[openingCurve.length - 1] * Math.pow(growth, stepsAboveBase);

  return Number.isFinite(cost) ? cost : Infinity;
}

export interface Stats {
  className: string;
  dps: number;
  teamDefense: number;
  damageBuffPct: number;
  damageReductionBuffPct: number;
  achievementBonusPercent: number;
  expNeeded: number;
  expProgress: number;
  teamBoostPercent: number;
  vipLevel: number;
  vipPoints: number;
  vipDamageBonusPct: number;
  vipGoldBonusPct: number;
  vipExpBonusPct: number;
  combined: StatBlock;
  equipmentBonus: StatBlock;
  heroDetails: Record<
    string,
    { dps: number; hp: number; str: number; vit: number; agi: number; int: number; spr: number }
  >;
  formation: {
    front: number;
    mid: number;
    back: number;
    dpsBonusPct: number;
    hpBonusPct: number;
    incomingDeltaPct: number;
  };
  synergies: Array<{ id: string; name: string; effect: string }>;
}

export interface GameState {
  playerName: string;
  playerClass: PlayerClass | null;
  characterCreated: boolean;

  gold: number;
  diamonds: number;
  totalGold: number;
  exp: number;
  totalExp: number;
  level: number;
  highestWaveReached: number;
  unspentStatPoints: number;
  statsAlloc: StatBlock;

  totalKills: number;
  burstCharge: number; // 0-BURST_COST; increments on each kill, resets on BURST
  combatHeat: number;
  wave: number;
  monsterHp: number;
  monsterMaxHp: number;
  teamHp: number;
  teamMaxHp: number;

  skills: Set<string>;

  heroRoster: HeroUnit[];
  activeTeamHeroIds: string[]; // unlockable up to 6 heroes in battle (+ player)
  totalSummons: number;
  firstSummonGiven: boolean; // track if free summon given on first kill
  freeSummonCharges: number;
  bossTears: number; // drops 1 per boss kill; used as the gacha summon currency
  heroShards: number; // currency used to rank up heroes
  essence: number;
  rebirthCores: number;
  rebirthDamagePath: number;
  rebirthEconomyPath: number;
  rebirthSurvivalPath: number;
  autoRecycleMaxRarity: Rarity;
  equipmentScrap: number;
  gachaPityCounter: number;
  sparkTokens: number;
  claimedSummonMilestones: number[];
  guaranteedMinRarity: Rarity | null;
  summonHistory: SummonHistoryEntry[];
  teamLoadouts: string[][];
  teamSlotsUnlocked: number;
  heroFormationByUid: Record<string, HeroFormationRole>;
  heroUniqueGearByHeroId: Record<string, HeroUniqueGearProgress>;
  lastDiceRollDay: number | null;
  riftDungeonLevel: number;
  riftEntriesUsedToday: number;
  riftEntryDay: number | null;
  riftRaidTickets: number;
  lastRiftBossDamagePct: number;
  lastDiceRollValue: number | null;
  lastRiftWavesCleared: number;
  treasureDungeonLevel: number;
  treasureEntriesUsedToday: number;
  treasureEntryDay: number | null;
  lastTreasureHaulPct: number;
  lastTreasureWiped: boolean;
  lastReconSweepDay: number | null;
  lastLockpickDay: number | null;
  lastTargetPracticeDay: number | null;
  lastBountyDraftDay: number | null;
  miniBounty: {
    id: string;
    title: string;
    metric: MiniBountyMetric;
    startValue: number;
    targetValue: number;
    rewardGold: number;
    rewardShards: number;
    rewardDiamonds: number;
    claimed: boolean;
  } | null;

  // Guild Hall / Facilities
  guildhallFacilities: Record<'training' | 'treasury' | 'forge' | 'tactics', { level: number }>;

  // Expeditions
  expeditionQueue: Array<{
    id: string;
    type: ExpeditionType;
    rarity: ExpeditionRarity;
    startTime: number;
    durationMs: number;
    reward: { diamonds: number; shards: number; essence: number; artifacts: number };
  }>;
  lastExpeditionDay: Record<ExpeditionType, number | null>;
  expeditionContractOffers: Record<ExpeditionType, ExpeditionRarity>;
  expeditionContractsRefreshedAt: number;

  classMasteryXp: Record<PlayerClass, number>;
  seasonPoints: number;
  bestSeasonPoints: number;
  dailyLoginStreak: number;
  lastDailyLoginDay: number | null;
  streakInsuranceCharges: number;
  weeklyEventWeek: number;
  weeklyEventId: string;
  weeklyKills: number;
  weeklyTrackClaimed: number[];
  claimedMissionIds: string[];
  codexVipClaimedHeroIds: string[];
  codexVipClaimedUniqueIds: string[];
  seenHintIds: string[];
  permanentUnlocks: PermanentUnlockId[];
  metaDamageLevel: number;
  metaEconomyLevel: number;
  metaSurvivalLevel: number;
  vipPoints: number;
  vipLevel: number;
  vipRewardClaimedLevels: number[];
  dollarFirstPurchaseClaimedOfferIds: DollarShopOfferId[];

  inventoryItemIds: string[];
  equipmentInventory: Record<string, EquipmentInstance>;
  equippedItems: Record<EquipmentSlot, string | null>;
  autoDismantleRarityFloor: EquipmentRarity;
  autoDismantleEnabled: boolean;
  usableItemCounts: Record<string, number>;
  autoUsePotionEnabled: boolean;
  autoUseCoolantEnabled: boolean;
  autoUsePotionThresholdPct: number;
  autoRecycleEnabled: boolean;
  autoSummonEnabled: boolean;
  autoSummonMode: 'single' | 'x10';
  autoBurstEnabled: boolean;
  combatTempo: CombatTempo;
  autoTempoEnabled: boolean;
  autoTempoTarget: AutoTempoTarget;
  autoSummonReserveGold: number;
  autoSummonCooldownMs: number;
  lastActiveAt: number;

  prestigeCount: number;
  achievements: Set<string>;
  newAchievement: string | null;
  rewardQueue: RewardPopup[];
  combatLog: string[];
  damageBuffPct: number;
  damageBuffMs: number;
  damageReductionBuffPct: number;
  damageReductionBuffMs: number;
  heroActiveCdMs: Record<string, number>;
  mailbox: MailMessage[];
  giftPreference: 'gold' | 'shards' | 'essence';
}

const blankStats: StatBlock = {
  strength: 0,
  vitality: 0,
  agility: 0,
  intelligence: 0,
  spirit: 0,
};

type EquipmentSource = 'starter' | 'drop' | 'craft' | 'crate' | 'upgrade' | 'legacy' | 'hero_unique';

export interface HeroUniqueGearProgress {
  rank: number;
  equippedByUid: string | null;
}

export interface EquipmentInstance {
  id: string;
  baseItemId: string;
  name: string;
  emoji: string;
  slot: EquipmentSlot;
  rarity: EquipmentRarity;
  allowedClasses: PlayerClass[];
  description: string;
  bonus: Partial<StatBlock>;
  itemLevel: number;
  source: EquipmentSource;
}

/**
 * Save schema version. Increment when save format changes.
 * sanitizeSaveData handles migration from any version to current.
 */
const SAVE_SCHEMA_VERSION = 1;

export const DEFAULT_STATE: GameState = {
  playerName: '',
  playerClass: null,
  characterCreated: false,

  gold: 0,
  diamonds: 0,
  totalGold: 0,
  exp: 0,
  totalExp: 0,
  level: 1,
  highestWaveReached: 1,
  unspentStatPoints: 0,
  statsAlloc: blankStats,

  totalKills: 0,
  burstCharge: 0,
  combatHeat: 0,
  wave: 1,
  monsterHp: getMonsterMaxHp(1),
  monsterMaxHp: getMonsterMaxHp(1),
  teamHp: 100,
  teamMaxHp: 100,

  skills: new Set(),

  heroRoster: [],
  activeTeamHeroIds: [],
  totalSummons: 0,
  firstSummonGiven: false,
  freeSummonCharges: 0,
  bossTears: 0,
  heroShards: 0,
  essence: 0,
  rebirthCores: 0,
  rebirthDamagePath: 0,
  rebirthEconomyPath: 0,
  rebirthSurvivalPath: 0,
  autoRecycleMaxRarity: 'uncommon',
  equipmentScrap: 0,
  gachaPityCounter: 0,
  sparkTokens: 0,
  claimedSummonMilestones: [],
  guaranteedMinRarity: null,
  summonHistory: [],
  teamLoadouts: [[], [], []],
  teamSlotsUnlocked: 4,
  heroFormationByUid: {},
  heroUniqueGearByHeroId: {},
  lastDiceRollDay: null,
  riftDungeonLevel: 1,
  riftEntriesUsedToday: 0,
  riftEntryDay: null,
  riftRaidTickets: 0,
  lastRiftBossDamagePct: 0,
  lastDiceRollValue: null,
  lastRiftWavesCleared: 0,
  treasureDungeonLevel: 1,
  treasureEntriesUsedToday: 0,
  treasureEntryDay: null,
  lastTreasureHaulPct: 0,
  lastTreasureWiped: false,
  lastReconSweepDay: null,
  lastLockpickDay: null,
  lastTargetPracticeDay: null,
  lastBountyDraftDay: null,
  miniBounty: null,

  guildhallFacilities: {
    training: { level: 0 },
    treasury: { level: 0 },
    forge: { level: 0 },
    tactics: { level: 0 },
  },
  expeditionQueue: [],
  lastExpeditionDay: {
    artifact: null,
    merchant: null,
    ruins: null,
    vault: null,
    abyss: null,
  },
  expeditionContractOffers: rollExpeditionContractOffers(),
  expeditionContractsRefreshedAt: Date.now(),

  classMasteryXp: {
    warrior: 0,
    berserker: 0,
    archer: 0,
    mage: 0,
    monk: 0,
  },
  seasonPoints: 0,
  bestSeasonPoints: 0,
  dailyLoginStreak: 0,
  lastDailyLoginDay: null,
  streakInsuranceCharges: 1,
  weeklyEventWeek: weekNumberForTimestamp(Date.now()),
  weeklyEventId: getWeeklyEventForTimestamp(Date.now()).id,
  weeklyKills: 0,
  weeklyTrackClaimed: [],
  claimedMissionIds: [],
  codexVipClaimedHeroIds: [],
  codexVipClaimedUniqueIds: [],
  seenHintIds: [],
  permanentUnlocks: [],
  metaDamageLevel: 0,
  metaEconomyLevel: 0,
  metaSurvivalLevel: 0,
  vipPoints: 0,
  vipLevel: 0,
  vipRewardClaimedLevels: [],
  dollarFirstPurchaseClaimedOfferIds: [],

  inventoryItemIds: [],
  equipmentInventory: {},
  autoDismantleRarityFloor: 'common' as EquipmentRarity,
  autoDismantleEnabled: false,
  equippedItems: {
    weapon: null,
    armor: null,
    accessory: null,
  },
  usableItemCounts: {},
  autoUsePotionEnabled: false,
  autoUseCoolantEnabled: false,
  autoUsePotionThresholdPct: 0.35,
  autoRecycleEnabled: false,
  autoSummonEnabled: false,
  autoSummonMode: 'single',
  autoBurstEnabled: false,
  combatTempo: 1,
  autoTempoEnabled: false,
  autoTempoTarget: 2,
  autoSummonReserveGold: 5000,
  autoSummonCooldownMs: 0,
  lastActiveAt: Date.now(),

  prestigeCount: 0,
  achievements: new Set(),
  newAchievement: null,
  rewardQueue: [],
  combatLog: [],
  damageBuffPct: 0,
  damageBuffMs: 0,
  damageReductionBuffPct: 0,
  damageReductionBuffMs: 0,
  heroActiveCdMs: {},
  mailbox: [],
  giftPreference: 'gold',
};

function sumStats(a: StatBlock, b: StatBlock): StatBlock {
  return {
    strength: a.strength + b.strength,
    vitality: a.vitality + b.vitality,
    agility: a.agility + b.agility,
    intelligence: a.intelligence + b.intelligence,
    spirit: a.spirit + b.spirit,
  };
}

function sumBonusStats(bonus: Partial<StatBlock>): number {
  return (
    (bonus.strength ?? 0) +
    (bonus.vitality ?? 0) +
    (bonus.agility ?? 0) +
    (bonus.intelligence ?? 0) +
    (bonus.spirit ?? 0)
  );
}

function getEquipmentEntry(state: GameState, itemId: string): EquipmentInstance | EquipmentItem | null {
  return state.equipmentInventory[itemId] ?? getEquipmentItem(itemId) ?? null;
}

function equipmentBudgetFor(baseItem: EquipmentItem, itemLevel: number): number {
  const rarityMultiplier: Record<EquipmentRarity, number> = {
    common: 1,
    rare: 1.25,
    epic: 1.6,
    legendary: 2,
    mythic: 2.55,
    transcendent: 3.1,
  };
  const slotMultiplier: Record<EquipmentSlot, number> = {
    weapon: 1.18,
    armor: 1.08,
    accessory: 1,
  };
  const levelMultiplier = 1 + Math.max(0, itemLevel - 1) * 0.07;
  return Math.max(
    2,
    Math.round(
      sumBonusStats(baseItem.bonus) *
        rarityMultiplier[baseItem.rarity] *
        slotMultiplier[baseItem.slot] *
        levelMultiplier,
    ),
  );
}

function getForgeStatMultiplier(forgeLevel: number): number {
  const safeLevel = Math.max(0, Math.floor(forgeLevel));
  return 1 + safeLevel * 0.03;
}

function getTrainingExpMultiplier(state: Pick<GameState, 'guildhallFacilities'>): number {
  const lvl = Math.max(0, Math.floor(state.guildhallFacilities.training.level));
  return 1 + lvl * 0.05;
}

function getTreasuryGoldMultiplier(state: Pick<GameState, 'guildhallFacilities'>): number {
  const lvl = Math.max(0, Math.floor(state.guildhallFacilities.treasury.level));
  return 1 + lvl * 0.02;
}

function getTacticsPowerMultiplier(state: Pick<GameState, 'guildhallFacilities'>): number {
  const lvl = Math.max(0, Math.floor(state.guildhallFacilities.tactics.level));
  return 1 + lvl * 0.025;
}

function getEquipmentStatWeights(playerClass: PlayerClass, slot: EquipmentSlot): Record<keyof StatBlock, number> {
  const cls = getClassConfig(playerClass);
  const offenseWeight = slot === 'weapon' ? 1.2 : slot === 'accessory' ? 1 : 0.82;
  const defenseWeight = slot === 'armor' ? 1.2 : slot === 'accessory' ? 0.95 : 0.8;
  const utilityWeight = slot === 'accessory' ? 1.15 : 0.9;
  return {
    strength: Math.max(0.15, cls.physWeight * offenseWeight),
    vitality: Math.max(0.15, cls.teamWeight * defenseWeight),
    agility: Math.max(0.15, (playerClass === 'archer' ? cls.physWeight * 1.18 : cls.physWeight * 0.62) * utilityWeight),
    intelligence: Math.max(0.15, cls.magicWeight * offenseWeight),
    spirit: Math.max(0.15, (cls.magicWeight * 0.72 + cls.teamWeight * 0.38) * utilityWeight),
  };
}

function randomizeEquipmentBonus(baseItem: EquipmentItem, itemLevel: number, statMultiplier = 1): Partial<StatBlock> {
  const playerClass = baseItem.allowedClasses[0] ?? 'warrior';
  const weights = getEquipmentStatWeights(playerClass, baseItem.slot);
  const keys = Object.keys(weights) as Array<keyof StatBlock>;
  const scaledBudget = Math.max(2, Math.round(equipmentBudgetFor(baseItem, itemLevel) * Math.max(1, statMultiplier)));
  const rolledWeights = keys.reduce<Record<keyof StatBlock, number>>(
    (acc, key) => {
      acc[key] = weights[key] * (0.82 + Math.random() * 0.45);
      return acc;
    },
    { strength: 0, vitality: 0, agility: 0, intelligence: 0, spirit: 0 },
  );
  const totalWeight = keys.reduce((sum, key) => sum + rolledWeights[key], 0);
  const bonus: Partial<StatBlock> = {};
  let assigned = 0;

  keys.forEach((key, index) => {
    const remaining = scaledBudget - assigned;
    if (remaining <= 0) return;
    const rawValue =
      index === keys.length - 1
        ? remaining
        : Math.max(0, Math.round((scaledBudget * rolledWeights[key]) / totalWeight));
    const value = Math.min(remaining, rawValue);
    if (value > 0) {
      bonus[key] = value;
      assigned += value;
    }
  });

  const anchorStats = Object.entries(baseItem.bonus)
    .filter(([, value]) => (value ?? 0) > 0)
    .map(([key]) => key as keyof StatBlock);
  for (const statKey of anchorStats) {
    bonus[statKey] = Math.max(1, bonus[statKey] ?? 0);
  }

  return bonus;
}

function createEquipmentInstance(
  baseItem: EquipmentItem,
  itemLevel: number,
  source: EquipmentSource,
  statMultiplier = 1,
): EquipmentInstance {
  const instanceId = `eq_${source}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const clampedLevel = Math.max(1, Math.floor(itemLevel));
  return {
    id: instanceId,
    baseItemId: baseItem.id,
    name: baseItem.name,
    emoji: baseItem.emoji,
    slot: baseItem.slot,
    rarity: baseItem.rarity,
    allowedClasses: [...baseItem.allowedClasses],
    description: baseItem.description,
    bonus: randomizeEquipmentBonus(baseItem, clampedLevel, statMultiplier),
    itemLevel: clampedLevel,
    source,
  };
}

function getEquipmentScrapGain(item: EquipmentInstance | EquipmentItem): number {
  const baseValue = equipmentScrapValue(item.rarity);
  if (!('source' in item)) return baseValue;
  const sourceMultiplier: Record<EquipmentSource, number> = {
    starter: 0.2,
    drop: 1,
    craft: 0.42,
    crate: 0.58,
    upgrade: 0.5,
    legacy: 0.9,
    hero_unique: 0.05,
  };
  return Math.max(1, Math.floor(baseValue * sourceMultiplier[item.source]));
}

function clampUniqueRank(rank: number): number {
  return Math.max(1, Math.min(10, Math.floor(rank)));
}

function grantHeroUniqueGear(state: GameState, hero: HeroUnit): GameState {
  const progress = state.heroUniqueGearByHeroId[hero.id];
  const current = progress?.rank ?? 0;
  const nextRank = clampUniqueRank(Math.max(1, current + 1));
  if (current >= 10) return state;

  const alreadyOwned = current > 0;
  const eligibleCopies = state.heroRoster.filter(copy => copy.id === hero.id);
  const preferredBearer = eligibleCopies.reduce<HeroUnit | null>((best, copy) => {
    if (!best || isPreferredUniqueBearer(copy, best)) return copy;
    return best;
  }, null);
  const nextUnique = {
    ...state.heroUniqueGearByHeroId,
    [hero.id]: {
      rank: nextRank,
      equippedByUid: progress?.equippedByUid ?? preferredBearer?.uid ?? hero.uid,
    },
  };
  const storySnippet = getHeroBackstory(hero.id);
  const uniqueWeaponName = getHeroUniqueWeaponName(hero.id);
  const uniqueSkill = getHeroUniqueSkillDescription(hero.id, nextRank);

  const rewarded = queueReward(
    {
      ...state,
      heroUniqueGearByHeroId: nextUnique,
    },
    {
      id: `hero_unique_${hero.id}_${Date.now()}`,
      kind: 'item',
      title: alreadyOwned ? `Unique Weapon Rank Up: ${hero.name}` : `Unique Weapon Forged: ${hero.name}`,
      detail: `${uniqueWeaponName} • Rank ${nextRank}/10 • ${uniqueSkill} ${storySnippet}`,
    },
  );
  return queueCombatLog(rewarded, `${hero.name}'s unique weapon is now Rank ${nextRank}`);
}

function maybeGrantHeroUniqueGear(state: GameState, hero: HeroUnit, chance: number): GameState {
  if (Math.random() > chance) return state;
  return grantHeroUniqueGear(state, hero);
}

function isPreferredUniqueBearer(candidate: HeroUnit, current: HeroUnit): boolean {
  const rarityDiff = rarityRank(candidate.rarity) - rarityRank(current.rarity);
  if (rarityDiff !== 0) return rarityDiff > 0;
  if (candidate.level !== current.level) return candidate.level > current.level;
  if (candidate.rank !== current.rank) return candidate.rank > current.rank;
  if (candidate.teamBoost !== current.teamBoost) return candidate.teamBoost > current.teamBoost;
  return candidate.uid.localeCompare(current.uid) < 0;
}

function getPreferredUniqueBearer(state: Pick<GameState, 'heroRoster'>, heroTemplateId: string): HeroUnit | null {
  let best: HeroUnit | null = null;
  for (const hero of state.heroRoster) {
    if (hero.id !== heroTemplateId) continue;
    if (!best || isPreferredUniqueBearer(hero, best)) {
      best = hero;
    }
  }
  return best;
}

function syncUniqueWeaponAssignmentForHero(state: GameState, heroTemplateId: string): GameState {
  const progress = state.heroUniqueGearByHeroId[heroTemplateId];
  if (!progress || progress.rank <= 0 || !progress.equippedByUid) return state;

  const preferredBearer = getPreferredUniqueBearer(state, heroTemplateId);
  if (!preferredBearer || preferredBearer.uid === progress.equippedByUid) return state;

  return {
    ...state,
    heroUniqueGearByHeroId: {
      ...state.heroUniqueGearByHeroId,
      [heroTemplateId]: {
        ...progress,
        equippedByUid: preferredBearer.uid,
      },
    },
  };
}

function getUniqueWeaponBearerUid(state: GameState, heroTemplateId: string): string | null {
  const progress = state.heroUniqueGearByHeroId[heroTemplateId];
  if (!progress || progress.rank <= 0 || !progress.equippedByUid) return null;

  return getPreferredUniqueBearer(state, heroTemplateId)?.uid ?? null;
}

function getActiveUniqueSkillMultipliers(state: GameState): {
  dpsMult: number;
  goldMult: number;
  expMult: number;
  incomingDmgMult: number;
} {
  const active = new Set(state.activeTeamHeroIds);
  let dpsMult = 1;
  let goldMult = 1;
  let expMult = 1;
  let incomingDmgMult = 1;

  for (const [heroTemplateId, progress] of Object.entries(state.heroUniqueGearByHeroId)) {
    if (!progress?.equippedByUid) continue;
    const rank = progress.rank ?? 0;
    if (rank <= 0) continue;
    const bearerUid = getUniqueWeaponBearerUid(state, heroTemplateId);
    if (!bearerUid || !active.has(bearerUid)) continue;
    const modifiers = getHeroUniqueCombatModifiers(heroTemplateId, clampUniqueRank(rank));

    dpsMult *= modifiers.dpsMult;
    goldMult *= modifiers.goldMult;
    expMult *= modifiers.expMult;
    incomingDmgMult *= modifiers.incomingDmgMult;
  }

  return {
    dpsMult: Math.min(40, dpsMult),
    goldMult: Math.min(6, goldMult),
    expMult: Math.min(6, expMult),
    incomingDmgMult: Math.max(0.3, incomingDmgMult),
  };
}

function hasEquippedUniqueWeaponOnHero(state: GameState, hero: Pick<HeroUnit, 'id' | 'uid'>): boolean {
  return getUniqueWeaponBearerUid(state, hero.id) === hero.uid;
}

function migrateLegacyEquipmentIds(
  inventoryItemIds: string[],
  equippedItems: Record<EquipmentSlot, string | null>,
  equipmentInventory: Record<string, EquipmentInstance>,
  playerLevel: number,
): {
  inventoryItemIds: string[];
  equippedItems: Record<EquipmentSlot, string | null>;
  equipmentInventory: Record<string, EquipmentInstance>;
  migratedCount: number;
  droppedCount: number;
} {
  const nextInventory = { ...equipmentInventory };
  const legacyMap = new Map<string, string>();
  const migratedInventoryIds: string[] = [];
  let migratedCount = 0;
  let droppedCount = 0;

  for (const itemId of inventoryItemIds) {
    if (nextInventory[itemId]) {
      migratedInventoryIds.push(itemId);
      continue;
    }
    const baseItem = getEquipmentItem(itemId);
    if (!baseItem) {
      droppedCount++;
      continue;
    }
    let migratedId = legacyMap.get(itemId);
    if (!migratedId) {
      const instance = createEquipmentInstance(baseItem, playerLevel, 'legacy');
      nextInventory[instance.id] = instance;
      migratedId = instance.id;
      legacyMap.set(itemId, migratedId);
      migratedCount++;
    }
    if (migratedId) {
      migratedInventoryIds.push(migratedId);
    }
  }

  const migratedEquipped = { ...equippedItems };
  for (const slot of ['weapon', 'armor', 'accessory'] as EquipmentSlot[]) {
    const equippedId = migratedEquipped[slot];
    if (!equippedId) continue;
    if (nextInventory[equippedId]) continue;
    const mappedId = legacyMap.get(equippedId);
    if (mappedId && nextInventory[mappedId]?.slot === slot) {
      migratedEquipped[slot] = mappedId;
      continue;
    }
    migratedEquipped[slot] = null;
  }

  return {
    inventoryItemIds: migratedInventoryIds,
    equippedItems: migratedEquipped,
    equipmentInventory: nextInventory,
    migratedCount,
    droppedCount,
  };
}

function getEquipmentBonusStats(state: GameState): StatBlock {
  const bonus: StatBlock = {
    strength: 0,
    vitality: 0,
    agility: 0,
    intelligence: 0,
    spirit: 0,
  };

  for (const itemId of Object.values(state.equippedItems)) {
    if (!itemId) continue;
    const item = getEquipmentEntry(state, itemId);
    if (!item) continue;
    bonus.strength += item.bonus.strength ?? 0;
    bonus.vitality += item.bonus.vitality ?? 0;
    bonus.agility += item.bonus.agility ?? 0;
    bonus.intelligence += item.bonus.intelligence ?? 0;
    bonus.spirit += item.bonus.spirit ?? 0;
  }

  return bonus;
}

function derivedStats(state: GameState): StatBlock {
  const cls = getClassConfig(state.playerClass ?? 'warrior');
  return sumStats(sumStats(cls.baseStats, state.statsAlloc), getEquipmentBonusStats(state));
}

function getTeamHeroBoost(state: GameState): number {
  const activeTeam = new Set(state.activeTeamHeroIds);
  return state.heroRoster.filter(h => activeTeam.has(h.uid)).reduce((sum, h) => sum + h.teamBoost, 0);
}

function getClassMasteryLevel(state: GameState, playerClass: PlayerClass | null): number {
  if (!playerClass) return 0;
  const xp = state.classMasteryXp[playerClass] ?? 0;
  return Math.floor(xp / 100);
}

// Allowed formation roles per class:
//   warrior / berserker  → front only
//   monk                 → front | mid
//   mage  / archer       → mid  | back
export const VALID_FORMATION_ROLES_FOR_CLASS: Record<PlayerClass, HeroFormationRole[]> = {
  warrior: ['front'],
  berserker: ['front'],
  monk: ['front', 'mid'],
  mage: ['mid'],
  archer: ['back'],
};

function defaultFormationForClass(playerClass: PlayerClass): HeroFormationRole {
  return VALID_FORMATION_ROLES_FOR_CLASS[playerClass][0];
}

function getFormationRoleForHero(hero: HeroUnit): HeroFormationRole {
  return VALID_FORMATION_ROLES_FOR_CLASS[hero.heroClass][0];
}

function getTeamSlotUnlockRequirement(
  targetSlots: number,
): { requiredWave: number; goldCost: number; shardCost: number } | null {
  return TEAM_SLOT_UNLOCK_RULES[targetSlots] ?? null;
}

function getUnlockedTeamSlotCap(state: Pick<GameState, 'teamSlotsUnlocked'>): number {
  const safeSlots = Number.isFinite(state.teamSlotsUnlocked) ? Math.floor(state.teamSlotsUnlocked) : 4;
  return Math.max(4, Math.min(ACTIVE_TEAM_SIZE, safeSlots));
}

function normalizeTeamSelectionByRules(
  state: Pick<GameState, 'heroRoster' | 'heroFormationByUid' | 'teamSlotsUnlocked'>,
  heroIds: string[],
): string[] {
  const cap = getUnlockedTeamSlotCap(state);
  const accepted: string[] = [];
  const seen = new Set<string>();
  const seenBaseIds = new Set<string>();
  const roleCounts: Record<HeroFormationRole, number> = { front: 0, mid: 0, back: 0 };

  for (const uid of heroIds) {
    if (accepted.length >= cap) break;
    if (seen.has(uid)) continue;
    const hero = state.heroRoster.find(h => h.uid === uid);
    if (!hero) continue;
    if (seenBaseIds.has(hero.id)) continue;

    const role = state.heroFormationByUid[uid] ?? defaultFormationForClass(hero.heroClass);
    if (roleCounts[role] >= MAX_FORMATION_ROLE_HEROES) continue;

    accepted.push(uid);
    seen.add(uid);
    seenBaseIds.add(hero.id);
    roleCounts[role] += 1;
  }

  return accepted;
}

function getTeamRoleCounts(state: Pick<GameState, 'heroRoster' | 'heroFormationByUid'>, heroIds: string[]) {
  const roleCounts: Record<HeroFormationRole, number> = { front: 0, mid: 0, back: 0 };
  for (const uid of heroIds) {
    const hero = state.heroRoster.find(h => h.uid === uid);
    if (!hero) continue;
    const role = state.heroFormationByUid[uid] ?? defaultFormationForClass(hero.heroClass);
    roleCounts[role] += 1;
  }
  return roleCounts;
}

function getFormationMultipliers(state: GameState): {
  dpsMult: number;
  hpMult: number;
  incomingMult: number;
  front: number;
  mid: number;
  back: number;
} {
  const active = new Set(state.activeTeamHeroIds);
  let front = 0;
  let mid = 0;
  let back = 0;
  let dpsMult = 1;
  let hpMult = 1;
  let incomingMult = 1;

  for (const hero of state.heroRoster) {
    if (!active.has(hero.uid)) continue;
    const role = getFormationRoleForHero(hero);

    // Cap each role at MAX_FORMATION_ROLE_HEROES
    if (role === 'front') {
      if (front >= MAX_FORMATION_ROLE_HEROES) continue;
      front += 1;
      hpMult *= 1.06;
      incomingMult *= 0.95;
      if (hero.heroClass === 'warrior' || hero.heroClass === 'berserker' || hero.heroClass === 'monk') {
        incomingMult *= 0.96;
      } else {
        dpsMult *= 0.98;
      }
    } else if (role === 'mid') {
      if (mid >= MAX_FORMATION_ROLE_HEROES) continue;
      mid += 1;
      dpsMult *= 1.03;
      hpMult *= 1.02;
      incomingMult *= 0.99;
    } else {
      if (back >= MAX_FORMATION_ROLE_HEROES) continue;
      back += 1;
      dpsMult *= 1.05;
      incomingMult *= 1.03;
      if (hero.heroClass === 'archer' || hero.heroClass === 'mage') {
        dpsMult *= 1.04;
      } else {
        incomingMult *= 1.02;
      }
    }
  }

  dpsMult = Math.min(1.95, dpsMult);
  hpMult = Math.min(1.85, hpMult);
  incomingMult = Math.max(0.68, Math.min(1.35, incomingMult));

  return { dpsMult, hpMult, incomingMult, front, mid, back };
}

function factionForClass(playerClass: PlayerClass): 'vanguard' | 'ranger' | 'arcanum' | 'aegis' {
  if (playerClass === 'warrior' || playerClass === 'berserker') return 'vanguard';
  if (playerClass === 'archer') return 'ranger';
  if (playerClass === 'mage') return 'arcanum';
  return 'aegis';
}

function getTeamSynergy(state: GameState): {
  dpsMult: number;
  hpMult: number;
  incomingMult: number;
  goldMult: number;
  expMult: number;
  active: Array<{ id: string; name: string; effect: string }>;
} {
  const activeIds = new Set(state.activeTeamHeroIds);
  const activeHeroes = state.heroRoster.filter(hero => activeIds.has(hero.uid));
  const classCounts: Record<PlayerClass, number> = {
    warrior: 0,
    berserker: 0,
    archer: 0,
    mage: 0,
    monk: 0,
  };
  const factionCounts = {
    vanguard: 0,
    ranger: 0,
    arcanum: 0,
    aegis: 0,
  };

  for (const hero of activeHeroes) {
    classCounts[hero.heroClass] += 1;
    factionCounts[factionForClass(hero.heroClass)] += 1;
  }

  let dpsMult = 1;
  let hpMult = 1;
  let incomingMult = 1;
  let goldMult = 1;
  let expMult = 1;
  const active: Array<{ id: string; name: string; effect: string }> = [];

  if (factionCounts.vanguard >= 2) {
    hpMult *= 1.12;
    active.push({ id: 'vanguard_wall', name: 'Vanguard Wall', effect: '+12% team HP' });
  }

  if (factionCounts.ranger >= 1 && factionCounts.arcanum >= 1) {
    dpsMult *= 1.1;
    active.push({ id: 'spellshot', name: 'Spellshot Link', effect: '+10% team DPS' });
  }

  if (classCounts.warrior + classCounts.berserker >= 1 && classCounts.monk >= 1) {
    incomingMult *= 0.93;
    active.push({ id: 'iron_mandala', name: 'Iron Mandala', effect: '-7% incoming damage' });
  }

  const uniqueClassCount = (Object.values(classCounts) as number[]).filter(n => n > 0).length;
  if (uniqueClassCount >= 4) {
    dpsMult *= 1.08;
    expMult *= 1.08;
    active.push({ id: 'grand_coalition', name: 'Grand Coalition', effect: '+8% DPS, +8% EXP' });
  }

  const monoClass = (Object.values(classCounts) as number[]).some(
    n => n === activeHeroes.length && activeHeroes.length >= 3,
  );
  if (monoClass) {
    goldMult *= 1.18;
    active.push({ id: 'warband_focus', name: 'Warband Focus', effect: '+18% gold gains' });
  }

  return { dpsMult, hpMult, incomingMult, goldMult, expMult, active };
}

function rarityRank(rarity: Rarity): number {
  return (
    {
      common: 0,
      uncommon: 1,
      rare: 2,
      epic: 3,
      legendary: 4,
      mythic: 5,
      godly: 6,
      transcendent: 7,
    }[rarity] ?? 0
  );
}

function isPostgameSummonUnlocked(state: Pick<GameState, 'highestWaveReached' | 'prestigeCount'>): boolean {
  return state.highestWaveReached >= 150 && state.prestigeCount >= 1;
}

function queueReward(state: GameState, reward: RewardPopup): GameState {
  return {
    ...state,
    rewardQueue: [...state.rewardQueue, reward],
  };
}

function queueCombatLog(state: GameState, line: string): GameState {
  return {
    ...state,
    combatLog: [`${new Date().toLocaleTimeString()} • ${line}`, ...state.combatLog].slice(0, 24),
  };
}

type MailAttachmentKey = keyof MailAttachments;

function emptyAttachments(): MailAttachments {
  return { shards: 0, gold: 0, diamonds: 0, tears: 0, essence: 0 };
}

function hasAnyAttachment(attachments: MailAttachments): boolean {
  return (
    attachments.shards > 0 ||
    attachments.gold > 0 ||
    attachments.diamonds > 0 ||
    attachments.tears > 0 ||
    attachments.essence > 0
  );
}

function claimMailAttachments(state: GameState, mailId: string, keys: MailAttachmentKey[]): GameState {
  const targetMail = state.mailbox.find(mail => mail.id === mailId);
  if (!targetMail) return state;

  const claimSet = new Set(keys);
  const prev = targetMail.attachments;
  const prevClaimed = targetMail.claimedAttachments ?? emptyAttachments();
  const addShards = claimSet.has('shards') ? Math.max(0, prev.shards) : 0;
  const addGold = claimSet.has('gold') ? Math.max(0, prev.gold) : 0;
  const addDiamonds = claimSet.has('diamonds') ? Math.max(0, prev.diamonds) : 0;
  const addTears = claimSet.has('tears') ? Math.max(0, prev.tears) : 0;
  const addEssence = claimSet.has('essence') ? Math.max(0, prev.essence) : 0;
  if (addShards + addGold + addDiamonds + addTears + addEssence <= 0) return state;

  const nextMailbox = state.mailbox.map(mail => {
    if (mail.id !== mailId) return mail;
    const nextAttachments: MailAttachments = {
      shards: claimSet.has('shards') ? 0 : mail.attachments.shards,
      gold: claimSet.has('gold') ? 0 : mail.attachments.gold,
      diamonds: claimSet.has('diamonds') ? 0 : mail.attachments.diamonds,
      tears: claimSet.has('tears') ? 0 : mail.attachments.tears,
      essence: claimSet.has('essence') ? 0 : mail.attachments.essence,
    };
    const nextClaimedAttachments: MailAttachments = {
      shards: prevClaimed.shards + addShards,
      gold: prevClaimed.gold + addGold,
      diamonds: prevClaimed.diamonds + addDiamonds,
      tears: prevClaimed.tears + addTears,
      essence: prevClaimed.essence + addEssence,
    };
    return {
      ...mail,
      attachments: nextAttachments,
      claimedAttachments: nextClaimedAttachments,
    };
  });

  let nextState: GameState = {
    ...state,
    heroShards: state.heroShards + addShards,
    gold: state.gold + addGold,
    totalGold: state.totalGold + addGold,
    diamonds: state.diamonds + addDiamonds,
    bossTears: state.bossTears + addTears,
    essence: state.essence + addEssence,
    mailbox: nextMailbox,
  };

  const summary: string[] = [];
  if (addShards > 0) summary.push(`+${addShards} shards`);
  if (addGold > 0) summary.push(`+${addGold} gold`);
  if (addDiamonds > 0) summary.push(`+${addDiamonds} diamonds`);
  if (addTears > 0) summary.push(`+${addTears} tears`);
  if (addEssence > 0) summary.push(`+${addEssence} essence`);

  nextState = queueReward(nextState, {
    id: `mail_claim_${mailId}_${Date.now()}`,
    kind: 'system',
    title: 'Mail Attachment Claimed',
    detail: summary.join(' • '),
  });

  return queueCombatLog(nextState, `Mail claimed: ${summary.join(', ')}`);
}

function claimAllMailAttachments(state: GameState): GameState {
  const claimable = state.mailbox.filter(mail => hasAnyAttachment(mail.attachments)).map(mail => mail.id);
  if (claimable.length === 0) return state;

  let nextState = state;
  for (const mailId of claimable) {
    nextState = claimMailAttachments(nextState, mailId, ['shards', 'gold', 'diamonds', 'tears', 'essence']);
  }
  return nextState;
}

function getHeroPassiveMultipliers(state: GameState): {
  dpsMult: number;
  goldMult: number;
  expMult: number;
  incomingDmgMult: number;
} {
  const team = new Set(state.activeTeamHeroIds);
  let dpsMult = 1;
  let goldMult = 1;
  let expMult = 1;
  let incomingDmgMult = 1;

  for (const hero of state.heroRoster) {
    if (!team.has(hero.uid)) continue;
    const trait: HeroPassiveTraitId = hero.passiveTrait;
    if (trait === 'warpath_instinct') dpsMult *= 1.03;
    if (trait === 'fortune_hunter') goldMult *= 1.04;
    if (trait === 'sage_instinct') expMult *= 1.03;
    if (trait === 'bulwark_instinct') incomingDmgMult *= 0.98;
  }

  const uniqueSkills = getActiveUniqueSkillMultipliers(state);

  return {
    dpsMult: Math.min(12, dpsMult * uniqueSkills.dpsMult),
    goldMult: Math.min(4, goldMult * uniqueSkills.goldMult),
    expMult: Math.min(4, expMult * uniqueSkills.expMult),
    incomingDmgMult: Math.max(0.35, incomingDmgMult * uniqueSkills.incomingDmgMult),
  };
}

function decayBuffs(state: GameState, elapsedMs: number): GameState {
  const nextDmgMs = Math.max(0, state.damageBuffMs - elapsedMs);
  const nextDrMs = Math.max(0, state.damageReductionBuffMs - elapsedMs);
  const nextAutoSummonCd = Math.max(0, state.autoSummonCooldownMs - elapsedMs);
  return {
    ...state,
    damageBuffMs: nextDmgMs,
    damageReductionBuffMs: nextDrMs,
    damageBuffPct: nextDmgMs > 0 ? state.damageBuffPct : 0,
    damageReductionBuffPct: nextDrMs > 0 ? state.damageReductionBuffPct : 0,
    autoSummonCooldownMs: nextAutoSummonCd,
  };
}

function updateCombatHeat(state: GameState, elapsedMs: number): GameState {
  const seconds = elapsedMs / 1000;
  if (seconds <= 0) return state;
  const maxHeat = getMaxHeatForLevel(state.level);

  let nextHeat = state.combatHeat;
  if (state.combatTempo === 1) {
    nextHeat = Math.max(0, state.combatHeat - HEAT_RECOVERY_RATE_PER_SEC * seconds);
    return { ...state, combatHeat: nextHeat };
  }

  const buildRate = HEAT_BASE_RATE_PER_SEC;
  nextHeat = Math.min(maxHeat, state.combatHeat + buildRate * seconds);
  if (nextHeat >= maxHeat) {
    const overheated: GameState = {
      ...state,
      combatHeat: maxHeat,
      combatTempo: 1,
    };
    return queueReward(queueCombatLog(overheated, 'OVERHEAT! Combat Tempo forced to 1x'), {
      id: `overheat_${Date.now()}`,
      kind: 'system',
      title: 'Overheat Triggered',
      detail: 'Tempo dropped to 1x. Use coolant or wait for recovery.',
    });
  }

  return { ...state, combatHeat: nextHeat };
}

function maybeAutoRecycleBackground(state: GameState): GameState {
  if (!state.autoRecycleEnabled) return state;
  const activeTeam = new Set(state.activeTeamHeroIds);
  const maxRank = rarityRank(state.autoRecycleMaxRarity);
  const toRecycle = state.heroRoster.filter(
    h => !activeTeam.has(h.uid) && rarityRank(h.rarity) <= maxRank && !hasEquippedUniqueWeaponOnHero(state, h),
  );
  if (toRecycle.length === 0) return state;

  const recycledIds = new Set(toRecycle.map(h => h.uid));
  const weekly = getCurrentWeeklyEvent(state);
  const shardReward = Math.ceil(
    toRecycle.reduce((sum, hero) => sum + calculateShardReward(hero.rarity, hero.level), 0) * weekly.shardMultiplier,
  );
  const newRoster = state.heroRoster.filter(h => !recycledIds.has(h.uid));
  const newMaxHp = getTeamMaxHp({ ...state, heroRoster: newRoster });
  const heroFormationByUid = Object.fromEntries(
    Object.entries(state.heroFormationByUid).filter(([uid]) => !recycledIds.has(uid)),
  ) as Record<string, HeroFormationRole>;
  const heroActiveCdMs = Object.fromEntries(
    Object.entries(state.heroActiveCdMs).filter(([uid]) => !recycledIds.has(uid)),
  ) as Record<string, number>;

  return queueReward(
    {
      ...state,
      heroRoster: newRoster,
      heroFormationByUid,
      heroActiveCdMs,
      heroShards: state.heroShards + shardReward,
      teamMaxHp: newMaxHp,
      teamHp: Math.min(state.teamHp, newMaxHp),
    },
    {
      id: `bg_auto_recycle_${Date.now()}`,
      kind: 'shard',
      title: 'Auto Recycle (Background)',
      detail: `+${shardReward} shards from ${toRecycle.length} heroes`,
    },
  );
}

function getGearInventoryCap(state: GameState): number {
  return (state.vipLevel ?? 0) >= GEAR_CAP_VIP_THRESHOLD ? GEAR_INVENTORY_CAP_VIP5 : GEAR_INVENTORY_CAP;
}

function maybeAutoDismantleTick(state: GameState): GameState {
  if (!state.autoDismantleEnabled) return state;
  const floorRank = EQUIPMENT_RARITY_RANK[state.autoDismantleRarityFloor ?? 'common'] ?? 0;
  const equippedIds = new Set(Object.values(state.equippedItems).filter((id): id is string => !!id));
  const candidates = state.inventoryItemIds
    .filter(itemId => !equippedIds.has(itemId))
    .map(itemId => ({ itemId, item: state.equipmentInventory[itemId] }))
    .filter(
      (entry): entry is { itemId: string; item: EquipmentInstance } =>
        !!entry.item &&
        entry.item.source !== 'hero_unique' &&
        (EQUIPMENT_RARITY_RANK[entry.item.rarity] ?? 0) <= floorRank,
    );
  if (candidates.length === 0) return state;

  const dismantleIds = new Set(candidates.map(entry => entry.itemId));
  const gain = candidates.reduce((sum, entry) => sum + getEquipmentScrapGain(entry.item), 0);
  const nextEquipmentInventory = { ...state.equipmentInventory };
  for (const itemId of dismantleIds) delete nextEquipmentInventory[itemId];
  return queueReward(
    {
      ...state,
      inventoryItemIds: state.inventoryItemIds.filter(id => !dismantleIds.has(id)),
      equipmentInventory: nextEquipmentInventory,
      equipmentScrap: state.equipmentScrap + gain,
    },
    {
      id: `auto_dismantle_tick_${Date.now()}`,
      kind: 'item',
      title: 'Auto Dismantle',
      detail: `+${gain} scrap from ${candidates.length} items`,
    },
  );
}

function maybeAutoSummonTick(state: GameState): GameState {
  if (!state.autoSummonEnabled) return state;
  if (state.autoSummonCooldownMs > 0) return state;
  const postgameUnlocked = isPostgameSummonUnlocked(state);
  const trySingle = (): GameState | null => {
    const canUseFree = state.freeSummonCharges > 0;
    if (!canUseFree && state.bossTears < 1) return null;

    const roll = rollRarityWithPity(state.gachaPityCounter, postgameUnlocked, state.guaranteedMinRarity);
    const rarity = roll.rarity;
    const { template } = pickHeroWithBanner(rarity, undefined);
    const rarityMult = rarityConfig(rarity).boostMultiplier;
    const uid = `${template.id}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const hero: HeroUnit = {
      ...template,
      uid,
      rarity,
      level: 1,
      rank: 1,
      teamBoost: roundTo4(template.baseTeamBoost * rarityMult),
    };
    const historyEntry: SummonHistoryEntry = {
      id: `hist_${uid}`,
      heroName: hero.name,
      heroEmoji: hero.emoji,
      rarity: hero.rarity,
      ts: Date.now(),
      pityTriggered: roll.pityTriggered,
    };
    const sparkGain = getSparkTokensForSummon(state, template.id, rarity);
    const newTotalSummons = state.totalSummons + 1;
    const milestones = checkSummonMilestones(newTotalSummons, state.claimedSummonMilestones);
    let nextState = withAchievement({
      ...state,
      bossTears: canUseFree ? state.bossTears : state.bossTears - 1,
      heroRoster: [hero, ...state.heroRoster],
      summonHistory: [historyEntry, ...state.summonHistory].slice(0, MAX_SAVE_SUMMON_HISTORY),
      totalSummons: newTotalSummons,
      freeSummonCharges: (canUseFree ? state.freeSummonCharges - 1 : state.freeSummonCharges) + milestones.freeCharges,
      gachaPityCounter: roll.nextCounter,
      sparkTokens: state.sparkTokens + sparkGain + milestones.sparkTokens,
      claimedSummonMilestones: milestones.newClaimed,
      guaranteedMinRarity: state.guaranteedMinRarity ? null : milestones.guaranteedRarity,
      autoSummonCooldownMs: 1200,
    });
    nextState = maybeGrantHeroUniqueGear(nextState, hero, 0.05);
    nextState = queueCombatLog(nextState, `Auto Summon: ${hero.emoji} ${hero.name} (${hero.rarity})`);
    return nextState;
  };

  const tryX10 = (): GameState | null => {
    const totalPulls = 11; // x10 summon gives 11 heroes (1 bonus)
    const paidPullCount = 10;
    const freeUses = Math.min(state.freeSummonCharges, paidPullCount);
    const paidUses = paidPullCount - freeUses;
    if (state.bossTears < paidUses) return null;

    const summoned: HeroUnit[] = [];
    const historyBatch: SummonHistoryEntry[] = [];
    let pityCounter = state.gachaPityCounter;
    let guaranteedMin = state.guaranteedMinRarity;
    let totalSparkGain = 0;
    for (let i = 0; i < totalPulls; i++) {
      const roll = rollRarityWithPity(pityCounter, postgameUnlocked, guaranteedMin);
      pityCounter = roll.nextCounter;
      const rarity = roll.rarity;
      if (guaranteedMin) guaranteedMin = null;
      const { template } = pickHeroWithBanner(rarity, undefined);
      const rarityMult = rarityConfig(rarity).boostMultiplier;
      const uid = `${template.id}_${Date.now()}_${i}_${Math.floor(Math.random() * 10000)}`;
      const summonedHero: HeroUnit = {
        ...template,
        uid,
        rarity,
        level: 1,
        rank: 1,
        teamBoost: roundTo4(template.baseTeamBoost * rarityMult),
      };
      summoned.push(summonedHero);
      historyBatch.push({
        id: `hist_${uid}`,
        heroName: summonedHero.name,
        heroEmoji: summonedHero.emoji,
        rarity: summonedHero.rarity,
        ts: Date.now(),
        pityTriggered: roll.pityTriggered,
      });
      const alreadyOwned =
        state.heroRoster.some(h => h.id === template.id) || summoned.slice(0, i).some(h => h.id === template.id);
      if (alreadyOwned) totalSparkGain += SPARK_TOKEN_BY_RARITY[rarity];
    }

    const newTotalSummons = state.totalSummons + totalPulls;
    const milestones = checkSummonMilestones(newTotalSummons, state.claimedSummonMilestones);

    let nextState = withAchievement({
      ...state,
      bossTears: state.bossTears - paidUses,
      heroRoster: [...summoned, ...state.heroRoster],
      summonHistory: [...historyBatch, ...state.summonHistory].slice(0, MAX_SAVE_SUMMON_HISTORY),
      totalSummons: newTotalSummons,
      freeSummonCharges: state.freeSummonCharges - freeUses + milestones.freeCharges,
      gachaPityCounter: pityCounter,
      sparkTokens: state.sparkTokens + totalSparkGain + milestones.sparkTokens,
      claimedSummonMilestones: milestones.newClaimed,
      guaranteedMinRarity: guaranteedMin ?? milestones.guaranteedRarity ?? null,
      autoSummonCooldownMs: 1800,
    });
    for (const hero of summoned) {
      nextState = maybeGrantHeroUniqueGear(nextState, hero, 0.06);
    }
    nextState = queueCombatLog(nextState, `Auto Summon x10 completed`);
    return nextState;
  };

  if (state.autoSummonMode === 'x10') {
    const x10 = tryX10();
    if (x10) return x10;
    return state;
  }

  const single = trySingle();
  return single ?? state;
}

function tickHeroActives(state: GameState, elapsedMs: number): GameState {
  const team = new Set(state.activeTeamHeroIds);
  if (team.size === 0) return state;

  let nextState = state;
  const cooldowns: Record<string, number> = { ...state.heroActiveCdMs };

  for (const hero of state.heroRoster) {
    if (!team.has(hero.uid)) continue;
    cooldowns[hero.uid] = Math.max(0, (cooldowns[hero.uid] ?? 0) - elapsedMs);
    if (cooldowns[hero.uid] > 0) continue;

    const role = getFormationRoleForHero(hero);
    const roleTriggerMult = role === 'back' ? 1.22 : role === 'mid' ? 1.05 : 0.92;
    const triggerChance = Math.min(0.16, 0.015 + hero.level * 0.00012) * roleTriggerMult * (elapsedMs / 1000);
    if (Math.random() > triggerChance) continue;

    // Check if hero has unique weapon equipped → use unique skill instead of generic
    const gearProgress = state.heroUniqueGearByHeroId[hero.id];
    const hasUniqueEquipped = gearProgress && gearProgress.equippedByUid === hero.uid;
    const uniqueSkill = hasUniqueEquipped ? getHeroUniqueSkillParams(hero.id, gearProgress.rank) : null;

    if (uniqueSkill) {
      // ── Unique weapon skill ──────────────────────────────────────────
      const weaponName = getHeroUniqueWeaponName(hero.id);
      const profile = uniqueSkill;

      switch (profile.type) {
        case 'shield_wall':
          nextState = {
            ...nextState,
            damageReductionBuffPct: Math.max(nextState.damageReductionBuffPct, profile.power),
            damageReductionBuffMs: Math.max(nextState.damageReductionBuffMs, profile.durationMs),
          };
          nextState = queueCombatLog(
            nextState,
            `${hero.emoji} ${hero.name} raised ${weaponName} — Shield Wall! (${Math.round(profile.power * 100)}% DR)`,
          );
          break;

        case 'execute': {
          const missingHp = nextState.monsterMaxHp - nextState.monsterHp;
          const executeDmg = Math.ceil(missingHp * profile.power);
          nextState = {
            ...nextState,
            monsterHp: Math.max(1, nextState.monsterHp - executeDmg),
          };
          nextState = queueCombatLog(nextState, `${hero.emoji} ${hero.name} — Execute! ${executeDmg} dmg`);
          break;
        }

        case 'rallying_cry': {
          const heal = Math.ceil(nextState.teamMaxHp * profile.power);
          nextState = {
            ...nextState,
            damageBuffPct: Math.max(nextState.damageBuffPct, profile.power),
            damageBuffMs: Math.max(nextState.damageBuffMs, profile.durationMs),
            teamHp: Math.min(nextState.teamMaxHp, nextState.teamHp + heal),
          };
          nextState = queueCombatLog(
            nextState,
            `${hero.emoji} ${hero.name} — Rallying Cry! +${Math.round(profile.power * 100)}% DPS & healed ${heal}`,
          );
          break;
        }

        case 'soul_drain': {
          const drainDmg = Math.ceil(nextState.monsterMaxHp * profile.power);
          const selfHeal = Math.ceil(nextState.teamMaxHp * profile.power * 0.5);
          nextState = {
            ...nextState,
            monsterHp: Math.max(1, nextState.monsterHp - drainDmg),
            teamHp: Math.min(nextState.teamMaxHp, nextState.teamHp + selfHeal),
          };
          nextState = queueCombatLog(
            nextState,
            `${hero.emoji} ${hero.name} — Soul Drain! ${drainDmg} dmg, healed ${selfHeal}`,
          );
          break;
        }

        case 'crit_storm': {
          const hitDmg = Math.ceil(nextState.monsterMaxHp * profile.power);
          const totalDmg = hitDmg * 5;
          nextState = {
            ...nextState,
            monsterHp: Math.max(1, nextState.monsterHp - totalDmg),
          };
          nextState = queueCombatLog(
            nextState,
            `${hero.emoji} ${hero.name} — Crit Storm! 5×${hitDmg} = ${totalDmg} dmg`,
          );
          break;
        }

        case 'mark_prey':
          nextState = {
            ...nextState,
            damageBuffPct: Math.max(nextState.damageBuffPct, profile.power),
            damageBuffMs: Math.max(nextState.damageBuffMs, profile.durationMs),
          };
          nextState = queueCombatLog(
            nextState,
            `${hero.emoji} ${hero.name} — Mark Prey! Enemy takes +${Math.round(profile.power * 100)}% dmg`,
          );
          break;

        case 'chain_lightning': {
          const burstDmg = Math.ceil(nextState.monsterMaxHp * profile.power);
          nextState = {
            ...nextState,
            monsterHp: Math.max(1, nextState.monsterHp - burstDmg),
            damageBuffPct: Math.max(nextState.damageBuffPct, profile.power * 0.6),
            damageBuffMs: Math.max(nextState.damageBuffMs, profile.durationMs),
          };
          nextState = queueCombatLog(
            nextState,
            `${hero.emoji} ${hero.name} — Chain Lightning! ${burstDmg} burst + DPS up`,
          );
          break;
        }

        case 'barrier_pulse': {
          const bHeal = Math.ceil(nextState.teamMaxHp * profile.power);
          nextState = {
            ...nextState,
            teamHp: Math.min(nextState.teamMaxHp, nextState.teamHp + bHeal),
            damageReductionBuffPct: Math.max(nextState.damageReductionBuffPct, profile.power * 0.5),
            damageReductionBuffMs: Math.max(nextState.damageReductionBuffMs, profile.durationMs),
          };
          nextState = queueCombatLog(nextState, `${hero.emoji} ${hero.name} — Barrier Pulse! +${bHeal} HP & shield`);
          break;
        }

        case 'armor_shred':
          nextState = {
            ...nextState,
            damageBuffPct: Math.max(nextState.damageBuffPct, profile.power),
            damageBuffMs: Math.max(nextState.damageBuffMs, profile.durationMs),
          };
          nextState = queueCombatLog(
            nextState,
            `${hero.emoji} ${hero.name} — Armor Shred! Team DPS +${Math.round(profile.power * 100)}%`,
          );
          break;

        case 'overcharge': {
          const overDmg = Math.ceil(nextState.monsterMaxHp * profile.power);
          nextState = {
            ...nextState,
            monsterHp: Math.max(1, nextState.monsterHp - overDmg),
          };
          nextState = queueCombatLog(nextState, `${hero.emoji} ${hero.name} — Overcharge! ${overDmg} massive hit`);
          break;
        }
      }

      cooldowns[hero.uid] = profile.cooldownMs;
    } else {
      // ── Generic archetype skill (no unique weapon) ───────────────────
      const archetype: HeroActiveSkillArchetypeId = hero.activeSkillArchetype;
      const info = getHeroActiveArchetypeInfo(archetype);

      if (archetype === 'frontline_ward') {
        nextState = {
          ...nextState,
          damageReductionBuffPct: Math.max(nextState.damageReductionBuffPct, 0.2),
          damageReductionBuffMs: Math.max(nextState.damageReductionBuffMs, 3500),
        };
        nextState = queueCombatLog(nextState, `${hero.emoji} ${hero.name} cast ${info.name} (team guard up)`);
      }

      if (archetype === 'burst_volley') {
        const burst = Math.ceil(nextState.monsterMaxHp * 0.08);
        nextState = {
          ...nextState,
          monsterHp: Math.max(1, nextState.monsterHp - burst),
        };
        nextState = queueCombatLog(nextState, `${hero.emoji} ${hero.name} used ${info.name} for ${burst} burst`);
      }

      if (archetype === 'battle_chant') {
        nextState = {
          ...nextState,
          damageBuffPct: Math.max(nextState.damageBuffPct, 0.18),
          damageBuffMs: Math.max(nextState.damageBuffMs, 4200),
        };
        nextState = queueCombatLog(nextState, `${hero.emoji} ${hero.name} activated ${info.name} (+DPS)`);
      }

      if (archetype === 'mending_pulse') {
        const healFrac = MENDING_PULSE_BASE_HEAL + hero.level * MENDING_PULSE_LEVEL_SCALE;
        const heal = Math.ceil(nextState.teamMaxHp * Math.min(healFrac, 0.25));
        nextState = {
          ...nextState,
          teamHp: Math.min(nextState.teamMaxHp, nextState.teamHp + heal),
        };
        nextState = queueCombatLog(nextState, `${hero.emoji} ${hero.name} triggered ${info.name} (+${heal} HP)`);
      }

      cooldowns[hero.uid] = ACTIVE_SKILL_COOLDOWN_MS[archetype];
    }
  }

  return {
    ...nextState,
    heroActiveCdMs: cooldowns,
  };
}

function getTeamMaxHp(state: GameState): number {
  // Player character HP
  const playerStats = derivedStats(state);
  let maxHp = (playerStats.vitality + 5) * 10;

  // Active team heroes HP
  const activeTeam = new Set(state.activeTeamHeroIds);
  for (const hero of state.heroRoster) {
    if (activeTeam.has(hero.uid)) {
      const heroClass = getClassConfig(hero.heroClass);
      const rankMult = getRankMultiplier(hero.rank, hero.rarity);
      const statMult = Math.max(1, hero.rebirthStatMult ?? 1);
      const heroVit = (heroClass.baseStats.vitality + hero.level * 0.8) * rankMult * statMult;
      maxHp += (heroVit + 3) * 8;
    }
  }

  const survivalMult = getMetaSurvivalMultiplier(state);
  const formation = getFormationMultipliers(state);
  const synergy = getTeamSynergy(state);
  const masteryLevel = getClassMasteryLevel(state, state.playerClass);
  const masteryHpMult = 1 + Math.min(0.25, Math.floor(masteryLevel / 4) * 0.02);
  const tacticsPowerMult = getTacticsPowerMultiplier(state);
  return Math.ceil(
    maxHp *
      survivalMult *
      getRebirthSurvivalMultiplier(state) *
      formation.hpMult *
      synergy.hpMult *
      masteryHpMult *
      tacticsPowerMult,
  );
}

function getTeamDefense(state: GameState): number {
  // Damage reduction based on team defense stats
  const playerStats = derivedStats(state);
  let defense = playerStats.vitality * 0.3 + playerStats.spirit * 0.15;

  const activeTeam = new Set(state.activeTeamHeroIds);
  for (const hero of state.heroRoster) {
    if (activeTeam.has(hero.uid)) {
      const heroClass = getClassConfig(hero.heroClass);
      const rankMult = getRankMultiplier(hero.rank, hero.rarity);
      const statMult = Math.max(1, hero.rebirthStatMult ?? 1);
      const heroVit = (heroClass.baseStats.vitality + hero.level * 0.8) * rankMult * statMult;
      const heroSpirit = (heroClass.baseStats.spirit + hero.level * 0.5) * rankMult * statMult;
      defense += heroVit * 0.2 + heroSpirit * 0.1;
    }
  }

  const formation = getFormationMultipliers(state);
  const synergy = getTeamSynergy(state);
  const tacticsPowerMult = getTacticsPowerMultiplier(state);
  return Math.max(
    0,
    defense *
      getMetaSurvivalMultiplier(state) *
      getRebirthSurvivalMultiplier(state) *
      formation.hpMult *
      synergy.hpMult *
      tacticsPowerMult,
  );
}

export function getDpsBreakdown(state: GameState): {
  playerBaseDps: number;
  heroBaseDps: number;
  multipliers: {
    rebirthLegacy: number;
    achievementLegacy: number;
    metaDamage: number;
    rebirthDamagePath: number;
    tacticsFacility: number;
    classPassive: number;
    heroPassives: number;
    formation: number;
    synergy: number;
    mastery: number;
    vipDamage: number;
    uniqueRelics: number;
    temporaryBuff: number;
    teamBoost: number;
  };
  totalMultiplier: number;
  finalDps: number;
} {
  const cls = getClassConfig(state.playerClass ?? 'warrior');
  const stats = derivedStats(state);
  const rebirthMult = Math.pow(REBIRTH_BONUS, state.prestigeCount);

  // Player damage contribution
  const physical = stats.strength * 3.2 + stats.agility * (1.6 + cls.physWeight * 0.95) + state.level * 1.6;
  const magic =
    stats.intelligence * (2 + cls.magicWeight * 1.2) +
    stats.spirit * (1.3 + cls.magicWeight * 0.75) +
    state.level * 1.2;

  const playerDps = (physical * cls.physWeight * 0.72 + magic * cls.magicWeight * 0.52) / 1.85;

  // Active team heroes damage (V2: per-hero stats via tier + class profile + variance)
  let heroDps = 0;
  const activeTeam = new Set(state.activeTeamHeroIds);
  for (const hero of state.heroRoster) {
    if (activeTeam.has(hero.uid)) {
      const heroClass = getClassConfig(hero.heroClass);
      const template = HERO_TEMPLATE_MAP.get(hero.id);
      const rankMult = getRankMultiplier(hero.rank, hero.rarity);
      const statMult = Math.max(1, hero.rebirthStatMult ?? 1);

      let heroStr: number, heroInt: number, heroAgi: number, heroSpr: number;
      if (template) {
        const hp = getHeroStatProfile(template);
        heroStr = (hp.baseStats.str + hero.level * hp.statGrowth.str) * rankMult * statMult;
        heroInt = (hp.baseStats.int + hero.level * hp.statGrowth.int) * rankMult * statMult;
        heroAgi = (hp.baseStats.agi + hero.level * hp.statGrowth.agi) * rankMult * statMult;
        heroSpr = (hp.baseStats.spr + hero.level * hp.statGrowth.spr) * rankMult * statMult;
      } else {
        heroStr = (heroClass.baseStats.strength + hero.level * 0.9) * rankMult * statMult;
        heroInt = (heroClass.baseStats.intelligence + hero.level * 0.85) * rankMult * statMult;
        heroAgi = (heroClass.baseStats.agility + hero.level * 0.7) * rankMult * statMult;
        heroSpr = (heroClass.baseStats.spirit + hero.level * 0.6) * rankMult * statMult;
      }

      const heroPhy = heroStr * 2 + heroAgi * 1.2 + hero.level * 0.5;
      const heroMag = heroInt * 2 + heroSpr * 1.1;

      const heroDmg = (heroPhy * heroClass.physWeight * 0.4 + heroMag * heroClass.magicWeight * 0.3) / 2;
      heroDps += heroDmg;
    }
  }

  const passive = state.playerClass ? getClassPassive(state.playerClass) : null;
  const classPassiveMult = hasUnlock(state, 'class_passive') && passive ? passive.dpsMultiplier : 1;
  const heroPassive = getHeroPassiveMultipliers(state);
  const activeBuffMult = 1 + state.damageBuffPct;
  const formation = getFormationMultipliers(state);
  const synergy = getTeamSynergy(state);
  const masteryLevel = getClassMasteryLevel(state, state.playerClass);
  const masteryDpsMult = 1 + Math.min(0.4, masteryLevel * 0.01);
  const vipDamageMult = getVipDamageMultiplier(state);
  const tacticsPowerMult = getTacticsPowerMultiplier(state);
  const uniqueSkillMult = getActiveUniqueSkillMultipliers(state).dpsMult;
  const teamBoostMult = 1 + getTeamHeroBoost(state);
  const multipliers = {
    rebirthLegacy: rebirthMult,
    achievementLegacy: getAchievementBonusMultiplier(state),
    metaDamage: getMetaDamageMultiplier(state),
    rebirthDamagePath: getRebirthDamageMultiplier(state),
    tacticsFacility: tacticsPowerMult,
    classPassive: classPassiveMult,
    heroPassives: heroPassive.dpsMult,
    formation: formation.dpsMult,
    synergy: synergy.dpsMult,
    mastery: masteryDpsMult,
    vipDamage: vipDamageMult,
    uniqueRelics: uniqueSkillMult,
    temporaryBuff: activeBuffMult,
    teamBoost: teamBoostMult,
  };
  const totalMultiplier = safeMultiplier(
    multipliers.rebirthLegacy *
      multipliers.achievementLegacy *
      multipliers.metaDamage *
      multipliers.rebirthDamagePath *
      multipliers.tacticsFacility *
      multipliers.classPassive *
      multipliers.heroPassives *
      multipliers.formation *
      multipliers.synergy *
      multipliers.mastery *
      multipliers.vipDamage *
      multipliers.uniqueRelics *
      multipliers.temporaryBuff *
      multipliers.teamBoost,
  );
  const rawDps = (playerDps + heroDps) * totalMultiplier;
  const finalDps = Number.isFinite(rawDps) ? Math.max(1, rawDps) : 1;
  return {
    playerBaseDps: Math.max(0, playerDps),
    heroBaseDps: Math.max(0, heroDps),
    multipliers,
    totalMultiplier,
    finalDps,
  };
}

function getDps(state: GameState): number {
  return getDpsBreakdown(state).finalDps;
}

function getAchievementBonusMultiplier(state: GameState): number {
  const pct = state.achievements.size * ACHIEVEMENT_BONUS_PER_UNLOCK;
  return 1 + pct;
}

function getVipLevelFromPoints(points: number): number {
  const safePoints = Math.max(0, Math.floor(points));
  for (let level = 10; level >= 1; level--) {
    if (safePoints >= VIP_LEVEL_THRESHOLDS[level]) return level;
  }
  return 0;
}

function getVipDamageMultiplier(state: GameState): number {
  return 1 + state.vipLevel * VIP_DAMAGE_PER_LEVEL;
}

function getVipGoldMultiplier(state: GameState): number {
  return 1 + state.vipLevel * VIP_GOLD_PER_LEVEL;
}

function getVipExpMultiplier(state: GameState): number {
  return 1 + state.vipLevel * VIP_EXP_PER_LEVEL;
}

function getUsableProgressScale(state: GameState): number {
  const levelFactor = 1 + Math.pow(Math.max(1, state.level), 0.32) * 0.35;
  const waveFactor = 1 + Math.log10(Math.max(10, state.highestWaveReached + 9)) * 0.8;
  const prestigeFactor = 1 + state.prestigeCount * 0.12;
  return levelFactor * waveFactor * prestigeFactor;
}

function getScaledUsableGoldGain(state: GameState, baseValue: number, itemType: 'basic' | 'advanced'): number {
  const scaledBase = Math.ceil(baseValue * getUsableProgressScale(state) * getVipGoldMultiplier(state));
  const waveFloor = Math.ceil(
    getMonsterGold(Math.max(1, state.highestWaveReached)) * (itemType === 'advanced' ? 8 : 3),
  );

  if (!Number.isFinite(scaledBase) && !Number.isFinite(waveFloor)) {
    return 1;
  }

  const safeScaledBase = Number.isFinite(scaledBase) ? scaledBase : 0;
  const safeWaveFloor = Number.isFinite(waveFloor) ? waveFloor : 0;
  return Math.max(1, Math.floor(Math.max(safeScaledBase, safeWaveFloor)));
}

function getScaledUsableExpGain(state: GameState, baseValue: number, itemType: 'basic' | 'advanced'): number {
  const scaledBase = Math.ceil(
    baseValue * getUsableProgressScale(state) * getAchievementBonusMultiplier(state) * getVipExpMultiplier(state),
  );
  const waveFloor = Math.ceil(getMonsterExp(Math.max(1, state.highestWaveReached)) * (itemType === 'advanced' ? 6 : 2));

  if (!Number.isFinite(scaledBase) && !Number.isFinite(waveFloor)) {
    return 1;
  }

  const safeScaledBase = Number.isFinite(scaledBase) ? scaledBase : 0;
  const safeWaveFloor = Number.isFinite(waveFloor) ? waveFloor : 0;
  return Math.max(1, Math.floor(Math.max(safeScaledBase, safeWaveFloor)));
}

function getScaledUsableShardGain(state: GameState, baseValue: number, itemType: 'basic' | 'advanced'): number {
  const weekly = getCurrentWeeklyEvent(state);
  const scaledBase = Math.ceil(baseValue * getUsableProgressScale(state) * weekly.shardMultiplier);
  const syntheticHeroLevel = Math.max(1, Math.floor(state.level + Math.sqrt(Math.max(1, state.highestWaveReached))));
  const waveFloor = Math.ceil(calculateShardReward('rare', syntheticHeroLevel) * (itemType === 'advanced' ? 2.5 : 1.2));

  if (!Number.isFinite(scaledBase) && !Number.isFinite(waveFloor)) {
    return 1;
  }

  const safeScaledBase = Number.isFinite(scaledBase) ? scaledBase : 0;
  const safeWaveFloor = Number.isFinite(waveFloor) ? waveFloor : 0;
  return Math.max(1, Math.floor(Math.max(safeScaledBase, safeWaveFloor)));
}

function getScaledUsableHeatReduction(state: GameState, baseValue: number, itemType: 'basic' | 'advanced'): number {
  const maxHeat = getMaxHeatForLevel(state.level);
  const pctFloor = itemType === 'advanced' ? 0.22 : 0.1;
  return Math.max(Math.ceil(baseValue), Math.ceil(maxHeat * pctFloor));
}

/** Returns a dynamic description for a usable item with actual scaled values. */
export function getUsableItemDescription(state: GameState, item: UsableItem): string {
  switch (item.effect) {
    case 'heal_team_percent':
      return `Restore ${Math.round(item.value * 100)}% team HP instantly.`;
    case 'gain_gold_flat': {
      const gain = getScaledUsableGoldGain(state, item.value, item.itemType);
      return `Instantly grants ${fmt(gain)} gold.`;
    }
    case 'gain_exp_flat': {
      const gain = getScaledUsableExpGain(state, item.value, item.itemType);
      return `Instantly grants ${fmt(gain)} EXP.`;
    }
    case 'gain_shards_flat': {
      const gain = getScaledUsableShardGain(state, item.value, item.itemType);
      return `Instantly grants ${fmt(gain)} hero shards.`;
    }
    case 'reduce_heat_flat': {
      const reduction = getScaledUsableHeatReduction(state, item.value, item.itemType);
      return `Reduce combat heat by ${fmt(reduction)}.`;
    }
    default:
      return item.description;
  }
}

function canUseTempo4(state: Pick<GameState, 'vipLevel'>): boolean {
  return (state.vipLevel ?? 0) >= 1;
}

function clampCombatTempoForVip(tempo: CombatTempo, state: Pick<GameState, 'vipLevel'>): CombatTempo {
  if (tempo === 4 && !canUseTempo4(state)) return 1;
  return tempo;
}

function clampAutoTempoTargetForVip(target: AutoTempoTarget, state: Pick<GameState, 'vipLevel'>): AutoTempoTarget {
  if (target === 4 && !canUseTempo4(state)) return 2;
  return target;
}

function hasUnlock(state: GameState, unlock: PermanentUnlockId): boolean {
  return state.permanentUnlocks.includes(unlock);
}

function getMetaDamageMultiplier(state: GameState): number {
  return 1 + state.metaDamageLevel * 0.05;
}

function getMetaEconomyMultiplier(state: GameState): number {
  return 1 + state.metaEconomyLevel * 0.05;
}

function getMetaSurvivalMultiplier(state: GameState): number {
  return 1 + state.metaSurvivalLevel * 0.05;
}

function getEssenceUpgradeCost(level: number): number {
  return 20 + (level + 1) * (level + 1) * 12;
}

function getRebirthPathCost(level: number): number {
  return 1 + Math.floor(level * 0.8) + Math.floor((level * level) / 8);
}

function getRebirthDamageMultiplier(state: GameState): number {
  return 1 + state.rebirthDamagePath * 0.07;
}

function getRebirthEconomyMultiplier(state: GameState): number {
  return 1 + state.rebirthEconomyPath * 0.07;
}

function getRebirthSurvivalMultiplier(state: GameState): number {
  return 1 + state.rebirthSurvivalPath * 0.07;
}

const EQUIP_RARITY_ORDER: Array<ReturnType<typeof equipmentRarityConfig>['id']> = [
  'common',
  'rare',
  'epic',
  'legendary',
  'mythic',
  'transcendent',
];

/** Gold cost to manually level a hero from `level` to `level+1` via gold. */
export function getHeroGoldLevelCost(level: number): number {
  return Math.floor(100 * Math.pow(1.08, level - 1));
}

export function getEquipmentCraftCost(slot: EquipmentSlot): { scrap: number; gold: number } {
  const costBySlot: Record<EquipmentSlot, { scrap: number; gold: number }> = {
    weapon: { scrap: 130, gold: 1800 },
    armor: { scrap: 120, gold: 1500 },
    accessory: { scrap: 100, gold: 1200 },
  };
  return costBySlot[slot];
}

function getEquipmentUpgradePlan(
  state: GameState,
  itemId: string,
): {
  canUpgrade: boolean;
  targetItemId: string | null;
  targetRarity: ReturnType<typeof equipmentRarityConfig>['id'] | null;
  scrapCost: number;
  essenceCost: number;
  goldCost: number;
  reason?: string;
} {
  const ownedItem = getEquipmentEntry(state, itemId);
  const item = ownedItem && 'baseItemId' in ownedItem ? getEquipmentItem(ownedItem.baseItemId) : ownedItem;
  if (!item) {
    return {
      canUpgrade: false,
      targetItemId: null,
      targetRarity: null,
      scrapCost: 0,
      essenceCost: 0,
      goldCost: 0,
      reason: 'Missing item',
    };
  }

  const idx = EQUIP_RARITY_ORDER.indexOf(item.rarity);
  if (idx < 0 || idx >= EQUIP_RARITY_ORDER.length - 1) {
    return {
      canUpgrade: false,
      targetItemId: null,
      targetRarity: null,
      scrapCost: 0,
      essenceCost: 0,
      goldCost: 0,
      reason: 'At max rarity',
    };
  }

  let step = 0;
  for (let i = idx + 1; i < EQUIP_RARITY_ORDER.length; i++) {
    const rarity = EQUIP_RARITY_ORDER[i];
    if (rarity === 'mythic' && !hasUnlock(state, 'mythic_equipment')) {
      return {
        canUpgrade: false,
        targetItemId: null,
        targetRarity: null,
        scrapCost: 0,
        essenceCost: 0,
        goldCost: 0,
        reason: 'Mythic tier locked',
      };
    }
    if (rarity === 'transcendent' && !isPostgameSummonUnlocked(state)) {
      return {
        canUpgrade: false,
        targetItemId: null,
        targetRarity: null,
        scrapCost: 0,
        essenceCost: 0,
        goldCost: 0,
        reason: 'Transcendent tier locked',
      };
    }
    const pool = EQUIPMENT_CATALOG.filter(
      candidate =>
        candidate.slot === item.slot &&
        candidate.rarity === rarity &&
        candidate.allowedClasses.some(cls => item.allowedClasses.includes(cls)),
    );
    step++;
    if (pool.length > 0) {
      const baseCostByRarity: Record<string, { scrap: number; essence: number; gold: number }> = {
        common: { scrap: 80, essence: 0, gold: 1400 },
        rare: { scrap: 170, essence: 4, gold: 4200 },
        epic: { scrap: 300, essence: 8, gold: 12000 },
        legendary: { scrap: 500, essence: 14, gold: 32000 },
        mythic: { scrap: 900, essence: 26, gold: 90000 },
      };
      const base = baseCostByRarity[item.rarity] ?? { scrap: 0, essence: 0, gold: 0 };
      const scrapCost = Math.ceil(base.scrap * (1 + (step - 1) * 0.55));
      const essenceCost = Math.ceil(base.essence * (1 + (step - 1) * 0.5));
      const goldCost = Math.ceil(base.gold * (1 + (step - 1) * 0.75));
      const candidate = pool[Math.floor(Math.random() * pool.length)];
      return {
        canUpgrade: state.equipmentScrap >= scrapCost && state.essence >= essenceCost && state.gold >= goldCost,
        targetItemId: candidate.id,
        targetRarity: rarity,
        scrapCost,
        essenceCost,
        goldCost,
      };
    }
  }

  return {
    canUpgrade: false,
    targetItemId: null,
    targetRarity: null,
    scrapCost: 0,
    essenceCost: 0,
    goldCost: 0,
    reason: 'No higher tier candidate',
  };
}

function getScrapToEssenceCost(state: GameState): number {
  return 600 + state.metaDamageLevel * 40 + state.metaEconomyLevel * 40 + state.metaSurvivalLevel * 40;
}

function getScrapToShardCost(): number {
  return 180;
}

function getCurrentWeeklyEvent(state: GameState): WeeklyEventConfig {
  return getWeeklyEventByWeek(state.weeklyEventWeek);
}

function getMissionProgressValue(state: GameState, mission: MissionBoardGoal): number {
  if (mission.metric === 'wave') return state.wave;
  if (mission.metric === 'kills') return state.totalKills;
  if (mission.metric === 'summons') return state.totalSummons;
  if (mission.metric === 'active_team') return state.activeTeamHeroIds.length;
  if (mission.metric === 'hero_shards') return state.heroShards;
  return state.essence;
}

function getRankMultiplier(rank: number, rarity: Rarity): number {
  return getRankStatMultiplier(rank, rarity);
}

function defaultTraitForClass(playerClass: PlayerClass): HeroPassiveTraitId {
  const map: Record<PlayerClass, HeroPassiveTraitId> = {
    warrior: 'bulwark_instinct',
    berserker: 'warpath_instinct',
    archer: 'fortune_hunter',
    mage: 'sage_instinct',
    monk: 'sage_instinct',
  };
  return map[playerClass];
}

function defaultActiveForClass(playerClass: PlayerClass): HeroActiveSkillArchetypeId {
  const map: Record<PlayerClass, HeroActiveSkillArchetypeId> = {
    warrior: 'frontline_ward',
    berserker: 'battle_chant',
    archer: 'burst_volley',
    mage: 'mending_pulse',
    monk: 'mending_pulse',
  };
  return map[playerClass];
}

function normalizeHero(hero: HeroUnit): HeroUnit {
  return {
    ...hero,
    passiveTrait: hero.passiveTrait ?? defaultTraitForClass(hero.heroClass),
    activeSkillArchetype: hero.activeSkillArchetype ?? defaultActiveForClass(hero.heroClass),
    rebirthStatMult: roundTo4(Math.max(1, hero.rebirthStatMult ?? 1)),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function sanitizeRuntimeEconomyState(state: GameState): GameState {
  const safeGold = clampInt(state.gold, 0, SAFE_INTEGER_CAP, 0);
  const safeDiamonds = clampInt(state.diamonds, 0, SAFE_INTEGER_CAP, 0);
  const safeTotalGold = Math.max(safeGold, clampInt(state.totalGold, 0, SAFE_INTEGER_CAP, safeGold));
  const safeLevel = clampInt(state.level, 1, MAX_SAVE_PLAYER_LEVEL, 1);
  const safeExp = clampInt(state.exp, 0, Math.max(0, expForLevel(safeLevel) - 1), 0);
  const safeTotalExp = Math.max(safeExp, clampInt(state.totalExp, 0, SAFE_INTEGER_CAP, safeExp));
  const safeBossTears = clampInt(state.bossTears, 0, SAFE_INTEGER_CAP, 0);
  const safeHeroShards = clampInt(state.heroShards, 0, SAFE_INTEGER_CAP, 0);
  const safeEssence = clampInt(state.essence, 0, SAFE_INTEGER_CAP, 0);
  const safeScrap = clampInt(state.equipmentScrap, 0, SAFE_INTEGER_CAP, 0);

  if (
    safeGold === state.gold &&
    safeDiamonds === state.diamonds &&
    safeTotalGold === state.totalGold &&
    safeExp === state.exp &&
    safeTotalExp === state.totalExp &&
    safeBossTears === state.bossTears &&
    safeHeroShards === state.heroShards &&
    safeEssence === state.essence &&
    safeScrap === state.equipmentScrap
  ) {
    return state;
  }

  return {
    ...state,
    gold: safeGold,
    diamonds: safeDiamonds,
    totalGold: safeTotalGold,
    exp: safeExp,
    totalExp: safeTotalExp,
    bossTears: safeBossTears,
    heroShards: safeHeroShards,
    essence: safeEssence,
    equipmentScrap: safeScrap,
  };
}

function clampBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clampString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLength);
}

function sanitizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    sanitized.push(trimmed);
    if (sanitized.length >= maxItems) break;
  }

  return sanitized;
}

function sanitizeIntList(value: unknown, maxItems: number): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const sanitized: number[] = [];

  for (const item of value) {
    const parsed = typeof item === 'number' ? item : typeof item === 'string' ? Number(item) : NaN;
    if (!Number.isFinite(parsed)) continue;
    const intVal = Math.floor(parsed);
    if (seen.has(intVal)) continue;
    seen.add(intVal);
    sanitized.push(intVal);
    if (sanitized.length >= maxItems) break;
  }

  return sanitized;
}

function sanitizeMiniOpsCooldownTimestamp(value: unknown, nowMs: number): number | null {
  if (value == null) return null;
  const parsed = clampInt(value, 0, nowMs, 0);
  if (parsed <= 0) return null;

  // Backward compatibility: legacy saves stored a day number here.
  if (parsed < 10_000_000_000) {
    const migratedTs = parsed * 86_400_000;
    return Math.min(nowMs, migratedTs);
  }

  return parsed;
}

function sanitizeStatAllocation(
  raw: unknown,
  level: number,
  savedUnspent?: unknown,
): {
  statsAlloc: StatBlock;
  unspentStatPoints: number;
} {
  const record = isRecord(raw) ? raw : {};
  const levelBudget = Math.max(0, (level - 1) * STAT_POINTS_PER_LEVEL);
  const legacyUnspent = clampInt(savedUnspent, 0, SAFE_INTEGER_CAP, 0);
  const requested: StatBlock = {
    strength: clampInt(record.strength, 0, SAFE_INTEGER_CAP, 0),
    vitality: clampInt(record.vitality, 0, SAFE_INTEGER_CAP, 0),
    agility: clampInt(record.agility, 0, SAFE_INTEGER_CAP, 0),
    intelligence: clampInt(record.intelligence, 0, SAFE_INTEGER_CAP, 0),
    spirit: clampInt(record.spirit, 0, SAFE_INTEGER_CAP, 0),
  };

  const spentTotal =
    requested.strength + requested.vitality + requested.agility + requested.intelligence + requested.spirit;

  // Preserve saved allocations exactly to avoid losing invested stats on schema/balance migrations.
  // If a legacy save exceeds the current level-derived budget, keep the invested distribution and
  // only clamp unspent points to a non-negative value.
  const effectiveBudget = Math.max(levelBudget + legacyUnspent, spentTotal + legacyUnspent);
  const remaining = Math.max(0, effectiveBudget - spentTotal);

  return {
    statsAlloc: requested,
    unspentStatPoints: remaining,
  };
}

function sanitizeLoadedHero(raw: unknown, index: number): HeroUnit | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;

  const template = HERO_POOL.find(hero => hero.id === raw.id);
  if (!template) return null;

  const rarity =
    typeof raw.rarity === 'string' && VALID_RARITIES.has(raw.rarity as Rarity) ? (raw.rarity as Rarity) : 'common';
  const level = clampInt(raw.level, 1, HERO_LEVEL_CAP, 1);
  const rank = clampInt(raw.rank, 1, 10, 1);
  const uid = clampString(raw.uid, `${template.id}_${index}`, 64) || `${template.id}_${index}`;
  const rarityMult = rarityConfig(rarity).boostMultiplier;
  const baseBoost = roundTo4(template.baseTeamBoost * rarityMult);
  const teamBoost = clampFloat(raw.teamBoost, baseBoost, 10, baseBoost);
  const rebirthStatMult = clampFloat(raw.rebirthStatMult, 1, 20, 1);

  return normalizeHero({
    ...template,
    uid,
    rarity,
    level,
    rank,
    teamBoost: roundTo4(teamBoost),
    rebirthStatMult: roundTo4(rebirthStatMult),
  });
}

function sanitizeEquipmentInventoryRecord(raw: unknown, fallbackLevel: number): Record<string, EquipmentInstance> {
  const inventory: Record<string, EquipmentInstance> = {};
  if (!isRecord(raw)) return inventory;

  for (const [instanceId, entry] of Object.entries(raw)) {
    if (!isRecord(entry)) continue;
    const bonusRecord = isRecord(entry.bonus) ? entry.bonus : {};
    const baseItemId = typeof entry.baseItemId === 'string' ? entry.baseItemId : null;
    const baseItem = baseItemId ? getEquipmentItem(baseItemId) : null;
    if (!baseItem) continue;
    const rarity =
      typeof entry.rarity === 'string' && EQUIP_RARITY_ORDER.includes(entry.rarity as EquipmentRarity)
        ? (entry.rarity as EquipmentRarity)
        : baseItem.rarity;
    const source =
      typeof entry.source === 'string' &&
      ['starter', 'drop', 'craft', 'crate', 'upgrade', 'legacy', 'hero_unique'].includes(entry.source)
        ? (entry.source as EquipmentSource)
        : 'legacy';
    inventory[instanceId] = {
      id: instanceId,
      baseItemId: baseItem.id,
      name: clampString(entry.name, baseItem.name, 80) || baseItem.name,
      emoji: clampString(entry.emoji, baseItem.emoji, 4) || baseItem.emoji,
      slot: baseItem.slot,
      rarity,
      allowedClasses: [...baseItem.allowedClasses],
      description: clampString(entry.description, baseItem.description, 160) || baseItem.description,
      bonus: {
        strength: clampInt(bonusRecord.strength, 0, SAFE_INTEGER_CAP, 0),
        vitality: clampInt(bonusRecord.vitality, 0, SAFE_INTEGER_CAP, 0),
        agility: clampInt(bonusRecord.agility, 0, SAFE_INTEGER_CAP, 0),
        intelligence: clampInt(bonusRecord.intelligence, 0, SAFE_INTEGER_CAP, 0),
        spirit: clampInt(bonusRecord.spirit, 0, SAFE_INTEGER_CAP, 0),
      },
      itemLevel: clampInt(entry.itemLevel, 1, MAX_SAVE_PLAYER_LEVEL, fallbackLevel),
      source,
    };
  }

  return inventory;
}

export function sanitizeSaveData(payload: Partial<SaveData>) {
  const incomingVersion = typeof payload.saveVersion === 'number' ? payload.saveVersion : 0;
  if (incomingVersion < SAVE_SCHEMA_VERSION) {
    debugLog('save', `Migrating save from v${incomingVersion} to v${SAVE_SCHEMA_VERSION}`);
  }
  const now = Date.now();
  const currentWeek = weekNumberForTimestamp(now);
  const currentDay = toDayNumber(now);
  const playerName = clampString(payload.playerName, '', 24);
  const playerClass =
    typeof payload.playerClass === 'string' && VALID_PLAYER_CLASSES.has(payload.playerClass as PlayerClass)
      ? (payload.playerClass as PlayerClass)
      : null;
  const characterCreated = clampBoolean(payload.characterCreated, false) && !!playerName && playerClass !== null;
  const level = clampInt(payload.level, 1, MAX_SAVE_PLAYER_LEVEL, 1);
  const maxHeat = getMaxHeatForLevel(level);
  const wave = clampInt(payload.wave, 1, MAX_SAVE_WAVE, 1);
  const highestWaveReached = Math.max(
    wave,
    clampInt(payload.highestWaveReached ?? payload.highestLevelReached, 1, MAX_SAVE_WAVE, 1),
  );
  const { statsAlloc, unspentStatPoints } = sanitizeStatAllocation(
    payload.statsAlloc,
    level,
    payload.unspentStatPoints,
  );
  const maxMonsterHp = getMonsterMaxHp(wave);
  const monsterHp = clampFloat(payload.monsterHp, 0, maxMonsterHp, maxMonsterHp);
  const teamMaxHp = Math.max(100, clampInt(payload.teamHp, 1, SAFE_INTEGER_CAP, 100));
  const teamHp = clampFloat(payload.teamHp, 0, teamMaxHp, teamMaxHp);

  const skills = sanitizeStringList(payload.skills, VALID_SKILL_IDS.size).filter(skillId =>
    VALID_SKILL_IDS.has(skillId),
  );

  const heroRoster: HeroUnit[] = [];
  const heroUidSet = new Set<string>();
  if (Array.isArray(payload.heroRoster)) {
    for (const [index, rawHero] of payload.heroRoster.entries()) {
      if (heroRoster.length >= MAX_SAVE_COLLECTION) break;
      const hero = sanitizeLoadedHero(rawHero, index);
      if (!hero || heroUidSet.has(hero.uid)) continue;
      heroUidSet.add(hero.uid);
      heroRoster.push(hero);
    }
  }

  const rawActiveTeamHeroIds = sanitizeStringList(payload.activeTeamHeroIds, ACTIVE_TEAM_SIZE)
    .filter(uid => heroUidSet.has(uid))
    .slice(0, ACTIVE_TEAM_SIZE);

  const rawTeamLoadouts = Array.isArray(payload.teamLoadouts)
    ? payload.teamLoadouts.slice(0, 3).map(loadout =>
        sanitizeStringList(loadout, ACTIVE_TEAM_SIZE)
          .filter(uid => heroUidSet.has(uid))
          .slice(0, ACTIVE_TEAM_SIZE),
      )
    : [];
  while (rawTeamLoadouts.length < 3) rawTeamLoadouts.push([]);

  const heroFormationByUid: Record<string, HeroFormationRole> = {};
  if (isRecord(payload.heroFormationByUid)) {
    for (const uid of Object.keys(payload.heroFormationByUid)) {
      if (!heroUidSet.has(uid)) continue;
      const role = payload.heroFormationByUid[uid];
      if (typeof role !== 'string' || !VALID_HERO_FORMATION_ROLES.has(role as HeroFormationRole)) continue;
      // Strip roles that are invalid for the hero's class
      const hero = heroRoster.find(h => h.uid === uid);
      if (!hero) continue;
      const validRoles = VALID_FORMATION_ROLES_FOR_CLASS[hero.heroClass];
      if (validRoles.includes(role as HeroFormationRole)) {
        heroFormationByUid[uid] = role as HeroFormationRole;
      }
    }
  }

  const heroUniqueGearByHeroId: Record<string, HeroUniqueGearProgress> = {};
  if (isRecord(payload.heroUniqueGearByHeroId)) {
    for (const [heroId, raw] of Object.entries(payload.heroUniqueGearByHeroId)) {
      if (!VALID_HERO_TEMPLATE_IDS.has(heroId)) continue;
      const rank = isRecord(raw) ? clampInt(raw.rank, 1, 10, 1) : clampInt(raw, 1, 10, 1);
      const shouldBeEquipped = isRecord(raw)
        ? typeof raw.equippedByUid === 'string'
          ? raw.equippedByUid.length > 0
          : clampBoolean(raw.equipped, true)
        : true;
      const equippedByUid = shouldBeEquipped ? (getPreferredUniqueBearer({ heroRoster }, heroId)?.uid ?? null) : null;
      heroUniqueGearByHeroId[heroId] = { rank, equippedByUid };
    }
  }

  const teamSlotsUnlocked = clampInt(payload.teamSlotsUnlocked, 4, ACTIVE_TEAM_SIZE, 4);
  const teamRuleView = {
    heroRoster,
    heroFormationByUid,
    teamSlotsUnlocked,
  };
  const activeTeamHeroIds = normalizeTeamSelectionByRules(teamRuleView, rawActiveTeamHeroIds);
  const teamLoadouts = rawTeamLoadouts.map(loadout => normalizeTeamSelectionByRules(teamRuleView, loadout));

  const classMasteryXp = {
    warrior: clampInt(payload.classMasteryXp?.warrior, 0, SAFE_INTEGER_CAP, 0),
    berserker: clampInt(payload.classMasteryXp?.berserker, 0, SAFE_INTEGER_CAP, 0),
    archer: clampInt(payload.classMasteryXp?.archer, 0, SAFE_INTEGER_CAP, 0),
    mage: clampInt(payload.classMasteryXp?.mage, 0, SAFE_INTEGER_CAP, 0),
    monk: clampInt(payload.classMasteryXp?.monk, 0, SAFE_INTEGER_CAP, 0),
  };

  const equipmentInventory = sanitizeEquipmentInventoryRecord(payload.equipmentInventory, level);

  const rawInventoryItemIds = sanitizeStringList(payload.inventoryItemIds, MAX_SAVE_COLLECTION).filter(
    itemId => !!equipmentInventory[itemId] || !!getEquipmentItem(itemId),
  );

  const equippedItems = {
    weapon: null as string | null,
    armor: null as string | null,
    accessory: null as string | null,
  };
  for (const slot of ['weapon', 'armor', 'accessory'] as EquipmentSlot[]) {
    const itemId = payload.equippedItems?.[slot];
    if (typeof itemId !== 'string') continue;
    const item = equipmentInventory[itemId] ?? getEquipmentItem(itemId);
    if (!item || item.slot !== slot || !rawInventoryItemIds.includes(itemId)) continue;
    equippedItems[slot] = itemId;
  }
  const {
    inventoryItemIds,
    equippedItems: migratedEquippedItems,
    equipmentInventory: migratedEquipmentInventory,
    migratedCount,
    droppedCount,
  } = migrateLegacyEquipmentIds(rawInventoryItemIds, equippedItems, equipmentInventory, level);
  if (migratedCount > 0 || droppedCount > 0) {
    debugLog('equipment', `Migration: ${migratedCount} migrated, ${droppedCount} dropped (unrecognized)`);
  }
  const cleanedEquipmentInventory = Object.fromEntries(
    Object.entries(migratedEquipmentInventory).filter(([, item]) => item.source !== 'hero_unique'),
  ) as Record<string, EquipmentInstance>;
  const cleanedInventoryItemIds = inventoryItemIds.filter(itemId => {
    if (itemId.startsWith('hero_unique_')) return false;
    const entry = migratedEquipmentInventory[itemId];
    return !entry || entry.source !== 'hero_unique';
  });
  const cleanedEquippedItems = {
    weapon:
      migratedEquippedItems.weapon && cleanedInventoryItemIds.includes(migratedEquippedItems.weapon)
        ? migratedEquippedItems.weapon
        : null,
    armor:
      migratedEquippedItems.armor && cleanedInventoryItemIds.includes(migratedEquippedItems.armor)
        ? migratedEquippedItems.armor
        : null,
    accessory:
      migratedEquippedItems.accessory && cleanedInventoryItemIds.includes(migratedEquippedItems.accessory)
        ? migratedEquippedItems.accessory
        : null,
  };

  const usableItemCounts: Record<string, number> = {};
  if (isRecord(payload.usableItemCounts)) {
    for (const [itemId, count] of Object.entries(payload.usableItemCounts)) {
      if (!getUsableItem(itemId)) continue;
      const sanitizedCount = clampInt(count, 0, SAFE_INTEGER_CAP, 0);
      if (sanitizedCount > 0) {
        usableItemCounts[itemId] = sanitizedCount;
      }
    }
  }

  const summonHistory = Array.isArray(payload.summonHistory)
    ? payload.summonHistory
        .slice(0, MAX_SAVE_SUMMON_HISTORY)
        .filter((entry): entry is SummonHistoryEntry => isRecord(entry))
        .map((entry, index) => ({
          id: clampString(entry.id, `summon_${index}`, 64) || `summon_${index}`,
          heroName: clampString(entry.heroName, 'Unknown Hero', 64),
          heroEmoji: clampString(entry.heroEmoji, '🛡️', 4),
          rarity:
            typeof entry.rarity === 'string' && VALID_RARITIES.has(entry.rarity as Rarity)
              ? (entry.rarity as Rarity)
              : 'common',
          ts: clampInt(entry.ts, 0, now, now),
          pityTriggered: clampBoolean(entry.pityTriggered, false),
        }))
    : [];

  const weeklyEventWeek = clampInt(payload.weeklyEventWeek, 0, 1_000_000, currentWeek);
  const weeklyEventId = getWeeklyEventByWeek(weeklyEventWeek).id;
  const seasonPoints = clampInt(payload.seasonPoints, 0, SAFE_INTEGER_CAP, 0);
  const bestSeasonPoints = Math.max(seasonPoints, clampInt(payload.bestSeasonPoints, 0, SAFE_INTEGER_CAP, 0));
  const autoSummonMode: 'single' | 'x10' = payload.autoSummonMode === 'x10' ? 'x10' : 'single';
  const heroActiveCdMs = Object.fromEntries(
    Object.entries(isRecord(payload.heroActiveCdMs) ? payload.heroActiveCdMs : {})
      .filter(([uid]) => heroUidSet.has(uid))
      .map(([uid, ms]) => [uid, clampInt(ms, 0, 600_000, 0)] as const)
      .filter((entry): entry is readonly [string, number] => entry[1] > 0),
  );

  const guildhallFacilities = {
    training: { level: clampInt(payload.guildhallFacilities?.training?.level, 0, FACILITY_MAX_LEVEL, 0) },
    treasury: { level: clampInt(payload.guildhallFacilities?.treasury?.level, 0, FACILITY_MAX_LEVEL, 0) },
    forge: { level: clampInt(payload.guildhallFacilities?.forge?.level, 0, FACILITY_MAX_LEVEL, 0) },
    tactics: { level: clampInt(payload.guildhallFacilities?.tactics?.level, 0, FACILITY_MAX_LEVEL, 0) },
  };

  const validExpeditionTypes = new Set(['artifact', 'merchant', 'ruins', 'vault', 'abyss']);
  const validExpeditionRarities = new Set(['common', 'rare', 'epic', 'legendary', 'godly']);
  const expeditionQueue: GameState['expeditionQueue'] = Array.isArray(payload.expeditionQueue)
    ? payload.expeditionQueue
        .filter((entry): entry is Record<string, unknown> => isRecord(entry))
        .slice(0, 20)
        .map((entry, index) => {
          const type: GameState['expeditionQueue'][number]['type'] =
            typeof entry.type === 'string' && validExpeditionTypes.has(entry.type)
              ? (entry.type as GameState['expeditionQueue'][number]['type'])
              : 'artifact';
          const rarity: GameState['expeditionQueue'][number]['rarity'] =
            typeof entry.rarity === 'string' && validExpeditionRarities.has(entry.rarity)
              ? (entry.rarity as GameState['expeditionQueue'][number]['rarity'])
              : 'common';
          const reward = isRecord(entry.reward) ? entry.reward : {};
          return {
            id: clampString(entry.id, `exp_${index}`, 64),
            type,
            rarity,
            startTime: clampInt(entry.startTime, 0, now, now),
            durationMs: clampInt(entry.durationMs, 1_000, 7 * 24 * 60 * 60 * 1000, 30_000),
            reward: {
              diamonds: clampInt(reward.diamonds, 0, SAFE_INTEGER_CAP, 0),
              shards: clampInt(reward.shards, 0, SAFE_INTEGER_CAP, 0),
              essence: clampInt(reward.essence, 0, SAFE_INTEGER_CAP, 0),
              artifacts: clampInt(reward.artifacts, 0, SAFE_INTEGER_CAP, 0),
            },
          };
        })
    : [];

  const lastExpeditionDay = {
    artifact:
      payload.lastExpeditionDay?.artifact == null
        ? null
        : clampInt(payload.lastExpeditionDay.artifact, 0, currentDay, currentDay),
    merchant:
      payload.lastExpeditionDay?.merchant == null
        ? null
        : clampInt(payload.lastExpeditionDay.merchant, 0, currentDay, currentDay),
    ruins:
      payload.lastExpeditionDay?.ruins == null
        ? null
        : clampInt(payload.lastExpeditionDay.ruins, 0, currentDay, currentDay),
    vault:
      payload.lastExpeditionDay?.vault == null
        ? null
        : clampInt(payload.lastExpeditionDay.vault, 0, currentDay, currentDay),
    abyss:
      payload.lastExpeditionDay?.abyss == null
        ? null
        : clampInt(payload.lastExpeditionDay.abyss, 0, currentDay, currentDay),
  };

  const expeditionContractOffers: Record<ExpeditionType, ExpeditionRarity> = {
    artifact:
      typeof payload.expeditionContractOffers?.artifact === 'string' &&
      validExpeditionRarities.has(payload.expeditionContractOffers.artifact)
        ? (payload.expeditionContractOffers.artifact as ExpeditionRarity)
        : EXPEDITION_RARITIES[Math.floor(Math.random() * EXPEDITION_RARITIES.length)],
    merchant:
      typeof payload.expeditionContractOffers?.merchant === 'string' &&
      validExpeditionRarities.has(payload.expeditionContractOffers.merchant)
        ? (payload.expeditionContractOffers.merchant as ExpeditionRarity)
        : EXPEDITION_RARITIES[Math.floor(Math.random() * EXPEDITION_RARITIES.length)],
    ruins:
      typeof payload.expeditionContractOffers?.ruins === 'string' &&
      validExpeditionRarities.has(payload.expeditionContractOffers.ruins)
        ? (payload.expeditionContractOffers.ruins as ExpeditionRarity)
        : EXPEDITION_RARITIES[Math.floor(Math.random() * EXPEDITION_RARITIES.length)],
    vault:
      typeof payload.expeditionContractOffers?.vault === 'string' &&
      validExpeditionRarities.has(payload.expeditionContractOffers.vault)
        ? (payload.expeditionContractOffers.vault as ExpeditionRarity)
        : EXPEDITION_RARITIES[Math.floor(Math.random() * EXPEDITION_RARITIES.length)],
    abyss:
      typeof payload.expeditionContractOffers?.abyss === 'string' &&
      validExpeditionRarities.has(payload.expeditionContractOffers.abyss)
        ? (payload.expeditionContractOffers.abyss as ExpeditionRarity)
        : EXPEDITION_RARITIES[Math.floor(Math.random() * EXPEDITION_RARITIES.length)],
  };
  const expeditionContractsRefreshedAt = clampInt(payload.expeditionContractsRefreshedAt, 0, now, now);

  const rawMailbox = Array.isArray((payload as { mailbox?: unknown[] }).mailbox)
    ? (payload as { mailbox: unknown[] }).mailbox
    : [];
  const mailbox: MailMessage[] = rawMailbox
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .slice(0, 100)
    .map((entry, index) => ({
      id: clampString(entry.id, `mail_${index}`, 80),
      subject: clampString(entry.subject, 'Developer Mail', 80),
      message: clampString(entry.message, 'Compensation package', 280),
      from: clampString(entry.from, 'Dev Team', 48),
      sentAt: clampInt(entry.sentAt, 0, now, now),
      attachments: {
        shards: clampInt(isRecord(entry.attachments) ? entry.attachments.shards : 0, 0, SAFE_INTEGER_CAP, 0),
        gold: clampInt(isRecord(entry.attachments) ? entry.attachments.gold : 0, 0, SAFE_INTEGER_CAP, 0),
        diamonds: clampInt(isRecord(entry.attachments) ? entry.attachments.diamonds : 0, 0, SAFE_INTEGER_CAP, 0),
        tears: clampInt(isRecord(entry.attachments) ? entry.attachments.tears : 0, 0, SAFE_INTEGER_CAP, 0),
        essence: clampInt(isRecord(entry.attachments) ? entry.attachments.essence : 0, 0, SAFE_INTEGER_CAP, 0),
      },
      claimedAttachments: {
        shards: clampInt(
          isRecord(entry.claimedAttachments) ? entry.claimedAttachments.shards : 0,
          0,
          SAFE_INTEGER_CAP,
          0,
        ),
        gold: clampInt(isRecord(entry.claimedAttachments) ? entry.claimedAttachments.gold : 0, 0, SAFE_INTEGER_CAP, 0),
        diamonds: clampInt(
          isRecord(entry.claimedAttachments) ? entry.claimedAttachments.diamonds : 0,
          0,
          SAFE_INTEGER_CAP,
          0,
        ),
        tears: clampInt(
          isRecord(entry.claimedAttachments) ? entry.claimedAttachments.tears : 0,
          0,
          SAFE_INTEGER_CAP,
          0,
        ),
        essence: clampInt(
          isRecord(entry.claimedAttachments) ? entry.claimedAttachments.essence : 0,
          0,
          SAFE_INTEGER_CAP,
          0,
        ),
      },
    }));

  return {
    playerName,
    playerClass,
    characterCreated,
    gold: clampInt(payload.gold, 0, SAFE_INTEGER_CAP, 0),
    diamonds: clampInt(payload.diamonds, 0, SAFE_INTEGER_CAP, 0),
    totalGold: Math.max(
      clampInt(payload.gold, 0, SAFE_INTEGER_CAP, 0),
      clampInt(payload.totalGold, 0, SAFE_INTEGER_CAP, 0),
    ),
    exp: clampInt(payload.exp, 0, Math.max(0, expForLevel(level) - 1), 0),
    totalExp: clampInt(payload.totalExp, 0, SAFE_INTEGER_CAP, 0),
    level,
    highestWaveReached,
    unspentStatPoints,
    statsAlloc,
    totalKills: clampInt(payload.totalKills, 0, SAFE_INTEGER_CAP, 0),
    burstCharge: clampInt(payload.burstCharge, 0, BURST_COST, 0),
    combatHeat: clampFloat(payload.combatHeat, 0, maxHeat, 0),
    wave,
    monsterHp,
    monsterMaxHp: maxMonsterHp,
    teamHp,
    teamMaxHp,
    skills,
    heroRoster,
    activeTeamHeroIds,
    totalSummons: clampInt(payload.totalSummons, 0, SAFE_INTEGER_CAP, 0),
    firstSummonGiven: clampBoolean(payload.firstSummonGiven, false),
    freeSummonCharges: clampInt(payload.freeSummonCharges, 0, SAFE_INTEGER_CAP, 0),
    bossTears: clampInt(payload.bossTears, 0, SAFE_INTEGER_CAP, 0),
    heroShards: clampInt(payload.heroShards, 0, SAFE_INTEGER_CAP, 0),
    essence: clampInt(payload.essence, 0, SAFE_INTEGER_CAP, 0),
    rebirthCores: clampInt(payload.rebirthCores, 0, SAFE_INTEGER_CAP, 0),
    rebirthDamagePath: clampInt(payload.rebirthDamagePath, 0, SAFE_INTEGER_CAP, 0),
    rebirthEconomyPath: clampInt(payload.rebirthEconomyPath, 0, SAFE_INTEGER_CAP, 0),
    rebirthSurvivalPath: clampInt(payload.rebirthSurvivalPath, 0, SAFE_INTEGER_CAP, 0),
    autoRecycleMaxRarity:
      typeof payload.autoRecycleMaxRarity === 'string' &&
      VALID_AUTO_RECYCLE_RARITIES.has(payload.autoRecycleMaxRarity as Rarity)
        ? (payload.autoRecycleMaxRarity as Rarity)
        : 'uncommon',
    equipmentScrap: clampInt(payload.equipmentScrap, 0, SAFE_INTEGER_CAP, 0),
    gachaPityCounter: clampInt(payload.gachaPityCounter, 0, PITY_THRESHOLD - 1, 0),
    sparkTokens: clampInt(payload.sparkTokens, 0, SAFE_INTEGER_CAP, 0),
    claimedSummonMilestones: Array.isArray(payload.claimedSummonMilestones)
      ? (payload.claimedSummonMilestones as unknown[]).filter(
          (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
        )
      : [],
    guaranteedMinRarity:
      typeof payload.guaranteedMinRarity === 'string' &&
      VALID_AUTO_RECYCLE_RARITIES.has(payload.guaranteedMinRarity as Rarity)
        ? (payload.guaranteedMinRarity as Rarity)
        : null,
    summonHistory,
    teamLoadouts,
    teamSlotsUnlocked,
    heroFormationByUid,
    heroUniqueGearByHeroId,
    lastDiceRollDay: sanitizeMiniOpsCooldownTimestamp(payload.lastDiceRollDay, now),
    riftDungeonLevel: clampInt(payload.riftDungeonLevel, 1, MAX_SAVE_PLAYER_LEVEL, 1),
    riftEntryDay:
      payload.riftEntryDay == null
        ? payload.lastRiftRunDay == null
          ? null
          : clampInt(payload.lastRiftRunDay, 0, currentDay, currentDay)
        : clampInt(payload.riftEntryDay, 0, currentDay, currentDay),
    riftEntriesUsedToday:
      payload.riftEntriesUsedToday == null
        ? payload.lastRiftRunDay === currentDay
          ? 1
          : 0
        : clampInt(payload.riftEntriesUsedToday, 0, 10, 0),
    riftRaidTickets: clampInt(payload.riftRaidTickets, 0, SAFE_INTEGER_CAP, 0),
    lastRiftBossDamagePct: clampFloat(payload.lastRiftBossDamagePct, 0, 1, 0),
    lastDiceRollValue: payload.lastDiceRollValue == null ? null : clampInt(payload.lastDiceRollValue, 1, 20, 1),
    lastRiftWavesCleared: clampInt(payload.lastRiftWavesCleared, 0, 5, 0),
    treasureDungeonLevel: clampInt(payload.treasureDungeonLevel, 1, MAX_SAVE_PLAYER_LEVEL, 1),
    treasureEntriesUsedToday: clampInt(payload.treasureEntriesUsedToday, 0, 10, 0),
    treasureEntryDay:
      payload.treasureEntryDay == null ? null : clampInt(payload.treasureEntryDay, 0, currentDay, currentDay),
    lastTreasureHaulPct: clampFloat(payload.lastTreasureHaulPct, 0, 1, 0),
    lastTreasureWiped: clampBoolean(payload.lastTreasureWiped, false),
    lastReconSweepDay: sanitizeMiniOpsCooldownTimestamp(payload.lastReconSweepDay, now),
    lastLockpickDay: sanitizeMiniOpsCooldownTimestamp(payload.lastLockpickDay, now),
    lastTargetPracticeDay: sanitizeMiniOpsCooldownTimestamp(payload.lastTargetPracticeDay, now),
    lastBountyDraftDay: sanitizeMiniOpsCooldownTimestamp(payload.lastBountyDraftDay, now),
    miniBounty: isRecord(payload.miniBounty)
      ? {
          id: clampString(payload.miniBounty.id, `bounty_${currentDay}`, 64),
          title: clampString(payload.miniBounty.title, 'Mini Bounty', 64),
          metric:
            payload.miniBounty.metric === 'wave'
              ? 'wave'
              : payload.miniBounty.metric === 'summons'
                ? 'summons'
                : 'kills',
          startValue: clampInt(payload.miniBounty.startValue, 0, SAFE_INTEGER_CAP, 0),
          targetValue: clampInt(payload.miniBounty.targetValue, 0, SAFE_INTEGER_CAP, 0),
          rewardGold: clampInt(payload.miniBounty.rewardGold, 0, SAFE_INTEGER_CAP, 0),
          rewardShards: clampInt(payload.miniBounty.rewardShards, 0, SAFE_INTEGER_CAP, 0),
          rewardDiamonds: clampInt(payload.miniBounty.rewardDiamonds, 0, SAFE_INTEGER_CAP, 0),
          claimed: clampBoolean(payload.miniBounty.claimed, false),
        }
      : null,
    guildhallFacilities,
    expeditionQueue,
    lastExpeditionDay,
    expeditionContractOffers,
    expeditionContractsRefreshedAt,
    classMasteryXp,
    seasonPoints,
    bestSeasonPoints,
    dailyLoginStreak: clampInt(payload.dailyLoginStreak, 0, 100_000, 0),
    lastDailyLoginDay:
      payload.lastDailyLoginDay == null ? null : clampInt(payload.lastDailyLoginDay, 0, currentDay, currentDay),
    streakInsuranceCharges: clampInt(payload.streakInsuranceCharges, 0, SAFE_INTEGER_CAP, 1),
    weeklyEventWeek,
    weeklyEventId,
    weeklyKills: clampInt(payload.weeklyKills, 0, SAFE_INTEGER_CAP, 0),
    weeklyTrackClaimed: sanitizeIntList(payload.weeklyTrackClaimed, WEEKLY_TRACK_MILESTONES.length).filter(value =>
      VALID_WEEKLY_TRACK_MILESTONES.has(value),
    ),
    claimedMissionIds: sanitizeStringList(payload.claimedMissionIds, VALID_MISSION_IDS.size).filter(id =>
      VALID_MISSION_IDS.has(id),
    ),
    codexVipClaimedHeroIds: sanitizeStringList(payload.codexVipClaimedHeroIds, VALID_HERO_TEMPLATE_IDS.size).filter(
      id => VALID_HERO_TEMPLATE_IDS.has(id),
    ),
    codexVipClaimedUniqueIds: sanitizeStringList(payload.codexVipClaimedUniqueIds, VALID_HERO_TEMPLATE_IDS.size).filter(
      id => VALID_HERO_TEMPLATE_IDS.has(id),
    ),
    seenHintIds: sanitizeStringList(payload.seenHintIds, MAX_SAVE_LOG_ENTRIES),
    permanentUnlocks: sanitizeStringList(payload.permanentUnlocks, VALID_PERMANENT_UNLOCKS.size).filter(
      (id): id is PermanentUnlockId => VALID_PERMANENT_UNLOCKS.has(id as PermanentUnlockId),
    ),
    metaDamageLevel: clampInt(payload.metaDamageLevel, 0, SAFE_INTEGER_CAP, 0),
    metaEconomyLevel: clampInt(payload.metaEconomyLevel, 0, SAFE_INTEGER_CAP, 0),
    metaSurvivalLevel: clampInt(payload.metaSurvivalLevel, 0, SAFE_INTEGER_CAP, 0),
    vipPoints: (() => {
      const vipPoints = clampInt(payload.vipPoints, 0, SAFE_INTEGER_CAP, 0);
      return vipPoints;
    })(),
    vipLevel: (() => {
      const vipPoints = clampInt(payload.vipPoints, 0, SAFE_INTEGER_CAP, 0);
      return getVipLevelFromPoints(vipPoints);
    })(),
    vipRewardClaimedLevels: sanitizeIntList(payload.vipRewardClaimedLevels, 10).filter(
      level => level >= 1 && level <= 10,
    ),
    dollarFirstPurchaseClaimedOfferIds: sanitizeStringList(
      payload.dollarFirstPurchaseClaimedOfferIds,
      VALID_DOLLAR_SHOP_OFFER_IDS.size,
    ).filter((id): id is DollarShopOfferId => VALID_DOLLAR_SHOP_OFFER_IDS.has(id as DollarShopOfferId)),
    inventoryItemIds: cleanedInventoryItemIds,
    equipmentInventory: cleanedEquipmentInventory,
    equippedItems: cleanedEquippedItems,
    autoDismantleRarityFloor:
      typeof payload.autoDismantleRarityFloor === 'string' && EQUIPMENT_RARITY_SET.has(payload.autoDismantleRarityFloor)
        ? (payload.autoDismantleRarityFloor as EquipmentRarity)
        : 'common',
    autoDismantleEnabled: clampBoolean(payload.autoDismantleEnabled, false),
    usableItemCounts,
    autoUsePotionEnabled: clampBoolean(payload.autoUsePotionEnabled, false),
    autoUseCoolantEnabled: clampBoolean(payload.autoUseCoolantEnabled, false),
    autoUsePotionThresholdPct: clampFloat(payload.autoUsePotionThresholdPct, 0.1, 1, 0.35),
    autoRecycleEnabled: clampBoolean(payload.autoRecycleEnabled, false),
    autoSummonEnabled: clampBoolean(payload.autoSummonEnabled, false),
    autoSummonMode,
    autoBurstEnabled: clampBoolean(payload.autoBurstEnabled, false),
    combatTempo: clampCombatTempoForVip(
      payload.combatTempo === 2 || payload.combatTempo === 4 ? payload.combatTempo : 1,
      {
        vipLevel: getVipLevelFromPoints(clampInt(payload.vipPoints, 0, SAFE_INTEGER_CAP, 0)),
      },
    ),
    autoTempoEnabled: clampBoolean(payload.autoTempoEnabled, false),
    autoTempoTarget: clampAutoTempoTargetForVip(payload.autoTempoTarget === 4 ? 4 : 2, {
      vipLevel: getVipLevelFromPoints(clampInt(payload.vipPoints, 0, SAFE_INTEGER_CAP, 0)),
    }),
    autoSummonReserveGold: clampInt(payload.autoSummonReserveGold, 0, SAFE_INTEGER_CAP, 5000),
    lastActiveAt: clampInt(payload.lastActiveAt, 0, now, now),
    prestigeCount: clampInt(payload.prestigeCount, 0, SAFE_INTEGER_CAP, 0),
    achievements: sanitizeStringList(payload.achievements, VALID_ACHIEVEMENT_IDS.size).filter(id =>
      VALID_ACHIEVEMENT_IDS.has(id),
    ),
    combatLog: sanitizeStringList(payload.combatLog, MAX_SAVE_LOG_ENTRIES),
    damageBuffPct: clampFloat(payload.damageBuffPct, 0, 1, 0),
    damageBuffMs: clampInt(payload.damageBuffMs, 0, 600_000, 0),
    damageReductionBuffPct: clampFloat(payload.damageReductionBuffPct, 0, 1, 0),
    damageReductionBuffMs: clampInt(payload.damageReductionBuffMs, 0, 600_000, 0),
    heroActiveCdMs,
    mailbox,
    giftPreference:
      payload.giftPreference === 'shards' || payload.giftPreference === 'essence' ? payload.giftPreference : 'gold',
  };
}

export function computeStats(state: GameState) {
  const cls = getClassConfig(state.playerClass ?? 'warrior');
  const combined = derivedStats(state);
  const teamBoost = getTeamHeroBoost(state);
  const equipmentBonus = getEquipmentBonusStats(state);
  const formation = getFormationMultipliers(state);
  const synergy = getTeamSynergy(state);

  // Per-hero derived stats for display in the heroes tab
  const heroDetails: Record<
    string,
    {
      dps: number;
      hp: number;
      str: number;
      vit: number;
      agi: number;
      int: number;
      spr: number;
    }
  > = {};
  for (const hero of state.heroRoster) {
    const heroClass = getClassConfig(hero.heroClass);
    const template = HERO_TEMPLATE_MAP.get(hero.id);
    const rankMult = getRankMultiplier(hero.rank, hero.rarity);
    const statMult = Math.max(1, hero.rebirthStatMult ?? 1);

    let hStr: number, hInt: number, hAgi: number, hVit: number, hSpr: number;
    if (template) {
      const hp = getHeroStatProfile(template);
      hStr = (hp.baseStats.str + hero.level * hp.statGrowth.str) * rankMult * statMult;
      hInt = (hp.baseStats.int + hero.level * hp.statGrowth.int) * rankMult * statMult;
      hAgi = (hp.baseStats.agi + hero.level * hp.statGrowth.agi) * rankMult * statMult;
      hVit = (hp.baseStats.vit + hero.level * hp.statGrowth.vit) * rankMult * statMult;
      hSpr = (hp.baseStats.spr + hero.level * hp.statGrowth.spr) * rankMult * statMult;
    } else {
      hStr = (heroClass.baseStats.strength + hero.level * 0.9) * rankMult * statMult;
      hInt = (heroClass.baseStats.intelligence + hero.level * 0.85) * rankMult * statMult;
      hAgi = (heroClass.baseStats.agility + hero.level * 0.7) * rankMult * statMult;
      hVit = (heroClass.baseStats.vitality + hero.level * 0.8) * rankMult * statMult;
      hSpr = (heroClass.baseStats.spirit + hero.level * 0.6) * rankMult * statMult;
    }

    const heroPhy = hStr * 2 + hAgi * 1.2 + hero.level * 0.5;
    const heroMag = hInt * 2 + hSpr * 1.1;
    const heroDps = (heroPhy * heroClass.physWeight * 0.4 + heroMag * heroClass.magicWeight * 0.3) / 2;
    heroDetails[hero.uid] = {
      dps: heroDps,
      hp: Math.ceil((hVit + 3) * 8),
      str: Math.ceil(hStr),
      vit: Math.ceil(hVit),
      agi: Math.ceil(hAgi),
      int: Math.ceil(hInt),
      spr: Math.ceil(hSpr),
    };
  }

  return {
    className: cls.name,
    dps: getDps(state),
    teamDefense: getTeamDefense(state),
    damageBuffPct: state.damageBuffMs > 0 ? state.damageBuffPct : 0,
    damageReductionBuffPct: state.damageReductionBuffMs > 0 ? state.damageReductionBuffPct : 0,
    achievementBonusPercent: getAchievementBonusMultiplier(state) - 1,
    expNeeded: expForLevel(state.level),
    expProgress: Math.min(1, state.exp / expForLevel(state.level)),
    // Return decimal (e.g. 0.06 = 6%) so UI can multiply by 100 once
    teamBoostPercent: teamBoost,
    vipLevel: state.vipLevel,
    vipPoints: state.vipPoints,
    vipDamageBonusPct: (getVipDamageMultiplier(state) - 1) * 100,
    vipGoldBonusPct: (getVipGoldMultiplier(state) - 1) * 100,
    vipExpBonusPct: (getVipExpMultiplier(state) - 1) * 100,
    combined,
    equipmentBonus,
    heroDetails,
    formation: {
      front: formation.front,
      mid: formation.mid,
      back: formation.back,
      dpsBonusPct: (formation.dpsMult - 1) * 100,
      hpBonusPct: (formation.hpMult - 1) * 100,
      incomingDeltaPct: (1 - formation.incomingMult) * 100,
    },
    synergies: synergy.active,
  };
}

function processLevelUp(exp: number, level: number): { exp: number; level: number; gainedLevels: number } {
  let remaining = exp;
  let lvl = level;
  let gainedLevels = 0;
  while (remaining >= expForLevel(lvl)) {
    remaining -= expForLevel(lvl);
    lvl++;
    gainedLevels++;
  }
  return { exp: remaining, level: lvl, gainedLevels };
}

function addUsableItemCount(counts: Record<string, number>, itemId: string, amount: number): Record<string, number> {
  const next = { ...counts };
  next[itemId] = Math.max(0, (next[itemId] ?? 0) + amount);
  if (next[itemId] === 0) delete next[itemId];
  return next;
}

function rollRarityWithPity(
  counter: number,
  postgameUnlocked: boolean,
  guaranteedMin: Rarity | null,
): { rarity: Rarity; nextCounter: number; pityTriggered: boolean } {
  const pityTriggered = counter + 1 >= PITY_THRESHOLD;
  if (pityTriggered) {
    const r = Math.random();
    const rarity: Rarity = postgameUnlocked
      ? r < 0.7
        ? 'legendary'
        : r < 0.92
          ? 'mythic'
          : r < 0.99
            ? 'godly'
            : 'transcendent'
      : r < 0.75
        ? 'legendary'
        : r < 0.95
          ? 'mythic'
          : 'godly';
    return { rarity, nextCounter: 0, pityTriggered: true };
  }

  const pool = getSummonRarityPool(postgameUnlocked);
  let rarity: Rarity;
  if (counter >= SOFT_PITY_START) {
    const softBoost = (counter - SOFT_PITY_START + 1) * SOFT_PITY_BOOST_PER_PULL;
    if (Math.random() < softBoost) {
      const r = Math.random();
      rarity = postgameUnlocked
        ? r < 0.75
          ? 'legendary'
          : r < 0.95
            ? 'mythic'
            : r < 0.99
              ? 'godly'
              : 'transcendent'
        : r < 0.8
          ? 'legendary'
          : r < 0.96
            ? 'mythic'
            : 'godly';
    } else {
      rarity = rollRarity(Math.random(), pool);
    }
  } else {
    rarity = rollRarity(Math.random(), pool);
  }

  if (guaranteedMin && rarityRank(rarity) < rarityRank(guaranteedMin)) {
    rarity = guaranteedMin;
  }

  const isLegendaryPlus = rarityRank(rarity) >= rarityRank('legendary');
  return { rarity, nextCounter: isLegendaryPlus ? 0 : counter + 1, pityTriggered: false };
}

function equipmentScrapValue(rarity: ReturnType<typeof equipmentRarityConfig>['id']): number {
  return (
    {
      common: 10,
      rare: 24,
      epic: 60,
      legendary: 160,
      mythic: 360,
      transcendent: 760,
    }[rarity] ?? 10
  );
}

function maybeAutoUsePotion(state: GameState): GameState {
  if (!state.autoUsePotionEnabled) return state;
  if (state.teamMaxHp <= 0) return state;
  const hpRatio = state.teamHp / state.teamMaxHp;
  if (hpRatio > state.autoUsePotionThresholdPct) return state;

  const grandQty = state.usableItemCounts['grand_potion'] ?? 0;
  const smallQty = state.usableItemCounts['small_potion'] ?? 0;
  const preferGrand = hpRatio <= state.autoUsePotionThresholdPct * 0.6;
  const itemId = preferGrand
    ? grandQty > 0
      ? 'grand_potion'
      : smallQty > 0
        ? 'small_potion'
        : null
    : smallQty > 0
      ? 'small_potion'
      : grandQty > 0
        ? 'grand_potion'
        : null;
  if (!itemId) return state;

  const item = getUsableItem(itemId);
  if (!item || item.effect !== 'heal_team_percent') return state;
  const healed = Math.ceil(state.teamMaxHp * item.value);
  return queueReward(
    {
      ...state,
      usableItemCounts: addUsableItemCount(state.usableItemCounts, item.id, -1),
      teamHp: Math.min(state.teamMaxHp, state.teamHp + healed),
    },
    {
      id: `auto_potion_${Date.now()}`,
      kind: 'item',
      title: `Auto Used ${item.emoji} ${item.name}`,
      detail: `Restored ${healed} team HP`,
    },
  );
}

function maybeAutoUseCoolant(state: GameState): GameState {
  if (!state.autoUsePotionEnabled || !state.autoUseCoolantEnabled) return state;

  const maxHeat = getMaxHeatForLevel(state.level);
  if (maxHeat <= 0) return state;

  const heatRatio = state.combatHeat / maxHeat;
  if (heatRatio < 0.72) return state;

  const mk1Qty = state.usableItemCounts['coolant_mk1'] ?? 0;
  const mk2Qty = state.usableItemCounts['coolant_mk2'] ?? 0;
  const severeHeat = heatRatio >= 0.9;
  const mk1WouldStabilize = state.combatHeat - 35 <= maxHeat * 0.55;
  const itemId = severeHeat
    ? mk2Qty > 0 && !mk1WouldStabilize
      ? 'coolant_mk2'
      : mk1Qty > 0
        ? 'coolant_mk1'
        : mk2Qty > 0
          ? 'coolant_mk2'
          : null
    : mk1Qty > 0
      ? 'coolant_mk1'
      : mk2Qty > 0
        ? 'coolant_mk2'
        : null;
  if (!itemId) return state;

  const item = getUsableItem(itemId);
  if (!item || item.effect !== 'reduce_heat_flat') return state;

  const reduced = Math.max(0, state.combatHeat - item.value);
  return queueReward(
    {
      ...state,
      usableItemCounts: addUsableItemCount(state.usableItemCounts, item.id, -1),
      combatHeat: reduced,
    },
    {
      id: `auto_coolant_${Date.now()}`,
      kind: 'system',
      title: `Smart Used ${item.emoji} ${item.name}`,
      detail: `Heat ${Math.ceil(state.combatHeat)} -> ${Math.ceil(reduced)}`,
    },
  );
}

function getMonsterAffixModifiers(wave: number) {
  const affixes = getMonsterAffixes(wave);
  return affixes.reduce(
    (acc, a) => ({
      hpMult: acc.hpMult * a.enemyHpMultiplier,
      dmgMult: acc.dmgMult * a.enemyDamageMultiplier,
      goldMult: acc.goldMult * a.goldMultiplier,
      expMult: acc.expMult * a.expMultiplier,
    }),
    { hpMult: 1, dmgMult: 1, goldMult: 1, expMult: 1 },
  );
}

function toDayNumber(ts: number): number {
  return Math.floor(ts / 86_400_000);
}

function getRiftDailyEntryCap(state: Pick<GameState, 'vipLevel'>): number {
  if (state.vipLevel >= 4) return 5;
  if (state.vipLevel >= 2) return 4;
  return 3;
}

function getTreasuryDailyEntryCap(state: Pick<GameState, 'vipLevel'>): number {
  if (state.vipLevel >= 4) return 5;
  if (state.vipLevel >= 2) return 4;
  return 3;
}

function killMonster(state: GameState): GameState {
  const weekly = getCurrentWeeklyEvent(state);
  const affix = getMonsterAffixModifiers(state.wave);
  const achievementMult = getAchievementBonusMultiplier(state);
  const economyMult = getMetaEconomyMultiplier(state);
  const heroPassive = getHeroPassiveMultipliers(state);
  const synergy = getTeamSynergy(state);
  const masteryLevel = getClassMasteryLevel(state, state.playerClass);
  const masteryEconomyMult = 1 + Math.min(0.25, Math.floor(masteryLevel / 5) * 0.01);
  const goldReward = Math.ceil(
    getMonsterGold(state.wave) *
      Math.pow(REBIRTH_BONUS, state.prestigeCount) *
      achievementMult *
      affix.goldMult *
      economyMult *
      getRebirthEconomyMultiplier(state) *
      heroPassive.goldMult *
      synergy.goldMult *
      masteryEconomyMult *
      weekly.goldMultiplier *
      getVipGoldMultiplier(state) *
      getTreasuryGoldMultiplier(state),
  );
  const expReward = Math.ceil(
    getMonsterExp(state.wave) *
      achievementMult *
      affix.expMult *
      heroPassive.expMult *
      synergy.expMult *
      weekly.expMultiplier *
      getVipExpMultiplier(state) *
      getTrainingExpMultiplier(state),
  );
  const lvl = processLevelUp(state.exp + expReward, state.level);
  const isBoss = state.wave % 10 === 0;
  const act = getActForWave(state.wave);
  const essenceReward = isBoss ? Math.max(2, act.id + Math.floor(state.wave / 20)) : 0;

  // Level up active team heroes
  let updatedRoster = state.heroRoster;
  const activeTeam = new Set(state.activeTeamHeroIds);
  updatedRoster = updatedRoster.map(hero => {
    if (activeTeam.has(hero.uid) && hero.level < HERO_LEVEL_CAP) {
      return { ...hero, level: hero.level + 1 };
    }
    return hero;
  });

  const newWave = state.wave + 1;
  const nextMaxHp = getMonsterMaxHp(newWave);
  const newTeamMaxHp = getTeamMaxHp({ ...state, heroRoster: updatedRoster });

  let newState: GameState = {
    ...state,
    gold: state.gold + goldReward,
    totalGold: state.totalGold + goldReward,
    essence: state.essence + essenceReward,
    exp: lvl.exp,
    totalExp: state.totalExp + expReward,
    level: lvl.level,
    highestWaveReached: Math.max(state.highestWaveReached, newWave),
    unspentStatPoints: state.unspentStatPoints + lvl.gainedLevels * STAT_POINTS_PER_LEVEL,
    totalKills: state.totalKills + 1,
    burstCharge: Math.min(BURST_COST, state.burstCharge + (isBoss ? BURST_BOSS_CHARGE_GAIN : 1)),
    weeklyKills: state.weeklyKills + 1,
    seasonPoints: state.seasonPoints + 12 + (isBoss ? 80 : 0),
    bestSeasonPoints: Math.max(state.bestSeasonPoints, state.seasonPoints + 12 + (isBoss ? 80 : 0)),
    wave: newWave,
    monsterHp: nextMaxHp,
    monsterMaxHp: nextMaxHp,
    teamHp: newTeamMaxHp, // Heal team after win
    teamMaxHp: newTeamMaxHp,
    heroRoster: updatedRoster,
  };

  if (state.playerClass) {
    const gain = isBoss ? 8 : 2;
    const nextXp = (newState.classMasteryXp[state.playerClass] ?? 0) + gain;
    const prevLevel = Math.floor((newState.classMasteryXp[state.playerClass] ?? 0) / 100);
    const nextLevel = Math.floor(nextXp / 100);
    newState = {
      ...newState,
      classMasteryXp: {
        ...newState.classMasteryXp,
        [state.playerClass]: nextXp,
      },
    };
    if (nextLevel > prevLevel) {
      newState = queueReward(newState, {
        id: `mastery_${state.playerClass}_${Date.now()}`,
        kind: 'system',
        title: `${getClassConfig(state.playerClass).name} Mastery Up`,
        detail: `Mastery Lv ${nextLevel}`,
      });
    }
  }
  newState = queueCombatLog(
    newState,
    `Defeated ${getMonsterForWave(state.wave).name} • +${goldReward} gold +${expReward} EXP (${weekly.name})`,
  );

  // Grant one free summon charge on first kill.
  if (state.totalKills === 0 && !state.firstSummonGiven) {
    newState = {
      ...newState,
      firstSummonGiven: true,
      freeSummonCharges: newState.freeSummonCharges + 1,
    };
  }

  // Chance to drop class-compatible equipment on kill.
  const gearCap = getGearInventoryCap(newState);
  const mythicUnlocked = hasUnlock(newState, 'mythic_equipment');
  const transcendentUnlocked = isPostgameSummonUnlocked(newState);
  const dropChance = Math.min(0.4, 0.1 + state.wave * 0.003 + (isBoss ? 0.12 : 0));
  if (newState.playerClass && Math.random() <= dropChance && newState.inventoryItemIds.length < gearCap) {
    const droppedRarity = rollEquipmentRarityByTier(Math.random(), mythicUnlocked, transcendentUnlocked);
    const pool = EQUIPMENT_CATALOG.filter(
      item => item.allowedClasses.includes(newState.playerClass as PlayerClass) && item.rarity === droppedRarity,
    );
    const fallbackPool = EQUIPMENT_CATALOG.filter(item =>
      item.allowedClasses.includes(newState.playerClass as PlayerClass),
    );
    const source = pool.length > 0 ? pool : fallbackPool;
    if (source.length > 0) {
      const baseItem = source[Math.floor(Math.random() * source.length)];
      const forgeMult = getForgeStatMultiplier(newState.guildhallFacilities.forge.level);
      const item = createEquipmentInstance(baseItem, Math.max(1, newState.level), 'drop', forgeMult);
      if (!newState.inventoryItemIds.includes(item.id)) {
        newState = queueReward(
          {
            ...newState,
            equipmentInventory: {
              ...newState.equipmentInventory,
              [item.id]: item,
            },
            inventoryItemIds: [...newState.inventoryItemIds, item.id],
          },
          {
            id: `item_${item.id}_${Date.now()}`,
            kind: 'item',
            title: `Equipment Drop: ${item.emoji} ${item.name}`,
            detail: `${equipmentRarityConfig(item.rarity).label} ${item.slot} • iLv ${item.itemLevel}`,
          },
        );
        newState = queueCombatLog(newState, `Loot drop: ${item.emoji} ${item.name}`);
        if (item.rarity === 'mythic') {
          newState = queueReward(newState, {
            id: `mythic_flash_${Date.now()}`,
            kind: 'system',
            title: 'MYTHIC DROP!',
            detail: `${item.emoji} ${item.name} • Arc flash triggered`,
          });
        }
      }
    }
  }

  // Chance to drop a usable consumable.
  const usableDropChance = Math.min(0.32, 0.12 + state.wave * 0.0015 + (isBoss ? 0.08 : 0));
  if (Math.random() <= usableDropChance) {
    const usable = rollUsableItem(Math.random(), hasUnlock(newState, 'advanced_consumables'));
    const nextCounts = addUsableItemCount(newState.usableItemCounts, usable.id, 1);
    newState = queueReward(
      {
        ...newState,
        usableItemCounts: nextCounts,
      },
      {
        id: `usable_${usable.id}_${Date.now()}`,
        kind: 'item',
        title: `Found ${usable.emoji} ${usable.name}`,
        detail: usable.description,
      },
    );
    newState = queueCombatLog(newState, `Item drop: ${usable.emoji} ${usable.name}`);
  }

  // Chest node: every 5th campaign stage (not boss) has 50% chance for a Boss Tear.
  const campaignStageLocal = ((state.wave - 1) % 20) + 1;
  const isChestNode = !isBoss && campaignStageLocal % 5 === 0;
  if (isChestNode && Math.random() < 0.5) {
    newState = { ...newState, bossTears: newState.bossTears + 1 };
    newState = queueReward(newState, {
      id: `chest_tear_${Date.now()}`,
      kind: 'system',
      title: '🎁 Chest Node',
      detail: '+1 Boss Tear 💧 found in chest!',
    });
    newState = queueCombatLog(newState, `Chest node: +1 Boss Tear 💧`);
  }

  if (isBoss) {
    newState = { ...newState, bossTears: newState.bossTears + 1 };
    newState = queueReward(newState, {
      id: `boss_stinger_${Date.now()}`,
      kind: 'system',
      title: 'Boss Defeated',
      detail: `${act.emoji} ${act.name} collapsed • Stinger triggered`,
    });
    const unlock = getBossUnlockForWave(state.wave);
    if (unlock && !newState.permanentUnlocks.includes(unlock)) {
      newState = queueReward(
        {
          ...newState,
          permanentUnlocks: [...newState.permanentUnlocks, unlock],
        },
        {
          id: `unlock_${unlock}_${Date.now()}`,
          kind: 'system',
          title: `Act Boss Defeated • ${act.name}`,
          detail: unlockLabel(unlock),
        },
      );
    }

    newState = queueReward(newState, {
      id: `essence_${Date.now()}`,
      kind: 'system',
      title: 'Boss Essence Acquired',
      detail: `+${essenceReward} essence`,
    });
    newState = queueCombatLog(newState, `Boss reward: +${essenceReward} essence`);
    newState = queueCombatLog(newState, `Boss drop: +1 Boss Tear 💧`);
  }

  return withAchievement(newState);
}

function checkAchievements(state: GameState): string | null {
  const activeTeam = new Set(state.activeTeamHeroIds);
  const activeTeamClassCount = new Set(
    state.heroRoster.filter(hero => activeTeam.has(hero.uid)).map(hero => hero.heroClass),
  ).size;

  const maxHeroRankCount = state.heroRoster.filter(hero => hero.rank >= 10).length;
  const maxHeroLevelCount = state.heroRoster.filter(hero => hero.level >= HERO_LEVEL_CAP).length;
  const godlyHeroCount = state.heroRoster.filter(hero => hero.rarity === 'godly').length;
  const transcendentHeroCount = state.heroRoster.filter(hero => hero.rarity === 'transcendent').length;
  const uniqueEntries = Object.values(state.heroUniqueGearByHeroId);
  const uniqueForgedCount = uniqueEntries.filter(progress => (progress?.rank ?? 0) > 0).length;
  const uniqueEquippedCount = uniqueEntries.filter(
    progress => (progress?.rank ?? 0) > 0 && !!progress?.equippedByUid,
  ).length;
  const uniqueMaxRankCount = uniqueEntries.filter(progress => (progress?.rank ?? 0) >= 10).length;
  const codexClaimCount = state.codexVipClaimedHeroIds.length + state.codexVipClaimedUniqueIds.length;
  const facilityTotalLevel = Object.values(state.guildhallFacilities).reduce(
    (sum, facility) => sum + facility.level,
    0,
  );
  const forgeFacilityLevel = state.guildhallFacilities.forge.level;

  const ownedEquipmentIds = new Set<string>([
    ...state.inventoryItemIds,
    ...Object.values(state.equippedItems).filter((itemId): itemId is string => !!itemId),
  ]);
  let mythicPlusEquipmentCount = 0;
  let epicPlusEquipmentCount = 0;
  let transcendentEquipmentCount = 0;
  for (const itemId of ownedEquipmentIds) {
    const item = getEquipmentEntry(state, itemId);
    if (!item) continue;
    if (
      item.rarity === 'epic' ||
      item.rarity === 'legendary' ||
      item.rarity === 'mythic' ||
      item.rarity === 'transcendent'
    ) {
      epicPlusEquipmentCount += 1;
    }
    if (item.rarity === 'mythic' || item.rarity === 'transcendent') mythicPlusEquipmentCount += 1;
    if (item.rarity === 'transcendent') transcendentEquipmentCount += 1;
  }

  const ctx = {
    totalGold: state.totalGold,
    totalKills: state.totalKills,
    wave: state.wave,
    highestWaveReached: state.highestWaveReached,
    level: state.level,
    prestigeCount: state.prestigeCount,
    totalSummons: state.totalSummons,
    equippedCount: state.activeTeamHeroIds.length,
    activeTeamClassCount,
    teamSlotCount: state.teamSlotsUnlocked,
    heroRosterCount: state.heroRoster.length,
    godlyHeroCount,
    transcendentHeroCount,
    maxHeroRankCount,
    maxHeroLevelCount,
    heroShards: state.heroShards,
    essence: state.essence,
    bossTears: state.bossTears,
    vipLevel: state.vipLevel,
    equipmentScrap: state.equipmentScrap,
    epicPlusEquipmentCount,
    mythicPlusEquipmentCount,
    transcendentEquipmentCount,
    facilityTotalLevel,
    forgeFacilityLevel,
    uniqueForgedCount,
    uniqueEquippedCount,
    uniqueMaxRankCount,
    codexClaimCount,
    permanentUnlockCount: state.permanentUnlocks.length,
    unlockedCount: state.achievements.size,
    totalAchievementCount: ACHIEVEMENTS.length,
    dailyLoginStreak: state.dailyLoginStreak,
  };

  for (const ach of ACHIEVEMENTS) {
    if (!state.achievements.has(ach.id) && ach.condition(ctx)) {
      return ach.id;
    }
  }
  return null;
}

function withAchievement(state: GameState): GameState {
  if (state.newAchievement) return state;
  const achId = checkAchievements(state);
  if (!achId) return state;
  const achievements = new Set(state.achievements);
  achievements.add(achId);
  return { ...state, achievements, newAchievement: achId };
}

function applyBurst(state: GameState, hits: number): GameState {
  if (state.burstCharge < BURST_COST) return state;

  let working: GameState = { ...state, burstCharge: 0 };
  const burstHits = Math.max(1, Math.floor(hits));
  const weekly = getCurrentWeeklyEvent(working);
  for (let i = 0; i < burstHits; i++) {
    const affix = getMonsterAffixModifiers(working.wave);
    const crit = Math.random() < 0.2;
    const dmg =
      (getDps(working) * BURST_STRIKE_DPS_MULT * (crit ? 1.8 : 1)) / (affix.hpMult * weekly.enemyHpMultiplier);
    const hp = working.monsterHp - dmg;
    if (hp <= 0) {
      working = withAchievement(killMonster(working));
    } else {
      working = { ...working, monsterHp: hp };
    }
  }

  return queueCombatLog(working, `Burst unleashed for ${burstHits} amplified strikes`);
}

function applyAutoTempo(state: GameState): GameState {
  if (!state.autoTempoEnabled || state.combatHeat > 0 || state.combatTempo !== 1) {
    return state;
  }
  return { ...state, combatTempo: state.autoTempoTarget };
}

function advanceCombatStep(state: GameState, elapsedMs: number): GameState {
  if (!state.characterCreated) return state;

  const refreshedState = maybeAutoRefreshExpeditionContracts(state, Date.now());
  const withAutoTempo = applyAutoTempo(refreshedState);
  const scaledElapsed = elapsedMs * withAutoTempo.combatTempo;
  let working = decayBuffs(withAutoTempo, scaledElapsed);
  working = tickHeroActives(working, scaledElapsed);
  working = updateCombatHeat(working, elapsedMs);
  const weekly = getCurrentWeeklyEvent(working);

  const dps = getDps(working);
  if (dps <= 0) return state;
  const affix = getMonsterAffixModifiers(working.wave);
  const damage = safeDivide(dps * (scaledElapsed / 1000), affix.hpMult * weekly.enemyHpMultiplier, 0);
  const hp = working.monsterHp - damage;

  const enemyDmg = getMonsterDamage(working.wave) * affix.dmgMult * weekly.enemyDamageMultiplier;
  const defense = getTeamDefense(working);
  const damageReduction = Math.min(0.8, defense / (defense + 100));
  const passive = working.playerClass ? getClassPassive(working.playerClass) : null;
  const passiveIncomingMult = hasUnlock(working, 'class_passive') && passive ? passive.incomingDamageMultiplier : 1;
  const heroPassive = getHeroPassiveMultipliers(working);
  const formation = getFormationMultipliers(working);
  const synergy = getTeamSynergy(working);
  const activeReductionMult = 1 - Math.max(0, Math.min(0.7, working.damageReductionBuffPct));
  const actualEnemyDamage =
    enemyDmg *
    (1 - damageReduction) *
    passiveIncomingMult *
    heroPassive.incomingDmgMult *
    formation.incomingMult *
    synergy.incomingMult *
    activeReductionMult *
    (scaledElapsed / 1000);
  const teamHp = working.teamHp - actualEnemyDamage;

  if (hp <= 0) return withAchievement(killMonster(working));

  if (teamHp <= 0) {
    const currentChapter = Math.floor((Math.max(1, working.wave) - 1) / 20);
    const chapterStartWave = currentChapter * 20 + 1;
    const retreatWave =
      working.wave === chapterStartWave && chapterStartWave > 1 ? Math.max(1, chapterStartWave - 20) : chapterStartWave;
    return {
      ...working,
      wave: retreatWave,
      monsterHp: getMonsterMaxHp(retreatWave),
      monsterMaxHp: getMonsterMaxHp(retreatWave),
      teamHp: getTeamMaxHp(working),
      teamMaxHp: getTeamMaxHp(working),
      lastActiveAt: Date.now(),
      combatLog: [
        `${new Date().toLocaleTimeString()} • Team collapsed and retreated to Wave ${retreatWave}`,
        ...working.combatLog,
      ].slice(0, 24),
    };
  }

  const withPotions = maybeAutoUsePotion({ ...working, monsterHp: hp, teamHp, lastActiveAt: Date.now() });
  const withCoolant = maybeAutoUseCoolant(withPotions);
  const withRecycle = maybeAutoRecycleBackground(withCoolant);
  const withDismantle = maybeAutoDismantleTick(withRecycle);
  const withSummon = maybeAutoSummonTick(withDismantle);
  if (withSummon.autoBurstEnabled && withSummon.burstCharge >= BURST_COST) {
    return applyBurst(withSummon, 4 * withSummon.combatTempo);
  }
  return withSummon;
}

function getCombatTimedEventMs(state: GameState, combatTempo: number): number | null {
  const timedEvents: number[] = [];

  if (state.damageBuffMs > 0) timedEvents.push(state.damageBuffMs / combatTempo);
  if (state.damageReductionBuffMs > 0) timedEvents.push(state.damageReductionBuffMs / combatTempo);
  if (state.autoSummonCooldownMs > 0) timedEvents.push(state.autoSummonCooldownMs / combatTempo);

  for (const cooldownMs of Object.values(state.heroActiveCdMs)) {
    if (cooldownMs > 0) timedEvents.push(cooldownMs / combatTempo);
  }

  const maxHeat = getMaxHeatForLevel(state.level);
  if (state.combatTempo > 1 && maxHeat > state.combatHeat) {
    timedEvents.push(((maxHeat - state.combatHeat) / HEAT_BASE_RATE_PER_SEC) * 1000);
  }
  if (state.combatTempo === 1 && state.autoTempoEnabled && state.combatHeat > 0) {
    timedEvents.push((state.combatHeat / HEAT_RECOVERY_RATE_PER_SEC) * 1000);
  }

  const nextTimedEventMs = timedEvents.filter(value => Number.isFinite(value) && value > 0);
  return nextTimedEventMs.length > 0 ? Math.min(...nextTimedEventMs) : null;
}

function getOfflineStepElapsedMs(state: GameState, remainingMs: number): number {
  const withAutoTempo = applyAutoTempo(state);
  const combatTempo = Math.max(1, withAutoTempo.combatTempo);
  const weekly = getCurrentWeeklyEvent(withAutoTempo);
  const affix = getMonsterAffixModifiers(withAutoTempo.wave);
  const dps = Math.max(1, getDps(withAutoTempo));
  const monsterHpPerMs = safeDivide(dps * combatTempo, 1000 * affix.hpMult * weekly.enemyHpMultiplier, 0);
  const candidateWindows: number[] = [OFFLINE_SIM_MAX_SLICE_MS, remainingMs];

  if (monsterHpPerMs > 0) {
    candidateWindows.push(withAutoTempo.monsterHp / monsterHpPerMs);
  }

  const enemyDmg = getMonsterDamage(withAutoTempo.wave) * affix.dmgMult * weekly.enemyDamageMultiplier;
  const defense = getTeamDefense(withAutoTempo);
  const damageReduction = Math.min(0.8, defense / (defense + 100));
  const passive = withAutoTempo.playerClass ? getClassPassive(withAutoTempo.playerClass) : null;
  const passiveIncomingMult =
    hasUnlock(withAutoTempo, 'class_passive') && passive ? passive.incomingDamageMultiplier : 1;
  const heroPassive = getHeroPassiveMultipliers(withAutoTempo);
  const formation = getFormationMultipliers(withAutoTempo);
  const synergy = getTeamSynergy(withAutoTempo);
  const activeReductionMult = 1 - Math.max(0, Math.min(0.7, withAutoTempo.damageReductionBuffPct));
  const enemyDmgPerMs =
    enemyDmg *
    (1 - damageReduction) *
    passiveIncomingMult *
    heroPassive.incomingDmgMult *
    formation.incomingMult *
    synergy.incomingMult *
    activeReductionMult *
    (combatTempo / 1000);
  if (enemyDmgPerMs > 0) {
    candidateWindows.push(withAutoTempo.teamHp / enemyDmgPerMs);
  }

  const nextTimedEventMs = getCombatTimedEventMs(withAutoTempo, combatTempo);
  if (nextTimedEventMs !== null) {
    candidateWindows.push(nextTimedEventMs);
  }

  const boundedMs = Math.min(...candidateWindows.filter(value => Number.isFinite(value) && value > 0));
  const roundedMs = Math.max(TICK_MS, Math.ceil(boundedMs / TICK_MS) * TICK_MS);
  return Math.min(remainingMs, roundedMs, OFFLINE_SIM_MAX_SLICE_MS);
}

/**
 * Fast-path: batch-process multiple monster kills when combat is in a stable
 * farming state (no active buffs/cooldowns that need per-tick processing).
 * Returns null when conditions don't allow batching.
 */
function tryBatchOfflineKills(state: GameState, remainingMs: number): { state: GameState; consumedMs: number } | null {
  // Require clean combat state — no active buffs/cooldowns needing tick decay
  if (state.damageBuffMs > 0 || state.damageReductionBuffMs > 0) return null;
  if (state.combatHeat > 0) return null;
  if (state.autoSummonCooldownMs > 0) return null;
  for (const cd of Object.values(state.heroActiveCdMs)) {
    if (cd > 0) return null;
  }

  const withTempo = applyAutoTempo(state);
  const combatTempo = Math.max(1, withTempo.combatTempo);
  const weekly = getCurrentWeeklyEvent(withTempo);
  let currentDps = getDps(withTempo);
  if (currentDps <= 0) return null;

  const affix = getMonsterAffixModifiers(withTempo.wave);
  const ttk = safeDivide(
    withTempo.monsterHp * 1000 * affix.hpMult * weekly.enemyHpMultiplier,
    currentDps * combatTempo,
    Infinity,
  );
  // Only batch when kills are fast (under max slice)
  if (!Number.isFinite(ttk) || ttk > OFFLINE_SIM_MAX_SLICE_MS) return null;

  // Check team survival over one kill cycle
  const enemyDmg = getMonsterDamage(withTempo.wave) * affix.dmgMult * weekly.enemyDamageMultiplier;
  const defense = getTeamDefense(withTempo);
  const damageReduction = Math.min(0.8, defense / (defense + 100));
  const passive = withTempo.playerClass ? getClassPassive(withTempo.playerClass) : null;
  const passiveIncomingMult = hasUnlock(withTempo, 'class_passive') && passive ? passive.incomingDamageMultiplier : 1;
  const heroPassive = getHeroPassiveMultipliers(withTempo);
  const formation = getFormationMultipliers(withTempo);
  const synergy = getTeamSynergy(withTempo);
  const incomingDmgPerMs =
    enemyDmg *
    (1 - damageReduction) *
    passiveIncomingMult *
    heroPassive.incomingDmgMult *
    formation.incomingMult *
    synergy.incomingMult *
    (combatTempo / 1000);
  // Team must survive comfortably (heals to full each kill)
  if (incomingDmgPerMs * ttk >= withTempo.teamHp * 0.8) return null;

  const BATCH_LIMIT = 500;
  const DPS_RECHECK_INTERVAL = 50;
  let working = withTempo;
  let consumedMs = 0;

  for (let i = 0; i < BATCH_LIMIT && consumedMs < remainingMs; i++) {
    // Periodically revalidate — hero levels change DPS, wave changes difficulty
    if (i > 0 && i % DPS_RECHECK_INTERVAL === 0) {
      currentDps = getDps(applyAutoTempo(working));
      if (currentDps <= 0) break;
      const newAffix = getMonsterAffixModifiers(working.wave);
      const newTtk = safeDivide(
        working.monsterHp * 1000 * newAffix.hpMult * weekly.enemyHpMultiplier,
        currentDps * combatTempo,
        Infinity,
      );
      if (!Number.isFinite(newTtk) || newTtk > OFFLINE_SIM_MAX_SLICE_MS) break;
      const newEnemyDmg = getMonsterDamage(working.wave) * newAffix.dmgMult * weekly.enemyDamageMultiplier;
      const newDefense = getTeamDefense(working);
      const newDmgRed = Math.min(0.8, newDefense / (newDefense + 100));
      const newIncoming =
        newEnemyDmg *
        (1 - newDmgRed) *
        passiveIncomingMult *
        heroPassive.incomingDmgMult *
        formation.incomingMult *
        synergy.incomingMult *
        (combatTempo / 1000);
      if (newIncoming * newTtk >= working.teamHp * 0.8) break;
    }

    // TTK for this specific wave
    const waveAffix = getMonsterAffixModifiers(working.wave);
    const waveTtk = safeDivide(
      working.monsterHp * 1000 * waveAffix.hpMult * weekly.enemyHpMultiplier,
      currentDps * combatTempo,
      Infinity,
    );
    if (!Number.isFinite(waveTtk) || consumedMs + waveTtk > remainingMs) break;

    working = killMonster(working);
    consumedMs += waveTtk;
  }

  if (consumedMs <= 0) return null;
  // Check achievements once for the whole batch instead of per-kill
  working = withAchievement(working);
  return { state: working, consumedMs };
}

function simulateOfflineProgress(
  state: GameState,
  elapsedMs: number,
): {
  state: GameState;
  reachedIterationCap: boolean;
} {
  let remainingMs = elapsedMs;
  let working = state;
  let iterations = 0;
  const preservedRewardQueue = state.rewardQueue;
  const preservedCombatLog = state.combatLog;

  while (remainingMs > 0 && working.characterCreated && iterations < OFFLINE_SIM_MAX_ITERATIONS) {
    // Fast path: batch kills when in stable farming state
    const batch = tryBatchOfflineKills(working, remainingMs);
    if (batch !== null) {
      working = {
        ...batch.state,
        rewardQueue: preservedRewardQueue,
        combatLog: preservedCombatLog,
      };
      remainingMs -= batch.consumedMs;
      iterations += 1;
      continue;
    }

    // Slow path: per-tick simulation
    const stepElapsedMs = getOfflineStepElapsedMs(working, remainingMs);
    const advanced = advanceCombatStep(working, stepElapsedMs);
    working = {
      ...advanced,
      rewardQueue: preservedRewardQueue,
      combatLog: preservedCombatLog,
    };
    remainingMs -= stepElapsedMs;
    iterations += 1;
  }

  return {
    state: working,
    reachedIterationCap: remainingMs > 0,
  };
}

function rollExpeditionContractOffers(): Record<ExpeditionType, ExpeditionRarity> {
  const offers = {
    artifact: 'common',
    merchant: 'common',
    ruins: 'common',
    vault: 'common',
    abyss: 'common',
  } as Record<ExpeditionType, ExpeditionRarity>;

  for (const type of EXPEDITION_TYPES) {
    offers[type] = EXPEDITION_RARITIES[Math.floor(Math.random() * EXPEDITION_RARITIES.length)];
  }

  return offers;
}

function maybeAutoRefreshExpeditionContracts(state: GameState, nowMs: number): GameState {
  if (!Number.isFinite(state.expeditionContractsRefreshedAt)) return state;
  if (nowMs - state.expeditionContractsRefreshedAt < EXPEDITION_CONTRACT_REFRESH_MS) return state;
  return {
    ...state,
    expeditionContractOffers: rollExpeditionContractOffers(),
    expeditionContractsRefreshedAt: nowMs,
  };
}

type Action =
  | { type: 'CREATE_CHARACTER'; name: string; playerClass: PlayerClass }
  | { type: 'TICK'; elapsed: number }
  | { type: 'BUY_SKILL'; id: string }
  | { type: 'ALLOCATE_STAT'; stat: StatKey }
  | { type: 'ALLOCATE_STAT_MAX'; stat: StatKey }
  | { type: 'ALLOCATE_STAT_N'; stat: StatKey; amount: number }
  | { type: 'BURST'; hits: number }
  | { type: 'LEVEL_UP_HERO_GOLD'; uid: string }
  | { type: 'EQUIP_ITEM'; itemId: string }
  | { type: 'SUMMON_HERO'; payWithDiamonds?: boolean }
  | { type: 'SUMMON_HERO_X10'; featuredHeroId?: string; payWithDiamonds?: boolean }
  | { type: 'SUMMON_HERO_X10_CINEMATIC'; featuredHeroId?: string; payWithDiamonds?: boolean }
  | { type: 'SPARK_EXCHANGE'; optionId: string; targetHeroId?: string }
  | { type: 'AUTO_EQUIP_BEST_HEROES' }
  | { type: 'SAVE_TEAM_LOADOUT'; slot: number }
  | { type: 'LOAD_TEAM_LOADOUT'; slot: number }
  | { type: 'UNLOCK_TEAM_SLOT' }
  | { type: 'TOGGLE_EQUIP_HERO'; uid: string }
  | { type: 'SET_ACTIVE_TEAM'; heroIds: string[] }
  | { type: 'SET_HERO_FORMATION'; uid: string; role: HeroFormationRole }
  | { type: 'PLAY_DICE_ROLL'; forcedRoll?: number }
  | { type: 'PLAY_RECON_SWEEP'; forcedOutcome?: 'intel_gold' | 'intel_shards' | 'intel_buff' | 'ambush' }
  | { type: 'PLAY_LOCKPICK_CACHE'; forcedSuccess?: boolean }
  | { type: 'PLAY_TARGET_PRACTICE'; forcedScore?: number }
  | { type: 'START_MINI_BOUNTY_DRAFT'; draftType: MiniBountyDraftType }
  | { type: 'CLAIM_MINI_BOUNTY_DRAFT' }
  | { type: 'RUN_RIFT_DUNGEON'; useRaidTicket?: boolean }
  | { type: 'RUN_TREASURY_RAID'; useRaidTicket?: boolean }
  | { type: 'RECYCLE_HERO'; uid: string }
  | { type: 'AUTO_RECYCLE_HEROES' }
  | { type: 'SET_AUTO_RECYCLE_MAX_RARITY'; rarity: Rarity }
  | { type: 'SET_AUTO_RECYCLE_ENABLED'; enabled: boolean }
  | { type: 'TOGGLE_HERO_UNIQUE_WEAPON'; heroUid: string }
  | { type: 'RANK_UP_HERO'; uid: string }
  | { type: 'RANK_UP_HERO_TO_MAX'; uid: string }
  | { type: 'RANK_UP_HERO_TO_MAX_AND_REBIRTH'; uid: string }
  | { type: 'CONVERT_SCRAP_TO_ESSENCE'; count?: number }
  | { type: 'CONVERT_SCRAP_TO_SHARDS'; count?: number }
  | { type: 'SPEND_REBIRTH_CORE'; path: 'damage' | 'economy' | 'survival' }
  | { type: 'SET_AUTO_SUMMON_ENABLED'; enabled: boolean }
  | { type: 'SET_AUTO_SUMMON_MODE'; mode: 'single' | 'x10' }
  | { type: 'SET_AUTO_BURST_ENABLED'; enabled: boolean }
  | { type: 'SET_COMBAT_TEMPO'; tempo: CombatTempo }
  | { type: 'REBIRTH_HERO'; uid: string }
  | { type: 'SET_AUTO_TEMPO_ENABLED'; enabled: boolean }
  | { type: 'SET_AUTO_TEMPO_TARGET'; target: AutoTempoTarget }
  | { type: 'SET_AUTO_SUMMON_RESERVE_GOLD'; reserveGold: number }
  | { type: 'BUY_GOLD_SHOP_ITEM'; offerId: GoldShopOfferId }
  | { type: 'BUY_DIAMOND_SHOP_ITEM'; offerId: DiamondShopOfferId }
  | { type: 'SIMULATE_DOLLAR_PURCHASE'; offerId: DollarShopOfferId }
  | { type: 'CLAIM_VIP_REWARD'; level: number }
  | { type: 'BUY_PREMIUM_COOLANT'; itemId: 'coolant_mk1' | 'coolant_mk2'; amount?: number }
  | { type: 'USE_USABLE_ITEM'; itemId: string; amount?: number | 'all' }
  | { type: 'AUTO_DISMANTLE_EQUIPMENT' }
  | { type: 'SET_AUTO_DISMANTLE_ENABLED'; enabled: boolean }
  | { type: 'SET_AUTO_DISMANTLE_RARITY_FLOOR'; rarity: EquipmentRarity }
  | { type: 'DISMANTLE_EQUIPMENT'; itemId: string }
  | { type: 'CRAFT_EQUIPMENT'; slot: EquipmentSlot }
  | { type: 'UPGRADE_EQUIPMENT_RARITY'; itemId: string }
  | { type: 'SET_AUTO_USE_POTION'; enabled: boolean }
  | { type: 'SET_AUTO_USE_COOLANT'; enabled: boolean }
  | { type: 'SET_AUTO_USE_POTION_THRESHOLD'; thresholdPct: number }
  | { type: 'SPEND_ESSENCE_UPGRADE'; path: 'damage' | 'economy' | 'survival' }
  | { type: 'APPLY_WEEKLY_ROLLOVER'; nowMs: number }
  | { type: 'CLAIM_WEEKLY_TRACK'; milestone: number }
  | { type: 'CLAIM_MISSION'; missionId: string }
  | { type: 'CLAIM_CODEX_HERO_VIP'; heroId: string }
  | { type: 'CLAIM_CODEX_UNIQUE_VIP'; heroId: string }
  | { type: 'MARK_HINT_SEEN'; hintId: string }
  | { type: 'APPEND_MAIL_MESSAGES'; mails: MailMessage[] }
  | { type: 'CLAIM_MAIL_ATTACHMENT'; mailId: string; attachment: MailAttachmentKey }
  | { type: 'CLAIM_ALL_MAIL_ATTACHMENTS' }
  | { type: 'APPLY_OFFLINE_PROGRESS'; elapsedMs: number }
  | { type: 'SET_LAST_ACTIVE_AT'; timestampMs: number }
  | { type: 'APPLY_DAILY_LOGIN'; nowMs: number }
  | { type: 'REBIRTH' }
  | { type: 'CLEAR_ACHIEVEMENT' }
  | { type: 'CLEAR_REWARD_POPUP' }
  | { type: 'BATCH_LEVEL_HEROES'; heroIds: string[]; addLevels: number | 'max' }
  | { type: 'UPGRADE_FACILITY'; facilityId: 'training' | 'treasury' | 'forge' | 'tactics' }
  | { type: 'START_EXPEDITION'; expeditionType: ExpeditionType; offeredRarity?: ExpeditionRarity }
  | { type: 'REFRESH_EXPEDITION_CONTRACTS' }
  | { type: 'COMPLETE_EXPEDITION'; expeditionId: string }
  | { type: 'LOAD'; payload: Partial<SaveData> };

function reducer(state: GameState, action: Action): GameState {
  state = sanitizeRuntimeEconomyState(state);

  // Delegate minigame actions to extracted slice
  if (MINIGAME_ACTION_TYPES.has(action.type)) {
    const weekly = getCurrentWeeklyEvent(state);
    const result = minigamesReducer(state, action as MinigameAction, {
      dps: getDps(state),
      weeklyShardMult: weekly.shardMultiplier,
    });
    if (result) return result;
  }

  // Delegate progression actions to extracted slice
  if (PROGRESSION_ACTION_TYPES.has(action.type)) {
    const result = progressionReducer(state, action as ProgressionAction, {
      normalizeTeamSelection: normalizeTeamSelectionByRules,
      getTeamMaxHp,
      withAchievement,
    });
    if (result) return result;
  }

  // Delegate roster actions to extracted slice
  if (ROSTER_ACTION_TYPES.has(action.type)) {
    const result = rosterReducer(state, action as RosterAction, {
      withAchievement,
      getTeamMaxHp,
      normalizeTeamSelection: normalizeTeamSelectionByRules,
      getCurrentWeeklyEvent,
      getEquipmentEntry,
    });
    if (result) return result;
  }

  // Delegate economy actions to extracted slice
  if (ECONOMY_ACTION_TYPES.has(action.type)) {
    const result = economyReducer(state, action as EconomyAction, {
      withAchievement,
      getEquipmentEntry,
      getEquipmentUpgradePlan,
      createEquipmentInstance,
      hasUnlock,
      getForgeStatMultiplier,
      processLevelUp,
      addUsableItemCount,
      getVipLevelFromPoints,
      getVipDamageMultiplier,
      getVipGoldMultiplier,
      getVipExpMultiplier,
      maybeAutoRefreshExpeditionContracts,
      rollExpeditionContractOffers,
      getScrapToEssenceCost,
      getScrapToShardCost,
      getMaxHeatForLevel,
      clampInt,
    });
    if (result) return result;
  }

  // Delegate settings/config actions to extracted slice
  if (SETTINGS_ACTION_TYPES.has(action.type)) {
    const result = settingsReducer(state, action as SettingsAction, {
      clampInt,
      clampString,
      SAFE_INTEGER_CAP,
    });
    if (result) return result;
  }

  switch (action.type) {
    case 'CREATE_CHARACTER': {
      if (state.characterCreated) return state;
      const name = action.name.trim().slice(0, 24);
      if (!name) return state;
      const starterItems = getStarterEquipmentForClass(action.playerClass)
        .map(itemId => getEquipmentItem(itemId))
        .filter((item): item is EquipmentItem => !!item)
        .map(item => createEquipmentInstance(item, 1, 'starter'));
      const starterEquip: Record<EquipmentSlot, string | null> = {
        weapon: null,
        armor: null,
        accessory: null,
      };
      for (const item of starterItems) {
        starterEquip[item.slot as EquipmentSlot] = item.id;
      }

      const newState: GameState = {
        ...state,
        characterCreated: true,
        playerName: name,
        playerClass: action.playerClass,
        unspentStatPoints: 10, // starting stat points to customise immediately
        gold: 100, // starting gold to feel snappy
        inventoryItemIds: starterItems.map(item => item.id),
        equipmentInventory: Object.fromEntries(starterItems.map(item => [item.id, item])),
        equippedItems: starterEquip,
        mailbox: [
          createWelcomeGiftMail(),
          ...state.mailbox.filter(mail => !mail.id.startsWith(WELCOME_GIFT_MAIL_ID)),
        ].slice(0, 100),
      };
      const maxHp = getTeamMaxHp(newState);
      return { ...newState, teamHp: maxHp, teamMaxHp: maxHp };
    }

    case 'TICK': {
      return advanceCombatStep(state, action.elapsed);
    }

    case 'BURST': {
      return applyBurst(state, action.hits);
    }

    // BUY_PARTY, BUY_SKILL handled by economyReducer

    // ALLOCATE_STAT, ALLOCATE_STAT_MAX, ALLOCATE_STAT_N handled by progressionReducer

    // EQUIP_ITEM, SUMMON_HERO, SUMMON_HERO_X10, SUMMON_HERO_X10_CINEMATIC,
    // AUTO_EQUIP_BEST_HEROES, SAVE_TEAM_LOADOUT, LOAD_TEAM_LOADOUT,
    // UNLOCK_TEAM_SLOT, TOGGLE_EQUIP_HERO, SET_ACTIVE_TEAM
    // handled by rosterReducer

    // USE_USABLE_ITEM, DISMANTLE_EQUIPMENT, AUTO_DISMANTLE_EQUIPMENT,
    // CRAFT_EQUIPMENT, UPGRADE_EQUIPMENT_RARITY handled by economyReducer

    // SET_AUTO_USE_POTION, SET_AUTO_USE_COOLANT, SET_AUTO_USE_POTION_THRESHOLD,
    // MARK_HINT_SEEN, APPEND_MAIL_MESSAGES, SET_LAST_ACTIVE_AT,
    // SET_AUTO_RECYCLE_MAX_RARITY, SET_AUTO_RECYCLE_ENABLED,
    // SET_AUTO_SUMMON_ENABLED, SET_AUTO_SUMMON_MODE, SET_AUTO_BURST_ENABLED,
    // SET_COMBAT_TEMPO, SET_AUTO_TEMPO_ENABLED, SET_AUTO_TEMPO_TARGET,
    // SET_AUTO_SUMMON_RESERVE_GOLD handled by settingsReducer

    // SPEND_ESSENCE_UPGRADE, APPLY_WEEKLY_ROLLOVER, CLAIM_WEEKLY_TRACK,
    // CLAIM_MISSION handled by progressionReducer

    // CLAIM_MAIL_ATTACHMENT, CLAIM_ALL_MAIL_ATTACHMENTS handled by economyReducer

    case 'APPLY_OFFLINE_PROGRESS': {
      if (!state.characterCreated) return state;
      const elapsed = Math.max(0, Math.min(action.elapsedMs, OFFLINE_PROGRESS_CAP_MS));
      if (elapsed < 5000) return { ...state, lastActiveAt: Date.now() };
      const startWave = state.wave;
      const startKills = state.totalKills;
      const startGold = state.gold;
      const startExp = state.totalExp;
      const startItems = state.inventoryItemIds.length;
      const startUsableCount = Object.values(state.usableItemCounts).reduce(
        (sum, count) => sum + Math.max(0, count),
        0,
      );
      const simulation = simulateOfflineProgress(state, elapsed);
      const working = simulation.state;

      const killsGained = working.totalKills - startKills;
      const wavesGained = Math.max(0, working.wave - startWave);
      const goldGain = Math.max(0, working.gold - startGold);
      const expGain = Math.max(0, working.totalExp - startExp);
      const itemsGained = Math.max(0, working.inventoryItemIds.length - startItems);
      const usableNetGain = Math.max(
        0,
        Object.values(working.usableItemCounts).reduce((sum, count) => sum + Math.max(0, count), 0) - startUsableCount,
      );

      const next = queueReward(
        {
          ...working,
          lastActiveAt: Date.now(),
        },
        {
          id: `offline_${Date.now()}`,
          kind: 'system',
          title: 'Offline Progress',
          detail: `+${killsGained} kills • +${wavesGained} waves • +${goldGain} gold • +${expGain} EXP${itemsGained > 0 ? ` • +${itemsGained} gear` : ''}${usableNetGain > 0 ? ` • +${usableNetGain} usable` : ''} • now Wave ${working.wave}${simulation.reachedIterationCap ? ' (simulation budget reached)' : ''}`,
        },
      );
      return withAchievement(next);
    }

    // APPLY_DAILY_LOGIN, REBIRTH, CLEAR_ACHIEVEMENT, CLEAR_REWARD_POPUP
    // handled by progressionReducer

    // RECYCLE_HERO, AUTO_RECYCLE_HEROES handled by rosterReducer

    case 'SET_HERO_FORMATION': // handled by rosterReducer
    case 'BATCH_LEVEL_HEROES': // handled by rosterReducer
      return state; // delegation above will have already handled these

    // Minigame cases (PLAY_DICE_ROLL, PLAY_RECON_SWEEP, PLAY_LOCKPICK_CACHE,
    // PLAY_TARGET_PRACTICE, START_MINI_BOUNTY_DRAFT, CLAIM_MINI_BOUNTY_DRAFT,
    // RUN_RIFT_DUNGEON, RUN_TREASURY_RAID) are handled by minigamesReducer
    // via delegation above the switch.

    // UPGRADE_FACILITY, START_EXPEDITION, REFRESH_EXPEDITION_CONTRACTS,
    // COMPLETE_EXPEDITION handled by economyReducer

    // TOGGLE_HERO_UNIQUE_WEAPON, RANK_UP_HERO, RANK_UP_HERO_TO_MAX,
    // RANK_UP_HERO_TO_MAX_AND_REBIRTH, LEVEL_UP_HERO_GOLD,
    // REBIRTH_HERO handled by rosterReducer

    // CONVERT_SCRAP_TO_ESSENCE, CONVERT_SCRAP_TO_SHARDS handled by economyReducer

    // SPEND_REBIRTH_CORE handled by progressionReducer

    // BUY_GOLD_SHOP_ITEM, BUY_DIAMOND_SHOP_ITEM, SIMULATE_DOLLAR_PURCHASE,
    // BUY_PREMIUM_COOLANT handled by economyReducer

    // CLAIM_VIP_REWARD, CLAIM_CODEX_HERO_VIP, CLAIM_CODEX_UNIQUE_VIP
    // handled by progressionReducer

    case 'LOAD': {
      const p = sanitizeSaveData(action.payload);
      return maybeAutoRefreshExpeditionContracts(
        {
          ...DEFAULT_STATE,
          playerName: p.playerName,
          playerClass: p.playerClass,
          characterCreated: p.characterCreated,

          gold: p.gold,
          totalGold: p.totalGold,
          exp: p.exp,
          totalExp: p.totalExp,
          level: p.level,
          highestWaveReached: p.highestWaveReached,
          unspentStatPoints: p.unspentStatPoints,
          statsAlloc: p.statsAlloc,

          totalKills: p.totalKills,
          burstCharge: p.burstCharge,
          combatHeat: p.combatHeat,
          wave: p.wave,
          monsterHp: p.monsterHp,
          monsterMaxHp: p.monsterMaxHp,
          teamHp: p.teamHp,
          teamMaxHp: p.teamMaxHp,

          skills: new Set(p.skills),

          heroRoster: p.heroRoster,
          activeTeamHeroIds: p.activeTeamHeroIds,
          totalSummons: p.totalSummons,
          firstSummonGiven: p.firstSummonGiven,
          freeSummonCharges: p.freeSummonCharges,
          diamonds: p.diamonds,
          bossTears: p.bossTears,
          heroShards: p.heroShards,
          essence: p.essence,
          rebirthCores: p.rebirthCores,
          rebirthDamagePath: p.rebirthDamagePath,
          rebirthEconomyPath: p.rebirthEconomyPath,
          rebirthSurvivalPath: p.rebirthSurvivalPath,
          autoRecycleMaxRarity: p.autoRecycleMaxRarity,
          equipmentScrap: p.equipmentScrap,
          gachaPityCounter: p.gachaPityCounter,
          sparkTokens: p.sparkTokens,
          claimedSummonMilestones: p.claimedSummonMilestones,
          guaranteedMinRarity: p.guaranteedMinRarity,
          summonHistory: p.summonHistory,
          teamLoadouts: p.teamLoadouts,
          teamSlotsUnlocked: p.teamSlotsUnlocked,
          heroFormationByUid: p.heroFormationByUid,
          heroUniqueGearByHeroId: p.heroUniqueGearByHeroId ?? {},
          lastDiceRollDay: p.lastDiceRollDay,
          riftDungeonLevel: p.riftDungeonLevel ?? 1,
          riftEntriesUsedToday: p.riftEntriesUsedToday ?? 0,
          riftEntryDay: p.riftEntryDay ?? null,
          riftRaidTickets: p.riftRaidTickets ?? 0,
          lastRiftBossDamagePct: p.lastRiftBossDamagePct ?? 0,
          lastDiceRollValue: p.lastDiceRollValue,
          lastRiftWavesCleared: p.lastRiftWavesCleared,
          treasureDungeonLevel: p.treasureDungeonLevel ?? 1,
          treasureEntriesUsedToday: p.treasureEntriesUsedToday ?? 0,
          treasureEntryDay: p.treasureEntryDay ?? null,
          lastTreasureHaulPct: p.lastTreasureHaulPct ?? 0,
          lastTreasureWiped: p.lastTreasureWiped ?? false,
          lastReconSweepDay: p.lastReconSweepDay,
          lastLockpickDay: p.lastLockpickDay,
          lastTargetPracticeDay: p.lastTargetPracticeDay,
          lastBountyDraftDay: p.lastBountyDraftDay,
          miniBounty: p.miniBounty
            ? {
                ...p.miniBounty,
                metric:
                  p.miniBounty.metric === 'wave' ? 'wave' : p.miniBounty.metric === 'summons' ? 'summons' : 'kills',
              }
            : null,
          guildhallFacilities: p.guildhallFacilities ?? DEFAULT_STATE.guildhallFacilities,
          expeditionQueue: p.expeditionQueue ?? DEFAULT_STATE.expeditionQueue,
          lastExpeditionDay: p.lastExpeditionDay ?? DEFAULT_STATE.lastExpeditionDay,
          expeditionContractOffers: p.expeditionContractOffers ?? DEFAULT_STATE.expeditionContractOffers,
          expeditionContractsRefreshedAt:
            p.expeditionContractsRefreshedAt ?? DEFAULT_STATE.expeditionContractsRefreshedAt,
          classMasteryXp: p.classMasteryXp,
          seasonPoints: p.seasonPoints,
          bestSeasonPoints: p.bestSeasonPoints,
          dailyLoginStreak: p.dailyLoginStreak,
          lastDailyLoginDay: p.lastDailyLoginDay,
          streakInsuranceCharges: p.streakInsuranceCharges,
          weeklyEventWeek: p.weeklyEventWeek,
          weeklyEventId: p.weeklyEventId,
          weeklyKills: p.weeklyKills,
          weeklyTrackClaimed: p.weeklyTrackClaimed,
          claimedMissionIds: p.claimedMissionIds,
          codexVipClaimedHeroIds: p.codexVipClaimedHeroIds,
          codexVipClaimedUniqueIds: p.codexVipClaimedUniqueIds,
          seenHintIds: p.seenHintIds,
          permanentUnlocks: p.permanentUnlocks,
          metaDamageLevel: p.metaDamageLevel,
          metaEconomyLevel: p.metaEconomyLevel,
          metaSurvivalLevel: p.metaSurvivalLevel,
          vipPoints: p.vipPoints,
          vipLevel: p.vipLevel,
          vipRewardClaimedLevels: p.vipRewardClaimedLevels,
          dollarFirstPurchaseClaimedOfferIds: p.dollarFirstPurchaseClaimedOfferIds,

          inventoryItemIds: p.inventoryItemIds,
          equipmentInventory: p.equipmentInventory,
          equippedItems: p.equippedItems,
          autoDismantleRarityFloor: EQUIPMENT_RARITY_SET.has(p.autoDismantleRarityFloor)
            ? p.autoDismantleRarityFloor
            : 'common',
          autoDismantleEnabled: !!p.autoDismantleEnabled,
          usableItemCounts: p.usableItemCounts,
          autoUsePotionEnabled: p.autoUsePotionEnabled,
          autoUseCoolantEnabled: p.autoUseCoolantEnabled,
          autoUsePotionThresholdPct: p.autoUsePotionThresholdPct,
          autoRecycleEnabled: p.autoRecycleEnabled,
          autoSummonEnabled: p.autoSummonEnabled,
          autoSummonMode: p.autoSummonMode,
          autoBurstEnabled: p.autoBurstEnabled,
          combatTempo: clampCombatTempoForVip(p.combatTempo === 2 || p.combatTempo === 4 ? p.combatTempo : 1, p),
          autoTempoEnabled: p.autoTempoEnabled,
          autoTempoTarget: clampAutoTempoTargetForVip(p.autoTempoTarget === 4 ? 4 : 2, p),
          autoSummonReserveGold: p.autoSummonReserveGold,
          autoSummonCooldownMs: 0,
          lastActiveAt: p.lastActiveAt,

          prestigeCount: p.prestigeCount,
          achievements: new Set(p.achievements),
          newAchievement: null,
          rewardQueue: [],
          combatLog: p.combatLog,
          damageBuffPct: p.damageBuffPct,
          damageBuffMs: p.damageBuffMs,
          damageReductionBuffPct: p.damageReductionBuffPct,
          damageReductionBuffMs: p.damageReductionBuffMs,
          heroActiveCdMs: p.heroActiveCdMs,
          mailbox: p.mailbox ?? [],
        },
        Date.now(),
      );
    }

    default:
      return state;
  }
}

export interface SaveData {
  saveVersion?: number;
  playerName: string;
  playerClass: PlayerClass | null;
  characterCreated: boolean;

  gold: number;
  diamonds?: number;
  totalGold: number;
  exp: number;
  totalExp: number;
  level: number;
  highestWaveReached: number;
  highestLevelReached?: number;
  unspentStatPoints: number;
  statsAlloc: StatBlock;

  totalKills: number;
  burstCharge?: number;
  combatHeat?: number;
  wave: number;
  monsterHp: number;
  teamHp: number;

  skills: string[];

  heroRoster: HeroUnit[];
  activeTeamHeroIds: string[];
  totalSummons: number;
  firstSummonGiven: boolean;
  freeSummonCharges: number;
  heroShards: number;
  bossTears: number;
  essence: number;
  rebirthCores: number;
  rebirthDamagePath: number;
  rebirthEconomyPath: number;
  rebirthSurvivalPath: number;
  autoRecycleMaxRarity: Rarity;
  equipmentScrap: number;
  gachaPityCounter: number;
  sparkTokens: number;
  claimedSummonMilestones: number[];
  guaranteedMinRarity: Rarity | null;
  summonHistory: SummonHistoryEntry[];
  teamLoadouts: string[][];
  teamSlotsUnlocked?: number;
  heroFormationByUid: Record<string, HeroFormationRole>;
  heroUniqueGearByHeroId: Record<string, HeroUniqueGearProgress>;
  lastDiceRollDay?: number | null;
  lastRiftRunDay?: number | null;
  riftDungeonLevel?: number;
  riftEntriesUsedToday?: number;
  riftEntryDay?: number | null;
  riftRaidTickets?: number;
  lastRiftBossDamagePct?: number;
  lastDiceRollValue?: number | null;
  lastRiftWavesCleared?: number;
  treasureDungeonLevel?: number;
  treasureEntriesUsedToday?: number;
  treasureEntryDay?: number | null;
  lastTreasureHaulPct?: number;
  lastTreasureWiped?: boolean;
  lastReconSweepDay?: number | null;
  lastLockpickDay?: number | null;
  lastTargetPracticeDay?: number | null;
  lastBountyDraftDay?: number | null;
  miniBounty?: {
    id: string;
    title: string;
    metric: MiniBountyMetric;
    startValue: number;
    targetValue: number;
    rewardGold: number;
    rewardShards: number;
    rewardDiamonds: number;
    claimed: boolean;
  } | null;

  guildhallFacilities?: Record<'training' | 'treasury' | 'forge' | 'tactics', { level: number }>;
  expeditionQueue?: GameState['expeditionQueue'];
  lastExpeditionDay?: Record<ExpeditionType, number | null>;
  expeditionContractOffers?: Record<ExpeditionType, ExpeditionRarity>;
  expeditionContractsRefreshedAt?: number;

  classMasteryXp: Record<PlayerClass, number>;
  seasonPoints: number;
  bestSeasonPoints: number;
  dailyLoginStreak: number;
  lastDailyLoginDay: number | null;
  streakInsuranceCharges: number;
  weeklyEventWeek: number;
  weeklyEventId: string;
  weeklyKills: number;
  weeklyTrackClaimed: number[];
  claimedMissionIds: string[];
  codexVipClaimedHeroIds?: string[];
  codexVipClaimedUniqueIds?: string[];
  seenHintIds: string[];
  permanentUnlocks: PermanentUnlockId[];
  metaDamageLevel: number;
  metaEconomyLevel: number;
  metaSurvivalLevel: number;
  vipPoints?: number;
  vipLevel?: number;
  vipRewardClaimedLevels?: number[];
  dollarFirstPurchaseClaimedOfferIds?: string[];

  inventoryItemIds: string[];
  equipmentInventory?: Record<string, EquipmentInstance>;
  equippedItems: Record<EquipmentSlot, string | null>;
  autoDismantleRarityFloor?: EquipmentRarity;
  autoDismantleEnabled?: boolean;
  usableItemCounts: Record<string, number>;
  autoUsePotionEnabled: boolean;
  autoUseCoolantEnabled?: boolean;
  autoUsePotionThresholdPct: number;
  autoRecycleEnabled: boolean;
  autoSummonEnabled: boolean;
  autoSummonMode: 'single' | 'x10';
  autoBurstEnabled?: boolean;
  combatTempo?: CombatTempo;
  autoTempoEnabled?: boolean;
  autoTempoTarget?: AutoTempoTarget;
  autoSummonReserveGold: number;
  lastActiveAt: number;

  prestigeCount: number;
  achievements: string[];
  combatLog: string[];
  damageBuffPct: number;
  damageBuffMs: number;
  damageReductionBuffPct: number;
  damageReductionBuffMs: number;
  heroActiveCdMs: Record<string, number>;
  mailbox?: MailMessage[];
  giftPreference?: 'gold' | 'shards' | 'essence';
}

export function serialize(state: GameState): SaveData {
  return {
    saveVersion: SAVE_SCHEMA_VERSION,
    playerName: state.playerName,
    playerClass: state.playerClass,
    characterCreated: state.characterCreated,

    gold: state.gold,
    diamonds: state.diamonds,
    totalGold: state.totalGold,
    exp: state.exp,
    totalExp: state.totalExp,
    level: state.level,
    highestWaveReached: state.highestWaveReached,
    unspentStatPoints: state.unspentStatPoints,
    statsAlloc: state.statsAlloc,

    totalKills: state.totalKills,
    burstCharge: state.burstCharge,
    combatHeat: state.combatHeat,
    wave: state.wave,
    monsterHp: state.monsterHp,
    teamHp: state.teamHp,

    skills: Array.from(state.skills),

    heroRoster: state.heroRoster,
    activeTeamHeroIds: state.activeTeamHeroIds,
    totalSummons: state.totalSummons,
    firstSummonGiven: state.firstSummonGiven,
    freeSummonCharges: state.freeSummonCharges,
    bossTears: state.bossTears,
    heroShards: state.heroShards,
    essence: state.essence,
    rebirthCores: state.rebirthCores,
    rebirthDamagePath: state.rebirthDamagePath,
    rebirthEconomyPath: state.rebirthEconomyPath,
    rebirthSurvivalPath: state.rebirthSurvivalPath,
    autoRecycleMaxRarity: state.autoRecycleMaxRarity,
    equipmentScrap: state.equipmentScrap,
    gachaPityCounter: state.gachaPityCounter,
    sparkTokens: state.sparkTokens,
    claimedSummonMilestones: state.claimedSummonMilestones,
    guaranteedMinRarity: state.guaranteedMinRarity,
    summonHistory: state.summonHistory,
    teamLoadouts: state.teamLoadouts,
    teamSlotsUnlocked: state.teamSlotsUnlocked,
    heroFormationByUid: state.heroFormationByUid,
    heroUniqueGearByHeroId: state.heroUniqueGearByHeroId,
    lastDiceRollDay: state.lastDiceRollDay,
    riftDungeonLevel: state.riftDungeonLevel,
    riftEntriesUsedToday: state.riftEntriesUsedToday,
    riftEntryDay: state.riftEntryDay,
    riftRaidTickets: state.riftRaidTickets,
    lastRiftBossDamagePct: state.lastRiftBossDamagePct,
    lastDiceRollValue: state.lastDiceRollValue,
    lastRiftWavesCleared: state.lastRiftWavesCleared,
    treasureDungeonLevel: state.treasureDungeonLevel,
    treasureEntriesUsedToday: state.treasureEntriesUsedToday,
    treasureEntryDay: state.treasureEntryDay,
    lastTreasureHaulPct: state.lastTreasureHaulPct,
    lastTreasureWiped: state.lastTreasureWiped,
    lastReconSweepDay: state.lastReconSweepDay,
    lastLockpickDay: state.lastLockpickDay,
    lastTargetPracticeDay: state.lastTargetPracticeDay,
    lastBountyDraftDay: state.lastBountyDraftDay,
    miniBounty: state.miniBounty,
    guildhallFacilities: state.guildhallFacilities,
    expeditionQueue: state.expeditionQueue,
    lastExpeditionDay: state.lastExpeditionDay,
    expeditionContractOffers: state.expeditionContractOffers,
    expeditionContractsRefreshedAt: state.expeditionContractsRefreshedAt,
    classMasteryXp: state.classMasteryXp,
    seasonPoints: state.seasonPoints,
    bestSeasonPoints: state.bestSeasonPoints,
    dailyLoginStreak: state.dailyLoginStreak,
    lastDailyLoginDay: state.lastDailyLoginDay,
    streakInsuranceCharges: state.streakInsuranceCharges,
    weeklyEventWeek: state.weeklyEventWeek,
    weeklyEventId: state.weeklyEventId,
    weeklyKills: state.weeklyKills,
    weeklyTrackClaimed: state.weeklyTrackClaimed,
    claimedMissionIds: state.claimedMissionIds,
    codexVipClaimedHeroIds: state.codexVipClaimedHeroIds,
    codexVipClaimedUniqueIds: state.codexVipClaimedUniqueIds,
    seenHintIds: state.seenHintIds,
    permanentUnlocks: state.permanentUnlocks,
    metaDamageLevel: state.metaDamageLevel,
    metaEconomyLevel: state.metaEconomyLevel,
    metaSurvivalLevel: state.metaSurvivalLevel,
    vipPoints: state.vipPoints,
    vipLevel: state.vipLevel,
    vipRewardClaimedLevels: state.vipRewardClaimedLevels,
    dollarFirstPurchaseClaimedOfferIds: state.dollarFirstPurchaseClaimedOfferIds,

    inventoryItemIds: state.inventoryItemIds,
    equipmentInventory: state.equipmentInventory,
    equippedItems: state.equippedItems,
    autoDismantleRarityFloor: state.autoDismantleRarityFloor,
    autoDismantleEnabled: state.autoDismantleEnabled,
    usableItemCounts: state.usableItemCounts,
    autoUsePotionEnabled: state.autoUsePotionEnabled,
    autoUseCoolantEnabled: state.autoUseCoolantEnabled,
    autoUsePotionThresholdPct: state.autoUsePotionThresholdPct,
    autoRecycleEnabled: state.autoRecycleEnabled,
    autoSummonEnabled: state.autoSummonEnabled,
    autoSummonMode: state.autoSummonMode,
    autoBurstEnabled: state.autoBurstEnabled,
    combatTempo: state.combatTempo,
    autoTempoEnabled: state.autoTempoEnabled,
    autoTempoTarget: state.autoTempoTarget,
    autoSummonReserveGold: state.autoSummonReserveGold,
    lastActiveAt: Date.now(),

    prestigeCount: state.prestigeCount,
    achievements: Array.from(state.achievements),
    combatLog: state.combatLog,
    damageBuffPct: state.damageBuffPct,
    damageBuffMs: state.damageBuffMs,
    damageReductionBuffPct: state.damageReductionBuffPct,
    damageReductionBuffMs: state.damageReductionBuffMs,
    heroActiveCdMs: state.heroActiveCdMs,
    mailbox: state.mailbox,
    giftPreference: state.giftPreference,
  };
}

export function useGameState(saveSlot: string = 'default') {
  const onlineSlotEligible = !saveSlot.startsWith('__character_slot_preview__');
  const [state, rawDispatch] = useReducer(reducer, DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [onlineSyncState, setOnlineSyncState] = useState<'local-only' | 'syncing' | 'synced' | 'conflict' | 'error'>(
    'local-only',
  );
  const [onlineSyncAt, setOnlineSyncAt] = useState<number | null>(null);
  // eslint-disable-next-line react-hooks/purity -- ref initial values only evaluate once; Date.now() is intentional for tick/save baselines
  const lastTickRef = useRef(Date.now());
  // eslint-disable-next-line react-hooks/purity
  const lastSaveRef = useRef(Date.now());
  const stateRef = useRef(state);
  const claimFingerprintRef = useRef('');
  const onlineRevisionRef = useRef<number | null>(null);
  const lastOnlineSaveRef = useRef(0);
  const onlineSyncDisabledRef = useRef(false);
  const sessionStartedRef = useRef(false);
  const sessionStartedAtRef = useRef(0);
  const sessionStartHighestWaveRef = useRef(1);
  const prevSummonsRef = useRef(0);
  const prevHighestWaveRef = useRef(1);
  const prevPrestigeRef = useRef(0);
  const actionDispatchCountsRef = useRef<Partial<Record<Action['type'], number>>>({});
  stateRef.current = state;

  const dispatch = useCallback(
    (action: Action) => {
      rawDispatch(action);

      if (action.type === 'TICK') return;
      const nextCount = (actionDispatchCountsRef.current[action.type] ?? 0) + 1;
      actionDispatchCountsRef.current[action.type] = nextCount;

      debugLog('dispatch', `Action ${action.type}`, {
        saveSlot,
        count: nextCount,
        wave: stateRef.current.wave,
        level: stateRef.current.level,
        prestige: stateRef.current.prestigeCount,
      });

      const throttleMs = ACTION_TELEMETRY_SAMPLE[action.type];
      if (throttleMs !== undefined) {
        void trackGameplayAction(
          `action_${action.type.toLowerCase()}`,
          {
            saveSlot,
            wave: stateRef.current.wave,
            level: stateRef.current.level,
            prestigeCount: stateRef.current.prestigeCount,
            totalKills: stateRef.current.totalKills,
          },
          throttleMs,
        );
      }

      // Rich dedicated events for key conversion/economy actions.
      if (action.type === 'CREATE_CHARACTER') {
        void trackEvent('character_created', {
          playerClass: action.playerClass,
          saveSlot,
        });
      }

      if (action.type === 'BUY_DIAMOND_SHOP_ITEM') {
        const cost = DIAMOND_SHOP_COSTS[action.offerId];
        void trackEvent('spend_diamonds', {
          item_id: action.offerId,
          diamonds_spent: cost,
          diamonds_before: stateRef.current.diamonds,
          wave: stateRef.current.wave,
          level: stateRef.current.level,
        });
      }

      if (action.type === 'SIMULATE_DOLLAR_PURCHASE') {
        const pack = DOLLAR_SHOP_PACKS[action.offerId];
        if (pack) {
          void trackEvent('purchase', {
            item_id: action.offerId,
            value: pack.usdCents / 100,
            currency: 'USD',
            diamonds_received: pack.diamonds,
          });
        }
      }

      if (action.type === 'REBIRTH') {
        void trackEvent('rebirth', {
          prestige_count: stateRef.current.prestigeCount + 1,
          wave: stateRef.current.wave,
          level: stateRef.current.level,
        });
      }
    },
    [saveSlot],
  );

  const persistSnapshot = useCallback(
    async (forceOnline = false, snapshotOverride?: SaveData) => {
      const snapshot = snapshotOverride ?? serialize(stateRef.current);
      if (!onlineSlotEligible || onlineSyncDisabledRef.current || !isOnlineSaveAvailable()) {
        setOnlineSyncState('local-only');
        return;
      }

      const now = Date.now();
      if (!forceOnline && now - lastOnlineSaveRef.current < ONLINE_SAVE_INTERVAL_MS) return;

      setOnlineSyncState('syncing');
      const firstAttempt = await writeOnlineSave(
        saveSlot,
        snapshot as unknown as Record<string, unknown>,
        onlineRevisionRef.current,
      );
      if (firstAttempt.ok) {
        onlineRevisionRef.current = firstAttempt.revision;
        lastOnlineSaveRef.current = now;
        setOnlineSyncState('synced');
        setOnlineSyncAt(now);
        return;
      }

      const remote = firstAttempt.remote;
      if (!remote) {
        if (firstAttempt.errorCode === 'permission-denied' || firstAttempt.errorCode === 'invalid-slot') {
          onlineSyncDisabledRef.current = true;
          setOnlineSyncState('local-only');
          return;
        }
        setOnlineSyncState('error');
        return;
      }

      const remoteUpdatedAt = Math.max(0, Math.floor(remote.updatedAt));
      const localUpdatedAt = typeof snapshot.lastActiveAt === 'number' ? snapshot.lastActiveAt : now;
      if (remoteUpdatedAt > localUpdatedAt) {
        onlineRevisionRef.current = remote.revision;
        setOnlineSyncState('conflict');
        dispatch({ type: 'LOAD', payload: remote.payload as Partial<SaveData> });
        return;
      }

      const retryAttempt = await writeOnlineSave(
        saveSlot,
        snapshot as unknown as Record<string, unknown>,
        remote.revision,
      );
      if (retryAttempt.ok) {
        onlineRevisionRef.current = retryAttempt.revision;
        lastOnlineSaveRef.current = now;
        setOnlineSyncState('synced');
        setOnlineSyncAt(now);
      } else if (retryAttempt.remote) {
        onlineRevisionRef.current = retryAttempt.remote.revision;
        setOnlineSyncState('error');
      } else if (retryAttempt.errorCode === 'permission-denied' || retryAttempt.errorCode === 'invalid-slot') {
        onlineSyncDisabledRef.current = true;
        setOnlineSyncState('local-only');
      }
    },
    [dispatch, onlineSlotEligible, saveSlot],
  );

  useEffect(() => {
    setHydrated(false);
    setLoadProgress(0);
    debugLog('save', 'Loading save slot', { saveSlot });
    dispatch({ type: 'LOAD', payload: {} });
    sessionStartedRef.current = false;
    sessionStartedAtRef.current = 0;
    sessionStartHighestWaveRef.current = 1;
    prevSummonsRef.current = 0;
    prevHighestWaveRef.current = 1;
    prevPrestigeRef.current = 0;
    onlineRevisionRef.current = null;
    lastOnlineSaveRef.current = 0;
    onlineSyncDisabledRef.current = false;
    setOnlineSyncState(onlineSlotEligible && isOnlineSaveAvailable() ? 'syncing' : 'local-only');
    setOnlineSyncAt(null);
    claimFingerprintRef.current = '';
    lastTickRef.current = Date.now();
    lastSaveRef.current = Date.now();

    let cancelled = false;
    void (async () => {
      const onlineAvailable = onlineSlotEligible && isOnlineSaveAvailable();
      if (!onlineAvailable) {
        debugLog('save', 'No online save available; using defaults', { saveSlot });
        setLoadProgress(100);
        return;
      }
      setLoadProgress(5); // header fetch started
      const remoteResult = await loadOnlineSave<Record<string, unknown>>(saveSlot, (loaded, total, chunkName) => {
        if (!cancelled) {
          // Map chunk progress into the 5–85% range (header=5%, chunks=5-85%, post-processing=85-100%)
          const pct = Math.round(5 + (loaded / total) * 80);
          setLoadProgress(pct);
          debugLog('save', `Loaded chunk ${chunkName}`, { loaded, total });
        }
      });
      if (cancelled) return;

      if (!remoteResult.ok) {
        if (remoteResult.errorCode === 'permission-denied' || remoteResult.errorCode === 'invalid-slot') {
          onlineSyncDisabledRef.current = true;
          setOnlineSyncState('local-only');
        } else {
          setOnlineSyncState('error');
        }
        setLoadProgress(100);
        return;
      }

      const remote = remoteResult.ok ? remoteResult.data : null;

      if (!remote) {
        debugLog('save', 'No existing save found; using defaults', { saveSlot });
        setOnlineSyncState('synced');
        setLoadProgress(100);
        return;
      }

      onlineRevisionRef.current = remote.revision;
      setOnlineSyncState('synced');
      setOnlineSyncAt(remote.updatedAt);
      debugLog('save', 'Loaded cloud save', {
        saveSlot,
        wave: (remote.payload as Partial<SaveData>).wave,
        level: (remote.payload as Partial<SaveData>).level,
        revision: remote.revision,
      });

      const payload = remote.payload as Partial<SaveData>;
      setLoadProgress(88);
      setLoadProgress(95);
      dispatch({ type: 'LOAD', payload });
      const elapsed = Date.now() - (payload.lastActiveAt ?? Date.now());
      dispatch({ type: 'APPLY_OFFLINE_PROGRESS', elapsedMs: elapsed });
      dispatch({ type: 'APPLY_DAILY_LOGIN', nowMs: Date.now() });
      dispatch({ type: 'APPLY_WEEKLY_ROLLOVER', nowMs: Date.now() });

      const uid = getFirebaseAuth()?.currentUser?.uid;
      if (uid) {
        void (async () => {
          try {
            const cloudMails = await fetchCloudMail(uid);
            if (cloudMails.length === 0) return;

            const mails: MailMessage[] = cloudMails.map(mail => ({
              id: mail.id,
              subject: mail.subject,
              message: mail.message,
              from: mail.from,
              sentAt: mail.sentAt,
              attachments: mail.attachments,
              claimedAttachments: emptyAttachments(),
            }));
            dispatch({ type: 'APPEND_MAIL_MESSAGES', mails });

            await Promise.allSettled(cloudMails.map(mail => claimCloudMail(uid, mail.id)));
          } catch {
            // Non-fatal. The real-time cloud mail listener in GameScreen will still surface messages.
          }
        })();
      }

      setLoadProgress(100);
    })().finally(() => {
      if (!cancelled) setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [dispatch, onlineSlotEligible, saveSlot]);

  useEffect(() => {
    if (!state.characterCreated) return;
    const today = toDayNumber(Date.now());
    if (state.lastDailyLoginDay !== today) {
      dispatch({ type: 'APPLY_DAILY_LOGIN', nowMs: Date.now() });
    }
  }, [dispatch, state.characterCreated, state.lastDailyLoginDay]);

  useEffect(() => {
    if (!state.characterCreated) return;
    const week = weekNumberForTimestamp(Date.now());
    if (state.weeklyEventWeek !== week) {
      dispatch({ type: 'APPLY_WEEKLY_ROLLOVER', nowMs: Date.now() });
    }
  }, [dispatch, state.characterCreated, state.weeklyEventWeek]);

  useEffect(() => {
    if (!hydrated || !state.characterCreated) return;
    const fingerprint = `${state.weeklyTrackClaimed.join(',')}|${state.claimedMissionIds.join(',')}|${state.codexVipClaimedHeroIds.join(',')}|${state.codexVipClaimedUniqueIds.join(',')}|${state.vipRewardClaimedLevels.join(',')}|${state.dollarFirstPurchaseClaimedOfferIds.join(',')}`;
    if (fingerprint === claimFingerprintRef.current) return;
    claimFingerprintRef.current = fingerprint;
    lastSaveRef.current = Date.now();
    void persistSnapshot(true);
  }, [
    hydrated,
    state.characterCreated,
    state.weeklyTrackClaimed,
    state.claimedMissionIds,
    state.codexVipClaimedHeroIds,
    state.codexVipClaimedUniqueIds,
    state.vipRewardClaimedLevels,
    state.dollarFirstPurchaseClaimedOfferIds,
    persistSnapshot,
  ]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;
      dispatch({ type: 'TICK', elapsed });

      if (stateRef.current.characterCreated && now - lastSaveRef.current >= SAVE_INTERVAL_MS) {
        lastSaveRef.current = now;
        void persistSnapshot();
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [dispatch, persistSnapshot]);

  useEffect(() => {
    if (!state.characterCreated || sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    sessionStartedAtRef.current = Date.now();
    sessionStartHighestWaveRef.current = state.highestWaveReached;
    prevSummonsRef.current = state.totalSummons;
    prevHighestWaveRef.current = state.highestWaveReached;
    prevPrestigeRef.current = state.prestigeCount;
    void trackEvent('session_start', {
      saveSlot,
      level: state.level,
      wave: state.wave,
      highestWave: state.highestWaveReached,
    });
  }, [
    state.characterCreated,
    state.level,
    state.wave,
    state.highestWaveReached,
    state.prestigeCount,
    state.totalSummons,
    saveSlot,
  ]);

  useEffect(() => {
    return () => {
      if (!sessionStartedRef.current) return;
      const durationSec = Math.max(1, Math.floor((Date.now() - sessionStartedAtRef.current) / 1000));
      const highestWaveStart = sessionStartHighestWaveRef.current;
      const highestWaveEnd = stateRef.current.highestWaveReached;
      const highestWaveGain = Math.max(0, highestWaveEnd - highestWaveStart);
      void trackEvent('session_end', {
        saveSlot,
        durationSec,
        level: stateRef.current.level,
        wave: stateRef.current.wave,
        highestWave: highestWaveEnd,
        highestWaveGain,
        progressed: highestWaveGain > 0,
      });
    };
  }, [saveSlot]);

  useEffect(() => {
    if (!sessionStartedRef.current) return;

    if (state.totalSummons > prevSummonsRef.current) {
      const delta = state.totalSummons - prevSummonsRef.current;
      prevSummonsRef.current = state.totalSummons;
      void trackEvent('summon_used', {
        count: delta,
        totalSummons: state.totalSummons,
      });
    }

    if (state.highestWaveReached > prevHighestWaveRef.current) {
      prevHighestWaveRef.current = state.highestWaveReached;
      void trackEvent('wave_reached', {
        wave: state.highestWaveReached,
      });
    }

    if (state.prestigeCount > prevPrestigeRef.current) {
      prevPrestigeRef.current = state.prestigeCount;
      void trackEvent('rebirth_done', {
        prestigeCount: state.prestigeCount,
        wave: state.wave,
      });
    }
  }, [state.totalSummons, state.highestWaveReached, state.prestigeCount, state.wave]);

  const createCharacter = useCallback(
    (name: string, playerClass: PlayerClass) => {
      dispatch({ type: 'CREATE_CHARACTER', name, playerClass });
    },
    [dispatch],
  );

  const buySkill = useCallback((id: string) => dispatch({ type: 'BUY_SKILL', id }), [dispatch]);
  const allocateStat = useCallback((stat: StatKey) => dispatch({ type: 'ALLOCATE_STAT', stat }), [dispatch]);
  const allocateStatMax = useCallback((stat: StatKey) => dispatch({ type: 'ALLOCATE_STAT_MAX', stat }), [dispatch]);
  const allocateStatN = useCallback(
    (stat: StatKey, amount: number) => dispatch({ type: 'ALLOCATE_STAT_N', stat, amount }),
    [dispatch],
  );
  const burst = useCallback((hits: number) => dispatch({ type: 'BURST', hits }), [dispatch]);
  const equipItem = useCallback((itemId: string) => dispatch({ type: 'EQUIP_ITEM', itemId }), [dispatch]);
  const summonHero = useCallback(
    (payWithDiamonds?: boolean) => dispatch({ type: 'SUMMON_HERO', payWithDiamonds }),
    [dispatch],
  );
  const summonHeroX10Cinematic = useCallback(
    (featuredHeroId?: string, payWithDiamonds?: boolean) =>
      dispatch({ type: 'SUMMON_HERO_X10_CINEMATIC', featuredHeroId, payWithDiamonds }),
    [dispatch],
  );
  const sparkExchange = useCallback(
    (optionId: string, targetHeroId?: string) => dispatch({ type: 'SPARK_EXCHANGE', optionId, targetHeroId }),
    [dispatch],
  );
  const autoEquipBestHeroes = useCallback(() => dispatch({ type: 'AUTO_EQUIP_BEST_HEROES' }), [dispatch]);
  const saveTeamLoadout = useCallback((slot: number) => dispatch({ type: 'SAVE_TEAM_LOADOUT', slot }), [dispatch]);
  const loadTeamLoadout = useCallback((slot: number) => dispatch({ type: 'LOAD_TEAM_LOADOUT', slot }), [dispatch]);
  const unlockTeamSlot = useCallback(() => dispatch({ type: 'UNLOCK_TEAM_SLOT' }), [dispatch]);
  const toggleEquipHero = useCallback((uid: string) => dispatch({ type: 'TOGGLE_EQUIP_HERO', uid }), [dispatch]);
  const setActiveTeam = useCallback((heroIds: string[]) => dispatch({ type: 'SET_ACTIVE_TEAM', heroIds }), [dispatch]);
  const setHeroFormation = useCallback(
    (uid: string, role: HeroFormationRole) => {
      dispatch({ type: 'SET_HERO_FORMATION', uid, role });
    },
    [dispatch],
  );
  const playDiceRoll = useCallback(
    (forcedRoll?: number) => dispatch({ type: 'PLAY_DICE_ROLL', forcedRoll }),
    [dispatch],
  );
  const playReconSweep = useCallback(
    (forcedOutcome?: 'intel_gold' | 'intel_shards' | 'intel_buff' | 'ambush') => {
      dispatch({ type: 'PLAY_RECON_SWEEP', forcedOutcome });
    },
    [dispatch],
  );
  const playLockpickCache = useCallback(
    (forcedSuccess?: boolean) => {
      dispatch({ type: 'PLAY_LOCKPICK_CACHE', forcedSuccess });
    },
    [dispatch],
  );
  const playTargetPractice = useCallback(
    (forcedScore?: number) => {
      dispatch({ type: 'PLAY_TARGET_PRACTICE', forcedScore });
    },
    [dispatch],
  );
  const startMiniBountyDraft = useCallback(
    (draftType: MiniBountyDraftType) => {
      dispatch({ type: 'START_MINI_BOUNTY_DRAFT', draftType });
    },
    [dispatch],
  );
  const claimMiniBountyDraft = useCallback(() => {
    dispatch({ type: 'CLAIM_MINI_BOUNTY_DRAFT' });
  }, [dispatch]);
  const runRiftDungeon = useCallback(
    (useRaidTicket = false) => {
      dispatch({ type: 'RUN_RIFT_DUNGEON', useRaidTicket });
    },
    [dispatch],
  );
  const runTreasuryRaid = useCallback(
    (useRaidTicket = false) => {
      dispatch({ type: 'RUN_TREASURY_RAID', useRaidTicket });
    },
    [dispatch],
  );
  const recycleHero = useCallback((uid: string) => dispatch({ type: 'RECYCLE_HERO', uid }), [dispatch]);
  const autoRecycleHeroes = useCallback(() => dispatch({ type: 'AUTO_RECYCLE_HEROES' }), [dispatch]);
  const setAutoRecycleMaxRarity = useCallback(
    (rarity: Rarity) => {
      dispatch({ type: 'SET_AUTO_RECYCLE_MAX_RARITY', rarity });
    },
    [dispatch],
  );
  const setAutoRecycleEnabled = useCallback(
    (enabled: boolean) => {
      dispatch({ type: 'SET_AUTO_RECYCLE_ENABLED', enabled });
    },
    [dispatch],
  );
  const toggleHeroUniqueWeapon = useCallback(
    (heroUid: string) => {
      dispatch({ type: 'TOGGLE_HERO_UNIQUE_WEAPON', heroUid });
    },
    [dispatch],
  );
  const rankUpHero = useCallback((uid: string) => dispatch({ type: 'RANK_UP_HERO', uid }), [dispatch]);
  const rankUpHeroToMax = useCallback((uid: string) => dispatch({ type: 'RANK_UP_HERO_TO_MAX', uid }), [dispatch]);
  const rankUpHeroToMaxAndRebirth = useCallback(
    (uid: string) => dispatch({ type: 'RANK_UP_HERO_TO_MAX_AND_REBIRTH', uid }),
    [dispatch],
  );
  const levelUpHeroGold = useCallback((uid: string) => dispatch({ type: 'LEVEL_UP_HERO_GOLD', uid }), [dispatch]);
  const convertScrapToEssence = useCallback(
    (count?: number) => dispatch({ type: 'CONVERT_SCRAP_TO_ESSENCE', count }),
    [dispatch],
  );
  const convertScrapToShards = useCallback(
    (count?: number) => dispatch({ type: 'CONVERT_SCRAP_TO_SHARDS', count }),
    [dispatch],
  );
  const spendRebirthCore = useCallback(
    (path: 'damage' | 'economy' | 'survival') => {
      dispatch({ type: 'SPEND_REBIRTH_CORE', path });
    },
    [dispatch],
  );
  const applyUsableItem = useCallback(
    (itemId: string, amount: number | 'all' = 1) => dispatch({ type: 'USE_USABLE_ITEM', itemId, amount }),
    [dispatch],
  );
  const dismantleEquipment = useCallback(
    (itemId: string) => dispatch({ type: 'DISMANTLE_EQUIPMENT', itemId }),
    [dispatch],
  );
  const craftEquipment = useCallback((slot: EquipmentSlot) => dispatch({ type: 'CRAFT_EQUIPMENT', slot }), [dispatch]);
  const upgradeEquipmentRarity = useCallback(
    (itemId: string) => dispatch({ type: 'UPGRADE_EQUIPMENT_RARITY', itemId }),
    [dispatch],
  );
  const setAutoUsePotion = useCallback(
    (enabled: boolean) => dispatch({ type: 'SET_AUTO_USE_POTION', enabled }),
    [dispatch],
  );
  const setAutoUseCoolant = useCallback(
    (enabled: boolean) => dispatch({ type: 'SET_AUTO_USE_COOLANT', enabled }),
    [dispatch],
  );
  const setAutoUsePotionThreshold = useCallback(
    (thresholdPct: number) => dispatch({ type: 'SET_AUTO_USE_POTION_THRESHOLD', thresholdPct }),
    [dispatch],
  );
  const setAutoSummonEnabled = useCallback(
    (enabled: boolean) => dispatch({ type: 'SET_AUTO_SUMMON_ENABLED', enabled }),
    [dispatch],
  );
  const setAutoSummonMode = useCallback(
    (mode: 'single' | 'x10') => dispatch({ type: 'SET_AUTO_SUMMON_MODE', mode }),
    [dispatch],
  );
  const setAutoBurstEnabled = useCallback(
    (enabled: boolean) => dispatch({ type: 'SET_AUTO_BURST_ENABLED', enabled }),
    [dispatch],
  );
  const setCombatTempo = useCallback((tempo: CombatTempo) => dispatch({ type: 'SET_COMBAT_TEMPO', tempo }), [dispatch]);
  const rebirthHero = useCallback((uid: string) => dispatch({ type: 'REBIRTH_HERO', uid }), [dispatch]);
  const setAutoTempoEnabled = useCallback(
    (enabled: boolean) => dispatch({ type: 'SET_AUTO_TEMPO_ENABLED', enabled }),
    [dispatch],
  );
  const setAutoTempoTarget = useCallback(
    (target: AutoTempoTarget) => dispatch({ type: 'SET_AUTO_TEMPO_TARGET', target }),
    [dispatch],
  );
  const setAutoSummonReserveGold = useCallback(
    (reserveGold: number) => {
      dispatch({ type: 'SET_AUTO_SUMMON_RESERVE_GOLD', reserveGold });
    },
    [dispatch],
  );
  const buyGoldShopItem = useCallback(
    (offerId: GoldShopOfferId) => dispatch({ type: 'BUY_GOLD_SHOP_ITEM', offerId }),
    [dispatch],
  );
  const buyDiamondShopItem = useCallback(
    (offerId: DiamondShopOfferId) => dispatch({ type: 'BUY_DIAMOND_SHOP_ITEM', offerId }),
    [dispatch],
  );
  const simulateDollarPurchase = useCallback(
    (offerId: DollarShopOfferId) => dispatch({ type: 'SIMULATE_DOLLAR_PURCHASE', offerId }),
    [dispatch],
  );
  const claimVipReward = useCallback((level: number) => dispatch({ type: 'CLAIM_VIP_REWARD', level }), [dispatch]);
  const buyPremiumCoolant = useCallback(
    (itemId: 'coolant_mk1' | 'coolant_mk2', amount: number = 1) => {
      dispatch({ type: 'BUY_PREMIUM_COOLANT', itemId, amount });
    },
    [dispatch],
  );
  const autoDismantleEquipment = useCallback(() => dispatch({ type: 'AUTO_DISMANTLE_EQUIPMENT' }), [dispatch]);
  const setAutoDismantleRarityFloor = useCallback(
    (rarity: EquipmentRarity) => {
      dispatch({ type: 'SET_AUTO_DISMANTLE_RARITY_FLOOR', rarity });
    },
    [dispatch],
  );
  const setAutoDismantleEnabled = useCallback(
    (enabled: boolean) => {
      dispatch({ type: 'SET_AUTO_DISMANTLE_ENABLED', enabled });
    },
    [dispatch],
  );
  const gearInventoryCap = useMemo(() => getGearInventoryCap(state), [state]);
  const spendEssenceUpgrade = useCallback(
    (path: 'damage' | 'economy' | 'survival') => {
      dispatch({ type: 'SPEND_ESSENCE_UPGRADE', path });
    },
    [dispatch],
  );
  const claimWeeklyTrack = useCallback(
    (milestone: number) => {
      dispatch({ type: 'CLAIM_WEEKLY_TRACK', milestone });
    },
    [dispatch],
  );
  const claimMission = useCallback(
    (missionId: string) => {
      dispatch({ type: 'CLAIM_MISSION', missionId });
    },
    [dispatch],
  );
  const claimCodexHeroVip = useCallback(
    (heroId: string) => {
      dispatch({ type: 'CLAIM_CODEX_HERO_VIP', heroId });
    },
    [dispatch],
  );
  const claimCodexUniqueVip = useCallback(
    (heroId: string) => {
      dispatch({ type: 'CLAIM_CODEX_UNIQUE_VIP', heroId });
    },
    [dispatch],
  );
  const markHintSeen = useCallback(
    (hintId: string) => {
      dispatch({ type: 'MARK_HINT_SEEN', hintId });
    },
    [dispatch],
  );
  const appendMailboxMessages = useCallback(
    (mails: MailMessage[]) => {
      dispatch({ type: 'APPEND_MAIL_MESSAGES', mails });
    },
    [dispatch],
  );
  const claimMailAttachment = useCallback(
    (mailId: string, attachment: MailAttachmentKey) => {
      dispatch({ type: 'CLAIM_MAIL_ATTACHMENT', mailId, attachment });
    },
    [dispatch],
  );
  const claimAllMailAttachments = useCallback(() => {
    dispatch({ type: 'CLAIM_ALL_MAIL_ATTACHMENTS' });
  }, [dispatch]);
  const rebirth = useCallback(() => dispatch({ type: 'REBIRTH' }), [dispatch]);
  const clearAchievement = useCallback(() => dispatch({ type: 'CLEAR_ACHIEVEMENT' }), [dispatch]);
  const clearRewardPopup = useCallback(() => dispatch({ type: 'CLEAR_REWARD_POPUP' }), [dispatch]);

  const getEssenceCost = useCallback(
    (path: 'damage' | 'economy' | 'survival') => {
      const currentLevel =
        path === 'damage'
          ? state.metaDamageLevel
          : path === 'economy'
            ? state.metaEconomyLevel
            : state.metaSurvivalLevel;
      return getEssenceUpgradeCost(currentLevel);
    },
    [state.metaDamageLevel, state.metaEconomyLevel, state.metaSurvivalLevel],
  );

  const getRebirthCoreCost = useCallback(
    (path: 'damage' | 'economy' | 'survival') => {
      const level =
        path === 'damage'
          ? state.rebirthDamagePath
          : path === 'economy'
            ? state.rebirthEconomyPath
            : state.rebirthSurvivalPath;
      return getRebirthPathCost(level);
    },
    [state.rebirthDamagePath, state.rebirthEconomyPath, state.rebirthSurvivalPath],
  );

  const getShardForgeCosts = useCallback(
    () => ({
      essenceRefineScrapCost: getScrapToEssenceCost(state),
      shardRefineScrapCost: getScrapToShardCost(),
    }),
    [state],
  );

  const getNextTeamSlotUnlock = useCallback(() => {
    const currentSlots = getUnlockedTeamSlotCap(state);
    if (currentSlots >= ACTIVE_TEAM_SIZE) {
      return null;
    }
    const req = getTeamSlotUnlockRequirement(currentSlots + 1);
    if (!req) {
      return null;
    }
    return {
      currentSlots,
      targetSlots: currentSlots + 1,
      requiredWave: req.requiredWave,
      goldCost: req.goldCost,
      shardCost: req.shardCost,
      waveMet: state.highestWaveReached >= req.requiredWave,
      goldMet: state.gold >= req.goldCost,
      shardMet: state.heroShards >= req.shardCost,
      canUnlock:
        state.highestWaveReached >= req.requiredWave && state.gold >= req.goldCost && state.heroShards >= req.shardCost,
    };
  }, [state]);

  const getUpgradePlan = useCallback((itemId: string) => getEquipmentUpgradePlan(state, itemId), [state]);

  const getWeeklyEvent = useCallback(() => getCurrentWeeklyEvent(state), [state]);
  const getMissionProgress = useCallback(
    (mission: MissionBoardGoal) => {
      const value = getMissionProgressValue(state, mission);
      return {
        value,
        done: value >= mission.target,
      };
    },
    [state],
  );

  const batchLevelHeroes = useCallback(
    (heroIds: string[], addLevels: number | 'max') => {
      dispatch({ type: 'BATCH_LEVEL_HEROES', heroIds, addLevels });
    },
    [dispatch],
  );

  const upgradeFacility = useCallback(
    (facilityId: 'training' | 'treasury' | 'forge' | 'tactics') => {
      dispatch({ type: 'UPGRADE_FACILITY', facilityId });
    },
    [dispatch],
  );

  const startExpedition = useCallback(
    (
      expeditionType: 'artifact' | 'merchant' | 'ruins' | 'vault' | 'abyss',
      offeredRarity?: 'common' | 'rare' | 'epic' | 'legendary' | 'godly',
    ) => {
      dispatch({ type: 'START_EXPEDITION', expeditionType, offeredRarity });
    },
    [dispatch],
  );

  const refreshExpeditionContracts = useCallback(() => {
    dispatch({ type: 'REFRESH_EXPEDITION_CONTRACTS' });
  }, [dispatch]);

  const completeExpedition = useCallback(
    (expeditionId: string) => {
      dispatch({ type: 'COMPLETE_EXPEDITION', expeditionId });
    },
    [dispatch],
  );

  const applyOfflineProgress = useCallback(
    (elapsedMs: number) => {
      dispatch({ type: 'APPLY_OFFLINE_PROGRESS', elapsedMs });
    },
    [dispatch],
  );

  const setLastActiveAt = useCallback(
    (timestampMs: number, persistNow = false) => {
      const safeTimestampMs = Number.isFinite(timestampMs) ? Math.max(0, Math.floor(timestampMs)) : Date.now();
      dispatch({ type: 'SET_LAST_ACTIVE_AT', timestampMs: safeTimestampMs });
      if (!persistNow || !stateRef.current.characterCreated) return;

      const snapshot = serialize({
        ...stateRef.current,
        lastActiveAt: safeTimestampMs,
      });
      void persistSnapshot(true, snapshot);
    },
    [dispatch, persistSnapshot],
  );

  const stats = computeStats(state);

  return {
    hydrated,
    loadProgress,
    onlineSyncState,
    onlineSyncAt,
    state,
    stats,
    createCharacter,
    buySkill,
    allocateStat,
    allocateStatMax,
    allocateStatN,
    burst,
    equipItem,
    summonHero,
    summonHeroX10Cinematic,
    sparkExchange,
    autoEquipBestHeroes,
    saveTeamLoadout,
    loadTeamLoadout,
    unlockTeamSlot,
    toggleEquipHero,
    setActiveTeam,
    setHeroFormation,
    playDiceRoll,
    playReconSweep,
    playLockpickCache,
    playTargetPractice,
    startMiniBountyDraft,
    claimMiniBountyDraft,
    runRiftDungeon,
    runTreasuryRaid,
    batchLevelHeroes,
    upgradeFacility,
    startExpedition,
    refreshExpeditionContracts,
    completeExpedition,
    recycleHero,
    autoRecycleHeroes,
    setAutoRecycleMaxRarity,
    setAutoRecycleEnabled,
    toggleHeroUniqueWeapon,
    rankUpHero,
    rankUpHeroToMax,
    rankUpHeroToMaxAndRebirth,
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
    rebirthHero,
    setAutoTempoEnabled,
    setAutoTempoTarget,
    setAutoSummonReserveGold,
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
    markHintSeen,
    appendMailboxMessages,
    claimMailAttachment,
    claimAllMailAttachments,
    rebirth,
    clearAchievement,
    clearRewardPopup,
    getEssenceCost,
    getRebirthCoreCost,
    getShardForgeCosts,
    getNextTeamSlotUnlock,
    getUpgradePlan,
    getWeeklyEvent,
    getMissionProgress,
    applyOfflineProgress,
    setLastActiveAt,
  };
}
