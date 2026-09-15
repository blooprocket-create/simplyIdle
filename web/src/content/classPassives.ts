import type { PlayerClass } from './classes';

/**
 * The unlockable class passive. Only the two multipliers are mechanics; the
 * id, name and description are presentation and stay with the UI.
 */
export interface ClassPassive {
  dpsMultiplier: number;
  incomingDamageMultiplier: number;
}

export const CLASS_PASSIVES: Record<PlayerClass, ClassPassive> = {
  warrior: { dpsMultiplier: 1.02, incomingDamageMultiplier: 0.85 },
  berserker: { dpsMultiplier: 1.18, incomingDamageMultiplier: 1.05 },
  archer: { dpsMultiplier: 1.14, incomingDamageMultiplier: 1.0 },
  mage: { dpsMultiplier: 1.06, incomingDamageMultiplier: 0.88 },
  monk: { dpsMultiplier: 1.1, incomingDamageMultiplier: 0.92 },
};

export function getClassPassive(playerClass: PlayerClass): ClassPassive {
  return CLASS_PASSIVES[playerClass];
}
