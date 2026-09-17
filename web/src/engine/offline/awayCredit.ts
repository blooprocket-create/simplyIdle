import Decimal from 'break_eternity.js';
import { FLAT_RATES, type RewardRates } from '../combat/rewards';
import { estimateOffline, type OfflineEstimate } from './estimate';

/**
 * The bridge between a suspended tab and the offline estimator.
 *
 * The live loop clamps a step to twenty swings per hero, because replaying an
 * hour of combat as simultaneous attacks would both lie about the fight and
 * block the main thread for as long as the tab was hidden. That clamp was
 * correct and the comment next to it promised the estimator would credit the
 * discarded time — but nothing called the estimator, so the time was simply
 * gone. A player who backgrounded the tab lost every second of it.
 *
 * This is the call that makes the promise true.
 *
 * **What it credits.** Waves, kills and wipes — and, since the wallet landed,
 * the gold and EXP the estimate was already computing and this was throwing
 * away. That discard was correct while the live loop had no economy: crediting
 * rewards the running game could not itself produce would have been inventing
 * numbers. It has one now, so the note that said so is gone rather than left
 * to mislead.
 *
 * The rates reach the estimator rather than being applied afterwards, because
 * they belong inside the round model: a window's gold is the sum over the waves
 * it actually spent, and scaling the total at the end would price every wave at
 * whichever chain happened to be in force when the player came back.
 */

/**
 * A gap longer than this is a suspended tab, not a slow frame. Well above any
 * plausible stutter and well below the point where the attack clamp would
 * start discarding swings.
 */
export const AWAY_THRESHOLD_MS = 5_000;

export interface AwayCreditInput {
  wave: number;
  /** The team's combined damage per second. */
  teamDps: Decimal;
  teamMaxHp: Decimal;
  enemyHpMult: number;
  incomingMult: number;
  /** The gold and EXP chain, as the live loop is charging it. */
  rates?: RewardRates;
}

export interface AwayCredit {
  wave: number;
  kills: number;
  deaths: number;
  msCredited: number;
  /**
   * Priced by the whole window rather than per kill, and so **not rounded**.
   * The estimator resolves rounds and extrapolates repeats, so these cover
   * kills it never individually simulated; applying the live loop's per-kill
   * ceiling to them would round up once for every kill it skipped.
   */
  gold: Decimal;
  exp: Decimal;
}

export function creditAwayTime(input: AwayCreditInput, elapsedMs: number): AwayCredit {
  const rates = input.rates ?? FLAT_RATES;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || input.teamDps.lte(0)) {
    return { wave: input.wave, kills: 0, deaths: 0, msCredited: 0, gold: new Decimal(0), exp: new Decimal(0) };
  }

  const estimate: OfflineEstimate = estimateOffline(input.wave, elapsedMs, {
    dps: input.teamDps,
    // The live roster does not level while the tab is hidden, because the
    // simulation does not model hero levels yet. Zero growth is the honest
    // input rather than a guess at how far they would have come.
    sustainedDpsMult: 1,
    dpsPerHeroLevel: new Decimal(0),
    teamHpPerHeroLevel: new Decimal(0),
    heroLevel: 1,
    teamMaxHp: input.teamMaxHp,
    enemyHpMult: input.enemyHpMult,
    incomingMult: input.incomingMult,
    goldMult: rates.goldMult,
    expMult: rates.expMult,
    tempo: 1,
  });

  return {
    wave: estimate.wave,
    kills: estimate.kills,
    deaths: estimate.deaths,
    msCredited: estimate.msSpent,
    gold: estimate.gold,
    exp: estimate.exp,
  };
}
