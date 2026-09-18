/**
 * The guildhall's four facilities, and what raising one costs.
 *
 * Two of them already reach the fight and have done for phases: the **tactics**
 * level multiplies team power in both the health and the defence chains, and
 * the **forge** level multiplies a crafted item's stat budget. Both have been
 * read out of the `legacy` bag since Phase 7 and Phase 9 respectively, with no
 * way to raise either. This is that way.
 *
 * `training` and `treasury` multiply EXP and gold. Neither reaches the fight
 * yet — the reward rates are one measured scalar apiece — so they are ported
 * and carried rather than connected, and the multipliers below say what they
 * would do.
 */

export const FACILITY_IDS = ['training', 'treasury', 'forge', 'tactics'] as const;
export type FacilityId = (typeof FACILITY_IDS)[number];

/** Nobody reaches it. Ported because it is the guard that stops the doubling. */
export const FACILITY_MAX_LEVEL = 999;

/**
 * The opening curve, per facility. Six authored steps, then a doubling.
 *
 * The forge is dearest and the treasury cheapest, which is the shape of the
 * choice rather than an accident: the facility that makes gold costs least to
 * raise.
 */
const FACILITY_OPENING_COSTS: Readonly<Record<FacilityId, readonly number[]>> = {
  training: [5_000, 12_000, 30_000, 75_000, 150_000, 300_000],
  treasury: [4_000, 10_000, 25_000, 60_000, 120_000, 250_000],
  forge: [6_000, 15_000, 40_000, 90_000, 180_000, 350_000],
  tactics: [5_000, 12_000, 30_000, 75_000, 150_000, 300_000],
};

/**
 * What the next level costs, in gold.
 *
 * Past the authored six it is `last × 2^n`, computed **closed-form** rather
 * than by multiplying in a loop — the shipped comment says that is to avoid
 * overflowing before `MAX_SAFE_INTEGER`, and a port that iterated would agree
 * everywhere except the very deep end, where nobody would notice until
 * somebody did.
 *
 * `Infinity` at the cap, which is what makes "cannot afford" the answer rather
 * than a crash.
 *
 * The shipped code also ends with `Number.isFinite(cost) ? cost : Infinity`,
 * which is not copied: it is a **no-op in every case**. The cap fires first for
 * any level that could overflow — 350,000 × 2^994 at level 999 is still a
 * finite double — and where the product genuinely does overflow it is already
 * `Infinity`, so the ternary returns its own input. A branch no input can
 * reach is a branch no test can hold to account.
 */
export function facilityUpgradeCost(facilityId: FacilityId, currentLevel: number): number {
  const safe = Math.max(0, Math.floor(currentLevel));
  if (safe >= FACILITY_MAX_LEVEL) return Infinity;

  const opening = FACILITY_OPENING_COSTS[facilityId];
  if (safe < opening.length) return opening[safe];

  const stepsAboveBase = safe - (opening.length - 1);
  return opening[opening.length - 1] * Math.pow(2, stepsAboveBase);
}

/*
 * The tactics and forge multipliers are deliberately **not** here.
 *
 * `getTacticsPowerMultiplier` is in `combat/progressionMultipliers.ts`, where
 * the health and defence chains already read it, and `forgeStatMultiplier` is
 * in `equipment/instance.ts`, where a craft already reads it. Restating either
 * next to its cost curve would be the exact fault this phase's fixture caught
 * in the shipped tree: two copies of one formula with nothing keeping them in
 * step, and a screen that quotes one while the engine uses the other.
 */

/** Five percent a level, on EXP. Not yet connected — see the header. */
export function trainingExpMultiplierFor(level: number): number {
  return 1 + Math.max(0, Math.floor(level)) * 0.05;
}

/** Two percent a level, on gold. Not yet connected — see the header. */
export function treasuryGoldMultiplierFor(level: number): number {
  return 1 + Math.max(0, Math.floor(level)) * 0.02;
}
