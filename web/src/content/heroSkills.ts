import type { HeroActiveSkillArchetypeId } from './uniqueEffects';

/**
 * What a hero's ability does.
 *
 * Two layers, and the second is the one a port misses. Every hero has a
 * **generic archetype** skill — one of four — and a hero carrying their own
 * unique relic casts a **unique** skill instead, from a set of ten, scaled by
 * the relic's rank. A relic is therefore not a stat bonus with a name: it
 * replaces the hero's ability, and a build that treated relics as stats alone
 * would leave this whole table unreachable.
 *
 * Generated out of `__fixtures__/hero-actives.json` rather than typed, and
 * `heroSkills.test.ts` checks every row back against it. Sixty-five rows of
 * type, power, duration and cooldown is more transcription than anybody reads
 * carefully.
 *
 * `power` is the rank-one value. `engine/combat/heroActives.ts` applies the
 * twelve-percent-a-rank scaling, because that is a rule rather than content.
 */

export const UNIQUE_SKILL_TYPES = [
  'shield_wall',
  'execute',
  'rallying_cry',
  'soul_drain',
  'crit_storm',
  'mark_prey',
  'chain_lightning',
  'barrier_pulse',
  'armor_shred',
  'overcharge',
] as const;
export type UniqueSkillType = (typeof UNIQUE_SKILL_TYPES)[number];

export interface UniqueSkill {
  type: UniqueSkillType;
  /** At rank one. Scaled by rank where it is used. */
  power: number;
  /** Zero for an instant skill, which is most of the damaging ones. */
  durationMs: number;
  cooldownMs: number;
}

/**
 * How long each generic archetype waits between casts.
 *
 * Every one is its own number — ten seconds down to six — and that is the
 * balance lever: sharing one across the four would make the shield as
 * available as the heal.
 */
export const ARCHETYPE_COOLDOWN_MS: Readonly<Record<HeroActiveSkillArchetypeId, number>> = {
  frontline_ward: 10000,
  burst_volley: 7000,
  battle_chant: 9000,
  mending_pulse: 6000,
};

/** `mending_pulse` is the one archetype that reads the hero's level. */
export const MENDING_PULSE_BASE_HEAL = 0.08;
export const MENDING_PULSE_LEVEL_SCALE = 0.0004;
/** And the one with a ceiling: a level-425 healer stops getting better. */
export const MENDING_PULSE_MAX_HEAL = 0.25;

/** The unique skill each hero's relic grants, or null where there is none. */
export const UNIQUE_SKILL_BY_HERO: Readonly<Record<string, UniqueSkill | null>> = {
  h1: { type: 'shield_wall', power: 0.3, durationMs: 4000, cooldownMs: 10000 },
  h2: { type: 'barrier_pulse', power: 0.1, durationMs: 3500, cooldownMs: 9000 },
  h3: { type: 'armor_shred', power: 0.2, durationMs: 4000, cooldownMs: 8000 },
  h4: { type: 'rallying_cry', power: 0.2, durationMs: 4000, cooldownMs: 9000 },
  h5: { type: 'crit_storm', power: 0.06, durationMs: 0, cooldownMs: 7000 },
  h6: { type: 'execute', power: 0.12, durationMs: 0, cooldownMs: 7000 },
  h7: { type: 'barrier_pulse', power: 0.12, durationMs: 3500, cooldownMs: 6000 },
  h8: { type: 'chain_lightning', power: 0.1, durationMs: 3000, cooldownMs: 7000 },
  h9: { type: 'shield_wall', power: 0.25, durationMs: 4500, cooldownMs: 8000 },
  h10: { type: 'barrier_pulse', power: 0.1, durationMs: 4000, cooldownMs: 8000 },
  h11: { type: 'shield_wall', power: 0.35, durationMs: 4000, cooldownMs: 10000 },
  h12: { type: 'soul_drain', power: 0.08, durationMs: 0, cooldownMs: 7000 },
  h13: { type: 'mark_prey', power: 0.22, durationMs: 4000, cooldownMs: 8000 },
  h14: { type: 'barrier_pulse', power: 0.12, durationMs: 4000, cooldownMs: 6000 },
  h15: { type: 'rallying_cry', power: 0.2, durationMs: 4500, cooldownMs: 9000 },
  h16: { type: 'shield_wall', power: 0.3, durationMs: 3800, cooldownMs: 9500 },
  h17: { type: 'rallying_cry', power: 0.22, durationMs: 4200, cooldownMs: 9000 },
  h18: { type: 'mark_prey', power: 0.2, durationMs: 4000, cooldownMs: 8000 },
  h19: { type: 'crit_storm', power: 0.06, durationMs: 0, cooldownMs: 6500 },
  h20: { type: 'execute', power: 0.12, durationMs: 0, cooldownMs: 7000 },
  h21: { type: 'overcharge', power: 0.15, durationMs: 0, cooldownMs: 8000 },
  h22: { type: 'chain_lightning', power: 0.1, durationMs: 3000, cooldownMs: 7000 },
  h23: { type: 'chain_lightning', power: 0.08, durationMs: 3500, cooldownMs: 7000 },
  h24: { type: 'barrier_pulse', power: 0.1, durationMs: 4000, cooldownMs: 6000 },
  h25: { type: 'armor_shred', power: 0.2, durationMs: 3500, cooldownMs: 8000 },
  h26: { type: 'rallying_cry', power: 0.2, durationMs: 4000, cooldownMs: 9000 },
  h27: { type: 'overcharge', power: 0.18, durationMs: 0, cooldownMs: 7500 },
  h28: { type: 'mark_prey', power: 0.22, durationMs: 4000, cooldownMs: 7500 },
  h29: { type: 'barrier_pulse', power: 0.12, durationMs: 4000, cooldownMs: 6000 },
  h30: { type: 'shield_wall', power: 0.25, durationMs: 4500, cooldownMs: 9000 },
  h31: { type: 'armor_shred', power: 0.22, durationMs: 4000, cooldownMs: 8500 },
  h32: { type: 'shield_wall', power: 0.3, durationMs: 4000, cooldownMs: 9000 },
  h33: { type: 'crit_storm', power: 0.07, durationMs: 0, cooldownMs: 6500 },
  h34: { type: 'overcharge', power: 0.18, durationMs: 0, cooldownMs: 7500 },
  h35: { type: 'crit_storm', power: 0.07, durationMs: 0, cooldownMs: 6500 },
  h36: { type: 'mark_prey', power: 0.25, durationMs: 4500, cooldownMs: 7500 },
  h37: { type: 'soul_drain', power: 0.1, durationMs: 0, cooldownMs: 7000 },
  h38: { type: 'mark_prey', power: 0.22, durationMs: 4000, cooldownMs: 7500 },
  h39: { type: 'shield_wall', power: 0.28, durationMs: 4000, cooldownMs: 9000 },
  h40: { type: 'barrier_pulse', power: 0.12, durationMs: 4000, cooldownMs: 6000 },
  h41: { type: 'soul_drain', power: 0.12, durationMs: 0, cooldownMs: 7000 },
  h42: { type: 'rallying_cry', power: 0.25, durationMs: 4500, cooldownMs: 8500 },
  h43: { type: 'execute', power: 0.15, durationMs: 0, cooldownMs: 6500 },
  h44: { type: 'armor_shred', power: 0.25, durationMs: 4000, cooldownMs: 8000 },
  h45: { type: 'overcharge', power: 0.2, durationMs: 0, cooldownMs: 7000 },
  h46: { type: 'execute', power: 0.15, durationMs: 0, cooldownMs: 7000 },
  h47: { type: 'barrier_pulse', power: 0.15, durationMs: 4500, cooldownMs: 6000 },
  h48: { type: 'chain_lightning', power: 0.12, durationMs: 3500, cooldownMs: 6500 },
  h49: { type: 'overcharge', power: 0.2, durationMs: 0, cooldownMs: 7000 },
  h50: { type: 'rallying_cry', power: 0.25, durationMs: 4500, cooldownMs: 7000 },
  h51: { type: 'armor_shred', power: 0.3, durationMs: 4500, cooldownMs: 8000 },
  h52: { type: 'rallying_cry', power: 0.28, durationMs: 5000, cooldownMs: 8000 },
  h53: { type: 'crit_storm', power: 0.1, durationMs: 0, cooldownMs: 6000 },
  h54: { type: 'mark_prey', power: 0.3, durationMs: 5000, cooldownMs: 7500 },
  h55: { type: 'execute', power: 0.18, durationMs: 0, cooldownMs: 6500 },
  h56: { type: 'soul_drain', power: 0.14, durationMs: 0, cooldownMs: 6500 },
  h57: { type: 'barrier_pulse', power: 0.18, durationMs: 5000, cooldownMs: 5500 },
  h58: { type: 'chain_lightning', power: 0.15, durationMs: 4000, cooldownMs: 6000 },
  h59: { type: 'rallying_cry', power: 0.28, durationMs: 5000, cooldownMs: 8000 },
  h60: { type: 'shield_wall', power: 0.4, durationMs: 5000, cooldownMs: 9000 },
  h61: { type: 'armor_shred', power: 0.35, durationMs: 5000, cooldownMs: 7500 },
  h62: { type: 'overcharge', power: 0.3, durationMs: 0, cooldownMs: 6000 },
  h63: { type: 'soul_drain', power: 0.18, durationMs: 0, cooldownMs: 6000 },
  h64: { type: 'chain_lightning', power: 0.18, durationMs: 4500, cooldownMs: 5500 },
  h65: { type: 'barrier_pulse', power: 0.2, durationMs: 5000, cooldownMs: 5500 },
};

export function uniqueSkillFor(heroId: string): UniqueSkill | null {
  return UNIQUE_SKILL_BY_HERO[heroId] ?? null;
}
