import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  getMonsterDamage,
  getMonsterExp,
  getMonsterGold,
  getMonsterMaxHp,
  getMonsterForWave,
  getActForWave,
  expForLevel,
} from '../src/gameConfig';

/**
 * The shipped curves are the reference the rewrite's engine is measured
 * against, but the two live in different packages with different toolchains —
 * `web/` runs vitest and cannot import this Expo app's sources.
 *
 * So the reference is a committed fixture rather than a shared import. This
 * test owns the *old* side of that contract: it asserts the fixture still
 * describes what `src/gameConfig.ts` actually does, so a balance change here
 * fails loudly instead of quietly invalidating the rewrite's parity suite.
 * `web/src/engine/waves/curves.test.ts` owns the new side.
 *
 * Regenerate deliberately, never casually:
 *   UPDATE_WAVE_FIXTURE=1 npx jest __tests__/waveCurveFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'engine', 'waves', '__fixtures__', 'wave-curves.json');

/**
 * Waves chosen to cover the shape rather than the range: the opening, each
 * boss, both edges of the 20-60 gold catch-up ramp, and the act boundaries.
 *
 * The ceiling is 230 for a subtler reason than overflow. `Math.pow` and
 * `Decimal.pow` are both float-backed and agree to within a few ULP, but these
 * curves *floor* the result — which turns a last-bit disagreement into an
 * integer one. Measured, exact agreement survives to wave 236 for HP, 231 for
 * gold and 259 for EXP, at magnitudes near 1e14. Past the tightest of those
 * no implementation is more "correct" than another, so demanding an exact
 * match there would be demanding the rewrite reproduce a rounding artefact.
 *
 * DEEP_WAVES carries the band past it, checked on relative difference instead.
 */
const SAMPLE_WAVES = [
  1, 2, 5, 9, 10, 11, 19, 20, 21, 29, 30, 31, 39, 40, 41, 50, 51, 59, 60, 61, 70, 99, 100, 101, 150, 200, 220, 230,
];

/** Past exact agreement, still inside the range where a float holds integers. */
const DEEP_WAVES = [240, 250, 255, 259];

const SAMPLE_LEVELS = [1, 2, 10, 25, 50, 100, 150, 200];

/**
 * Full-range coverage, as a digest rather than tens of thousands of rows.
 *
 * Sampling twenty-eight waves was enough to catch a balance change to a
 * *curve*, since these are smooth functions of the wave number. It was not
 * enough to be called a parity suite over the campaign, and it could not see a
 * divergence that only appears at depth — which matters now that the rewrite
 * computes these on `Decimal` and the shipped code on doubles.
 *
 * So every wave in each band is enumerated on both sides and hashed. The
 * explicit rows above stay for debuggability: a digest mismatch says *that*
 * something diverged, and diffing the sampled rows says *what*.
 */
const EXACT_BAND_END = 230;
/** Just inside where gold — the tightest of the four — stops being finite. */
const WIDE_BAND_END = 5_400;
/** Every this many waves is carried explicitly through the wide band. */
const WIDE_BAND_STRIDE = 50;

function digestOf(lines: readonly string[]): string {
  return createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 32);
}

/** Exact band: the values agree bit for bit, so they are hashed verbatim. */
function exactDigest(): string {
  const lines: string[] = [];
  for (let wave = 1; wave <= EXACT_BAND_END; wave += 1) {
    lines.push(
      `${wave}:${getMonsterMaxHp(wave)}:${getMonsterGold(wave)}:${getMonsterExp(wave)}:${getMonsterDamage(wave)}`,
    );
  }
  return digestOf(lines);
}

/**
 * Wide band: carried as values, not as a digest.
 *
 * A digest of rounded values was tried first and is the wrong instrument here.
 * Past roughly wave 230 these curves floor a magnitude big enough that the two
 * implementations differ in the last couple of digits — measured at worst
 * 2.2e-13 relative — and rounding both to a fixed number of significant digits
 * turns any value sitting near a rounding boundary into a mismatch even though
 * the two agree far more closely than the comparison claims to require. At
 * twelve digits roughly a fifth of values are close enough to a boundary to
 * flip. A digest cannot express "agrees to within a relative tolerance", so
 * the wide band carries real values and is compared as a number should be.
 */
function wideRows(): WaveRow[] {
  const rows: WaveRow[] = [];
  for (let wave = EXACT_BAND_END + WIDE_BAND_STRIDE; wave <= WIDE_BAND_END; wave += WIDE_BAND_STRIDE) {
    rows.push(row(wave));
  }
  return rows;
}

/** The wave at which each curve stops being a finite double. */
function finiteLimits(): Record<string, number> {
  const curves: Record<string, (wave: number) => number> = {
    hp: getMonsterMaxHp,
    gold: getMonsterGold,
    exp: getMonsterExp,
    damage: getMonsterDamage,
  };
  const limits: Record<string, number> = {};
  for (const [name, curve] of Object.entries(curves)) {
    let last = 0;
    for (let wave = 1; wave <= 20_000; wave += 1) if (Number.isFinite(curve(wave))) last = wave;
    limits[name] = last;
  }
  return limits;
}

interface WaveRow {
  wave: number;
  hp: number;
  gold: number;
  exp: number;
  damage: number;
  monster: string;
  emoji: string;
  act: number;
}

interface Fixture {
  note: string;
  generatedFrom: string;
  waves: WaveRow[];
  deepWaves: WaveRow[];
  levels: { level: number; exp: number }[];
  fullRange: {
    exactBandEnd: number;
    wideBandEnd: number;
    wideStride: number;
    /** Every wave 1..exactBandEnd, hashed. Bit-exact on both sides. */
    exactDigest: string;
    /** Strided rows through the wide band, compared on relative difference. */
    wideRows: WaveRow[];
    /** The wave at which each curve stops being a finite double. */
    finiteThrough: Record<string, number>;
  };
}

function row(wave: number): WaveRow {
  const monster = getMonsterForWave(wave);
  return {
    wave,
    hp: getMonsterMaxHp(wave),
    gold: getMonsterGold(wave),
    exp: getMonsterExp(wave),
    damage: getMonsterDamage(wave),
    monster: monster.name,
    emoji: monster.emoji,
    act: getActForWave(wave).id,
  };
}

function build(): Fixture {
  return {
    note: 'Reference values from the shipped Expo implementation. Owned by __tests__/waveCurveFixture.test.ts.',
    generatedFrom: 'src/gameConfig.ts',
    waves: SAMPLE_WAVES.map(row),
    deepWaves: DEEP_WAVES.map(row),
    levels: SAMPLE_LEVELS.map(level => ({ level, exp: expForLevel(level) })),
    fullRange: {
      exactBandEnd: EXACT_BAND_END,
      wideBandEnd: WIDE_BAND_END,
      wideStride: WIDE_BAND_STRIDE,
      exactDigest: exactDigest(),
      wideRows: wideRows(),
      finiteThrough: finiteLimits(),
    },
  };
}

describe('wave curve fixture', () => {
  const fixture = build();

  it('covers the whole campaign, not a sample of it', () => {
    // The digests are only worth anything if the bands they cover are real.
    expect(fixture.fullRange.exactBandEnd).toBe(EXACT_BAND_END);
    expect(fixture.fullRange.wideBandEnd).toBe(WIDE_BAND_END);
    expect(WIDE_BAND_END - EXACT_BAND_END).toBeGreaterThan(5_000);
    expect(fixture.fullRange.exactDigest).toMatch(/^[0-9a-f]{32}$/);
    // The wide band reaches past wave five thousand at a fifty wave stride, so
    // it is a hundred real rows rather than the four it used to be.
    expect(fixture.fullRange.wideRows.length).toBeGreaterThan(100);
    expect(fixture.fullRange.wideRows[0].wave).toBe(EXACT_BAND_END + WIDE_BAND_STRIDE);
    expect(fixture.fullRange.wideRows.at(-1)!.wave).toBeLessThanOrEqual(WIDE_BAND_END);
  });

  it('digests change when a curve changes', () => {
    // Otherwise the digest is decoration. A single wave moved by one gold has
    // to move the hash, which is the property the whole approach rests on.
    const baseline = exactDigest();
    const tampered = createHash('sha256')
      .update(
        Array.from({ length: EXACT_BAND_END }, (_, index) => {
          const wave = index + 1;
          const gold = getMonsterGold(wave) + (wave === 137 ? 1 : 0);
          return `${wave}:${getMonsterMaxHp(wave)}:${gold}:${getMonsterExp(wave)}:${getMonsterDamage(wave)}`;
        }).join('\n'),
      )
      .digest('hex')
      .slice(0, 32);
    expect(tampered).not.toBe(baseline);
  });

  it('records where each curve stops being a finite double', () => {
    // The reason the rewrite is on Decimal at all: these curves die long
    // before MAX_SAVE_WAVE, which is 1,000,000.
    expect(fixture.fullRange.finiteThrough).toEqual({ hp: 6234, gold: 5402, exp: 6249, damage: 6264 });
    for (const limit of Object.values(fixture.fullRange.finiteThrough)) {
      expect(limit).toBeLessThan(10_000);
    }
    // And the wide band stops inside the tightest of them, so every value the
    // digest covers is a number the old implementation can actually produce.
    expect(WIDE_BAND_END).toBeLessThan(fixture.fullRange.finiteThrough.gold);
  });

  it('every sampled value is an exact integer in the old implementation', () => {
    // Past MAX_SAFE_INTEGER the old curves' own Math.floor stops returning
    // exact integers, so beyond the cutoff there is no correct reference value
    // to record. This guards the sample list against drifting past it.
    for (const entry of [...fixture.waves, ...fixture.deepWaves]) {
      for (const field of ['hp', 'gold', 'exp'] as const) {
        expect(Number.isSafeInteger(entry[field])).toBe(true);
      }
    }
    for (const row of fixture.levels) {
      expect(Number.isSafeInteger(row.exp)).toBe(true);
    }
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_WAVE_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }

    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });

  it('records where each shipped curve stops being exact', () => {
    // Not a regression guard so much as the evidence for moving the rewrite's
    // engine onto Decimal: a save schema that permits a wave of 1,000,000 is
    // describing a game these curves cannot count past.
    const lastExact = (curve: (wave: number) => number): number => {
      let last = 0;
      for (let wave = 1; wave <= 1000; wave++) {
        if (!Number.isSafeInteger(curve(wave))) break;
        last = wave;
      }
      return last;
    };

    expect({
      gold: lastExact(getMonsterGold),
      hp: lastExact(getMonsterMaxHp),
      exp: lastExact(getMonsterExp),
    }).toEqual({ gold: 259, hp: 289, exp: 299 });
  });
});
