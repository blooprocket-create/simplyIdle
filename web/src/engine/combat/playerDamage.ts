import { getClassProfile, type PlayerClass } from '../../content/classes';
import { derivedStats } from '../character/stats';
import type { StatBlock } from '../save/schema';

/**
 * The player's own damage.
 *
 * The rewrite forgot them. `getDpsBreakdown` adds `playerDps` to the hero total
 * *before* any multiplier — `(playerDps + heroDps) * totalMultiplier` — and
 * nothing in this tree computed it, so a character's class, level and every
 * stat point they had ever spent did nothing to the damage they dealt. Only
 * their heroes fought.
 *
 * It is not a small term either: a level-one warrior with nothing spent deals
 * 24.6, against about 9 for a level-one common hero. The player is most of a
 * new account's damage.
 *
 * The constants are the shipped ones, and they are *not* the hero constants —
 * `heroDamage.ts` uses 2 / 1.2 / 0.5 and 0.4 / 0.3 / 2, this uses 3.2 / 1.6 and
 * 0.72 / 0.52 / 1.85. Two similar formulas with different numbers is exactly
 * the shape a port collapses into one by accident.
 */

const PHYS_FROM_STR = 3.2;
const PHYS_FROM_AGI_BASE = 1.6;
const PHYS_FROM_AGI_PER_WEIGHT = 0.95;
const PHYS_FROM_LEVEL = 1.6;

const MAGIC_FROM_INT_BASE = 2;
const MAGIC_FROM_INT_PER_WEIGHT = 1.2;
const MAGIC_FROM_SPR_BASE = 1.3;
const MAGIC_FROM_SPR_PER_WEIGHT = 0.75;
const MAGIC_FROM_LEVEL = 1.2;

const PHYS_CONTRIBUTION = 0.72;
const MAGIC_CONTRIBUTION = 0.52;
const DAMAGE_DIVISOR = 1.85;

export interface PlayerDamageInput {
  playerClass: PlayerClass | null;
  level: number;
  alloc: StatBlock;
  /** Phase 9's, and an argument so that phase adds a caller rather than an edit. */
  equipment?: StatBlock;
}

/**
 * How much the player contributes per second, before any multiplier.
 *
 * The class weights appear **four times** between the two halves, and not as a
 * single factor: agility's physical value and both magical stats' values scale
 * with them as well. A port that applied `physWeight` only at the end would
 * agree for a warrior and disagree for everyone else.
 *
 * A null class reads as a warrior, the same default `derivedStats` takes, so a
 * save caught mid-character-creation deals a warrior's damage rather than none.
 */
export function playerContribution(input: PlayerDamageInput): number {
  const profile = getClassProfile(input.playerClass ?? 'warrior');
  const stats = derivedStats(input.playerClass, input.alloc, input.equipment);
  const level = Math.max(0, input.level);

  const physical =
    stats.strength * PHYS_FROM_STR +
    stats.agility * (PHYS_FROM_AGI_BASE + profile.physWeight * PHYS_FROM_AGI_PER_WEIGHT) +
    level * PHYS_FROM_LEVEL;

  const magical =
    stats.intelligence * (MAGIC_FROM_INT_BASE + profile.magicWeight * MAGIC_FROM_INT_PER_WEIGHT) +
    stats.spirit * (MAGIC_FROM_SPR_BASE + profile.magicWeight * MAGIC_FROM_SPR_PER_WEIGHT) +
    level * MAGIC_FROM_LEVEL;

  return (
    (physical * profile.physWeight * PHYS_CONTRIBUTION + magical * profile.magicWeight * MAGIC_CONTRIBUTION) /
    DAMAGE_DIVISOR
  );
}
