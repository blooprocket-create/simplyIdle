import type Decimal from 'break_eternity.js';
import { getMonsterGold } from '../engine/waves/curves';

/**
 * The four mini ops, and the bounty writ.
 *
 * Five things a player can press once every four hours, and the reason to
 * open the game between runs rather than during one. The shipped code calls
 * them mini ops in its constant and nothing else, so that is what they are
 * called here.
 *
 * **The cooldown is four hours.** Every field carrying it in the shipped save
 * is named `last…Day` — a fossil from a save format that really did store a
 * day number, which the v2 loader still migrates by multiplying up to
 * milliseconds. The names outlived the format. Measured by bisection in
 * `__tests__/minigamesFixture.test.ts`, because a port that divides by a day
 * because the field says `Day` passes every test that merely records the
 * constant.
 *
 * **The op does not decide its own outcome.** Every screen in the shipped game
 * passes the result in: the dice are animated and then reported, the lockpick
 * is a two-digit code the player cracks in three guesses with a higher/lower
 * hint per digit, target practice is a meter they stop as near the middle as
 * they can. The reducer's `Math.random()` fallbacks have never run. So the
 * outcome is an argument here, which is both the shipped seam and what the
 * engine boundary requires — the surface plays, the engine pays.
 */

export const MINI_OP_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export type MiniOpId = 'dice' | 'recon' | 'lockpick' | 'target';

export interface MiniOp {
  id: MiniOpId;
  name: string;
  /** What the player actually does, in the words the surface uses. */
  verb: string;
  blurb: string;
}

export const MINI_OPS: readonly MiniOp[] = [
  {
    id: 'dice',
    name: 'Dice Protocol',
    verb: 'Roll',
    blurb: 'One twenty-sided roll. Diamonds on every result, shards from fifteen up.',
  },
  {
    id: 'recon',
    name: 'Recon Sweep',
    verb: 'Sweep',
    blurb: 'Three sealed cards, one pick. Gold on all of them, and a cache, a buff or an ambush behind one.',
  },
  {
    id: 'lockpick',
    name: 'Lockpick Cache',
    verb: 'Crack',
    blurb: 'A two-digit code in three guesses. Diamonds if it opens, salvage gold if it jams.',
  },
  {
    id: 'target',
    name: 'Target Practice',
    verb: 'Fire',
    blurb: 'Stop the meter in the middle. Shards and diamonds by how close you got.',
  },
];

export function miniOpById(id: string): MiniOp | null {
  return MINI_OPS.find(op => op.id === id) ?? null;
}

/* ── The dice ─────────────────────────────────────────────────────────────── */

export const DICE_FACES = 20;

/**
 * What a roll is worth.
 *
 * Written **once**. The shipped game writes it twice — the reducer computes it
 * to pay and `GameScreen` computes it again to show, under a comment reading
 * "Exact same formula as reducer for consistency", which is a duplicate
 * admitting in writing that it is kept in step by hand. They do agree today;
 * nothing makes them. A divergence shows the player one number and pays
 * another, and the fixture evaluates both copies to prove it has not happened
 * yet.
 */
export function diceReward(roll: number): { diamonds: number; shards: number } {
  const face = Math.max(1, Math.min(DICE_FACES, Math.floor(roll)));
  const diamonds = face === DICE_FACES ? 30 : face >= 17 ? 18 : face >= 13 ? 12 : face >= 9 ? 8 : 5;
  // `roll * 1.5 * 8` as shipped, which is `roll * 12` — left in the shipped
  // shape so the fixture's numbers and this expression read the same.
  const shards = face >= 15 ? Math.floor(face * 1.5 * 8) : 0;
  return { diamonds, shards };
}

/* ── The recon sweep ──────────────────────────────────────────────────────── */

export type ReconOutcome = 'intel_gold' | 'intel_shards' | 'intel_buff' | 'ambush';

export const RECON_OUTCOMES: readonly ReconOutcome[] = ['intel_gold', 'intel_shards', 'intel_buff', 'ambush'];

/** How many of the four are laid out face down. One is always absent. */
export const RECON_CARDS_DEALT = 3;

export const RECON_BUFF_PCT = 0.18;
export const RECON_BUFF_MS = 120_000;
/** What an ambush leaves of the haul. */
export const AMBUSH_SHARE = 0.35;

export interface ReconReward {
  gold: number;
  shards: number;
  buffPct: number;
  buffMs: number;
}

export function reconReward(outcome: ReconOutcome, wave: number, highestWave: number): ReconReward {
  const baseGold = Math.max(2500, Math.floor(waveGold(wave) * 18));
  return {
    gold: outcome === 'ambush' ? Math.floor(baseGold * AMBUSH_SHARE) : baseGold,
    shards: outcome === 'intel_shards' ? Math.max(90, Math.floor(40 + highestWave * 1.8)) : 0,
    buffPct: outcome === 'intel_buff' ? RECON_BUFF_PCT : 0,
    buffMs: outcome === 'intel_buff' ? RECON_BUFF_MS : 0,
  };
}

/* ── The lockpick cache ───────────────────────────────────────────────────── */

/** The code to crack: two digits, so ten through ninety-nine. */
export const LOCKPICK_MIN_CODE = 10;
export const LOCKPICK_MAX_CODE = 99;
export const LOCKPICK_ATTEMPTS = 3;

export function lockpickReward(
  cracked: boolean,
  wave: number,
  highestWave: number,
): { diamonds: number; gold: number } {
  return cracked
    ? { diamonds: Math.max(30, Math.floor(16 + highestWave * 0.6)), gold: 0 }
    : // A jam pays salvage rather than nothing, which is what makes three
      // guesses a game rather than a tax.
      { diamonds: 0, gold: Math.max(4000, Math.floor(waveGold(wave) * 20)) };
}

/* ── Target practice ──────────────────────────────────────────────────────── */

export const TARGET_MAX_SCORE = 100;
/** Where the bands break. Measured at 59/60 and 84/85. */
export const TARGET_BANDS = [85, 60] as const;

/**
 * What a score is worth.
 *
 * The weekly shard multiplier reaches the **shards and not the diamonds**, and
 * the floor is applied **after** the multiply. Both are shipped, both are
 * measured, and the second one has a consequence a reading would miss: at wave
 * one the base sits under the floor, so six of the eight weekly events pay an
 * identical 140 and only the 2x and 2.5x weeks change anything at all.
 *
 * Reproduced rather than corrected. Moving the floor inside the multiply would
 * change the payout at every wave, which is a balance decision and not a port.
 * The surface says which weeks are reaching the player instead.
 */
export function targetReward(
  score: number,
  highestWave: number,
  shardMultiplier: number,
): { shards: number; diamonds: number } {
  const clamped = Math.max(0, Math.min(TARGET_MAX_SCORE, Math.floor(score)));
  const shards =
    clamped >= 85
      ? Math.max(140, Math.floor((80 + highestWave * 1.8) * shardMultiplier))
      : clamped >= 60
        ? Math.max(70, Math.floor((40 + highestWave * 1.1) * shardMultiplier))
        : Math.max(35, Math.floor((20 + highestWave * 0.7) * shardMultiplier));
  const diamonds = clamped >= 85 ? 12 : clamped >= 60 ? 6 : 2;
  return { shards, diamonds };
}

/** Whether a shard event is big enough to clear the floor at this wave. */
export function eventReachesTarget(highestWave: number, shardMultiplier: number): boolean {
  return (
    targetReward(TARGET_MAX_SCORE, highestWave, shardMultiplier).shards >
    targetReward(TARGET_MAX_SCORE, highestWave, 1).shards
  );
}

/* ── The bounty writ ──────────────────────────────────────────────────────── */

export type BountyMetric = 'kills' | 'wave' | 'summons';
export type BountyDraft = 'assault' | 'push' | 'recruit';

export interface BountyTerms {
  draft: BountyDraft;
  title: string;
  metric: BountyMetric;
  /** How far past the player's current standing the target sits. */
  targetDelta: number;
  reward: { gold: number; shards: number; diamonds: number };
}

export const BOUNTY_DRAFTS: readonly BountyDraft[] = ['assault', 'push', 'recruit'];

/**
 * A writ, priced where the player stands.
 *
 * Which is what makes it a *draft* rather than a goal: the same writ asks more
 * of a deeper account and pays more for it. The assault target is
 * `max(120, 80 + wave * 0.9)`, so the floor binds up to wave 44 and the wave
 * term takes over after — 125 at wave 50, measured rather than predicted,
 * because reading the floor alone gives 120 and the reducer disagrees.
 */
export function bountyTerms(draft: BountyDraft, wave: number, highestWave: number): BountyTerms {
  const gold = (scale: number, floor: number) => Math.max(floor, Math.floor(waveGold(wave) * scale));
  switch (draft) {
    case 'assault':
      return {
        draft,
        title: 'Assault Writ',
        metric: 'kills',
        targetDelta: Math.max(120, Math.floor(80 + wave * 0.9)),
        reward: { gold: gold(50, 10000), shards: Math.max(80, Math.floor(highestWave * 0.9)), diamonds: 6 },
      };
    case 'push':
      return {
        draft,
        title: 'Frontline Push',
        metric: 'wave',
        targetDelta: 8,
        reward: { gold: gold(65, 12000), shards: Math.max(90, Math.floor(highestWave * 1.1)), diamonds: 8 },
      };
    case 'recruit':
      return {
        draft,
        title: 'Recruit Surge',
        metric: 'summons',
        targetDelta: 8,
        reward: { gold: gold(40, 8000), shards: Math.max(70, Math.floor(highestWave * 0.75)), diamonds: 5 },
      };
  }
}

/* ── The wave price everything above is paid at ───────────────────────────── */

/**
 * The gold one monster on this wave is worth, as a number.
 *
 * Every gold payout in this file runs through here, and it carries a quirk
 * worth saying out loud: `getMonsterGold` pays a **boss wave seven times** an
 * ordinary one, and these ops read the wave the player is *standing on*. So a
 * recon sweep pressed on wave 50 pays 1,160,586 gold and the same sweep on
 * wave 51 pays 190,278 — the four-hour cooldown is half the decision and where
 * you are standing is the other half.
 *
 * Reproduced, because it is the same curve every kill reward uses and
 * flattening it here would change the economy rather than port it. Said out
 * loud on the surface, because a timing quirk a player can see is a choice and
 * one they cannot is a secret handshake.
 */
function waveGold(wave: number): number {
  return toNumber(getMonsterGold(Math.max(1, Math.floor(wave))));
}

function toNumber(value: Decimal): number {
  return value.toNumber();
}

/** Whether this wave is one of the ones worth seven times its neighbours. */
export function isBossWave(wave: number): boolean {
  return Math.floor(wave) % 10 === 0;
}
