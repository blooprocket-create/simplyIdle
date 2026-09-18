import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { HERO_POOL, WEEKLY_EVENTS, type PlayerClass } from '../src/gameConfig';
import { DEFAULT_STATE, reducer, type GameState } from '../src/useGameState';

/**
 * The four mini ops and the bounty draft, measured.
 *
 * Five things a player can press once every four hours: a dice roll, a recon
 * sweep, a lockpick cache, a target-practice run, and a bounty writ that pays
 * out later. Together they are the `operations` destination, the last
 * placeholder in the World group.
 *
 * Measured rather than read because the arithmetic is the least of it:
 *
 *   - Every cooldown field is named `last…Day` and the cooldown is **four
 *     hours**, so the name is off by a factor of six. Bisected rather than
 *     read off the constant.
 *   - The reducer's `Math.random()` branches are **unreachable**. Every screen
 *     passes a forced outcome, so the player's dice, code and timing decide
 *     the reward and the reducer is a payout table.
 *   - The dice payout is written **twice**, and the second copy says so in a
 *     comment. Both copies are evaluated here, not compared as text.
 *
 * Regenerate deliberately:
 *   UPDATE_MINIGAMES_FIXTURE=1 npx jest __tests__/minigamesFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'content', '__fixtures__', 'minigames.json');

/** A fixed clock. Nothing here may depend on when the suite runs. */
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

function state(over: Partial<GameState> = {}): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    level: 40,
    statsAlloc: { strength: 200, vitality: 0, agility: 0, intelligence: 0, spirit: 0 },
    heroRoster: HERO_POOL.slice(0, 4).map((hero, index) => ({
      ...hero,
      uid: `u${index}`,
      rarity: 'rare' as const,
      level: 30,
      rank: 1,
      teamBoost: hero.baseTeamBoost,
      rebirthStatMult: 1,
    })),
    activeTeamHeroIds: ['u0', 'u1'],
    wave: 50,
    highestWaveReached: 120,
    totalKills: 4000,
    totalSummons: 30,
    diamonds: 0,
    heroShards: 0,
    gold: 0,
    totalGold: 0,
    damageBuffPct: 0,
    damageBuffMs: 0,
    // Week 0 is `no_armor_week`, whose shard multiplier is 1 — a baseline
    // that leaves the target-practice arithmetic visible.
    weeklyEventWeek: 0,
    lastDiceRollDay: null,
    lastDiceRollValue: null,
    lastReconSweepDay: null,
    lastLockpickDay: null,
    lastTargetPracticeDay: null,
    lastBountyDraftDay: null,
    miniBounty: null,
    ...over,
  };
}

/**
 * Both clocks pinned.
 *
 * `Math.random` too, though every call below passes a forced outcome — which
 * is the point. If pinning randomness changed a single number in this fixture,
 * a screen somewhere would be leaving the roll to the reducer, and none does.
 */
function at<T>(nowMs: number, body: () => T): T {
  const realNow = Date.now;
  const realRandom = Math.random;
  Date.now = () => nowMs;
  Math.random = () => 0.5;
  try {
    return body();
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
}

const play = (from: GameState, action: Record<string, unknown>, nowMs = NOW) =>
  at(nowMs, () => reducer(from, action as never));

/** What one press moved. */
function moved(before: GameState, after: GameState) {
  return {
    diamonds: after.diamonds - before.diamonds,
    shards: after.heroShards - before.heroShards,
    gold: after.gold - before.gold,
    totalGold: after.totalGold - before.totalGold,
    buffPct: after.damageBuffPct,
    buffMs: after.damageBuffMs,
  };
}

const FOUR_HOURS = 4 * 60 * 60 * 1000;

/**
 * The cooldown, **bisected** rather than read.
 *
 * Presses the same op at a widening gap from its last use and reports the
 * smallest gap that is allowed through. Reading `MINI_OPS_COOLDOWN_MS` off the
 * reducer would record a constant; this records the rule the constant is for,
 * and it is the measurement that catches a port dividing by a day because the
 * field is called `lastDiceRollDay`.
 */
function bisectCooldown(field: keyof GameState, action: Record<string, unknown>): number {
  const blocked = (gapMs: number) => {
    const before = state({ [field]: NOW - gapMs, diamonds: 0 } as Partial<GameState>);
    return play(before, action).diamonds === before.diamonds;
  };
  let low = 0;
  let high = 48 * 60 * 60 * 1000;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (blocked(mid)) low = mid;
    else high = mid;
  }
  return high;
}

/**
 * The dice payout, from **both** copies.
 *
 * `minigamesReducer.ts` computes it to pay, and `GameScreen.tsx` computes it
 * again to show the player what they won — under a comment reading "Exact same
 * formula as reducer for consistency", which is a duplicate admitting in
 * writing that it must be kept in step by hand.
 *
 * The screen's copy lives inside a React component and cannot be called from
 * here, so its two expressions are lifted out of the source and evaluated.
 * That is deliberately not a text comparison: the entry-cap tripwire in
 * `dungeonsFixture` learned that two copies of one rule can differ in style
 * and agree in behaviour, and the verdict that matters is what they do.
 */
function screenDiceTable(): { roll: number; diamonds: number; shards: number }[] {
  const source = readFileSync(join(__dirname, '..', 'src', 'screens', 'GameScreen.tsx'), 'utf8');
  const start = source.indexOf('const getDiceOutcome');
  const body = source.slice(start, source.indexOf('\n  };', start));
  const pick = (name: string) => {
    const line = body.split('\n').find(row => row.trim().startsWith(`const ${name} =`));
    if (line === undefined) throw new Error(`no ${name} in the screen's copy`);
    return line.slice(line.indexOf('=') + 1).replace(/;.*$/, '');
  };
  const diamonds = new Function('roll', `return ${pick('diamonds')}`) as (roll: number) => number;
  const shards = new Function('roll', `return ${pick('shards')}`) as (roll: number) => number;
  return Array.from({ length: 20 }, (_, index) => index + 1).map(roll => ({
    roll,
    diamonds: diamonds(roll),
    shards: shards(roll),
  }));
}

interface Fixture {
  note: string;
  generatedFrom: string;
  /** Bisected per op, so a shared constant is proved shared rather than assumed. */
  cooldownMs: { op: string; field: string; measuredMs: number }[];
  /** Whether the op is open, at stamps either side of now. */
  cooldownWindow: { gapMs: number; open: boolean }[];
  /** What the cooldown fields are called, against what they hold. */
  cooldownNaming: {
    fields: string[];
    allNamedDay: boolean;
    measuredHours: number;
    /** Whether clamping the stamp to now ever changes the guard's verdict. */
    clampCanChangeTheAnswer: boolean;
  };
  /** Every roll, paid by the reducer. */
  dice: { roll: number; diamonds: number; shards: number }[];
  /** The screen's second copy of the same table, evaluated. */
  diceScreenCopy: { agrees: boolean; copies: string[] };
  recon: { outcome: string; result: ReturnType<typeof moved> }[];
  /**
   * The same three gold payouts either side of a boss wave. Every one of them
   * is priced off `getMonsterGold(state.wave)`, and a boss is worth seven
   * times an ordinary monster.
   */
  bossWaveGold: { wave: number; isBoss: boolean; recon: number; lockpick: number; bountyGold: number }[];
  lockpick: { success: boolean; result: ReturnType<typeof moved> }[];
  target: { score: number; weekNumber: number; shardMultiplier: number; result: ReturnType<typeof moved> }[];
  /**
   * Every weekly event against the same score, at wave one and at wave 120 —
   * the floor binds at one and not at the other.
   */
  targetFloor: { wave: number; weekNumber: number; shardMultiplier: number; shards: number }[];
  bounty: {
    draftType: string;
    title: string;
    metric: string;
    startValue: number;
    targetValue: number;
    rewardGold: number;
    rewardShards: number;
    rewardDiamonds: number;
  }[];
  /** The assault writ's target at five waves, so the floor and the ramp both show. */
  assaultTargets: { wave: number; delta: number }[];
  bountyClaim: { name: string; result: ReturnType<typeof moved>; bountyAfter: string }[];
  /** Whether `claimed` is ever written true by any code path. */
  claimedFlag: { readAtLoad: boolean; guardedOn: boolean; everSetTrue: boolean };
  refusals: { name: string; moved: boolean }[];
  /** How the screens call in: every one forces its outcome. */
  callSites: { op: string; forced: boolean }[];
}

/** Every screen call site, and whether it leaves the roll to the reducer. */
function callSites(): { op: string; forced: boolean }[] {
  const source = readFileSync(join(__dirname, '..', 'src', 'screens', 'GameScreen.tsx'), 'utf8');
  const ops = ['playDiceRoll', 'playReconSweep', 'playLockpickCache', 'playTargetPractice'];
  return ops.map(op => {
    // A call with an empty argument list is one that lets the reducer roll.
    const calls = [...source.matchAll(new RegExp(`${op}\\(([^)]*)\\)`, 'g'))]
      .map(match => match[1].trim())
      .filter(argument => !argument.startsWith(':') && argument !== '');
    return { op, forced: calls.length > 0 };
  });
}

function build(): Fixture {
  const DICE = { type: 'PLAY_DICE_ROLL', forcedRoll: 10 };
  const dice = Array.from({ length: 20 }, (_, index) => index + 1).map(roll => {
    const before = state();
    const after = play(before, { type: 'PLAY_DICE_ROLL', forcedRoll: roll });
    return { roll, diamonds: after.diamonds - before.diamonds, shards: after.heroShards - before.heroShards };
  });

  const recon = (['intel_gold', 'intel_shards', 'intel_buff', 'ambush'] as const).map(outcome => {
    const before = state();
    return { outcome, result: moved(before, play(before, { type: 'PLAY_RECON_SWEEP', forcedOutcome: outcome })) };
  });

  const bossWaveGold = [49, 50, 51, 99, 100, 101].map(wave => {
    const reconBefore = state({ wave });
    const lockBefore = state({ wave });
    const writ = play(state({ wave }), { type: 'START_MINI_BOUNTY_DRAFT', draftType: 'push' }).miniBounty;
    if (!writ) throw new Error(`no writ at wave ${wave}`);
    return {
      wave,
      isBoss: wave % 10 === 0,
      recon: play(reconBefore, { type: 'PLAY_RECON_SWEEP', forcedOutcome: 'intel_gold' }).gold - reconBefore.gold,
      lockpick: play(lockBefore, { type: 'PLAY_LOCKPICK_CACHE', forcedSuccess: false }).gold - lockBefore.gold,
      bountyGold: writ.rewardGold,
    };
  });

  const lockpick = [true, false].map(success => {
    const before = state();
    return { success, result: moved(before, play(before, { type: 'PLAY_LOCKPICK_CACHE', forcedSuccess: success })) };
  });

  // Week 0 multiplies shards by 1 and week 5 by 2.5 — the widest pair the
  // table has, so anything the event fails to reach shows up as a repeat.
  const target = [0, 59, 60, 84, 85, 100].flatMap(score =>
    [0, 5].map(weekNumber => {
      const before = state({ weeklyEventWeek: weekNumber });
      const after = play(before, { type: 'PLAY_TARGET_PRACTICE', forcedScore: score });
      return {
        score,
        weekNumber,
        shardMultiplier: SHARD_MULTIPLIERS[weekNumber],
        result: moved(before, after),
      };
    }),
  );

  // The same perfect score in all eight weeks, at wave one and at wave 120.
  // At wave one the base sits under the floor and only a big enough
  // multiplier lifts it clear; at 120 the floor never binds.
  const targetFloor = [1, 120].flatMap(wave =>
    WEEK_SHARD_MULTIPLIERS.map((shardMultiplier, weekNumber) => {
      const before = state({ weeklyEventWeek: weekNumber, wave, highestWaveReached: wave });
      const after = play(before, { type: 'PLAY_TARGET_PRACTICE', forcedScore: 100 });
      return { wave, weekNumber, shardMultiplier, shards: after.heroShards - before.heroShards };
    }),
  );

  const bounty = (['assault', 'push', 'recruit'] as const).map(draftType => {
    const after = play(state(), { type: 'START_MINI_BOUNTY_DRAFT', draftType });
    const writ = after.miniBounty;
    if (!writ) throw new Error(`${draftType} produced no writ`);
    return {
      draftType,
      title: writ.title,
      metric: writ.metric,
      startValue: writ.startValue,
      targetValue: writ.targetValue,
      rewardGold: writ.rewardGold,
      rewardShards: writ.rewardShards,
      rewardDiamonds: writ.rewardDiamonds,
    };
  });

  const started = play(state(), { type: 'START_MINI_BOUNTY_DRAFT', draftType: 'push' });
  const writ = started.miniBounty;
  if (!writ) throw new Error('no writ to claim');

  const claimAt = (name: string, wave: number) => {
    const before = { ...started, wave, lastBountyDraftDay: null };
    const after = play(before, { type: 'CLAIM_MINI_BOUNTY_DRAFT' });
    return {
      name,
      result: moved(before, after),
      bountyAfter: after.miniBounty === null ? 'null' : after.miniBounty.claimed ? 'claimed' : 'unclaimed',
    };
  };

  const refusal = (name: string, before: GameState, action: Record<string, unknown>, nowMs = NOW) => {
    const after = play(before, action, nowMs);
    const change = moved(before, after);
    return {
      name,
      moved:
        change.diamonds !== 0 || change.shards !== 0 || change.gold !== 0 || after.miniBounty !== before.miniBounty,
    };
  };

  const source = readFileSync(join(__dirname, '..', 'src', 'reducers', 'minigamesReducer.ts'), 'utf8');
  const loader = readFileSync(join(__dirname, '..', 'src', 'useGameState.ts'), 'utf8');

  return {
    note: 'The four mini ops and the bounty draft, measured through the shipped reducer.',
    generatedFrom: 'src/reducers/minigamesReducer.ts',
    cooldownMs: [
      { op: 'dice', field: 'lastDiceRollDay', measuredMs: bisectCooldown('lastDiceRollDay', DICE) },
      {
        op: 'lockpick',
        field: 'lastLockpickDay',
        measuredMs: bisectCooldown('lastLockpickDay', { type: 'PLAY_LOCKPICK_CACHE', forcedSuccess: true }),
      },
      {
        op: 'target',
        field: 'lastTargetPracticeDay',
        measuredMs: bisectCooldown('lastTargetPracticeDay', { type: 'PLAY_TARGET_PRACTICE', forcedScore: 100 }),
      },
    ],
    cooldownWindow: [
      -30 * 86_400_000,
      -3_600_000,
      -1,
      0,
      1,
      FOUR_HOURS - 1,
      FOUR_HOURS,
      FOUR_HOURS + 1,
      30 * 86_400_000,
    ].map(gapMs => {
      const before = state({ lastDiceRollDay: NOW - gapMs });
      return { gapMs, open: play(before, DICE).diamonds !== before.diamonds };
    }),
    cooldownNaming: {
      fields: [
        'lastDiceRollDay',
        'lastReconSweepDay',
        'lastLockpickDay',
        'lastTargetPracticeDay',
        'lastBountyDraftDay',
      ],
      allNamedDay: true,
      measuredHours: bisectCooldown('lastDiceRollDay', DICE) / 3_600_000,
      // Both guards, over every stamp the window probes and a spread of
      // futures besides. They never disagree, which is what makes the clamp
      // dead rather than merely untested.
      clampCanChangeTheAnswer: [-1e12, -86_400_000, -1, 0, 1, FOUR_HOURS, 1e12].some(gapMs => {
        const last = NOW - gapMs;
        const clamped = NOW - Math.min(last, NOW) < FOUR_HOURS;
        const raw = NOW - last < FOUR_HOURS;
        return clamped !== raw;
      }),
    },
    dice,
    diceScreenCopy: {
      agrees: JSON.stringify(screenDiceTable()) === JSON.stringify(dice),
      copies: ['src/reducers/minigamesReducer.ts', 'src/screens/GameScreen.tsx:getDiceOutcome'],
    },
    recon,
    bossWaveGold,
    lockpick,
    target,
    targetFloor,
    bounty,
    assaultTargets: [1, 44, 45, 50, 200].map(wave => {
      const after = play(state({ wave }), { type: 'START_MINI_BOUNTY_DRAFT', draftType: 'assault' });
      const accepted = after.miniBounty;
      if (!accepted) throw new Error(`no assault writ at wave ${wave}`);
      return { wave, delta: accepted.targetValue - accepted.startValue };
    }),
    bountyClaim: [claimAt('one wave short', writ.targetValue - 1), claimAt('exactly on target', writ.targetValue)],
    claimedFlag: {
      readAtLoad: loader.includes('claimed: clampBoolean(payload.miniBounty.claimed'),
      guardedOn: source.includes('bounty.claimed'),
      everSetTrue: /claimed:\s*true/.test(source),
    },
    refusals: [
      refusal('dice inside the cooldown', state({ lastDiceRollDay: NOW - 1000 }), DICE),
      refusal('recon inside the cooldown', state({ lastReconSweepDay: NOW - 1000 }), {
        type: 'PLAY_RECON_SWEEP',
        forcedOutcome: 'intel_gold',
      }),
      /*
       * The cooldown is cleared first, on purpose. Accepting a writ stamps
       * `lastBountyDraftDay`, so a second attempt at the same instant is
       * refused by the *cooldown* and never reaches the guard this case is
       * named for — which is exactly what the first version of this line did,
       * and an injection deleting `|| state.miniBounty` sailed through it.
       */
      refusal(
        'a second writ while one is live',
        { ...started, lastBountyDraftDay: null },
        {
          type: 'START_MINI_BOUNTY_DRAFT',
          draftType: 'assault',
        },
      ),
      refusal('a writ inside the cooldown, with none live', state({ lastBountyDraftDay: NOW - 1000 }), {
        type: 'START_MINI_BOUNTY_DRAFT',
        draftType: 'assault',
      }),
      refusal('claiming with no writ at all', state(), { type: 'CLAIM_MINI_BOUNTY_DRAFT' }),
      refusal('claiming a writ that is short', started, { type: 'CLAIM_MINI_BOUNTY_DRAFT' }),
      // A clock rolled forward past the last press: still refused, because the
      // guard clamps the stored stamp to now before subtracting.
      refusal('dice with the stamp in the future', state({ lastDiceRollDay: NOW + 86_400_000 }), DICE),
    ],
    callSites: callSites(),
  };
}

/**
 * Every week's shard multiplier, read from the shipped table rather than
 * retyped — the fixture should not carry its own copy of a number it is
 * measuring against.
 */
const WEEK_SHARD_MULTIPLIERS: readonly number[] = WEEKLY_EVENTS.map(event => event.shardMultiplier);
const SHARD_MULTIPLIERS: Record<number, number> = {
  0: WEEK_SHARD_MULTIPLIERS[0],
  5: WEEK_SHARD_MULTIPLIERS[5],
};

const fixture = build();

if (process.env.UPDATE_MINIGAMES_FIXTURE === '1') {
  mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
}

describe('the cooldown every mini op shares', () => {
  it('is four hours, not the day every field name claims', () => {
    /*
     * `lastDiceRollDay`, `lastReconSweepDay`, `lastLockpickDay`,
     * `lastTargetPracticeDay`, `lastBountyDraftDay` — five fields named for a
     * day, all holding a millisecond timestamp, all compared against four
     * hours. The names are a fossil: a legacy save really did store a day
     * number there, and the loader still migrates one by multiplying.
     *
     * Bisected rather than read, because a port that divides by 86,400,000
     * because the field says `Day` passes every test that records the
     * constant and none that measures the gap.
     */
    expect(fixture.cooldownNaming.measuredHours).toBe(4);
    expect(fixture.cooldownNaming.allNamedDay).toBe(true);
    expect(fixture.cooldownNaming.fields.every(name => name.endsWith('Day'))).toBe(true);
  });

  it('is the same four hours for every op, measured one op at a time', () => {
    // Shared in the source through one constant, but a shared constant is not
    // the claim — that each op waits the same is.
    expect(fixture.cooldownMs.map(row => row.measuredMs)).toEqual([FOUR_HOURS, FOUR_HOURS, FOUR_HOURS]);
  });

  it('opens at four hours and is shut everywhere before it, the future included', () => {
    /*
     * The whole window, rather than one point inside it. A negative gap is a
     * stamp from the future — a clock wound back, or a save carried between
     * devices — and it is shut too.
     */
    expect(fixture.cooldownWindow).toEqual([
      { gapMs: -30 * 86_400_000, open: false },
      { gapMs: -3_600_000, open: false },
      { gapMs: -1, open: false },
      { gapMs: 0, open: false },
      { gapMs: 1, open: false },
      { gapMs: FOUR_HOURS - 1, open: false },
      { gapMs: FOUR_HOURS, open: true },
      { gapMs: FOUR_HOURS + 1, open: true },
      { gapMs: 30 * 86_400_000, open: true },
    ]);
  });

  it('guards the future with a clamp that cannot change the answer', () => {
    /*
     * **An injection that did not bite, and the finding is the injection.**
     *
     * `isMiniOpOnCooldown` clamps the stored stamp with
     * `Math.min(lastUsedMs, nowMs)` before subtracting. Deleting that line
     * left all twenty-two tests green, and that is correct: the clamp is
     * unreachable by construction. It only does anything when the stamp is in
     * the future, and in that case the unclamped gap is *negative* — which is
     * below a positive cooldown exactly as the clamped zero is. The two
     * branches cannot disagree.
     *
     * The window above is what actually holds the rule, so it is what the
     * rewrite reproduces. The clamp is not ported: a defensive line that
     * defends nothing reads like a guard and tests like nothing, which is the
     * worst combination for whoever edits it next.
     *
     * The load-time sanitiser is the guard that *is* real — it clamps the
     * stamp into `[0, now]` as the save comes in, so a doctored save cannot
     * carry a stamp the runtime would have to reason about at all.
     */
    const negative = fixture.cooldownWindow.filter(row => row.gapMs <= 0);
    expect(negative.every(row => !row.open)).toBe(true);
    expect(fixture.cooldownNaming.clampCanChangeTheAnswer).toBe(false);
  });
});

describe('the dice roll', () => {
  it('pays five bands of diamonds, and shards only from fifteen', () => {
    expect(fixture.dice.map(row => row.diamonds)).toEqual([
      5, 5, 5, 5, 5, 5, 5, 5, 8, 8, 8, 8, 12, 12, 12, 12, 18, 18, 18, 30,
    ]);
    expect(fixture.dice.map(row => row.shards)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 180, 192, 204, 216, 228, 240,
    ]);
  });

  it('is written a second time in the screen, and the two agree', () => {
    /*
     * The screen computes the same table to show the player what they won,
     * under a comment reading "Exact same formula as reducer for consistency".
     * They do agree today. The point is that nothing makes them: the two are
     * kept in step by hand, and a divergence shows a player one number and
     * pays them another.
     *
     * Evaluated rather than diffed as text, for the reason the entry-cap
     * tripwire established — what a copy *does* is the claim.
     */
    expect(fixture.diceScreenCopy.copies).toHaveLength(2);
    expect(fixture.diceScreenCopy.agrees).toBe(true);
  });
});

describe('the recon sweep', () => {
  it('pays gold on every outcome, and only the ambush cuts it', () => {
    const gold = new Map(fixture.recon.map(row => [row.outcome, row.result.gold]));
    const full = gold.get('intel_gold');
    expect(full).toBeGreaterThan(0);
    expect(gold.get('intel_shards')).toBe(full);
    expect(gold.get('intel_buff')).toBe(full);
    expect(gold.get('ambush')).toBeLessThan(full as number);
  });

  it('adds every gold it pays to the lifetime total', () => {
    // The banking bug's fourth cousin: gold that moves the purse and not the
    // tally is gold five achievements never see.
    expect(fixture.recon.every(row => row.result.gold === row.result.totalGold)).toBe(true);
  });

  it('pays shards on one outcome and a damage buff on another, never both', () => {
    const shards = fixture.recon.filter(row => row.result.shards > 0).map(row => row.outcome);
    const buffed = fixture.recon.filter(row => row.result.buffPct > 0).map(row => row.outcome);
    expect(shards).toEqual(['intel_shards']);
    expect(buffed).toEqual(['intel_buff']);
  });

  it('pays six to eight times as much when the player is standing on a boss wave', () => {
    /*
     * Every gold payout in this file is priced off `getMonsterGold(state.wave)`
     * — the **current** wave, not the deepest — and `getMonsterGold` pays a
     * boss wave seven times an ordinary one. So the four-hour cooldown is only
     * half the decision: the other half is *where you are standing* when you
     * press, and waves 50, 100, 150 are worth six times their neighbours.
     *
     * Not visible from the reducer, which says `getMonsterGold(state.wave)`
     * and looks like a scale factor. Measured across three waves on each side.
     *
     * Reproduced rather than corrected — it is the same formula every kill
     * reward uses, and flattening it would change the economy rather than port
     * it. But it is *said out loud* on the surface, the way the Events screen
     * says the week turns on a Thursday: a timing quirk a player can see is a
     * choice, and one they cannot is a secret handshake.
     */
    const bosses = fixture.bossWaveGold.filter(row => row.isBoss);
    expect(bosses).toHaveLength(2);
    for (const boss of bosses) {
      const before = fixture.bossWaveGold.find(row => row.wave === boss.wave - 1);
      const after = fixture.bossWaveGold.find(row => row.wave === boss.wave + 1);
      for (const neighbour of [before, after]) {
        const other = neighbour as { recon: number; lockpick: number; bountyGold: number };
        expect(boss.recon / other.recon).toBeGreaterThan(5);
        expect(boss.lockpick / other.lockpick).toBeGreaterThan(5);
        expect(boss.bountyGold / other.bountyGold).toBeGreaterThan(5);
      }
    }
  });

  it('gives the buff a duration as well as a size', () => {
    // Both axes, because the engine keeps them apart: a percentage with no
    // milliseconds is a buff that never expires.
    const buff = fixture.recon.find(row => row.outcome === 'intel_buff');
    expect(buff?.result.buffPct).toBeCloseTo(0.18, 10);
    expect(buff?.result.buffMs).toBe(120_000);
  });
});

describe('the lockpick cache', () => {
  it('pays diamonds when it opens and gold when it jams', () => {
    const [opened, jammed] = fixture.lockpick;
    expect(opened.result.diamonds).toBeGreaterThan(0);
    expect(opened.result.gold).toBe(0);
    expect(jammed.result.diamonds).toBe(0);
    expect(jammed.result.gold).toBeGreaterThan(0);
  });

  it('never pays nothing', () => {
    // A failed cache is a consolation, not a loss — which is what makes the
    // three guesses a game rather than a tax.
    expect(fixture.lockpick.every(row => row.result.diamonds + row.result.gold > 0)).toBe(true);
  });
});

describe('target practice', () => {
  it('pays three bands, at fifty-nine, eighty-four and above', () => {
    const atWeek = (week: number) => fixture.target.filter(row => row.weekNumber === week);
    const diamonds = atWeek(0).map(row => row.result.diamonds);
    expect(diamonds).toEqual([2, 2, 6, 6, 12, 12]);
  });

  it('scales the shards by the weekly event and the diamonds not at all', () => {
    /*
     * The asymmetry is the finding. `weekly.shardMultiplier` reaches the shard
     * arithmetic and nothing else, so a 2.5x shard week leaves the diamond
     * payout exactly where it was. Reproduced rather than corrected — the
     * event is called a *shard* event and the table is a shard table.
     */
    const byScore = new Map<number, { week: number; shards: number; diamonds: number }[]>();
    for (const row of fixture.target) {
      const rows = byScore.get(row.score) ?? [];
      rows.push({ week: row.weekNumber, shards: row.result.shards, diamonds: row.result.diamonds });
      byScore.set(row.score, rows);
    }
    for (const rows of byScore.values()) {
      const [plain, event] = rows;
      expect(event.shards).toBeGreaterThan(plain.shards);
      expect(event.diamonds).toBe(plain.diamonds);
    }
  });

  it('hides most of the weekly event at wave one, because the floor is applied after it', () => {
    /*
     * `Math.max(140, Math.floor((80 + wave * 1.8) * multiplier))` — the floor
     * comes **last**, so at wave one the base sits under it and only a
     * multiplier big enough to lift it clear changes anything.
     *
     * Measured, and narrower than it first looked: six of the eight weeks pay
     * an identical 140, because 1x, 1.15x and 1.5x all land under the floor.
     * Only `double_shard_drops` and `nightmare_assault` get through. So a new
     * account is told a shard event is running and, five weeks in eight,
     * watches it do nothing here.
     *
     * Recorded, not fixed: moving the floor inside the multiply would change
     * the payout at every wave, which is a balance decision and not a port.
     */
    const atWave = (wave: number) => fixture.targetFloor.filter(row => row.wave === wave);

    const shallow = atWave(1);
    const swallowed = shallow.filter(row => row.shards === 140);
    expect(swallowed.map(row => row.shardMultiplier)).toEqual([1, 1.15, 1, 1, 1.5, 1.15]);
    expect(shallow.filter(row => row.shards > 140).map(row => row.shardMultiplier)).toEqual([2, 2.5]);

    // Deep enough and the floor never binds, so every distinct multiplier pays
    // a distinct number — the same event, worth nothing to a new account.
    const deep = atWave(120);
    for (const row of deep) {
      const plain = deep.find(other => other.shardMultiplier === 1);
      if (row.shardMultiplier === 1) continue;
      expect(row.shards).toBeGreaterThan((plain as { shards: number }).shards);
    }
    expect(new Set(deep.map(row => row.shards)).size).toBe(new Set(deep.map(row => row.shardMultiplier)).size);
  });
});

describe('the bounty draft', () => {
  it('writes three writs, one per metric', () => {
    expect(fixture.bounty.map(row => [row.draftType, row.metric, row.title])).toEqual([
      ['assault', 'kills', 'Assault Writ'],
      ['push', 'wave', 'Frontline Push'],
      ['recruit', 'summons', 'Recruit Surge'],
    ]);
  });

  it('sets the target relative to where the player stands when they accept it', () => {
    /*
     * Which is what makes it a *draft* rather than a goal: the same writ asks
     * more of a deeper account.
     *
     * The assault delta is `max(120, floor(80 + wave * 0.9))`, so the floor
     * binds up to wave 44 and the wave term takes over after — 125 at wave 50,
     * measured. I had predicted 120 from the floor alone and the reducer
     * corrected it, which is the whole reason the number is taken from a run
     * rather than from reading.
     */
    const [assault, push, recruit] = fixture.bounty;
    expect(assault.targetValue - assault.startValue).toBe(125);
    expect(push.targetValue - push.startValue).toBe(8);
    expect(recruit.targetValue - recruit.startValue).toBe(8);

    // Each writ counts from the metric it names, at the value it had on accept.
    expect(assault.startValue).toBe(4000);
    expect(push.startValue).toBe(50);
    expect(recruit.startValue).toBe(30);
  });

  it('floors the assault target for a shallow account, and scales it for a deep one', () => {
    // The floor and the ramp both measured, because a port keeping only one
    // of them is right at exactly one wave.
    expect(fixture.assaultTargets).toEqual([
      { wave: 1, delta: 120 },
      { wave: 44, delta: 120 },
      { wave: 45, delta: 120 },
      { wave: 50, delta: 125 },
      { wave: 200, delta: 260 },
    ]);
  });

  it('pays nothing until the metric reaches the target, then pays all three', () => {
    const [short, met] = fixture.bountyClaim;
    expect(short.result).toEqual({ diamonds: 0, shards: 0, gold: 0, totalGold: 0, buffPct: 0, buffMs: 0 });
    expect(met.result.gold).toBeGreaterThan(0);
    expect(met.result.shards).toBeGreaterThan(0);
    expect(met.result.diamonds).toBeGreaterThan(0);
    expect(met.result.gold).toBe(met.result.totalGold);
  });

  it('clears the writ on payout, so `claimed` is never written true', () => {
    /*
     * A dead field, and an unusual one: `claimed` is sanitised at load and
     * guarded on at claim, so both ends of its life exist — but no code path
     * sets it. The claim nulls the whole writ instead.
     *
     * It can only ever be true in a save that arrived saying so, which nothing
     * produces. The rewrite has no such field, and this is the test that says
     * dropping it loses nothing.
     */
    expect(fixture.bountyClaim[1].bountyAfter).toBe('null');
    expect(fixture.claimedFlag.readAtLoad).toBe(true);
    expect(fixture.claimedFlag.guardedOn).toBe(true);
    expect(fixture.claimedFlag.everSetTrue).toBe(false);
  });

  it('refuses a second writ while one is live, and a claim with none', () => {
    /*
     * Two guards, measured one at a time. Accepting a writ sets the cooldown
     * *and* leaves a writ standing, so a case that changes neither proves only
     * that one of them fired — the first version of this test cleared nothing
     * and an injection deleting the live-writ guard passed it.
     */
    const named = new Map(fixture.refusals.map(row => [row.name, row.moved]));
    expect(named.get('a second writ while one is live')).toBe(false);
    expect(named.get('a writ inside the cooldown, with none live')).toBe(false);
    expect(named.get('claiming with no writ at all')).toBe(false);
    expect(named.get('claiming a writ that is short')).toBe(false);
  });
});

describe('who decides the outcome', () => {
  it('is the screen, on every one of the four', () => {
    /*
     * The reducer rolls only when the caller passes nothing, and no caller
     * does. `playDiceRoll(diceRollResult.roll)` hands over a roll the screen
     * animated; `playLockpickCache(lockpickSolved)` hands over whether the
     * player cracked a two-digit code in three guesses; `playTargetPractice`
     * hands over a score earned by stopping a moving meter.
     *
     * So `Math.random() < 0.46` in the lockpick case is not the success rate —
     * it is a stand-in for a game the player actually plays, and it has never
     * run. The rewrite keeps this seam exactly: the surface plays, the engine
     * pays, and the outcome is an argument. Which is also what the engine
     * boundary requires, so the port and the rule agree for once.
     */
    expect(fixture.callSites).toEqual([
      { op: 'playDiceRoll', forced: true },
      { op: 'playReconSweep', forced: true },
      { op: 'playLockpickCache', forced: true },
      { op: 'playTargetPractice', forced: true },
    ]);
  });
});

describe('the fixture itself', () => {
  it('has been written out for the port to read', () => {
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    const onDisk = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(fixture)));
  });
});
