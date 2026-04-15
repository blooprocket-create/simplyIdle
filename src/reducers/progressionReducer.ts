/**
 * progressionReducer — handles stat allocation, meta upgrades, rebirth,
 * daily login, weekly events, missions, VIP rewards, and codex claims.
 *
 * Extracted from the monolithic reducer in useGameState.ts.
 */

import type { GameState, RewardPopup } from '../useGameState';
import {
  WEEKLY_TRACK_MILESTONES,
  MISSION_BOARD_GOALS,
  type MissionBoardGoal,
  weekNumberForTimestamp,
  getWeeklyEventByWeek,
  getRebirthWaveRequirement,
  getMonsterMaxHp,
  HERO_POOL,
} from '../gameConfig';

// ─── Types ─────────────────────────────────────────────────────

type StatName = 'strength' | 'vitality' | 'agility' | 'intelligence' | 'spirit';
type MetaPath = 'damage' | 'economy' | 'survival';

export type ProgressionAction =
  | { type: 'ALLOCATE_STAT'; stat: StatName }
  | { type: 'ALLOCATE_STAT_MAX'; stat: StatName }
  | { type: 'ALLOCATE_STAT_N'; stat: StatName; amount: number }
  | { type: 'SPEND_ESSENCE_UPGRADE'; path: MetaPath }
  | { type: 'APPLY_WEEKLY_ROLLOVER'; nowMs: number }
  | { type: 'CLAIM_WEEKLY_TRACK'; milestone: number }
  | { type: 'CLAIM_MISSION'; missionId: string }
  | { type: 'APPLY_DAILY_LOGIN'; nowMs: number }
  | { type: 'REBIRTH' }
  | { type: 'CLEAR_ACHIEVEMENT' }
  | { type: 'CLEAR_REWARD_POPUP' }
  | { type: 'SPEND_REBIRTH_CORE'; path: MetaPath }
  | { type: 'CLAIM_VIP_REWARD'; level: number }
  | { type: 'CLAIM_CODEX_HERO_VIP'; heroId: string }
  | { type: 'CLAIM_CODEX_UNIQUE_VIP'; heroId: string };

export const PROGRESSION_ACTION_TYPES = new Set<string>([
  'ALLOCATE_STAT',
  'ALLOCATE_STAT_MAX',
  'ALLOCATE_STAT_N',
  'SPEND_ESSENCE_UPGRADE',
  'APPLY_WEEKLY_ROLLOVER',
  'CLAIM_WEEKLY_TRACK',
  'CLAIM_MISSION',
  'APPLY_DAILY_LOGIN',
  'REBIRTH',
  'CLEAR_ACHIEVEMENT',
  'CLEAR_REWARD_POPUP',
  'SPEND_REBIRTH_CORE',
  'CLAIM_VIP_REWARD',
  'CLAIM_CODEX_HERO_VIP',
  'CLAIM_CODEX_UNIQUE_VIP',
]);

// ─── Context ───────────────────────────────────────────────────
// Values that require helpers from useGameState.ts, passed in
// to avoid circular imports.

export interface ProgressionContext {
  /** Normalize team selection after rebirth */
  normalizeTeamSelection: (state: GameState, heroIds: string[]) => string[];
  /** Get team max HP for a given state */
  getTeamMaxHp: (state: GameState) => number;
  /** Achievement check side-effect */
  withAchievement: (state: GameState) => GameState;
}

// ─── Constants (mirrored from useGameState.ts) ─────────────────

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

const VALID_HERO_TEMPLATE_IDS = new Set(HERO_POOL.map(hero => hero.id));

// ─── Helpers ───────────────────────────────────────────────────

function queueReward(state: GameState, reward: RewardPopup): GameState {
  return {
    ...state,
    rewardQueue: [...state.rewardQueue, reward],
  };
}

function getEssenceUpgradeCost(level: number): number {
  return 20 + (level + 1) * (level + 1) * 12;
}

function getRebirthPathCost(level: number): number {
  return 1 + Math.floor(level * 0.8) + Math.floor((level * level) / 8);
}

function getVipLevelFromPoints(points: number): number {
  const safePoints = Math.max(0, Math.floor(points));
  for (let level = 10; level >= 1; level--) {
    if (safePoints >= VIP_LEVEL_THRESHOLDS[level]) return level;
  }
  return 0;
}

function getVipDamageMultiplier(vipLevel: number): number {
  return 1 + vipLevel * VIP_DAMAGE_PER_LEVEL;
}

function getVipGoldMultiplier(vipLevel: number): number {
  return 1 + vipLevel * VIP_GOLD_PER_LEVEL;
}

function getVipExpMultiplier(vipLevel: number): number {
  return 1 + vipLevel * VIP_EXP_PER_LEVEL;
}

function toDayNumber(ms: number): number {
  return Math.floor(ms / 86_400_000);
}

function getMissionProgressValue(state: GameState, mission: MissionBoardGoal): number {
  if (mission.metric === 'wave') return state.wave;
  if (mission.metric === 'kills') return state.totalKills;
  if (mission.metric === 'summons') return state.totalSummons;
  if (mission.metric === 'active_team') return state.activeTeamHeroIds.length;
  if (mission.metric === 'hero_shards') return state.heroShards;
  return state.essence;
}

// ─── Reducer ───────────────────────────────────────────────────

export function progressionReducer(
  state: GameState,
  action: ProgressionAction,
  ctx: ProgressionContext,
): GameState | null {
  switch (action.type) {
    case 'ALLOCATE_STAT': {
      if (state.unspentStatPoints <= 0) return state;
      return {
        ...state,
        statsAlloc: {
          ...state.statsAlloc,
          [action.stat]: state.statsAlloc[action.stat] + 1,
        },
        unspentStatPoints: state.unspentStatPoints - 1,
      };
    }

    case 'ALLOCATE_STAT_MAX': {
      if (state.unspentStatPoints <= 0) return state;
      const spend = state.unspentStatPoints;
      return {
        ...state,
        statsAlloc: {
          ...state.statsAlloc,
          [action.stat]: state.statsAlloc[action.stat] + spend,
        },
        unspentStatPoints: 0,
      };
    }

    case 'ALLOCATE_STAT_N': {
      if (state.unspentStatPoints <= 0) return state;
      const spend = Math.min(action.amount, state.unspentStatPoints);
      return {
        ...state,
        statsAlloc: {
          ...state.statsAlloc,
          [action.stat]: state.statsAlloc[action.stat] + spend,
        },
        unspentStatPoints: state.unspentStatPoints - spend,
      };
    }

    case 'SPEND_ESSENCE_UPGRADE': {
      const currentLevel =
        action.path === 'damage'
          ? state.metaDamageLevel
          : action.path === 'economy'
            ? state.metaEconomyLevel
            : state.metaSurvivalLevel;
      const cost = getEssenceUpgradeCost(currentLevel);
      if (state.essence < cost) return state;

      const base = { ...state, essence: state.essence - cost };

      if (action.path === 'damage') {
        return queueReward(
          { ...base, metaDamageLevel: state.metaDamageLevel + 1 },
          {
            id: `meta_damage_${Date.now()}`,
            kind: 'system',
            title: 'Meta Upgrade: Damage Path',
            detail: `Level ${state.metaDamageLevel + 1}`,
          },
        );
      }
      if (action.path === 'economy') {
        return queueReward(
          { ...base, metaEconomyLevel: state.metaEconomyLevel + 1 },
          {
            id: `meta_econ_${Date.now()}`,
            kind: 'system',
            title: 'Meta Upgrade: Economy Path',
            detail: `Level ${state.metaEconomyLevel + 1}`,
          },
        );
      }
      return queueReward(
        { ...base, metaSurvivalLevel: state.metaSurvivalLevel + 1 },
        {
          id: `meta_survival_${Date.now()}`,
          kind: 'system',
          title: 'Meta Upgrade: Survival Path',
          detail: `Level ${state.metaSurvivalLevel + 1}`,
        },
      );
    }

    case 'APPLY_WEEKLY_ROLLOVER': {
      if (!state.characterCreated) return state;
      const week = weekNumberForTimestamp(action.nowMs);
      if (week === state.weeklyEventWeek) return state;
      const event = getWeeklyEventByWeek(week);
      return queueReward(
        {
          ...state,
          weeklyEventWeek: week,
          weeklyEventId: event.id,
          weeklyKills: 0,
          weeklyTrackClaimed: [],
        },
        {
          id: `weekly_rollover_${week}`,
          kind: 'system',
          title: `Weekly Event: ${event.name}`,
          detail: event.description,
        },
      );
    }

    case 'CLAIM_WEEKLY_TRACK': {
      if (state.weeklyTrackClaimed.includes(action.milestone)) return state;
      if (!WEEKLY_TRACK_MILESTONES.includes(action.milestone)) return state;
      if (state.weeklyKills < action.milestone) return state;

      const gold = 220 + action.milestone * 12;
      const shards = 18 + Math.floor(action.milestone * 1.8);
      const essence = action.milestone >= 150 ? 4 : action.milestone >= 75 ? 2 : 1;

      return queueReward(
        {
          ...state,
          weeklyTrackClaimed: [...state.weeklyTrackClaimed, action.milestone],
          gold: state.gold + gold,
          totalGold: state.totalGold + gold,
          heroShards: state.heroShards + shards,
          essence: state.essence + essence,
        },
        {
          id: `weekly_track_${action.milestone}_${Date.now()}`,
          kind: 'system',
          title: 'Weekly Track Claimed',
          detail: `+${gold} gold, +${shards} shards, +${essence} essence`,
        },
      );
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
      return queueReward(
        {
          ...state,
          claimedMissionIds: [...state.claimedMissionIds, mission.id],
          gold: state.gold + rewardGold,
          totalGold: state.totalGold + rewardGold,
          diamonds: state.diamonds + rewardDiamonds,
          heroShards: state.heroShards + rewardShards,
          essence: state.essence + rewardEssence,
        },
        {
          id: `mission_${mission.id}_${Date.now()}`,
          kind: 'system',
          title: `Mission Complete: ${mission.title}`,
          detail: `+${rewardGold} gold, +${rewardShards} shards, +${rewardEssence} essence${rewardDiamonds > 0 ? `, +${rewardDiamonds} diamonds` : ''}`,
        },
      );
    }

    case 'APPLY_DAILY_LOGIN': {
      if (!state.characterCreated) return state;
      const today = toDayNumber(action.nowMs);
      if (state.lastDailyLoginDay === today) return state;

      const daysSinceLast = state.lastDailyLoginDay === null ? null : today - state.lastDailyLoginDay;
      const usedInsurance = daysSinceLast === 2 && state.streakInsuranceCharges > 0;
      const continued = daysSinceLast === 1 || usedInsurance;
      const streak = continued ? state.dailyLoginStreak + 1 : 1;
      const goldReward = 250 + Math.min(9, streak - 1) * 80;
      const shardReward = 20 + Math.min(9, streak - 1) * 6;
      const freeSummonBonus = streak % 3 === 0 ? 1 : 0;
      const insuranceEarned = streak % 7 === 0 ? 1 : 0;
      const nextInsurance = Math.min(3, state.streakInsuranceCharges - (usedInsurance ? 1 : 0) + insuranceEarned);

      const next = queueReward(
        {
          ...state,
          gold: state.gold + goldReward,
          totalGold: state.totalGold + goldReward,
          heroShards: state.heroShards + shardReward,
          freeSummonCharges: state.freeSummonCharges + freeSummonBonus,
          dailyLoginStreak: streak,
          lastDailyLoginDay: today,
          streakInsuranceCharges: nextInsurance,
        },
        {
          id: `daily_login_${today}`,
          kind: 'system',
          title: `Daily Login • Day ${streak}`,
          detail: `+${goldReward} gold, +${shardReward} shards${freeSummonBonus > 0 ? ', +1 free summon' : ''}${usedInsurance ? ', streak insurance consumed' : ''}${insuranceEarned > 0 ? ', +1 streak insurance' : ''}`,
        },
      );

      return ctx.withAchievement(next);
    }

    case 'REBIRTH': {
      const rebirthRequirement = getRebirthWaveRequirement(state.prestigeCount);
      if (state.highestWaveReached < rebirthRequirement) return state;
      const surplusWaves = Math.max(0, state.highestWaveReached - rebirthRequirement);
      const surplusStride = Math.max(15, Math.floor(rebirthRequirement * 0.05));
      const baseCoreGain = 1 + Math.floor(state.prestigeCount * 0.25);
      const gainedCores = baseCoreGain + Math.floor(surplusWaves / surplusStride);
      const preservedActiveTeam = ctx.normalizeTeamSelection(state, state.activeTeamHeroIds);
      const rebirthState = {
        ...state,
        exp: 0,
        level: 1,
        unspentStatPoints: state.unspentStatPoints,
        statsAlloc: state.statsAlloc,
        wave: 1,
        monsterHp: getMonsterMaxHp(1),
        monsterMaxHp: getMonsterMaxHp(1),
        activeTeamHeroIds: preservedActiveTeam,
        prestigeCount: state.prestigeCount + 1,
        newAchievement: null,
        lastActiveAt: Date.now(),
        seasonPoints: state.seasonPoints + 250,
        bestSeasonPoints: Math.max(state.bestSeasonPoints, state.seasonPoints + 250),
        rebirthCores: state.rebirthCores + gainedCores,
      };
      const nextTeamMaxHp = ctx.getTeamMaxHp(rebirthState);

      return queueReward(
        {
          ...rebirthState,
          teamMaxHp: nextTeamMaxHp,
          teamHp: nextTeamMaxHp,
        },
        {
          id: `rebirth_cores_${Date.now()}`,
          kind: 'system',
          title: 'Rebirth Complete',
          detail: `+${gainedCores} rebirth cores • requirement was Wave ${rebirthRequirement} • surplus ${surplusWaves}`,
        },
      );
    }

    case 'CLEAR_ACHIEVEMENT':
      return { ...state, newAchievement: null };

    case 'CLEAR_REWARD_POPUP':
      return {
        ...state,
        rewardQueue: state.rewardQueue.slice(1),
      };

    case 'SPEND_REBIRTH_CORE': {
      const currentLevel =
        action.path === 'damage'
          ? state.rebirthDamagePath
          : action.path === 'economy'
            ? state.rebirthEconomyPath
            : state.rebirthSurvivalPath;
      const cost = getRebirthPathCost(currentLevel);
      if (state.rebirthCores < cost) return state;

      const base = { ...state, rebirthCores: state.rebirthCores - cost };

      if (action.path === 'damage') {
        return queueReward(
          { ...base, rebirthDamagePath: state.rebirthDamagePath + 1 },
          {
            id: `rebirth_path_dmg_${Date.now()}`,
            kind: 'system',
            title: 'Rebirth Tree: Damage Path',
            detail: `Level ${state.rebirthDamagePath + 1}`,
          },
        );
      }
      if (action.path === 'economy') {
        return queueReward(
          { ...base, rebirthEconomyPath: state.rebirthEconomyPath + 1 },
          {
            id: `rebirth_path_econ_${Date.now()}`,
            kind: 'system',
            title: 'Rebirth Tree: Economy Path',
            detail: `Level ${state.rebirthEconomyPath + 1}`,
          },
        );
      }
      return queueReward(
        { ...base, rebirthSurvivalPath: state.rebirthSurvivalPath + 1 },
        {
          id: `rebirth_path_surv_${Date.now()}`,
          kind: 'system',
          title: 'Rebirth Tree: Survival Path',
          detail: `Level ${state.rebirthSurvivalPath + 1}`,
        },
      );
    }

    case 'CLAIM_VIP_REWARD': {
      if (action.level < 1 || action.level > 10) return state;
      if (state.vipLevel < action.level) return state;
      if (state.vipRewardClaimedLevels.includes(action.level)) return state;

      const reward = VIP_MILESTONE_REWARDS[action.level];
      if (!reward) return state;

      return queueReward(
        {
          ...state,
          vipRewardClaimedLevels: [...state.vipRewardClaimedLevels, action.level],
          diamonds: state.diamonds + reward.diamonds,
          gold: state.gold + reward.gold,
          totalGold: state.totalGold + reward.gold,
          heroShards: state.heroShards + reward.shards,
          essence: state.essence + reward.essence,
        },
        {
          id: `vip_reward_${action.level}_${Date.now()}`,
          kind: 'system',
          title: `VIP ${action.level} Reward Claimed`,
          detail: `+${reward.diamonds} diamonds, +${reward.gold} gold, +${reward.shards} shards, +${reward.essence} essence`,
        },
      );
    }

    case 'CLAIM_CODEX_HERO_VIP': {
      if (!VALID_HERO_TEMPLATE_IDS.has(action.heroId)) return state;
      if (state.codexVipClaimedHeroIds.includes(action.heroId)) return state;
      const owned = state.heroRoster.some(hero => hero.id === action.heroId);
      if (!owned) return state;

      const pointsGain = 10;
      const nextPoints = state.vipPoints + pointsGain;
      const nextLevel = getVipLevelFromPoints(nextPoints);
      const leveledUp = nextLevel > state.vipLevel;

      let nextState = queueReward(
        {
          ...state,
          codexVipClaimedHeroIds: [...state.codexVipClaimedHeroIds, action.heroId],
          vipPoints: nextPoints,
          vipLevel: nextLevel,
        },
        {
          id: `codex_vip_${action.heroId}_${Date.now()}`,
          kind: 'system',
          title: 'Codex Insight Reward',
          detail: `+${pointsGain} VIP points for recording hero lore`,
        },
      );

      if (leveledUp) {
        nextState = queueReward(nextState, {
          id: `vip_codex_level_${nextLevel}_${Date.now()}`,
          kind: 'system',
          title: `VIP Level Up: ${nextLevel}`,
          detail: `Bonuses now: +${Math.round((getVipDamageMultiplier(nextLevel) - 1) * 100)}% DPS, +${Math.round((getVipGoldMultiplier(nextLevel) - 1) * 100)}% gold, +${Math.round((getVipExpMultiplier(nextLevel) - 1) * 100)}% EXP`,
        });
      }
      return nextState;
    }

    case 'CLAIM_CODEX_UNIQUE_VIP': {
      if (!VALID_HERO_TEMPLATE_IDS.has(action.heroId)) return state;
      if (state.codexVipClaimedUniqueIds.includes(action.heroId)) return state;

      const uniqueProgress = state.heroUniqueGearByHeroId[action.heroId];
      if (!uniqueProgress || uniqueProgress.rank <= 0) return state;

      const pointsGain = 10;
      const nextPoints = state.vipPoints + pointsGain;
      const nextLevel = getVipLevelFromPoints(nextPoints);
      const leveledUp = nextLevel > state.vipLevel;

      let nextState = queueReward(
        {
          ...state,
          codexVipClaimedUniqueIds: [...state.codexVipClaimedUniqueIds, action.heroId],
          vipPoints: nextPoints,
          vipLevel: nextLevel,
        },
        {
          id: `codex_unique_vip_${action.heroId}_${Date.now()}`,
          kind: 'system',
          title: 'Unique Gear Codex Reward',
          detail: `+${pointsGain} VIP points for recording unique weapon data`,
        },
      );

      if (leveledUp) {
        nextState = queueReward(nextState, {
          id: `vip_codex_unique_level_${nextLevel}_${Date.now()}`,
          kind: 'system',
          title: `VIP Level Up: ${nextLevel}`,
          detail: `Bonuses now: +${Math.round((getVipDamageMultiplier(nextLevel) - 1) * 100)}% DPS, +${Math.round((getVipGoldMultiplier(nextLevel) - 1) * 100)}% gold, +${Math.round((getVipExpMultiplier(nextLevel) - 1) * 100)}% EXP`,
        });
      }
      return nextState;
    }

    default:
      return null;
  }
}
