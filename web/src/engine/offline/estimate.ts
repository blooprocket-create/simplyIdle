import Decimal from 'break_eternity.js';
import { getMonsterAffixModifiers } from '../../content/affixes';
import { CHAPTER_WAVES, chapterStartWave, retreatWave } from '../combat/chapters';
import { getMonsterDamage, getMonsterExp, getMonsterGold, getMonsterMaxHp } from '../waves/curves';

export { CHAPTER_WAVES, chapterStartWave, retreatWave };

/**
 * Closed-form offline progress.
 *
 * The shipped game answers "what happened while I was away" by stepping its
 * whole combat loop until the window is spent. That is affordable right up
 * until it is not: a team that can neither kill nor be killed collapses the
 * adaptive step to its one second ceiling, and an eight hour window becomes
 * 28,800 full combat steps — measured at 16.8 seconds of blocking work, on the
 * load screen. `__tests__/offlineProgressFixture.test.ts` records all of that.
 *
 * This resolves the same question by rounds instead of by ticks, and skips
 * repetition rather than replaying it. The shape it models is the one the
 * fixture found: offline progress is a **sawtooth**, not a climb. Each kill
 * advances one wave and levels every active hero, so damage rises; monster HP
 * rises faster, at 1.12 per wave; eventually the team loses a round and
 * retreats to the start of its twenty-wave chapter, and climbs again.
 *
 * Two things make that cheap to compute. A round's outcome is decided before
 * it starts, because the team is always at full HP when one begins — so there
 * is nothing to integrate. And once heroes reach their level cap the sawtooth
 * repeats exactly, so the estimator detects the repeat and multiplies.
 */

export const HERO_LEVEL_CAP = 999;

/**
 * Hard bound on rounds simulated before extrapolation has to carry the rest.
 * Reached only when every round differs, which means heroes are still gaining
 * levels — and that phase is short, because the cap is 999.
 */
export const MAX_ROUNDS = 25_000;

/** The shipped combat tick. No round resolves faster than one of these. */
export const TICK_MS = 100;

export interface OfflineConditions {
  /** Team damage per second with nothing on a timer running. */
  dps: Decimal;
  /**
   * Uplift from abilities that fire on a cadence. A multiplier rather than a
   * simulated cadence: measured at 1.00x to 1.14x sustained, against a 112x
   * spike in the millisecond a whole team's abilities land together. Over a
   * window containing hundreds of rounds the average is what survives.
   */
  sustainedDpsMult: number;
  /** How much team dps rises per hero level. Zero once the roster is capped. */
  dpsPerHeroLevel: Decimal;
  /**
   * How much team HP rises per hero level. Hero vitality is affine in level
   * just as damage is, so the bar grows alongside the damage — and leaving it
   * out makes the team die at waves it comfortably survives.
   */
  teamHpPerHeroLevel: Decimal;
  heroLevel: number;
  /** Full team HP. A round begins here whether the last one was won or lost. */
  teamMaxHp: Decimal;
  /**
   * The parts of the enemy and reward multipliers that do *not* vary by wave:
   * the weekly event on one side, the team's whole mitigation chain on the
   * other. Affixes are applied per wave from the table instead of being folded
   * in here, because they cycle — folding the affix at the starting wave into
   * a constant put a post-rebirth climb out by a factor of three.
   */
  enemyHpMult: number;
  incomingMult: number;
  goldMult: number;
  expMult: number;
  /** Combat speed. Cancels out of a round's outcome; only its length changes. */
  tempo: number;
}

export type OfflineMethod = 'stepped' | 'extrapolated' | 'stalled';

export interface OfflineEstimate {
  wave: number;
  /** Signed. A window can end below where it started; the shipped popup hides that. */
  waveDelta: number;
  kills: number;
  deaths: number;
  gold: Decimal;
  exp: Decimal;
  heroLevel: number;
  msSpent: number;
  method: OfflineMethod;
  /** How many repeats of the sawtooth were multiplied rather than simulated. */
  cyclesExtrapolated: number;
  /** True when rounds ran out before the window did. */
  roundsExhausted: boolean;
}

interface Totals {
  kills: number;
  deaths: number;
  gold: Decimal;
  exp: Decimal;
  ms: number;
}

const ZERO = new Decimal(0);

function emptyTotals(): Totals {
  return { kills: 0, deaths: 0, gold: ZERO, exp: ZERO, ms: 0 };
}

/** One round at `wave`, decided up front because the team starts it at full HP. */
export interface Round {
  /** Milliseconds to kill the monster, ignoring whether the team survives it. */
  killMs: number;
  /** Damage the team takes across that whole time. */
  damageTaken: Decimal;
  survives: boolean;
  /** Milliseconds until the team dies, when it does. */
  deathMs: number;
}

export function resolveRound(wave: number, dps: Decimal, teamHp: Decimal, conditions: OfflineConditions): Round {
  const affix = getMonsterAffixModifiers(wave);
  const effectiveDps = dps.mul(conditions.sustainedDpsMult).mul(Math.max(1, conditions.tempo));
  const monsterHp = getMonsterMaxHp(wave).mul(conditions.enemyHpMult).mul(affix.hpMult);
  const rawKillMs = effectiveDps.lte(0) ? Number.POSITIVE_INFINITY : monsterHp.div(effectiveDps).mul(1000).toNumber();
  /*
   * A round cannot resolve faster than one tick. The shipped stepper rounds
   * every slice up to `TICK_MS`, so a team that could flatten a wave-one
   * monster in microseconds still spends a tick doing it. Without this floor
   * the estimator credits a post-rebirth roster about three times the kills
   * it really gets.
   */
  const killMs = Math.max(TICK_MS, rawKillMs);

  const incomingPerSec = getMonsterDamage(wave)
    .mul(conditions.incomingMult)
    .mul(affix.damageMult)
    .mul(Math.max(1, conditions.tempo));
  const damageTaken = incomingPerSec.mul(Number.isFinite(killMs) ? killMs / 1000 : 0);
  const deathMs = incomingPerSec.lte(0) ? Number.POSITIVE_INFINITY : teamHp.div(incomingPerSec).mul(1000).toNumber();

  return {
    killMs,
    damageTaken,
    // Strictly less: a round that exactly empties the bar is a loss, matching
    // the shipped `teamHp <= 0`.
    survives: Number.isFinite(killMs) && damageTaken.lt(teamHp),
    deathMs,
  };
}

export function estimateOffline(startWave: number, elapsedMs: number, conditions: OfflineConditions): OfflineEstimate {
  const totals = emptyTotals();
  let wave = Math.max(1, Math.floor(startWave));
  let heroLevel = conditions.heroLevel;
  let dps = conditions.dps;
  let teamHp = conditions.teamMaxHp;
  let remainingMs = Math.max(0, elapsedMs);
  let method: OfflineMethod = 'stepped';
  let cyclesExtrapolated = 0;
  let roundsExhausted = false;

  /**
   * Cycles are measured death to death, not round to round.
   *
   * The sawtooth's period is one defeat, and the segment between two defeats
   * at the same wave and roster level repeats verbatim. Keying every round
   * instead looks equivalent and is not: a climb that starts at wave one
   * passes through the chapter start on its way up, so the first repeat pairs
   * that fast opening climb with the steady-state loop and extrapolates a
   * cycle far richer than the one that actually recurs. Measured against the
   * shipped simulator that read three times too many kills, while the same
   * roster started at its ceiling — where there is no opening climb — came out
   * within five percent. Two runs with identical inputs disagreeing by 3x is
   * what gave it away.
   */
  const seenDeaths = new Map<string, { totals: Totals; remainingMs: number }>();
  let rounds = 0;

  while (remainingMs > 0) {
    if (rounds >= MAX_ROUNDS) {
      roundsExhausted = true;
      break;
    }
    rounds += 1;

    const round = resolveRound(wave, dps, teamHp, conditions);

    if (round.survives) {
      if (round.killMs > remainingMs) {
        // The window ends mid-round. Nothing is credited for a partial kill,
        // which is what the shipped simulator does too.
        totals.ms += remainingMs;
        remainingMs = 0;
        break;
      }
      totals.ms += round.killMs;
      remainingMs -= round.killMs;
      totals.kills += 1;
      const rewardAffix = getMonsterAffixModifiers(wave);
      totals.gold = totals.gold.add(getMonsterGold(wave).mul(conditions.goldMult).mul(rewardAffix.goldMult));
      totals.exp = totals.exp.add(getMonsterExp(wave).mul(conditions.expMult).mul(rewardAffix.expMult));
      wave += 1;
      if (heroLevel < HERO_LEVEL_CAP) {
        heroLevel += 1;
        dps = dps.add(conditions.dpsPerHeroLevel);
        teamHp = teamHp.add(conditions.teamHpPerHeroLevel);
      }
      continue;
    }

    if (!Number.isFinite(round.deathMs) || round.deathMs > remainingMs) {
      totals.ms += remainingMs;
      remainingMs = 0;
      break;
    }

    totals.ms += round.deathMs;
    remainingMs -= round.deathMs;
    totals.deaths += 1;
    wave = retreatWave(wave);

    const key = `${wave}|${heroLevel}`;
    const earlier = seenDeaths.get(key);
    if (!earlier) {
      seenDeaths.set(key, { totals: { ...totals }, remainingMs });
      continue;
    }
    if (cyclesExtrapolated > 0) continue;

    const cycleMs = earlier.remainingMs - remainingMs;
    if (cycleMs <= 0) continue;
    const repeats = Math.floor(remainingMs / cycleMs);
    if (repeats <= 0) continue;

    totals.kills += (totals.kills - earlier.totals.kills) * repeats;
    totals.deaths += (totals.deaths - earlier.totals.deaths) * repeats;
    totals.gold = totals.gold.add(totals.gold.sub(earlier.totals.gold).mul(repeats));
    totals.exp = totals.exp.add(totals.exp.sub(earlier.totals.exp).mul(repeats));
    totals.ms += cycleMs * repeats;
    remainingMs -= cycleMs * repeats;
    cyclesExtrapolated = repeats;
    method = 'extrapolated';
  }

  /*
   * Nothing resolved in the whole window: the team could neither finish a
   * monster nor be finished by one. This is the case that costs the shipped
   * simulator 28,800 steps to conclude that nothing happened.
   */
  if (elapsedMs > 0 && totals.kills === 0 && totals.deaths === 0) method = 'stalled';

  return {
    wave,
    waveDelta: wave - Math.max(1, Math.floor(startWave)),
    kills: totals.kills,
    deaths: totals.deaths,
    gold: totals.gold,
    exp: totals.exp,
    heroLevel,
    msSpent: totals.ms,
    method,
    cyclesExtrapolated,
    roundsExhausted,
  };
}
