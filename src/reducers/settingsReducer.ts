/**
 * settingsReducer — handles all settings toggles, auto-mode configuration,
 * mail ingestion, hint tracking, and misc player preferences.
 *
 * Extracted from the monolithic reducer in useGameState.ts.
 */

import type { GameState, MailMessage } from '../useGameState';
import type { Rarity, EquipmentRarity } from '../gameConfig';

// ─── Types ─────────────────────────────────────────────────────

type CombatTempo = 1 | 2 | 4;
type AutoTempoTarget = 2 | 4;

export type SettingsAction =
  | { type: 'SET_AUTO_USE_POTION'; enabled: boolean }
  | { type: 'SET_AUTO_USE_COOLANT'; enabled: boolean }
  | { type: 'SET_AUTO_USE_POTION_THRESHOLD'; thresholdPct: number }
  | { type: 'MARK_STORY_BEAT_SEEN'; storyBeatId: string }
  | { type: 'MARK_HINT_SEEN'; hintId: string }
  | { type: 'APPEND_MAIL_MESSAGES'; mails: MailMessage[] }
  | { type: 'SET_LAST_ACTIVE_AT'; timestampMs: number }
  | { type: 'SET_AUTO_RECYCLE_MAX_RARITY'; rarity: Rarity }
  | { type: 'SET_AUTO_RECYCLE_ENABLED'; enabled: boolean }
  | { type: 'SET_AUTO_SUMMON_ENABLED'; enabled: boolean }
  | { type: 'SET_AUTO_SUMMON_MODE'; mode: 'single' | 'x10' }
  | { type: 'SET_AUTO_BURST_ENABLED'; enabled: boolean }
  | { type: 'SET_COMBAT_TEMPO'; tempo: CombatTempo }
  | { type: 'SET_AUTO_TEMPO_ENABLED'; enabled: boolean }
  | { type: 'SET_AUTO_TEMPO_TARGET'; target: AutoTempoTarget }
  | { type: 'SET_AUTO_SUMMON_RESERVE_GOLD'; reserveGold: number }
  | { type: 'SET_AUTO_DISMANTLE_ENABLED'; enabled: boolean }
  | { type: 'SET_AUTO_DISMANTLE_RARITY_FLOOR'; rarity: EquipmentRarity };

export const SETTINGS_ACTION_TYPES = new Set<string>([
  'SET_AUTO_USE_POTION',
  'SET_AUTO_USE_COOLANT',
  'SET_AUTO_USE_POTION_THRESHOLD',
  'MARK_STORY_BEAT_SEEN',
  'MARK_HINT_SEEN',
  'APPEND_MAIL_MESSAGES',
  'SET_LAST_ACTIVE_AT',
  'SET_AUTO_RECYCLE_MAX_RARITY',
  'SET_AUTO_RECYCLE_ENABLED',
  'SET_AUTO_SUMMON_ENABLED',
  'SET_AUTO_SUMMON_MODE',
  'SET_AUTO_BURST_ENABLED',
  'SET_COMBAT_TEMPO',
  'SET_AUTO_TEMPO_ENABLED',
  'SET_AUTO_TEMPO_TARGET',
  'SET_AUTO_SUMMON_RESERVE_GOLD',
  'SET_AUTO_DISMANTLE_ENABLED',
  'SET_AUTO_DISMANTLE_RARITY_FLOOR',
]);

// ─── Context ───────────────────────────────────────────────────

export interface SettingsContext {
  clampInt: (value: unknown, min: number, max: number, fallback: number) => number;
  clampString: (value: unknown, fallback: string, maxLength: number) => string;
  SAFE_INTEGER_CAP: number;
}

// ─── Helpers ───────────────────────────────────────────────────

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

// ─── Reducer ───────────────────────────────────────────────────

export function settingsReducer(state: GameState, action: SettingsAction, ctx: SettingsContext): GameState | null {
  switch (action.type) {
    case 'SET_AUTO_USE_POTION': {
      return { ...state, autoUsePotionEnabled: action.enabled };
    }

    case 'SET_AUTO_USE_COOLANT': {
      return { ...state, autoUseCoolantEnabled: action.enabled };
    }

    case 'SET_AUTO_USE_POTION_THRESHOLD': {
      const clamped = Math.max(0.1, Math.min(1, action.thresholdPct));
      return { ...state, autoUsePotionThresholdPct: clamped };
    }

    case 'MARK_STORY_BEAT_SEEN': {
      if (state.seenStoryBeatIds.includes(action.storyBeatId)) return state;
      return { ...state, seenStoryBeatIds: [...state.seenStoryBeatIds, action.storyBeatId] };
    }

    case 'MARK_HINT_SEEN': {
      if (state.seenHintIds.includes(action.hintId)) return state;
      return { ...state, seenHintIds: [...state.seenHintIds, action.hintId] };
    }

    case 'APPEND_MAIL_MESSAGES': {
      if (!Array.isArray(action.mails) || action.mails.length === 0) return state;
      const existingIds = new Set(state.mailbox.map(mail => mail.id));
      const fresh = action.mails
        .filter(mail => !!mail && typeof mail.id === 'string' && !existingIds.has(mail.id))
        .map(mail => ({
          ...mail,
          subject: ctx.clampString(mail.subject, 'Developer Mail', 80),
          message: ctx.clampString(mail.message, '', 280),
          from: ctx.clampString(mail.from, 'Dev Team', 48),
          sentAt: ctx.clampInt(mail.sentAt, 0, Date.now(), Date.now()),
          attachments: {
            shards: ctx.clampInt(mail.attachments?.shards, 0, ctx.SAFE_INTEGER_CAP, 0),
            gold: ctx.clampInt(mail.attachments?.gold, 0, ctx.SAFE_INTEGER_CAP, 0),
            diamonds: ctx.clampInt(mail.attachments?.diamonds, 0, ctx.SAFE_INTEGER_CAP, 0),
            tears: ctx.clampInt(mail.attachments?.tears, 0, ctx.SAFE_INTEGER_CAP, 0),
            essence: ctx.clampInt(mail.attachments?.essence, 0, ctx.SAFE_INTEGER_CAP, 0),
          },
          claimedAttachments: {
            shards: ctx.clampInt(mail.claimedAttachments?.shards, 0, ctx.SAFE_INTEGER_CAP, 0),
            gold: ctx.clampInt(mail.claimedAttachments?.gold, 0, ctx.SAFE_INTEGER_CAP, 0),
            diamonds: ctx.clampInt(mail.claimedAttachments?.diamonds, 0, ctx.SAFE_INTEGER_CAP, 0),
            tears: ctx.clampInt(mail.claimedAttachments?.tears, 0, ctx.SAFE_INTEGER_CAP, 0),
            essence: ctx.clampInt(mail.claimedAttachments?.essence, 0, ctx.SAFE_INTEGER_CAP, 0),
          },
        }));
      if (fresh.length === 0) return state;
      return { ...state, mailbox: [...fresh, ...state.mailbox].slice(0, 100) };
    }

    case 'SET_LAST_ACTIVE_AT': {
      if (!state.characterCreated) return state;
      const timestampMs = Number.isFinite(action.timestampMs)
        ? Math.max(0, Math.floor(action.timestampMs))
        : Date.now();
      return { ...state, lastActiveAt: timestampMs };
    }

    case 'SET_AUTO_RECYCLE_MAX_RARITY': {
      return { ...state, autoRecycleMaxRarity: action.rarity };
    }

    case 'SET_AUTO_RECYCLE_ENABLED': {
      return { ...state, autoRecycleEnabled: action.enabled };
    }

    case 'SET_AUTO_SUMMON_ENABLED': {
      return { ...state, autoSummonEnabled: action.enabled };
    }

    case 'SET_AUTO_SUMMON_MODE': {
      return { ...state, autoSummonMode: action.mode };
    }

    case 'SET_AUTO_BURST_ENABLED': {
      return { ...state, autoBurstEnabled: action.enabled };
    }

    case 'SET_COMBAT_TEMPO': {
      return { ...state, combatTempo: clampCombatTempoForVip(action.tempo, state) };
    }

    case 'SET_AUTO_TEMPO_ENABLED': {
      return { ...state, autoTempoEnabled: action.enabled };
    }

    case 'SET_AUTO_TEMPO_TARGET': {
      return { ...state, autoTempoTarget: clampAutoTempoTargetForVip(action.target, state) };
    }

    case 'SET_AUTO_SUMMON_RESERVE_GOLD': {
      return { ...state, autoSummonReserveGold: Math.max(0, action.reserveGold) };
    }

    case 'SET_AUTO_DISMANTLE_ENABLED': {
      return { ...state, autoDismantleEnabled: action.enabled };
    }

    case 'SET_AUTO_DISMANTLE_RARITY_FLOOR': {
      return { ...state, autoDismantleRarityFloor: action.rarity };
    }

    default:
      return null;
  }
}
