import Decimal from 'break_eternity.js';
import { isBossWave } from '../../content/monsters';

/**
 * Wave scaling. The rates and multipliers are the shipped game's, verbatim —
 * `waveCurves.test.ts` pins every one of them against a fixture generated from
 * the old implementation, so the campaign is the same campaign.
 *
 * What changed is the number type. The old curves were `Math.floor(30 *
 * Math.pow(1.12, wave - 1))` on a JS float, which stops being an exact integer
 * at **wave 290** and reaches `Infinity` at **wave 6220**. Neither is a
 * theoretical limit in a game whose save schema allows a wave of 1,000,000:
 * past 2^53 the floor silently returns a non-integer and every subtraction
 * after it drifts.
 *
 * Decimal costs an allocation per call and buys the rest of the campaign.
 */

const HP_BASE = 30;
export const HP_RATE = 1.12;
export const HP_BOSS_MULT = 5;

const GOLD_BASE = 8;
const GOLD_RATE = 1.14;
const GOLD_FLOOR = 8;
const GOLD_BOSS_MULT = 7;

/**
 * Mid-game catch-up. Building costs scale at 1.15x against gold's 1.14x, so
 * waves 20-60 were a progression dead zone; this ramps gold 1.5x to 2x across
 * that band. Kept exactly as shipped — it is balance, not a workaround.
 */
const GOLD_CATCHUP_START = 20;
const GOLD_CATCHUP_END = 60;
const GOLD_CATCHUP_MIN = 1.5;
const GOLD_CATCHUP_MAX = 2.0;

const EXP_BASE = 5;
const EXP_RATE = 1.12;
const EXP_FLOOR = 5;
const EXP_BOSS_MULT = 4;

const DAMAGE_BASE = 0.8;
const DAMAGE_RATE = 1.12;
const DAMAGE_FLOOR = 0.5;
const DAMAGE_BOSS_MULT = 2.5;

/** `base * rate^(wave - 1)`, the shape every curve below shares. */
function growth(base: number, rate: number, wave: number): Decimal {
  return Decimal.pow(rate, wave - 1).mul(base);
}

export function getMonsterMaxHp(wave: number): Decimal {
  const base = growth(HP_BASE, HP_RATE, wave).floor();
  return isBossWave(wave) ? base.mul(HP_BOSS_MULT) : base;
}

export function getMonsterGold(wave: number): Decimal {
  let base = Decimal.max(GOLD_FLOOR, growth(GOLD_BASE, GOLD_RATE, wave).floor());

  if (wave >= GOLD_CATCHUP_START && wave <= GOLD_CATCHUP_END) {
    const t = (wave - GOLD_CATCHUP_START) / (GOLD_CATCHUP_END - GOLD_CATCHUP_START);
    const boost = GOLD_CATCHUP_MIN + (GOLD_CATCHUP_MAX - GOLD_CATCHUP_MIN) * t;
    base = base.mul(boost).floor();
  }

  return isBossWave(wave) ? base.mul(GOLD_BOSS_MULT) : base;
}

export function getMonsterExp(wave: number): Decimal {
  const base = Decimal.max(EXP_FLOOR, growth(EXP_BASE, EXP_RATE, wave).floor());
  return isBossWave(wave) ? base.mul(EXP_BOSS_MULT) : base;
}

/**
 * Divide by ten the way a double does.
 *
 * `Decimal.div` multiplies by the reciprocal, and `n * 0.1` is not `n / 10`:
 * six tenths comes out as 0.6000000000000001 rather than 0.6. That is one ulp,
 * and it slipped past the sampled fixture because the damage check allowed a
 * relative difference of `Number.EPSILON` and the error is fractionally under
 * it. Enumerating every wave is what caught it.
 *
 * So the double's answer is used while the numerator is a safe integer, and
 * `div` is reached only past the point where there is no double to be faithful
 * to — the same rule the rebirth multiplier follows.
 */
function divideByTen(value: Decimal): Decimal {
  const asNumber = value.toNumber();
  if (Number.isSafeInteger(asNumber)) return new Decimal(asNumber / 10);
  return value.div(10);
}

/** Enemy damage per second. Divided by ten *after* the floor, as shipped. */
export function getMonsterDamage(wave: number): Decimal {
  const base = Decimal.max(DAMAGE_FLOOR, divideByTen(growth(DAMAGE_BASE, DAMAGE_RATE, wave).floor()));
  return isBossWave(wave) ? base.mul(DAMAGE_BOSS_MULT) : base;
}

export function expForLevel(level: number): Decimal {
  return growth(80, 1.16, level).floor();
}
