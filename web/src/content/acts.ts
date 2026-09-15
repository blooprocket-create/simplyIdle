/**
 * Campaign acts. Authored data only — `startWave`/`endWave` describe the
 * shape of the campaign, and nothing here computes anything.
 *
 * Ported verbatim from the shipped game so the campaign reads identically;
 * `waveCurveParity` pins that.
 */
export interface Act {
  id: number;
  name: string;
  emoji: string;
  theme: string;
  startWave: number;
  /** `null` means "to the end of the run" rather than a sentinel integer. */
  endWave: number | null;
  bossWave: number;
  unlock: string | null;
}

export const ACTS: readonly Act[] = [
  {
    id: 1,
    name: 'Ashen Frontier',
    emoji: '🌋',
    theme: 'Scorched plains and raider warbands.',
    startWave: 1,
    endWave: 10,
    bossWave: 10,
    unlock: 'class_passive',
  },
  {
    id: 2,
    name: 'Verdant Ruin',
    emoji: '🌿',
    theme: 'Ancient overgrowth crawling with relic guardians.',
    startWave: 11,
    endWave: 20,
    bossWave: 20,
    unlock: 'advanced_consumables',
  },
  {
    id: 3,
    name: 'Glass Citadel',
    emoji: '🏰',
    theme: 'Fractured crystal halls and elite sentinels.',
    startWave: 21,
    endWave: 30,
    bossWave: 30,
    unlock: 'mythic_equipment',
  },
  {
    id: 4,
    name: 'Storm Abyss',
    emoji: '🌩️',
    theme: 'Tempest-choked void where captains become legends.',
    startWave: 31,
    endWave: 40,
    bossWave: 40,
    unlock: null,
  },
  {
    id: 5,
    name: 'Crownfall Depths',
    emoji: '👑',
    theme: 'Sunken imperial vaults guarded by ancient kings.',
    startWave: 41,
    endWave: 50,
    bossWave: 50,
    unlock: null,
  },
  {
    id: 6,
    name: 'Eternal Eclipse',
    emoji: '🌑',
    theme: 'The horizon where mythic armies march forever.',
    startWave: 51,
    // The shipped data used Number.MAX_SAFE_INTEGER here. Once waves can run
    // past 2^53 that sentinel stops being "forever", so the open-ended act is
    // modelled as an absent bound instead.
    endWave: null,
    bossWave: 60,
    unlock: null,
  },
];

export function getActForWave(wave: number): Act {
  return (
    ACTS.find(act => wave >= act.startWave && (act.endWave === null || wave <= act.endWave)) ?? ACTS[ACTS.length - 1]
  );
}

export function getBossUnlockForWave(wave: number): string | null {
  return ACTS.find(act => act.bossWave === wave)?.unlock ?? null;
}
