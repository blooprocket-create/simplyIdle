import { getClassPassive } from '../../content/classPassives';
import type { PlayerClass } from '../../content/classes';
import {
  derivedStats,
  getMetaSurvivalMultiplier,
  getRebirthSurvivalMultiplier,
  heroSpirit,
  heroVitality,
  type HealthHero,
} from '../character/stats';
import type { StatBlock } from '../save/schema';
import { getFormationMultipliers, type FormationHero } from './formation';
import { getHeroPassiveMultipliers, type HeroPassiveTraitId } from './heroPassives';
import { getTacticsPowerMultiplier } from './progressionMultipliers';
import { getTeamSynergy } from './synergy';
import { getUniqueRelicMultipliers, type RelicBearer } from './uniqueRelics';

/**
 * Everything between a monster's damage and the health the team loses.
 *
 * The rewrite had none of it. `demoSimulationOptions` handed the loop a flat
 * `incomingMult: 1` — the team taking a monster's damage raw, with no defence,
 * no formation bonus, no synergy, no hero passives and no relics. Measured
 * against the shipped chain that is up to **ten times** too much damage taken:
 * a deep account's multiplier is 0.10 and even a bare level-one warrior's is
 * 0.97. The port's fight was harder than the game, and the wall arrived early.
 *
 * Nothing anchored the chain before `__fixtures__/mitigation.json`. The other
 * multiplier fixtures all read through `getDpsBreakdown`, which reports damage
 * only — the synergy fixture's own note says as much — so this one measures the
 * composed scalar off the real combat step instead.
 *
 * **Defence and health are not the same stack**, which is the trap here. Both
 * scale by meta survival, the rebirth path, formation, synergy and the tactics
 * facility — and health also takes class mastery, while defence does not.
 * Sharing one function between them would quietly hand the player a mastery
 * bonus the shipped game does not give.
 */

/** Defence from the player's own stats. Vitality leads, spirit follows. */
const PLAYER_DEFENSE_FROM_VITALITY = 0.3;
const PLAYER_DEFENSE_FROM_SPIRIT = 0.15;

/** A hero contributes less of each than the player does. */
const HERO_DEFENSE_FROM_VITALITY = 0.2;
const HERO_DEFENSE_FROM_SPIRIT = 0.1;

/** Defence is halved at 100, and never removes more than four fifths. */
export const DEFENSE_HALF_POINT = 100;
export const DEFENSE_REDUCTION_CAP = 0.8;

/** The most a temporary buff may take off, before it is applied. */
export const REDUCTION_BUFF_CAP = 0.7;

export interface TeamDefenseInput {
  playerClass: PlayerClass | null;
  alloc: StatBlock;
  /** Phase 9's, as an argument so that phase adds a caller rather than an edit. */
  equipment?: StatBlock;
  activeHeroes: readonly HealthHero[];
  metaSurvivalLevel: number;
  rebirthSurvivalPath: number;
  tacticsFacilityLevel: number;
}

/**
 * The team's defence: a raw number, not a multiplier.
 *
 * Floored at zero rather than left to go negative, as shipped. A negative
 * defence would make `defense / (defense + 100)` a *negative* reduction, and
 * the monster would hit harder for the team having stats.
 */
export function teamDefense(input: TeamDefenseInput): number {
  const stats = derivedStats(input.playerClass, input.alloc, input.equipment);
  let defense = stats.vitality * PLAYER_DEFENSE_FROM_VITALITY + stats.spirit * PLAYER_DEFENSE_FROM_SPIRIT;

  for (const hero of input.activeHeroes) {
    defense += heroVitality(hero) * HERO_DEFENSE_FROM_VITALITY + heroSpirit(hero) * HERO_DEFENSE_FROM_SPIRIT;
  }

  return Math.max(
    0,
    defense *
      getMetaSurvivalMultiplier(input.metaSurvivalLevel) *
      getRebirthSurvivalMultiplier(input.rebirthSurvivalPath) *
      getFormationMultipliers(input.activeHeroes).hpMult *
      getTeamSynergy(input.activeHeroes).hpMult *
      getTacticsPowerMultiplier(input.tacticsFacilityLevel).toNumber(),
  );
}

/**
 * What fraction of a hit defence removes.
 *
 * A hyperbola, so the first hundred points are worth as much as the next
 * thousand — and capped at four fifths, which a deep account reaches and then
 * gains nothing further from. A port that dropped the cap would make defence
 * the only stat worth having.
 */
export function damageReduction(defense: number): number {
  const safe = Math.max(0, defense);
  return Math.min(DEFENSE_REDUCTION_CAP, safe / (safe + DEFENSE_HALF_POINT));
}

export interface IncomingInput {
  defense: number;
  playerClass: PlayerClass | null;
  /** Act one's boss clears this. The class passive is off until then. */
  classPassiveUnlocked: boolean;
  /** The fielded team: their passives, their ranks and their classes. */
  team: readonly (FormationHero & { passiveTrait: HeroPassiveTraitId })[];
  relics: readonly RelicBearer[];
  /** A temporary reduction, as a fraction. Clamped before it is applied. */
  damageReductionBuffPct: number;
}

/**
 * The whole chain, as one multiplier on a monster's damage.
 *
 * Seven factors in the shipped order. The class passive is the one that can go
 * the *wrong* way — a berserker's is 1.05, so their passive makes them take
 * more — and a port that assumed every passive helps would quietly buff the
 * one class built around not being safe.
 */
export function incomingMultiplier(input: IncomingInput): number {
  const passive =
    input.classPassiveUnlocked && input.playerClass ? getClassPassive(input.playerClass).incomingDamageMultiplier : 1;
  const buff = 1 - Math.max(0, Math.min(REDUCTION_BUFF_CAP, input.damageReductionBuffPct));

  return (
    (1 - damageReduction(input.defense)) *
    passive *
    getHeroPassiveMultipliers(input.team).incomingDmgMult *
    getUniqueRelicMultipliers(input.relics).incomingDmgMult *
    getFormationMultipliers(input.team).incomingMult *
    getTeamSynergy(input.team).incomingMult *
    buff
  );
}
