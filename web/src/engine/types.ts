import Decimal from 'break_eternity.js';
import { BURST_COST, type BurstQuality } from './combat/burst';

/**
 * The read model the UI and renderer subscribe to. Everything outside
 * `src/engine` reads state through a snapshot and never reaches into
 * simulation internals, which is what lets the simulation be replaced
 * without touching a component.
 */

/** One hero, as the diorama needs to draw them. */
export interface HeroView {
  uid: string;
  /** 0 to 1 through the current swing. A cast bar reads this directly. */
  swingProgress: number;
  damagePerHit: Decimal;
  targetId: string | null;
}

/** A hit that landed during the last step. Floating damage numbers read these. */
export interface HitEvent {
  heroUid: string;
  /** Damage that landed. Never more than the target had left. */
  dealt: Decimal;
  /** Damage the killing blow carried past zero, and lost. */
  overkill: Decimal;
  killed: boolean;
  /** Milliseconds into the step at which the swing landed. */
  atMs: number;
}

export interface EnemyView {
  id: string;
  wave: number;
  hp: Decimal;
  maxHp: Decimal;
}

/**
 * BURST, as the HUD needs to draw it.
 *
 * Every field is derived rather than stored: the window is a function of how
 * long it has been open, so the snapshot reports where the sweep is *now*
 * rather than asking the HUD to run its own clock alongside the simulation's.
 */
export interface BurstView {
  /** 0 to `cost`. */
  charge: number;
  cost: number;
  /** The meter is full. The window may still have lapsed. */
  ready: boolean;
  windowOpen: boolean;
  /** 0 to 1 across the window, for the sweep. */
  progress: number;
  /** What a press right now would be worth, in a word. */
  quality: BurstQuality;
  /** Where the peak sits, as fractions of the window, so the HUD can mark it. */
  peak: { start: number; end: number };
}

/**
 * A wipe waiting to be answered.
 *
 * Present only while the team is down and the player has not said what to do.
 * The fight does not advance while this is set — there is nobody left to
 * swing — so a HUD showing it is not covering a running battle.
 */
export interface WipeView {
  /** The wave they fell on, and where a rally holds. */
  wave: number;
  /** Where a retreat puts them. */
  retreatTo: number;
  /** Health a rally comes back on, as a fraction of maximum. */
  rallyHealth: number;
  remainingMs: number;
  /** 0 to 1 of the decision window spent, for a countdown ring. */
  urgency: number;
}

export interface SimulationSnapshot {
  /** Wall-clock ms the simulation has advanced since the run began. */
  elapsedMs: number;
  /** Furthest wave reached this run. Drives campaign gating. */
  wave: number;
  ticks: number;
  enemy: EnemyView | null;
  /** The team's shared health bar. A wipe sends them back a chapter. */
  team: { hp: Decimal; maxHp: Decimal };
  heroes: HeroView[];
  /** Hits from the last step only. Replaced, not accumulated. */
  hits: HitEvent[];
  burst: BurstView;
  /** Null unless the team is down and waiting on an answer. */
  wipe: WipeView | null;
  totals: {
    kills: number;
    /** Wipes. Each one costs a chapter. */
    deaths: number;
    /** Damage that landed on something. */
    dealt: Decimal;
    /** Damage lost past the killing blow — the price of discrete attacks. */
    overkill: Decimal;
  };
}

/**
 * Built rather than declared, because a `Decimal` zero is an object and a
 * shared one would be handed to every caller. Nothing here mutates a
 * `Decimal`, but a frozen shared literal is the kind of thing that stops being
 * true quietly.
 */
export function emptySnapshot(): SimulationSnapshot {
  return {
    elapsedMs: 0,
    wave: 1,
    ticks: 0,
    enemy: null,
    team: { hp: new Decimal(0), maxHp: new Decimal(0) },
    heroes: [],
    hits: [],
    burst: {
      charge: 0,
      cost: BURST_COST,
      ready: false,
      windowOpen: false,
      progress: 0,
      quality: 'missed',
      peak: { start: 0, end: 0 },
    },
    wipe: null,
    totals: { kills: 0, deaths: 0, dealt: new Decimal(0), overkill: new Decimal(0) },
  };
}
