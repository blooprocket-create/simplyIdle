import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { getAttackIntervalMs } from '../content/attackSpeeds';
import { MAX_ATTACKS_PER_STEP } from './combat/attackTimer';
import { TELL_HIT_UID } from './combat/burst';
import { chapterStartWave, retreatWave } from './combat/chapters';
import { bossMechanicForWave } from '../content/bossMechanics';
import { AWAY_THRESHOLD_MS } from './offline/awayCredit';
import { estimateOffline, retreatWave as estimateRetreatWave } from './offline/estimate';
import { Simulation } from './Simulation';
import type { PlayerClass } from '../content/classes';
import { createHeroEntity, nominalDps, startOffsetMs, type HeroEntity } from './entities/HeroEntity';

/**
 * Discrete attacks are new behaviour, not a port — the shipped combat applies
 * `dps * dt` with no cadence at all. So these tests cannot compare against a
 * reference; what they pin instead is the contract the change was made under:
 * **average DPS is unchanged, and everything the discrete model costs shows up
 * as overkill**, measured rather than absorbed.
 */

function hero(uid: string, dps: number, intervalMs: number): HeroEntity {
  return createHeroEntity(uid, new Decimal(dps), intervalMs);
}

/** A team big enough to be interesting, slow enough to reach a wave quickly. */
function team(): HeroEntity[] {
  return [
    hero('a', 1_000, getAttackIntervalMs('archer')),
    hero('b', 1_000, getAttackIntervalMs('mage')),
    hero('c', 1_000, getAttackIntervalMs('warrior')),
  ];
}

function run(sim: Simulation, totalMs: number, stepMs: number): void {
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    sim.advance(Math.min(stepMs, totalMs - elapsed));
  }
}

describe('average dps survives the move to discrete attacks', () => {
  it('derives damage per hit so a slower class hits proportionally harder', () => {
    const fast = hero('f', 1_000, 500);
    const slow = hero('s', 1_000, 2_000);
    expect(fast.damagePerHit.toNumber()).toBe(500);
    expect(slow.damagePerHit.toNumber()).toBe(2_000);
    // Same rate, four times the interval, four times the hit.
    expect(nominalDps(fast).toNumber()).toBe(1_000);
    expect(nominalDps(slow).toNumber()).toBe(1_000);
  });

  it('lands the nominal total over a long run, before overkill', () => {
    // dealt + overkill is what the heroes *swung* for, and it has to match the
    // continuous model to within one unfinished swing each.
    const sim = new Simulation({ heroes: team(), startWave: 1 });
    const seconds = 600;
    run(sim, seconds * 1_000, 100);

    const { dealt, overkill } = sim.read().totals;
    const swung = dealt.add(overkill).toNumber();
    const nominal = 3 * 1_000 * seconds;

    // At most one pending swing per hero is still in the bank.
    const mostOnePendingSwing = 1_000 * (0.7 + 1.6 + 1.2);
    expect(nominal - swung).toBeGreaterThanOrEqual(0);
    expect(nominal - swung).toBeLessThanOrEqual(mostOnePendingSwing);
  });
});

describe('what discrete attacks actually cost', () => {
  it('wastes damage past the killing blow, and says how much', () => {
    /*
     * The honest price of the change. Continuous damage never overshoots; a
     * whole swing does. The waste is larger the bigger a hit is relative to
     * the monster, which is why a heavy-hitting team farming weak waves loses
     * the most.
     */
    const sim = new Simulation({ heroes: team(), startWave: 1 });
    run(sim, 120_000, 100);

    const { dealt, overkill, kills } = sim.read().totals;
    expect(kills).toBeGreaterThan(0);
    expect(overkill.gt(0)).toBe(true);

    const wastedFraction = overkill.div(dealt.add(overkill)).toNumber();
    // Real, and bounded: this is a balance number worth knowing, not noise.
    expect(wastedFraction).toBeGreaterThan(0);
    expect(wastedFraction).toBeLessThan(0.5);
  });

  it('costs a measured slice of dps, and more with a smaller team', () => {
    /*
     * The balance delta of this whole change, measured and committed.
     *
     * Average DPS is preserved by construction, so the only thing discrete
     * attacks actually take away is the damage that spills past a killing
     * blow. Two things drive it: how over-levelled the team is for the wave it
     * is farming, and — less obviously — **how few heroes it has**. The same
     * team DPS split across three heroes lands in bigger lumps than across
     * five, and a bigger lump spills more.
     *
     * If a future cadence change pushes these up, that is a balance decision
     * and it should fail here rather than quietly drain the late game.
     */
    const measure = (classes: readonly PlayerClass[], teamDps: number, startWave: number): number => {
      const heroes = classes.map((heroClass, index) =>
        createHeroEntity(`h${index}`, new Decimal(teamDps / classes.length), getAttackIntervalMs(heroClass)),
      );
      const sim = new Simulation({ heroes, startWave });
      run(sim, 600_000, 100);
      const { dealt, overkill } = sim.read().totals;
      return overkill.div(dealt.add(overkill)).mul(100).toNumber();
    };

    const THREE: PlayerClass[] = ['warrior', 'archer', 'mage'];
    const FIVE: PlayerClass[] = ['warrior', 'berserker', 'archer', 'mage', 'monk'];

    // Ordinary play: a fraction of a percent to a couple of percent.
    const ordinaryThree = measure(THREE, 5e2, 20);
    expect(ordinaryThree).toBeGreaterThan(0.5);
    expect(ordinaryThree).toBeLessThan(2.5);

    // Over-levelled farming, where one swing erases several monsters.
    const farmingThree = measure(THREE, 1e9, 40);
    expect(farmingThree).toBeGreaterThan(4);
    expect(farmingThree).toBeLessThan(9);

    // A fuller team spreads the same damage into smaller lumps and wastes less.
    expect(measure(FIVE, 1e9, 40)).toBeLessThan(farmingThree);
    expect(measure(FIVE, 5e2, 20)).toBeLessThan(ordinaryThree);
  });

  it('wastes more when hits are huge relative to the monster', () => {
    // The mechanism, isolated: same dps, one big swing versus many small ones.
    const chunky = new Simulation({ heroes: [hero('big', 1e6, 2_000)], startWave: 1 });
    const smooth = new Simulation({ heroes: [hero('small', 1e6, 100)], startWave: 1 });
    run(chunky, 60_000, 100);
    run(smooth, 60_000, 100);

    const chunkyWaste = chunky.read().totals.overkill;
    const smoothWaste = smooth.read().totals.overkill;
    expect(chunkyWaste.gt(smoothWaste)).toBe(true);
  });

  it('never reports more damage landed than the monster had', () => {
    const sim = new Simulation({ heroes: team(), startWave: 1 });
    for (let step = 0; step < 400; step += 1) {
      sim.advance(100);
      for (const hit of sim.read().hits) {
        expect({ hit: hit.heroUid, sane: hit.dealt.gte(0) && hit.overkill.gte(0) }).toEqual({
          hit: hit.heroUid,
          sane: true,
        });
        // Overkill only ever comes from a blow that killed.
        if (hit.overkill.gt(0)) expect(hit.killed).toBe(true);
      }
    }
  });
});

describe('swings resolve in time order, not array order', () => {
  it('spreads killing blows across the team', () => {
    /*
     * Walking hero by hero would let the first entry in the array spend all
     * its swings before the second acts, so it would land every killing blow
     * and absorb every scrap of overkill — an artefact of array position that
     * would show on screen as one hero always finishing the monster.
     */
    const sim = new Simulation({ heroes: team(), startWave: 1 });
    const finishers = new Set<string>();
    for (let step = 0; step < 2_000; step += 1) {
      sim.advance(100);
      for (const hit of sim.read().hits) if (hit.killed) finishers.add(hit.heroUid);
    }
    expect(finishers.size).toBeGreaterThan(1);
  });

  it('reports hits in the order they landed', () => {
    const sim = new Simulation({ heroes: team(), startWave: 1 });
    // One long step so several heroes swing inside it.
    sim.advance(5_000);
    const times = sim.read().hits.map(hit => hit.atMs);
    expect(times.length).toBeGreaterThan(3);
    expect([...times].sort((left, right) => left - right)).toEqual(times);
  });

  it('staggers heroes so they do not swing in lockstep', () => {
    // Deterministic, from the uid: the same roster opens the same way every
    // run, so nothing here needs a stubbed random.
    const offsets = ['a', 'b', 'c', 'd'].map(uid => startOffsetMs(uid, 1_000));
    expect(new Set(offsets).size).toBe(offsets.length);
    for (const offset of offsets) expect(offset).toBeLessThan(1_000);
    expect(startOffsetMs('a', 1_000)).toBe(startOffsetMs('a', 1_000));
  });
});

describe('the fight moves forward', () => {
  it('advances a wave per kill and spawns the next monster', () => {
    const sim = new Simulation({ heroes: [hero('solo', 1e9, 500)], startWave: 1 });
    sim.advance(5_000);
    const snapshot = sim.read();
    expect(snapshot.totals.kills).toBeGreaterThan(0);
    expect(snapshot.wave).toBe(1 + snapshot.totals.kills);
    expect(snapshot.enemy?.wave).toBe(snapshot.wave);
    expect(snapshot.enemy?.hp.gt(0)).toBe(true);
  });

  it('starts where the save left off', () => {
    const sim = new Simulation({ heroes: team(), startWave: 412 });
    expect(sim.read().wave).toBe(412);
    expect(sim.read().enemy?.wave).toBe(412);
  });

  it('gets the same result at 60fps as in one step, within a live span', () => {
    /*
     * End to end, not just the timer. The span has to stay inside the
     * per-step attack clamp: the fastest hero here swings every 700ms and a
     * step is allowed twenty swings, so anything under fourteen seconds is a
     * frame rate question rather than a hidden-tab one. The test below covers
     * the other side.
     */
    for (const spanMs of [5_000, 10_000]) {
      const stepped = new Simulation({ heroes: team(), startWave: 1 });
      const oneGo = new Simulation({ heroes: team(), startWave: 1 });
      run(stepped, spanMs, 1_000 / 60);
      oneGo.advance(spanMs);
      expect({ spanMs, kills: stepped.read().totals.kills, wave: stepped.read().wave }).toEqual({
        spanMs,
        kills: oneGo.read().totals.kills,
        wave: oneGo.read().wave,
      });
    }
  });

  it('does not replay a hidden tab as one enormous step', () => {
    /*
     * Deliberately *not* equal to the stepped result. An hour away is credited
     * by the offline estimator, which models the sawtooth — deaths, chapter
     * retreats and all. Letting `advance` replay it would both lie about the
     * fight and block the main thread for as long as the tab was hidden.
     */
    const stepped = new Simulation({ heroes: team(), startWave: 1 });
    const oneGo = new Simulation({ heroes: team(), startWave: 1 });
    run(stepped, 60_000, 100);
    oneGo.advance(60_000);
    expect(oneGo.read().totals.kills).toBeLessThan(stepped.read().totals.kills);
    // And the long step is bounded by the clamp rather than unbounded.
    expect(oneGo.read().hits.length).toBeLessThanOrEqual(MAX_ATTACKS_PER_STEP * team().length);
  });

  it('ignores a zero or non-finite step', () => {
    const sim = new Simulation({ heroes: team(), startWave: 1 });
    for (const delta of [0, -100, Number.NaN]) sim.advance(delta);
    expect(sim.read().ticks).toBe(0);
    expect(sim.read().totals.kills).toBe(0);
  });
});

describe('the read model a renderer subscribes to', () => {
  it('gives every hero something to draw', () => {
    const sim = new Simulation({ heroes: team(), startWave: 1 });
    sim.advance(250);
    const snapshot = sim.read();
    expect(snapshot.heroes.length).toBe(3);
    for (const view of snapshot.heroes) {
      expect({ uid: view.uid, inRange: view.swingProgress >= 0 && view.swingProgress <= 1 }).toEqual({
        uid: view.uid,
        inRange: true,
      });
      expect(view.targetId).toBe(snapshot.enemy?.id);
    }
  });

  it('reports hits from the last step only, not the whole run', () => {
    // Floating damage numbers read this. Accumulating would replay the run.
    const sim = new Simulation({ heroes: team(), startWave: 1 });
    sim.advance(5_000);
    expect(sim.read().hits.length).toBeGreaterThan(0);
    sim.advance(1);
    expect(sim.read().hits).toEqual([]);
  });

  it('retargets a hero whose monster died', () => {
    const sim = new Simulation({ heroes: [hero('solo', 1e9, 200)], startWave: 1 });
    sim.advance(2_000);
    const snapshot = sim.read();
    expect(snapshot.totals.kills).toBeGreaterThan(0);
    // No stale id pointing at a corpse.
    expect(snapshot.heroes[0].targetId).toBe(snapshot.enemy?.id);
  });
});

describe('the monster hits back', () => {
  /*
   * Both halves of a fight, because for one commit there was only one.
   * Heroes got timers and targets before anything could hit them, so the live
   * simulation could not lose: an underpowered roster climbed every wave
   * forever while the offline estimator, modelling the same encounter,
   * reported the sawtooth the game actually has. Caught in review.
   */
  const frail = () => ({
    heroes: [hero('a', 50, 1_000)],
    startWave: 60,
    teamMaxHp: new Decimal(500),
    incomingMult: 1,
  });

  it('takes damage from the wave the team is standing on', () => {
    const sim = new Simulation({ ...frail(), incomingMult: 1 });
    const before = sim.read().team.hp;
    sim.advance(100);
    expect(sim.read().team.hp.lt(before)).toBe(true);
  });

  it('wipes the team and retreats a chapter', () => {
    const sim = new Simulation(frail());
    run(sim, 60_000, 100);
    const snapshot = sim.read();
    expect(snapshot.totals.deaths).toBeGreaterThan(0);
    // Wave 60 is inside the chapter that starts at 41.
    expect(snapshot.wave).toBeLessThan(60);
    expect(chapterStartWave(60)).toBe(41);
  });

  it('heals to full on a win and on a wipe, as shipped', () => {
    const sim = new Simulation({
      heroes: [hero('strong', 1e9, 200)],
      startWave: 5,
      teamMaxHp: new Decimal(1e6),
      incomingMult: 1,
    });
    sim.advance(400);
    const snapshot = sim.read();
    expect(snapshot.totals.kills).toBeGreaterThan(0);
    expect(snapshot.team.hp.eq(snapshot.team.maxHp)).toBe(true);
  });

  it('leaves the team alone when nothing can reach them', () => {
    // incomingMult 0 is the default, and it must mean "no damage" rather than
    // "damage of zero size applied every step".
    const sim = new Simulation({ heroes: team(), startWave: 1, teamMaxHp: new Decimal(100) });
    run(sim, 10_000, 100);
    expect(sim.read().team.hp.eq(sim.read().team.maxHp)).toBe(true);
    expect(sim.read().totals.deaths).toBe(0);
  });

  it('agrees with the offline estimator about whether a team survives', () => {
    /*
     * The finding, stated as a property. Given the same encounter, the live
     * simulation and the estimator must reach the same verdict — a team that
     * dies offline dies online. A live simulation that *could not* die, which
     * is what review caught, fails the first case outright.
     *
     * Asserted away from the ceiling on purpose. A team sitting exactly at the
     * wave it can just barely clear is decided by a few percent of climb rate,
     * and the estimator does not model overkill, so it climbs about a tenth
     * faster and can cross a death threshold the live loop stops short of.
     * That gap is already measured and committed in the estimator's own
     * accuracy table; pinning the verdict at the knife edge would be pinning
     * that rounding, not this behaviour.
     */
    const verdicts: [string, number, number, number][] = [
      // label, hero dps, wave, team hp
      ['doomed', 50, 60, 500],
      ['untouchable', 1e7, 30, 1e15],
    ];

    for (const [label, dps, startWave, teamHp] of verdicts) {
      const live = new Simulation({
        heroes: [hero('h', dps, 1_000)],
        startWave,
        teamMaxHp: new Decimal(teamHp),
        incomingMult: 1,
      });
      run(live, 120_000, 100);

      const offline = estimateOffline(startWave, 120_000, {
        dps: new Decimal(dps),
        sustainedDpsMult: 1,
        dpsPerHeroLevel: new Decimal(0),
        teamHpPerHeroLevel: new Decimal(0),
        heroLevel: 1,
        teamMaxHp: new Decimal(teamHp),
        enemyHpMult: 1,
        incomingMult: 1,
        goldMult: 1,
        expMult: 1,
        tempo: 1,
      });

      expect({ label, diesLive: live.read().totals.deaths > 0 }).toEqual({
        label,
        diesLive: offline.deaths > 0,
      });
    }
  });

  it('matches the estimator exactly on a team with no way out', () => {
    // Not just the verdict: the same kills, the same wipes, the same wave.
    // Two models of one encounter, landing on the same square.
    const live = new Simulation({
      heroes: [hero('h', 50, 1_000)],
      startWave: 60,
      teamMaxHp: new Decimal(500),
      incomingMult: 1,
    });
    run(live, 120_000, 100);

    const offline = estimateOffline(60, 120_000, {
      dps: new Decimal(50),
      sustainedDpsMult: 1,
      dpsPerHeroLevel: new Decimal(0),
      teamHpPerHeroLevel: new Decimal(0),
      heroLevel: 1,
      teamMaxHp: new Decimal(500),
      enemyHpMult: 1,
      incomingMult: 1,
      goldMult: 1,
      expMult: 1,
      tempo: 1,
    });

    expect({ kills: live.read().totals.kills, deaths: live.read().totals.deaths, wave: live.read().wave }).toEqual({
      kills: offline.kills,
      deaths: offline.deaths,
      wave: offline.wave,
    });
  });
});

describe('time the tab spent hidden', () => {
  it('is credited rather than dropped', () => {
    /*
     * The clamp discards swings a long step owes, and the comment beside it
     * promised the estimator would credit that time — but nothing called the
     * estimator, so a backgrounded tab simply lost every second. Caught in
     * review; this is the assertion that the promise is now kept.
     */
    const options = {
      heroes: [hero('h', 1e6, 700)],
      startWave: 1,
      teamMaxHp: new Decimal(1e6),
      incomingMult: 1,
    };

    const dropped = new Simulation(options);
    dropped.advance(AWAY_THRESHOLD_MS * 4);

    const credited = new Simulation(options);
    credited.creditAway(AWAY_THRESHOLD_MS * 4);

    expect(credited.read().totals.kills).toBeGreaterThan(dropped.read().totals.kills);
    expect(credited.read().wave).toBeGreaterThan(dropped.read().wave);
  });

  it('credits roughly what living through it would have', () => {
    // Not exactly — the estimator averages where the live loop swings — but
    // the same order of magnitude, or the bridge is not modelling the game.
    const options = {
      heroes: [hero('h', 1e5, 700)],
      startWave: 1,
      teamMaxHp: new Decimal(1e9),
      incomingMult: 1,
    };
    const lived = new Simulation(options);
    run(lived, 60_000, 100);

    const away = new Simulation(options);
    away.creditAway(60_000);

    const ratio = away.read().totals.kills / Math.max(1, lived.read().totals.kills);
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2);
  });

  it('returns the player to a charged BURST instead of an empty one', () => {
    /*
     * The offline bridge credited kills, deaths and the wave and left the
     * meter alone, so the player who backgrounded the tab came back to a
     * longer climb and nothing to spend — while the player who sat and
     * watched the same kills land came back with a window waiting.
     */
    const options = {
      heroes: [hero('h', 1e6, 700)],
      startWave: 1,
      teamMaxHp: new Decimal(1e6),
      incomingMult: 1,
    };
    const sim = new Simulation(options);
    expect(sim.read().burst.charge).toBe(0);

    sim.creditAway(60_000);

    expect(sim.read().totals.kills).toBeGreaterThan(0);
    expect(sim.read().burst.charge).toBe(sim.read().burst.cost);
    // Open, not merely full: a window timestamped while the tab was hidden
    // would arrive already lapsed and the player would have nothing to press.
    expect(sim.read().burst.windowOpen).toBe(true);
  });

  it('charges nothing for a gap that credited no kills', () => {
    const sim = new Simulation({ heroes: [], startWave: 10 });
    sim.creditAway(60_000);
    expect(sim.read().burst.charge).toBe(0);
    expect(sim.read().burst.windowOpen).toBe(false);
  });

  it('does nothing for a gap with no team to fight', () => {
    const sim = new Simulation({ heroes: [], startWave: 10 });
    sim.creditAway(60_000);
    expect(sim.read().wave).toBe(10);
    expect(sim.read().totals.kills).toBe(0);
  });

  it('shares the chapter rule with the estimator rather than copying it', () => {
    // Two copies of "where does a wipe send you" is how the two paths drifted
    // in the first place.
    expect(retreatWave(121)).toBe(101);
    expect(retreatWave(122)).toBe(121);
    expect(estimateRetreatWave(121)).toBe(retreatWave(121));
    expect(estimateRetreatWave(140)).toBe(retreatWave(140));
  });
});

describe('BURST, as the simulation runs it', () => {
  /** Runs until the meter is full, so the window is open to press into. */
  function charged(options?: { autoBurst?: boolean }): Simulation {
    const sim = new Simulation({ heroes: team(), ...options });
    for (let step = 0; step < 4_000 && sim.read().burst.charge < sim.read().burst.cost; step += 1) {
      sim.advance(16);
    }
    return sim;
  }

  it('fills from kills and opens a window', () => {
    const sim = charged();
    const snapshot = sim.read();
    expect(snapshot.burst.charge).toBe(snapshot.burst.cost);
    expect(snapshot.burst.ready).toBe(true);
    expect(snapshot.burst.windowOpen).toBe(true);
    expect(snapshot.burst.peak.end).toBeGreaterThan(snapshot.burst.peak.start);
  });

  it('is not ready before anything has died', () => {
    const fresh = new Simulation({ heroes: team() });
    expect(fresh.read().burst.charge).toBe(0);
    expect(fresh.read().burst.windowOpen).toBe(false);
    expect(fresh.spendBurst().spent).toBe(false);
  });

  it('deals damage when spent, and empties the meter', () => {
    const sim = charged();
    const before = sim.read();
    const result = sim.spendBurst();
    expect(result.spent).toBe(true);
    const after = sim.read();
    expect(after.burst.charge).toBeLessThan(before.burst.cost);
    // Either it hurt the enemy or it killed it and moved the wave on.
    const progressed = after.wave > before.wave || after.totals.dealt.gt(before.totals.dealt);
    expect(progressed).toBe(true);
  });

  it('attributes its damage to nobody on the battle line', () => {
    // The renderer places floating numbers by hashing the uid; borrowing a
    // hero's would stack the burst exactly on top of that hero's own hit.
    const sim = charged();
    sim.spendBurst();
    const burstHits = sim.read().hits.filter(hit => hit.heroUid === 'burst');
    expect(burstHits.length).toBeGreaterThan(0);
    for (const hero of team()) {
      expect(burstHits.some(hit => hit.heroUid === hero.uid)).toBe(false);
    }
  });

  it('refuses a second press in the same window', () => {
    const sim = charged();
    expect(sim.spendBurst().spent).toBe(true);
    expect(sim.spendBurst().spent).toBe(false);
  });

  it('keeps the charge when a window lapses unautomated', () => {
    // An idle player is never worse off than one who is not playing at all.
    const sim = charged();
    const cost = sim.read().burst.cost;
    for (let step = 0; step < 400; step += 1) sim.advance(16);
    expect(sim.read().burst.charge).toBe(cost);
  });

  it('spends itself at the floor once automation is unlocked', () => {
    const manual = charged();
    const auto = charged({ autoBurst: true });
    // Let both sit through more than a window without a press.
    for (let step = 0; step < 400; step += 1) {
      manual.advance(16);
      auto.advance(16);
    }
    // The automated one has fired at some point and emptied its meter; the
    // manual one has not.
    expect(manual.read().burst.charge).toBe(manual.read().burst.cost);
    expect(auto.read().totals.dealt.gt(manual.read().totals.dealt)).toBe(true);
  });

  it('pays more for a press at the peak than for one the instant it opens', () => {
    const early = charged();
    const late = charged();
    const earlyResult = early.spendBurst();
    // Advance the late one into the peak band before pressing.
    const peak = late.read().burst.peak;
    const target = ((peak.start + peak.end) / 2) * 2_400;
    for (let waited = 0; waited < target; waited += 16) late.advance(16);
    const lateResult = late.spendBurst();

    expect(earlyResult.spent && lateResult.spent).toBe(true);
    expect(lateResult.multiplier).toBeGreaterThan(earlyResult.multiplier);
    expect(lateResult.quality).toBe('perfect');
  });

  it('reports a sweep the HUD can draw, that advances with the clock', () => {
    const sim = charged();
    const first = sim.read().burst.progress;
    sim.advance(400);
    const second = sim.read().burst.progress;
    expect(second).toBeGreaterThan(first);
    expect(second).toBeLessThanOrEqual(1);
  });
});

describe('a wipe, as an offer rather than a teleport', () => {
  /** A team that cannot survive its wave. */
  function doomed(): Simulation {
    return new Simulation({
      heroes: [hero('h', 50, 1_000)],
      startWave: 60,
      teamMaxHp: new Decimal(500),
      incomingMult: 1,
    });
  }

  function untilWipe(sim: Simulation, steps = 4_000): boolean {
    for (let step = 0; step < steps; step += 1) {
      sim.advance(100);
      if (sim.read().wipe !== null) return true;
    }
    return false;
  }

  it('retreats immediately, and offers a rally afterwards', () => {
    // The retreat is the shipped behaviour and happens without asking; the
    // offer is the new part. Pausing to ask instead cost an idle player
    // eight seconds a wipe and put the live sim out of step with the
    // estimator, which the parity test caught.
    const sim = doomed();
    expect(untilWipe(sim)).toBe(true);
    const snapshot = sim.read();
    expect(snapshot.wipe).not.toBeNull();
    expect(snapshot.totals.deaths).toBeGreaterThan(0);
    // Already moved back, rather than sitting on the wave they fell on.
    expect(snapshot.wave).toBe(snapshot.wipe?.retreatTo);
    expect(snapshot.wave).toBeLessThan(snapshot.wipe?.wave ?? 0);
  });

  it('keeps fighting while the offer stands', () => {
    // The fight is not paused: a prompt that stopped the battle would be the
    // exact thing the shell exists to prevent.
    const sim = doomed();
    expect(untilWipe(sim)).toBe(true);
    const before = sim.read().ticks;
    sim.advance(100);
    expect(sim.read().ticks).toBeGreaterThan(before);
  });

  it('holds the wave they fell on, at a price, when the rally is taken', () => {
    const sim = doomed();
    expect(untilWipe(sim)).toBe(true);
    const offer = sim.read().wipe;
    expect(offer).not.toBeNull();
    if (!offer) return;

    expect(sim.decideWipe('rally')).toBe(true);
    const after = sim.read();
    expect(after.wave).toBe(offer.wave);
    expect(after.wipe).toBeNull();
    // Back on their feet, but not on full health.
    expect(after.team.hp.lt(after.team.maxHp)).toBe(true);
    expect(after.team.hp.gt(0)).toBe(true);
  });

  it('only dismisses the offer when the retreat is accepted', () => {
    const sim = doomed();
    expect(untilWipe(sim)).toBe(true);
    const wave = sim.read().wave;
    expect(sim.decideWipe('retreat')).toBe(true);
    expect(sim.read().wipe).toBeNull();
    expect(sim.read().wave).toBe(wave);
  });

  it('refuses a decision when nothing is being offered', () => {
    const sim = new Simulation({ heroes: team() });
    expect(sim.decideWipe('rally')).toBe(false);
    expect(sim.read().wipe).toBeNull();
  });

  it('lets the offer lapse, leaving the retreat standing', () => {
    const sim = doomed();
    expect(untilWipe(sim)).toBe(true);
    const wave = sim.read().wave;
    for (let step = 0; step < 200; step += 1) sim.advance(100);
    // The offer is gone and nothing undid the retreat. A later wipe may have
    // opened a fresh one, which is fine; what must not happen is a rally the
    // player never asked for.
    const after = sim.read();
    if (after.wipe === null) expect(after.wave).toBeLessThanOrEqual(wave + 1);
  });

  it('counts down so the HUD can show the offer expiring', () => {
    const sim = doomed();
    expect(untilWipe(sim)).toBe(true);
    const first = sim.read().wipe;
    sim.advance(1_000);
    const second = sim.read().wipe;
    if (first && second) {
      expect(second.remainingMs).toBeLessThan(first.remainingMs);
      expect(second.urgency).toBeGreaterThan(first.urgency);
      expect(second.urgency).toBeLessThanOrEqual(1);
    }
  });
});

describe('the boss mechanic, as the simulation runs it', () => {
  /** Slow enough that a boss lives long past its first tell. */
  function atBoss(wave = 10): Simulation {
    return new Simulation({ heroes: [hero('h', 1, 700)], startWave: wave });
  }

  it('reports the mechanic on a boss wave and nothing on the others', () => {
    expect(atBoss(10).read().boss?.name).toBe(bossMechanicForWave(10).name);
    expect(atBoss(50).read().boss?.name).toBe(bossMechanicForWave(50).name);
    expect(new Simulation({ heroes: [hero('h', 1, 700)], startWave: 11 }).read().boss).toBeNull();
  });

  it('never damages anything on its own, however long nobody answers', () => {
    /*
     * This is the load-bearing one. The offline estimator models a fight
     * with nobody in the chair, and the parity suite pins the two against
     * each other — so the moment an unanswered tell moves the fight, the
     * live game and the estimate are describing different campaigns. It is
     * also the idle-game rule BURST already follows: missing costs the
     * opportunity, never the meter.
     */
    const sim = new Simulation({ heroes: team(), startWave: 9 });
    const seen: string[] = [];
    for (let step = 0; step < 4_000; step += 1) {
      sim.advance(16);
      for (const hit of sim.read().hits) seen.push(hit.heroUid);
    }
    expect(sim.read().wave, 'the run has to actually cross a boss').toBeGreaterThan(20);
    expect(seen).not.toContain(TELL_HIT_UID);
  });

  it('pays charge and damage for an answer inside the window', () => {
    const sim = atBoss(10);
    const mechanic = bossMechanicForWave(10);
    const before = sim.read();
    // Far enough in for the first tell to be open, well short of its close.
    run(sim, mechanic.cadenceMs + 100, 50);
    expect(sim.read().boss?.open).toBe(true);

    expect(sim.answerTell()).toBe(true);
    const after = sim.read();
    expect(after.burst.charge).toBe(before.burst.charge + mechanic.charge);
    expect(after.totals.dealt.gt(before.totals.dealt)).toBe(true);
    expect(after.hits.some(hit => hit.heroUid === TELL_HIT_UID)).toBe(true);
    expect(after.boss?.open).toBe(false);
  });

  it('does nothing for a press between tells', () => {
    const sim = atBoss(10);
    run(sim, 500, 50);
    expect(sim.read().boss?.open).toBe(false);
    const before = sim.read().totals.dealt;
    expect(sim.answerTell()).toBe(false);
    expect(sim.read().totals.dealt.eq(before)).toBe(true);
  });

  it('does nothing for a press off a boss wave', () => {
    const sim = new Simulation({ heroes: [hero('h', 1, 700)], startWave: 11 });
    run(sim, 10_000, 50);
    expect(sim.answerTell()).toBe(false);
    expect(sim.read().boss).toBeNull();
  });

  it('feeds the meter a boss fight would otherwise starve', () => {
    /*
     * The whole reason the mechanic exists. BURST charges on kills; a boss
     * is one enemy, so without this the meter does not move for the length
     * of the hardest fight in the act.
     */
    const answered = atBoss(10);
    const watched = atBoss(10);
    const mechanic = bossMechanicForWave(10);
    for (let cycle = 1; cycle <= 5; cycle += 1) {
      run(answered, mechanic.cadenceMs, 50);
      run(watched, mechanic.cadenceMs, 50);
      answered.answerTell();
    }
    expect(watched.read().burst.charge).toBe(0);
    expect(answered.read().burst.charge).toBeGreaterThan(0);
  });
});
