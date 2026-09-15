import {
  UNIQUE_EFFECTS,
  clampUniqueRank,
  getUniqueEffectFamily,
  type HeroActiveSkillArchetypeId,
  type UniqueEffectFamily,
} from '../../content/uniqueEffects';
import type { HeroPassiveTraitId } from './heroPassives';

/**
 * Unique weapon relics: the last of the fourteen damage multipliers.
 *
 * A relic contributes only when it is both forged (rank above zero) and
 * equipped by a hero who is actually on the active team. The effect scales
 * linearly with rank inside a 1-10 clamp, and relics multiply against each
 * other, which is why the caps here are the loosest in the game — 40x dps.
 */

export interface RelicBearer {
  /** The hero template id the relic belongs to. */
  heroId: string;
  archetype: HeroActiveSkillArchetypeId;
  trait: HeroPassiveTraitId;
  rank: number;
  /** False when the relic is forged but sitting in the armoury. */
  equipped: boolean;
  /** False when its bearer is not on the active team. */
  bearerActive: boolean;
}

export interface RelicResult {
  dpsMult: number;
  goldMult: number;
  expMult: number;
  incomingDmgMult: number;
  /** Which relics actually contributed, for a UI that explains the number. */
  contributing: string[];
}

export const RELIC_DPS_CAP = 40;
export const RELIC_GOLD_CAP = 6;
export const RELIC_EXP_CAP = 6;
export const RELIC_INCOMING_FLOOR = 0.3;
/** Per-relic mitigation floor, applied before relics are multiplied together. */
export const RELIC_PER_EFFECT_INCOMING_FLOOR = 0.5;

export interface RelicModifiers {
  dpsMult: number;
  goldMult: number;
  expMult: number;
  incomingDmgMult: number;
}

/** One relic's contribution at a given rank. */
export function getRelicModifiers(family: UniqueEffectFamily, rank: number): RelicModifiers {
  const safeRank = clampUniqueRank(rank);
  const e = UNIQUE_EFFECTS[family];

  const dpsBonusPct = e.dpsBasePct + e.dpsPerRankPct * safeRank;
  const goldBonusPct = e.goldBasePct + e.goldPerRankPct * safeRank;
  const expBonusPct = e.expBasePct + e.expPerRankPct * safeRank;
  const mitigationPct = e.mitigationBasePct + e.mitigationPerRankPct * safeRank;

  return {
    dpsMult: 1 + dpsBonusPct / 100,
    goldMult: 1 + goldBonusPct / 100,
    expMult: 1 + expBonusPct / 100,
    incomingDmgMult: Math.max(RELIC_PER_EFFECT_INCOMING_FLOOR, 1 - mitigationPct / 100),
  };
}

export function getRelicModifiersForHero(
  archetype: HeroActiveSkillArchetypeId,
  trait: HeroPassiveTraitId,
  rank: number,
): RelicModifiers {
  return getRelicModifiers(getUniqueEffectFamily(archetype, trait), rank);
}

/** Whether a relic is in a position to do anything at all. */
export function isRelicContributing(relic: RelicBearer): boolean {
  return relic.equipped && relic.bearerActive && relic.rank > 0;
}

export function getUniqueRelicMultipliers(relics: readonly RelicBearer[]): RelicResult {
  let dpsMult = 1;
  let goldMult = 1;
  let expMult = 1;
  let incomingDmgMult = 1;
  const contributing: string[] = [];

  for (const relic of relics) {
    if (!isRelicContributing(relic)) continue;

    const modifiers = getRelicModifiersForHero(relic.archetype, relic.trait, relic.rank);
    dpsMult *= modifiers.dpsMult;
    goldMult *= modifiers.goldMult;
    expMult *= modifiers.expMult;
    incomingDmgMult *= modifiers.incomingDmgMult;
    contributing.push(relic.heroId);
  }

  return {
    dpsMult: Math.min(RELIC_DPS_CAP, dpsMult),
    goldMult: Math.min(RELIC_GOLD_CAP, goldMult),
    expMult: Math.min(RELIC_EXP_CAP, expMult),
    incomingDmgMult: Math.max(RELIC_INCOMING_FLOOR, incomingDmgMult),
    contributing,
  };
}
