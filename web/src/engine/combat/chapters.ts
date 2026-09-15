/**
 * Chapters, and where a defeat leaves you.
 *
 * Lives here rather than inside the offline estimator because the live
 * simulation needs exactly the same rule. Two copies of "where does a wipe
 * send you" is how online and offline progression quietly stop describing the
 * same game — which is precisely the divergence this module was extracted to
 * close.
 */

/** Waves per chapter. A defeat retreats to the start of the current one. */
export const CHAPTER_WAVES = 20;

export function chapterStartWave(wave: number): number {
  return Math.floor((Math.max(1, wave) - 1) / CHAPTER_WAVES) * CHAPTER_WAVES + 1;
}

/**
 * Where a defeat at `wave` leaves you. Standing on a chapter start when you
 * lose costs a further chapter, so the wave you retreat *from* matters.
 */
export function retreatWave(wave: number): number {
  const start = chapterStartWave(wave);
  return wave === start && start > 1 ? Math.max(1, start - CHAPTER_WAVES) : start;
}
