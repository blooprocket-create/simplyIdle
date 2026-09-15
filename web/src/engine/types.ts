import Decimal from 'break_eternity.js';

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
    totals: { kills: 0, deaths: 0, dealt: new Decimal(0), overkill: new Decimal(0) },
  };
}
