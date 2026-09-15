import Decimal from 'break_eternity.js';
import { getMonsterAffixModifiers } from '../../content/affixes';
import { getMonsterMaxHp } from '../waves/curves';

/**
 * The thing being hit, and what happens when a hit lands.
 *
 * Overkill is the reason this is a module rather than a subtraction. Under the
 * shipped model damage is continuous, so a monster dies at the exact instant
 * its HP reaches zero and not a scrap of damage is wasted. Discrete attacks
 * cannot do that: the killing blow lands whole, and whatever it carries past
 * zero is gone. That loss is real, it is larger the bigger a hit is relative
 * to the monster, and pretending otherwise would make the new combat quietly
 * stronger than the old one. So it is measured and reported instead.
 */

export interface Enemy {
  id: string;
  wave: number;
  hp: Decimal;
  maxHp: Decimal;
}

export function spawnEnemy(wave: number, enemyHpMult = 1): Enemy {
  const safeWave = Math.max(1, Math.floor(wave));
  // Affixes are applied here rather than by the caller so the live simulation
  // and the offline estimator face the same monster at the same wave.
  const affix = getMonsterAffixModifiers(safeWave);
  const maxHp = getMonsterMaxHp(safeWave).mul(enemyHpMult).mul(affix.hpMult);
  return { id: `w${safeWave}`, wave: safeWave, hp: maxHp, maxHp };
}

export interface HitResult {
  enemy: Enemy;
  /** Damage that actually landed on the monster. */
  dealt: Decimal;
  /** Damage the killing blow carried past zero, and lost. */
  overkill: Decimal;
  killed: boolean;
}

export function applyHit(enemy: Enemy, amount: Decimal): HitResult {
  if (!amount.isFinite() || amount.lte(0)) {
    return { enemy, dealt: new Decimal(0), overkill: new Decimal(0), killed: false };
  }

  if (amount.gte(enemy.hp)) {
    return {
      enemy: { ...enemy, hp: new Decimal(0) },
      dealt: enemy.hp,
      overkill: amount.sub(enemy.hp),
      killed: true,
    };
  }

  return {
    enemy: { ...enemy, hp: enemy.hp.sub(amount) },
    dealt: amount,
    overkill: new Decimal(0),
    killed: false,
  };
}
