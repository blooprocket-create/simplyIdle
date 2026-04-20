/**
 * rosterReducer — handles hero summoning, team management, formation,
 * equipping, recycling, levelling, ranking, rebirth, and unique weapons.
 *
 * Extracted from the monolithic reducer in useGameState.ts.
 */

import type { GameState, RewardPopup, EquipmentInstance } from '../useGameState';
import {
  HERO_POOL,
  HERO_LEVEL_CAP,
  ACTIVE_TEAM_SIZE,
  rarityConfig,
  rollRarity,
  getSummonRarityPool,
  getRankUpShardCost,
  calculateShardReward,
  getHeroRebirthPlan,
  getHeroBackstory,
  getHeroUniqueSkillDescription,
  getHeroUniqueWeaponName,
  pickHeroForRarity,
  clampRarityToTier,
  SPARK_TOKEN_BY_RARITY,
  BANNER_RATE_UP_BY_RARITY,
  SUMMON_MILESTONES,
  SOFT_PITY_START,
  SOFT_PITY_BOOST_PER_PULL,
  SPARK_EXCHANGE_OPTIONS,
  DIAMOND_SUMMON_COST,
  VIP_SUMMON_DISCOUNT_LEVEL,
  VIP_SUMMON_DISCOUNT,
  type HeroUnit,
  type HeroTemplate,
  type Rarity,
  type PlayerClass,
  type HeroPassiveTraitId,
  type HeroActiveSkillArchetypeId,
  type EquipmentItem,
} from '../gameConfig';
import { roundTo4 } from '../utils';

// ─── Types ─────────────────────────────────────────────────────

type HeroFormationRole = 'front' | 'mid' | 'back';

interface SummonHistoryEntry {
  id: string;
  heroName: string;
  heroEmoji: string;
  rarity: Rarity;
  ts: number;
  pityTriggered: boolean;
}

export type RosterAction =
  | { type: 'EQUIP_ITEM'; itemId: string }
  | { type: 'SUMMON_HERO'; payWithDiamonds?: boolean }
  | { type: 'SUMMON_HERO_X10'; payWithDiamonds?: boolean }
  | { type: 'SUMMON_HERO_X10_CINEMATIC'; featuredHeroId?: string; payWithDiamonds?: boolean }
  | { type: 'AUTO_EQUIP_BEST_HEROES' }
  | { type: 'SAVE_TEAM_LOADOUT'; slot: number }
  | { type: 'LOAD_TEAM_LOADOUT'; slot: number }
  | { type: 'UNLOCK_TEAM_SLOT' }
  | { type: 'TOGGLE_EQUIP_HERO'; uid: string }
  | { type: 'SET_ACTIVE_TEAM'; heroIds: string[] }
  | { type: 'SET_HERO_FORMATION'; uid: string; role: HeroFormationRole }
  | { type: 'RECYCLE_HERO'; uid: string }
  | { type: 'AUTO_RECYCLE_HEROES' }
  | { type: 'TOGGLE_HERO_UNIQUE_WEAPON'; heroUid: string }
  | { type: 'RANK_UP_HERO'; uid: string }
  | { type: 'RANK_UP_HERO_TO_MAX'; uid: string }
  | { type: 'RANK_UP_HERO_TO_MAX_AND_REBIRTH'; uid: string }
  | { type: 'LEVEL_UP_HERO_GOLD'; uid: string }
  | { type: 'REBIRTH_HERO'; uid: string }
  | { type: 'BATCH_LEVEL_HEROES'; heroIds: string[]; addLevels: number | 'max' }
  | { type: 'SPARK_EXCHANGE'; optionId: string; targetHeroId?: string };

export const ROSTER_ACTION_TYPES = new Set<string>([
  'EQUIP_ITEM',
  'SUMMON_HERO',
  'SUMMON_HERO_X10',
  'SUMMON_HERO_X10_CINEMATIC',
  'AUTO_EQUIP_BEST_HEROES',
  'SAVE_TEAM_LOADOUT',
  'LOAD_TEAM_LOADOUT',
  'UNLOCK_TEAM_SLOT',
  'TOGGLE_EQUIP_HERO',
  'SET_ACTIVE_TEAM',
  'SET_HERO_FORMATION',
  'RECYCLE_HERO',
  'AUTO_RECYCLE_HEROES',
  'TOGGLE_HERO_UNIQUE_WEAPON',
  'RANK_UP_HERO',
  'RANK_UP_HERO_TO_MAX',
  'RANK_UP_HERO_TO_MAX_AND_REBIRTH',
  'LEVEL_UP_HERO_GOLD',
  'REBIRTH_HERO',
  'BATCH_LEVEL_HEROES',
  'SPARK_EXCHANGE',
]);

// ─── Context ───────────────────────────────────────────────────
// Values that require helpers from useGameState.ts, passed in
// to avoid circular imports.

export interface RosterContext {
  withAchievement: (state: GameState) => GameState;
  getTeamMaxHp: (state: GameState) => number;
  normalizeTeamSelection: (state: GameState, heroIds: string[]) => string[];
  getCurrentWeeklyEvent: (state: GameState) => { shardMultiplier: number };
  getEquipmentEntry: (state: GameState, itemId: string) => EquipmentInstance | EquipmentItem | null;
}

// ─── Constants (mirrored from useGameState.ts) ─────────────────

const MAX_FORMATION_ROLE_HEROES = 2;
const PITY_THRESHOLD = 30;
const MAX_SAVE_SUMMON_HISTORY = 50;
const VALID_HERO_TEMPLATE_IDS = new Set(HERO_POOL.map(hero => hero.id));

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

const VALID_FORMATION_ROLES_FOR_CLASS: Record<PlayerClass, HeroFormationRole[]> = {
  warrior: ['front'],
  berserker: ['front'],
  monk: ['front', 'mid'],
  mage: ['mid'],
  archer: ['back'],
};

const TEAM_SLOT_UNLOCK_RULES: Record<number, { requiredWave: number; goldCost: number; shardCost: number }> = {
  5: { requiredWave: 50, goldCost: 125000, shardCost: 450 },
  6: { requiredWave: 100, goldCost: 550000, shardCost: 1600 },
};

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

function isPostgameSummonUnlocked(state: Pick<GameState, 'highestWaveReached' | 'prestigeCount'>): boolean {
  return state.highestWaveReached >= 150 && state.prestigeCount >= 1;
}

function getRankUpCostToTarget(rarity: Rarity, currentRank: number, targetRank: number): number {
  const safeCurrent = Math.max(1, Math.min(10, Math.floor(currentRank)));
  const safeTarget = Math.max(safeCurrent, Math.min(10, Math.floor(targetRank)));
  let total = 0;
  for (let rank = safeCurrent + 1; rank <= safeTarget; rank += 1) {
    total += getRankUpShardCost(rarity, rank);
  }
  return total;
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

  // Soft pity: pulls past SOFT_PITY_START get cumulative Legendary+ boost
  let rarity: Rarity;
  if (counter >= SOFT_PITY_START) {
    const softBoost = (counter - SOFT_PITY_START + 1) * SOFT_PITY_BOOST_PER_PULL;
    if (Math.random() < softBoost) {
      // Soft pity hit — roll from Legendary+ distribution
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

  // Guaranteed minimum rarity floor (from milestone rewards)
  if (guaranteedMin && rarityRank(rarity) < rarityRank(guaranteedMin)) {
    rarity = guaranteedMin;
  }

  // Natural Legendary+ hit resets pity counter
  const isLegendaryPlus = rarityRank(rarity) >= rarityRank('legendary');
  return { rarity, nextCounter: isLegendaryPlus ? 0 : counter + 1, pityTriggered: false };
}

/** Award spark tokens when hero template already exists in roster. */
export function getSparkTokensForSummon(state: GameState, heroTemplateId: string, rarity: Rarity): number {
  const isDupe = state.heroRoster.some(hero => hero.id === heroTemplateId);
  return isDupe ? SPARK_TOKEN_BY_RARITY[rarity] : 0;
}

/** Check & claim summon milestones, mutates nothing — returns rewards to apply. */
export function checkSummonMilestones(
  totalSummons: number,
  claimed: number[],
): {
  newClaimed: number[];
  freeCharges: number;
  sparkTokens: number;
  guaranteedRarity: Rarity | null;
  grantUnique: boolean;
  rewardLabel: string[];
} {
  let freeCharges = 0;
  let sparkTokens = 0;
  let guaranteedRarity: Rarity | null = null;
  let grantUnique = false;
  const rewardLabel: string[] = [];
  const newClaimed = [...claimed];
  for (const milestone of SUMMON_MILESTONES) {
    if (totalSummons >= milestone.threshold && !claimed.includes(milestone.threshold)) {
      newClaimed.push(milestone.threshold);
      rewardLabel.push(milestone.rewardLabel);
      if (milestone.freeCharges) freeCharges += milestone.freeCharges;
      if (milestone.sparkTokens) sparkTokens += milestone.sparkTokens;
      if (milestone.guaranteedRarity) guaranteedRarity = milestone.guaranteedRarity;
      if (milestone.grantUniqueForge) grantUnique = true;
    }
  }
  return { newClaimed, freeCharges, sparkTokens, guaranteedRarity, grantUnique, rewardLabel };
}

/** Pick hero template respecting banner rate-up at Legendary+ rarities. */
export function pickHeroWithBanner(
  rarity: Rarity,
  featuredHeroId: string | undefined,
): { template: HeroTemplate; wasFeatured: boolean } {
  const featuredTemplate = featuredHeroId ? (HERO_POOL.find(h => h.id === featuredHeroId) ?? null) : null;
  const rateUp = BANNER_RATE_UP_BY_RARITY[rarity];
  if (featuredTemplate && rateUp && Math.random() < rateUp) {
    return { template: featuredTemplate, wasFeatured: true };
  }
  return { template: pickHeroForRarity(rarity), wasFeatured: false };
}

function defaultFormationForClass(playerClass: PlayerClass): HeroFormationRole {
  return VALID_FORMATION_ROLES_FOR_CLASS[playerClass][0];
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

export function getHeroGoldLevelCost(level: number): number {
  return Math.floor(100 * Math.pow(1.08, level - 1));
}

function clampUniqueRank(rank: number): number {
  return Math.max(1, Math.min(10, Math.floor(rank)));
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

function hasEquippedUniqueWeaponOnHero(state: GameState, hero: Pick<HeroUnit, 'id' | 'uid'>): boolean {
  return getUniqueWeaponBearerUid(state, hero.id) === hero.uid;
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

// ─── Reducer ───────────────────────────────────────────────────

/**
 * Handle a roster action, returning updated GameState or null if unhandled.
 */
export function rosterReducer(state: GameState, action: RosterAction, ctx: RosterContext): GameState | null {
  switch (action.type) {
    case 'EQUIP_ITEM': {
      if (!state.playerClass) return state;
      const item = ctx.getEquipmentEntry(state, action.itemId);
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
      const useDiamonds = action.payWithDiamonds === true;
      const vipDiscount = state.vipLevel >= VIP_SUMMON_DISCOUNT_LEVEL ? VIP_SUMMON_DISCOUNT : 0;
      const canUseFree = state.freeSummonCharges > 0;

      if (useDiamonds) {
        const diamondCost = Math.floor(DIAMOND_SUMMON_COST * (1 - vipDiscount));
        if (!canUseFree && state.diamonds < diamondCost) return state;
        const postgameUnlocked = isPostgameSummonUnlocked(state);

        const roll = rollRarityWithPity(state.gachaPityCounter, postgameUnlocked, state.guaranteedMinRarity);
        const { template } = pickHeroWithBanner(roll.rarity, undefined);
        const rarity = clampRarityToTier(roll.rarity, template.tier);
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

        const sparkGain = getSparkTokensForSummon(state, template.id, rarity);
        const historyEntry: SummonHistoryEntry = {
          id: `hist_${uid}`,
          heroName: hero.name,
          heroEmoji: hero.emoji,
          rarity: hero.rarity,
          ts: Date.now(),
          pityTriggered: roll.pityTriggered,
        };

        const newTotalSummons = state.totalSummons + 1;
        const milestones = checkSummonMilestones(newTotalSummons, state.claimedSummonMilestones);

        let nextState = ctx.withAchievement({
          ...state,
          diamonds: canUseFree ? state.diamonds : state.diamonds - diamondCost,
          heroRoster: [hero, ...state.heroRoster],
          summonHistory: [historyEntry, ...state.summonHistory].slice(0, MAX_SAVE_SUMMON_HISTORY),
          totalSummons: newTotalSummons,
          freeSummonCharges:
            (canUseFree ? state.freeSummonCharges - 1 : state.freeSummonCharges) + milestones.freeCharges,
          gachaPityCounter: roll.nextCounter,
          sparkTokens: state.sparkTokens + sparkGain + milestones.sparkTokens,
          claimedSummonMilestones: milestones.newClaimed,
          guaranteedMinRarity: state.guaranteedMinRarity ? null : milestones.guaranteedRarity,
        });
        nextState = syncUniqueWeaponAssignmentForHero(nextState, hero.id);
        nextState = maybeGrantHeroUniqueGear(nextState, hero, 0.06);
        if (milestones.grantUnique) {
          const randomHero = HERO_POOL[Math.floor(Math.random() * HERO_POOL.length)];
          const fakeUnit: HeroUnit = {
            ...randomHero,
            uid: `forge_${Date.now()}`,
            rarity: 'legendary',
            level: 1,
            rank: 1,
            teamBoost: 0,
          };
          nextState = grantHeroUniqueGear(nextState, fakeUnit);
        }
        if (roll.pityTriggered) {
          nextState = queueReward(nextState, {
            id: `pity_single_${Date.now()}`,
            kind: 'system',
            title: 'Pity Triggered',
            detail: `${hero.emoji} ${hero.name} arrived at ${rarity.toUpperCase()}!`,
          });
        }
        if (sparkGain > 0) {
          nextState = queueReward(nextState, {
            id: `spark_${Date.now()}`,
            kind: 'system',
            title: 'Dupe Spark',
            detail: `+${sparkGain} Spark Token${sparkGain > 1 ? 's' : ''} (duplicate hero)`,
          });
        }
        for (const label of milestones.rewardLabel) {
          nextState = queueReward(nextState, {
            id: `milestone_${Date.now()}_${label}`,
            kind: 'system',
            title: 'Summon Milestone!',
            detail: label,
          });
        }
        return nextState;
      }

      // Boss Tear payment (original path)
      if (!canUseFree && state.bossTears < 1) return state;
      const postgameUnlocked = isPostgameSummonUnlocked(state);

      const roll = rollRarityWithPity(state.gachaPityCounter, postgameUnlocked, state.guaranteedMinRarity);
      const { template } = pickHeroWithBanner(roll.rarity, undefined);
      const rarity = clampRarityToTier(roll.rarity, template.tier);
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

      const sparkGain = getSparkTokensForSummon(state, template.id, rarity);
      const historyEntry: SummonHistoryEntry = {
        id: `hist_${uid}`,
        heroName: hero.name,
        heroEmoji: hero.emoji,
        rarity: hero.rarity,
        ts: Date.now(),
        pityTriggered: roll.pityTriggered,
      };

      const newTotalSummons = state.totalSummons + 1;
      const milestones = checkSummonMilestones(newTotalSummons, state.claimedSummonMilestones);

      let nextState = ctx.withAchievement({
        ...state,
        bossTears: canUseFree ? state.bossTears : state.bossTears - 1,
        heroRoster: [hero, ...state.heroRoster],
        summonHistory: [historyEntry, ...state.summonHistory].slice(0, MAX_SAVE_SUMMON_HISTORY),
        totalSummons: newTotalSummons,
        freeSummonCharges:
          (canUseFree ? state.freeSummonCharges - 1 : state.freeSummonCharges) + milestones.freeCharges,
        gachaPityCounter: roll.nextCounter,
        sparkTokens: state.sparkTokens + sparkGain + milestones.sparkTokens,
        claimedSummonMilestones: milestones.newClaimed,
        guaranteedMinRarity: state.guaranteedMinRarity ? null : milestones.guaranteedRarity,
      });
      nextState = syncUniqueWeaponAssignmentForHero(nextState, hero.id);
      nextState = maybeGrantHeroUniqueGear(nextState, hero, 0.06);
      if (milestones.grantUnique) {
        const randomHero = HERO_POOL[Math.floor(Math.random() * HERO_POOL.length)];
        const fakeUnit: HeroUnit = {
          ...randomHero,
          uid: `forge_${Date.now()}`,
          rarity: 'legendary',
          level: 1,
          rank: 1,
          teamBoost: 0,
        };
        nextState = grantHeroUniqueGear(nextState, fakeUnit);
      }
      if (roll.pityTriggered) {
        nextState = queueReward(nextState, {
          id: `pity_single_${Date.now()}`,
          kind: 'system',
          title: 'Pity Triggered',
          detail: `${hero.emoji} ${hero.name} arrived at ${rarity.toUpperCase()}!`,
        });
      }
      if (sparkGain > 0) {
        nextState = queueReward(nextState, {
          id: `spark_${Date.now()}`,
          kind: 'system',
          title: 'Dupe Spark',
          detail: `+${sparkGain} Spark Token${sparkGain > 1 ? 's' : ''} (duplicate hero)`,
        });
      }
      for (const label of milestones.rewardLabel) {
        nextState = queueReward(nextState, {
          id: `milestone_${Date.now()}_${label}`,
          kind: 'system',
          title: 'Summon Milestone!',
          detail: label,
        });
      }
      return nextState;
    }

    case 'SUMMON_HERO_X10':
    case 'SUMMON_HERO_X10_CINEMATIC': {
      const useDiamonds = action.payWithDiamonds === true;
      const vipDiscount = state.vipLevel >= VIP_SUMMON_DISCOUNT_LEVEL ? VIP_SUMMON_DISCOUNT : 0;
      const totalPulls = 11; // x10 summon gives 11 heroes (1 bonus)
      const paidPullCount = 10; // cost is always based on 10
      const freeUses = Math.min(state.freeSummonCharges, paidPullCount);
      const paidUses = paidPullCount - freeUses;

      if (useDiamonds) {
        const perPullCost = Math.floor(DIAMOND_SUMMON_COST * (1 - vipDiscount));
        const totalDiamondCost = paidUses * perPullCost;
        if (state.diamonds < totalDiamondCost) return state;
      } else {
        if (state.bossTears < paidUses) return state;
      }

      const postgameUnlocked = isPostgameSummonUnlocked(state);
      const featuredHeroId = action.type === 'SUMMON_HERO_X10_CINEMATIC' ? action.featuredHeroId : undefined;

      const summoned: HeroUnit[] = [];
      const historyBatch: SummonHistoryEntry[] = [];
      let pityCounter = state.gachaPityCounter;
      let pityHits = 0;
      let totalSparkGain = 0;
      let guaranteedMin = state.guaranteedMinRarity;
      for (let i = 0; i < totalPulls; i++) {
        const roll = rollRarityWithPity(pityCounter, postgameUnlocked, guaranteedMin);
        pityCounter = roll.nextCounter;
        if (roll.pityTriggered) pityHits++;
        // Consume guaranteed floor on first pull only
        if (guaranteedMin) guaranteedMin = null;
        const { template } = pickHeroWithBanner(roll.rarity, featuredHeroId);
        const rarity = clampRarityToTier(roll.rarity, template.tier);
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
        // Spark tokens for dupes (check against existing roster + already-summoned in this batch)
        const alreadyOwned =
          state.heroRoster.some(h => h.id === template.id) || summoned.slice(0, i).some(h => h.id === template.id);
        if (alreadyOwned) totalSparkGain += SPARK_TOKEN_BY_RARITY[rarity];
      }

      const newTotalSummons = state.totalSummons + totalPulls;
      const milestones = checkSummonMilestones(newTotalSummons, state.claimedSummonMilestones);

      const diamondCostPerPull = Math.floor(DIAMOND_SUMMON_COST * (1 - vipDiscount));
      let nextState = ctx.withAchievement({
        ...state,
        bossTears: useDiamonds ? state.bossTears : state.bossTears - paidUses,
        diamonds: useDiamonds ? state.diamonds - paidUses * diamondCostPerPull : state.diamonds,
        heroRoster: [...summoned, ...state.heroRoster],
        summonHistory: [...historyBatch, ...state.summonHistory].slice(0, MAX_SAVE_SUMMON_HISTORY),
        totalSummons: newTotalSummons,
        freeSummonCharges: state.freeSummonCharges - freeUses + milestones.freeCharges,
        gachaPityCounter: pityCounter,
        sparkTokens: state.sparkTokens + totalSparkGain + milestones.sparkTokens,
        claimedSummonMilestones: milestones.newClaimed,
        guaranteedMinRarity: guaranteedMin ?? milestones.guaranteedRarity ?? null,
      });
      for (const hero of summoned) {
        nextState = syncUniqueWeaponAssignmentForHero(nextState, hero.id);
      }
      for (const hero of summoned) {
        nextState = maybeGrantHeroUniqueGear(nextState, hero, 0.1);
      }
      if (milestones.grantUnique) {
        const randomHero = HERO_POOL[Math.floor(Math.random() * HERO_POOL.length)];
        const fakeUnit: HeroUnit = {
          ...randomHero,
          uid: `forge_${Date.now()}`,
          rarity: 'legendary',
          level: 1,
          rank: 1,
          teamBoost: 0,
        };
        nextState = grantHeroUniqueGear(nextState, fakeUnit);
      }
      if (pityHits > 0) {
        nextState = queueReward(nextState, {
          id: `pity_x10_${Date.now()}`,
          kind: 'system',
          title: 'Pity Triggered',
          detail: `${pityHits} pity hit${pityHits > 1 ? 's' : ''} in this x10 summon.`,
        });
      }
      if (totalSparkGain > 0) {
        nextState = queueReward(nextState, {
          id: `spark_x10_${Date.now()}`,
          kind: 'system',
          title: 'Dupe Sparks',
          detail: `+${totalSparkGain} Spark Tokens from duplicate heroes`,
        });
      }
      for (const label of milestones.rewardLabel) {
        nextState = queueReward(nextState, {
          id: `milestone_${Date.now()}_${label}`,
          kind: 'system',
          title: 'Summon Milestone!',
          detail: label,
        });
      }
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
      const newTeam = ctx.normalizeTeamSelection(
        state,
        sorted.map(h => h.uid),
      );
      const newMaxHp = ctx.getTeamMaxHp({ ...state, activeTeamHeroIds: newTeam });
      return {
        ...state,
        activeTeamHeroIds: newTeam,
        teamMaxHp: newMaxHp,
        teamHp: Math.min(state.teamHp, newMaxHp),
      };
    }

    case 'SAVE_TEAM_LOADOUT': {
      const slot = Math.max(0, Math.min(2, action.slot));
      const next = [...state.teamLoadouts];
      next[slot] = [...state.activeTeamHeroIds];
      return queueReward(
        {
          ...state,
          teamLoadouts: next,
        },
        {
          id: `save_loadout_${slot}_${Date.now()}`,
          kind: 'system',
          title: `Saved Loadout ${slot + 1}`,
          detail: `${next[slot].length} heroes saved`,
        },
      );
    }

    case 'LOAD_TEAM_LOADOUT': {
      const slot = Math.max(0, Math.min(2, action.slot));
      const source = state.teamLoadouts[slot] ?? [];
      const validIds = ctx.normalizeTeamSelection(state, source);
      const newMaxHp = ctx.getTeamMaxHp({ ...state, activeTeamHeroIds: validIds });
      return queueReward(
        {
          ...state,
          activeTeamHeroIds: validIds,
          teamMaxHp: newMaxHp,
          teamHp: Math.min(state.teamHp, newMaxHp),
        },
        {
          id: `load_loadout_${slot}_${Date.now()}`,
          kind: 'system',
          title: `Loaded Loadout ${slot + 1}`,
          detail: `${validIds.length} heroes equipped`,
        },
      );
    }

    case 'UNLOCK_TEAM_SLOT': {
      const currentSlots = getUnlockedTeamSlotCap(state);
      if (currentSlots >= ACTIVE_TEAM_SIZE) return state;

      const targetSlots = currentSlots + 1;
      const req = getTeamSlotUnlockRequirement(targetSlots);
      if (!req) return state;
      if (state.highestWaveReached < req.requiredWave) return state;
      if (state.gold < req.goldCost || state.heroShards < req.shardCost) return state;

      return queueReward(
        {
          ...state,
          teamSlotsUnlocked: targetSlots,
          gold: state.gold - req.goldCost,
          heroShards: state.heroShards - req.shardCost,
        },
        {
          id: `team_slot_unlock_${targetSlots}_${Date.now()}`,
          kind: 'system',
          title: `Team Slot ${targetSlots} Unlocked`,
          detail: `-${req.goldCost} gold, -${req.shardCost} shards`,
        },
      );
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
        const activeBaseIds = new Set(active.map(uid => state.heroRoster.find(h => h.uid === uid)?.id).filter(Boolean));
        if (activeBaseIds.has(hero.id)) {
          return queueReward(state, {
            id: `duplicate_hero_${Date.now()}`,
            kind: 'system',
            title: 'Duplicate Hero',
            detail: `${hero.name} is already on your team (different rarity). Only one copy per hero allowed.`,
          });
        }
        newTeam = [...active, action.uid];
      }
      const newMaxHp = ctx.getTeamMaxHp({ ...state, activeTeamHeroIds: newTeam });
      return ctx.withAchievement({
        ...state,
        activeTeamHeroIds: newTeam,
        teamMaxHp: newMaxHp,
        teamHp: Math.min(state.teamHp, newMaxHp),
      });
    }

    case 'SET_ACTIVE_TEAM': {
      const validIds = ctx.normalizeTeamSelection(state, action.heroIds);
      const newMaxHp = ctx.getTeamMaxHp({ ...state, activeTeamHeroIds: validIds });
      return {
        ...state,
        activeTeamHeroIds: validIds,
        teamMaxHp: newMaxHp,
        teamHp: Math.min(state.teamHp, newMaxHp),
      };
    }

    case 'SET_HERO_FORMATION': {
      const hero = state.heroRoster.find(h => h.uid === action.uid);
      if (!hero) return state;
      const validRoles = VALID_FORMATION_ROLES_FOR_CLASS[hero.heroClass];
      if (!validRoles.includes(action.role)) return state;
      const activeTeamSet = new Set(state.activeTeamHeroIds);
      if (activeTeamSet.has(action.uid)) {
        const nextRoleCounts = getTeamRoleCounts(
          state,
          state.activeTeamHeroIds.filter(id => id !== action.uid),
        );
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

    case 'RECYCLE_HERO': {
      const hero = state.heroRoster.find(h => h.uid === action.uid);
      if (!hero) return state;
      if (hasEquippedUniqueWeaponOnHero(state, hero)) return state;

      const weekly = ctx.getCurrentWeeklyEvent(state);
      const shardReward = Math.ceil(calculateShardReward(hero.rarity, hero.level) * weekly.shardMultiplier);
      const newRoster = state.heroRoster.filter(h => h.uid !== action.uid);
      const newActiveTeam = state.activeTeamHeroIds.filter(id => id !== action.uid);
      const newMaxHp = ctx.getTeamMaxHp({ ...state, heroRoster: newRoster, activeTeamHeroIds: newActiveTeam });
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
        h => !activeTeam.has(h.uid) && rarityRank(h.rarity) <= maxRank && !hasEquippedUniqueWeaponOnHero(state, h),
      );
      if (toRecycle.length === 0) return state;

      const recycledIds = new Set(toRecycle.map(h => h.uid));
      const weekly = ctx.getCurrentWeeklyEvent(state);
      const shardReward = Math.ceil(
        toRecycle.reduce((sum, hero) => sum + calculateShardReward(hero.rarity, hero.level), 0) *
          weekly.shardMultiplier,
      );
      const newRoster = state.heroRoster.filter(h => !recycledIds.has(h.uid));
      const newMaxHp = ctx.getTeamMaxHp({ ...state, heroRoster: newRoster });
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

    case 'TOGGLE_HERO_UNIQUE_WEAPON': {
      const hero = state.heroRoster.find(entry => entry.uid === action.heroUid);
      if (!hero || !VALID_HERO_TEMPLATE_IDS.has(hero.id)) return state;
      const current = state.heroUniqueGearByHeroId[hero.id];
      if (!current || current.rank <= 0) return state;

      const copies = state.heroRoster.filter(copy => copy.id === hero.id);
      const eligibleBearer = copies.reduce<HeroUnit | null>((best, copy) => {
        if (!best || isPreferredUniqueBearer(copy, best)) return copy;
        return best;
      }, null);
      if (!eligibleBearer) return state;

      const isCurrentlyEquipped = current.equippedByUid === eligibleBearer.uid;
      return {
        ...state,
        heroUniqueGearByHeroId: {
          ...state.heroUniqueGearByHeroId,
          [hero.id]: {
            ...current,
            equippedByUid: isCurrentlyEquipped ? null : eligibleBearer.uid,
          },
        },
      };
    }

    case 'RANK_UP_HERO': {
      const hero = state.heroRoster.find(h => h.uid === action.uid);
      if (!hero || hero.rank >= 10) return state;

      const nextRankCost = getRankUpShardCost(hero.rarity, hero.rank + 1);
      if (!Number.isFinite(nextRankCost) || state.heroShards < nextRankCost) return state;

      const updatedHero = { ...hero, rank: hero.rank + 1 };
      const newRoster = state.heroRoster.map(h => (h.uid === action.uid ? updatedHero : h));

      return {
        ...state,
        heroRoster: newRoster,
        heroShards: state.heroShards - nextRankCost,
      };
    }

    case 'RANK_UP_HERO_TO_MAX': {
      const hero = state.heroRoster.find(h => h.uid === action.uid);
      if (!hero || hero.rank >= 10) return state;

      const rankUpCostToMax = getRankUpCostToTarget(hero.rarity, hero.rank, 10);
      if (!Number.isFinite(rankUpCostToMax) || state.heroShards < rankUpCostToMax) return state;

      const updatedHero = { ...hero, rank: 10 };
      return {
        ...state,
        heroRoster: state.heroRoster.map(h => (h.uid === action.uid ? updatedHero : h)),
        heroShards: state.heroShards - rankUpCostToMax,
      };
    }

    case 'RANK_UP_HERO_TO_MAX_AND_REBIRTH': {
      const hero = state.heroRoster.find(h => h.uid === action.uid);
      if (!hero || hero.level < HERO_LEVEL_CAP) return state;

      const rankUpCostToMax = getRankUpCostToTarget(hero.rarity, hero.rank, 10);
      const rankedHero = hero.rank >= 10 ? hero : { ...hero, rank: 10 };
      const rebirthPlan = getHeroRebirthPlan(rankedHero);
      const totalShardCost = rankUpCostToMax + rebirthPlan.shardCost;

      if (state.heroShards < totalShardCost || state.essence < rebirthPlan.essenceCost) return state;

      const rebornHero = normalizeHero({
        ...rankedHero,
        level: 1,
        rank: 1,
        rebirthStatMult: rebirthPlan.nextStatMultiplier,
      });

      return queueReward(
        {
          ...state,
          heroShards: state.heroShards - totalShardCost,
          essence: state.essence - rebirthPlan.essenceCost,
          heroRoster: state.heroRoster.map(h => (h.uid === action.uid ? rebornHero : h)),
        },
        {
          id: `hero_rank10_rebirth_${hero.uid}_${Date.now()}`,
          kind: 'system',
          title: `${hero.name} Ascended`,
          detail: `-${rankUpCostToMax} shards to rank 10 • -${rebirthPlan.shardCost} shards • -${rebirthPlan.essenceCost} essence • +${rebirthPlan.statGainPct}% hero stat gain`,
        },
      );
    }

    case 'LEVEL_UP_HERO_GOLD': {
      const hero = state.heroRoster.find(h => h.uid === action.uid);
      if (!hero || hero.level >= HERO_LEVEL_CAP) return state;
      const cost = getHeroGoldLevelCost(hero.level);
      if (state.gold < cost) return state;
      const newRoster = state.heroRoster.map(h => (h.uid === action.uid ? { ...h, level: h.level + 1 } : h));
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

      return queueReward(
        {
          ...state,
          heroShards: state.heroShards - shardCost,
          essence: state.essence - essenceCost,
          heroRoster: state.heroRoster.map(h => (h.uid === action.uid ? updatedHero : h)),
        },
        {
          id: `hero_rebirth_${hero.uid}_${Date.now()}`,
          kind: 'system',
          title: `${hero.name} Reborn`,
          detail: `-${shardCost} shards, -${essenceCost} essence • +${rebirthPlan.statGainPct}% hero stat gain • stat multiplier x${(updatedHero.rebirthStatMult ?? 1).toFixed(2)}`,
        },
      );
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

    case 'SPARK_EXCHANGE': {
      const option = SPARK_EXCHANGE_OPTIONS.find(o => o.id === action.optionId);
      if (!option) return state;
      if (state.sparkTokens < option.sparkCost) return state;

      let nextState: GameState = { ...state, sparkTokens: state.sparkTokens - option.sparkCost };

      if (option.kind === 'free_summon') {
        nextState = { ...nextState, freeSummonCharges: nextState.freeSummonCharges + 1 };
        nextState = queueReward(nextState, {
          id: `spark_exchange_${Date.now()}`,
          kind: 'system',
          title: 'Spark Exchange',
          detail: '+1 Free Summon Charge',
        });
      } else if (option.kind === 'targeted_hero' && option.minRarity) {
        const targetTemplate = action.targetHeroId ? (HERO_POOL.find(h => h.id === action.targetHeroId) ?? null) : null;
        const template = targetTemplate ?? pickHeroForRarity(option.minRarity);
        const rarity = clampRarityToTier(option.minRarity, template.tier);
        const rarityMult = rarityConfig(rarity).boostMultiplier;
        const uid = `${template.id}_${Date.now()}_spark_${Math.floor(Math.random() * 10000)}`;
        const hero: HeroUnit = {
          ...template,
          uid,
          rarity,
          level: 1,
          rank: 1,
          teamBoost: roundTo4(template.baseTeamBoost * rarityMult),
        };
        nextState = {
          ...nextState,
          heroRoster: [hero, ...nextState.heroRoster],
        };
        nextState = syncUniqueWeaponAssignmentForHero(nextState, hero.id);
        nextState = queueReward(nextState, {
          id: `spark_exchange_hero_${Date.now()}`,
          kind: 'system',
          title: 'Spark Exchange',
          detail: `${hero.emoji} ${hero.name} (${rarity}) acquired!`,
        });
      } else if (option.kind === 'guaranteed_transcendent') {
        const minTier = option.minTier ?? 4;
        const eligible = HERO_POOL.filter(h => h.tier >= minTier && h.tier <= 5);
        const template = eligible[Math.floor(Math.random() * eligible.length)];
        const rarity = clampRarityToTier('transcendent' as Rarity, template.tier);
        const rarityMult = rarityConfig(rarity).boostMultiplier;
        const uid = `${template.id}_${Date.now()}_spark_${Math.floor(Math.random() * 10000)}`;
        const hero: HeroUnit = {
          ...template,
          uid,
          rarity,
          level: 1,
          rank: 1,
          teamBoost: roundTo4(template.baseTeamBoost * rarityMult),
        };
        nextState = {
          ...nextState,
          heroRoster: [hero, ...nextState.heroRoster],
        };
        nextState = syncUniqueWeaponAssignmentForHero(nextState, hero.id);
        nextState = queueReward(nextState, {
          id: `spark_exchange_hero_${Date.now()}`,
          kind: 'system',
          title: 'Spark Exchange',
          detail: `${hero.emoji} ${hero.name} (${rarity}) — Transcendent Tier ${template.tier} acquired!`,
        });
      }

      return nextState;
    }

    default:
      return null;
  }
}
