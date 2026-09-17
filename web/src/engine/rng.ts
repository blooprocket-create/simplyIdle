/**
 * A reproducible generator, for callers who need randomness and determinism.
 *
 * The engine takes `random: () => number` everywhere rather than reaching for
 * `Math.random`, and `engine/architecture.test.ts` holds it to that. But a
 * default still has to be *something*, and `Math.random` is the wrong
 * something: a `Simulation` built without an explicit generator would roll a
 * different campaign every run, and the parity suite compares two models of the
 * same one.
 *
 * So the default is this. A fight with no generator supplied still drops
 * chests — a silent nothing would be the "ported and uncalled" failure again —
 * and drops the same ones twice.
 *
 * The constants are Numerical Recipes' LCG, which is what the summon and
 * equipment fixtures script their draws with. Shared so a seeded run here and a
 * seeded roll there are the same sequence rather than two nearly-alike ones.
 */
export const LCG_MULTIPLIER = 1_664_525;
export const LCG_INCREMENT = 1_013_904_223;

export function seededRandom(seed = 0x9e3779b9): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, LCG_MULTIPLIER) + LCG_INCREMENT) >>> 0;
    return value / 0x100000000;
  };
}
