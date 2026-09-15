import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { getMonsterAffixModifiers, getMonsterAffixes } from '../../content/affixes';
import { getMonsterMaxHp } from '../waves/curves';
import {
  CHAPTER_WAVES,
  HERO_LEVEL_CAP,
  MAX_ROUNDS,
  TICK_MS,
  chapterStartWave,
  estimateOffline,
  resolveRound,
  retreatWave,
  type OfflineConditions,
} from './estimate';
import fixture from './__fixtures__/offline-progress.json';

/**
 * The new side of the offline contract.
 * `__tests__/offlineProgressFixture.test.ts` owns the other.
 *
 * This one cannot be a parity test in the sense the damage ports are. The
 * shipped simulator replays the entire combat loop, potions, burst charge,
 * ability cadence and all; the estimator resolves whole rounds from averages.
 * Agreement to twelve decimal places was never available. What is available is
 * a *stated* accuracy, measured, with the cases where it does not hold named
 * rather than averaged away — which is what the last block below does.
 */

function conditionsFor(name: string): OfflineConditions {
  const found = fixture.scenarios.find(entry => entry.name === name);
  if (!found) throw new Error(`no scenario ${name}`);
  const inputs = found.inputs;
  if (inputs.enemyHpMult === null || inputs.incomingMult === null) {
    throw new Error(`scenario ${name} has no measured multipliers`);
  }
  return {
    dps: new Decimal(inputs.finalDps),
    sustainedDpsMult: inputs.sustainedDpsMult,
    dpsPerHeroLevel: new Decimal(inputs.dpsPerHeroLevel),
    teamHpPerHeroLevel: new Decimal(inputs.teamHpPerHeroLevel),
    heroLevel: inputs.heroLevel,
    teamMaxHp: new Decimal(inputs.teamMaxHp),
    enemyHpMult: inputs.enemyHpMult,
    incomingMult: inputs.incomingMult,
    goldMult: inputs.goldMult ?? 1,
    expMult: inputs.expMult ?? 1,
    tempo: 1,
  };
}

const startWaveFor = (name: string) => fixture.scenarios.find(entry => entry.name === name)!.inputs.wave;

describe('where a defeat leaves you', () => {
  it('retreats to the start of the current chapter', () => {
    expect(chapterStartWave(1)).toBe(1);
    expect(chapterStartWave(20)).toBe(1);
    expect(chapterStartWave(21)).toBe(21);
    expect(chapterStartWave(118)).toBe(101);
    expect(retreatWave(118)).toBe(101);
    expect(CHAPTER_WAVES).toBe(20);
  });

  it('costs a further chapter when you lose standing on the boundary', () => {
    // Losing at wave 121 — the first wave of its chapter — does not leave you
    // where you already are, so it takes the chapter before.
    expect(retreatWave(121)).toBe(101);
    expect(retreatWave(122)).toBe(121);
  });

  it('never retreats below wave one', () => {
    expect(retreatWave(1)).toBe(1);
    expect(retreatWave(5)).toBe(1);
    expect(chapterStartWave(0)).toBe(1);
    expect(chapterStartWave(-40)).toBe(1);
  });
});

describe('resolving a single round', () => {
  const base = conditionsFor('at-ceiling');

  it('decides the outcome before the round starts', () => {
    // The team is always at full HP when a round begins, so survival is a
    // comparison rather than an integration. That is what makes the whole
    // window computable without stepping.
    const round = resolveRound(110, base.dps, base.teamMaxHp, base);
    expect(round.survives).toBe(round.damageTaken.lt(base.teamMaxHp));
  });

  it('never resolves faster than one combat tick', () => {
    // A maxed roster flattens a wave-one monster in microseconds; the shipped
    // stepper still spends a tick on it, because it rounds every slice up.
    const fast = resolveRound(1, new Decimal('1e30'), base.teamMaxHp, base);
    expect(fast.killMs).toBe(TICK_MS);
  });

  it('applies the affix the wave actually carries', () => {
    // Affixes cycle every five waves, so two adjacent waves are not the same
    // fight. Folding one of them into a constant is what put an early climb
    // out by a factor of three.
    const armored = getMonsterAffixModifiers(1);
    const berserk = getMonsterAffixModifiers(2);
    expect(armored.hpMult).toBeCloseTo(1.18, 10);
    expect(berserk.hpMult).toBeCloseTo(1.0, 10);
    expect(berserk.damageMult).toBeCloseTo(1.28, 10);

    const quiet = { ...base, enemyHpMult: 1, incomingMult: 1, sustainedDpsMult: 1, tempo: 1 };
    const onOne = resolveRound(1, new Decimal(1000), base.teamMaxHp, quiet);
    const expected = getMonsterMaxHp(1).mul(1.18).div(1000).mul(1000).toNumber();
    expect(onOne.killMs).toBeCloseTo(Math.max(TICK_MS, expected), 6);
  });

  it('gives every boss wave two affixes, the guard against one notwithstanding', () => {
    /*
     * The shipped code only adds the second affix `if (secondary.id !==
     * primary.id)`. That branch never fires: the pool has five entries, the
     * primary is drawn at `wave - 1` and the secondary at `wave + 2`, and
     * those indices differ by three modulo five for every wave there is. So
     * the guard is dead code and every boss carries two.
     *
     * Ported as-is, and asserted across a full cycle so that changing the pool
     * size to something the guard *could* fire on has to be a decision.
     */
    expect(getMonsterAffixes(11).length).toBe(1);
    for (let boss = 10; boss <= 200; boss += 10) {
      const ids = getMonsterAffixes(boss).map(affix => affix.id);
      expect({ boss, count: ids.length, distinct: new Set(ids).size }).toEqual({ boss, count: 2, distinct: 2 });
    }
  });

  it('treats a round that exactly empties the bar as a loss', () => {
    // Matching the shipped `teamHp <= 0`, which is a loss at exactly zero.
    const exact = resolveRound(110, base.dps, base.teamMaxHp, base);
    const onTheNose = { ...base, teamMaxHp: exact.damageTaken };
    expect(resolveRound(110, base.dps, onTheNose.teamMaxHp, onTheNose).survives).toBe(false);
  });
});

describe('estimating a window', () => {
  it('climbs one wave per kill while the team is winning', () => {
    const conditions = conditionsFor('climbing');
    const estimate = estimateOffline(startWaveFor('climbing'), 60_000, conditions);
    expect(estimate.deaths).toBe(0);
    expect(estimate.waveDelta).toBe(estimate.kills);
  });

  it('keeps the sign on a window that ends behind where it started', () => {
    // The shipped reward popup reports `Math.max(0, delta)`, so a player who
    // lost a chapter is told they gained nothing. The estimator reports it.
    // Wave 121 is the first of its chapter, so losing there costs the whole
    // chapter before it and the window is short enough to catch the retreat
    // before the climb back hides it.
    // Wave 130 is past this team's ceiling, and its chapter starts at 121, so
    // the first defeat costs nine waves outright.
    const conditions = conditionsFor('at-ceiling');
    const estimate = estimateOffline(130, 20_000, conditions);
    expect(estimate.deaths).toBeGreaterThan(0);
    expect(estimate.wave).toBeLessThan(130);
    expect(estimate.waveDelta).toBeLessThan(0);
    expect(Math.max(0, estimate.waveDelta)).toBe(0);
  });

  it('resolves a stalemate in one step instead of 28,800', () => {
    /*
     * A team that can neither kill nor be killed is the case that costs the
     * shipped simulator 16.8 seconds for an eight hour window: with no event
     * to bound the slice it steps a second at a time to the end. Here it is
     * one round.
     */
    const conditions: OfflineConditions = {
      ...conditionsFor('at-ceiling'),
      dps: new Decimal(1),
      incomingMult: 0,
    };
    const estimate = estimateOffline(400, 8 * 60 * 60 * 1000, conditions);
    // Nothing resolved in eight hours, which is exactly what `stalled` means.
    expect(estimate.method).toBe('stalled');
    expect(estimate.kills).toBe(0);
    expect(estimate.deaths).toBe(0);
    expect(estimate.msSpent).toBe(8 * 60 * 60 * 1000);
  });

  it('extrapolates the repeat rather than replaying it', () => {
    const conditions = conditionsFor('at-ceiling');
    const estimate = estimateOffline(startWaveFor('at-ceiling'), 60 * 60 * 1000, conditions);
    expect(estimate.method).toBe('extrapolated');
    expect(estimate.cyclesExtrapolated).toBeGreaterThan(50);
    // The saving is the point: an hour of sawtooth costs a few dozen rounds.
    expect(estimate.roundsExhausted).toBe(false);
  });

  it('scales sublinearly with the window, which stepping cannot', () => {
    const conditions = conditionsFor('at-ceiling');
    const start = startWaveFor('at-ceiling');
    const hour = estimateOffline(start, 60 * 60 * 1000, conditions);
    const eight = estimateOffline(start, 8 * 60 * 60 * 1000, conditions);
    // Eight times the window, eight times the kills, same bounded work.
    expect(eight.kills / hour.kills).toBeGreaterThan(6);
    expect(eight.roundsExhausted).toBe(false);
    expect(eight.cyclesExtrapolated).toBeGreaterThan(hour.cyclesExtrapolated);
  });

  it('is deterministic', () => {
    const conditions = conditionsFor('at-ceiling');
    const once = estimateOffline(110, 900_000, conditions);
    const twice = estimateOffline(110, 900_000, conditions);
    expect({ ...once, gold: once.gold.toString(), exp: once.exp.toString() }).toEqual({
      ...twice,
      gold: twice.gold.toString(),
      exp: twice.exp.toString(),
    });
  });

  it('does nothing with an empty or negative window', () => {
    const conditions = conditionsFor('at-ceiling');
    for (const window of [0, -1, -60_000]) {
      const estimate = estimateOffline(110, window, conditions);
      expect({ window, kills: estimate.kills, delta: estimate.waveDelta }).toEqual({ window, kills: 0, delta: 0 });
    }
  });

  it('gets further because heroes level as they kill', () => {
    /*
     * Both halves of the feedback loop, asserted directly rather than through
     * the divergence bands — which were loose enough that deleting the damage
     * half left the whole suite green.
     *
     * A roster that gains nothing per kill must not reach as deep as one that
     * does, and must not survive as long either.
     */
    const live = conditionsFor('climbing');
    const frozen = { ...live, dpsPerHeroLevel: new Decimal(0), teamHpPerHeroLevel: new Decimal(0) };
    expect(live.dpsPerHeroLevel.gt(0)).toBe(true);
    expect(live.teamHpPerHeroLevel.gt(0)).toBe(true);

    const start = startWaveFor('climbing');
    const growing = estimateOffline(start, 30 * 60 * 1000, live);
    const flat = estimateOffline(start, 30 * 60 * 1000, frozen);
    expect(growing.wave).toBeGreaterThan(flat.wave);

    // Damage alone, so neither half can stand in for the other.
    const damageOnly = { ...live, teamHpPerHeroLevel: new Decimal(0) };
    const hpOnly = { ...live, dpsPerHeroLevel: new Decimal(0) };
    expect(estimateOffline(start, 30 * 60 * 1000, damageOnly).wave).toBeGreaterThan(flat.wave);
    expect(estimateOffline(start, 30 * 60 * 1000, hpOnly).kills).not.toBe(flat.kills);
  });

  it('stops levelling heroes at the cap', () => {
    const conditions = { ...conditionsFor('climbing'), heroLevel: HERO_LEVEL_CAP - 2 };
    const estimate = estimateOffline(startWaveFor('climbing'), 600_000, conditions);
    expect(estimate.heroLevel).toBe(HERO_LEVEL_CAP);
    expect(HERO_LEVEL_CAP).toBe(999);
  });

  it('is bounded even when every round differs', () => {
    // Rounds only stay distinct while heroes are still levelling, and the cap
    // is 999 — but the bound exists so a pathological input cannot hang a
    // load screen, which is the failure this module exists to prevent.
    expect(MAX_ROUNDS).toBeGreaterThan(1_000);
    const conditions = { ...conditionsFor('climbing'), incomingMult: 0 };
    const estimate = estimateOffline(1, 365 * 24 * 60 * 60 * 1000, conditions);
    expect(estimate.kills).toBeLessThanOrEqual(MAX_ROUNDS);
  });
});

describe('how close it gets, and where it does not', () => {
  /*
   * Measured against the shipped simulator and committed as numbers, with the
   * cases it does not cover named rather than averaged into a wide tolerance.
   *
   * The dividing line is whether the team starts near the deepest wave it can
   * survive. At the ceiling — the steady state, and the case that costs the
   * shipped simulator seconds per load — the estimator is worth a few percent.
   * Across a long climb it is not, and the reason is specific: monster HP is
   * five times higher on every tenth wave, and the shipped game clears those
   * bosses with the very things this estimator averages. A burst charge spent
   * on cue, a whole team's abilities landing together (112x damage for the
   * millisecond they overlap), an auto-potion mid-fight. A mean cannot spend a
   * cooldown at the right moment, so the estimator stalls below a boss wall
   * the reference walks through, and then farms the cheap waves beneath it.
   *
   * Closing that gap means modelling the cooldowns instead of their mean,
   * which is a decision about how combat works rather than a translation of
   * it. Until then this is what the estimator is good for, stated plainly.
   */
  interface Comparison {
    scenario: string;
    elapsedMs: number;
    refKills: number;
    estKills: number;
    refWave: number;
    estWave: number;
  }

  /** The first wave this team cannot survive, searched upward from the start. */
  function ceilingAbove(startWave: number, conditions: OfflineConditions): number {
    for (let wave = startWave; wave < startWave + 1_000; wave += 1) {
      if (!resolveRound(wave, conditions.dps, conditions.teamMaxHp, conditions).survives) return wave;
    }
    return startWave + 1_000;
  }

  const comparisons: Comparison[] = fixture.scenarios.flatMap(entry => {
    if (entry.inputs.enemyHpMult === null || entry.inputs.incomingMult === null) return [];
    const conditions = conditionsFor(entry.name);
    return entry.windows.map(window => {
      const estimate = estimateOffline(entry.inputs.wave, window.elapsedMs, conditions);
      return {
        scenario: entry.name,
        elapsedMs: window.elapsedMs,
        refKills: window.kills,
        estKills: estimate.kills,
        refWave: window.endWave,
        estWave: estimate.wave,
      };
    });
  });

  /**
   * Measured accuracy per scenario, committed.
   *
   * A per-scenario table rather than a classifier: a rule like "within one
   * chapter of the ceiling" sounds principled and then puts `climbing` — which
   * is 1.00 over a minute and 1.29 over an hour — on whichever side makes the
   * suite green. These are numbers that were measured, and improving the
   * estimator should change them.
   */
  const ACCURACY: Record<string, { min: number; max: number; why: string }> = {
    'at-ceiling': { min: 0.9, max: 1.1, why: 'steady state: no wall to cross, so the averages hold' },
    'loses-ground': { min: 0.9, max: 1.1, why: 'steady state, starting just under the wall' },
    climbing: { min: 0.8, max: 1.4, why: 'clears two boss waves in an hour that the estimator stalls on' },
    fresh: { min: 0.9, max: 4.5, why: 'climbs from wave three; every chapter boundary is a wall' },
    'post-rebirth': { min: 0.9, max: 4.0, why: 'a maxed roster climbing from wave one, the worst case for a mean' },
  };

  it('holds every scenario to its measured accuracy', () => {
    for (const row of comparisons) {
      const band = ACCURACY[row.scenario];
      expect({ scenario: row.scenario, known: !!band }).toEqual({ scenario: row.scenario, known: true });
      const ratio = row.estKills / row.refKills;
      expect({
        scenario: row.scenario,
        ms: row.elapsedMs,
        inBand: ratio >= band.min && ratio <= band.max,
      }).toEqual({ scenario: row.scenario, ms: row.elapsedMs, inBand: true });
    }
  });

  it('is worth a tenth in the steady state and much less on a climb', () => {
    // The headline, asserted rather than described. The steady state is also
    // the case that costs the shipped simulator the most to compute, so the
    // estimator is accurate exactly where it is needed.
    const steady = ['at-ceiling', 'loses-ground'];
    for (const scenario of steady) {
      expect({ scenario, tight: ACCURACY[scenario].max <= 1.1 }).toEqual({ scenario, tight: true });
    }
    const climbs = ['fresh', 'post-rebirth'];
    for (const scenario of climbs) {
      expect({ scenario, loose: ACCURACY[scenario].max >= 3 }).toEqual({ scenario, loose: true });
    }
  });

  it('agrees closely on short windows even while climbing', () => {
    // A minute does not reach a wall, so the averages are fine there. This is
    // what says the inaccuracy is the wall and not the model in general.
    for (const row of comparisons.filter(entry => entry.elapsedMs <= 60_000)) {
      const ratio = row.estKills / row.refKills;
      expect({ scenario: row.scenario, within: ratio > 0.8 && ratio < 1.2 }).toEqual({
        scenario: row.scenario,
        within: true,
      });
    }
  });

  it('confirms the boss wall is what stops a climb', () => {
    // Not an inference from the divergence: the tenth wave really is five
    // times the HP, and that really is where these runs stop.
    for (const row of comparisons.filter(
      entry => entry.scenario !== 'at-ceiling' && entry.scenario !== 'loses-ground',
    )) {
      const conditions = conditionsFor(row.scenario);
      const ceiling = ceilingAbove(row.scenario === 'fresh' ? 3 : 1, conditions);
      expect({ scenario: row.scenario, boss: ceiling % 10 === 0 }).toEqual({ scenario: row.scenario, boss: true });
    }
  });
});
