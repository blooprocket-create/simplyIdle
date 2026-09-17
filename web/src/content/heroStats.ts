import type { PlayerClass } from './classes';
import type { HeroPassiveTraitId } from '../engine/combat/heroPassives';
import type { HeroActiveSkillArchetypeId } from './uniqueEffects';

/**
 * Per-hero stat derivation: class profile x tier x an individual variance
 * derived from the hero's own id.
 *
 * The variance is why two heroes of the same class and tier are not
 * interchangeable, and why it has to be deterministic — it is effectively
 * authored data computed at load rather than stored, so any change to the
 * hash silently rerolls all 66 heroes.
 */

export interface StatSpread {
  str: number;
  int: number;
  agi: number;
  vit: number;
  spr: number;
}

export interface HeroStatProfile {
  baseStats: StatSpread;
  statGrowth: StatSpread;
}

export interface HeroTemplate {
  id: string;
  name: string;
  heroClass: PlayerClass;
  emoji: string;
  baseTeamBoost: number;
  tier: 1 | 2 | 3 | 4 | 5;
  /**
   * The two authored fields `heroes.ts` used to leave behind.
   *
   * Its note said they "describe verbs no phase has built yet" and that
   * carrying data nothing reads is how the previous config reached four
   * thousand lines. That was right at the time and is not now:
   * `getHeroPassiveMultipliers` reads the trait and `getUniqueRelicMultipliers`
   * reads the archetype, both are fixture-tested, and both were uncallable
   * from a real roster because the catalogue did not carry the fields they
   * take.
   *
   * Transcribed from `__fixtures__/unique-relics.json`, which already records
   * every hero's pair from the shipped source — so the sixty-five rows are
   * generated and then checked against the same file rather than typed.
   */
  passiveTrait: HeroPassiveTraitId;
  activeSkillArchetype: HeroActiveSkillArchetypeId;
}

export const HERO_CLASS_STAT_PROFILE: Record<PlayerClass, HeroStatProfile> = {
  warrior: {
    baseStats: { str: 12, int: 4, agi: 6, vit: 10, spr: 5 },
    statGrowth: { str: 1.1, int: 0.3, agi: 0.5, vit: 0.9, spr: 0.4 },
  },
  berserker: {
    baseStats: { str: 14, int: 3, agi: 8, vit: 6, spr: 4 },
    statGrowth: { str: 1.3, int: 0.2, agi: 0.7, vit: 0.4, spr: 0.3 },
  },
  archer: {
    baseStats: { str: 6, int: 5, agi: 13, vit: 5, spr: 7 },
    statGrowth: { str: 0.5, int: 0.4, agi: 1.2, vit: 0.4, spr: 0.5 },
  },
  mage: {
    baseStats: { str: 3, int: 14, agi: 5, vit: 4, spr: 10 },
    statGrowth: { str: 0.2, int: 1.3, agi: 0.4, vit: 0.3, spr: 0.9 },
  },
  monk: {
    baseStats: { str: 7, int: 8, agi: 9, vit: 8, spr: 9 },
    statGrowth: { str: 0.6, int: 0.7, agi: 0.8, vit: 0.7, spr: 0.8 },
  },
};

/** Higher-tier heroes have stronger bases and scale faster. */
export const TIER_GROWTH_MULT: Record<number, number> = {
  1: 1.0,
  2: 1.15,
  3: 1.35,
  4: 1.6,
  5: 2.0,
};

/**
 * A stable 0.85-1.15 factor per (hero, stat) — the djb2-style string hash the
 * shipped game uses, kept exactly.
 *
 * It is authored data computed at load rather than stored, so the hash *is*
 * 65 heroes' identities: changing the multiplier or the 0.3 band rerolls all
 * of them, and `heroDamage.test.ts` fails on either. The `| 0` is the one part
 * that turns out to be redundant — `<<` already truncates to int32 each round
 * and the final `& 0xffff` truncates again, so removing it changes nothing for
 * any hero id, long or short. It stays because it is what shipped, not because
 * it does anything.
 */
export function heroStatVariance(heroId: string, statKey: string): number {
  let hash = 0;
  const seed = heroId + statKey;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return 0.85 + ((hash & 0xffff) / 0xffff) * 0.3;
}

export function getHeroStatProfile(hero: HeroTemplate): HeroStatProfile {
  const profile = HERO_CLASS_STAT_PROFILE[hero.heroClass];
  const tierMult = TIER_GROWTH_MULT[hero.tier] ?? 1;
  const v = (stat: keyof StatSpread) => heroStatVariance(hero.id, stat);

  const scale = (spread: StatSpread): StatSpread => ({
    str: spread.str * v('str') * tierMult,
    int: spread.int * v('int') * tierMult,
    agi: spread.agi * v('agi') * tierMult,
    vit: spread.vit * v('vit') * tierMult,
    spr: spread.spr * v('spr') * tierMult,
  });

  return {
    baseStats: scale(profile.baseStats),
    statGrowth: scale(profile.statGrowth),
  };
}
