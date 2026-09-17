/**
 * Prestige: the wall, the cores it pays out, and the two trees they buy.
 *
 * Every number here already reaches the fight. `prestigeCount` is in the
 * damage chain, `rebirthDamagePath` and its two siblings are in damage,
 * economy and survival, and the three meta levels are in all of them — the
 * rewrite has been reading the lot since Phase 5 and has had no way to move
 * any of it. This is the half that moves them.
 *
 * Costs live here once. The shipped tree has **two copies** of each formula —
 * one in `progressionReducer.ts`, which charges the player, and one in
 * `useGameState.ts`, which the screen quotes — with nothing keeping them in
 * step. They agree today; `__tests__/prestigeFixture.test.ts` pins that as a
 * tripwire, and this follows the reducer's, which is the one that decides what
 * a player is actually charged.
 */

/** The wave the first rebirth asks for. Compounds twelve percent a prestige. */
export const REBIRTH_WAVE_THRESHOLD = 100;

/** What each prestige multiplies damage by. Read by `progressionMultipliers`. */
export const REBIRTH_BONUS = 1.5;

export type PrestigePath = 'damage' | 'economy' | 'survival';
export const PRESTIGE_PATHS: readonly PrestigePath[] = ['damage', 'economy', 'survival'];

/**
 * How deep a run has to go before it can be reset.
 *
 * **Ceiled, and the ceiling bites immediately.** `100 * 1.12` is
 * 112.00000000000001 as a double, so the first wall is **113** rather than the
 * 112 the arithmetic promises. A port that accumulated 1.12 a step, or rounded
 * instead of ceiling, would put it a wave lower — and a player standing on 112
 * would be offered a rebirth the shipped game refuses.
 */
export function rebirthWaveRequirement(prestigeCount: number): number {
  const safe = Math.max(0, Math.floor(prestigeCount));
  return Math.max(1, Math.ceil(REBIRTH_WAVE_THRESHOLD * Math.pow(1.12, safe)));
}

/**
 * The cores a rebirth pays out.
 *
 * A base that grows a quarter per prestige, plus one for every *stride* of
 * wave past the wall — and the surplus term is most of the reward. A first
 * rebirth exactly at the wall pays one; the same rebirth three hundred waves
 * past it pays twenty-one. That is the whole shape of the decision: reset
 * early and often, or push and cash in.
 *
 * The stride has a floor of fifteen, so an early account is not asked for
 * five-wave increments it cannot feel.
 */
export function rebirthCoreGain(prestigeCount: number, highestWave: number): number {
  const requirement = rebirthWaveRequirement(prestigeCount);
  const surplusWaves = Math.max(0, Math.floor(highestWave) - requirement);
  const surplusStride = Math.max(15, Math.floor(requirement * 0.05));
  const base = 1 + Math.floor(Math.max(0, prestigeCount) * 0.25);
  return base + Math.floor(surplusWaves / surplusStride);
}

/** Whether the run has reached the wall. */
export function canRebirth(prestigeCount: number, highestWave: number): boolean {
  return Math.floor(highestWave) >= rebirthWaveRequirement(prestigeCount);
}

/**
 * What one step up a rebirth path costs, in cores.
 *
 * `1 + floor(level * 0.8) + floor(level² / 8)`. The quadratic term is what
 * stops a deep account buying out a path in a single rebirth: the first step
 * is one core and the fortieth is 233.
 */
export function rebirthPathCost(level: number): number {
  const safe = Math.max(0, Math.floor(level));
  return 1 + Math.floor(safe * 0.8) + Math.floor((safe * safe) / 8);
}

/**
 * What one meta level costs, in essence.
 *
 * A square rather than a curve: `20 + (level + 1)² × 12`, so level zero is 32
 * and level fifty is 31,232.
 */
export function essenceUpgradeCost(level: number): number {
  const safe = Math.max(0, Math.floor(level));
  return 20 + (safe + 1) * (safe + 1) * 12;
}

/** Season points a rebirth pays, whatever else it gives. */
export const REBIRTH_SEASON_POINTS = 250;
