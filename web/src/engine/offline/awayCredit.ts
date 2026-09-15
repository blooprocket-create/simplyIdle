import Decimal from 'break_eternity.js';
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
 * **What it credits, and what it does not.** The live simulation tracks waves,
 * kills and wipes; it has no economy yet, so no gold or EXP is awarded here.
 * Crediting rewards the running game cannot itself produce would be inventing
 * numbers. When the economy lands, it claims them from the same estimate.
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
}

export interface AwayCredit {
  wave: number;
  kills: number;
  deaths: number;
  msCredited: number;
}

export function creditAwayTime(input: AwayCreditInput, elapsedMs: number): AwayCredit {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || input.teamDps.lte(0)) {
    return { wave: input.wave, kills: 0, deaths: 0, msCredited: 0 };
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
    goldMult: 1,
    expMult: 1,
    tempo: 1,
  });

  return {
    wave: estimate.wave,
    kills: estimate.kills,
    deaths: estimate.deaths,
    msCredited: estimate.msSpent,
  };
}
