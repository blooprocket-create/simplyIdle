import type Decimal from 'break_eternity.js';

/**
 * A health bar's fill, from the two Decimals a snapshot carries.
 *
 * Deliberately total. Health arrives as arbitrary-precision numbers that can
 * be zero, can exceed their own maximum after a heal, and — at the far end of
 * an idle game — can be large enough that dividing them yields something a
 * double cannot hold. A bar is a fraction between nought and one whatever it
 * is handed, because the alternative is a mesh scaled by NaN, which does not
 * throw and does not draw.
 */
export function barFraction(value: Decimal, max: Decimal): number {
  if (max.lte(0)) return 0;
  const fraction = value.div(max).toNumber();
  if (!Number.isFinite(fraction)) return fraction > 0 ? 1 : 0;
  return fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
}
