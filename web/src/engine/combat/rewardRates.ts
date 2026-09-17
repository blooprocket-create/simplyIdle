import Decimal from 'break_eternity.js';
import { weeklyEventByWeek } from '../../content/weeklyEvents';
import { trainingExpMultiplierFor, treasuryGoldMultiplierFor } from '../prestige/facilities';
import { getHeroPassiveMultipliers } from './heroPassives';
import {
  getAchievementLegacyMultiplier,
  getClassMasteryLevel,
  getRebirthLegacyMultiplier,
  META_PER_LEVEL,
  REBIRTH_PATH_PER_LEVEL,
} from './progressionMultipliers';
import type { RewardRates } from './rewards';
import { getTeamSynergy } from './synergy';
import { getUniqueRelicMultipliers, type RelicBearer } from './uniqueRelics';
import type { PoweredHero } from './teamPower';

/**
 * The gold and EXP chains, assembled.
 *
 * `rewards.ts` has carried `FLAT_RATES = { goldMult: 1, expMult: 1 }` since
 * Phase 8 with a note saying the chain "is Phase 10's", and `Simulation` has
 * taken a `rates` option that **nothing ever supplied** — the seventh thing in
 * this rewrite built, tested and never handed over. Every player has been
 * earning at 1x while thirteen factors sat computed and unread.
 *
 * **Gold and EXP are not the same chain**, which is the finding the fixture
 * exists for. Four factors reach gold alone — prestige, the meta economy
 * level, the rebirth economy path and the treasury — and the training facility
 * reaches EXP alone. A single `rewardMult` is wrong in both directions at once.
 *
 * Shaped like `teamPower.ts` for the same reason: named factors first, then a
 * product in the shipped sequence, so a screen can say where a number came
 * from and a reader can check the order against `killMonster`.
 */

export const VIP_GOLD_PER_LEVEL = 0.025;
export const VIP_EXP_PER_LEVEL = 0.025;
/** One percent per five mastery levels, and never more than a quarter. */
export const MASTERY_ECONOMY_PER_LEVEL = 0.01;
export const MASTERY_ECONOMY_CAP = 0.25;
export const MASTERY_ECONOMY_LEVELS_PER_STEP = 5;

/** The account-wide half of the chain. The team supplies the rest. */
export interface EconomyState {
  prestigeCount: number;
  achievementCount: number;
  metaEconomyLevel: number;
  rebirthEconomyPath: number;
  classMasteryXp: number;
  vipLevel: number;
  trainingFacilityLevel: number;
  treasuryFacilityLevel: number;
  /** Which of the eight events is running. Its rotation is Phase 11's. */
  weeklyEventWeek: number;
}

export interface RewardInput {
  team: readonly PoweredHero[];
  relics: readonly RelicBearer[];
  economy: EconomyState;
}

/**
 * Mastery's economy bonus, which is **not** its damage bonus.
 *
 * A quarter at most, against the damage side's two fifths, and stepped every
 * five levels rather than every one. Measured at wave 7 a four percent bonus
 * rounds away entirely — the whole chain takes a single `Math.ceil` — so the
 * cap matters far more than the step does.
 */
export function masteryEconomyMultiplier(classMasteryXp: number): number {
  const level = getClassMasteryLevel(classMasteryXp);
  const stepped = Math.floor(level / MASTERY_ECONOMY_LEVELS_PER_STEP) * MASTERY_ECONOMY_PER_LEVEL;
  return 1 + Math.min(MASTERY_ECONOMY_CAP, stepped);
}

export function metaEconomyMultiplier(metaEconomyLevel: number): number {
  return 1 + metaEconomyLevel * META_PER_LEVEL;
}

export function rebirthEconomyMultiplier(rebirthEconomyPath: number): number {
  return 1 + rebirthEconomyPath * REBIRTH_PATH_PER_LEVEL;
}

export function vipGoldMultiplier(vipLevel: number): number {
  return 1 + Math.max(0, vipLevel) * VIP_GOLD_PER_LEVEL;
}

export function vipExpMultiplier(vipLevel: number): number {
  return 1 + Math.max(0, vipLevel) * VIP_EXP_PER_LEVEL;
}

/** Every factor, named, on whichever axis it reaches. */
export interface RewardMultipliers {
  /** Gold only. */
  rebirthLegacy: Decimal;
  metaEconomy: number;
  rebirthEconomyPath: number;
  treasuryFacility: number;
  masteryEconomy: number;
  /** EXP only. */
  trainingFacility: number;
  /** Both, at their own rates. */
  achievementLegacy: Decimal;
  heroPassivesGold: number;
  heroPassivesExp: number;
  uniqueRelicsGold: number;
  uniqueRelicsExp: number;
  synergyGold: number;
  synergyExp: number;
  vipGold: number;
  vipExp: number;
  weeklyGold: number;
  weeklyExp: number;
}

export function rewardMultipliers(input: RewardInput): RewardMultipliers {
  const passives = getHeroPassiveMultipliers(input.team);
  const relics = getUniqueRelicMultipliers(input.relics);
  const synergy = getTeamSynergy(input.team);
  const weekly = weeklyEventByWeek(input.economy.weeklyEventWeek);
  return {
    rebirthLegacy: getRebirthLegacyMultiplier(input.economy.prestigeCount),
    metaEconomy: metaEconomyMultiplier(input.economy.metaEconomyLevel),
    rebirthEconomyPath: rebirthEconomyMultiplier(input.economy.rebirthEconomyPath),
    treasuryFacility: treasuryGoldMultiplierFor(input.economy.treasuryFacilityLevel),
    masteryEconomy: masteryEconomyMultiplier(input.economy.classMasteryXp),
    trainingFacility: trainingExpMultiplierFor(input.economy.trainingFacilityLevel),
    achievementLegacy: getAchievementLegacyMultiplier(input.economy.achievementCount),
    heroPassivesGold: passives.goldMult,
    heroPassivesExp: passives.expMult,
    uniqueRelicsGold: relics.goldMult,
    uniqueRelicsExp: relics.expMult,
    synergyGold: synergy.goldMult,
    synergyExp: synergy.expMult,
    vipGold: vipGoldMultiplier(input.economy.vipLevel),
    vipExp: vipExpMultiplier(input.economy.vipLevel),
    weeklyGold: weekly.goldMultiplier,
    weeklyExp: weekly.expMultiplier,
  };
}

/**
 * The two products, in the shipped sequence.
 *
 * **The affix is missing on purpose.** `killMonster` runs it fourth, between
 * achievements and the meta economy; `killReward` applies it at the monster
 * instead, because the offline estimator and the live loop both look the
 * monster up rather than being handed one. So the product here is reassociated
 * against the shipped one, and float multiplication is not associative.
 *
 * The difference is a relative 1e-16 and survives the chain's single
 * `Math.ceil` only when the true product sits within that of an integer.
 * Every row the fixture measured is checked against this, which is the honest
 * bound on the claim: exact where it has been measured, and reassociated by an
 * amount that cannot move a kill by more than one gold where it has not.
 */
export function rewardRatesFrom(input: RewardInput): RewardRates {
  const factors = rewardMultipliers(input);
  const gold = factors.rebirthLegacy
    .mul(factors.achievementLegacy)
    .mul(factors.metaEconomy)
    .mul(factors.rebirthEconomyPath)
    .mul(factors.heroPassivesGold)
    .mul(factors.uniqueRelicsGold)
    .mul(factors.synergyGold)
    .mul(factors.masteryEconomy)
    .mul(factors.weeklyGold)
    .mul(factors.vipGold)
    .mul(factors.treasuryFacility);
  const exp = factors.achievementLegacy
    .mul(factors.heroPassivesExp)
    .mul(factors.uniqueRelicsExp)
    .mul(factors.synergyExp)
    .mul(factors.weeklyExp)
    .mul(factors.vipExp)
    .mul(factors.trainingFacility);
  return { goldMult: gold.toNumber(), expMult: exp.toNumber() };
}
