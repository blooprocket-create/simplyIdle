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
  };
}

describe('wave curve fixture', () => {
  const fixture = build();

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
