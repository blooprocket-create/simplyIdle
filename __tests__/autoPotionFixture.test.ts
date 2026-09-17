import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { getUsableItem, type PlayerClass } from '../src/gameConfig';
import { DEFAULT_STATE, advanceCombatStep, type GameState } from '../src/useGameState';

/**
 * Auto-potion, measured.
 *
 * The one automation of the nine that this build could have honoured for
 * three phases and did not. It needs no heat — it watches the team's health,
 * which the rewrite has had since Phase 7 — and REVAMP lists it as landing in
 * Phase 10 alongside `useCoolant` and `castHeroActives`.
 *
 * Measured through `advanceCombatStep` rather than read off `maybeAutoUsePotion`,
 * because the rule is a *sequence*: the step deals the monster's damage first
 * and the potion reads the health that is left. A test that called the helper
 * with a hand-set ratio would be measuring the helper and not the rule.
 *
 * The heal is isolated by running each case twice — once holding potions and
 * once holding none — and taking the difference. Both runs take the same
 * damage, so what is left is the potion.
 *
 * Regenerate deliberately:
 *   UPDATE_AUTO_POTION_FIXTURE=1 npx jest __tests__/autoPotionFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'content', '__fixtures__', 'auto-potion.json');

/** A step short enough that the monster barely moves the bar. */
const STEP_MS = 16;
const MAX_HP = 10_000;

function state(hpRatio: number, held: Record<string, number>, over: Partial<GameState> = {}): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    level: 40,
    wave: 20,
    teamMaxHp: MAX_HP,
    teamHp: Math.round(MAX_HP * hpRatio),
    autoUsePotionEnabled: true,
    usableItemCounts: { ...held },
    ...over,
  };
}

/** The item a step spent, and the health it bought. */
function drink(hpRatio: number, held: Record<string, number>, over: Partial<GameState> = {}) {
  const real = Math.random;
  Math.random = () => 0.5;
  try {
    const before = state(hpRatio, held, over);
    const after = advanceCombatStep(before, STEP_MS);
    const control = advanceCombatStep(state(hpRatio, {}, over), STEP_MS);

    const spent = Object.keys(held).find(id => (after.usableItemCounts[id] ?? 0) < held[id]) ?? null;
    /*
     * Rounded, and the reason is worth naming rather than hiding. Both runs
     * take the same damage, but the potion run adds the heal *before* the
     * clamp and the control does not, so the two arrive at their health
     * through different arithmetic. Measured, the difference from the true
     * integer is about 5e-13 — the heal itself is a `Math.ceil` and so always
     * whole, which is what makes rounding safe rather than convenient.
     */
    return { spent, healed: Math.round(after.teamHp - control.teamHp) };
  } finally {
    Math.random = real;
  }
}

interface Case {
  name: string;
  hpRatio: number;
  held: Record<string, number>;
  spent: string | null;
  healed: number;
}

/**
 * The exact boundary, probed rather than assumed.
 *
 * A case started at 35% does not reach the rule at 35%: the step deals the
 * monster's damage first, so what `maybeAutoUsePotion` sees is always a little
 * lower and `>` and `>=` agree about it. Flipping the comparison in the
 * shipped source changes nothing in any of the cases above, which is the whole
 * reason this exists — the fixture would otherwise be recording a boundary it
 * cannot see.
 *
 * So: take the ratio a step actually arrives at, then set the threshold to
 * exactly that and to a hair below it. Only an inclusive comparison drinks at
 * the first and not the second.
 */
function probeBoundary(): { atExactly: string | null; justBelow: string | null; ratio: number } {
  const real = Math.random;
  Math.random = () => 0.5;
  try {
    const control = advanceCombatStep(state(0.5, {}), STEP_MS);
    const ratio = control.teamHp / control.teamMaxHp;
    const spentAt = (threshold: number) => {
      const after = advanceCombatStep(state(0.5, HELD_BOTH, { autoUsePotionThresholdPct: threshold }), STEP_MS);
      return Object.keys(HELD_BOTH).find(id => (after.usableItemCounts[id] ?? 0) < 5) ?? null;
    };
    return { ratio, atExactly: spentAt(ratio), justBelow: spentAt(ratio * (1 - 1e-12)) };
  } finally {
    Math.random = real;
  }
}

interface Fixture {
  note: string;
  generatedFrom: string;
  /** Below this share of maximum, a potion is drunk. */
  thresholdPct: number;
  /** Below `threshold * this`, the grand potion is preferred to the small. */
  grandPreferencePivot: number;
  /** What each potion restores, as a share of the team's maximum. */
  potions: { id: string; value: number }[];
  cases: Case[];
  /** `>` or `>=`, settled by probing the exact ratio a step arrives at. */
  boundary: { atExactly: string | null; justBelow: string | null; ratio: number };
}

const HELD_BOTH = { small_potion: 5, grand_potion: 5 };

function build(): Fixture {
  const at = (name: string, hpRatio: number, held: Record<string, number>, over: Partial<GameState> = {}): Case => ({
    name,
    hpRatio,
    held,
    ...drink(hpRatio, held, over),
  });

  return {
    note: 'Auto-potion, measured through advanceCombatStep.',
    generatedFrom: 'src/useGameState.ts maybeAutoUsePotion',
    thresholdPct: DEFAULT_STATE.autoUsePotionThresholdPct,
    grandPreferencePivot: 0.6,
    potions: ['small_potion', 'grand_potion'].map(id => ({ id, value: getUsableItem(id)!.value })),
    cases: [
      at('healthy, holding both', 0.9, HELD_BOTH),
      at('just above the threshold', 0.36, HELD_BOTH),
      at('at the threshold', 0.35, HELD_BOTH),
      at('below the threshold', 0.3, HELD_BOTH),
      at('below the grand pivot', 0.2, HELD_BOTH),
      at('below the pivot, holding only smalls', 0.2, { small_potion: 5 }),
      at('above the pivot, holding only grands', 0.3, { grand_potion: 5 }),
      at('below the threshold, holding nothing', 0.3, {}),
      at('below the threshold, switched off', 0.3, HELD_BOTH, { autoUsePotionEnabled: false }),
      at('below a threshold the player raised', 0.6, HELD_BOTH, { autoUsePotionThresholdPct: 0.8 }),
    ],
    boundary: probeBoundary(),
  };
}

describe('when auto-potion drinks', () => {
  const fixture = build();

  it('waits until the team is at or below the threshold', () => {
    // Named for where the case *starts*; what the rule sees is a little lower,
    // because the step deals the monster's damage before the potion looks. The
    // exact boundary is settled separately, below.
    expect(fixture.cases.slice(0, 4).map(entry => ({ name: entry.name, spent: entry.spent }))).toEqual([
      { name: 'healthy, holding both', spent: null },
      { name: 'just above the threshold', spent: null },
      { name: 'at the threshold', spent: 'small_potion' },
      { name: 'below the threshold', spent: 'small_potion' },
    ]);
  });

  it('defaults to thirty-five percent', () => {
    expect(fixture.thresholdPct).toBe(0.35);
  });

  it('honours a threshold the player raised', () => {
    // 60% is healthy against the default and desperate against 80%.
    expect(fixture.cases[9].spent).not.toBeNull();
  });

  it('does nothing at all when switched off', () => {
    expect(fixture.cases[8]).toMatchObject({ spent: null, healed: 0 });
  });

  it('drinks at exactly the threshold and not a hair above it', () => {
    /*
     * The comparison is `hpRatio > threshold` — so equal drinks. Measured by
     * setting the threshold to the ratio a step actually lands on, rather than
     * by starting a case at 35% and assuming it arrives there: it does not,
     * and every case above passes under either comparison.
     */
    expect(fixture.boundary.atExactly).toBe('small_potion');
    expect(fixture.boundary.justBelow).toBeNull();
  });
});

describe('which potion it reaches for', () => {
  const fixture = build();

  it('saves the grand one until the team is properly in trouble', () => {
    /*
     * The pivot is `threshold * 0.6` — 21% against the default — and it is
     * the whole design of the rule: a team at 30% gets the cheap potion and a
     * team at 20% gets the expensive one. A port that read the threshold
     * twice instead of once would spend grands from the first sip.
     *
     * The threshold and the pivot are two different comparisons against the
     * same number, and reading one of them twice is the mistake that is easy
     * to make and invisible afterwards: a port that compared `hpRatio <=
     * threshold` in both places would spend a grand potion on the first sip,
     * every time, and still pass every test about *when* it drinks.
     */
    expect(fixture.cases[3]).toMatchObject({ hpRatio: 0.3, spent: 'small_potion' });
    expect(fixture.cases[4]).toMatchObject({ hpRatio: 0.2, spent: 'grand_potion' });
  });

  it('takes what it has when its first choice is not held', () => {
    expect(fixture.cases[5].spent).toBe('small_potion');
    expect(fixture.cases[6].spent).toBe('grand_potion');
  });

  it('drinks nothing, rather than failing, on an empty bag', () => {
    expect(fixture.cases[7]).toMatchObject({ spent: null, healed: 0 });
  });
});

describe('what a potion restores', () => {
  const fixture = build();

  it('is a share of the team maximum, rounded up', () => {
    // `Math.ceil(teamMaxHp * value)` against a 10,000 maximum, so the shares
    // are exact and a rounding rule would be invisible here — which is why
    // the shares themselves are pinned rather than the rounding.
    const byId = Object.fromEntries(fixture.potions.map(potion => [potion.id, potion.value]));
    const healedFor = (entry: Case) => Math.ceil(10_000 * byId[entry.spent!]);
    const drank = fixture.cases.filter(entry => entry.spent !== null);
    expect(drank.length).toBeGreaterThan(0);
    expect(drank.map(entry => entry.healed)).toEqual(drank.map(healedFor));
  });

  it('never restores past full', () => {
    for (const entry of fixture.cases) {
      expect(entry.healed).toBeLessThanOrEqual(10_000);
    }
  });
});

describe('the committed fixture', () => {
  it('matches what the rewrite is measured against', () => {
    const fixture = build();
    if (process.env.UPDATE_AUTO_POTION_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
