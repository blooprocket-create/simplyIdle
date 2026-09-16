import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { SUFFIXES, formatDamage } from './bigNumber';

const d = (value: string | number) => new Decimal(value);

describe('damage formatting', () => {
  it('shows small numbers precisely and larger ones whole', () => {
    expect(formatDamage(d(0))).toBe('0.0');
    expect(formatDamage(d(7.25))).toBe('7.3');
    expect(formatDamage(d(42))).toBe('42');
    expect(formatDamage(d(999))).toBe('999');
  });

  it('uses the suffixes the shipped game taught players', () => {
    // A player who knows what 4.20Qa means should not have to relearn it
    // because the engine underneath changed.
    expect(formatDamage(d(1_000))).toBe('1.00K');
    expect(formatDamage(d(1_234_567))).toBe('1.23M');
    expect(formatDamage(d('1e9'))).toBe('1.00B');
    expect(formatDamage(d('1e12'))).toBe('1.00T');
    expect(formatDamage(d('4.2e15'))).toBe('4.20Qa');
    expect(formatDamage(d('1e33'))).toBe('1.00De');
  });

  it('changes suffix exactly on the thousand boundary', () => {
    expect(formatDamage(d(999.4))).toBe('999');
    expect(formatDamage(d(1_000))).toBe('1.00K');
    // 999,999 scales to 999.999, which rounds to 1000.00. Rounding decides
    // the tier, so it must be applied before the suffix is chosen or the
    // number reads 1000.00K.
    expect(formatDamage(d(999_999))).toBe('1.00M');
    expect(formatDamage(d(1_000_000))).toBe('1.00M');
    // The top of the table behaves the same way: 999.99De stands, but a value
    // that rounds past it leaves the suffixes behind rather than printing a
    // tier that does not exist.
    expect(formatDamage(d('9.9999e35'))).toBe('999.99De');
    expect(formatDamage(d('9.99999e35'))).toBe('1.00e36');
  });

  it('keeps going past the point a double gives up', () => {
    // This is the one that matters. The shipped formatter takes a number and
    // renders everything beyond 1e308 as infinity, which is exactly where an
    // idle game with break_eternity starts getting interesting.
    expect(formatDamage(d('1e36'))).toBe('1.00e36');
    expect(formatDamage(d('5e100'))).toBe('5.00e100');
    expect(formatDamage(d('1e400'))).toBe('1.00e400');
    expect(formatDamage(d('9.87e5000'))).toBe('9.87e5000');
    for (const huge of ['1e400', '1e5000', '1e100000']) {
      expect(formatDamage(d(huge))).not.toContain('∞');
      expect(formatDamage(d(huge))).not.toContain('NaN');
    }
  });

  it('falls back to layered notation when the exponent needs one', () => {
    const vast = Decimal.pow(10, new Decimal('1e20'));
    const shown = formatDamage(vast);
    expect(shown).not.toContain('∞');
    expect(shown).not.toContain('NaN');
    expect(shown.length).toBeLessThan(24);
  });

  it('never returns something unreadable', () => {
    // A damage number flies past in under a second. Whatever the magnitude,
    // it has to fit and it has to be characters.
    const samples = ['0', '1', '999.9', '1e3', '1e18', '1e36', '1e309', '1e1000'];
    for (const sample of samples) {
      const shown = formatDamage(d(sample));
      expect(shown, sample).toMatch(/^[\d.,+\-eE^∞]+(K|M|B|T|Qa|Qi|Sx|Sp|Oc|No|De)?$/);
      expect(shown.length, sample).toBeLessThan(20);
    }
  });

  it('handles the values a snapshot can actually carry', () => {
    expect(formatDamage(d(NaN))).toBe('0');
    expect(formatDamage(d(Infinity))).toBe('∞');
    expect(formatDamage(d(-250))).toBe('-250');
  });

  it('has a suffix for every tier it claims to cover', () => {
    // A missing entry would render `undefined` into the middle of a number.
    for (let tier = 1; tier <= SUFFIXES.length; tier += 1) {
      const shown = formatDamage(Decimal.pow(10, tier * 3));
      expect(shown, `1e${tier * 3}`).not.toContain('undefined');
    }
  });
});
