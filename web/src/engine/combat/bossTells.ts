/**
 * The boss mechanic, as a thing the player answers.
 *
 * The problem it exists to solve is specific. BURST charges on kills, and a
 * boss is one enemy with a very large health pool — so the meter stops moving
 * at exactly the moment the fight gets hard, and the shipped game's boss
 * fights were *less* interactive than the trash before them. The player
 * arrived with whatever charge they happened to have, spent it once, and then
 * watched.
 *
 * So a boss **tells**: at intervals it telegraphs, a window opens, and an
 * answer inside that window charges the meter and chips the boss. A boss
 * fight becomes the place the verb is most alive, which is what REVAMP's
 * "bosses hand-played" has to mean when the player owns one verb.
 *
 * **Everything here is upside.** A tell nobody answers does nothing at all —
 * it does not harden the boss, heal it, or hurt the team. Two reasons, and
 * both are load-bearing:
 *
 *   - This is an idle game. The rule BURST already follows is that missing
 *     costs the opportunity, not the meter, and a boss that punished absence
 *     would make putting the phone down a mistake.
 *   - The offline estimator models a fight with nobody in the chair. If an
 *     unanswered tell changed the fight, the live simulation and the estimator
 *     would describe different games — the exact divergence the parity suite
 *     exists to catch, and the one that already sank a first design once this
 *     phase. Unanswered tells being no-ops makes the estimate an honest floor
 *     that hand-play can only beat.
 *
 * Every function is a pure function of the clock, for the same reason the
 * BURST window is: a timing mechanic exercisable only by waiting in a browser
 * is one nobody can test.
 */

/** How much a chained answer adds, as a fraction of the base chip. */
const CHAIN_STEP = 0.25;
/** Where chaining stops paying, so a long boss cannot compound without end. */
const CHAIN_CAP = 2;

export interface TellSpec {
  /** Ms from one tell opening to the next. */
  cadenceMs: number;
  /** How long the answer window stays open. */
  windowMs: number;
  /** Charge an answered tell grants, on the same scale as a kill's. */
  charge: number;
  /** Seconds of the team's own damage an answered tell chips off the boss. */
  chipSeconds: number;
  /** Whether answering without missing escalates the chip. */
  chains: boolean;
}

export interface TellState {
  /** When the open tell began, or null between tells. */
  openedAtMs: number | null;
  /** When the next tell is due. */
  nextAtMs: number;
  /** Consecutive answers, for a spec that chains. */
  streak: number;
  /** Whether the open tell has already been answered. */
  answered: boolean;
}

export interface TellPayoff {
  charge: number;
  chipSeconds: number;
}

/**
 * The state a fight that is not a boss fight sits in.
 *
 * `nextAtMs` of `Infinity` rather than a flag: there is no boss, so the next
 * tell is never due, and every function below already reads that correctly.
 */
export function noTell(): TellState {
  return { openedAtMs: null, nextAtMs: Number.POSITIVE_INFINITY, streak: 0, answered: false };
}

/** The team arrived at a boss. The first tell is one cadence away. */
export function beginTells(spec: TellSpec, nowMs: number): TellState {
  return { openedAtMs: null, nextAtMs: nowMs + spec.cadenceMs, streak: 0, answered: false };
}

export function isTellOpen(state: TellState, spec: TellSpec, nowMs: number): boolean {
  if (state.openedAtMs === null || state.answered) return false;
  const held = nowMs - state.openedAtMs;
  return held >= 0 && held <= spec.windowMs;
}

/** 0 to 1 across the open window, for drawing the sweep. Always finite. */
export function tellProgress(state: TellState, spec: TellSpec, nowMs: number): number {
  if (state.openedAtMs === null || spec.windowMs <= 0) return 0;
  const held = nowMs - state.openedAtMs;
  if (!Number.isFinite(held) || held <= 0) return 0;
  return Math.min(1, held / spec.windowMs);
}

/**
 * What an answer at this streak is worth.
 *
 * Capped, because a boss that lives long enough is otherwise a compounding
 * multiplier, and the point of the chain is to reward attention across a
 * fight rather than to end it.
 */
export function chipFor(spec: TellSpec, streak: number): number {
  if (!spec.chains || streak <= 0) return spec.chipSeconds;
  return spec.chipSeconds * Math.min(CHAIN_CAP, 1 + streak * CHAIN_STEP);
}

/**
 * The clock moved.
 *
 * Opens a tell that has come due and closes one that has run out. It never
 * returns a payoff — only `answerTell` does — which is the whole of the
 * guarantee that a fight nobody is watching is the fight the estimator
 * models.
 */
export function advanceTell(state: TellState, spec: TellSpec, nowMs: number): TellState {
  let current = state;

  /*
   * Close first, then open, in the same call.
   *
   * Two separate passes looked equivalent and were not: a tell that closed on
   * the frame the next one was due left the next one waiting for another
   * frame, so the cadence silently doubled for every cycle after the first.
   * Caught by a chain test that could only reach a streak of one.
   */
  if (current.openedAtMs !== null && (current.answered || nowMs - current.openedAtMs > spec.windowMs)) {
    current = {
      openedAtMs: null,
      nextAtMs: current.openedAtMs + spec.cadenceMs,
      // A tell that was answered keeps the streak it just earned; one that
      // lapsed does not. Losing a streak the player never built costs an
      // absent player nothing, which is the point — but resetting it on the
      // player's *own* answer, as this first did, punished playing well.
      streak: current.answered ? current.streak : 0,
      answered: false,
    };
  }

  if (current.openedAtMs !== null || nowMs < current.nextAtMs) return current;
  return { openedAtMs: nowMs, nextAtMs: nowMs + spec.cadenceMs, streak: current.streak, answered: false };
}

/**
 * The player answered.
 *
 * A press outside a window is not a miss and costs nothing: the control is
 * only offered while a tell is open, and a press that arrives a frame after
 * it closed should not read as a punishment.
 */
export function answerTell(
  state: TellState,
  spec: TellSpec,
  nowMs: number,
): { state: TellState; payoff: TellPayoff | null } {
  if (!isTellOpen(state, spec, nowMs)) return { state, payoff: null };
  const payoff = { charge: spec.charge, chipSeconds: chipFor(spec, state.streak) };
  return { state: { ...state, answered: true, streak: state.streak + 1 }, payoff };
}

/** Ms until the next tell opens. Zero while one is open. */
export function untilNextTell(state: TellState, nowMs: number): number {
  if (state.openedAtMs !== null) return 0;
  if (!Number.isFinite(state.nextAtMs)) return Number.POSITIVE_INFINITY;
  return Math.max(0, state.nextAtMs - nowMs);
}
