/**
 * Minigames domain reducer slice.
 * Handles: dice roll, recon sweep, lockpick cache, target practice,
 * mini bounty drafts, rift dungeon, treasury raid.
 */
import { getMonsterGold, getMonsterMaxHp } from '../gameConfig';
import type { GameState } from '../useGameState';

// ── Types ──────────────────────────────────────────────────────────────────

interface RewardPopup {
  id: string;
  kind: 'gold' | 'item' | 'shard' | 'system';
  title: string;
  detail: string;
}

type MiniBountyMetric = 'kills' | 'wave' | 'summons';
type MiniBountyDraftType = 'assault' | 'push' | 'recruit';

export type MinigameAction =
  | { type: 'PLAY_DICE_ROLL'; forcedRoll?: number }
  | { type: 'PLAY_RECON_SWEEP'; forcedOutcome?: string }
  | { type: 'PLAY_LOCKPICK_CACHE'; forcedSuccess?: boolean }
  | { type: 'PLAY_TARGET_PRACTICE'; forcedScore?: number }
  | { type: 'START_MINI_BOUNTY_DRAFT'; draftType: MiniBountyDraftType }
  | { type: 'CLAIM_MINI_BOUNTY_DRAFT' }
  | { type: 'RUN_RIFT_DUNGEON'; useRaidTicket?: boolean }
  | { type: 'RUN_TREASURY_RAID'; useRaidTicket?: boolean };

// ── Helpers ────────────────────────────────────────────────────────────────

const MINI_OPS_COOLDOWN_MS = 4 * 60 * 60 * 1000;

function isMiniOpOnCooldown(lastUsedMs: number | null, nowMs: number): boolean {
  if (lastUsedMs == null) return false;
  const clamped = Math.min(lastUsedMs, nowMs);
  return nowMs - clamped < MINI_OPS_COOLDOWN_MS;
}

function toDayNumber(ts: number): number {
  return Math.floor(ts / 86_400_000);
}

function queueReward(state: GameState, reward: RewardPopup): GameState {
  return { ...state, rewardQueue: [...state.rewardQueue, reward] };
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

interface WeeklyEventConfig {
  shardMultiplier: number;
}

// ── Reducer ────────────────────────────────────────────────────────────────

interface MinigameContext {
  dps: number;
  weeklyShardMult: number;
}

/**
 * Handle a minigame action, returning updated GameState or null if unhandled.
 */
export function minigamesReducer(state: GameState, action: MinigameAction, ctx: MinigameContext): GameState | null {
  switch (action.type) {
    case 'PLAY_DICE_ROLL': {
      const nowMs = Date.now();
      if (isMiniOpOnCooldown(state.lastDiceRollDay, nowMs)) return state;

      const forcedRoll =
        typeof action.forcedRoll === 'number' && Number.isFinite(action.forcedRoll)
          ? Math.floor(action.forcedRoll)
          : null;
      const roll = forcedRoll == null ? 1 + Math.floor(Math.random() * 20) : Math.max(1, Math.min(20, forcedRoll));
      const diamonds = roll === 20 ? 30 : roll >= 17 ? 18 : roll >= 13 ? 12 : roll >= 9 ? 8 : 5;
      const shardBonus = roll >= 15 ? Math.floor(roll * 1.5 * 8) : 0;

      return queueReward(
        {
          ...state,
          diamonds: state.diamonds + diamonds,
          heroShards: state.heroShards + shardBonus,
          lastDiceRollDay: nowMs,
          lastDiceRollValue: roll,
        },
        {
          id: `dice_roll_${toDayNumber(nowMs)}`,
          kind: 'system',
          title: 'Dice Protocol Complete',
          detail: `Rolled ${roll}/20: +${diamonds} diamonds${shardBonus > 0 ? `, +${shardBonus} shards` : ''}`,
        },
      );
    }

    case 'PLAY_RECON_SWEEP': {
      const nowMs = Date.now();
      if (isMiniOpOnCooldown(state.lastReconSweepDay, nowMs)) return state;

      const picks = ['intel_gold', 'intel_shards', 'intel_buff', 'ambush'] as const;
      const rolled =
        action.forcedOutcome && (picks as readonly string[]).includes(action.forcedOutcome)
          ? (action.forcedOutcome as (typeof picks)[number])
          : picks[Math.floor(Math.random() * picks.length)];

      const baseGold = Math.max(2500, Math.floor(getMonsterGold(state.wave) * 18));
      const baseShards = Math.max(90, Math.floor(40 + state.highestWaveReached * 1.8));
      const goldGain = rolled === 'ambush' ? Math.floor(baseGold * 0.35) : baseGold;
      const shardGain = rolled === 'intel_shards' ? baseShards : 0;
      const buffPct = rolled === 'intel_buff' ? 0.18 : 0;
      const buffMs = rolled === 'intel_buff' ? 120_000 : 0;

      return queueReward(
        {
          ...state,
          gold: state.gold + goldGain,
          totalGold: state.totalGold + goldGain,
          heroShards: state.heroShards + shardGain,
          damageBuffPct: Math.max(state.damageBuffPct, buffPct),
          damageBuffMs: Math.max(state.damageBuffMs, buffMs),
          lastReconSweepDay: nowMs,
        },
        {
          id: `recon_sweep_${toDayNumber(nowMs)}`,
          kind: 'system',
          title: 'Recon Sweep Complete',
          detail:
            rolled === 'intel_shards'
              ? `Intel cache secured: +${goldGain} gold, +${shardGain} shards`
              : rolled === 'intel_buff'
                ? `Combat telemetry synced: +${goldGain} gold, +18% DPS for 2m`
                : rolled === 'ambush'
                  ? `Ambush contact: partial extraction +${goldGain} gold`
                  : `Supply intel acquired: +${goldGain} gold`,
        },
      );
    }

    case 'PLAY_LOCKPICK_CACHE': {
      const nowMs = Date.now();
      if (isMiniOpOnCooldown(state.lastLockpickDay, nowMs)) return state;

      const success = typeof action.forcedSuccess === 'boolean' ? action.forcedSuccess : Math.random() < 0.46;
      const diamondGain = success ? Math.max(30, Math.floor(16 + state.highestWaveReached * 0.6)) : 0;
      const goldConsolation = success ? 0 : Math.max(4000, Math.floor(getMonsterGold(state.wave) * 20));

      return queueReward(
        {
          ...state,
          diamonds: state.diamonds + diamondGain,
          gold: state.gold + goldConsolation,
          totalGold: state.totalGold + goldConsolation,
          lastLockpickDay: nowMs,
        },
        {
          id: `lockpick_cache_${toDayNumber(nowMs)}`,
          kind: success ? 'system' : 'gold',
          title: success ? 'Lockpick Cache Cracked' : 'Lockpick Cache Jammed',
          detail: success
            ? `Vault breached: +${diamondGain} diamonds`
            : `Mechanism failed: +${goldConsolation} salvage gold`,
        },
      );
    }

    case 'PLAY_TARGET_PRACTICE': {
      const nowMs = Date.now();
      if (isMiniOpOnCooldown(state.lastTargetPracticeDay, nowMs)) return state;

      const score =
        action.forcedScore == null
          ? Math.floor(Math.random() * 101)
          : Math.max(0, Math.min(100, Math.floor(action.forcedScore)));

      const weekly: WeeklyEventConfig = { shardMultiplier: ctx.weeklyShardMult };
      const shardGain =
        score >= 85
          ? Math.max(140, Math.floor((80 + state.highestWaveReached * 1.8) * weekly.shardMultiplier))
          : score >= 60
            ? Math.max(70, Math.floor((40 + state.highestWaveReached * 1.1) * weekly.shardMultiplier))
            : Math.max(35, Math.floor((20 + state.highestWaveReached * 0.7) * weekly.shardMultiplier));
      const diamondGain = score >= 85 ? 12 : score >= 60 ? 6 : 2;

      return queueReward(
        {
          ...state,
          heroShards: state.heroShards + shardGain,
          diamonds: state.diamonds + diamondGain,
          lastTargetPracticeDay: nowMs,
        },
        {
          id: `target_practice_${toDayNumber(nowMs)}`,
          kind: 'shard',
          title: 'Target Practice Complete',
          detail: `Score ${score}: +${shardGain} shards, +${diamondGain} diamonds`,
        },
      );
    }

    case 'START_MINI_BOUNTY_DRAFT': {
      const nowMs = Date.now();
      if (isMiniOpOnCooldown(state.lastBountyDraftDay, nowMs) || state.miniBounty) return state;

      const draftByType: Record<
        MiniBountyDraftType,
        {
          title: string;
          metric: MiniBountyMetric;
          targetDelta: number;
          rewards: { gold: number; shards: number; diamonds: number };
        }
      > = {
        assault: {
          title: 'Assault Writ',
          metric: 'kills',
          targetDelta: Math.max(120, Math.floor(80 + state.wave * 0.9)),
          rewards: {
            gold: Math.max(10000, Math.floor(getMonsterGold(state.wave) * 50)),
            shards: Math.max(80, Math.floor(state.highestWaveReached * 0.9)),
            diamonds: 6,
          },
        },
        push: {
          title: 'Frontline Push',
          metric: 'wave',
          targetDelta: 8,
          rewards: {
            gold: Math.max(12000, Math.floor(getMonsterGold(state.wave) * 65)),
            shards: Math.max(90, Math.floor(state.highestWaveReached * 1.1)),
            diamonds: 8,
          },
        },
        recruit: {
          title: 'Recruit Surge',
          metric: 'summons',
          targetDelta: 8,
          rewards: {
            gold: Math.max(8000, Math.floor(getMonsterGold(state.wave) * 40)),
            shards: Math.max(70, Math.floor(state.highestWaveReached * 0.75)),
            diamonds: 5,
          },
        },
      };

      const draft = draftByType[action.draftType];
      const currentMetric =
        draft.metric === 'wave' ? state.wave : draft.metric === 'summons' ? state.totalSummons : state.totalKills;

      return queueReward(
        {
          ...state,
          lastBountyDraftDay: nowMs,
          miniBounty: {
            id: `bounty_${toDayNumber(nowMs)}_${action.draftType}`,
            title: draft.title,
            metric: draft.metric,
            startValue: currentMetric,
            targetValue: currentMetric + draft.targetDelta,
            rewardGold: draft.rewards.gold,
            rewardShards: draft.rewards.shards,
            rewardDiamonds: draft.rewards.diamonds,
            claimed: false,
          },
        },
        {
          id: `bounty_start_${toDayNumber(nowMs)}`,
          kind: 'system',
          title: 'Bounty Draft Accepted',
          detail: `${draft.title}: reach +${draft.targetDelta} ${draft.metric}`,
        },
      );
    }

    case 'CLAIM_MINI_BOUNTY_DRAFT': {
      const bounty = state.miniBounty;
      if (!bounty || bounty.claimed) return state;

      const current =
        bounty.metric === 'wave' ? state.wave : bounty.metric === 'summons' ? state.totalSummons : state.totalKills;
      if (current < bounty.targetValue) return state;

      return queueReward(
        {
          ...state,
          gold: state.gold + bounty.rewardGold,
          totalGold: state.totalGold + bounty.rewardGold,
          heroShards: state.heroShards + bounty.rewardShards,
          diamonds: state.diamonds + bounty.rewardDiamonds,
          miniBounty: null,
        },
        {
          id: `bounty_claim_${Date.now()}`,
          kind: 'system',
          title: `Bounty Complete: ${bounty.title}`,
          detail: `+${bounty.rewardGold} gold, +${bounty.rewardShards} shards, +${bounty.rewardDiamonds} diamonds`,
        },
      );
    }

    case 'RUN_RIFT_DUNGEON': {
      const today = toDayNumber(Date.now());
      const useRaidTicket = !!action.useRaidTicket;
      const activeLevel = Math.max(1, state.riftDungeonLevel);
      const targetLevel = useRaidTicket ? Math.max(1, activeLevel - 1) : activeLevel;
      const entryCap = getRiftDailyEntryCap(state);
      const entriesUsed = state.riftEntryDay === today ? state.riftEntriesUsedToday : 0;

      if (useRaidTicket) {
        if (state.riftRaidTickets <= 0) return state;
        if (activeLevel <= 1) return state;

        const raidDiamonds = Math.max(10, Math.floor(12 + targetLevel * 5.5));
        const raidShards = Math.max(80, Math.floor(140 + targetLevel * 130));

        return queueReward(
          {
            ...state,
            diamonds: state.diamonds + raidDiamonds,
            heroShards: state.heroShards + raidShards,
            riftRaidTickets: state.riftRaidTickets - 1,
            lastRiftBossDamagePct: 1,
            lastRiftWavesCleared: 1,
          },
          {
            id: `rift_raid_${Date.now()}`,
            kind: 'system',
            title: 'Rift Raid Complete',
            detail: `Raided L${targetLevel} boss (+${raidDiamonds} diamonds, +${raidShards} shards). Free entries not consumed.`,
          },
        );
      }

      if (entriesUsed >= entryCap) return state;

      const bossLevel = targetLevel * 10;
      const bossHp = Math.max(1, Math.floor(getMonsterMaxHp(bossLevel) * (6 + targetLevel * 0.35)));
      const dps = Math.max(1, ctx.dps);
      const damageVariance = 0.9 + Math.random() * 0.2;
      const damageDone = dps * 120 * damageVariance;
      const damagePct = Math.max(0, Math.min(1, damageDone / bossHp));
      const cleared = damagePct >= 1;

      const fullDiamonds = Math.max(10, Math.floor(12 + targetLevel * 5.5));
      const fullShards = Math.max(80, Math.floor(140 + targetLevel * 130));
      const rewardScale = cleared ? 1 : damagePct;
      const diamonds = Math.max(0, Math.floor(fullDiamonds * rewardScale));
      const shardReward = Math.max(0, Math.floor(fullShards * rewardScale));

      const nextLevel = cleared ? targetLevel + 1 : targetLevel;
      const nextEntriesUsed = entriesUsed + 1;

      return queueReward(
        {
          ...state,
          diamonds: state.diamonds + diamonds,
          heroShards: state.heroShards + shardReward,
          riftDungeonLevel: nextLevel,
          riftEntryDay: today,
          riftEntriesUsedToday: nextEntriesUsed,
          lastRiftBossDamagePct: damagePct,
          lastRiftWavesCleared: cleared ? 1 : 0,
        },
        {
          id: `rift_run_${Date.now()}`,
          kind: 'system',
          title: cleared ? 'Rift Breach Cleared' : 'Rift Breach Failed',
          detail: `L${targetLevel} boss (Lv ${bossLevel}) • ${Math.round(damagePct * 100)}% damage • +${diamonds} diamonds, +${shardReward} shards${cleared ? ` • Dungeon advanced to L${nextLevel}` : ''}`,
        },
      );
    }

    case 'RUN_TREASURY_RAID': {
      const today = toDayNumber(Date.now());
      const useRaidTicket = !!action.useRaidTicket;
      const activeLevel = Math.max(1, state.treasureDungeonLevel);
      const targetLevel = useRaidTicket ? Math.max(1, activeLevel - 1) : activeLevel;
      const entryCap = getTreasuryDailyEntryCap(state);
      const entriesUsed = state.treasureEntryDay === today ? state.treasureEntriesUsedToday : 0;

      if (useRaidTicket) {
        if (state.riftRaidTickets <= 0) return state;
        if (activeLevel <= 1) return state;

        const raidGold = Math.max(500, Math.floor(800 + targetLevel * 600));
        const raidScrap = Math.max(2, Math.floor(3 + targetLevel * 1.5));

        return queueReward(
          {
            ...state,
            gold: state.gold + raidGold,
            totalGold: state.totalGold + raidGold,
            equipmentScrap: state.equipmentScrap + raidScrap,
            riftRaidTickets: state.riftRaidTickets - 1,
            lastTreasureHaulPct: 1,
            lastTreasureWiped: false,
          },
          {
            id: `treasury_raid_${Date.now()}`,
            kind: 'system',
            title: 'Treasury Raid Complete',
            detail: `Raided Vault L${targetLevel} (+${raidGold.toLocaleString()} gold, +${raidScrap} scrap). Free entries not consumed.`,
          },
        );
      }

      if (entriesUsed >= entryCap) return state;

      const waveCount = targetLevel * 2 + 3;
      const waveHp = Math.max(1, Math.floor(getMonsterMaxHp(targetLevel * 8) * (2 + targetLevel * 0.2)));
      const tdps = Math.max(1, ctx.dps);
      const tVariance = 0.88 + Math.random() * 0.24;
      const totalDamage = tdps * 90 * tVariance;
      const wavesCleared = Math.min(waveCount, Math.floor(totalDamage / waveHp));
      const cleared = wavesCleared >= waveCount;
      const haulPct = wavesCleared / waveCount;

      const wipeChance = cleared ? 0 : Math.max(0, 1 - haulPct * 1.5);
      const wiped = !cleared && Math.random() < wipeChance;
      const rewardScale = cleared ? 1 : wiped ? haulPct * 0.5 : haulPct;

      const fullGold = Math.max(500, Math.floor(800 + targetLevel * 600));
      const fullScrap = Math.max(2, Math.floor(3 + targetLevel * 1.5));
      const goldReward = Math.max(0, Math.floor(fullGold * rewardScale));
      const scrapReward = Math.max(0, Math.floor(fullScrap * rewardScale));

      const nextLevel = cleared ? targetLevel + 1 : targetLevel;
      const nextEntriesUsed = entriesUsed + 1;
      const wipeNote = wiped ? ' (wiped — 50% haul penalty)' : '';

      return queueReward(
        {
          ...state,
          gold: state.gold + goldReward,
          totalGold: state.totalGold + goldReward,
          equipmentScrap: state.equipmentScrap + scrapReward,
          treasureDungeonLevel: nextLevel,
          treasureEntryDay: today,
          treasureEntriesUsedToday: nextEntriesUsed,
          lastTreasureHaulPct: haulPct,
          lastTreasureWiped: wiped,
        },
        {
          id: `treasury_entry_${Date.now()}`,
          kind: 'system',
          title: cleared ? 'Treasury Raid Cleared' : wiped ? 'Treasury Raid — Wiped!' : 'Treasury Raid — Partial Haul',
          detail: `Vault L${targetLevel} • ${wavesCleared}/${waveCount} waves • +${goldReward.toLocaleString()} gold, +${scrapReward} scrap${wipeNote}`,
        },
      );
    }

    default:
      return null;
  }
}

/** Set of action types handled by the minigames reducer */
export const MINIGAME_ACTION_TYPES = new Set<string>([
  'PLAY_DICE_ROLL',
  'PLAY_RECON_SWEEP',
  'PLAY_LOCKPICK_CACHE',
  'PLAY_TARGET_PRACTICE',
  'START_MINI_BOUNTY_DRAFT',
  'CLAIM_MINI_BOUNTY_DRAFT',
  'RUN_RIFT_DUNGEON',
  'RUN_TREASURY_RAID',
]);
