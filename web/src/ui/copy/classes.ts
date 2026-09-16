import { CLASS_PASSIVES } from '../../content/classPassives';
import type { ClassProfile, PlayerClass } from '../../content/classes';

/**
 * The words the engine deliberately does not carry.
 *
 * `content/classes.ts` keeps only what the simulation reads and says so: the
 * shipped `CLASSES` array "also carries names, emoji, fantasy blurbs and
 * per-stat advice strings, which are presentation and belong with the UI that
 * shows them". `classPassives.ts` says the same of its id, name and
 * description. This is that UI, so this is where they live.
 *
 * Splitting them costs one risk — the words and the numbers can disagree — so
 * the effect lines are written *from* the multipliers rather than beside them,
 * and a test insists each one quotes a figure.
 */

export interface ClassCopy {
  name: string;
  emoji: string;
  /** One line, for a roster row or a class picker. */
  blurb: string;
  passive: { name: string; effect: string };
}

/** Reads a multiplier as the player experiences it: "+18% damage". */
function asChange(multiplier: number, up: string, down: string): string {
  const percent = Math.round(Math.abs(multiplier - 1) * 100);
  if (percent === 0) return 'no change';
  return multiplier > 1 ? `+${percent}% ${up}` : `-${percent}% ${down}`;
}

function passiveEffect(playerClass: PlayerClass): string {
  const { dpsMultiplier, incomingDamageMultiplier } = CLASS_PASSIVES[playerClass];
  const damage = asChange(dpsMultiplier, 'damage', 'damage');
  // A multiplier *below* one on incoming damage is the good direction, so it
  // is read as mitigation rather than as a loss.
  const taken = asChange(incomingDamageMultiplier, 'damage taken', 'damage taken');
  return `${damage}, ${taken}`;
}

const CLASS_TEXT: Record<PlayerClass, Omit<ClassCopy, 'passive'> & { passiveName: string }> = {
  warrior: {
    name: 'Warrior',
    emoji: '🛡️',
    blurb: 'Holds the front rank and gives ground slowly.',
    passiveName: 'Bulwark',
  },
  berserker: {
    name: 'Berserker',
    emoji: '🪓',
    blurb: 'Trades safety for the highest damage in the line.',
    passiveName: 'Bloodlust',
  },
  archer: {
    name: 'Archer',
    emoji: '🏹',
    blurb: 'Strikes often from the back rank, and is fragile there.',
    passiveName: 'Keen Eye',
  },
  mage: {
    name: 'Mage',
    emoji: '🔮',
    blurb: 'Turns intelligence into damage nothing physical can match.',
    passiveName: 'Arcane Focus',
  },
  monk: {
    name: 'Monk',
    emoji: '🧘',
    blurb: 'Steadies the whole team more than any single swing does.',
    passiveName: 'Inner Calm',
  },
};

export const CLASS_COPY: Record<PlayerClass, ClassCopy> = Object.fromEntries(
  (Object.keys(CLASS_TEXT) as PlayerClass[]).map(playerClass => {
    const { passiveName, ...text } = CLASS_TEXT[playerClass];
    return [playerClass, { ...text, passive: { name: passiveName, effect: passiveEffect(playerClass) } }];
  }),
) as Record<PlayerClass, ClassCopy>;

export type StatKey = keyof ClassProfile['baseStats'];

export interface StatCopy {
  label: string;
  /** What spending a point here buys, in the player's terms. */
  effect: string;
}

export const STAT_COPY: Record<StatKey, StatCopy> = {
  strength: { label: 'Strength', effect: 'Physical damage' },
  vitality: { label: 'Vitality', effect: 'Health, and how long a wipe takes' },
  agility: { label: 'Agility', effect: 'Attack speed' },
  intelligence: { label: 'Intelligence', effect: 'Magical damage' },
  spirit: { label: 'Spirit', effect: 'Team-wide effects' },
};

/**
 * Fixed display order, shared by every surface that lists stats.
 *
 * `Object.keys` follows insertion order and would quietly re-order a
 * character sheet the day someone reorganises the interface it comes from.
 */
const STAT_ORDER: readonly StatKey[] = ['strength', 'vitality', 'agility', 'intelligence', 'spirit'];

export function statOrder(): readonly StatKey[] {
  return STAT_ORDER;
}
