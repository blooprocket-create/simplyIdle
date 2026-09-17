import type { UniqueSkillType } from '../../content/heroSkills';
import type { HeroActiveSkillArchetypeId } from '../../content/uniqueEffects';

/**
 * What to call an ability on the bar, and what it does in four words.
 *
 * Copy rather than content, for the reason `ui/copy/equipment.ts` is: the
 * engine may not read the catalogue and the catalogue carries no prose, so the
 * words a player reads live with the thing that renders them.
 *
 * The names are short because the bar is six buttons wide on a phone. The
 * hints are not: they are the only place the game says what a skill *does*,
 * and a team has been casting these four archetypes since the fight began
 * with nothing on screen naming any of them.
 */

export const ARCHETYPE_NAME: Record<HeroActiveSkillArchetypeId, string> = {
  frontline_ward: 'Ward',
  burst_volley: 'Volley',
  battle_chant: 'Chant',
  mending_pulse: 'Mend',
};

export const ARCHETYPE_HINT: Record<HeroActiveSkillArchetypeId, string> = {
  frontline_ward: 'Takes a fifth less damage',
  burst_volley: 'Hits for a share of the foe',
  battle_chant: 'The team hits harder',
  mending_pulse: 'Heals the team',
};

export const UNIQUE_NAME: Record<UniqueSkillType, string> = {
  shield_wall: 'Shield wall',
  execute: 'Execute',
  rallying_cry: 'Rallying cry',
  soul_drain: 'Soul drain',
  crit_storm: 'Crit storm',
  mark_prey: 'Mark prey',
  chain_lightning: 'Chain lightning',
  barrier_pulse: 'Barrier pulse',
  armor_shred: 'Armour shred',
  overcharge: 'Overcharge',
};

export const UNIQUE_HINT: Record<UniqueSkillType, string> = {
  shield_wall: 'Blunts what lands',
  execute: 'Worst for a wounded foe',
  rallying_cry: 'Harder hits, and a heal',
  soul_drain: 'Damage, half of it healed back',
  crit_storm: 'Five hits at once',
  mark_prey: 'The team hits harder',
  chain_lightning: 'Damage, and harder hits after',
  barrier_pulse: 'A heal, and a shield behind it',
  armor_shred: 'The team hits harder',
  overcharge: 'A heavy hit',
};
