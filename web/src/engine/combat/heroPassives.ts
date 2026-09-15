/**
 * Hero passive traits: a small always-on bonus each hero contributes just by
 * being on the active team.
 *
 * Four traits, one multiplier each, multiplied per hero carrying it — so the
 * bonus is in how many of a trait you field, not which hero carries it. The
 * caps exist because that stacking is geometric and a roster is not bounded.
 */

export type HeroPassiveTraitId = 'bulwark_instinct' | 'warpath_instinct' | 'fortune_hunter' | 'sage_instinct';

/** Per-hero contribution of each trait. */
export const PASSIVE_TRAIT_EFFECT = {
  warpath_instinct: { dps: 1.03 },
  fortune_hunter: { gold: 1.04 },
  sage_instinct: { exp: 1.03 },
  bulwark_instinct: { incoming: 0.98 },
} as const;

export const PASSIVE_DPS_CAP = 12;
export const PASSIVE_GOLD_CAP = 4;
export const PASSIVE_EXP_CAP = 4;
export const PASSIVE_INCOMING_FLOOR = 0.35;

export interface HeroPassiveResult {
  dpsMult: number;
  goldMult: number;
  expMult: number;
  incomingDmgMult: number;
}

export function getHeroPassiveMultipliers(team: readonly { passiveTrait: HeroPassiveTraitId }[]): HeroPassiveResult {
  let dpsMult = 1;
  let goldMult = 1;
  let expMult = 1;
  let incomingDmgMult = 1;

  for (const hero of team) {
    switch (hero.passiveTrait) {
      case 'warpath_instinct':
        dpsMult *= PASSIVE_TRAIT_EFFECT.warpath_instinct.dps;
        break;
      case 'fortune_hunter':
        goldMult *= PASSIVE_TRAIT_EFFECT.fortune_hunter.gold;
        break;
      case 'sage_instinct':
        expMult *= PASSIVE_TRAIT_EFFECT.sage_instinct.exp;
        break;
      case 'bulwark_instinct':
        incomingDmgMult *= PASSIVE_TRAIT_EFFECT.bulwark_instinct.incoming;
        break;
    }
  }

  return {
    dpsMult: Math.min(PASSIVE_DPS_CAP, dpsMult),
    goldMult: Math.min(PASSIVE_GOLD_CAP, goldMult),
    expMult: Math.min(PASSIVE_EXP_CAP, expMult),
    incomingDmgMult: Math.max(PASSIVE_INCOMING_FLOOR, incomingDmgMult),
  };
}
