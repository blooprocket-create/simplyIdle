import {
  DICE_FACES,
  LOCKPICK_ATTEMPTS,
  LOCKPICK_MAX_CODE,
  LOCKPICK_MIN_CODE,
  MINI_OPS,
  MINI_OP_COOLDOWN_MS,
  RECON_CARDS_DEALT,
  RECON_OUTCOMES,
  TARGET_MAX_SCORE,
  bountyTerms,
  eventReachesTarget,
  isBossWave,
  type BountyDraft,
  type MiniOp,
  type MiniOpId,
  type ReconOutcome,
} from '../content/miniOps';
import {
  bountyMet,
  bountyProgress,
  claimBounty,
  cooldownRemainingMs,
  playDice,
  playLockpick,
  playRecon,
  playTarget,
  startBounty,
  type BountyStanding,
  type MiniOpOutcome,
  type SavedBounty,
} from '../engine/minigames/miniOps';
import type { SaveV3 } from '../engine/save/schema';

/**
 * The mini-op verbs, and the numbers a screen needs to draw them.
 *
 * The **op does not roll**. Every one of these takes the outcome the surface
 * produced — the dice face it animated, the card the player turned, whether
 * the code cracked, where the meter stopped. That is the shipped seam and the
 * engine boundary agreeing for once: the engine may not read a clock or a
 * generator, and the shipped screens never let it.
 *
 * The generator therefore lives *here*, at the shell, where `Math.random` is
 * allowed — these functions set up a round (deal the cards, pick a code) and
 * the engine is only ever told how it went.
 */

export interface MiniOpContext {
  save: SaveV3;
  nowMs: number;
  /** The wave the player is standing on, which is what the gold is priced at. */
  wave: number;
  highestWave: number;
}

const request = (context: MiniOpContext) => ({
  save: context.save,
  nowMs: context.nowMs,
  wave: context.wave,
  highestWave: context.highestWave,
});

export interface MiniOpRow {
  op: MiniOp;
  ready: boolean;
  /** Milliseconds until the next press. Zero when ready. */
  readyInMs: number;
}

export function miniOpRows(save: SaveV3, nowMs: number): MiniOpRow[] {
  return MINI_OPS.map(op => {
    const left = cooldownRemainingMs(save, op.id, nowMs);
    return { op, ready: left <= 0, readyInMs: left };
  });
}

/** How many of the four are ready, for a badge that says so. */
export function opsReady(save: SaveV3, nowMs: number): number {
  return miniOpRows(save, nowMs).filter(row => row.ready).length;
}

/* ── Setting up a round ───────────────────────────────────────────────────── */

/** A twenty-sided roll, taken at the shell where a generator is allowed. */
export function rollDice(random: () => number): number {
  return 1 + Math.floor(random() * DICE_FACES);
}

/**
 * Deal the recon cards.
 *
 * Three of the four, face down, and the player picks one — so **one outcome is
 * always absent**, and which three are on the table is itself part of the
 * round. The shipped screen shuffles with `sort(() => Math.random() - 0.5)`,
 * which is not a uniform permutation; this deals by drawing without
 * replacement, which is.
 */
export function dealRecon(random: () => number): ReconOutcome[] {
  const pool = [...RECON_OUTCOMES];
  const dealt: ReconOutcome[] = [];
  while (dealt.length < RECON_CARDS_DEALT && pool.length > 0) {
    dealt.push(...pool.splice(Math.floor(random() * pool.length), 1));
  }
  return dealt;
}

/** The two-digit code, ten through ninety-nine. */
export function lockpickCode(random: () => number): number {
  return LOCKPICK_MIN_CODE + Math.floor(random() * (LOCKPICK_MAX_CODE - LOCKPICK_MIN_CODE + 1));
}

export interface LockpickHint {
  /** Whether this guess was the code. */
  cracked: boolean;
  /** Higher, lower or correct, per digit — the shipped hint, both digits. */
  tens: 'higher' | 'lower' | 'correct';
  ones: 'higher' | 'lower' | 'correct';
  attemptsLeft: number;
  /** True once the guesses are gone and the code was not found. */
  jammed: boolean;
}

export function lockpickGuess(code: number, guess: number, attemptsUsed: number): LockpickHint {
  const used = attemptsUsed + 1;
  const compare = (want: number, got: number) => (got < want ? 'higher' : got > want ? 'lower' : 'correct');
  const cracked = guess === code;
  return {
    cracked,
    tens: compare(Math.floor(code / 10), Math.floor(guess / 10)),
    ones: compare(code % 10, guess % 10),
    attemptsLeft: Math.max(0, LOCKPICK_ATTEMPTS - used),
    jammed: !cracked && used >= LOCKPICK_ATTEMPTS,
  };
}

/**
 * Where the meter stopped, as a score.
 *
 * A tent over the whole track: a hundred dead centre, falling two points per
 * step either way, and nought only at the very ends. Ported from the screen,
 * because the score is the thing the engine is handed and a port inventing its
 * own curve would pay differently for the same press.
 */
export function targetScore(position: number, centre = TARGET_CENTRE): number {
  const distance = Math.abs(position - centre);
  return Math.max(0, Math.min(TARGET_MAX_SCORE, Math.round(TARGET_MAX_SCORE - distance * 2)));
}

/** The meter, as the shipped screen runs it: from eight, by three, bouncing. */
export const TARGET_METER_START = 8;
export const TARGET_METER_STEP = 3;
export const TARGET_METER_MIN = 0;
export const TARGET_METER_MAX = 100;
export const TARGET_CENTRE = 50;

export interface TargetMeter {
  position: number;
  direction: 1 | -1;
}

export function targetMeterStart(): TargetMeter {
  return { position: TARGET_METER_START, direction: 1 };
}

/**
 * One tick of the meter.
 *
 * Bouncing **clamps to the wall** rather than reflecting the overshoot, which
 * is the shipped behaviour and has a consequence worth knowing: it changes the
 * phase. Going up from eight in threes, fifty is hit exactly; coming back down
 * from a hundred, it is not — the meter passes 52 and 49 and skips the middle.
 * So a perfect score is only available on the first pass, and every pass after
 * it tops out at 98.
 *
 * Reproduced rather than smoothed, because this is the *feel* of the minigame
 * and 98 clears the top band as comfortably as 100 does. Pinned by a test so
 * that changing it is a decision rather than a drift.
 */
export function targetMeterTick(meter: TargetMeter): TargetMeter {
  const next = meter.position + meter.direction * TARGET_METER_STEP;
  if (next >= TARGET_METER_MAX) return { position: TARGET_METER_MAX, direction: -1 };
  if (next <= TARGET_METER_MIN) return { position: TARGET_METER_MIN, direction: 1 };
  return { position: next, direction: meter.direction };
}

/* ── Playing ──────────────────────────────────────────────────────────────── */

export function dice(context: MiniOpContext, roll: number): MiniOpOutcome | null {
  return playDice(request(context), roll);
}

export function recon(context: MiniOpContext, outcome: ReconOutcome): MiniOpOutcome | null {
  return playRecon(request(context), outcome);
}

export function lockpick(context: MiniOpContext, cracked: boolean): MiniOpOutcome | null {
  return playLockpick(request(context), cracked);
}

export function target(context: MiniOpContext, score: number, shardMultiplier: number): MiniOpOutcome | null {
  return playTarget(request(context), score, shardMultiplier);
}

/* ── The writ ─────────────────────────────────────────────────────────────── */

export interface BountyOffer {
  draft: BountyDraft;
  title: string;
  metric: string;
  targetDelta: number;
  reward: { gold: number; shards: number; diamonds: number };
}

export function bountyOffers(context: MiniOpContext): BountyOffer[] {
  return (['assault', 'push', 'recruit'] as const).map(draft => {
    const terms = bountyTerms(draft, context.wave, context.highestWave);
    return {
      draft,
      title: terms.title,
      metric: terms.metric,
      targetDelta: terms.targetDelta,
      reward: terms.reward,
    };
  });
}

export interface BountyStandingRow {
  bounty: SavedBounty;
  current: number;
  progress: number;
  met: boolean;
}

export function bountyStanding(save: SaveV3, standing: BountyStanding): BountyStandingRow | null {
  const bounty = save.miniOps.bounty;
  if (bounty === null) return null;
  const current =
    bounty.metric === 'wave' ? standing.wave : bounty.metric === 'summons' ? standing.summons : standing.kills;
  return { bounty, current, progress: bountyProgress(bounty, standing), met: bountyMet(bounty, standing) };
}

export function accept(context: MiniOpContext, draft: BountyDraft, standing: BountyStanding) {
  return startBounty(request(context), draft, standing);
}

export function claim(context: MiniOpContext, standing: BountyStanding): MiniOpOutcome | null {
  return claimBounty(request(context), standing);
}

/* ── What the surface tells the player ────────────────────────────────────── */

export interface MiniOpNotes {
  /** Whether the wave underfoot is one of the ones worth seven times its neighbours. */
  onBossWave: boolean;
  /** Whether the running shard event changes target practice at this depth. */
  eventReaches: boolean;
  cooldownHours: number;
}

/**
 * The two things a player cannot see and would want to.
 *
 * The boss-wave multiplier makes every gold payout here six times bigger on
 * wave 50 than on 51, and the weekly shard event does nothing to target
 * practice until the account is deep enough to clear the floor. Both are
 * shipped behaviour reproduced exactly; both are invisible in the shipped
 * game. Saying them is the difference between a timing choice and a secret.
 */
export function miniOpNotes(context: MiniOpContext, shardMultiplier: number): MiniOpNotes {
  return {
    onBossWave: isBossWave(context.wave),
    eventReaches: shardMultiplier > 1 && eventReachesTarget(context.highestWave, shardMultiplier),
    cooldownHours: MINI_OP_COOLDOWN_MS / 3_600_000,
  };
}

export type { MiniOpId };
