import {
  MINI_OP_COOLDOWN_MS,
  bountyTerms,
  diceReward,
  lockpickReward,
  reconReward,
  targetReward,
  type BountyDraft,
  type BountyMetric,
  type MiniOpId,
  type ReconOutcome,
} from '../../content/miniOps';
import { boundedInt, isRecord } from '../save/guards';
import type { SaveV3 } from '../save/schema';

/**
 * Playing a mini op.
 *
 * The engine pays; the surface plays. Every function here takes the outcome as
 * an argument — the roll, the card, whether the code cracked, the score — and
 * that is not a concession to testability but the shipped seam: no screen in
 * the old game leaves the result to the reducer, so its `Math.random()`
 * branches have never run. Reproducing them would be porting dead code.
 *
 * The cooldown is the only thing an op enforces for itself, and it is the same
 * four hours for all five.
 */

export interface MiniOpClocks {
  dice: number | null;
  recon: number | null;
  lockpick: number | null;
  target: number | null;
  bounty: number | null;
}

export interface SavedBounty {
  id: string;
  draft: BountyDraft;
  title: string;
  metric: BountyMetric;
  startValue: number;
  targetValue: number;
  reward: { gold: number; shards: number; diamonds: number };
}

export interface SavedMiniOps {
  /** When each op was last pressed. Null means never. */
  lastUsedMs: MiniOpClocks;
  /** The last dice face, which the surface shows until the next roll. */
  lastDiceRoll: number | null;
  /** The writ in hand, of which there is at most one. */
  bounty: SavedBounty | null;
}

/** The metrics a writ can be measured against, read from wherever they live. */
export interface BountyStanding {
  kills: number;
  wave: number;
  summons: number;
}

export interface MiniOpRequest {
  save: SaveV3;
  nowMs: number;
  /** The wave the player is standing on — which is what the gold is priced at. */
  wave: number;
  highestWave: number;
}

export interface MiniOpOutcome {
  save: SaveV3;
  /** What moved, for the surface to announce. */
  gained: { gold: number; shards: number; diamonds: number };
  /** Only the recon sweep grants one. */
  buff: { pct: number; ms: number } | null;
}

/* ── The cooldown ─────────────────────────────────────────────────────────── */

/**
 * How long until this op can be pressed again. Zero means now.
 *
 * The shipped guard clamps the stored stamp with `Math.min(last, now)` before
 * subtracting. **That clamp is not ported**, because it cannot change the
 * answer: it only does anything when the stamp is in the future, and in that
 * case the unclamped gap is negative — which is below a positive cooldown
 * exactly as the clamped zero is. An injection deleting it left every test
 * green, correctly. A defensive line that defends nothing reads like a guard
 * and tests like nothing, which is the worst pairing for whoever edits next.
 *
 * The guard that *is* real runs at load: `readMiniOps` clamps every stamp into
 * the past, so a doctored save cannot hand the runtime a future to reason
 * about at all.
 */
export function cooldownRemainingMs(save: SaveV3, op: keyof MiniOpClocks, nowMs: number): number {
  const last = save.miniOps.lastUsedMs[op];
  if (last === null) return 0;
  return Math.max(0, MINI_OP_COOLDOWN_MS - (nowMs - last));
}

export function isReady(save: SaveV3, op: keyof MiniOpClocks, nowMs: number): boolean {
  return cooldownRemainingMs(save, op, nowMs) <= 0;
}

function stamp(save: SaveV3, op: keyof MiniOpClocks, nowMs: number): SaveV3 {
  return {
    ...save,
    miniOps: { ...save.miniOps, lastUsedMs: { ...save.miniOps.lastUsedMs, [op]: nowMs } },
  };
}

function pay(save: SaveV3, gained: { gold: number; shards: number; diamonds: number }): SaveV3 {
  return {
    ...save,
    wallet: {
      ...save.wallet,
      gold: save.wallet.gold + gained.gold,
      // Lifetime gold climbs with the purse. The banking bug was this line
      // missing in three other places; it is not missing here.
      totalGold: save.wallet.totalGold + gained.gold,
      heroShards: save.wallet.heroShards + gained.shards,
      diamonds: save.wallet.diamonds + gained.diamonds,
    },
  };
}

/* ── The four ops ─────────────────────────────────────────────────────────── */

/**
 * Roll the dice.
 *
 * The roll is the surface's: it animates a face and reports it. Out of range
 * is clamped rather than refused, which is what the shipped reducer does with
 * a forced roll — a screen that reports 21 gets a 20, not an error.
 */
export function playDice(request: MiniOpRequest, roll: number): MiniOpOutcome | null {
  if (!isReady(request.save, 'dice', request.nowMs)) return null;
  const face = Math.max(1, Math.min(20, Math.floor(roll)));
  const reward = diceReward(face);
  const gained = { gold: 0, shards: reward.shards, diamonds: reward.diamonds };
  const next = stamp(pay(request.save, gained), 'dice', request.nowMs);
  return {
    save: { ...next, miniOps: { ...next.miniOps, lastDiceRoll: face } },
    gained,
    buff: null,
  };
}

/** Turn over the card the player picked. */
export function playRecon(request: MiniOpRequest, outcome: ReconOutcome): MiniOpOutcome | null {
  if (!isReady(request.save, 'recon', request.nowMs)) return null;
  const reward = reconReward(outcome, request.wave, request.highestWave);
  const gained = { gold: reward.gold, shards: reward.shards, diamonds: 0 };
  return {
    save: stamp(pay(request.save, gained), 'recon', request.nowMs),
    gained,
    buff: reward.buffMs > 0 ? { pct: reward.buffPct, ms: reward.buffMs } : null,
  };
}

/** Report whether the code cracked inside three guesses. */
export function playLockpick(request: MiniOpRequest, cracked: boolean): MiniOpOutcome | null {
  if (!isReady(request.save, 'lockpick', request.nowMs)) return null;
  const reward = lockpickReward(cracked, request.wave, request.highestWave);
  const gained = { gold: reward.gold, shards: 0, diamonds: reward.diamonds };
  return { save: stamp(pay(request.save, gained), 'lockpick', request.nowMs), gained, buff: null };
}

/** Report where the meter stopped, nought to a hundred. */
export function playTarget(request: MiniOpRequest, score: number, shardMultiplier: number): MiniOpOutcome | null {
  if (!isReady(request.save, 'target', request.nowMs)) return null;
  const reward = targetReward(score, request.highestWave, shardMultiplier);
  const gained = { gold: 0, shards: reward.shards, diamonds: reward.diamonds };
  return { save: stamp(pay(request.save, gained), 'target', request.nowMs), gained, buff: null };
}

/* ── The writ ─────────────────────────────────────────────────────────────── */

function standingOf(standing: BountyStanding, metric: BountyMetric): number {
  return metric === 'wave' ? standing.wave : metric === 'summons' ? standing.summons : standing.kills;
}

/**
 * Accept a writ.
 *
 * Two guards, and they are separate: the four-hour cooldown, and the rule that
 * only one writ stands at a time. Accepting sets both, which is why the
 * fixture had to clear the cooldown to measure the second at all — the case
 * named for the live-writ guard was being refused by the clock.
 */
export function startBounty(
  request: MiniOpRequest,
  draft: BountyDraft,
  standing: BountyStanding,
): { save: SaveV3; bounty: SavedBounty } | null {
  if (!isReady(request.save, 'bounty', request.nowMs)) return null;
  if (request.save.miniOps.bounty !== null) return null;

  const terms = bountyTerms(draft, request.wave, request.highestWave);
  const from = standingOf(standing, terms.metric);
  const bounty: SavedBounty = {
    id: `bounty_${request.nowMs}_${draft}`,
    draft,
    title: terms.title,
    metric: terms.metric,
    startValue: from,
    targetValue: from + terms.targetDelta,
    reward: terms.reward,
  };
  const next = stamp(request.save, 'bounty', request.nowMs);
  return { save: { ...next, miniOps: { ...next.miniOps, bounty } }, bounty };
}

/** How far along a writ is, nought to one. */
export function bountyProgress(bounty: SavedBounty, standing: BountyStanding): number {
  const span = bounty.targetValue - bounty.startValue;
  if (span <= 0) return 1;
  const done = standingOf(standing, bounty.metric) - bounty.startValue;
  return Math.max(0, Math.min(1, done / span));
}

export function bountyMet(bounty: SavedBounty, standing: BountyStanding): boolean {
  return standingOf(standing, bounty.metric) >= bounty.targetValue;
}

/**
 * Claim a writ that has been met.
 *
 * Clearing the writ is the whole payout record. The shipped state carries a
 * `claimed` flag, sanitises it at load and guards on it at claim — and no code
 * path ever writes it, because the claim nulls the writ instead. It is dropped
 * here, and the fixture is the test that says dropping it loses nothing.
 */
export function claimBounty(request: MiniOpRequest, standing: BountyStanding): MiniOpOutcome | null {
  const bounty = request.save.miniOps.bounty;
  if (bounty === null) return null;
  if (!bountyMet(bounty, standing)) return null;

  const gained = { ...bounty.reward };
  const paid = pay(request.save, gained);
  return { save: { ...paid, miniOps: { ...paid.miniOps, bounty: null } }, gained, buff: null };
}

/** Give up a writ without payment, so a wrong pick is not a four-hour wall. */
export function abandonBounty(save: SaveV3): SaveV3 {
  if (save.miniOps.bounty === null) return save;
  return { ...save, miniOps: { ...save.miniOps, bounty: null } };
}

/* ── The save slice ───────────────────────────────────────────────────────── */

const MAX_REWARD = 1e15;

export function emptyMiniOps(): SavedMiniOps {
  return {
    lastUsedMs: { dice: null, recon: null, lockpick: null, target: null, bounty: null },
    lastDiceRoll: null,
    bounty: null,
  };
}

/**
 * A stamp, clamped into the past.
 *
 * The v2 loader treats anything below ten billion as a **day number** and
 * multiplies it up — which is where the `last…Day` field names come from, and
 * the migration is still live because a save written before the format changed
 * still loads. Carried across verbatim, because dropping it turns a decade-old
 * stamp into a four-hour lockout at a moment in 1970.
 */
function readStamp(raw: unknown, nowMs: number): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const value = Math.floor(raw);
  if (value <= 0) return null;
  if (value < 10_000_000_000) return Math.min(nowMs, value * 86_400_000);
  return Math.min(nowMs, value);
}

/**
 * Which draft a metric belongs to.
 *
 * The three writs take one metric each and no two share one, so the metric
 * *is* the draft — which matters because the v2 `miniBounty` has no draft
 * field to carry. Reading it back from the metric is exact rather than a
 * guess, and it is what stops a round trip through the shipped keys turning
 * every writ into an assault.
 */
const DRAFT_BY_METRIC: Record<BountyMetric, BountyDraft> = {
  kills: 'assault',
  wave: 'push',
  summons: 'recruit',
};

function readBounty(raw: unknown): SavedBounty | null {
  if (!isRecord(raw)) return null;
  const metric: BountyMetric = raw.metric === 'wave' ? 'wave' : raw.metric === 'summons' ? 'summons' : 'kills';
  const draft: BountyDraft = DRAFT_BY_METRIC[metric];
  const reward = isRecord(raw.reward) ? raw.reward : raw;
  return {
    id: typeof raw.id === 'string' ? raw.id.slice(0, 64) : 'bounty',
    draft,
    title: typeof raw.title === 'string' ? raw.title.slice(0, 64) : 'Mini Bounty',
    metric,
    startValue: boundedInt(raw.startValue, 0, Number.MAX_SAFE_INTEGER, 0),
    targetValue: boundedInt(raw.targetValue, 0, Number.MAX_SAFE_INTEGER, 0),
    reward: {
      gold: boundedInt(reward.gold ?? reward.rewardGold, 0, MAX_REWARD, 0),
      shards: boundedInt(reward.shards ?? reward.rewardShards, 0, MAX_REWARD, 0),
      diamonds: boundedInt(reward.diamonds ?? reward.rewardDiamonds, 0, MAX_REWARD, 0),
    },
  };
}

export function readMiniOps(raw: unknown, nowMs: number, legacy = false): SavedMiniOps {
  if (!isRecord(raw)) return emptyMiniOps();
  if (legacy) {
    const roll = raw.lastDiceRollValue;
    return {
      lastUsedMs: {
        dice: readStamp(raw.lastDiceRollDay, nowMs),
        recon: readStamp(raw.lastReconSweepDay, nowMs),
        lockpick: readStamp(raw.lastLockpickDay, nowMs),
        target: readStamp(raw.lastTargetPracticeDay, nowMs),
        bounty: readStamp(raw.lastBountyDraftDay, nowMs),
      },
      lastDiceRoll: typeof roll === 'number' && Number.isFinite(roll) ? boundedInt(roll, 1, 20, 1) : null,
      bounty: readBounty(raw.miniBounty),
    };
  }
  const clocks = isRecord(raw.lastUsedMs) ? raw.lastUsedMs : {};
  const roll = raw.lastDiceRoll;
  return {
    lastUsedMs: {
      dice: readStamp(clocks.dice, nowMs),
      recon: readStamp(clocks.recon, nowMs),
      lockpick: readStamp(clocks.lockpick, nowMs),
      target: readStamp(clocks.target, nowMs),
      bounty: readStamp(clocks.bounty, nowMs),
    },
    lastDiceRoll: typeof roll === 'number' && Number.isFinite(roll) ? boundedInt(roll, 1, 20, 1) : null,
    bounty: readBounty(raw.bounty),
  };
}

/** Back out to the seven keys the shipped game reads. */
export function miniOpsToLegacy(miniOps: SavedMiniOps): Record<string, unknown> {
  const bounty = miniOps.bounty;
  return {
    lastDiceRollDay: miniOps.lastUsedMs.dice,
    lastDiceRollValue: miniOps.lastDiceRoll,
    lastReconSweepDay: miniOps.lastUsedMs.recon,
    lastLockpickDay: miniOps.lastUsedMs.lockpick,
    lastTargetPracticeDay: miniOps.lastUsedMs.target,
    lastBountyDraftDay: miniOps.lastUsedMs.bounty,
    miniBounty:
      bounty === null
        ? null
        : {
            id: bounty.id,
            title: bounty.title,
            metric: bounty.metric,
            startValue: bounty.startValue,
            targetValue: bounty.targetValue,
            rewardGold: bounty.reward.gold,
            rewardShards: bounty.reward.shards,
            rewardDiamonds: bounty.reward.diamonds,
            // Always false, because the shipped game never writes it true
            // either — the claim nulls the writ. Written so a v2 build reading
            // this save finds the field it sanitises.
            claimed: false,
          },
  };
}

/** Every mini op with its clock, for a surface to draw in one pass. */
export function miniOpStandings(save: SaveV3, nowMs: number): { id: MiniOpId; readyInMs: number }[] {
  return (['dice', 'recon', 'lockpick', 'target'] as const).map(id => ({
    id,
    readyInMs: cooldownRemainingMs(save, id, nowMs),
  }));
}
