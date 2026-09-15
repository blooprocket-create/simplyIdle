import Decimal from 'break_eternity.js';

/**
 * Damage, short enough to read as it flies past.
 *
 * The suffixes are the shipped game's, deliberately — a player who knows what
 * `4.20Qa` means should not have to relearn it because the engine underneath
 * changed. What does change is the ceiling. `src/utils.ts` takes a `number`
 * and renders everything past 1e308 as `∞`, which was harmless when the game
 * could not represent more than that and is not now: `break_eternity` is in
 * the stack precisely so the numbers can keep going, and a damage number that
 * gives up at the point the interesting part starts is worse than none.
 *
 * So: suffixes to a decillion, plain scientific past that, and the layered
 * form beyond what an exponent can itself express.
 */

export const SUFFIXES = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'De'] as const;

/** Above this the suffix table runs out and scientific notation takes over. */
export const SUFFIX_CEILING = new Decimal('1e36');

/** Above this even the exponent needs its own exponent. */
const EXPONENT_CEILING = new Decimal('1e15');

const THOUSAND = new Decimal(1000);

export function formatDamage(value: Decimal): string {
  if (value.isNan()) return '0';
  const negative = value.lt(0);
  const magnitude = negative ? value.neg() : value;
  const body = format(magnitude);
  return negative ? `-${body}` : body;
}

function format(magnitude: Decimal): string {
  if (!magnitude.isFinite()) return '∞';
  if (magnitude.lt(THOUSAND)) {
    const plain = magnitude.toNumber();
    return plain.toFixed(plain < 10 ? 1 : 0);
  }
  if (magnitude.lt(SUFFIX_CEILING)) {
    // Which group of three digits we are in: 1e3 is K, 1e6 is M, and so on.
    let tier = Math.floor(Decimal.log10(magnitude).toNumber() / 3);
    let scaled = magnitude.div(Decimal.pow(10, tier * 3)).toNumber();
    // 999,999 scales to 999.999, which rounds to "1000.00" and would print as
    // 1000.00K. Rounding decides the tier, so the tier is chosen after it.
    if (scaled >= 999.995) {
      tier += 1;
      scaled = magnitude.div(Decimal.pow(10, tier * 3)).toNumber();
    }
    if (tier - 1 < SUFFIXES.length) return `${scaled.toFixed(2)}${SUFFIXES[tier - 1]}`;
  }
  let exponent = Decimal.log10(magnitude).floor();
  if (exponent.lt(EXPONENT_CEILING)) {
    let mantissa = magnitude.div(Decimal.pow(10, exponent)).toNumber();
    // Same rounding trap as the suffix table: 9.99999 rounds to 10.00, and
    // "10.00e35" is a number nobody writes. Rounding decides the exponent.
    if (mantissa >= 9.995) {
      exponent = exponent.add(1);
      mantissa = magnitude.div(Decimal.pow(10, exponent)).toNumber();
    }
    return `${mantissa.toFixed(2)}e${exponent.toNumber()}`;
  }
  // Past here the exponent itself needs an exponent, which is the notation
  // break_eternity already prints for its own layered values.
  return magnitude.toString();
}
