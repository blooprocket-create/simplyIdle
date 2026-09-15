/**
 * Monster affixes.
 *
 * Every wave carries one, picked by cycling a five-entry table, and boss waves
 * carry a second. They move enemy HP, enemy damage, gold and EXP by a few
 * percent each — small enough to look like flavour, large enough that an
 * offline estimator which treats them as a single constant drifts by a factor
 * of three over a climb, because the affix at the wave you left is not the
 * affix at the wave you reach.
 */

export interface MonsterAffix {
  id: string;
  name: string;
  enemyHpMult: number;
  enemyDamageMult: number;
  goldMult: number;
  expMult: number;
}

export const MONSTER_AFFIX_POOL: readonly MonsterAffix[] = [
  { id: 'armored', name: 'Armored', enemyHpMult: 1.18, enemyDamageMult: 1.0, goldMult: 1.06, expMult: 1.05 },
  { id: 'berserk', name: 'Berserk', enemyHpMult: 1.0, enemyDamageMult: 1.28, goldMult: 1.07, expMult: 1.07 },
  { id: 'swift', name: 'Swift', enemyHpMult: 1.12, enemyDamageMult: 1.08, goldMult: 1.06, expMult: 1.06 },
  { id: 'hoarder', name: 'Hoarder', enemyHpMult: 1.1, enemyDamageMult: 1.05, goldMult: 1.24, expMult: 1.08 },
  { id: 'arcane', name: 'Arcane', enemyHpMult: 1.15, enemyDamageMult: 1.14, goldMult: 1.1, expMult: 1.16 },
];

export interface AffixModifiers {
  hpMult: number;
  damageMult: number;
  goldMult: number;
  expMult: number;
}

/**
 * Which affixes a wave carries. Boss waves add a second, drawn three places
 * further along the cycle — and skipped when that lands on the same entry,
 * which is why a boss does not always carry two.
 */
export function getMonsterAffixes(wave: number): MonsterAffix[] {
  const size = MONSTER_AFFIX_POOL.length;
  const primary = MONSTER_AFFIX_POOL[(wave - 1) % size];
  const affixes = [primary];
  if (wave % 10 === 0) {
    const secondary = MONSTER_AFFIX_POOL[(wave + 2) % size];
    if (secondary.id !== primary.id) affixes.push(secondary);
  }
  return affixes;
}

export function getMonsterAffixModifiers(wave: number): AffixModifiers {
  return getMonsterAffixes(wave).reduce<AffixModifiers>(
    (total, affix) => ({
      hpMult: total.hpMult * affix.enemyHpMult,
      damageMult: total.damageMult * affix.enemyDamageMult,
      goldMult: total.goldMult * affix.goldMult,
      expMult: total.expMult * affix.expMult,
    }),
    { hpMult: 1, damageMult: 1, goldMult: 1, expMult: 1 },
  );
}
