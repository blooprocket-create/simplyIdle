/**
 * Class combat profiles. Only the fields the simulation reads — the shipped
 * CLASSES array also carries names, emoji, fantasy blurbs and per-stat advice
 * strings, which are presentation and belong with the UI that shows them.
 */
export type PlayerClass = 'warrior' | 'berserker' | 'archer' | 'mage' | 'monk';

export interface ClassProfile {
  physWeight: number;
  magicWeight: number;
  teamWeight: number;
  baseStats: {
    strength: number;
    vitality: number;
    agility: number;
    intelligence: number;
    spirit: number;
  };
}

export const CLASS_PROFILES: Record<PlayerClass, ClassProfile> = {
  warrior: {
    physWeight: 1.25,
    magicWeight: 0.65,
    teamWeight: 1.0,
    baseStats: { strength: 9, vitality: 8, agility: 5, intelligence: 3, spirit: 4 },
  },
  berserker: {
    physWeight: 1.15,
    magicWeight: 0.55,
    teamWeight: 1.2,
    baseStats: { strength: 8, vitality: 10, agility: 4, intelligence: 2, spirit: 4 },
  },
  archer: {
    physWeight: 1.35,
    magicWeight: 0.5,
    teamWeight: 1.0,
    baseStats: { strength: 6, vitality: 5, agility: 10, intelligence: 4, spirit: 4 },
  },
  mage: {
    physWeight: 0.45,
    magicWeight: 1.45,
    teamWeight: 1.0,
    baseStats: { strength: 2, vitality: 4, agility: 5, intelligence: 11, spirit: 8 },
  },
  monk: {
    physWeight: 0.85,
    magicWeight: 1.05,
    teamWeight: 1.25,
    baseStats: { strength: 5, vitality: 8, agility: 6, intelligence: 7, spirit: 9 },
  },
};

export function getClassProfile(playerClass: PlayerClass): ClassProfile {
  return CLASS_PROFILES[playerClass] ?? CLASS_PROFILES.warrior;
}
