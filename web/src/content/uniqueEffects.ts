import type { HeroPassiveTraitId } from '../engine/combat/heroPassives';

/**
 * Unique weapon effect families.
 *
 * A hero's family is decided by their active skill archetype crossed with
 * their passive trait — a 4x4 matrix over 14 distinct families, because the
 * three sage_instinct cells outside burst_volley all resolve to `chronicle`.
 *
 * The parameters below were read back out of the shipped
 * `getHeroUniqueCombatModifiers` by solving `pct = base + perRank * rank` at
 * two ranks, rather than transcribed from the 121-line table by hand. The
 * fixture then checks all 65 heroes against the original, so a transcription
 * error could not survive either way.
 */

export type HeroActiveSkillArchetypeId = 'frontline_ward' | 'burst_volley' | 'battle_chant' | 'mending_pulse';

export type UniqueEffectFamily =
  | 'bastion'
  | 'convoy'
  | 'onslaught'
  | 'phalanx'
  | 'command'
  | 'cataclysm'
  | 'judgment'
  | 'ambush'
  | 'execution'
  | 'oracle'
  | 'sanctuary'
  | 'harvest'
  | 'spellfire'
  | 'chronicle';

export interface UniqueEffect {
  dpsBasePct: number;
  dpsPerRankPct: number;
  goldBasePct: number;
  goldPerRankPct: number;
  expBasePct: number;
  expPerRankPct: number;
  mitigationBasePct: number;
  mitigationPerRankPct: number;
}

const effect = (
  dpsBasePct: number,
  dpsPerRankPct: number,
  rest: Partial<Omit<UniqueEffect, 'dpsBasePct' | 'dpsPerRankPct'>> = {},
): UniqueEffect => ({
  dpsBasePct,
  dpsPerRankPct,
  goldBasePct: 0,
  goldPerRankPct: 0,
  expBasePct: 0,
  expPerRankPct: 0,
  mitigationBasePct: 0,
  mitigationPerRankPct: 0,
  ...rest,
});

export const UNIQUE_EFFECTS: Record<UniqueEffectFamily, UniqueEffect> = {
  bastion: effect(10, 3.2, { mitigationBasePct: 9, mitigationPerRankPct: 1.8 }),
  convoy: effect(8, 2.8, {
    goldBasePct: 9,
    goldPerRankPct: 1.8,
    mitigationBasePct: 4,
    mitigationPerRankPct: 1.0,
  }),
  onslaught: effect(15, 4.4, { mitigationBasePct: 5, mitigationPerRankPct: 1.0 }),
  phalanx: effect(9, 3.0, { mitigationBasePct: 11, mitigationPerRankPct: 1.8 }),
  command: effect(11, 3.3, { goldBasePct: 6, goldPerRankPct: 1.5 }),
  cataclysm: effect(17, 4.8, { expBasePct: 3, expPerRankPct: 1.0 }),
  judgment: effect(14, 4.0, { mitigationBasePct: 3, mitigationPerRankPct: 0.8 }),
  ambush: effect(12, 3.5, { goldBasePct: 8, goldPerRankPct: 1.8 }),
  execution: effect(16, 4.6, { goldBasePct: 3, goldPerRankPct: 1.0 }),
  oracle: effect(11, 3.4, { expBasePct: 10, expPerRankPct: 2.0 }),
  sanctuary: effect(8, 2.8, {
    expBasePct: 6,
    expPerRankPct: 1.5,
    mitigationBasePct: 10,
    mitigationPerRankPct: 1.6,
  }),
  harvest: effect(7, 2.6, {
    goldBasePct: 11,
    goldPerRankPct: 2.2,
    expBasePct: 4,
    expPerRankPct: 1.0,
  }),
  spellfire: effect(13, 3.8, { expBasePct: 5, expPerRankPct: 1.2 }),
  chronicle: effect(9, 3.0, {
    expBasePct: 11,
    expPerRankPct: 2.2,
    mitigationBasePct: 6,
    mitigationPerRankPct: 1.1,
  }),
};

/**
 * The archetype x trait matrix. `chronicle` is the fallback and also the
 * explicit answer for two of the three non-burst sage cells, which is why 16
 * combinations yield 14 families.
 */
const FAMILY_MATRIX: Record<HeroActiveSkillArchetypeId, Record<HeroPassiveTraitId, UniqueEffectFamily>> = {
  frontline_ward: {
    bulwark_instinct: 'bastion',
    fortune_hunter: 'convoy',
    warpath_instinct: 'onslaught',
    sage_instinct: 'chronicle',
  },
  battle_chant: {
    bulwark_instinct: 'phalanx',
    fortune_hunter: 'command',
    warpath_instinct: 'cataclysm',
    sage_instinct: 'chronicle',
  },
  burst_volley: {
    bulwark_instinct: 'judgment',
    fortune_hunter: 'ambush',
    warpath_instinct: 'execution',
    sage_instinct: 'oracle',
  },
  mending_pulse: {
    bulwark_instinct: 'sanctuary',
    fortune_hunter: 'harvest',
    warpath_instinct: 'spellfire',
    // Not listed in the shipped resolver; reaches chronicle via its fallback.
    sage_instinct: 'chronicle',
  },
};

export function getUniqueEffectFamily(
  archetype: HeroActiveSkillArchetypeId,
  trait: HeroPassiveTraitId,
): UniqueEffectFamily {
  return FAMILY_MATRIX[archetype]?.[trait] ?? 'chronicle';
}

export const UNIQUE_RANK_MIN = 1;
export const UNIQUE_RANK_MAX = 10;

export function clampUniqueRank(rank: number): number {
  return Math.max(UNIQUE_RANK_MIN, Math.min(UNIQUE_RANK_MAX, Math.floor(rank)));
}
