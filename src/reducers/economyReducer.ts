/**
 * economyReducer — handles purchases, equipment crafting/dismantling/upgrading,
 * consumable usage, mail claims, expeditions, shops, facilities, and forging.
 *
 * Extracted from the monolithic reducer in useGameState.ts.
 */

import type { GameState, RewardPopup, EquipmentInstance, MailAttachments } from '../useGameState';
import {
  PARTY,
  SKILLS,
  COST_SCALE,
  type PartyId,
  type PlayerClass,
  type StatBlock,
  type EquipmentSlot,
  type EquipmentItem,
  type Rarity,
  type PermanentUnlockId,
  equipmentRarityConfig,
  EQUIPMENT_CATALOG,
  rollEquipmentRarityByTier,
  getUsableItem,
  getMonsterGold,
  getMonsterExp,
  expForLevel,
  calculateShardReward,
  getWeeklyEventByWeek,
  getEquipmentItem,
} from '../gameConfig';
import { buildingCost, bulkCost } from '../utils';

// ─── Types ─────────────────────────────────────────────────────

type EquipmentSource = 'starter' | 'drop' | 'craft' | 'crate' | 'upgrade' | 'legacy' | 'hero_unique';
type MailAttachmentKey = keyof MailAttachments;
type GoldShopOfferId = 'exp_cache' | 'potion_bundle' | 'armory_crate';
type DiamondShopOfferId = 'coolant_i_pack' | 'coolant_ii_pack' | 'elite_supply' | 'rift_raid_ticket';
type DollarShopOfferId = 'usd_499' | 'usd_1999' | 'usd_4999' | 'usd_9999';
type ExpeditionType = 'artifact' | 'merchant' | 'ruins' | 'vault' | 'abyss';
type ExpeditionRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'godly';
type FacilityId = 'training' | 'treasury' | 'forge' | 'tactics';

export type EconomyAction =
  | { type: 'BUY_PARTY'; id: PartyId; amount: number }
  | { type: 'BUY_SKILL'; id: string }
  | { type: 'USE_USABLE_ITEM'; itemId: string; amount: number | 'all' }
  | { type: 'DISMANTLE_EQUIPMENT'; itemId: string }
  | { type: 'AUTO_DISMANTLE_EQUIPMENT' }
  | { type: 'CRAFT_EQUIPMENT'; slot: EquipmentSlot }
  | { type: 'UPGRADE_EQUIPMENT_RARITY'; itemId: string }
  | { type: 'CLAIM_MAIL_ATTACHMENT'; mailId: string; attachment: MailAttachmentKey }
  | { type: 'CLAIM_ALL_MAIL_ATTACHMENTS' }
  | { type: 'UPGRADE_FACILITY'; facilityId: FacilityId }
  | { type: 'START_EXPEDITION'; expeditionType: ExpeditionType; offeredRarity?: ExpeditionRarity }
  | { type: 'REFRESH_EXPEDITION_CONTRACTS' }
  | { type: 'COMPLETE_EXPEDITION'; expeditionId: string }
  | { type: 'CONVERT_SCRAP_TO_ESSENCE'; count?: number }
  | { type: 'CONVERT_SCRAP_TO_SHARDS'; count?: number }
  | { type: 'BUY_GOLD_SHOP_ITEM'; offerId: GoldShopOfferId }
  | { type: 'BUY_DIAMOND_SHOP_ITEM'; offerId: DiamondShopOfferId }
  | { type: 'SIMULATE_DOLLAR_PURCHASE'; offerId: DollarShopOfferId }
  | { type: 'BUY_PREMIUM_COOLANT'; itemId: string; amount: number };

export const ECONOMY_ACTION_TYPES = new Set<string>([
  'BUY_PARTY',
  'BUY_SKILL',
  'USE_USABLE_ITEM',
  'DISMANTLE_EQUIPMENT',
  'AUTO_DISMANTLE_EQUIPMENT',
  'CRAFT_EQUIPMENT',
  'UPGRADE_EQUIPMENT_RARITY',
  'CLAIM_MAIL_ATTACHMENT',
  'CLAIM_ALL_MAIL_ATTACHMENTS',
  'UPGRADE_FACILITY',
  'START_EXPEDITION',
  'REFRESH_EXPEDITION_CONTRACTS',
  'COMPLETE_EXPEDITION',
  'CONVERT_SCRAP_TO_ESSENCE',
  'CONVERT_SCRAP_TO_SHARDS',
  'BUY_GOLD_SHOP_ITEM',
  'BUY_DIAMOND_SHOP_ITEM',
  'SIMULATE_DOLLAR_PURCHASE',
  'BUY_PREMIUM_COOLANT',
]);

// ─── Context ───────────────────────────────────────────────────

export interface EconomyContext {
  withAchievement: (state: GameState) => GameState;
  getEquipmentEntry: (state: GameState, itemId: string) => EquipmentInstance | EquipmentItem | null;
  getEquipmentUpgradePlan: (
    state: GameState,
    itemId: string,
  ) => {
    canUpgrade: boolean;
    targetItemId: string | null;
    targetRarity: string | null;
    scrapCost: number;
    essenceCost: number;
    goldCost: number;
  };
  createEquipmentInstance: (
    baseItem: EquipmentItem,
    itemLevel: number,
    source: EquipmentSource,
    statMultiplier?: number,
  ) => EquipmentInstance;
  hasUnlock: (state: GameState, unlock: PermanentUnlockId) => boolean;
  getForgeStatMultiplier: (forgeLevel: number) => number;
  processLevelUp: (exp: number, level: number) => { exp: number; level: number; gainedLevels: number };
  addUsableItemCount: (counts: Record<string, number>, itemId: string, amount: number) => Record<string, number>;
  getVipLevelFromPoints: (points: number) => number;
  getVipDamageMultiplier: (state: GameState) => number;
  getVipGoldMultiplier: (state: GameState) => number;
  getVipExpMultiplier: (state: GameState) => number;
  maybeAutoRefreshExpeditionContracts: (state: GameState, nowMs: number) => GameState;
  rollExpeditionContractOffers: () => Record<string, string>;
  getScrapToEssenceCost: (state: GameState) => number;
  getScrapToShardCost: () => number;
  getMaxHeatForLevel: (level: number) => number;
  clampInt: (value: unknown, min: number, max: number, fallback: number) => number;
}

// ─── Constants ─────────────────────────────────────────────────

const STAT_POINTS_PER_LEVEL = 5;
const ACHIEVEMENT_BONUS_PER_UNLOCK = 0.03;
const FACILITY_MAX_LEVEL = 999;
const EXPEDITION_CONTRACT_REFRESH_GOLD_COST = 100_000;
const ENABLE_SIMULATED_DOLLAR_PURCHASES = false;

const PREMIUM_COOLANT_COSTS: Record<string, number> = {
  coolant_mk1: 8,
  coolant_mk2: 18,
};

const GOLD_SHOP_COSTS: Record<GoldShopOfferId, number> = {
  exp_cache: 2200,
  potion_bundle: 3600,
  armory_crate: 9500,
};

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

const VIP_DAMAGE_PER_LEVEL = 0.03;
const VIP_GOLD_PER_LEVEL = 0.025;
const VIP_EXP_PER_LEVEL = 0.025;

const EXPEDITION_TYPES: ExpeditionType[] = ['artifact', 'merchant', 'ruins', 'vault', 'abyss'];

// ─── Helpers ───────────────────────────────────────────────────

function queueReward(state: GameState, reward: RewardPopup): GameState {
  return { ...state, rewardQueue: [...state.rewardQueue, reward] };
}

function queueCombatLog(state: GameState, line: string): GameState {
  return {
    ...state,
    combatLog: [`${new Date().toLocaleTimeString()} • ${line}`, ...state.combatLog].slice(0, 24),
  };
}

function getCurrentWeeklyEvent(state: GameState): { shardMultiplier: number } {
  return getWeeklyEventByWeek(state.weeklyEventWeek);
}

function getAchievementBonusMultiplier(state: GameState): number {
  return 1 + state.achievements.size * ACHIEVEMENT_BONUS_PER_UNLOCK;
}

function equipmentScrapValue(rarity: string): number {
  return (
    (
      {
        common: 10,
        rare: 24,
        epic: 60,
        legendary: 160,
        mythic: 360,
        transcendent: 760,
      } as Record<string, number>
    )[rarity] ?? 10
  );
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

function getUsableProgressScale(state: GameState): number {
  const levelFactor = 1 + Math.pow(Math.max(1, state.level), 0.32) * 0.35;
  const waveFactor = 1 + Math.log10(Math.max(10, state.highestWaveReached + 9)) * 0.8;
  const prestigeFactor = 1 + state.prestigeCount * 0.12;
  return levelFactor * waveFactor * prestigeFactor;
}

function getScaledUsableGoldGain(
  state: GameState,
  baseValue: number,
  itemType: 'basic' | 'advanced',
  ctx: EconomyContext,
): number {
  const scaledBase = Math.ceil(baseValue * getUsableProgressScale(state) * ctx.getVipGoldMultiplier(state));
  const waveFloor = Math.ceil(
    getMonsterGold(Math.max(1, state.highestWaveReached)) * (itemType === 'advanced' ? 8 : 3),
  );
  if (!Number.isFinite(scaledBase) && !Number.isFinite(waveFloor)) return 1;
  const safeScaledBase = Number.isFinite(scaledBase) ? scaledBase : 0;
  const safeWaveFloor = Number.isFinite(waveFloor) ? waveFloor : 0;
  return Math.max(1, Math.floor(Math.max(safeScaledBase, safeWaveFloor)));
}

function getScaledUsableExpGain(
  state: GameState,
  baseValue: number,
  itemType: 'basic' | 'advanced',
  ctx: EconomyContext,
): number {
  const scaledBase = Math.ceil(
    baseValue * getUsableProgressScale(state) * getAchievementBonusMultiplier(state) * ctx.getVipExpMultiplier(state),
  );
  const waveFloor = Math.ceil(getMonsterExp(Math.max(1, state.highestWaveReached)) * (itemType === 'advanced' ? 6 : 2));
  if (!Number.isFinite(scaledBase) && !Number.isFinite(waveFloor)) return 1;
  const safeScaledBase = Number.isFinite(scaledBase) ? scaledBase : 0;
  const safeWaveFloor = Number.isFinite(waveFloor) ? waveFloor : 0;
  return Math.max(1, Math.floor(Math.max(safeScaledBase, safeWaveFloor)));
}

function getScaledUsableShardGain(state: GameState, baseValue: number, itemType: 'basic' | 'advanced'): number {
  const weekly = getCurrentWeeklyEvent(state);
  const scaledBase = Math.ceil(baseValue * getUsableProgressScale(state) * weekly.shardMultiplier);
  const syntheticHeroLevel = Math.max(1, Math.floor(state.level + Math.sqrt(Math.max(1, state.highestWaveReached))));
  const waveFloor = Math.ceil(calculateShardReward('rare', syntheticHeroLevel) * (itemType === 'advanced' ? 2.5 : 1.2));
  if (!Number.isFinite(scaledBase) && !Number.isFinite(waveFloor)) return 1;
  const safeScaledBase = Number.isFinite(scaledBase) ? scaledBase : 0;
  const safeWaveFloor = Number.isFinite(waveFloor) ? waveFloor : 0;
  return Math.max(1, Math.floor(Math.max(safeScaledBase, safeWaveFloor)));
}

function getScaledUsableHeatReduction(
  state: GameState,
  baseValue: number,
  itemType: 'basic' | 'advanced',
  ctx: EconomyContext,
): number {
  const maxHeat = ctx.getMaxHeatForLevel(state.level);
  const pctFloor = itemType === 'advanced' ? 0.22 : 0.1;
  return Math.max(Math.ceil(baseValue), Math.ceil(maxHeat * pctFloor));
}

function getFacilityUpgradeCostLocal(facilityId: FacilityId, currentLevel: number): number {
  const safeLevel = Math.max(0, Math.floor(currentLevel));
  if (safeLevel >= FACILITY_MAX_LEVEL) return Number.MAX_SAFE_INTEGER;
  const FACILITY_INITIAL_UPGRADE_COSTS: Record<FacilityId, number[]> = {
    training: [5000, 12000, 30000, 75000, 150000, 300000],
    treasury: [4000, 10000, 25000, 60000, 120000, 250000],
    forge: [6000, 15000, 40000, 90000, 180000, 350000],
    tactics: [5000, 12000, 30000, 75000, 150000, 300000],
  };
  const openingCurve = FACILITY_INITIAL_UPGRADE_COSTS[facilityId];
  if (safeLevel < openingCurve.length) return openingCurve[safeLevel];
  let cost = openingCurve[openingCurve.length - 1];
  const growth = 2;
  for (let level = openingCurve.length - 1; level < safeLevel; level++) {
    cost = Math.ceil(cost * growth);
    if (!Number.isFinite(cost) || cost > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  }
  return cost;
}

// ─── Helpers ──────────────────────────────────────────────────

const EQUIPMENT_RARITY_RANK: Record<string, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
  mythic: 4,
  transcendent: 5,
};

// ─── Reducer ───────────────────────────────────────────────────

/**
 * Handle an economy action, returning updated GameState or null if unhandled.
 */
export function economyReducer(state: GameState, action: EconomyAction, ctx: EconomyContext): GameState | null {
  switch (action.type) {
    case 'BUY_PARTY': {
      const cfg = PARTY.find(p => p.id === action.id);
      if (!cfg) return state;
      const owned = state.party[action.id] ?? 0;
      const cost =
        action.amount === 1
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

    case 'USE_USABLE_ITEM': {
      const qty = state.usableItemCounts[action.itemId] ?? 0;
      if (qty <= 0) return state;

      const requestedUses = action.amount === 'all' ? qty : ctx.clampInt(action.amount, 1, qty, 1);
      if (requestedUses <= 0) return state;

      const item = getUsableItem(action.itemId);
      if (!item) return state;

      let nextState: GameState = {
        ...state,
        usableItemCounts: ctx.addUsableItemCount(state.usableItemCounts, action.itemId, -requestedUses),
      };
      const useSuffix = requestedUses > 1 ? ` x${requestedUses}` : '';

      if (item.effect === 'heal_team_percent') {
        const healed = Math.ceil(nextState.teamMaxHp * item.value) * requestedUses;
        nextState = queueReward(
          {
            ...nextState,
            teamHp: Math.min(nextState.teamMaxHp, nextState.teamHp + healed),
          },
          {
            id: `use_${item.id}_${Date.now()}`,
            kind: 'item',
            title: `Used ${item.emoji} ${item.name}${useSuffix}`,
            detail: `Restored ${healed} team HP`,
          },
        );
      }

      if (item.effect === 'gain_gold_flat') {
        const gainPerUse = getScaledUsableGoldGain(nextState, item.value, item.itemType, ctx);
        const rawGain = gainPerUse * requestedUses;
        const gain = Number.isFinite(rawGain) ? Math.max(0, Math.floor(rawGain)) : 0;
        const safeCurrentGold = Number.isFinite(nextState.gold) ? nextState.gold : 0;
        const safeTotalGold = Number.isFinite(nextState.totalGold) ? nextState.totalGold : 0;
        nextState = queueReward(
          {
            ...nextState,
            gold: safeCurrentGold + gain,
            totalGold: safeTotalGold + gain,
          },
          {
            id: `use_${item.id}_${Date.now()}`,
            kind: 'gold',
            title: `Used ${item.emoji} ${item.name}${useSuffix}`,
            detail: `+${gain} gold`,
          },
        );
      }

      if (item.effect === 'gain_exp_flat') {
        const gainPerUse = getScaledUsableExpGain(nextState, item.value, item.itemType, ctx);
        const rawGain = gainPerUse * requestedUses;
        const gain = Number.isFinite(rawGain) ? Math.max(0, Math.floor(rawGain)) : 0;
        const safeCurrentExp = Number.isFinite(nextState.exp) ? nextState.exp : 0;
        const safeTotalExp = Number.isFinite(nextState.totalExp) ? nextState.totalExp : 0;
        const lvl = ctx.processLevelUp(safeCurrentExp + gain, nextState.level);
        nextState = queueReward(
          {
            ...nextState,
            exp: lvl.exp,
            totalExp: safeTotalExp + gain,
            level: lvl.level,
            unspentStatPoints: nextState.unspentStatPoints + lvl.gainedLevels * STAT_POINTS_PER_LEVEL,
          },
          {
            id: `use_${item.id}_${Date.now()}`,
            kind: 'item',
            title: `Used ${item.emoji} ${item.name}${useSuffix}`,
            detail: `+${gain} EXP`,
          },
        );
      }

      if (item.effect === 'gain_shards_flat') {
        const gainPerUse = getScaledUsableShardGain(nextState, item.value, item.itemType);
        const rawGain = gainPerUse * requestedUses;
        const gain = Number.isFinite(rawGain) ? Math.max(0, Math.floor(rawGain)) : 0;
        const safeCurrentShards = Number.isFinite(nextState.heroShards) ? nextState.heroShards : 0;
        nextState = queueReward(
          {
            ...nextState,
            heroShards: safeCurrentShards + gain,
          },
          {
            id: `use_${item.id}_${Date.now()}`,
            kind: 'shard',
            title: `Used ${item.emoji} ${item.name}${useSuffix}`,
            detail: `+${gain} shards`,
          },
        );
      }

      if (item.effect === 'reduce_heat_flat') {
        const reducePerUse = getScaledUsableHeatReduction(nextState, item.value, item.itemType, ctx);
        const reduced = Math.max(0, nextState.combatHeat - reducePerUse * requestedUses);
        nextState = queueReward(
          {
            ...nextState,
            combatHeat: reduced,
          },
          {
            id: `use_${item.id}_${Date.now()}`,
            kind: 'system',
            title: `Used ${item.emoji} ${item.name}${useSuffix}`,
            detail: `Heat ${Math.ceil(nextState.combatHeat)} -> ${Math.ceil(reduced)} (${Math.ceil(reducePerUse)} each)`,
          },
        );
      }

      if (item.effect === 'gain_vip_points_flat') {
        const gainPerUse = Math.max(
          Math.ceil(item.value * (1 + nextState.prestigeCount * 0.08)),
          Math.ceil(Math.log10(Math.max(10, nextState.highestWaveReached + 9)) * 4),
        );
        const gain = gainPerUse * requestedUses;
        const nextPoints = nextState.vipPoints + gain;
        const nextLevel = ctx.getVipLevelFromPoints(nextPoints);
        const leveledUp = nextLevel > nextState.vipLevel;

        nextState = queueReward(
          {
            ...nextState,
            vipPoints: nextPoints,
            vipLevel: nextLevel,
          },
          {
            id: `use_${item.id}_${Date.now()}`,
            kind: 'system',
            title: `Used ${item.emoji} ${item.name}${useSuffix}`,
            detail: `+${gain} VIP points`,
          },
        );

        if (leveledUp) {
          nextState = queueReward(nextState, {
            id: `vip_item_level_${nextLevel}_${Date.now()}`,
            kind: 'system',
            title: `VIP Level Up: ${nextLevel}`,
            detail: `Bonuses now: +${Math.round((ctx.getVipDamageMultiplier({ ...nextState, vipLevel: nextLevel }) - 1) * 100)}% DPS, +${Math.round((ctx.getVipGoldMultiplier({ ...nextState, vipLevel: nextLevel }) - 1) * 100)}% gold, +${Math.round((ctx.getVipExpMultiplier({ ...nextState, vipLevel: nextLevel }) - 1) * 100)}% EXP`,
          });
        }
      }

      return ctx.withAchievement(nextState);
    }

    case 'DISMANTLE_EQUIPMENT': {
      if (!state.inventoryItemIds.includes(action.itemId)) return state;
      if (Object.values(state.equippedItems).includes(action.itemId)) return state;
      const item = ctx.getEquipmentEntry(state, action.itemId);
      if (!item) return state;
      if ('source' in item && item.source === 'hero_unique') return state;
      const gain = getEquipmentScrapGain(item);
      const nextEquipmentInventory = { ...state.equipmentInventory };
      delete nextEquipmentInventory[action.itemId];
      return queueReward(
        {
          ...state,
          inventoryItemIds: state.inventoryItemIds.filter(id => id !== action.itemId),
          equipmentInventory: nextEquipmentInventory,
          equipmentScrap: state.equipmentScrap + gain,
        },
        {
          id: `dismantle_${action.itemId}_${Date.now()}`,
          kind: 'item',
          title: `Dismantled ${item.emoji} ${item.name}`,
          detail: `+${gain} scrap`,
        },
      );
    }

    case 'AUTO_DISMANTLE_EQUIPMENT': {
      const equippedIds = new Set(Object.values(state.equippedItems).filter((id): id is string => !!id));
      const floorRank = EQUIPMENT_RARITY_RANK[state.autoDismantleRarityFloor ?? 'common'] ?? 0;
      const candidates = state.inventoryItemIds
        .filter(itemId => !equippedIds.has(itemId))
        .map(itemId => ({ itemId, item: ctx.getEquipmentEntry(state, itemId) }))
        .filter(
          (entry): entry is { itemId: string; item: EquipmentInstance | EquipmentItem } =>
            !!entry.item &&
            (!('source' in entry.item) || entry.item.source !== 'hero_unique') &&
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
          id: `auto_dismantle_${Date.now()}`,
          kind: 'item',
          title: 'Auto Dismantle Complete',
          detail: `+${gain} scrap from ${candidates.length} unequipped items`,
        },
      );
    }

    case 'CRAFT_EQUIPMENT': {
      if (!state.playerClass) return state;
      const cost = getEquipmentCraftCost(action.slot);
      if (state.equipmentScrap < cost.scrap || state.gold < cost.gold) return state;

      const classSlotItems = EQUIPMENT_CATALOG.filter(
        item => item.allowedClasses.includes(state.playerClass as PlayerClass) && item.slot === action.slot,
      );
      if (classSlotItems.length === 0) return state;

      const rolledRarity = rollEquipmentRarityByTier(Math.random(), ctx.hasUnlock(state, 'mythic_equipment'));
      const rarityPool = classSlotItems.filter(i => i.rarity === rolledRarity);
      const source = rarityPool.length > 0 ? rarityPool : classSlotItems;
      const forgeMult = ctx.getForgeStatMultiplier(state.guildhallFacilities.forge.level);
      const item = ctx.createEquipmentInstance(
        source[Math.floor(Math.random() * source.length)],
        Math.max(1, state.level),
        'craft',
        forgeMult,
      );

      return queueReward(
        {
          ...state,
          equipmentScrap: state.equipmentScrap - cost.scrap,
          gold: state.gold - cost.gold,
          equipmentInventory: {
            ...state.equipmentInventory,
            [item.id]: item,
          },
          inventoryItemIds: [...state.inventoryItemIds, item.id],
        },
        {
          id: `craft_${item.id}_${Date.now()}`,
          kind: 'item',
          title: `Crafted ${item.emoji} ${item.name}`,
          detail: `${equipmentRarityConfig(item.rarity).label} ${item.slot} • iLv ${item.itemLevel} • -${cost.gold} gold`,
        },
      );
    }

    case 'UPGRADE_EQUIPMENT_RARITY': {
      if (!state.inventoryItemIds.includes(action.itemId)) return state;
      const ownedItem = ctx.getEquipmentEntry(state, action.itemId);
      const item = ownedItem && 'baseItemId' in ownedItem ? getEquipmentItem(ownedItem.baseItemId) : ownedItem;
      if (!item || !ownedItem) return state;
      const plan = ctx.getEquipmentUpgradePlan(state, action.itemId);
      if (!plan.targetItemId || !plan.targetRarity) return state;
      if (state.equipmentScrap < plan.scrapCost || state.essence < plan.essenceCost || state.gold < plan.goldCost)
        return state;
      const target = getEquipmentItem(plan.targetItemId);
      if (!target) return state;

      const upgradedItem = ctx.createEquipmentInstance(
        target,
        'itemLevel' in ownedItem ? ownedItem.itemLevel + 2 : Math.max(1, state.level),
        'upgrade',
      );
      const withReplacedInventory = state.inventoryItemIds.filter(id => id !== action.itemId);
      const nextInventory = [...withReplacedInventory, upgradedItem.id];
      const nextEquipmentInventory = { ...state.equipmentInventory };
      delete nextEquipmentInventory[action.itemId];
      nextEquipmentInventory[upgradedItem.id] = upgradedItem;

      return queueReward(
        {
          ...state,
          inventoryItemIds: nextInventory,
          equipmentInventory: nextEquipmentInventory,
          equipmentScrap: state.equipmentScrap - plan.scrapCost,
          essence: state.essence - plan.essenceCost,
          gold: state.gold - plan.goldCost,
          equippedItems: Object.fromEntries(
            Object.entries(state.equippedItems).map(([slot, equippedId]) => [
              slot,
              equippedId === action.itemId ? upgradedItem.id : equippedId,
            ]),
          ) as Record<EquipmentSlot, string | null>,
        },
        {
          id: `upgrade_${action.itemId}_${Date.now()}`,
          kind: 'item',
          title: `Upgraded ${item.name}`,
          detail: `Now ${target.emoji} ${target.name} (${plan.targetRarity.toUpperCase()}) • iLv ${upgradedItem.itemLevel} • -${plan.goldCost} gold`,
        },
      );
    }

    case 'CLAIM_MAIL_ATTACHMENT': {
      return claimMailAttachments(state, action.mailId, [action.attachment]);
    }

    case 'CLAIM_ALL_MAIL_ATTACHMENTS': {
      return claimAllMailAttachments(state);
    }

    case 'UPGRADE_FACILITY': {
      const facility = state.guildhallFacilities[action.facilityId];
      const currentLevel = facility.level;
      const cost = getFacilityUpgradeCostLocal(action.facilityId, currentLevel);
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
      const refreshedState = ctx.maybeAutoRefreshExpeditionContracts(state, Date.now());

      const rarityPool = ['common', 'rare', 'epic', 'legendary', 'godly'] as const;
      const rarity =
        action.offeredRarity && rarityPool.includes(action.offeredRarity)
          ? action.offeredRarity
          : (refreshedState.expeditionContractOffers[action.expeditionType] ??
            rarityPool[Math.floor(Math.random() * rarityPool.length)]);

      const configByRarity: Record<
        (typeof rarityPool)[number],
        {
          goldCost: number;
          durationMs: number;
          reward: { diamonds: number; shards: number; essence: number; artifacts: number };
        }
      > = {
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
      const refreshedState = ctx.maybeAutoRefreshExpeditionContracts(state, Date.now());
      if (refreshedState.gold < EXPEDITION_CONTRACT_REFRESH_GOLD_COST) return refreshedState;

      return {
        ...refreshedState,
        gold: refreshedState.gold - EXPEDITION_CONTRACT_REFRESH_GOLD_COST,
        expeditionContractOffers: ctx.rollExpeditionContractOffers() as any,
        expeditionContractsRefreshedAt: Date.now(),
      };
    }

    case 'COMPLETE_EXPEDITION': {
      const expIndex = state.expeditionQueue.findIndex(e => e.id === action.expeditionId);
      if (expIndex === -1) return state;

      const expedition = state.expeditionQueue[expIndex];
      const newQueue = state.expeditionQueue.filter((_, i) => i !== expIndex);

      return queueReward(
        {
          ...state,
          diamonds: state.diamonds + expedition.reward.diamonds,
          heroShards: state.heroShards + expedition.reward.shards,
          essence: state.essence + expedition.reward.essence,
          expeditionQueue: newQueue,
        },
        {
          id: `expedition_${expedition.id}`,
          kind: 'system',
          title: 'Expedition Complete',
          detail: `${expedition.type} returned +${expedition.reward.diamonds} diamonds, +${expedition.reward.shards} shards${expedition.reward.essence > 0 ? `, +${expedition.reward.essence} essence` : ''}`,
        },
      );
    }

    case 'CONVERT_SCRAP_TO_ESSENCE': {
      const costPer = ctx.getScrapToEssenceCost(state);
      if (state.equipmentScrap < costPer) return state;
      const maxAffordable = Math.floor(state.equipmentScrap / costPer);
      const count = Math.max(1, Math.min(action.count ?? 1, maxAffordable));
      const totalCost = costPer * count;
      return queueReward(
        {
          ...state,
          equipmentScrap: state.equipmentScrap - totalCost,
          essence: state.essence + count,
        },
        {
          id: `scrap_to_essence_${Date.now()}`,
          kind: 'system',
          title: 'Essence Forge',
          detail: `Refined ${totalCost} scrap into +${count} essence`,
        },
      );
    }

    case 'CONVERT_SCRAP_TO_SHARDS': {
      const costPer = ctx.getScrapToShardCost();
      if (state.equipmentScrap < costPer) return state;
      const maxAffordable = Math.floor(state.equipmentScrap / costPer);
      const count = Math.max(1, Math.min(action.count ?? 1, maxAffordable));
      const totalCost = costPer * count;
      const totalShards = 140 * count;
      return queueReward(
        {
          ...state,
          equipmentScrap: state.equipmentScrap - totalCost,
          heroShards: state.heroShards + totalShards,
        },
        {
          id: `scrap_to_shards_${Date.now()}`,
          kind: 'system',
          title: 'Shard Forge',
          detail: `Refined ${totalCost} scrap into +${totalShards} shards`,
        },
      );
    }

    case 'BUY_GOLD_SHOP_ITEM': {
      const cost = GOLD_SHOP_COSTS[action.offerId];
      if (state.gold < cost) return state;

      if (action.offerId === 'exp_cache') {
        const nextState = {
          ...state,
          gold: state.gold - cost,
          usableItemCounts: ctx.addUsableItemCount(state.usableItemCounts, 'exp_scroll', 6),
        };
        return queueReward(nextState, {
          id: `shop_gold_exp_${Date.now()}`,
          kind: 'item',
          title: 'Gold Shop Purchase: Training Cache',
          detail: `-${cost} gold, +6 Training Scrolls`,
        });
      }

      if (action.offerId === 'potion_bundle') {
        let counts = ctx.addUsableItemCount(state.usableItemCounts, 'small_potion', 3);
        counts = ctx.addUsableItemCount(counts, 'grand_potion', 1);
        counts = ctx.addUsableItemCount(counts, 'gold_cache', 2);
        const nextState = {
          ...state,
          gold: state.gold - cost,
          usableItemCounts: counts,
        };
        return queueReward(nextState, {
          id: `shop_gold_potion_${Date.now()}`,
          kind: 'item',
          title: 'Gold Shop Purchase: Field Bundle',
          detail: `-${cost} gold, +3 Small Potions, +1 Grand Potion, +2 Gold Cache`,
        });
      }

      if (!state.playerClass) return state;
      const classItems = EQUIPMENT_CATALOG.filter(item =>
        item.allowedClasses.includes(state.playerClass as PlayerClass),
      );
      if (classItems.length === 0) return state;
      const rolledRarity = rollEquipmentRarityByTier(Math.random(), ctx.hasUnlock(state, 'mythic_equipment'));
      const rarityPool = classItems.filter(item => item.rarity === rolledRarity);
      const source = rarityPool.length > 0 ? rarityPool : classItems;
      const item = ctx.createEquipmentInstance(
        source[Math.floor(Math.random() * source.length)],
        Math.max(1, state.level),
        'crate',
      );
      if (!item) return state;

      return queueReward(
        {
          ...state,
          gold: state.gold - cost,
          equipmentInventory: {
            ...state.equipmentInventory,
            [item.id]: item,
          },
          inventoryItemIds: [...state.inventoryItemIds, item.id],
        },
        {
          id: `shop_gold_gear_${Date.now()}`,
          kind: 'item',
          title: `Gold Shop Purchase: ${item.emoji} ${item.name}`,
          detail: `${equipmentRarityConfig(item.rarity).label} gear • iLv ${item.itemLevel} • -${cost} gold`,
        },
      );
    }

    case 'BUY_DIAMOND_SHOP_ITEM': {
      const cost = DIAMOND_SHOP_COSTS[action.offerId];
      if (state.diamonds < cost) return state;

      let counts = state.usableItemCounts;
      let detail = '';
      if (action.offerId === 'coolant_i_pack') {
        counts = ctx.addUsableItemCount(counts, 'coolant_mk1', 4);
        detail = `-${cost} diamonds, +4 Coolant Capsule I`;
      } else if (action.offerId === 'coolant_ii_pack') {
        counts = ctx.addUsableItemCount(counts, 'coolant_mk2', 3);
        detail = `-${cost} diamonds, +3 Coolant Capsule II`;
      } else if (action.offerId === 'rift_raid_ticket') {
        return queueReward(
          {
            ...state,
            diamonds: state.diamonds - cost,
            riftRaidTickets: state.riftRaidTickets + 1,
          },
          {
            id: `shop_diamond_rift_ticket_${Date.now()}`,
            kind: 'item',
            title: 'Diamond Shop Purchase: Dungeon Raid Ticket',
            detail: `-${cost} diamonds, +1 Dungeon Raid Ticket`,
          },
        );
      } else {
        counts = ctx.addUsableItemCount(counts, 'coolant_mk1', 5);
        counts = ctx.addUsableItemCount(counts, 'coolant_mk2', 3);
        counts = ctx.addUsableItemCount(counts, 'grand_potion', 2);
        detail = `-${cost} diamonds, +5 Coolant I, +3 Coolant II, +2 Grand Potions`;
      }

      return queueReward(
        {
          ...state,
          diamonds: state.diamonds - cost,
          usableItemCounts: counts,
        },
        {
          id: `shop_diamond_${action.offerId}_${Date.now()}`,
          kind: 'system',
          title: 'Diamond Shop Purchase Complete',
          detail,
        },
      );
    }

    case 'SIMULATE_DOLLAR_PURCHASE': {
      if (!ENABLE_SIMULATED_DOLLAR_PURCHASES) return state;
      const pack = DOLLAR_SHOP_PACKS[action.offerId];
      if (!pack) return state;
      const firstPurchaseActive = !state.dollarFirstPurchaseClaimedOfferIds.includes(action.offerId);

      const pointsGain = Math.max(1, Math.round(pack.usdCents / 10));
      const nextPoints = state.vipPoints + pointsGain;
      const nextLevel = ctx.getVipLevelFromPoints(nextPoints);
      const leveledUp = nextLevel > state.vipLevel;
      const priceLabel = `$${(pack.usdCents / 100).toFixed(2)}`;
      const bonusDiamonds = firstPurchaseActive ? pack.diamonds : 0;

      const purchasedState = queueReward(
        {
          ...state,
          diamonds: state.diamonds + pack.diamonds + bonusDiamonds,
          vipPoints: nextPoints,
          vipLevel: nextLevel,
          dollarFirstPurchaseClaimedOfferIds: firstPurchaseActive
            ? [...state.dollarFirstPurchaseClaimedOfferIds, action.offerId]
            : state.dollarFirstPurchaseClaimedOfferIds,
        },
        {
          id: `shop_cash_${action.offerId}_${Date.now()}`,
          kind: 'system',
          title: 'Dollar Shop Purchase (Simulated)',
          detail: `${priceLabel} pack: +${pack.diamonds + bonusDiamonds} diamonds${firstPurchaseActive ? ' (first purchase x2 bonus)' : ''}, +${pointsGain} VIP points`,
        },
      );

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
        detail: `Bonuses now: +${Math.round((ctx.getVipDamageMultiplier({ ...state, vipLevel: nextLevel }) - 1) * 100)}% DPS, +${Math.round((ctx.getVipGoldMultiplier({ ...state, vipLevel: nextLevel }) - 1) * 100)}% gold, +${Math.round((ctx.getVipExpMultiplier({ ...state, vipLevel: nextLevel }) - 1) * 100)}% EXP`,
      });
    }

    case 'BUY_PREMIUM_COOLANT': {
      const unitCost = PREMIUM_COOLANT_COSTS[action.itemId];
      const amount = ctx.clampInt(action.amount, 1, 99, 1);
      const cost = unitCost * amount;
      if (state.diamonds < cost) return state;
      const item = getUsableItem(action.itemId);
      if (!item) return state;
      return queueReward(
        {
          ...state,
          diamonds: state.diamonds - cost,
          usableItemCounts: ctx.addUsableItemCount(state.usableItemCounts, action.itemId, amount),
        },
        {
          id: `buy_${action.itemId}_${Date.now()}`,
          kind: 'system',
          title: `Purchased ${item.emoji} ${item.name}`,
          detail: `-${cost} diamonds • +${amount}`,
        },
      );
    }

    default:
      return null;
  }
}

// ─── Exported Helpers ──────────────────────────────────────────

function getEquipmentCraftCost(slot: EquipmentSlot): { scrap: number; gold: number } {
  const costBySlot: Record<EquipmentSlot, { scrap: number; gold: number }> = {
    weapon: { scrap: 130, gold: 1800 },
    armor: { scrap: 120, gold: 1500 },
    accessory: { scrap: 100, gold: 1200 },
  };
  return costBySlot[slot];
}
