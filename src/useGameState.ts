import { useEffect, useRef, useCallback, useReducer, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PARTY,
  SKILLS,
  ACHIEVEMENTS,
  COST_SCALE,
  REBIRTH_BONUS,
  getRebirthWaveRequirement,
  PartyId,
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
  HERO_LEVEL_EXP_FORMULA,
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
  rollEquipmentRarityByTier,
  rollRarity,
  rarityConfig,
  getRankUpShardCost,
  getRankStatMultiplier,
  calculateShardReward,
  getHeroRebirthPlan,
  unlockLabel,
} from './gameConfig';
import { buildingCost, bulkCost } from './utils';
import { trackEvent } from './telemetry';

const SAVE_KEY = 'idlerpg_save_v3';
const TICK_MS = 100;
const SAVE_INTERVAL_MS = 5000;
const STAT_POINTS_PER_LEVEL = 5;
const OFFLINE_PROGRESS_CAP_MS = 8 * 60 * 60 * 1000;
const PITY_THRESHOLD = 30;
const SAFE_INTEGER_CAP = Number.MAX_SAFE_INTEGER;
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
const BURST_COST = 20;
const BURST_BOSS_CHARGE_GAIN = 3;
const ACTIVE_STRIKE_DPS_MULT = 0.9;
const BURST_STRIKE_DPS_MULT = 1.35;
const PREMIUM_COOLANT_COSTS = {
  coolant_mk1: 8,
  coolant_mk2: 18,
} as const;
const GOLD_SHOP_COSTS: Record<GoldShopOfferId, number> = {
  exp_cache: 2800,
  potion_bundle: 4200,
  armory_crate: 12000,
};
const DIAMOND_SHOP_COSTS: Record<DiamondShopOfferId, number> = {
  coolant_i_pack: 24,
  coolant_ii_pack: 58,
  elite_supply: 120,
};
const DOLLAR_SHOP_PACKS: Record<DollarShopOfferId, { usdCents: number; diamonds: number }> = {
  usd_499: { usdCents: 499, diamonds: 500 },
  usd_1999: { usdCents: 1999, diamonds: 2200 },
  usd_4999: { usdCents: 4999, diamonds: 6000 },
  usd_9999: { usdCents: 9999, diamonds: 13000 },
};
export const ENABLE_SIMULATED_DOLLAR_PURCHASES = false;
const VIP_MILESTONE_REWARDS: Record<number, { diamonds: number; gold: number; shards: number; essence: number }> = {
  1: { diamonds: 50, gold: 1200, shards: 50, essence: 0 },
  2: { diamonds: 100, gold: 2800, shards: 90, essence: 1 },
  3: { diamonds: 180, gold: 5200, shards: 140, essence: 1 },
  4: { diamonds: 300, gold: 9200, shards: 220, essence: 2 },
  5: { diamonds: 500, gold: 16000, shards: 340, essence: 3 },
  6: { diamonds: 800, gold: 30000, shards: 500, essence: 4 },
  7: { diamonds: 1250, gold: 52000, shards: 760, essence: 6 },
  8: { diamonds: 2000, gold: 90000, shards: 1100, essence: 9 },
  9: { diamonds: 3200, gold: 145000, shards: 1550, essence: 13 },
  10: { diamonds: 5000, gold: 220000, shards: 2200, essence: 20 },
};
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
const VALID_RARITIES = new Set<Rarity>(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'godly']);
const VALID_AUTO_RECYCLE_RARITIES = new Set<Rarity>(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'godly']);
const VALID_PERMANENT_UNLOCKS = new Set<PermanentUnlockId>(['class_passive', 'advanced_consumables', 'mythic_equipment']);
const VALID_HERO_FORMATION_ROLES = new Set<HeroFormationRole>(['front', 'mid', 'back']);
const VALID_PARTY_IDS = new Set<PartyId>(PARTY.map(party => party.id));
const VALID_SKILL_IDS = new Set(SKILLS.map(skill => skill.id));
const VALID_ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map(achievement => achievement.id));
const VALID_MISSION_IDS = new Set(MISSION_BOARD_GOALS.map(mission => mission.id));
const VALID_WEEKLY_TRACK_MILESTONES = new Set(WEEKLY_TRACK_MILESTONES);
const VALID_DOLLAR_SHOP_OFFER_IDS = new Set<DollarShopOfferId>(['usd_499', 'usd_1999', 'usd_4999', 'usd_9999']);

export function getCharacterSaveSlot(accountName: string, playerClass: PlayerClass): string {
  return `${accountName}_${playerClass}`;
}

export function getSaveStorageKey(saveSlot: string): string {
  return `${SAVE_KEY}_${saveSlot}`;
}

interface RewardPopup {
  id: string;
  kind: 'gold' | 'item' | 'shard' | 'system';
  title: string;
  detail: string;
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
type ExpeditionType = 'artifact' | 'merchant' | 'ruins' | 'vault' | 'abyss';
type ExpeditionRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'godly';
type GoldShopOfferId = 'exp_cache' | 'potion_bundle' | 'armory_crate';
type DiamondShopOfferId = 'coolant_i_pack' | 'coolant_ii_pack' | 'elite_supply';
type DollarShopOfferId = 'usd_499' | 'usd_1999' | 'usd_4999' | 'usd_9999';

const ACHIEVEMENT_BONUS_PER_UNLOCK = 0.03;
const ACHIEVEMENT_BONUS_CAP = 0.75;
export const EXPEDITION_CONTRACT_REFRESH_MS = 8 * 60 * 60 * 1000;
export const EXPEDITION_CONTRACT_REFRESH_GOLD_COST = 100_000;
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
  if (safeLevel >= FACILITY_MAX_LEVEL) return Number.MAX_SAFE_INTEGER;
  const openingCurve = FACILITY_INITIAL_UPGRADE_COSTS[facilityId];
  if (safeLevel < openingCurve.length) return openingCurve[safeLevel];

  let cost = openingCurve[openingCurve.length - 1];
  const growth = FACILITY_POST_5_GROWTH_RATE[facilityId];
  for (let level = openingCurve.length - 1; level < safeLevel; level++) {
    cost = Math.ceil(cost * growth);
    if (!Number.isFinite(cost) || cost > Number.MAX_SAFE_INTEGER) {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  return cost;
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
  heroDetails: Record<string, { dps: number; hp: number; str: number; vit: number; agi: number; int: number; spr: number; }>;
  formation: { front: number; mid: number; back: number; dpsBonusPct: number; hpBonusPct: number; incomingDeltaPct: number; };
  synergies: Array<{ id: string; name: string; effect: string; }>;
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
  burstCharge: number;  // 0-BURST_COST; increments on each kill, resets on BURST
  combatHeat: number;
  wave: number;
  monsterHp: number;
  monsterMaxHp: number;
  teamHp: number;
  teamMaxHp: number;

  party: Record<PartyId, number>;
  skills: Set<string>;

  heroRoster: HeroUnit[];
  activeTeamHeroIds: string[];  // unlockable up to 6 heroes in battle (+ player)
  totalSummons: number;
  firstSummonGiven: boolean;  // track if free summon given on first kill
  freeSummonCharges: number;
  bossTears: number;  // drops 1 per boss kill; used as the gacha summon currency
  heroShards: number;  // currency used to rank up heroes
  essence: number;
  rebirthCores: number;
  rebirthDamagePath: number;
  rebirthEconomyPath: number;
  rebirthSurvivalPath: number;
  autoRecycleMaxRarity: Rarity;
  equipmentScrap: number;
  gachaPityCounter: number;
  summonHistory: SummonHistoryEntry[];
  teamLoadouts: string[][];
  teamSlotsUnlocked: number;
  heroFormationByUid: Record<string, HeroFormationRole>;
  lastDiceRollDay: number | null;
  lastRiftRunDay: number | null;
  lastDiceRollValue: number | null;
  lastRiftWavesCleared: number;

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
}

const initialParty = (): Record<PartyId, number> =>
  Object.fromEntries(PARTY.map(p => [p.id, 0])) as Record<PartyId, number>;

const blankStats: StatBlock = {
  strength: 0,
  vitality: 0,
  agility: 0,
  intelligence: 0,
  spirit: 0,
};

type EquipmentSource = 'starter' | 'drop' | 'craft' | 'crate' | 'upgrade' | 'legacy';

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

const DEFAULT_STATE: GameState = {
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

  party: initialParty(),
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
  summonHistory: [],
  teamLoadouts: [[], [], []],
  teamSlotsUnlocked: 4,
  heroFormationByUid: {},
  lastDiceRollDay: null,
  lastRiftRunDay: null,
  lastDiceRollValue: null,
  lastRiftWavesCleared: 0,

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
  return (bonus.strength ?? 0)
    + (bonus.vitality ?? 0)
    + (bonus.agility ?? 0)
    + (bonus.intelligence ?? 0)
    + (bonus.spirit ?? 0);
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
  return Math.max(2, Math.round(sumBonusStats(baseItem.bonus) * rarityMultiplier[baseItem.rarity] * slotMultiplier[baseItem.slot] * levelMultiplier));
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

function randomizeEquipmentBonus(baseItem: EquipmentItem, itemLevel: number): Partial<StatBlock> {
  const playerClass = baseItem.allowedClasses[0] ?? 'warrior';
  const weights = getEquipmentStatWeights(playerClass, baseItem.slot);
  const keys = Object.keys(weights) as Array<keyof StatBlock>;
  const budget = equipmentBudgetFor(baseItem, itemLevel);
  const rolledWeights = keys.reduce<Record<keyof StatBlock, number>>((acc, key) => {
    acc[key] = weights[key] * (0.82 + Math.random() * 0.45);
    return acc;
  }, { strength: 0, vitality: 0, agility: 0, intelligence: 0, spirit: 0 });
  const totalWeight = keys.reduce((sum, key) => sum + rolledWeights[key], 0);
  const bonus: Partial<StatBlock> = {};
  let assigned = 0;

  keys.forEach((key, index) => {
    const remaining = budget - assigned;
    if (remaining <= 0) return;
    const rawValue = index === keys.length - 1
      ? remaining
      : Math.max(0, Math.round((budget * rolledWeights[key]) / totalWeight));
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

function createEquipmentInstance(baseItem: EquipmentItem, itemLevel: number, source: EquipmentSource): EquipmentInstance {
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
    bonus: randomizeEquipmentBonus(baseItem, clampedLevel),
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
  };
  return Math.max(1, Math.floor(baseValue * sourceMultiplier[item.source]));
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
} {
  const nextInventory = { ...equipmentInventory };
  const legacyMap = new Map<string, string>();
  const migratedInventoryIds: string[] = [];

  for (const itemId of inventoryItemIds) {
    if (nextInventory[itemId]) {
      migratedInventoryIds.push(itemId);
      continue;
    }
    const baseItem = getEquipmentItem(itemId);
    if (!baseItem) continue;
    let migratedId = legacyMap.get(itemId);
    if (!migratedId) {
      const instance = createEquipmentInstance(baseItem, playerLevel, 'legacy');
      nextInventory[instance.id] = instance;
      migratedId = instance.id;
      legacyMap.set(itemId, migratedId);
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
  return state.heroRoster
    .filter(h => activeTeam.has(h.uid))
    .reduce((sum, h) => sum + h.teamBoost, 0);
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
  warrior:   ['front'],
  berserker: ['front'],
  monk:      ['front', 'mid'],
  mage:      ['mid'],
  archer:    ['back'],
};

function defaultFormationForClass(playerClass: PlayerClass): HeroFormationRole {
  return VALID_FORMATION_ROLES_FOR_CLASS[playerClass][0];
}

function getFormationRoleForHero(state: GameState, hero: HeroUnit): HeroFormationRole {
  return VALID_FORMATION_ROLES_FOR_CLASS[hero.heroClass][0];
}

function getTeamSlotUnlockRequirement(targetSlots: number): { requiredWave: number; goldCost: number; shardCost: number } | null {
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
  const roleCounts: Record<HeroFormationRole, number> = { front: 0, mid: 0, back: 0 };

  for (const uid of heroIds) {
    if (accepted.length >= cap) break;
    if (seen.has(uid)) continue;
    const hero = state.heroRoster.find(h => h.uid === uid);
    if (!hero) continue;

    const role = state.heroFormationByUid[uid] ?? defaultFormationForClass(hero.heroClass);
    if (roleCounts[role] >= MAX_FORMATION_ROLE_HEROES) continue;

    accepted.push(uid);
    seen.add(uid);
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
    const role = getFormationRoleForHero(state, hero);
    
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
    dpsMult *= 1.10;
    active.push({ id: 'spellshot', name: 'Spellshot Link', effect: '+10% team DPS' });
  }

  if ((classCounts.warrior + classCounts.berserker) >= 1 && classCounts.monk >= 1) {
    incomingMult *= 0.93;
    active.push({ id: 'iron_mandala', name: 'Iron Mandala', effect: '-7% incoming damage' });
  }

  const uniqueClassCount = (Object.values(classCounts) as number[]).filter(n => n > 0).length;
  if (uniqueClassCount >= 4) {
    dpsMult *= 1.08;
    expMult *= 1.08;
    active.push({ id: 'grand_coalition', name: 'Grand Coalition', effect: '+8% DPS, +8% EXP' });
  }

  const monoClass = (Object.values(classCounts) as number[]).some(n => n === activeHeroes.length && activeHeroes.length >= 3);
  if (monoClass) {
    goldMult *= 1.18;
    active.push({ id: 'warband_focus', name: 'Warband Focus', effect: '+18% gold gains' });
  }

  return { dpsMult, hpMult, incomingMult, goldMult, expMult, active };
}

function rarityRank(rarity: Rarity): number {
  return {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
    mythic: 5,
    godly: 6,
  }[rarity] ?? 0;
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

  return {
    dpsMult: Math.min(1.4, dpsMult),
    goldMult: Math.min(1.6, goldMult),
    expMult: Math.min(1.45, expMult),
    incomingDmgMult: Math.max(0.72, incomingDmgMult),
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
  const toRecycle = state.heroRoster.filter(h => !activeTeam.has(h.uid) && rarityRank(h.rarity) <= maxRank);
  if (toRecycle.length === 0) return state;

  const recycledIds = new Set(toRecycle.map(h => h.uid));
  const weekly = getCurrentWeeklyEvent(state);
  const shardReward = Math.ceil(toRecycle.reduce((sum, hero) => sum + calculateShardReward(hero.rarity, hero.level), 0) * weekly.shardMultiplier);
  const newRoster = state.heroRoster.filter(h => !recycledIds.has(h.uid));
  const newMaxHp = getTeamMaxHp({ ...state, heroRoster: newRoster });
  const heroFormationByUid = Object.fromEntries(
    Object.entries(state.heroFormationByUid).filter(([uid]) => !recycledIds.has(uid)),
  ) as Record<string, HeroFormationRole>;
  const heroActiveCdMs = Object.fromEntries(
    Object.entries(state.heroActiveCdMs).filter(([uid]) => !recycledIds.has(uid)),
  ) as Record<string, number>;

  return queueReward({
    ...state,
    heroRoster: newRoster,
    heroFormationByUid,
    heroActiveCdMs,
    heroShards: state.heroShards + shardReward,
    teamMaxHp: newMaxHp,
    teamHp: Math.min(state.teamHp, newMaxHp),
  }, {
    id: `bg_auto_recycle_${Date.now()}`,
    kind: 'shard',
    title: 'Auto Recycle (Background)',
    detail: `+${shardReward} shards from ${toRecycle.length} heroes`,
  });
}

function maybeAutoSummonTick(state: GameState): GameState {
  if (!state.autoSummonEnabled) return state;
  if (state.autoSummonCooldownMs > 0) return state;
  const trySingle = (): GameState | null => {
    const canUseFree = state.freeSummonCharges > 0;
    if (!canUseFree && state.bossTears < 1) return null;

    const template = HERO_POOL[Math.floor(Math.random() * HERO_POOL.length)];
    const roll = rollRarityWithPity(state.gachaPityCounter);
    const rarity = roll.rarity;
    const rarityMult = rarityConfig(rarity).boostMultiplier;
    const uid = `${template.id}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const hero: HeroUnit = {
      ...template,
      uid,
      rarity,
      level: 1,
      rank: 1,
      teamBoost: Number((template.baseTeamBoost * rarityMult).toFixed(4)),
    };
    const historyEntry: SummonHistoryEntry = {
      id: `hist_${uid}`,
      heroName: hero.name,
      heroEmoji: hero.emoji,
      rarity: hero.rarity,
      ts: Date.now(),
      pityTriggered: roll.pityTriggered,
    };
    let nextState = withAchievement(({
      ...state,
      bossTears: canUseFree ? state.bossTears : state.bossTears - 1,
      heroRoster: [hero, ...state.heroRoster],
      summonHistory: [historyEntry, ...state.summonHistory].slice(0, MAX_SAVE_SUMMON_HISTORY),
      totalSummons: state.totalSummons + 1,
      freeSummonCharges: canUseFree ? state.freeSummonCharges - 1 : state.freeSummonCharges,
      gachaPityCounter: roll.nextCounter,
      autoSummonCooldownMs: 1200,
    }));
    nextState = queueCombatLog(nextState, `Auto Summon: ${hero.emoji} ${hero.name} (${hero.rarity})`);
    return nextState;
  };

  const tryX10 = (): GameState | null => {
    const totalPulls = 10;
    const freeUses = Math.min(state.freeSummonCharges, totalPulls);
    const paidUses = totalPulls - freeUses;
    if (state.bossTears < paidUses) return null;

    const summoned: HeroUnit[] = [];
    const historyBatch: SummonHistoryEntry[] = [];
    let pityCounter = state.gachaPityCounter;
    for (let i = 0; i < totalPulls; i++) {
      const template = HERO_POOL[Math.floor(Math.random() * HERO_POOL.length)];
      const roll = rollRarityWithPity(pityCounter);
      pityCounter = roll.nextCounter;
      const rarity = roll.rarity;
      const rarityMult = rarityConfig(rarity).boostMultiplier;
      const uid = `${template.id}_${Date.now()}_${i}_${Math.floor(Math.random() * 10000)}`;
      const summonedHero: HeroUnit = {
        ...template,
        uid,
        rarity,
        level: 1,
        rank: 1,
        teamBoost: Number((template.baseTeamBoost * rarityMult).toFixed(4)),
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
    }

    let nextState = withAchievement(({
      ...state,
      bossTears: state.bossTears - paidUses,
      heroRoster: [...summoned, ...state.heroRoster],
      summonHistory: [...historyBatch, ...state.summonHistory].slice(0, MAX_SAVE_SUMMON_HISTORY),
      totalSummons: state.totalSummons + totalPulls,
      freeSummonCharges: state.freeSummonCharges - freeUses,
      gachaPityCounter: pityCounter,
      autoSummonCooldownMs: 1800,
    }));
    nextState = queueCombatLog(nextState, `Auto Summon x10 completed`);
    return nextState;
  };

  if (state.autoSummonMode === 'x10') {
    const x10 = tryX10();
    if (x10) return x10;
    const single = trySingle();
    if (single) return single;
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

    const role = getFormationRoleForHero(nextState, hero);
    const roleTriggerMult = role === 'back' ? 1.22 : role === 'mid' ? 1.05 : 0.92;
    const triggerChance = Math.min(0.16, 0.015 + hero.level * 0.00012) * roleTriggerMult * (elapsedMs / 1000);
    if (Math.random() > triggerChance) continue;

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
      const heal = Math.ceil(nextState.teamMaxHp * 0.1);
      nextState = {
        ...nextState,
        teamHp: Math.min(nextState.teamMaxHp, nextState.teamHp + heal),
      };
      nextState = queueCombatLog(nextState, `${hero.emoji} ${hero.name} triggered ${info.name} (+${heal} HP)`);
    }

    cooldowns[hero.uid] = 8000;
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
  return Math.ceil(maxHp * survivalMult * getRebirthSurvivalMultiplier(state) * formation.hpMult * synergy.hpMult * masteryHpMult);
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
  return Math.max(0, defense * getMetaSurvivalMultiplier(state) * getRebirthSurvivalMultiplier(state) * formation.hpMult * synergy.hpMult);
}

export function getDpsBreakdown(state: GameState): {
  playerBaseDps: number;
  heroBaseDps: number;
  multipliers: {
    rebirthLegacy: number;
    achievementLegacy: number;
    metaDamage: number;
    rebirthDamagePath: number;
    classPassive: number;
    heroPassives: number;
    formation: number;
    synergy: number;
    mastery: number;
    vipDamage: number;
    temporaryBuff: number;
  };
  totalMultiplier: number;
  finalDps: number;
} {
  const cls = getClassConfig(state.playerClass ?? 'warrior');
  const stats = derivedStats(state);
  const rebirthMult = Math.pow(REBIRTH_BONUS, state.prestigeCount);

  // Player damage contribution
  const physical = stats.strength * 3.2 + stats.agility * (1.6 + cls.physWeight * 0.95) + state.level * 1.6;
  const magic = stats.intelligence * (2 + cls.magicWeight * 1.2) + stats.spirit * (1.3 + cls.magicWeight * 0.75) + state.level * 1.2;

  const playerDps = ((physical * cls.physWeight * 0.72) + (magic * cls.magicWeight * 0.52)) / 1.85;

  // Active team heroes damage
  let heroDps = 0;
  const activeTeam = new Set(state.activeTeamHeroIds);
  for (const hero of state.heroRoster) {
    if (activeTeam.has(hero.uid)) {
      const heroClass = getClassConfig(hero.heroClass);
      const rankMult = getRankMultiplier(hero.rank, hero.rarity);
      const statMult = Math.max(1, hero.rebirthStatMult ?? 1);
      const heroStr = (heroClass.baseStats.strength + hero.level * 0.9) * rankMult * statMult;
      const heroInt = (heroClass.baseStats.intelligence + hero.level * 0.85) * rankMult * statMult;
      const heroAgi = (heroClass.baseStats.agility + hero.level * 0.7) * rankMult * statMult;

      const heroPhy = heroStr * 2 + heroAgi * 1.2 + hero.level * 0.5;
      const heroMag = heroInt * 2 + ((heroClass.baseStats.spirit + hero.level * 0.6) * rankMult * statMult) * 1.1;

      const heroDmg = ((heroPhy * heroClass.physWeight * 0.4) + (heroMag * heroClass.magicWeight * 0.3)) / 3;
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
  const multipliers = {
    rebirthLegacy: rebirthMult,
    achievementLegacy: getAchievementBonusMultiplier(state),
    metaDamage: getMetaDamageMultiplier(state),
    rebirthDamagePath: getRebirthDamageMultiplier(state),
    classPassive: classPassiveMult,
    heroPassives: heroPassive.dpsMult,
    formation: formation.dpsMult,
    synergy: synergy.dpsMult,
    mastery: masteryDpsMult,
    vipDamage: vipDamageMult,
    temporaryBuff: activeBuffMult,
  };
  const totalMultiplier = multipliers.rebirthLegacy
    * multipliers.achievementLegacy
    * multipliers.metaDamage
    * multipliers.rebirthDamagePath
    * multipliers.classPassive
    * multipliers.heroPassives
    * multipliers.formation
    * multipliers.synergy
    * multipliers.mastery
    * multipliers.vipDamage
    * multipliers.temporaryBuff;
  const finalDps = Math.max(1, (playerDps + heroDps) * totalMultiplier);
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

function getActiveStrikeDamage(state: GameState): number {
  return Math.max(1, getDps(state) * ACTIVE_STRIKE_DPS_MULT);
}

function getAchievementBonusMultiplier(state: GameState): number {
  const pct = Math.min(ACHIEVEMENT_BONUS_CAP, state.achievements.size * ACHIEVEMENT_BONUS_PER_UNLOCK);
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

const EQUIP_RARITY_ORDER: Array<ReturnType<typeof equipmentRarityConfig>['id']> = ['common', 'rare', 'epic', 'legendary', 'mythic', 'transcendent'];

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

function getEquipmentUpgradePlan(state: GameState, itemId: string): {
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
    return { canUpgrade: false, targetItemId: null, targetRarity: null, scrapCost: 0, essenceCost: 0, goldCost: 0, reason: 'Missing item' };
  }

  const idx = EQUIP_RARITY_ORDER.indexOf(item.rarity);
  if (idx < 0 || idx >= EQUIP_RARITY_ORDER.length - 1) {
    return { canUpgrade: false, targetItemId: null, targetRarity: null, scrapCost: 0, essenceCost: 0, goldCost: 0, reason: 'At max rarity' };
  }

  let step = 0;
  for (let i = idx + 1; i < EQUIP_RARITY_ORDER.length; i++) {
    const rarity = EQUIP_RARITY_ORDER[i];
    if (rarity === 'mythic' && !hasUnlock(state, 'mythic_equipment')) {
      return { canUpgrade: false, targetItemId: null, targetRarity: null, scrapCost: 0, essenceCost: 0, goldCost: 0, reason: 'Mythic tier locked' };
    }
    const pool = EQUIPMENT_CATALOG.filter(candidate =>
      candidate.slot === item.slot
      && candidate.rarity === rarity
      && candidate.allowedClasses.some(cls => item.allowedClasses.includes(cls)),
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

  return { canUpgrade: false, targetItemId: null, targetRarity: null, scrapCost: 0, essenceCost: 0, goldCost: 0, reason: 'No higher tier candidate' };
}

function getShardToEssenceCost(state: GameState): number {
  return 600 + state.metaDamageLevel * 40 + state.metaEconomyLevel * 40 + state.metaSurvivalLevel * 40;
}

function getShardToScrapCost(): number {
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
    rebirthStatMult: Number((Math.max(1, hero.rebirthStatMult ?? 1)).toFixed(4)),
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
    const parsed = typeof item === 'number'
      ? item
      : typeof item === 'string'
        ? Number(item)
        : NaN;
    if (!Number.isFinite(parsed)) continue;
    const intVal = Math.floor(parsed);
    if (seen.has(intVal)) continue;
    seen.add(intVal);
    sanitized.push(intVal);
    if (sanitized.length >= maxItems) break;
  }

  return sanitized;
}

function sanitizeStatAllocation(raw: unknown, level: number, savedUnspent?: unknown): {
  statsAlloc: StatBlock;
  unspentStatPoints: number;
} {
  const record = isRecord(raw) ? raw : {};
  const levelBudget = Math.max(0, (level - 1) * STAT_POINTS_PER_LEVEL);
  const legacyUnspent = clampInt(savedUnspent, 0, SAFE_INTEGER_CAP, 0);
  const budget = levelBudget + legacyUnspent;
  const requested: StatBlock = {
    strength: clampInt(record.strength, 0, budget, 0),
    vitality: clampInt(record.vitality, 0, budget, 0),
    agility: clampInt(record.agility, 0, budget, 0),
    intelligence: clampInt(record.intelligence, 0, budget, 0),
    spirit: clampInt(record.spirit, 0, budget, 0),
  };

  let remaining = budget;
  const statsAlloc: StatBlock = {
    strength: 0,
    vitality: 0,
    agility: 0,
    intelligence: 0,
    spirit: 0,
  };

  for (const key of ['strength', 'vitality', 'agility', 'intelligence', 'spirit'] as StatKey[]) {
    const next = Math.min(requested[key], remaining);
    statsAlloc[key] = next;
    remaining -= next;
  }

  return {
    statsAlloc,
    unspentStatPoints: remaining,
  };
}

function sanitizeLoadedHero(raw: unknown, index: number): HeroUnit | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;

  const template = HERO_POOL.find(hero => hero.id === raw.id);
  if (!template) return null;

  const rarity = typeof raw.rarity === 'string' && VALID_RARITIES.has(raw.rarity as Rarity)
    ? raw.rarity as Rarity
    : 'common';
  const level = clampInt(raw.level, 1, HERO_LEVEL_CAP, 1);
  const rank = clampInt(raw.rank, 1, 10, 1);
  const uid = clampString(raw.uid, `${template.id}_${index}`, 64) || `${template.id}_${index}`;
  const rarityMult = rarityConfig(rarity).boostMultiplier;
  const baseBoost = Number((template.baseTeamBoost * rarityMult).toFixed(4));
  const teamBoost = clampFloat(raw.teamBoost, baseBoost, 10, baseBoost);
  const rebirthStatMult = clampFloat(raw.rebirthStatMult, 1, 20, 1);

  return normalizeHero({
    ...template,
    uid,
    rarity,
    level,
    rank,
    teamBoost: Number(teamBoost.toFixed(4)),
    rebirthStatMult: Number(rebirthStatMult.toFixed(4)),
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
    const rarity = typeof entry.rarity === 'string' && EQUIP_RARITY_ORDER.includes(entry.rarity as EquipmentRarity)
      ? entry.rarity as EquipmentRarity
      : baseItem.rarity;
    const source = typeof entry.source === 'string' && ['starter', 'drop', 'craft', 'crate', 'upgrade', 'legacy'].includes(entry.source)
      ? entry.source as EquipmentSource
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

function sanitizeSaveData(payload: Partial<SaveData>) {
  const now = Date.now();
  const currentWeek = weekNumberForTimestamp(now);
  const currentDay = toDayNumber(now);
  const playerName = clampString(payload.playerName, '', 24);
  const playerClass = typeof payload.playerClass === 'string' && VALID_PLAYER_CLASSES.has(payload.playerClass as PlayerClass)
    ? payload.playerClass as PlayerClass
    : null;
  const characterCreated = clampBoolean(payload.characterCreated, false) && !!playerName && playerClass !== null;
  const level = clampInt(payload.level, 1, MAX_SAVE_PLAYER_LEVEL, 1);
  const maxHeat = getMaxHeatForLevel(level);
  const wave = clampInt(payload.wave, 1, MAX_SAVE_WAVE, 1);
  const highestWaveReached = Math.max(
    wave,
    clampInt(payload.highestWaveReached ?? payload.highestLevelReached, 1, MAX_SAVE_WAVE, 1),
  );
  const { statsAlloc, unspentStatPoints } = sanitizeStatAllocation(payload.statsAlloc, level, payload.unspentStatPoints);
  const maxMonsterHp = getMonsterMaxHp(wave);
  const monsterHp = clampFloat(payload.monsterHp, 0, maxMonsterHp, maxMonsterHp);
  const teamMaxHp = Math.max(100, clampInt(payload.teamHp, 1, SAFE_INTEGER_CAP, 100));
  const teamHp = clampFloat(payload.teamHp, 0, teamMaxHp, teamMaxHp);

  const party = initialParty();
  if (isRecord(payload.party)) {
    for (const partyId of Object.keys(party) as PartyId[]) {
      party[partyId] = clampInt(payload.party[partyId], 0, SAFE_INTEGER_CAP, 0);
    }
  }

  const skills = sanitizeStringList(payload.skills, VALID_SKILL_IDS.size)
    .filter(skillId => VALID_SKILL_IDS.has(skillId));

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
    ? payload.teamLoadouts.slice(0, 3).map(loadout => sanitizeStringList(loadout, ACTIVE_TEAM_SIZE)
      .filter(uid => heroUidSet.has(uid))
      .slice(0, ACTIVE_TEAM_SIZE))
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

  const rawInventoryItemIds = sanitizeStringList(payload.inventoryItemIds, MAX_SAVE_COLLECTION)
    .filter(itemId => !!equipmentInventory[itemId] || !!getEquipmentItem(itemId));

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
  const { inventoryItemIds, equippedItems: migratedEquippedItems, equipmentInventory: migratedEquipmentInventory } = migrateLegacyEquipmentIds(
    rawInventoryItemIds,
    equippedItems,
    equipmentInventory,
    level,
  );

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
        rarity: typeof entry.rarity === 'string' && VALID_RARITIES.has(entry.rarity as Rarity)
          ? entry.rarity as Rarity
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
            ? entry.type as GameState['expeditionQueue'][number]['type']
            : 'artifact';
        const rarity: GameState['expeditionQueue'][number]['rarity'] =
          typeof entry.rarity === 'string' && validExpeditionRarities.has(entry.rarity)
            ? entry.rarity as GameState['expeditionQueue'][number]['rarity']
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
    artifact: payload.lastExpeditionDay?.artifact == null ? null : clampInt(payload.lastExpeditionDay.artifact, 0, currentDay, currentDay),
    merchant: payload.lastExpeditionDay?.merchant == null ? null : clampInt(payload.lastExpeditionDay.merchant, 0, currentDay, currentDay),
    ruins: payload.lastExpeditionDay?.ruins == null ? null : clampInt(payload.lastExpeditionDay.ruins, 0, currentDay, currentDay),
    vault: payload.lastExpeditionDay?.vault == null ? null : clampInt(payload.lastExpeditionDay.vault, 0, currentDay, currentDay),
    abyss: payload.lastExpeditionDay?.abyss == null ? null : clampInt(payload.lastExpeditionDay.abyss, 0, currentDay, currentDay),
  };

  const expeditionContractOffers: Record<ExpeditionType, ExpeditionRarity> = {
    artifact: typeof payload.expeditionContractOffers?.artifact === 'string' && validExpeditionRarities.has(payload.expeditionContractOffers.artifact)
      ? payload.expeditionContractOffers.artifact as ExpeditionRarity
      : EXPEDITION_RARITIES[Math.floor(Math.random() * EXPEDITION_RARITIES.length)],
    merchant: typeof payload.expeditionContractOffers?.merchant === 'string' && validExpeditionRarities.has(payload.expeditionContractOffers.merchant)
      ? payload.expeditionContractOffers.merchant as ExpeditionRarity
      : EXPEDITION_RARITIES[Math.floor(Math.random() * EXPEDITION_RARITIES.length)],
    ruins: typeof payload.expeditionContractOffers?.ruins === 'string' && validExpeditionRarities.has(payload.expeditionContractOffers.ruins)
      ? payload.expeditionContractOffers.ruins as ExpeditionRarity
      : EXPEDITION_RARITIES[Math.floor(Math.random() * EXPEDITION_RARITIES.length)],
    vault: typeof payload.expeditionContractOffers?.vault === 'string' && validExpeditionRarities.has(payload.expeditionContractOffers.vault)
      ? payload.expeditionContractOffers.vault as ExpeditionRarity
      : EXPEDITION_RARITIES[Math.floor(Math.random() * EXPEDITION_RARITIES.length)],
    abyss: typeof payload.expeditionContractOffers?.abyss === 'string' && validExpeditionRarities.has(payload.expeditionContractOffers.abyss)
      ? payload.expeditionContractOffers.abyss as ExpeditionRarity
      : EXPEDITION_RARITIES[Math.floor(Math.random() * EXPEDITION_RARITIES.length)],
  };
  const expeditionContractsRefreshedAt = clampInt(
    payload.expeditionContractsRefreshedAt,
    0,
    now,
    now,
  );

  return {
    playerName,
    playerClass,
    characterCreated,
    gold: clampInt(payload.gold, 0, SAFE_INTEGER_CAP, 0),
    diamonds: clampInt(payload.diamonds, 0, SAFE_INTEGER_CAP, 0),
    totalGold: Math.max(clampInt(payload.gold, 0, SAFE_INTEGER_CAP, 0), clampInt(payload.totalGold, 0, SAFE_INTEGER_CAP, 0)),
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
    party,
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
    autoRecycleMaxRarity: typeof payload.autoRecycleMaxRarity === 'string' && VALID_AUTO_RECYCLE_RARITIES.has(payload.autoRecycleMaxRarity as Rarity)
      ? payload.autoRecycleMaxRarity as Rarity
      : 'uncommon',
    equipmentScrap: clampInt(payload.equipmentScrap, 0, SAFE_INTEGER_CAP, 0),
    gachaPityCounter: clampInt(payload.gachaPityCounter, 0, PITY_THRESHOLD - 1, 0),
    summonHistory,
    teamLoadouts,
    teamSlotsUnlocked,
    heroFormationByUid,
    lastDiceRollDay: payload.lastDiceRollDay == null ? null : clampInt(payload.lastDiceRollDay, 0, currentDay, currentDay),
    lastRiftRunDay: payload.lastRiftRunDay == null ? null : clampInt(payload.lastRiftRunDay, 0, currentDay, currentDay),
    lastDiceRollValue: payload.lastDiceRollValue == null ? null : clampInt(payload.lastDiceRollValue, 1, 20, 1),
    lastRiftWavesCleared: clampInt(payload.lastRiftWavesCleared, 0, 5, 0),
    guildhallFacilities,
    expeditionQueue,
    lastExpeditionDay,
    expeditionContractOffers,
    expeditionContractsRefreshedAt,
    classMasteryXp,
    seasonPoints,
    bestSeasonPoints,
    dailyLoginStreak: clampInt(payload.dailyLoginStreak, 0, 100_000, 0),
    lastDailyLoginDay: payload.lastDailyLoginDay == null ? null : clampInt(payload.lastDailyLoginDay, 0, currentDay, currentDay),
    streakInsuranceCharges: clampInt(payload.streakInsuranceCharges, 0, SAFE_INTEGER_CAP, 1),
    weeklyEventWeek,
    weeklyEventId,
    weeklyKills: clampInt(payload.weeklyKills, 0, SAFE_INTEGER_CAP, 0),
    weeklyTrackClaimed: sanitizeIntList(payload.weeklyTrackClaimed, WEEKLY_TRACK_MILESTONES.length)
      .filter(value => VALID_WEEKLY_TRACK_MILESTONES.has(value)),
    claimedMissionIds: sanitizeStringList(payload.claimedMissionIds, VALID_MISSION_IDS.size)
      .filter(id => VALID_MISSION_IDS.has(id)),
    seenHintIds: sanitizeStringList(payload.seenHintIds, MAX_SAVE_LOG_ENTRIES),
    permanentUnlocks: sanitizeStringList(payload.permanentUnlocks, VALID_PERMANENT_UNLOCKS.size)
      .filter((id): id is PermanentUnlockId => VALID_PERMANENT_UNLOCKS.has(id as PermanentUnlockId)),
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
    vipRewardClaimedLevels: sanitizeIntList(payload.vipRewardClaimedLevels, 10)
      .filter(level => level >= 1 && level <= 10),
    dollarFirstPurchaseClaimedOfferIds: sanitizeStringList(payload.dollarFirstPurchaseClaimedOfferIds, VALID_DOLLAR_SHOP_OFFER_IDS.size)
      .filter((id): id is DollarShopOfferId => VALID_DOLLAR_SHOP_OFFER_IDS.has(id as DollarShopOfferId)),
    inventoryItemIds,
    equipmentInventory: migratedEquipmentInventory,
    equippedItems: migratedEquippedItems,
    usableItemCounts,
    autoUsePotionEnabled: clampBoolean(payload.autoUsePotionEnabled, false),
    autoUseCoolantEnabled: clampBoolean(payload.autoUseCoolantEnabled, false),
    autoUsePotionThresholdPct: clampFloat(payload.autoUsePotionThresholdPct, 0.1, 1, 0.35),
    autoRecycleEnabled: clampBoolean(payload.autoRecycleEnabled, false),
    autoSummonEnabled: clampBoolean(payload.autoSummonEnabled, false),
    autoSummonMode,
    autoBurstEnabled: clampBoolean(payload.autoBurstEnabled, false),
    combatTempo: clampCombatTempoForVip(payload.combatTempo === 2 || payload.combatTempo === 4 ? payload.combatTempo : 1, {
      vipLevel: getVipLevelFromPoints(clampInt(payload.vipPoints, 0, SAFE_INTEGER_CAP, 0)),
    }),
    autoTempoEnabled: clampBoolean(payload.autoTempoEnabled, false),
    autoTempoTarget: clampAutoTempoTargetForVip(payload.autoTempoTarget === 4 ? 4 : 2, {
      vipLevel: getVipLevelFromPoints(clampInt(payload.vipPoints, 0, SAFE_INTEGER_CAP, 0)),
    }),
    autoSummonReserveGold: clampInt(payload.autoSummonReserveGold, 0, SAFE_INTEGER_CAP, 5000),
    lastActiveAt: clampInt(payload.lastActiveAt, 0, now, now),
    prestigeCount: clampInt(payload.prestigeCount, 0, SAFE_INTEGER_CAP, 0),
    achievements: sanitizeStringList(payload.achievements, VALID_ACHIEVEMENT_IDS.size)
      .filter(id => VALID_ACHIEVEMENT_IDS.has(id)),
    combatLog: sanitizeStringList(payload.combatLog, MAX_SAVE_LOG_ENTRIES),
    damageBuffPct: clampFloat(payload.damageBuffPct, 0, 1, 0),
    damageBuffMs: clampInt(payload.damageBuffMs, 0, 600_000, 0),
    damageReductionBuffPct: clampFloat(payload.damageReductionBuffPct, 0, 1, 0),
    damageReductionBuffMs: clampInt(payload.damageReductionBuffMs, 0, 600_000, 0),
    heroActiveCdMs,
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
  const heroDetails: Record<string, {
    dps: number; hp: number;
    str: number; vit: number; agi: number; int: number; spr: number;
  }> = {};
  for (const hero of state.heroRoster) {
    const heroClass = getClassConfig(hero.heroClass);
    const rankMult = getRankMultiplier(hero.rank, hero.rarity);
    const statMult = Math.max(1, hero.rebirthStatMult ?? 1);
    const hStr = (heroClass.baseStats.strength + hero.level * 0.9) * rankMult * statMult;
    const hInt = (heroClass.baseStats.intelligence + hero.level * 0.85) * rankMult * statMult;
    const hAgi = (heroClass.baseStats.agility + hero.level * 0.7) * rankMult * statMult;
    const hVit = (heroClass.baseStats.vitality + hero.level * 0.8) * rankMult * statMult;
    const hSpr = (heroClass.baseStats.spirit + hero.level * 0.6) * rankMult * statMult;
    const heroPhy = hStr * 2 + hAgi * 1.2 + hero.level * 0.5;
    const heroMag = hInt * 2 + hSpr * 1.1;
    const heroDps = ((heroPhy * heroClass.physWeight * 0.4) + (heroMag * heroClass.magicWeight * 0.3)) / 3;
    heroDetails[hero.uid] = {
      dps: heroDps,
      hp: Math.ceil((hVit + 3) * 8),
      str: Math.ceil(hStr), vit: Math.ceil(hVit), agi: Math.ceil(hAgi),
      int: Math.ceil(hInt), spr: Math.ceil(hSpr),
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

function rollRarityWithPity(counter: number): { rarity: Rarity; nextCounter: number; pityTriggered: boolean } {
  const pityTriggered = counter + 1 >= PITY_THRESHOLD;
  if (pityTriggered) {
    const r = Math.random();
    const rarity: Rarity = r < 0.75 ? 'legendary' : r < 0.95 ? 'mythic' : 'godly';
    return { rarity, nextCounter: 0, pityTriggered: true };
  }

  const rarity = rollRarity(Math.random());
  const nextCounter = rarityRank(rarity) >= rarityRank('legendary') ? 0 : counter + 1;
  return { rarity, nextCounter, pityTriggered: false };
}

function equipmentScrapValue(rarity: ReturnType<typeof equipmentRarityConfig>['id']): number {
  return {
    common: 10,
    rare: 24,
    epic: 60,
    legendary: 160,
    mythic: 360,
    transcendent: 760,
  }[rarity] ?? 10;
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
    ? (grandQty > 0 ? 'grand_potion' : smallQty > 0 ? 'small_potion' : null)
    : (smallQty > 0 ? 'small_potion' : grandQty > 0 ? 'grand_potion' : null);
  if (!itemId) return state;

  const item = getUsableItem(itemId);
  if (!item || item.effect !== 'heal_team_percent') return state;
  const healed = Math.ceil(state.teamMaxHp * item.value);
  return queueReward({
    ...state,
    usableItemCounts: addUsableItemCount(state.usableItemCounts, item.id, -1),
    teamHp: Math.min(state.teamMaxHp, state.teamHp + healed),
  }, {
    id: `auto_potion_${Date.now()}`,
    kind: 'item',
    title: `Auto Used ${item.emoji} ${item.name}`,
    detail: `Restored ${healed} team HP`,
  });
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
    ? (mk2Qty > 0 && !mk1WouldStabilize ? 'coolant_mk2' : mk1Qty > 0 ? 'coolant_mk1' : mk2Qty > 0 ? 'coolant_mk2' : null)
    : (mk1Qty > 0 ? 'coolant_mk1' : mk2Qty > 0 ? 'coolant_mk2' : null);
  if (!itemId) return state;

  const item = getUsableItem(itemId);
  if (!item || item.effect !== 'reduce_heat_flat') return state;

  const reduced = Math.max(0, state.combatHeat - item.value);
  return queueReward({
    ...state,
    usableItemCounts: addUsableItemCount(state.usableItemCounts, item.id, -1),
    combatHeat: reduced,
  }, {
    id: `auto_coolant_${Date.now()}`,
    kind: 'system',
    title: `Smart Used ${item.emoji} ${item.name}`,
    detail: `Heat ${Math.ceil(state.combatHeat)} -> ${Math.ceil(reduced)}`,
  });
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

function killMonster(state: GameState): GameState {
  const weekly = getCurrentWeeklyEvent(state);
  const affix = getMonsterAffixModifiers(state.wave);
  const achievementMult = getAchievementBonusMultiplier(state);
  const economyMult = getMetaEconomyMultiplier(state);
  const heroPassive = getHeroPassiveMultipliers(state);
  const synergy = getTeamSynergy(state);
  const masteryLevel = getClassMasteryLevel(state, state.playerClass);
  const masteryEconomyMult = 1 + Math.min(0.25, Math.floor(masteryLevel / 5) * 0.01);
  const goldReward = Math.ceil(getMonsterGold(state.wave) * Math.pow(REBIRTH_BONUS, state.prestigeCount) * achievementMult * affix.goldMult * economyMult * getRebirthEconomyMultiplier(state) * heroPassive.goldMult * synergy.goldMult * masteryEconomyMult * weekly.goldMultiplier * getVipGoldMultiplier(state));
  const expReward = Math.ceil(getMonsterExp(state.wave) * achievementMult * affix.expMult * heroPassive.expMult * synergy.expMult * weekly.expMultiplier * getVipExpMultiplier(state));
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
    teamHp: newTeamMaxHp,  // Heal team after win
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
  newState = queueCombatLog(newState, `Defeated ${getMonsterForWave(state.wave).name} • +${goldReward} gold +${expReward} EXP (${weekly.name})`);

  // Grant one free summon charge on first kill.
  if (state.totalKills === 0 && !state.firstSummonGiven) {
    newState = {
      ...newState,
      firstSummonGiven: true,
      freeSummonCharges: newState.freeSummonCharges + 1,
    };
  }

  // Chance to drop class-compatible equipment on kill.
  const mythicUnlocked = hasUnlock(newState, 'mythic_equipment');
  const dropChance = Math.min(0.4, 0.10 + state.wave * 0.003 + (isBoss ? 0.12 : 0));
  if (newState.playerClass && Math.random() <= dropChance) {
    const droppedRarity = rollEquipmentRarityByTier(Math.random(), mythicUnlocked);
    const pool = EQUIPMENT_CATALOG.filter(item =>
      item.allowedClasses.includes(newState.playerClass as PlayerClass) &&
      item.rarity === droppedRarity,
    );
    const fallbackPool = EQUIPMENT_CATALOG.filter(item =>
      item.allowedClasses.includes(newState.playerClass as PlayerClass),
    );
    const source = pool.length > 0 ? pool : fallbackPool;
    if (source.length > 0) {
      const baseItem = source[Math.floor(Math.random() * source.length)];
      const item = createEquipmentInstance(baseItem, Math.max(1, newState.level), 'drop');
      if (!newState.inventoryItemIds.includes(item.id)) {
        newState = queueReward({
          ...newState,
          equipmentInventory: {
            ...newState.equipmentInventory,
            [item.id]: item,
          },
          inventoryItemIds: [...newState.inventoryItemIds, item.id],
        }, {
          id: `item_${item.id}_${Date.now()}`,
          kind: 'item',
          title: `Equipment Drop: ${item.emoji} ${item.name}`,
          detail: `${equipmentRarityConfig(item.rarity).label} ${item.slot} • iLv ${item.itemLevel}`,
        });
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
    newState = queueReward({
      ...newState,
      usableItemCounts: nextCounts,
    }, {
      id: `usable_${usable.id}_${Date.now()}`,
      kind: 'item',
      title: `Found ${usable.emoji} ${usable.name}`,
      detail: usable.description,
    });
    newState = queueCombatLog(newState, `Item drop: ${usable.emoji} ${usable.name}`);
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
      newState = queueReward({
        ...newState,
        permanentUnlocks: [...newState.permanentUnlocks, unlock],
      }, {
        id: `unlock_${unlock}_${Date.now()}`,
        kind: 'system',
        title: `Act Boss Defeated • ${act.name}`,
        detail: unlockLabel(unlock),
      });
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

  return withAchievement((newState));
}

function checkAchievements(state: GameState): string | null {
  const ctx = {
    totalGold: state.totalGold,
    totalKills: state.totalKills,
    wave: state.wave,
    highestWaveReached: state.highestWaveReached,
    level: state.level,
    prestigeCount: state.prestigeCount,
    totalSummons: state.totalSummons,
    equippedCount: state.activeTeamHeroIds.length,
    heroRosterCount: state.heroRoster.length,
    heroShards: state.heroShards,
    essence: state.essence,
    unlockedCount: state.achievements.size,
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
  for (let i = 0; i < burstHits; i++) {
    const affix = getMonsterAffixModifiers(working.wave);
    const crit = Math.random() < 0.2;
    const dmg = (getDps(working) * BURST_STRIKE_DPS_MULT * (crit ? 1.8 : 1)) / affix.hpMult;
    const hp = working.monsterHp - dmg;
    if (hp <= 0) {
      working = withAchievement(killMonster(working));
    } else {
      working = { ...working, monsterHp: hp };
    }
  }

  return queueCombatLog(working, `Burst unleashed for ${burstHits} amplified strikes`);
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
  | { type: 'ATTACK' }
  | { type: 'BUY_PARTY'; id: PartyId; amount: number }
  | { type: 'BUY_SKILL'; id: string }
  | { type: 'ALLOCATE_STAT'; stat: StatKey }
  | { type: 'ALLOCATE_STAT_MAX'; stat: StatKey }
  | { type: 'ALLOCATE_STAT_N'; stat: StatKey; amount: number }
  | { type: 'BURST'; hits: number }
  | { type: 'LEVEL_UP_HERO_GOLD'; uid: string }
  | { type: 'EQUIP_ITEM'; itemId: string }
  | { type: 'SUMMON_HERO' }
  | { type: 'SUMMON_HERO_X10' }
  | { type: 'SUMMON_HERO_X10_CINEMATIC' }
  | { type: 'AUTO_EQUIP_BEST_HEROES' }
  | { type: 'SAVE_TEAM_LOADOUT'; slot: number }
  | { type: 'LOAD_TEAM_LOADOUT'; slot: number }
  | { type: 'UNLOCK_TEAM_SLOT' }
  | { type: 'TOGGLE_EQUIP_HERO'; uid: string }
  | { type: 'SET_ACTIVE_TEAM'; heroIds: string[] }
  | { type: 'SET_HERO_FORMATION'; uid: string; role: HeroFormationRole }
  | { type: 'PLAY_DICE_ROLL'; forcedRoll?: number }
  | { type: 'RUN_RIFT_DUNGEON'; forcedWaves?: number; forcedDiamonds?: number; forcedShards?: number; forcedEssence?: number }
  | { type: 'RECYCLE_HERO'; uid: string }
  | { type: 'AUTO_RECYCLE_HEROES' }
  | { type: 'SET_AUTO_RECYCLE_MAX_RARITY'; rarity: Rarity }
  | { type: 'SET_AUTO_RECYCLE_ENABLED'; enabled: boolean }
  | { type: 'RANK_UP_HERO'; uid: string }
  | { type: 'CONVERT_SHARDS_TO_ESSENCE' }
  | { type: 'CONVERT_SHARDS_TO_SCRAP' }
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
  | { type: 'MARK_HINT_SEEN'; hintId: string }
  | { type: 'APPLY_OFFLINE_PROGRESS'; elapsedMs: number }
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
  switch (action.type) {
    case 'CREATE_CHARACTER': {
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
        unspentStatPoints: 10,   // starting stat points to customise immediately
        gold: 100,               // starting gold to feel snappy
        inventoryItemIds: starterItems.map(item => item.id),
        equipmentInventory: Object.fromEntries(starterItems.map(item => [item.id, item])),
        equippedItems: starterEquip,
      };
      const maxHp = getTeamMaxHp(newState);
      return { ...newState, teamHp: maxHp, teamMaxHp: maxHp };
    }

    case 'TICK': {
      if (!state.characterCreated) return state;
      const refreshedState = maybeAutoRefreshExpeditionContracts(state, Date.now());
      const withAutoTempo = state.autoTempoEnabled && state.combatHeat <= 0 && state.combatTempo === 1
        ? { ...refreshedState, combatTempo: refreshedState.autoTempoTarget }
        : refreshedState;
      const scaledElapsed = action.elapsed * withAutoTempo.combatTempo;
      let working = decayBuffs(withAutoTempo, scaledElapsed);
      working = tickHeroActives(working, scaledElapsed);
      working = updateCombatHeat(working, action.elapsed);
      const weekly = getCurrentWeeklyEvent(working);

      const dps = getDps(working);
      if (dps <= 0) return state;
      const affix = getMonsterAffixModifiers(working.wave);

      // Team deals damage to enemy
      const damage = (dps * (scaledElapsed / 1000)) / (affix.hpMult * weekly.enemyHpMultiplier);
      const hp = working.monsterHp - damage;

      // Enemy deals damage to team (reduced by defense)
      const enemyDmg = getMonsterDamage(working.wave) * affix.dmgMult * weekly.enemyDamageMultiplier;
      const defense = getTeamDefense(working);
      const damageReduction = Math.min(0.8, defense / (defense + 100));  // max 80% reduction
      const passive = working.playerClass ? getClassPassive(working.playerClass) : null;
      const passiveIncomingMult = hasUnlock(working, 'class_passive') && passive
        ? passive.incomingDamageMultiplier
        : 1;
      const heroPassive = getHeroPassiveMultipliers(working);
      const formation = getFormationMultipliers(working);
      const synergy = getTeamSynergy(working);
      const activeReductionMult = 1 - Math.max(0, Math.min(0.7, working.damageReductionBuffPct));
      const actualEnemyDamage = enemyDmg
        * (1 - damageReduction)
        * passiveIncomingMult
        * heroPassive.incomingDmgMult
        * formation.incomingMult
        * synergy.incomingMult
        * activeReductionMult
        * (scaledElapsed / 1000);
      const teamHp = working.teamHp - actualEnemyDamage;

      // Check if monster is defeated
      if (hp <= 0) return withAchievement(killMonster(working));

      // Check if team dies
      if (teamHp <= 0) {
        // Retreat to wave 1, lose 50% of current gold, keep exp and heroes
        return {
          ...working,
          wave: 1,
          monsterHp: getMonsterMaxHp(1),
          monsterMaxHp: getMonsterMaxHp(1),
          teamHp: getTeamMaxHp(working),
          teamMaxHp: getTeamMaxHp(working),
          gold: Math.floor(working.gold * 0.5),
          lastActiveAt: Date.now(),
          combatLog: [`${new Date().toLocaleTimeString()} • Team collapsed and retreated to Wave 1`, ...working.combatLog].slice(0, 24),
        };
      }

      const withPotions = maybeAutoUsePotion({ ...working, monsterHp: hp, teamHp, lastActiveAt: Date.now() });
      const withCoolant = maybeAutoUseCoolant(withPotions);
      const withRecycle = maybeAutoRecycleBackground(withCoolant);
      const withSummon = maybeAutoSummonTick(withRecycle);
      if (withSummon.autoBurstEnabled && withSummon.burstCharge >= BURST_COST) {
        return applyBurst(withSummon, 4 * withSummon.combatTempo);
      }
      return withSummon;
    }

    case 'ATTACK': {
      if (!state.characterCreated) return state;
      const affix = getMonsterAffixModifiers(state.wave);
      const crit = Math.random() < 0.2;
      const dmg = (getActiveStrikeDamage(state) * (crit ? 1.8 : 1)) / affix.hpMult;
      const hp = state.monsterHp - dmg;
      const logged = queueCombatLog(state, `${crit ? 'CRIT' : 'Hit'} for ${Math.ceil(dmg)} dmg`);
      if (hp <= 0) return withAchievement(killMonster(logged));
      return { ...logged, monsterHp: hp };
    }

    case 'BURST': {
      return applyBurst(state, action.hits);
    }

    case 'BUY_PARTY': {
      const cfg = PARTY.find(p => p.id === action.id);
      if (!cfg) return state;
      const owned = state.party[action.id] ?? 0;
      const cost = action.amount === 1
        ? buildingCost(cfg.baseCost, owned, COST_SCALE)
        : bulkCost(cfg.baseCost, owned, action.amount, COST_SCALE);
      if (state.gold < cost) return state;
      const party = { ...state.party, [action.id]: owned + action.amount };
      return { ...state, gold: state.gold - cost, party };
    }

    case 'BUY_SKILL': {
      const skill = SKILLS.find(s => s.id === action.id);
      if (!skill || state.skills.has(skill.id) || state.gold < skill.cost) return state;
      const skills = new Set(state.skills);
      skills.add(skill.id);
      return { ...state, gold: state.gold - skill.cost, skills };
    }

    case 'ALLOCATE_STAT': {
      if (state.unspentStatPoints <= 0) return state;
      const statsAlloc = {
        ...state.statsAlloc,
        [action.stat]: state.statsAlloc[action.stat] + 1,
      };
      return ({
        ...state,
        statsAlloc,
        unspentStatPoints: state.unspentStatPoints - 1,
      });
    }

    case 'ALLOCATE_STAT_MAX': {
      if (state.unspentStatPoints <= 0) return state;
      const spend = state.unspentStatPoints;
      const statsAlloc = {
        ...state.statsAlloc,
        [action.stat]: state.statsAlloc[action.stat] + spend,
      };
      return ({
        ...state,
        statsAlloc,
        unspentStatPoints: 0,
      });
    }

    case 'ALLOCATE_STAT_N': {
      if (state.unspentStatPoints <= 0) return state;
      const spend = Math.min(action.amount, state.unspentStatPoints);
      const statsAlloc = {
        ...state.statsAlloc,
        [action.stat]: state.statsAlloc[action.stat] + spend,
      };
      return ({
        ...state,
        statsAlloc,
        unspentStatPoints: state.unspentStatPoints - spend,
      });
    }

    case 'EQUIP_ITEM': {
      if (!state.playerClass) return state;
      const item = getEquipmentEntry(state, action.itemId);
      if (!item) return state;
      if (!item.allowedClasses.includes(state.playerClass)) return state;
      if (!state.inventoryItemIds.includes(action.itemId)) return state;

      return {
        ...state,
        equippedItems: {
          ...state.equippedItems,
          [item.slot]: action.itemId,
        },
      };
    }

    case 'SUMMON_HERO': {
      const canUseFree = state.freeSummonCharges > 0;
      if (!canUseFree && state.bossTears < 1) return state;

      const template = HERO_POOL[Math.floor(Math.random() * HERO_POOL.length)];
      const roll = rollRarityWithPity(state.gachaPityCounter);
      const rarity = roll.rarity;
      const rarityMult = rarityConfig(rarity).boostMultiplier;
      const uid = `${template.id}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const hero: HeroUnit = {
        ...template,
        uid,
        rarity,
        level: 1,
        rank: 1,
        teamBoost: Number((template.baseTeamBoost * rarityMult).toFixed(4)),
      };

      const historyEntry: SummonHistoryEntry = {
        id: `hist_${uid}`,
        heroName: hero.name,
        heroEmoji: hero.emoji,
        rarity: hero.rarity,
        ts: Date.now(),
        pityTriggered: roll.pityTriggered,
      };

      let nextState = withAchievement(({
        ...state,
        bossTears: canUseFree ? state.bossTears : state.bossTears - 1,
        heroRoster: [hero, ...state.heroRoster],
        summonHistory: [historyEntry, ...state.summonHistory].slice(0, MAX_SAVE_SUMMON_HISTORY),
        totalSummons: state.totalSummons + 1,
        freeSummonCharges: canUseFree ? state.freeSummonCharges - 1 : state.freeSummonCharges,
        gachaPityCounter: roll.nextCounter,
      }));
      if (roll.pityTriggered) {
        nextState = queueReward(nextState, {
          id: `pity_single_${Date.now()}`,
          kind: 'system',
          title: 'Pity Triggered',
          detail: `${hero.emoji} ${hero.name} arrived at ${rarity.toUpperCase()}!`,
        });
      }
      return nextState;
    }

    case 'SUMMON_HERO_X10': {
      const totalPulls = 10;
      const freeUses = Math.min(state.freeSummonCharges, totalPulls);
      const paidUses = totalPulls - freeUses;
      if (state.bossTears < paidUses) return state;

      const summoned: HeroUnit[] = [];
      const historyBatch: SummonHistoryEntry[] = [];
      let pityCounter = state.gachaPityCounter;
      let pityHits = 0;
      for (let i = 0; i < totalPulls; i++) {
        const template = HERO_POOL[Math.floor(Math.random() * HERO_POOL.length)];
        const roll = rollRarityWithPity(pityCounter);
        pityCounter = roll.nextCounter;
        if (roll.pityTriggered) pityHits++;
        const rarity = roll.rarity;
        const rarityMult = rarityConfig(rarity).boostMultiplier;
        const uid = `${template.id}_${Date.now()}_${i}_${Math.floor(Math.random() * 10000)}`;
        const summonedHero: HeroUnit = {
          ...template,
          uid,
          rarity,
          level: 1,
          rank: 1,
          teamBoost: Number((template.baseTeamBoost * rarityMult).toFixed(4)),
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
      }

      let nextState = withAchievement(({
        ...state,
        bossTears: state.bossTears - paidUses,
        heroRoster: [...summoned, ...state.heroRoster],
        summonHistory: [...historyBatch, ...state.summonHistory].slice(0, MAX_SAVE_SUMMON_HISTORY),
        totalSummons: state.totalSummons + totalPulls,
        freeSummonCharges: state.freeSummonCharges - freeUses,
        gachaPityCounter: pityCounter,
      }));
      if (pityHits > 0) {
        nextState = queueReward(nextState, {
          id: `pity_x10_${Date.now()}`,
          kind: 'system',
          title: 'Pity Triggered',
          detail: `${pityHits} pity hit${pityHits > 1 ? 's' : ''} in this x10 summon.`,
        });
      }
      return nextState;
    }

    case 'SUMMON_HERO_X10_CINEMATIC': {
      const totalPulls = 10;
      const freeUses = Math.min(state.freeSummonCharges, totalPulls);
      const paidUses = totalPulls - freeUses;
      if (state.bossTears < paidUses) return state;

      const summoned: HeroUnit[] = [];
      const historyBatch: SummonHistoryEntry[] = [];
      let pityCounter = state.gachaPityCounter;
      let pityHits = 0;
      for (let i = 0; i < totalPulls; i++) {
        const template = HERO_POOL[Math.floor(Math.random() * HERO_POOL.length)];
        const roll = rollRarityWithPity(pityCounter);
        pityCounter = roll.nextCounter;
        if (roll.pityTriggered) pityHits++;
        const rarity = roll.rarity;
        const rarityMult = rarityConfig(rarity).boostMultiplier;
        const uid = `${template.id}_${Date.now()}_${i}_${Math.floor(Math.random() * 10000)}`;
        const summonedHero: HeroUnit = {
          ...template,
          uid,
          rarity,
          level: 1,
          rank: 1,
          teamBoost: Number((template.baseTeamBoost * rarityMult).toFixed(4)),
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
      }

      let nextState = withAchievement(({
        ...state,
        bossTears: state.bossTears - paidUses,
        heroRoster: [...summoned, ...state.heroRoster],
        summonHistory: [...historyBatch, ...state.summonHistory].slice(0, MAX_SAVE_SUMMON_HISTORY),
        totalSummons: state.totalSummons + totalPulls,
        freeSummonCharges: state.freeSummonCharges - freeUses + 1,
        gachaPityCounter: pityCounter,
      }));
      if (pityHits > 0) {
        nextState = queueReward(nextState, {
          id: `pity_x10_${Date.now()}`,
          kind: 'system',
          title: 'Pity Triggered',
          detail: `${pityHits} pity hit${pityHits > 1 ? 's' : ''} in this x10 summon.`,
        });
      }
      nextState = queueReward(nextState, {
        id: `cinematic_bonus_${Date.now()}`,
        kind: 'system',
        title: 'Cinematic Bonus',
        detail: '+1 free summon charge awarded.',
      });
      return nextState;
    }

    case 'AUTO_EQUIP_BEST_HEROES': {
      const sorted = [...state.heroRoster].sort((a, b) => {
        const rarityDiff = rarityRank(b.rarity) - rarityRank(a.rarity);
        if (rarityDiff !== 0) return rarityDiff;
        const statMultDiff = (b.rebirthStatMult ?? 1) - (a.rebirthStatMult ?? 1);
        if (Math.abs(statMultDiff) > 0.0001) return statMultDiff;
        if (b.level !== a.level) return b.level - a.level;
        return b.teamBoost - a.teamBoost;
      });
      const newTeam = normalizeTeamSelectionByRules(state, sorted.map(h => h.uid));
      const newMaxHp = getTeamMaxHp({ ...state, activeTeamHeroIds: newTeam });
      return ({
        ...state,
        activeTeamHeroIds: newTeam,
        teamMaxHp: newMaxHp,
        teamHp: Math.min(state.teamHp, newMaxHp),
      });
    }

    case 'SAVE_TEAM_LOADOUT': {
      const slot = Math.max(0, Math.min(2, action.slot));
      const next = [...state.teamLoadouts];
      next[slot] = [...state.activeTeamHeroIds];
      return queueReward({
        ...state,
        teamLoadouts: next,
      }, {
        id: `save_loadout_${slot}_${Date.now()}`,
        kind: 'system',
        title: `Saved Loadout ${slot + 1}`,
        detail: `${next[slot].length} heroes saved`,
      });
    }

    case 'LOAD_TEAM_LOADOUT': {
      const slot = Math.max(0, Math.min(2, action.slot));
      const source = state.teamLoadouts[slot] ?? [];
      const validIds = normalizeTeamSelectionByRules(state, source);
      const newMaxHp = getTeamMaxHp({ ...state, activeTeamHeroIds: validIds });
      return queueReward(({
        ...state,
        activeTeamHeroIds: validIds,
        teamMaxHp: newMaxHp,
        teamHp: Math.min(state.teamHp, newMaxHp),
      }), {
        id: `load_loadout_${slot}_${Date.now()}`,
        kind: 'system',
        title: `Loaded Loadout ${slot + 1}`,
        detail: `${validIds.length} heroes equipped`,
      });
    }

    case 'UNLOCK_TEAM_SLOT': {
      const currentSlots = getUnlockedTeamSlotCap(state);
      if (currentSlots >= ACTIVE_TEAM_SIZE) return state;

      const targetSlots = currentSlots + 1;
      const req = getTeamSlotUnlockRequirement(targetSlots);
      if (!req) return state;
      if (state.highestWaveReached < req.requiredWave) return state;
      if (state.gold < req.goldCost || state.heroShards < req.shardCost) return state;

      return queueReward({
        ...state,
        teamSlotsUnlocked: targetSlots,
        gold: state.gold - req.goldCost,
        heroShards: state.heroShards - req.shardCost,
      }, {
        id: `team_slot_unlock_${targetSlots}_${Date.now()}`,
        kind: 'system',
        title: `Team Slot ${targetSlots} Unlocked`,
        detail: `-${req.goldCost} gold, -${req.shardCost} shards`,
      });
    }

    case 'TOGGLE_EQUIP_HERO': {
      const exists = state.heroRoster.some(h => h.uid === action.uid);
      if (!exists) return state;
      const active = state.activeTeamHeroIds;
      let newTeam: string[];
      if (active.includes(action.uid)) {
        newTeam = active.filter(id => id !== action.uid);
      } else {
        const roleCounts = getTeamRoleCounts(state, active);
        const hero = state.heroRoster.find(h => h.uid === action.uid);
        if (!hero) return state;
        const role = state.heroFormationByUid[action.uid] ?? defaultFormationForClass(hero.heroClass);
        if (active.length >= getUnlockedTeamSlotCap(state)) {
          return queueReward(state, {
            id: `team_cap_${Date.now()}`,
            kind: 'system',
            title: 'Team Slot Locked',
            detail: 'Unlock additional slots in the War Room roster panel.',
          });
        }
        if (roleCounts[role] >= MAX_FORMATION_ROLE_HEROES) {
          return queueReward(state, {
            id: `formation_cap_${Date.now()}`,
            kind: 'system',
            title: 'Formation Limit Reached',
            detail: `Maximum ${MAX_FORMATION_ROLE_HEROES} heroes in ${role.toUpperCase()} line.`,
          });
        }
        newTeam = [...active, action.uid];
      }
      const newMaxHp = getTeamMaxHp({ ...state, activeTeamHeroIds: newTeam });
      return withAchievement(({
        ...state,
        activeTeamHeroIds: newTeam,
        teamMaxHp: newMaxHp,
        teamHp: Math.min(state.teamHp, newMaxHp),
      }));
    }

    case 'SET_ACTIVE_TEAM': {
      const validIds = normalizeTeamSelectionByRules(state, action.heroIds);
      const newMaxHp = getTeamMaxHp({ ...state, activeTeamHeroIds: validIds });
      return ({
        ...state,
        activeTeamHeroIds: validIds,
        teamMaxHp: newMaxHp,
        teamHp: Math.min(state.teamHp, newMaxHp),  // Cap current HP at new max
      });
    }

    case 'USE_USABLE_ITEM': {
      const qty = state.usableItemCounts[action.itemId] ?? 0;
      if (qty <= 0) return state;

      const requestedUses = action.amount === 'all'
        ? qty
        : clampInt(action.amount, 1, qty, 1);
      if (requestedUses <= 0) return state;

      const item = getUsableItem(action.itemId);
      if (!item) return state;

      let nextState: GameState = {
        ...state,
        usableItemCounts: addUsableItemCount(state.usableItemCounts, action.itemId, -requestedUses),
      };
      const useSuffix = requestedUses > 1 ? ` x${requestedUses}` : '';

      if (item.effect === 'heal_team_percent') {
        const healed = Math.ceil(nextState.teamMaxHp * item.value) * requestedUses;
        nextState = queueReward({
          ...nextState,
          teamHp: Math.min(nextState.teamMaxHp, nextState.teamHp + healed),
        }, {
          id: `use_${item.id}_${Date.now()}`,
          kind: 'item',
          title: `Used ${item.emoji} ${item.name}${useSuffix}`,
          detail: `Restored ${healed} team HP`,
        });
      }

      if (item.effect === 'gain_gold_flat') {
        const gain = Math.ceil(item.value * Math.pow(REBIRTH_BONUS, nextState.prestigeCount) * getVipGoldMultiplier(nextState)) * requestedUses;
        nextState = queueReward({
          ...nextState,
          gold: nextState.gold + gain,
          totalGold: nextState.totalGold + gain,
        }, {
          id: `use_${item.id}_${Date.now()}`,
          kind: 'gold',
          title: `Used ${item.emoji} ${item.name}${useSuffix}`,
          detail: `+${gain} gold`,
        });
      }

      if (item.effect === 'gain_exp_flat') {
        const gain = Math.ceil(item.value * getAchievementBonusMultiplier(nextState) * getVipExpMultiplier(nextState)) * requestedUses;
        const lvl = processLevelUp(nextState.exp + gain, nextState.level);
        nextState = queueReward({
          ...nextState,
          exp: lvl.exp,
          totalExp: nextState.totalExp + gain,
          level: lvl.level,
          unspentStatPoints: nextState.unspentStatPoints + lvl.gainedLevels * STAT_POINTS_PER_LEVEL,
        }, {
          id: `use_${item.id}_${Date.now()}`,
          kind: 'item',
          title: `Used ${item.emoji} ${item.name}${useSuffix}`,
          detail: `+${gain} EXP`,
        });
      }

      if (item.effect === 'gain_shards_flat') {
        const weekly = getCurrentWeeklyEvent(nextState);
        const gain = Math.ceil(item.value * (1 + nextState.prestigeCount * 0.04) * weekly.shardMultiplier) * requestedUses;
        nextState = queueReward({
          ...nextState,
          heroShards: nextState.heroShards + gain,
        }, {
          id: `use_${item.id}_${Date.now()}`,
          kind: 'shard',
          title: `Used ${item.emoji} ${item.name}${useSuffix}`,
          detail: `+${gain} shards`,
        });
      }

      if (item.effect === 'reduce_heat_flat') {
        const reduced = Math.max(0, nextState.combatHeat - item.value * requestedUses);
        nextState = queueReward({
          ...nextState,
          combatHeat: reduced,
        }, {
          id: `use_${item.id}_${Date.now()}`,
          kind: 'system',
          title: `Used ${item.emoji} ${item.name}${useSuffix}`,
          detail: `Heat ${Math.ceil(nextState.combatHeat)} -> ${Math.ceil(reduced)}`,
        });
      }

      if (item.effect === 'gain_vip_points_flat') {
        const gain = item.value * requestedUses;
        const nextPoints = nextState.vipPoints + gain;
        const nextLevel = getVipLevelFromPoints(nextPoints);
        const leveledUp = nextLevel > nextState.vipLevel;

        nextState = queueReward({
          ...nextState,
          vipPoints: nextPoints,
          vipLevel: nextLevel,
        }, {
          id: `use_${item.id}_${Date.now()}`,
          kind: 'system',
          title: `Used ${item.emoji} ${item.name}${useSuffix}`,
          detail: `+${gain} VIP points`,
        });

        if (leveledUp) {
          nextState = queueReward(nextState, {
            id: `vip_item_level_${nextLevel}_${Date.now()}`,
            kind: 'system',
            title: `VIP Level Up: ${nextLevel}`,
            detail: `Bonuses now: +${Math.round((getVipDamageMultiplier({ ...nextState, vipLevel: nextLevel }) - 1) * 100)}% DPS, +${Math.round((getVipGoldMultiplier({ ...nextState, vipLevel: nextLevel }) - 1) * 100)}% gold, +${Math.round((getVipExpMultiplier({ ...nextState, vipLevel: nextLevel }) - 1) * 100)}% EXP`,
          });
        }
      }

      return withAchievement((nextState));
    }

    case 'DISMANTLE_EQUIPMENT': {
      if (!state.inventoryItemIds.includes(action.itemId)) return state;
      if (Object.values(state.equippedItems).includes(action.itemId)) return state;
      const item = getEquipmentEntry(state, action.itemId);
      if (!item) return state;
      const gain = getEquipmentScrapGain(item);
      const nextEquipmentInventory = { ...state.equipmentInventory };
      delete nextEquipmentInventory[action.itemId];
      return queueReward({
        ...state,
        inventoryItemIds: state.inventoryItemIds.filter(id => id !== action.itemId),
        equipmentInventory: nextEquipmentInventory,
        equipmentScrap: state.equipmentScrap + gain,
      }, {
        id: `dismantle_${action.itemId}_${Date.now()}`,
        kind: 'item',
        title: `Dismantled ${item.emoji} ${item.name}`,
        detail: `+${gain} scrap`,
      });
    }

    case 'AUTO_DISMANTLE_EQUIPMENT': {
      const equippedIds = new Set(
        Object.values(state.equippedItems).filter((id): id is string => !!id),
      );
      const candidates = state.inventoryItemIds
        .filter(itemId => !equippedIds.has(itemId))
        .map(itemId => ({ itemId, item: getEquipmentEntry(state, itemId) }))
        .filter((entry): entry is { itemId: string; item: EquipmentInstance | EquipmentItem } => !!entry.item);
      if (candidates.length === 0) return state;

      const dismantleIds = new Set(candidates.map(entry => entry.itemId));
      const gain = candidates.reduce((sum, entry) => sum + getEquipmentScrapGain(entry.item), 0);
      const nextEquipmentInventory = { ...state.equipmentInventory };
      for (const itemId of dismantleIds) delete nextEquipmentInventory[itemId];
      return queueReward({
        ...state,
        inventoryItemIds: state.inventoryItemIds.filter(id => !dismantleIds.has(id)),
        equipmentInventory: nextEquipmentInventory,
        equipmentScrap: state.equipmentScrap + gain,
      }, {
        id: `auto_dismantle_${Date.now()}`,
        kind: 'item',
        title: 'Auto Dismantle Complete',
        detail: `+${gain} scrap from ${candidates.length} unequipped items`,
      });
    }

    case 'CRAFT_EQUIPMENT': {
      if (!state.playerClass) return state;
      const cost = getEquipmentCraftCost(action.slot);
      if (state.equipmentScrap < cost.scrap || state.gold < cost.gold) return state;

      const classSlotItems = EQUIPMENT_CATALOG.filter(item =>
        item.allowedClasses.includes(state.playerClass as PlayerClass) && item.slot === action.slot,
      );
      if (classSlotItems.length === 0) return state;

      const rolledRarity = rollEquipmentRarityByTier(Math.random(), hasUnlock(state, 'mythic_equipment'));
      const rarityPool = classSlotItems.filter(i => i.rarity === rolledRarity);
      const source = rarityPool.length > 0 ? rarityPool : classSlotItems;
      const item = createEquipmentInstance(source[Math.floor(Math.random() * source.length)], Math.max(1, state.level), 'craft');

      return queueReward({
        ...state,
        equipmentScrap: state.equipmentScrap - cost.scrap,
        gold: state.gold - cost.gold,
        equipmentInventory: {
          ...state.equipmentInventory,
          [item.id]: item,
        },
        inventoryItemIds: [...state.inventoryItemIds, item.id],
      }, {
        id: `craft_${item.id}_${Date.now()}`,
        kind: 'item',
        title: `Crafted ${item.emoji} ${item.name}`,
        detail: `${equipmentRarityConfig(item.rarity).label} ${item.slot} • iLv ${item.itemLevel} • -${cost.gold} gold`,
      });
    }

    case 'UPGRADE_EQUIPMENT_RARITY': {
      if (!state.inventoryItemIds.includes(action.itemId)) return state;
      const ownedItem = getEquipmentEntry(state, action.itemId);
      const item = ownedItem && 'baseItemId' in ownedItem ? getEquipmentItem(ownedItem.baseItemId) : ownedItem;
      if (!item || !ownedItem) return state;
      const plan = getEquipmentUpgradePlan(state, action.itemId);
      if (!plan.targetItemId || !plan.targetRarity) return state;
      if (state.equipmentScrap < plan.scrapCost || state.essence < plan.essenceCost || state.gold < plan.goldCost) return state;
      const target = getEquipmentItem(plan.targetItemId);
      if (!target) return state;

      const upgradedItem = createEquipmentInstance(target, 'itemLevel' in ownedItem ? ownedItem.itemLevel + 2 : Math.max(1, state.level), 'upgrade');
      const withReplacedInventory = state.inventoryItemIds.filter(id => id !== action.itemId);
      const nextInventory = [...withReplacedInventory, upgradedItem.id];
      const nextEquipmentInventory = { ...state.equipmentInventory };
      delete nextEquipmentInventory[action.itemId];
      nextEquipmentInventory[upgradedItem.id] = upgradedItem;

      return queueReward({
        ...state,
        inventoryItemIds: nextInventory,
        equipmentInventory: nextEquipmentInventory,
        equipmentScrap: state.equipmentScrap - plan.scrapCost,
        essence: state.essence - plan.essenceCost,
        gold: state.gold - plan.goldCost,
        equippedItems: Object.fromEntries(
          Object.entries(state.equippedItems).map(([slot, equippedId]) => [slot, equippedId === action.itemId ? upgradedItem.id : equippedId]),
        ) as Record<EquipmentSlot, string | null>,
      }, {
        id: `upgrade_${action.itemId}_${Date.now()}`,
        kind: 'item',
        title: `Upgraded ${item.name}`,
        detail: `Now ${target.emoji} ${target.name} (${plan.targetRarity.toUpperCase()}) • iLv ${upgradedItem.itemLevel} • -${plan.goldCost} gold`,
      });
    }

    case 'SET_AUTO_USE_POTION': {
      return {
        ...state,
        autoUsePotionEnabled: action.enabled,
      };
    }

    case 'SET_AUTO_USE_COOLANT': {
      return {
        ...state,
        autoUseCoolantEnabled: action.enabled,
      };
    }

    case 'SET_AUTO_USE_POTION_THRESHOLD': {
      const clamped = Math.max(0.1, Math.min(1, action.thresholdPct));
      return {
        ...state,
        autoUsePotionThresholdPct: clamped,
      };
    }

    case 'SPEND_ESSENCE_UPGRADE': {
      const currentLevel = action.path === 'damage'
        ? state.metaDamageLevel
        : action.path === 'economy'
          ? state.metaEconomyLevel
          : state.metaSurvivalLevel;
      const cost = getEssenceUpgradeCost(currentLevel);
      if (state.essence < cost) return state;

      const base = {
        ...state,
        essence: state.essence - cost,
      };

      if (action.path === 'damage') {
        return queueReward({ ...base, metaDamageLevel: state.metaDamageLevel + 1 }, {
          id: `meta_damage_${Date.now()}`,
          kind: 'system',
          title: 'Meta Upgrade: Damage Path',
          detail: `Level ${state.metaDamageLevel + 1}`,
        });
      }

      if (action.path === 'economy') {
        return queueReward({ ...base, metaEconomyLevel: state.metaEconomyLevel + 1 }, {
          id: `meta_econ_${Date.now()}`,
          kind: 'system',
          title: 'Meta Upgrade: Economy Path',
          detail: `Level ${state.metaEconomyLevel + 1}`,
        });
      }

      return queueReward({ ...base, metaSurvivalLevel: state.metaSurvivalLevel + 1 }, {
        id: `meta_survival_${Date.now()}`,
        kind: 'system',
        title: 'Meta Upgrade: Survival Path',
        detail: `Level ${state.metaSurvivalLevel + 1}`,
      });
    }

    case 'APPLY_WEEKLY_ROLLOVER': {
      if (!state.characterCreated) return state;
      const week = weekNumberForTimestamp(action.nowMs);
      if (week === state.weeklyEventWeek) return state;
      const event = getWeeklyEventByWeek(week);
      return queueReward({
        ...state,
        weeklyEventWeek: week,
        weeklyEventId: event.id,
        weeklyKills: 0,
        weeklyTrackClaimed: [],
      }, {
        id: `weekly_rollover_${week}`,
        kind: 'system',
        title: `Weekly Event: ${event.name}`,
        detail: event.description,
      });
    }

    case 'CLAIM_WEEKLY_TRACK': {
      if (state.weeklyTrackClaimed.includes(action.milestone)) return state;
      if (!WEEKLY_TRACK_MILESTONES.includes(action.milestone)) return state;
      if (state.weeklyKills < action.milestone) return state;

      const gold = 220 + action.milestone * 12;
      const shards = 18 + Math.floor(action.milestone * 1.8);
      const essence = action.milestone >= 150 ? 4 : action.milestone >= 75 ? 2 : 1;

      return queueReward({
        ...state,
        weeklyTrackClaimed: [...state.weeklyTrackClaimed, action.milestone],
        gold: state.gold + gold,
        totalGold: state.totalGold + gold,
        heroShards: state.heroShards + shards,
        essence: state.essence + essence,
      }, {
        id: `weekly_track_${action.milestone}_${Date.now()}`,
        kind: 'system',
        title: 'Weekly Track Claimed',
        detail: `+${gold} gold, +${shards} shards, +${essence} essence`,
      });
    }

    case 'CLAIM_MISSION': {
      if (state.claimedMissionIds.includes(action.missionId)) return state;
      const mission = MISSION_BOARD_GOALS.find(m => m.id === action.missionId);
      if (!mission) return state;
      const progress = getMissionProgressValue(state, mission);
      if (progress < mission.target) return state;

      const rewardGold = mission.rewardGold ?? 0;
      const rewardShards = mission.rewardShards ?? 0;
      const rewardEssence = mission.rewardEssence ?? 0;
      const rewardDiamonds = mission.rewardDiamonds ?? 0;
      return queueReward({
        ...state,
        claimedMissionIds: [...state.claimedMissionIds, mission.id],
        gold: state.gold + rewardGold,
        totalGold: state.totalGold + rewardGold,
        diamonds: state.diamonds + rewardDiamonds,
        heroShards: state.heroShards + rewardShards,
        essence: state.essence + rewardEssence,
      }, {
        id: `mission_${mission.id}_${Date.now()}`,
        kind: 'system',
        title: `Mission Complete: ${mission.title}`,
        detail: `+${rewardGold} gold, +${rewardShards} shards, +${rewardEssence} essence${rewardDiamonds > 0 ? `, +${rewardDiamonds} diamonds` : ''}`,
      });
    }

    case 'MARK_HINT_SEEN': {
      if (state.seenHintIds.includes(action.hintId)) return state;
      return {
        ...state,
        seenHintIds: [...state.seenHintIds, action.hintId],
      };
    }

    case 'APPLY_OFFLINE_PROGRESS': {
      if (!state.characterCreated) return state;
      const elapsed = Math.max(0, Math.min(action.elapsedMs, OFFLINE_PROGRESS_CAP_MS));
      if (elapsed < 5000) return { ...state, lastActiveAt: Date.now() };

      const MAX_OFFLINE_KILLS = Math.min(3200, Math.max(1200, 900 + Math.floor(state.highestWaveReached * 1.5)));
      const MAX_OFFLINE_WAVES = Math.min(260, Math.max(90, 60 + Math.floor(Math.sqrt(Math.max(1, state.wave)) * 10)));
      const MIN_KILL_MS = 140;
      let remainingMs = elapsed;
      let working = state;
      const startWave = state.wave;
      const startKills = state.totalKills;
      const startGold = state.gold;
      const startExp = state.totalExp;
      const baseRewardQueue = state.rewardQueue;
      const baseCombatLog = state.combatLog;

      while (
        remainingMs > 0
        && working.characterCreated
        && (working.totalKills - startKills) < MAX_OFFLINE_KILLS
        && (working.wave - startWave) < MAX_OFFLINE_WAVES
      ) {
        const weekly = getCurrentWeeklyEvent(working);
        const affix = getMonsterAffixModifiers(working.wave);
        const dps = Math.max(1, getDps(working));
        const killMs = Math.max(
          MIN_KILL_MS,
          Math.ceil((working.monsterHp * affix.hpMult * weekly.enemyHpMultiplier / dps) * 1000),
        );

        if (killMs > remainingMs) {
          const dealt = (dps * (remainingMs / 1000)) / (affix.hpMult * weekly.enemyHpMultiplier);
          working = {
            ...working,
            monsterHp: Math.max(1, working.monsterHp - dealt),
          };
          remainingMs = 0;
          break;
        }

        working = killMonster(working);
        remainingMs -= killMs;
      }

      const killsGained = working.totalKills - startKills;
      const wavesGained = Math.max(0, working.wave - startWave);
      const goldGain = Math.max(0, working.gold - startGold);
      const expGain = Math.max(0, working.totalExp - startExp);
      const reachedKillCap = killsGained >= MAX_OFFLINE_KILLS;
      const reachedWaveCap = wavesGained >= MAX_OFFLINE_WAVES;
      working = {
        ...working,
        rewardQueue: baseRewardQueue,
        combatLog: baseCombatLog,
      };

      const next = queueReward({
        ...working,
        lastActiveAt: Date.now(),
      }, {
        id: `offline_${Date.now()}`,
        kind: 'system',
        title: 'Offline Progress',
        detail: `+${killsGained} kills • +${wavesGained} waves • +${goldGain} gold • +${expGain} EXP • now Wave ${working.wave}${(reachedKillCap || reachedWaveCap) ? ' (simulation cap reached)' : ''}`,
      });
      return withAchievement((next));
    }

    case 'APPLY_DAILY_LOGIN': {
      if (!state.characterCreated) return state;
      const today = toDayNumber(action.nowMs);
      if (state.lastDailyLoginDay === today) return state;

      const daysSinceLast = state.lastDailyLoginDay === null ? null : today - state.lastDailyLoginDay;
      const usedInsurance = daysSinceLast === 2 && state.streakInsuranceCharges > 0;
      const continued = (daysSinceLast === 1) || usedInsurance;
      const streak = continued ? state.dailyLoginStreak + 1 : 1;
      const goldReward = 250 + Math.min(9, streak - 1) * 80;
      const shardReward = 20 + Math.min(9, streak - 1) * 6;
      const freeSummonBonus = streak % 3 === 0 ? 1 : 0;
      const insuranceEarned = streak % 7 === 0 ? 1 : 0;
      const nextInsurance = Math.min(3, state.streakInsuranceCharges - (usedInsurance ? 1 : 0) + insuranceEarned);

      const next = queueReward({
        ...state,
        gold: state.gold + goldReward,
        totalGold: state.totalGold + goldReward,
        heroShards: state.heroShards + shardReward,
        freeSummonCharges: state.freeSummonCharges + freeSummonBonus,
        dailyLoginStreak: streak,
        lastDailyLoginDay: today,
        streakInsuranceCharges: nextInsurance,
      }, {
        id: `daily_login_${today}`,
        kind: 'system',
        title: `Daily Login • Day ${streak}`,
        detail: `+${goldReward} gold, +${shardReward} shards${freeSummonBonus > 0 ? ', +1 free summon' : ''}${usedInsurance ? ', streak insurance consumed' : ''}${insuranceEarned > 0 ? ', +1 streak insurance' : ''}`,
      });

      return withAchievement((next));
    }

    case 'REBIRTH': {
      const rebirthRequirement = getRebirthWaveRequirement(state.prestigeCount);
      if (state.highestWaveReached < rebirthRequirement) return state;
      const surplusWaves = Math.max(0, state.highestWaveReached - rebirthRequirement);
      const surplusStride = Math.max(15, Math.floor(rebirthRequirement * 0.05));
      const baseCoreGain = 1 + Math.floor(state.prestigeCount * 0.25);
      const gainedCores = baseCoreGain + Math.floor(surplusWaves / surplusStride);
      const refundedStats = state.statsAlloc.strength + state.statsAlloc.vitality + state.statsAlloc.agility + state.statsAlloc.intelligence + state.statsAlloc.spirit;
      return queueReward({
        ...state,
        gold: 0,
        exp: 0,
        level: 1,
        unspentStatPoints: state.unspentStatPoints + refundedStats,
        statsAlloc: blankStats,
        wave: 1,
        monsterHp: getMonsterMaxHp(1),
        monsterMaxHp: getMonsterMaxHp(1),
        teamHp: 100,
        teamMaxHp: 100,
        party: initialParty(),
        skills: new Set(),
        activeTeamHeroIds: [],
        prestigeCount: state.prestigeCount + 1,
        newAchievement: null,
        damageBuffPct: 0,
        damageBuffMs: 0,
        damageReductionBuffPct: 0,
        damageReductionBuffMs: 0,
        heroActiveCdMs: {},
        lastActiveAt: Date.now(),
        seasonPoints: state.seasonPoints + 250,
        bestSeasonPoints: Math.max(state.bestSeasonPoints, state.seasonPoints + 250),
        rebirthCores: state.rebirthCores + gainedCores,
      }, {
        id: `rebirth_cores_${Date.now()}`,
        kind: 'system',
        title: 'Rebirth Complete',
        detail: `+${gainedCores} rebirth cores • requirement was Wave ${rebirthRequirement} • surplus ${surplusWaves}`,
      });
    }

    case 'CLEAR_ACHIEVEMENT':
      return { ...state, newAchievement: null };

    case 'CLEAR_REWARD_POPUP':
      return {
        ...state,
        rewardQueue: state.rewardQueue.slice(1),
      };

    case 'RECYCLE_HERO': {
      const hero = state.heroRoster.find(h => h.uid === action.uid);
      if (!hero) return state;
      
      // Calculate shard reward and remove hero from roster
      const weekly = getCurrentWeeklyEvent(state);
      const shardReward = Math.ceil(calculateShardReward(hero.rarity, hero.level) * weekly.shardMultiplier);
      const newRoster = state.heroRoster.filter(h => h.uid !== action.uid);
      const newActiveTeam = state.activeTeamHeroIds.filter(id => id !== action.uid);
      const newMaxHp = getTeamMaxHp({ ...state, heroRoster: newRoster, activeTeamHeroIds: newActiveTeam });
      const heroFormationByUid = Object.fromEntries(
        Object.entries(state.heroFormationByUid).filter(([uid]) => uid !== action.uid),
      ) as Record<string, HeroFormationRole>;
      const heroActiveCdMs = Object.fromEntries(
        Object.entries(state.heroActiveCdMs).filter(([uid]) => uid !== action.uid),
      ) as Record<string, number>;
      
      return {
        ...state,
        heroRoster: newRoster,
        activeTeamHeroIds: newActiveTeam,
        heroFormationByUid,
        heroActiveCdMs,
        heroShards: state.heroShards + shardReward,
        teamMaxHp: newMaxHp,
        teamHp: Math.min(state.teamHp, newMaxHp),
      };
    }

    case 'AUTO_RECYCLE_HEROES': {
      const activeTeam = new Set(state.activeTeamHeroIds);
      const maxRank = rarityRank(state.autoRecycleMaxRarity);
      const toRecycle = state.heroRoster.filter(
        h => !activeTeam.has(h.uid) && rarityRank(h.rarity) <= maxRank,
      );
      if (toRecycle.length === 0) return state;

      const recycledIds = new Set(toRecycle.map(h => h.uid));
      const weekly = getCurrentWeeklyEvent(state);
      const shardReward = Math.ceil(toRecycle.reduce((sum, hero) => sum + calculateShardReward(hero.rarity, hero.level), 0) * weekly.shardMultiplier);
      const newRoster = state.heroRoster.filter(h => !recycledIds.has(h.uid));
      const newMaxHp = getTeamMaxHp({ ...state, heroRoster: newRoster });
      const heroFormationByUid = Object.fromEntries(
        Object.entries(state.heroFormationByUid).filter(([uid]) => !recycledIds.has(uid)),
      ) as Record<string, HeroFormationRole>;
      const heroActiveCdMs = Object.fromEntries(
        Object.entries(state.heroActiveCdMs).filter(([uid]) => !recycledIds.has(uid)),
      ) as Record<string, number>;

      const nextState: GameState = {
        ...state,
        heroRoster: newRoster,
        heroFormationByUid,
        heroActiveCdMs,
        heroShards: state.heroShards + shardReward,
        teamMaxHp: newMaxHp,
        teamHp: Math.min(state.teamHp, newMaxHp),
      };

      return queueReward(nextState, {
        id: `auto_recycle_${Date.now()}`,
        kind: 'shard',
        title: 'Auto Recycle Complete',
        detail: `+${shardReward} shards from ${toRecycle.length} heroes (${state.autoRecycleMaxRarity} and below)`,
      });
    }

    case 'SET_AUTO_RECYCLE_MAX_RARITY': {
      return {
        ...state,
        autoRecycleMaxRarity: action.rarity,
      };
    }

    case 'SET_HERO_FORMATION': {
      const hero = state.heroRoster.find(h => h.uid === action.uid);
      if (!hero) return state;
      // Reject roles that aren't valid for this hero's class
      const validRoles = VALID_FORMATION_ROLES_FOR_CLASS[hero.heroClass];
      if (!validRoles.includes(action.role)) return state;
      const activeTeamSet = new Set(state.activeTeamHeroIds);
      if (activeTeamSet.has(action.uid)) {
        const nextRoleCounts = getTeamRoleCounts(state, state.activeTeamHeroIds.filter(id => id !== action.uid));
        if (nextRoleCounts[action.role] >= MAX_FORMATION_ROLE_HEROES) {
          return queueReward(state, {
            id: `formation_swap_blocked_${Date.now()}`,
            kind: 'system',
            title: 'Formation Limit Reached',
            detail: `Maximum ${MAX_FORMATION_ROLE_HEROES} heroes in ${action.role.toUpperCase()} line.`,
          });
        }
      }
      return {
        ...state,
        heroFormationByUid: {
          ...state.heroFormationByUid,
          [action.uid]: action.role,
        },
      };
    }

    case 'PLAY_DICE_ROLL': {
      const today = toDayNumber(Date.now());
      if (state.lastDiceRollDay === today) return state;

      const forcedRoll = typeof action.forcedRoll === 'number' && Number.isFinite(action.forcedRoll)
        ? Math.floor(action.forcedRoll)
        : null;
      const roll = forcedRoll == null ? 1 + Math.floor(Math.random() * 20) : Math.max(1, Math.min(20, forcedRoll));
      // Exact same formula as UI for consistency
      const diamonds = roll === 20 ? 30 : roll >= 17 ? 18 : roll >= 13 ? 12 : roll >= 9 ? 8 : 5;
      const shardBonus = roll >= 15 ? Math.floor(roll * 1.5 * 8) : 0;

      return queueReward({
        ...state,
        diamonds: state.diamonds + diamonds,
        heroShards: state.heroShards + shardBonus,
        lastDiceRollDay: today,
        lastDiceRollValue: roll,
      }, {
        id: `dice_roll_${today}`,
        kind: 'system',
        title: 'Dice Protocol Complete',
        detail: `Rolled ${roll}/20: +${diamonds} diamonds${shardBonus > 0 ? `, +${shardBonus} shards` : ''}`,
      });
    }

    case 'RUN_RIFT_DUNGEON': {
      const today = toDayNumber(Date.now());
      if (state.lastRiftRunDay === today) return state;

      const hasForcedOutcome =
        typeof action.forcedWaves === 'number' && Number.isFinite(action.forcedWaves) &&
        typeof action.forcedDiamonds === 'number' && Number.isFinite(action.forcedDiamonds) &&
        typeof action.forcedShards === 'number' && Number.isFinite(action.forcedShards) &&
        typeof action.forcedEssence === 'number' && Number.isFinite(action.forcedEssence);

      const teamPower = Math.max(1, getDps(state));
      const monsterMaxHpHere = Math.max(1, getMonsterMaxHp(state.wave));
      const expected = Math.min(5, Math.max(1, Math.floor((teamPower / (monsterMaxHpHere * 0.12)) * 2)));
      const variance = Math.floor(Math.random() * 3) - 1;
      const fallbackWaves = Math.max(1, Math.min(5, expected + variance));

      const clearedWaves = hasForcedOutcome
        ? Math.max(1, Math.min(5, Math.floor(action.forcedWaves!)))
        : fallbackWaves;
      const diamonds = hasForcedOutcome
        ? Math.max(0, Math.floor(action.forcedDiamonds!))
        : Math.max(8, Math.floor(8 + clearedWaves * 4 + (clearedWaves === 5 ? 8 : 0)));
      const shardReward = hasForcedOutcome
        ? Math.max(0, Math.floor(action.forcedShards!))
        : Math.max(40, Math.floor(clearedWaves * 90 * (1 + state.highestWaveReached / 250)));
      const essenceReward = hasForcedOutcome
        ? Math.max(0, Math.floor(action.forcedEssence!))
        : (clearedWaves >= 4 ? 1 : 0);

      return queueReward({
        ...state,
        diamonds: state.diamonds + diamonds,
        heroShards: state.heroShards + shardReward,
        essence: state.essence + essenceReward,
        lastRiftRunDay: today,
        lastRiftWavesCleared: clearedWaves,
      }, {
        id: `rift_run_${today}`,
        kind: 'system',
        title: 'Rift Breach Cleared',
        detail: `${clearedWaves}/5 waves: +${diamonds} diamonds, +${shardReward} shards${essenceReward > 0 ? `, +${essenceReward} essence` : ''}`,
      });
    }

    case 'BATCH_LEVEL_HEROES': {
      const selected = new Set(action.heroIds);
      if (selected.size === 0) return state;

      const levelsByUid: Record<string, number> = {};
      for (const hero of state.heroRoster) {
        if (selected.has(hero.uid)) {
          levelsByUid[hero.uid] = hero.level;
        }
      }

      let gold = state.gold;

      if (action.addLevels === 'max') {
        // Greedy strategy: always buy the cheapest next level among selected heroes.
        while (true) {
          let cheapestUid: string | null = null;
          let cheapestCost = Number.POSITIVE_INFINITY;

          for (const uid of Object.keys(levelsByUid)) {
            const lvl = levelsByUid[uid];
            if (lvl >= HERO_LEVEL_CAP) continue;
            const nextCost = getHeroGoldLevelCost(lvl);
            if (nextCost < cheapestCost) {
              cheapestCost = nextCost;
              cheapestUid = uid;
            }
          }

          if (!cheapestUid || !Number.isFinite(cheapestCost) || gold < cheapestCost) break;
          gold -= cheapestCost;
          levelsByUid[cheapestUid] += 1;
        }
      } else {
        const steps = Math.max(0, Math.floor(action.addLevels));
        for (let step = 0; step < steps; step++) {
          for (const uid of Object.keys(levelsByUid)) {
            const lvl = levelsByUid[uid];
            if (lvl >= HERO_LEVEL_CAP) continue;
            const cost = getHeroGoldLevelCost(lvl);
            if (gold < cost) continue;
            gold -= cost;
            levelsByUid[uid] = lvl + 1;
          }
        }
      }

      const heroRoster = state.heroRoster.map(hero => {
        const nextLevel = levelsByUid[hero.uid];
        return nextLevel == null ? hero : { ...hero, level: nextLevel };
      });

      return {
        ...state,
        gold,
        heroRoster,
      };
    }

    case 'UPGRADE_FACILITY': {
      const facility = state.guildhallFacilities[action.facilityId];
      const currentLevel = facility.level;
      const cost = getFacilityUpgradeCost(action.facilityId, currentLevel);
      if (currentLevel >= FACILITY_MAX_LEVEL || state.gold < cost) return state;

      return {
        ...state,
        gold: state.gold - cost,
        guildhallFacilities: {
          ...state.guildhallFacilities,
          [action.facilityId]: { level: currentLevel + 1 },
        },
      };
    }

    case 'START_EXPEDITION': {
      const refreshedState = maybeAutoRefreshExpeditionContracts(state, Date.now());

      const rarityPool = ['common', 'rare', 'epic', 'legendary', 'godly'] as const;
      const rarity = action.offeredRarity && rarityPool.includes(action.offeredRarity)
        ? action.offeredRarity
        : refreshedState.expeditionContractOffers[action.expeditionType] ?? rarityPool[Math.floor(Math.random() * rarityPool.length)];

      const configByRarity: Record<typeof rarityPool[number], { goldCost: number; durationMs: number; reward: { diamonds: number; shards: number; essence: number; artifacts: number } }> = {
        common: {
          goldCost: 25_000,
          durationMs: 5 * 60 * 1000,
          reward: { diamonds: 35, shards: 150, essence: 0, artifacts: 0 },
        },
        rare: {
          goldCost: 75_000,
          durationMs: 20 * 60 * 1000,
          reward: { diamonds: 75, shards: 320, essence: 0, artifacts: 1 },
        },
        epic: {
          goldCost: 220_000,
          durationMs: 90 * 60 * 1000,
          reward: { diamonds: 140, shards: 700, essence: 1, artifacts: 2 },
        },
        legendary: {
          goldCost: 500_000,
          durationMs: 4 * 60 * 60 * 1000,
          reward: { diamonds: 240, shards: 1300, essence: 2, artifacts: 4 },
        },
        godly: {
          goldCost: 1_000_000,
          durationMs: 8 * 60 * 60 * 1000,
          reward: { diamonds: 400, shards: 2400, essence: 4, artifacts: 8 },
        },
      };

      const config = configByRarity[rarity];
      if (!config || refreshedState.gold < config.goldCost) return refreshedState;

      const expeditionId = `exp_${action.expeditionType}_${Date.now()}`;

      return {
        ...refreshedState,
        gold: refreshedState.gold - config.goldCost,
        expeditionQueue: [
          ...refreshedState.expeditionQueue,
          {
            id: expeditionId,
            type: action.expeditionType as any,
            rarity,
            startTime: Date.now(),
            durationMs: config.durationMs,
            reward: config.reward,
          },
        ],
      };
    }

    case 'REFRESH_EXPEDITION_CONTRACTS': {
      const refreshedState = maybeAutoRefreshExpeditionContracts(state, Date.now());
      if (refreshedState.gold < EXPEDITION_CONTRACT_REFRESH_GOLD_COST) return refreshedState;

      return {
        ...refreshedState,
        gold: refreshedState.gold - EXPEDITION_CONTRACT_REFRESH_GOLD_COST,
        expeditionContractOffers: rollExpeditionContractOffers(),
        expeditionContractsRefreshedAt: Date.now(),
      };
    }

    case 'COMPLETE_EXPEDITION': {
      const expIndex = state.expeditionQueue.findIndex(e => e.id === action.expeditionId);
      if (expIndex === -1) return state;

      const expedition = state.expeditionQueue[expIndex];
      const newQueue = state.expeditionQueue.filter((_, i) => i !== expIndex);

      return queueReward({
        ...state,
        diamonds: state.diamonds + expedition.reward.diamonds,
        heroShards: state.heroShards + expedition.reward.shards,
        essence: state.essence + expedition.reward.essence,
        expeditionQueue: newQueue,
      }, {
        id: `expedition_${expedition.id}`,
        kind: 'system',
        title: 'Expedition Complete',
        detail: `${expedition.type} returned +${expedition.reward.diamonds} diamonds, +${expedition.reward.shards} shards${expedition.reward.essence > 0 ? `, +${expedition.reward.essence} essence` : ''}`,
      });
    }

    case 'SET_AUTO_RECYCLE_ENABLED': {
      return {
        ...state,
        autoRecycleEnabled: action.enabled,
      };
    }

    case 'RANK_UP_HERO': {
      const hero = state.heroRoster.find(h => h.uid === action.uid);
      if (!hero || hero.rank >= 10) return state;
      
      const nextRankCost = getRankUpShardCost(hero.rarity, hero.rank + 1);
      if (!Number.isFinite(nextRankCost) || state.heroShards < nextRankCost) return state;
      
      // Rank up the hero
      const updatedHero = { ...hero, rank: hero.rank + 1 };
      const newRoster = state.heroRoster.map(h => h.uid === action.uid ? updatedHero : h);
      
      return {
        ...state,
        heroRoster: newRoster,
        heroShards: state.heroShards - nextRankCost,
      };
    }

    case 'LEVEL_UP_HERO_GOLD': {
      const hero = state.heroRoster.find(h => h.uid === action.uid);
      if (!hero || hero.level >= HERO_LEVEL_CAP) return state;
      const cost = getHeroGoldLevelCost(hero.level);
      if (state.gold < cost) return state;
      const newRoster = state.heroRoster.map(h =>
        h.uid === action.uid ? { ...h, level: h.level + 1 } : h
      );
      return {
        ...state,
        gold: state.gold - cost,
        heroRoster: newRoster,
      };
    }

    case 'REBIRTH_HERO': {
      const hero = state.heroRoster.find(h => h.uid === action.uid);
      if (!hero || hero.rank < 10 || hero.level < HERO_LEVEL_CAP) return state;

      const rebirthPlan = getHeroRebirthPlan(hero);
      const shardCost = rebirthPlan.shardCost;
      const essenceCost = rebirthPlan.essenceCost;
      if (state.heroShards < shardCost || state.essence < essenceCost) return state;

      const updatedHero = normalizeHero({
        ...hero,
        level: 1,
        rank: 1,
        rebirthStatMult: rebirthPlan.nextStatMultiplier,
      });

      return queueReward({
        ...state,
        heroShards: state.heroShards - shardCost,
        essence: state.essence - essenceCost,
        heroRoster: state.heroRoster.map(h => h.uid === action.uid ? updatedHero : h),
      }, {
        id: `hero_rebirth_${hero.uid}_${Date.now()}`,
        kind: 'system',
        title: `${hero.name} Reborn`,
        detail: `-${shardCost} shards, -${essenceCost} essence • +${rebirthPlan.statGainPct}% hero stat gain • stat multiplier x${(updatedHero.rebirthStatMult ?? 1).toFixed(2)}`,
      });
    }

    case 'CONVERT_SHARDS_TO_ESSENCE': {
      const cost = getShardToEssenceCost(state);
      if (state.heroShards < cost) return state;
      return queueReward({
        ...state,
        heroShards: state.heroShards - cost,
        essence: state.essence + 1,
      }, {
        id: `shard_to_essence_${Date.now()}`,
        kind: 'system',
        title: 'Shard Forge',
        detail: `Converted ${cost} shards into +1 essence`,
      });
    }

    case 'CONVERT_SHARDS_TO_SCRAP': {
      const cost = getShardToScrapCost();
      if (state.heroShards < cost) return state;
      return queueReward({
        ...state,
        heroShards: state.heroShards - cost,
        equipmentScrap: state.equipmentScrap + 140,
      }, {
        id: `shard_to_scrap_${Date.now()}`,
        kind: 'system',
        title: 'Shard Forge',
        detail: `Converted ${cost} shards into +140 scrap`,
      });
    }

    case 'SPEND_REBIRTH_CORE': {
      const currentLevel = action.path === 'damage'
        ? state.rebirthDamagePath
        : action.path === 'economy'
          ? state.rebirthEconomyPath
          : state.rebirthSurvivalPath;
      const cost = getRebirthPathCost(currentLevel);
      if (state.rebirthCores < cost) return state;

      const base = {
        ...state,
        rebirthCores: state.rebirthCores - cost,
      };

      if (action.path === 'damage') {
        return queueReward({ ...base, rebirthDamagePath: state.rebirthDamagePath + 1 }, {
          id: `rebirth_path_dmg_${Date.now()}`,
          kind: 'system',
          title: 'Rebirth Tree: Damage Path',
          detail: `Level ${state.rebirthDamagePath + 1}`,
        });
      }
      if (action.path === 'economy') {
        return queueReward({ ...base, rebirthEconomyPath: state.rebirthEconomyPath + 1 }, {
          id: `rebirth_path_econ_${Date.now()}`,
          kind: 'system',
          title: 'Rebirth Tree: Economy Path',
          detail: `Level ${state.rebirthEconomyPath + 1}`,
        });
      }
      return queueReward({ ...base, rebirthSurvivalPath: state.rebirthSurvivalPath + 1 }, {
        id: `rebirth_path_surv_${Date.now()}`,
        kind: 'system',
        title: 'Rebirth Tree: Survival Path',
        detail: `Level ${state.rebirthSurvivalPath + 1}`,
      });
    }

    case 'SET_AUTO_SUMMON_ENABLED': {
      return {
        ...state,
        autoSummonEnabled: action.enabled,
      };
    }

    case 'SET_AUTO_SUMMON_MODE': {
      return {
        ...state,
        autoSummonMode: action.mode,
      };
    }

    case 'SET_AUTO_BURST_ENABLED': {
      return {
        ...state,
        autoBurstEnabled: action.enabled,
      };
    }

    case 'SET_COMBAT_TEMPO': {
      return {
        ...state,
        combatTempo: clampCombatTempoForVip(action.tempo, state),
      };
    }

    case 'SET_AUTO_TEMPO_ENABLED': {
      return {
        ...state,
        autoTempoEnabled: action.enabled,
      };
    }

    case 'SET_AUTO_TEMPO_TARGET': {
      return {
        ...state,
        autoTempoTarget: clampAutoTempoTargetForVip(action.target, state),
      };
    }

    case 'SET_AUTO_SUMMON_RESERVE_GOLD': {
      return {
        ...state,
        autoSummonReserveGold: Math.max(0, action.reserveGold),
      };
    }

    case 'BUY_GOLD_SHOP_ITEM': {
      const cost = GOLD_SHOP_COSTS[action.offerId];
      if (state.gold < cost) return state;

      if (action.offerId === 'exp_cache') {
        const nextState = {
          ...state,
          gold: state.gold - cost,
          usableItemCounts: addUsableItemCount(state.usableItemCounts, 'exp_scroll', 6),
        };
        return queueReward(nextState, {
          id: `shop_gold_exp_${Date.now()}`,
          kind: 'item',
          title: 'Gold Shop Purchase: Training Cache',
          detail: '-2800 gold, +6 Training Scrolls',
        });
      }

      if (action.offerId === 'potion_bundle') {
        let counts = addUsableItemCount(state.usableItemCounts, 'small_potion', 3);
        counts = addUsableItemCount(counts, 'grand_potion', 1);
        counts = addUsableItemCount(counts, 'gold_cache', 2);
        const nextState = {
          ...state,
          gold: state.gold - cost,
          usableItemCounts: counts,
        };
        return queueReward(nextState, {
          id: `shop_gold_potion_${Date.now()}`,
          kind: 'item',
          title: 'Gold Shop Purchase: Field Bundle',
          detail: '-4200 gold, +3 Small Potions, +1 Grand Potion, +2 Gold Cache',
        });
      }

      if (!state.playerClass) return state;
      const classItems = EQUIPMENT_CATALOG.filter(item => item.allowedClasses.includes(state.playerClass as PlayerClass));
      if (classItems.length === 0) return state;
      const rolledRarity = rollEquipmentRarityByTier(Math.random(), hasUnlock(state, 'mythic_equipment'));
      const rarityPool = classItems.filter(item => item.rarity === rolledRarity);
      const source = rarityPool.length > 0 ? rarityPool : classItems;
      const item = createEquipmentInstance(source[Math.floor(Math.random() * source.length)], Math.max(1, state.level), 'crate');
      if (!item) return state;

      return queueReward({
        ...state,
        gold: state.gold - cost,
        equipmentInventory: {
          ...state.equipmentInventory,
          [item.id]: item,
        },
        inventoryItemIds: [...state.inventoryItemIds, item.id],
      }, {
        id: `shop_gold_gear_${Date.now()}`,
        kind: 'item',
        title: `Gold Shop Purchase: ${item.emoji} ${item.name}`,
        detail: `${equipmentRarityConfig(item.rarity).label} gear • iLv ${item.itemLevel} • -12000 gold`,
      });
    }

    case 'BUY_DIAMOND_SHOP_ITEM': {
      const cost = DIAMOND_SHOP_COSTS[action.offerId];
      if (state.diamonds < cost) return state;

      let counts = state.usableItemCounts;
      let detail = '';
      if (action.offerId === 'coolant_i_pack') {
        counts = addUsableItemCount(counts, 'coolant_mk1', 4);
        detail = '-24 diamonds, +4 Coolant Capsule I';
      } else if (action.offerId === 'coolant_ii_pack') {
        counts = addUsableItemCount(counts, 'coolant_mk2', 3);
        detail = '-58 diamonds, +3 Coolant Capsule II';
      } else {
        counts = addUsableItemCount(counts, 'coolant_mk1', 5);
        counts = addUsableItemCount(counts, 'coolant_mk2', 3);
        counts = addUsableItemCount(counts, 'grand_potion', 2);
        detail = '-120 diamonds, +5 Coolant I, +3 Coolant II, +2 Grand Potions';
      }

      return queueReward({
        ...state,
        diamonds: state.diamonds - cost,
        usableItemCounts: counts,
      }, {
        id: `shop_diamond_${action.offerId}_${Date.now()}`,
        kind: 'system',
        title: 'Diamond Shop Purchase Complete',
        detail,
      });
    }

    case 'SIMULATE_DOLLAR_PURCHASE': {
      if (!ENABLE_SIMULATED_DOLLAR_PURCHASES) return state;
      const pack = DOLLAR_SHOP_PACKS[action.offerId];
      if (!pack) return state;
      const firstPurchaseActive = !state.dollarFirstPurchaseClaimedOfferIds.includes(action.offerId);

      const pointsGain = Math.max(1, Math.round(pack.usdCents / 10));
      const nextPoints = state.vipPoints + pointsGain;
      const nextLevel = getVipLevelFromPoints(nextPoints);
      const leveledUp = nextLevel > state.vipLevel;
      const priceLabel = `$${(pack.usdCents / 100).toFixed(2)}`;
      const bonusDiamonds = firstPurchaseActive ? pack.diamonds : 0;

      const purchasedState = queueReward({
        ...state,
        diamonds: state.diamonds + pack.diamonds + bonusDiamonds,
        vipPoints: nextPoints,
        vipLevel: nextLevel,
        dollarFirstPurchaseClaimedOfferIds: firstPurchaseActive
          ? [...state.dollarFirstPurchaseClaimedOfferIds, action.offerId]
          : state.dollarFirstPurchaseClaimedOfferIds,
      }, {
        id: `shop_cash_${action.offerId}_${Date.now()}`,
        kind: 'system',
        title: 'Dollar Shop Purchase (Simulated)',
        detail: `${priceLabel} pack: +${pack.diamonds + bonusDiamonds} diamonds${firstPurchaseActive ? ' (first purchase x2 bonus)' : ''}, +${pointsGain} VIP points`,
      });

      const withFirstBonus = firstPurchaseActive
        ? queueReward(purchasedState, {
          id: `shop_cash_first_bonus_${action.offerId}_${Date.now()}`,
          kind: 'system',
          title: 'First Purchase Bonus',
          detail: `+${bonusDiamonds} bonus diamonds (one-time for this pack)`,
        })
        : purchasedState;

      if (!leveledUp) return withFirstBonus;
      return queueReward(withFirstBonus, {
        id: `vip_level_${nextLevel}_${Date.now()}`,
        kind: 'system',
        title: `VIP Level Up: ${nextLevel}`,
        detail: `Bonuses now: +${Math.round((getVipDamageMultiplier({ ...state, vipLevel: nextLevel }) - 1) * 100)}% DPS, +${Math.round((getVipGoldMultiplier({ ...state, vipLevel: nextLevel }) - 1) * 100)}% gold, +${Math.round((getVipExpMultiplier({ ...state, vipLevel: nextLevel }) - 1) * 100)}% EXP`,
      });
    }

    case 'CLAIM_VIP_REWARD': {
      if (action.level < 1 || action.level > 10) return state;
      if (state.vipLevel < action.level) return state;
      if (state.vipRewardClaimedLevels.includes(action.level)) return state;

      const reward = VIP_MILESTONE_REWARDS[action.level];
      if (!reward) return state;

      return queueReward({
        ...state,
        vipRewardClaimedLevels: [...state.vipRewardClaimedLevels, action.level],
        diamonds: state.diamonds + reward.diamonds,
        gold: state.gold + reward.gold,
        totalGold: state.totalGold + reward.gold,
        heroShards: state.heroShards + reward.shards,
        essence: state.essence + reward.essence,
      }, {
        id: `vip_reward_${action.level}_${Date.now()}`,
        kind: 'system',
        title: `VIP ${action.level} Reward Claimed`,
        detail: `+${reward.diamonds} diamonds, +${reward.gold} gold, +${reward.shards} shards, +${reward.essence} essence`,
      });
    }

    case 'BUY_PREMIUM_COOLANT': {
      const unitCost = PREMIUM_COOLANT_COSTS[action.itemId];
      const amount = clampInt(action.amount, 1, 99, 1);
      const cost = unitCost * amount;
      if (state.diamonds < cost) return state;
      const item = getUsableItem(action.itemId);
      if (!item) return state;
      return queueReward({
        ...state,
        diamonds: state.diamonds - cost,
        usableItemCounts: addUsableItemCount(state.usableItemCounts, action.itemId, amount),
      }, {
        id: `buy_${action.itemId}_${Date.now()}`,
        kind: 'system',
        title: `Purchased ${item.emoji} ${item.name}`,
        detail: `-${cost} diamonds • +${amount}`,
      });
    }

    case 'LOAD': {
      const p = sanitizeSaveData(action.payload);
      return maybeAutoRefreshExpeditionContracts({
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

        party: p.party,
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
        summonHistory: p.summonHistory,
        teamLoadouts: p.teamLoadouts,
        teamSlotsUnlocked: p.teamSlotsUnlocked,
        heroFormationByUid: p.heroFormationByUid,
        lastDiceRollDay: p.lastDiceRollDay,
        lastRiftRunDay: p.lastRiftRunDay,
        lastDiceRollValue: p.lastDiceRollValue,
        lastRiftWavesCleared: p.lastRiftWavesCleared,
        guildhallFacilities: p.guildhallFacilities ?? DEFAULT_STATE.guildhallFacilities,
        expeditionQueue: p.expeditionQueue ?? DEFAULT_STATE.expeditionQueue,
        lastExpeditionDay: p.lastExpeditionDay ?? DEFAULT_STATE.lastExpeditionDay,
        expeditionContractOffers: p.expeditionContractOffers ?? DEFAULT_STATE.expeditionContractOffers,
        expeditionContractsRefreshedAt: p.expeditionContractsRefreshedAt ?? DEFAULT_STATE.expeditionContractsRefreshedAt,
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
      }, Date.now());
    }

    default:
      return state;
  }
}

interface SaveData {
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

  party: Record<string, number>;
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
  summonHistory: SummonHistoryEntry[];
  teamLoadouts: string[][];
  teamSlotsUnlocked?: number;
  heroFormationByUid: Record<string, HeroFormationRole>;
  lastDiceRollDay?: number | null;
  lastRiftRunDay?: number | null;
  lastDiceRollValue?: number | null;
  lastRiftWavesCleared?: number;

  guildhallFacilities?: Record<'training' | 'treasury' | 'forge' | 'tactics', { level: number }>;
  expeditionQueue?: Array<any>;
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
}

function serialize(state: GameState): SaveData {
  return {
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

    party: state.party,
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
    summonHistory: state.summonHistory,
    teamLoadouts: state.teamLoadouts,
    teamSlotsUnlocked: state.teamSlotsUnlocked,
    heroFormationByUid: state.heroFormationByUid,
    lastDiceRollDay: state.lastDiceRollDay,
    lastRiftRunDay: state.lastRiftRunDay,
    lastDiceRollValue: state.lastDiceRollValue,
    lastRiftWavesCleared: state.lastRiftWavesCleared,
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
  };
}

export function useGameState(saveSlot: string = 'default') {
  const saveKey = getSaveStorageKey(saveSlot);
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const lastTickRef = useRef(Date.now());
  const lastSaveRef = useRef(Date.now());
  const stateRef = useRef(state);
  const claimFingerprintRef = useRef('');
  const sessionStartedRef = useRef(false);
  const sessionStartedAtRef = useRef(0);
  const prevSummonsRef = useRef(0);
  const prevHighestWaveRef = useRef(1);
  const prevPrestigeRef = useRef(0);
  stateRef.current = state;

  useEffect(() => {
    setHydrated(false);
    dispatch({ type: 'LOAD', payload: {} });
    sessionStartedRef.current = false;
    sessionStartedAtRef.current = 0;
    prevSummonsRef.current = 0;
    prevHighestWaveRef.current = 1;
    prevPrestigeRef.current = 0;
    claimFingerprintRef.current = '';
    lastTickRef.current = Date.now();
    lastSaveRef.current = Date.now();

    AsyncStorage.getItem(saveKey)
      .then(raw => {
        if (!raw) return;
        try {
          const data: SaveData = JSON.parse(raw);
          dispatch({ type: 'LOAD', payload: data });
          const elapsed = Date.now() - (data.lastActiveAt ?? Date.now());
          dispatch({ type: 'APPLY_OFFLINE_PROGRESS', elapsedMs: elapsed });
          dispatch({ type: 'APPLY_DAILY_LOGIN', nowMs: Date.now() });
          dispatch({ type: 'APPLY_WEEKLY_ROLLOVER', nowMs: Date.now() });
        } catch {
          // Ignore corrupted save and continue fresh.
        }
      })
      .finally(() => setHydrated(true));
  }, [saveKey]);

  useEffect(() => {
    if (!state.characterCreated) return;
    const today = toDayNumber(Date.now());
    if (state.lastDailyLoginDay !== today) {
      dispatch({ type: 'APPLY_DAILY_LOGIN', nowMs: Date.now() });
    }
  }, [state.characterCreated, state.lastDailyLoginDay]);

  useEffect(() => {
    if (!state.characterCreated) return;
    const week = weekNumberForTimestamp(Date.now());
    if (state.weeklyEventWeek !== week) {
      dispatch({ type: 'APPLY_WEEKLY_ROLLOVER', nowMs: Date.now() });
    }
  }, [state.characterCreated, state.weeklyEventWeek]);

  useEffect(() => {
    if (!hydrated || !state.characterCreated) return;
    const fingerprint = `${state.weeklyTrackClaimed.join(',')}|${state.claimedMissionIds.join(',')}|${state.vipRewardClaimedLevels.join(',')}|${state.dollarFirstPurchaseClaimedOfferIds.join(',')}`;
    if (fingerprint === claimFingerprintRef.current) return;
    claimFingerprintRef.current = fingerprint;
    lastSaveRef.current = Date.now();
    void AsyncStorage.setItem(saveKey, JSON.stringify(serialize(stateRef.current)));
  }, [
    hydrated,
    state.characterCreated,
    state.weeklyTrackClaimed,
    state.claimedMissionIds,
    state.vipRewardClaimedLevels,
    state.dollarFirstPurchaseClaimedOfferIds,
    saveKey,
  ]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;
      dispatch({ type: 'TICK', elapsed });

      if (stateRef.current.characterCreated && now - lastSaveRef.current >= SAVE_INTERVAL_MS) {
        lastSaveRef.current = now;
        AsyncStorage.setItem(saveKey, JSON.stringify(serialize(stateRef.current)));
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [saveKey]);

  useEffect(() => {
    if (!state.characterCreated || sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    sessionStartedAtRef.current = Date.now();
    prevSummonsRef.current = state.totalSummons;
    prevHighestWaveRef.current = state.highestWaveReached;
    prevPrestigeRef.current = state.prestigeCount;
    void trackEvent('session_start', {
      saveSlot,
      level: state.level,
      wave: state.wave,
      highestWave: state.highestWaveReached,
    });
  }, [state.characterCreated, state.level, state.wave, state.highestWaveReached, state.prestigeCount, state.totalSummons, saveSlot]);

  useEffect(() => {
    return () => {
      if (!sessionStartedRef.current) return;
      const durationSec = Math.max(1, Math.floor((Date.now() - sessionStartedAtRef.current) / 1000));
      void trackEvent('session_end', {
        saveSlot,
        durationSec,
        level: stateRef.current.level,
        wave: stateRef.current.wave,
        highestWave: stateRef.current.highestWaveReached,
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

  const createCharacter = useCallback((name: string, playerClass: PlayerClass) => {
    dispatch({ type: 'CREATE_CHARACTER', name, playerClass });
  }, []);

  const attack = useCallback(() => dispatch({ type: 'ATTACK' }), []);
  const buyParty = useCallback((id: PartyId, amount: number) => {
    dispatch({ type: 'BUY_PARTY', id, amount });
  }, []);
  const buySkill = useCallback((id: string) => dispatch({ type: 'BUY_SKILL', id }), []);
  const allocateStat = useCallback((stat: StatKey) => dispatch({ type: 'ALLOCATE_STAT', stat }), []);
  const allocateStatMax = useCallback((stat: StatKey) => dispatch({ type: 'ALLOCATE_STAT_MAX', stat }), []);
  const allocateStatN = useCallback((stat: StatKey, amount: number) => dispatch({ type: 'ALLOCATE_STAT_N', stat, amount }), []);
  const burst = useCallback((hits: number) => dispatch({ type: 'BURST', hits }), []);
  const equipItem = useCallback((itemId: string) => dispatch({ type: 'EQUIP_ITEM', itemId }), []);
  const summonHero = useCallback(() => dispatch({ type: 'SUMMON_HERO' }), []);
  const summonHeroX10 = useCallback(() => dispatch({ type: 'SUMMON_HERO_X10' }), []);
  const summonHeroX10Cinematic = useCallback(() => dispatch({ type: 'SUMMON_HERO_X10_CINEMATIC' }), []);
  const autoEquipBestHeroes = useCallback(() => dispatch({ type: 'AUTO_EQUIP_BEST_HEROES' }), []);
  const saveTeamLoadout = useCallback((slot: number) => dispatch({ type: 'SAVE_TEAM_LOADOUT', slot }), []);
  const loadTeamLoadout = useCallback((slot: number) => dispatch({ type: 'LOAD_TEAM_LOADOUT', slot }), []);
  const unlockTeamSlot = useCallback(() => dispatch({ type: 'UNLOCK_TEAM_SLOT' }), []);
  const toggleEquipHero = useCallback((uid: string) => dispatch({ type: 'TOGGLE_EQUIP_HERO', uid }), []);
  const setActiveTeam = useCallback((heroIds: string[]) => dispatch({ type: 'SET_ACTIVE_TEAM', heroIds }), []);
  const setHeroFormation = useCallback((uid: string, role: HeroFormationRole) => {
    dispatch({ type: 'SET_HERO_FORMATION', uid, role });
  }, []);
  const playDiceRoll = useCallback((forcedRoll?: number) => dispatch({ type: 'PLAY_DICE_ROLL', forcedRoll }), []);
  const runRiftDungeon = useCallback((payload?: { waves: number; diamonds: number; shards: number; essence: number }) => {
    if (!payload) {
      dispatch({ type: 'RUN_RIFT_DUNGEON' });
      return;
    }
    dispatch({
      type: 'RUN_RIFT_DUNGEON',
      forcedWaves: payload.waves,
      forcedDiamonds: payload.diamonds,
      forcedShards: payload.shards,
      forcedEssence: payload.essence,
    });
  }, []);
  const recycleHero = useCallback((uid: string) => dispatch({ type: 'RECYCLE_HERO', uid }), []);
  const autoRecycleHeroes = useCallback(() => dispatch({ type: 'AUTO_RECYCLE_HEROES' }), []);
  const setAutoRecycleMaxRarity = useCallback((rarity: Rarity) => {
    dispatch({ type: 'SET_AUTO_RECYCLE_MAX_RARITY', rarity });
  }, []);
  const setAutoRecycleEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_AUTO_RECYCLE_ENABLED', enabled });
  }, []);
  const rankUpHero = useCallback((uid: string) => dispatch({ type: 'RANK_UP_HERO', uid }), []);
  const levelUpHeroGold = useCallback((uid: string) => dispatch({ type: 'LEVEL_UP_HERO_GOLD', uid }), []);
  const convertShardsToEssence = useCallback(() => dispatch({ type: 'CONVERT_SHARDS_TO_ESSENCE' }), []);
  const convertShardsToScrap = useCallback(() => dispatch({ type: 'CONVERT_SHARDS_TO_SCRAP' }), []);
  const spendRebirthCore = useCallback((path: 'damage' | 'economy' | 'survival') => {
    dispatch({ type: 'SPEND_REBIRTH_CORE', path });
  }, []);
  const useUsableItem = useCallback((itemId: string, amount: number | 'all' = 1) => dispatch({ type: 'USE_USABLE_ITEM', itemId, amount }), []);
  const dismantleEquipment = useCallback((itemId: string) => dispatch({ type: 'DISMANTLE_EQUIPMENT', itemId }), []);
  const craftEquipment = useCallback((slot: EquipmentSlot) => dispatch({ type: 'CRAFT_EQUIPMENT', slot }), []);
  const upgradeEquipmentRarity = useCallback((itemId: string) => dispatch({ type: 'UPGRADE_EQUIPMENT_RARITY', itemId }), []);
  const setAutoUsePotion = useCallback((enabled: boolean) => dispatch({ type: 'SET_AUTO_USE_POTION', enabled }), []);
  const setAutoUseCoolant = useCallback((enabled: boolean) => dispatch({ type: 'SET_AUTO_USE_COOLANT', enabled }), []);
  const setAutoUsePotionThreshold = useCallback((thresholdPct: number) => dispatch({ type: 'SET_AUTO_USE_POTION_THRESHOLD', thresholdPct }), []);
  const setAutoSummonEnabled = useCallback((enabled: boolean) => dispatch({ type: 'SET_AUTO_SUMMON_ENABLED', enabled }), []);
  const setAutoSummonMode = useCallback((mode: 'single' | 'x10') => dispatch({ type: 'SET_AUTO_SUMMON_MODE', mode }), []);
  const setAutoBurstEnabled = useCallback((enabled: boolean) => dispatch({ type: 'SET_AUTO_BURST_ENABLED', enabled }), []);
  const setCombatTempo = useCallback((tempo: CombatTempo) => dispatch({ type: 'SET_COMBAT_TEMPO', tempo }), []);
  const rebirthHero = useCallback((uid: string) => dispatch({ type: 'REBIRTH_HERO', uid }), []);
  const setAutoTempoEnabled = useCallback((enabled: boolean) => dispatch({ type: 'SET_AUTO_TEMPO_ENABLED', enabled }), []);
  const setAutoTempoTarget = useCallback((target: AutoTempoTarget) => dispatch({ type: 'SET_AUTO_TEMPO_TARGET', target }), []);
  const setAutoSummonReserveGold = useCallback((reserveGold: number) => {
    dispatch({ type: 'SET_AUTO_SUMMON_RESERVE_GOLD', reserveGold });
  }, []);
  const buyGoldShopItem = useCallback((offerId: GoldShopOfferId) => dispatch({ type: 'BUY_GOLD_SHOP_ITEM', offerId }), []);
  const buyDiamondShopItem = useCallback((offerId: DiamondShopOfferId) => dispatch({ type: 'BUY_DIAMOND_SHOP_ITEM', offerId }), []);
  const simulateDollarPurchase = useCallback((offerId: DollarShopOfferId) => dispatch({ type: 'SIMULATE_DOLLAR_PURCHASE', offerId }), []);
  const claimVipReward = useCallback((level: number) => dispatch({ type: 'CLAIM_VIP_REWARD', level }), []);
  const buyPremiumCoolant = useCallback((itemId: 'coolant_mk1' | 'coolant_mk2', amount: number = 1) => {
    dispatch({ type: 'BUY_PREMIUM_COOLANT', itemId, amount });
  }, []);
  const autoDismantleEquipment = useCallback(() => dispatch({ type: 'AUTO_DISMANTLE_EQUIPMENT' }), []);
  const spendEssenceUpgrade = useCallback((path: 'damage' | 'economy' | 'survival') => {
    dispatch({ type: 'SPEND_ESSENCE_UPGRADE', path });
  }, []);
  const claimWeeklyTrack = useCallback((milestone: number) => {
    dispatch({ type: 'CLAIM_WEEKLY_TRACK', milestone });
  }, []);
  const claimMission = useCallback((missionId: string) => {
    dispatch({ type: 'CLAIM_MISSION', missionId });
  }, []);
  const markHintSeen = useCallback((hintId: string) => {
    dispatch({ type: 'MARK_HINT_SEEN', hintId });
  }, []);
  const rebirth = useCallback(() => dispatch({ type: 'REBIRTH' }), []);
  const clearAchievement = useCallback(() => dispatch({ type: 'CLEAR_ACHIEVEMENT' }), []);
  const clearRewardPopup = useCallback(() => dispatch({ type: 'CLEAR_REWARD_POPUP' }), []);

  const getPartyCost = useCallback((id: PartyId, amount: number) => {
    const cfg = PARTY.find(p => p.id === id)!;
    const owned = state.party[id] ?? 0;
    return amount === 1
      ? buildingCost(cfg.baseCost, owned, COST_SCALE)
      : bulkCost(cfg.baseCost, owned, amount, COST_SCALE);
  }, [state.party]);

  const getEssenceCost = useCallback((path: 'damage' | 'economy' | 'survival') => {
    const currentLevel = path === 'damage'
      ? state.metaDamageLevel
      : path === 'economy'
        ? state.metaEconomyLevel
        : state.metaSurvivalLevel;
    return getEssenceUpgradeCost(currentLevel);
  }, [state.metaDamageLevel, state.metaEconomyLevel, state.metaSurvivalLevel]);

  const getRebirthCoreCost = useCallback((path: 'damage' | 'economy' | 'survival') => {
    const level = path === 'damage'
      ? state.rebirthDamagePath
      : path === 'economy'
        ? state.rebirthEconomyPath
        : state.rebirthSurvivalPath;
    return getRebirthPathCost(level);
  }, [state.rebirthDamagePath, state.rebirthEconomyPath, state.rebirthSurvivalPath]);

  const getShardForgeCosts = useCallback(() => ({
    essenceCost: getShardToEssenceCost(state),
    scrapCost: getShardToScrapCost(),
  }), [state]);

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
      canUnlock: state.highestWaveReached >= req.requiredWave && state.gold >= req.goldCost && state.heroShards >= req.shardCost,
    };
  }, [state]);

  const getUpgradePlan = useCallback((itemId: string) => getEquipmentUpgradePlan(state, itemId), [state]);

  const getWeeklyEvent = useCallback(() => getCurrentWeeklyEvent(state), [state]);
  const getMissionProgress = useCallback((mission: MissionBoardGoal) => {
    const value = getMissionProgressValue(state, mission);
    return {
      value,
      done: value >= mission.target,
    };
  }, [state]);

  const batchLevelHeroes = useCallback((heroIds: string[], addLevels: number | 'max') => {
    dispatch({ type: 'BATCH_LEVEL_HEROES', heroIds, addLevels });
  }, []);

  const upgradeFacility = useCallback((facilityId: 'training' | 'treasury' | 'forge' | 'tactics') => {
    dispatch({ type: 'UPGRADE_FACILITY', facilityId });
  }, []);

  const startExpedition = useCallback((
    expeditionType: 'artifact' | 'merchant' | 'ruins' | 'vault' | 'abyss',
    offeredRarity?: 'common' | 'rare' | 'epic' | 'legendary' | 'godly',
  ) => {
    dispatch({ type: 'START_EXPEDITION', expeditionType, offeredRarity });
  }, []);

  const refreshExpeditionContracts = useCallback(() => {
    dispatch({ type: 'REFRESH_EXPEDITION_CONTRACTS' });
  }, []);

  const completeExpedition = useCallback((expeditionId: string) => {
    dispatch({ type: 'COMPLETE_EXPEDITION', expeditionId });
  }, []);

  const stats = computeStats(state);

  return {
    hydrated,
    state,
    stats,
    createCharacter,
    attack,
    buyParty,
    buySkill,
    allocateStat,
    allocateStatMax,
    allocateStatN,
    burst,
    equipItem,
    summonHero,
    summonHeroX10,
    summonHeroX10Cinematic,
    autoEquipBestHeroes,
    saveTeamLoadout,
    loadTeamLoadout,
    unlockTeamSlot,
    toggleEquipHero,
    setActiveTeam,
    setHeroFormation,
    playDiceRoll,
    runRiftDungeon,
    batchLevelHeroes,
    upgradeFacility,
    startExpedition,
    refreshExpeditionContracts,
    completeExpedition,
    recycleHero,
    autoRecycleHeroes,
    setAutoRecycleMaxRarity,
    setAutoRecycleEnabled,
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
    spendEssenceUpgrade,
    claimWeeklyTrack,
    claimMission,
    markHintSeen,
    rebirth,
    clearAchievement,
    clearRewardPopup,
    getPartyCost,
    getEssenceCost,
    getRebirthCoreCost,
    getShardForgeCosts,
    getNextTeamSlotUnlock,
    getUpgradePlan,
    getWeeklyEvent,
    getMissionProgress,
  };
}

