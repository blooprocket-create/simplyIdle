import type { PlayerClass } from '../../content/classes';

/**
 * Team synergies: bonuses for what the active team is *made of*, as opposed to
 * formation's bonuses for where they stand.
 *
 * Five rules, all thresholds on class or faction counts. The shipped code
 * returns each active synergy with a display name and effect string attached;
 * those are presentation, so only the ids cross over and the UI names them.
 */

export type Faction = 'vanguard' | 'ranger' | 'arcanum' | 'aegis';

export type SynergyId = 'vanguard_wall' | 'spellshot' | 'iron_mandala' | 'grand_coalition' | 'warband_focus';

export function factionForClass(playerClass: PlayerClass): Faction {
  if (playerClass === 'warrior' || playerClass === 'berserker') return 'vanguard';
  if (playerClass === 'archer') return 'ranger';
  if (playerClass === 'mage') return 'arcanum';
  return 'aegis';
}

export interface SynergyResult {
  dpsMult: number;
  hpMult: number;
  incomingMult: number;
  goldMult: number;
  expMult: number;
  /** Which synergies fired, in evaluation order. */
  active: SynergyId[];
}

export interface ClassCounts {
  warrior: number;
  berserker: number;
  archer: number;
  mage: number;
  monk: number;
}

export interface FactionCounts {
  vanguard: number;
  ranger: number;
  arcanum: number;
  aegis: number;
}

export function countClasses(team: readonly { heroClass: PlayerClass }[]): ClassCounts {
  const counts: ClassCounts = { warrior: 0, berserker: 0, archer: 0, mage: 0, monk: 0 };
  for (const hero of team) counts[hero.heroClass] += 1;
  return counts;
}

export function countFactions(team: readonly { heroClass: PlayerClass }[]): FactionCounts {
  const counts: FactionCounts = { vanguard: 0, ranger: 0, arcanum: 0, aegis: 0 };
  for (const hero of team) counts[factionForClass(hero.heroClass)] += 1;
  return counts;
}

export function getTeamSynergy(team: readonly { heroClass: PlayerClass }[]): SynergyResult {
  const classCounts = countClasses(team);
  const factionCounts = countFactions(team);

  let dpsMult = 1;
  let hpMult = 1;
  let incomingMult = 1;
  let goldMult = 1;
  let expMult = 1;
  const active: SynergyId[] = [];

  // Two heavies hold a line.
  if (factionCounts.vanguard >= 2) {
    hpMult *= 1.12;
    active.push('vanguard_wall');
  }

  // A bow and a spell cover each other's gaps.
  if (factionCounts.ranger >= 1 && factionCounts.arcanum >= 1) {
    dpsMult *= 1.1;
    active.push('spellshot');
  }

  // Discipline behind steel.
  if (classCounts.warrior + classCounts.berserker >= 1 && classCounts.monk >= 1) {
    incomingMult *= 0.93;
    active.push('iron_mandala');
  }

  // Breadth: four of the five classes present.
  const uniqueClassCount = Object.values(classCounts).filter(count => count > 0).length;
  if (uniqueClassCount >= 4) {
    dpsMult *= 1.08;
    expMult *= 1.08;
    active.push('grand_coalition');
  }

  // Depth: a team of three or more that is entirely one class.
  const monoClass = Object.values(classCounts).some(count => count === team.length && team.length >= 3);
  if (monoClass) {
    goldMult *= 1.18;
    active.push('warband_focus');
  }

  return { dpsMult, hpMult, incomingMult, goldMult, expMult, active };
}
