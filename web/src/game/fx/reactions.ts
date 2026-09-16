/**
 * The shapes of a reaction, separated from the drawing of it.
 *
 * A flash that peaks late, a recoil that never returns, a telegraph that
 * pulses so slowly nobody notices it — all of these are bugs you can only
 * find by staring at a render, unless the curve is a function you can assert
 * things about. So the curves live here and the meshes read them.
 */

/** A hit reaction is over in about this long. */
export const REACTION_MS = 220;

/** How far a struck actor gives ground, at the worst of it. */
export const RECOIL_METRES = 0.18;

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Brightness added to a struck actor: full at the instant of impact, gone
 * shortly after. Front-loaded on purpose — a flash that ramps up reads as a
 * glow rather than as a blow.
 */
export function hitFlash(ageMs: number): number {
  const t = clamp01(ageMs / REACTION_MS);
  return (1 - t) * (1 - t);
}

/**
 * Displacement away from the attacker. Out fast, back slower, ending exactly
 * where it started: an actor that keeps a fraction of every recoil walks off
 * the battlefield over a few hundred hits.
 */
export function hitRecoil(ageMs: number): number {
  const t = clamp01(ageMs / REACTION_MS);
  return Math.sin(t * Math.PI) * RECOIL_METRES;
}

/** A boss telegraph breathes at this period. */
export const TELEGRAPH_PERIOD_MS = 1600;

/**
 * 0..1 and back, forever. Used for anything that should read as ongoing
 * menace rather than as a one-off event.
 */
export function telegraphPulse(elapsedMs: number): number {
  const phase = (elapsedMs % TELEGRAPH_PERIOD_MS) / TELEGRAPH_PERIOD_MS;
  return (1 - Math.cos(phase * Math.PI * 2)) / 2;
}

/**
 * How strongly a boss reads as dangerous, held steady when motion is off.
 *
 * Reduced motion silences movement, not meaning. A player who has asked the
 * system not to animate things still has to be able to tell a boss from a
 * Goblin, so the telegraph stops breathing and holds at a legible tint rather
 * than disappearing. Anything that only conveys *when* — the recoil, the rise
 * on a damage number — stops outright, because its whole content is motion.
 */
export const STILL_TELEGRAPH = 0.18;

export function telegraphStrength(elapsedMs: number, reducedMotion: boolean): number {
  return reducedMotion ? STILL_TELEGRAPH : telegraphPulse(elapsedMs) * TELEGRAPH_DEPTH;
}

/** How far the tint swings at full motion. */
export const TELEGRAPH_DEPTH = 0.28;

export function recoilOffset(ageMs: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : hitRecoil(ageMs);
}

/** How far a damage number travels over its life, at full motion. */
export const RISE_METRES = 1.1;

export function riseOffset(t: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : RISE_METRES * clamp01(t);
}
