import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { getAttackIntervalMs } from '../content/attackSpeeds';
import { MAX_ATTACKS_PER_STEP } from './combat/attackTimer';
import { TELL_HIT_UID } from './combat/burst';
import { chapterStartWave, retreatWave } from './combat/chapters';
import { FLAT_RATES, killReward } from './combat/rewards';
import { bossMechanicForWave } from '../content/bossMechanics';
import { MENDING_PULSE_BASE_HEAL, MENDING_PULSE_LEVEL_SCALE } from '../content/heroSkills';
import { AWAY_THRESHOLD_MS } from './offline/awayCredit';
import { estimateOffline, retreatWave as estimateRetreatWave } from './offline/estimate';
import { Simulation, type SimulationOptions } from './Simulation';
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

describe('what a run earns', () => {
  /*
   * Before this the simulation tracked kills, deaths and damage and nothing
   * else: a player who stayed earned nothing and a player who left was told
   * nothing, while the offline estimator had been pricing windows in gold the
   * whole time and throwing the figure away.
   */
  const earning = () => new Simulation({ heroes: team(), startWave: 1, teamMaxHp: new Decimal(1e9) });

  it('pays exactly the waves it killed, in order', () => {
    /*
     * An identity rather than a bound. Nothing dies here — `incomingMult`
     * defaults to zero — so the run kills waves one through `kills` and the
     * total has to be the sum of their prices. That catches the off-by-one
     * directly: crediting after the respawn pays the wrong wave every time,
     * and on a boss it is the difference between 213 gold and 31.
     */
    const sim = earning();
    run(sim, 30_000, 100);
    const read = sim.read();

    expect(read.totals.deaths).toBe(0);
    expect(read.totals.kills).toBeGreaterThan(10);
    expect(read.wave).toBe(read.totals.kills + 1);

    let expected = new Decimal(0);
    for (let wave = 1; wave <= read.totals.kills; wave += 1) expected = expected.add(killReward(wave, FLAT_RATES).gold);
    expect(read.totals.gold.toString()).toBe(expected.toString());
  });

  it('charges a boss at the boss wave rather than at what replaces it', () => {
    // Read after the respawn, a boss kill pays the ordinary wave behind it.
    const sim = earning();
    while (sim.read().wave < 10) sim.advance(100);
    const before = sim.read().totals.gold;
    while (sim.read().wave === 10) sim.advance(100);

    expect(sim.read().totals.gold.sub(before).toString()).toBe(killReward(10, FLAT_RATES).gold.toString());
    expect(killReward(10, FLAT_RATES).gold.gt(killReward(11, FLAT_RATES).gold.mul(5))).toBe(true);
  });

  it('scales with the rates it was given', () => {
    const flat = earning();
    const doubled = new Simulation({
      heroes: team(),
      startWave: 1,
      teamMaxHp: new Decimal(1e9),
      rates: { goldMult: 2, expMult: 2 },
    });
    run(flat, 10_000, 100);
    run(doubled, 10_000, 100);

    expect(doubled.read().totals.kills).toBe(flat.read().totals.kills);
    expect(doubled.read().totals.gold.gt(flat.read().totals.gold)).toBe(true);
    // Not exactly twice: each kill is rounded up on its own, so doubling a
    // fractional reward and doubling its ceiling are different sums.
    expect(doubled.read().totals.gold.lte(flat.read().totals.gold.mul(2))).toBe(true);
  });

  it('pays nothing for a team that kills nothing', () => {
    const idle = new Simulation({ heroes: [], startWave: 10 });
    run(idle, 30_000, 100);
    expect(idle.read().totals.gold.toString()).toBe('0');
    expect(idle.read().totals.exp.toString()).toBe('0');
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

  it('pays for the waves it credits, not only counts them', () => {
    /*
     * The other half of the gap. `awayCredit.ts` carried a note saying the
     * live loop "has no economy yet, so no gold or EXP is awarded here" — and
     * the estimator it calls had been computing both and having them dropped
     * on the floor. A player who closed the tab came back to a longer climb
     * and an unchanged purse.
     */
    const options = { heroes: [hero('h', 1e6, 700)], startWave: 1, teamMaxHp: new Decimal(1e6), incomingMult: 1 };
    const sim = new Simulation(options);
    sim.creditAway(60_000);

    expect(sim.read().totals.kills).toBeGreaterThan(0);
    expect(sim.read().totals.gold.gt(0)).toBe(true);
    expect(sim.read().totals.exp.gt(0)).toBe(true);
  });

  it('pays what the waves it credits are worth, which is not what the kill count suggests', () => {
    /*
     * The kill-count check above bounds the away run within 2x of the lived
     * one. **Gold cannot be bounded the same way**, and the measurement is
     * worth writing down rather than discovering as a flaky test: over the
     * same minute the estimator credits 84 kills to the live loop's 73 — 15%
     * more — and 6,574,701 gold to its 1,864,101, which is 3.5x. Gold grows at
     * 1.14 a wave, so the last few waves are most of the purse and a slightly
     * longer climb is a much larger number.
     *
     * So what is checked is the relationship that does hold: a sum of `k`
     * increasing prices sits between `k` times the first and `k` times the
     * last. That catches a purse priced at the wrong waves, or not priced at
     * all, without pretending to a precision the estimator does not claim.
     */
    const options = { heroes: [hero('h', 1e5, 700)], startWave: 1, teamMaxHp: new Decimal(1e9), incomingMult: 1 };
    const away = new Simulation(options);
    away.creditAway(60_000);
    const read = away.read();

    expect(read.totals.deaths).toBe(0);
    expect(read.totals.gold.gte(killReward(1, FLAT_RATES).gold.mul(read.totals.kills))).toBe(true);
    expect(read.totals.gold.lte(killReward(read.wave, FLAT_RATES).gold.mul(read.totals.kills))).toBe(true);
  });

  it('prices the hidden window on the same chain the live loop is charging', () => {
    /*
     * The rates reach the estimator rather than being applied to the total it
     * returns, because it prices a window wave by wave inside its own round
     * model. A build that credited the away window at flat rates would pay a
     * player less for leaving than for staying, with nothing on screen to say
     * why.
     */
    const options = { heroes: [hero('h', 1e6, 700)], startWave: 1, teamMaxHp: new Decimal(1e6), incomingMult: 1 };
    const flat = new Simulation(options);
    const rich = new Simulation({ ...options, rates: { goldMult: 10, expMult: 10 } });
    flat.creditAway(60_000);
    rich.creditAway(60_000);

    // The fight is untouched by the rates, so the two credit the same climb.
    expect(rich.read().wave).toBe(flat.read().wave);
    expect(rich.read().totals.kills).toBe(flat.read().totals.kills);
    /*
     * A ratio rather than an equality, because the two are not the same
     * arithmetic: the rate is applied per wave inside the round model, so ten
     * scaled waves summed and one sum scaled by ten differ in the last place
     * — 863,106,144.6200001 against 863,106,144.62. That difference is the
     * point rather than a nuisance, and rounding it away with `toString` would
     * be asserting something that is not true.
     */
    expect(rich.read().totals.gold.div(flat.read().totals.gold).toNumber()).toBeCloseTo(10, 9);
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

describe('a run picked up where it was left', () => {
  const stored = {
    wave: 63,
    kills: 412,
    deaths: 7,
    burstCharge: 15,
    gold: new Decimal(1_250_000),
    exp: new Decimal(88_400),
    awayAtMs: 0,
  };

  it('starts where the run stopped, with what it had banked', () => {
    /*
     * The gap this closes. The shell kept nothing at all, so a refresh threw
     * away the climb, the meter and every boss streak — and a verb you
     * cannot carry across a reload is a verb nobody will practise.
     */
    const sim = new Simulation({ heroes: team(), resume: stored });
    const read = sim.read();
    expect(read.wave).toBe(63);
    expect(read.totals.kills).toBe(412);
    expect(read.totals.deaths).toBe(7);
    expect(read.burst.charge).toBe(15);
  });

  it('resumes the purse, and adds to it rather than starting it over', () => {
    // Gold is the one resumed field with nothing to re-derive it from: the
    // wave says where the run is, not what it earned getting there.
    const sim = new Simulation({ heroes: team(), resume: stored });
    expect(sim.read().totals.gold.toString()).toBe('1250000');
    run(sim, 30_000, 100);
    expect(sim.read().totals.gold.gt(1_250_000)).toBe(true);
  });

  it('hands back the window the player had, not a wait for it', () => {
    // Reloading on a full meter and being made to earn it again would make
    // reloading a punishment.
    expect(new Simulation({ heroes: team(), resume: stored }).read().burst.windowOpen).toBe(true);
  });

  it('wins over `startWave`, because a resumed run already knows where it is', () => {
    expect(new Simulation({ heroes: team(), startWave: 1, resume: stored }).read().wave).toBe(63);
  });

  it('changes nothing at all when there is no run to resume', () => {
    const fresh = new Simulation({ heroes: team(), startWave: 9 }).read();
    expect(fresh.wave).toBe(9);
    expect(fresh.totals.kills).toBe(0);
    expect(fresh.burst.charge).toBe(0);
    expect(fresh.totals.gold.toString()).toBe('0');
  });

  it("arms the resumed wave's boss mechanic, not the one it started on", () => {
    // `BossFight` is armed in the constructor from the wave it is handed, so
    // resuming onto a boss must arrive with that boss's mechanic live.
    const onBoss = new Simulation({ heroes: team(), resume: { ...stored, wave: 30 } });
    expect(onBoss.read().boss?.name).toBe(bossMechanicForWave(30).name);
  });
});

describe('abilities reach the fight', () => {
  /**
   * The fifth unported system, connected. Every phase before this one ran the
   * fight with no abilities at all and passed a temporary buff of zero, with a
   * note saying a buff needs a clock to expire by.
   */
  const caster = (uid: string, archetype: 'frontline_ward' | 'battle_chant' | 'mending_pulse') => ({
    uid,
    fielded: true,
    caster: { level: 1, archetype, unique: null },
  });

  it('a guard makes the team take less', () => {
    /*
     * `frontline_ward` is twenty percent off incoming damage, and it is the
     * exact buff that made Phase 8's mitigation port look 0.8 off — because it
     * fires on its own and nobody had built it.
     */
    const bare = new Simulation({ heroes: [], teamMaxHp: new Decimal(1e9), incomingMult: 1, startWave: 40 });
    const warded = new Simulation({
      heroes: [],
      teamMaxHp: new Decimal(1e9),
      incomingMult: 1,
      startWave: 40,
      casters: [caster('w', 'frontline_ward')],
    });
    run(bare, 3_000, 100);
    run(warded, 3_000, 100);
    expect(warded.read().team.hp.gt(bare.read().team.hp)).toBe(true);
  });

  it('a chant makes the team hit harder', () => {
    /*
     * Measured at wave 40 rather than wave 1, and that is not arbitrary.
     * `dealt` is damage that *landed*, capped by what the enemy had left —
     * everything past the killing blow is `overkill`. Against a wave-one
     * monster a team of three thousand DPS overkills on every swing, so an
     * eighteen percent buff shows up entirely as overkill and `dealt` does not
     * move at all. My first version asserted on wave one and failed for that
     * reason, which is the discrete model's own accounting working.
     */
    const bare = new Simulation({ heroes: team(), teamMaxHp: new Decimal(1e9), startWave: 40 });
    const chanted = new Simulation({
      heroes: team(),
      teamMaxHp: new Decimal(1e9),
      startWave: 40,
      casters: [caster('c', 'battle_chant')],
    });
    run(bare, 5_000, 100);
    run(chanted, 5_000, 100);
    expect(chanted.read().totals.dealt.gt(bare.read().totals.dealt)).toBe(true);
  });

  it('a heal brings the team back up, and wastes the pulse it opens on', () => {
    /*
     * Ten seconds rather than two, and the length is the test.
     *
     * A cooldown starts *ready*, so the first pulse fires on the opening step
     * — at which point the team is still at full and the heal clips to their
     * maximum and is gone. `mending_pulse` waits six seconds, so a two-second
     * run sees exactly one cast and that cast is the wasted one: my first
     * version ran for two seconds and passed with `healTeam` stubbed out to
     * return its argument, which is no test at all.
     *
     * Ten seconds sees two casts, and the second one lands on a team that has
     * taken two hundred damage. So the gap is exactly one pulse — 8.04% of a
     * thousand — and asserting the number rather than the direction is what
     * pins down that the first one was thrown away.
     */
    const bare = new Simulation({ heroes: [], teamMaxHp: new Decimal(1_000), incomingMult: 1, startWave: 40 });
    const mended = new Simulation({
      heroes: [],
      teamMaxHp: new Decimal(1_000),
      incomingMult: 1,
      startWave: 40,
      casters: [caster('m', 'mending_pulse')],
    });
    run(bare, 10_000, 100);
    run(mended, 10_000, 100);

    const gained = mended.read().team.hp.sub(bare.read().team.hp).toNumber();
    const onePulse = (MENDING_PULSE_BASE_HEAL + MENDING_PULSE_LEVEL_SCALE) * 1_000;
    expect(gained).toBeCloseTo(onePulse, 6);
    // Both are below full, so neither reading is the cap in disguise.
    expect(mended.read().team.hp.lt(1_000)).toBe(true);
  });

  it('runs the fight unchanged for a team whose casters are all benched', () => {
    /*
     * The sixty-four tests above this block are the real control here: they
     * were written before abilities existed, and a simulation that cast for a
     * team with none would have moved every number in them.
     *
     * So this one asserts the part they cannot — the `fielded` guard, reached
     * through the simulation rather than the clock. A benched hero keeps their
     * ability and does not use it, which is why the flag exists rather than
     * the roster simply leaving them out: the same list answers "who could
     * cast" for the ability bar and "who does" for the fight.
     *
     * An earlier version compared `casters: []` against passing none at all,
     * which reads like a control and is not one — both sides run the same code
     * with the same empty list, so a buff leaking into a fight with no casters
     * moved the two together and the test stayed green.
     */
    const bare = new Simulation({ heroes: team(), teamMaxHp: new Decimal(1e9), startWave: 40 });
    const benched = new Simulation({
      heroes: team(),
      teamMaxHp: new Decimal(1e9),
      startWave: 40,
      casters: [{ ...caster('b', 'battle_chant'), fielded: false }],
    });
    run(bare, 5_000, 100);
    run(benched, 5_000, 100);
    expect(benched.read().totals.dealt.eq(bare.read().totals.dealt)).toBe(true);

    // And the same team fielded *does* move it, so the reading above is the
    // guard holding rather than the scenario having nothing to show.
    const fielded = new Simulation({
      heroes: team(),
      teamMaxHp: new Decimal(1e9),
      startWave: 40,
      casters: [caster('b', 'battle_chant')],
    });
    run(fielded, 5_000, 100);
    expect(fielded.read().totals.dealt.gt(bare.read().totals.dealt)).toBe(true);
  });
});

describe('an ability the player presses', () => {
  /**
   * The other half of the fifth system. Abilities reached the fight one commit
   * before this, and fired themselves — which is how they shipped, and is most
   * of why nobody noticed they were missing for five phases.
   */
  const caster = (uid: string, archetype: 'frontline_ward' | 'battle_chant' | 'burst_volley') => ({
    uid,
    fielded: true,
    caster: { level: 1, archetype, unique: null },
  });

  const fight = (casters: ReturnType<typeof caster>[], autoCast = false) =>
    new Simulation({ heroes: [], teamMaxHp: new Decimal(1e9), startWave: 40, casters, autoCast });

  it('lands the cast and puts the hero on cooldown', () => {
    const sim = fight([caster('v', 'burst_volley')]);
    const before = sim.read().enemy!.hp;
    expect(sim.castHeroActive('v')).toBe(true);
    expect(sim.read().enemy!.hp.lt(before)).toBe(true);

    const ability = sim.read().abilities.find(entry => entry.uid === 'v')!;
    expect(ability.ready).toBe(false);
    expect(ability.remainingMs).toBeGreaterThan(0);
  });

  it('refuses a second press, and the refusal costs nothing', () => {
    /*
     * The shipped rule, and the reason it matters: a refusal that reset the
     * cooldown would punish a player for pressing early, which is the exact
     * habit a bar with a filling ring on it invites.
     */
    const sim = fight([caster('v', 'burst_volley')]);
    sim.castHeroActive('v');
    const after = sim.read();

    expect(sim.castHeroActive('v')).toBe(false);
    expect(sim.read().enemy!.hp.eq(after.enemy!.hp)).toBe(true);
    expect(sim.read().abilities[0].remainingMs).toBe(after.abilities[0].remainingMs);
  });

  it('refuses a hero who is not in the fight at all', () => {
    // A press naming a uid the roster does not carry is a bug upstream, and
    // casting for an invented hero would hide it behind a working button.
    expect(fight([caster('v', 'burst_volley')]).castHeroActive('nobody')).toBe(false);
  });

  it('refuses a benched hero without touching their cooldown', () => {
    const sim = new Simulation({
      heroes: [],
      teamMaxHp: new Decimal(1e9),
      startWave: 40,
      autoCast: false,
      casters: [{ ...caster('b', 'burst_volley'), fielded: false }],
    });
    expect(sim.castHeroActive('b')).toBe(false);
    expect(sim.read().abilities[0].remainingMs).toBe(0);
    // Not ready, though the cooldown is zero — the bench is the reason.
    expect(sim.read().abilities[0].ready).toBe(false);
  });

  it('buys timing rather than power, which is the whole trade', () => {
    /*
     * A pressed cast and an auto-cast one are worth exactly the same. That is
     * the bargain the bar offers — and the reason both go through one seam
     * rather than two code paths that could drift apart.
     */
    const pressed = fight([caster('v', 'burst_volley')]);
    const automatic = fight([caster('v', 'burst_volley')], true);

    const hpBefore = pressed.read().enemy!.hp;
    pressed.castHeroActive('v');
    const byHand = hpBefore.sub(pressed.read().enemy!.hp);

    const autoBefore = automatic.read().enemy!.hp;
    automatic.advance(100);
    const byItself = autoBefore.sub(automatic.read().enemy!.hp);

    expect(byHand.eq(byItself)).toBe(true);
    expect(byHand.gt(0)).toBe(true);
  });

  it('holds every ability when auto-cast is off, and still lets a press through', () => {
    // The state the bar exists for: nothing fires on its own, so the only
    // damage an ability does is damage the player asked for.
    const idle = fight([caster('v', 'burst_volley')]);
    const before = idle.read().enemy!.hp;
    run(idle, 30_000, 100);
    expect(idle.read().enemy!.hp.eq(before)).toBe(true);
    expect(idle.castHeroActive('v')).toBe(true);
    expect(idle.read().enemy!.hp.lt(before)).toBe(true);
  });

  it('draws a ring that fills as the cooldown runs down', () => {
    const sim = fight([caster('w', 'frontline_ward')]);
    sim.castHeroActive('w');
    const fresh = sim.read().abilities[0];
    expect(fresh.progress).toBeCloseTo(0, 6);
    expect(fresh.cooldownMs).toBe(10_000);

    run(sim, 5_000, 100);
    const half = sim.read().abilities[0];
    expect(half.progress).toBeCloseTo(0.5, 6);
    expect(half.ready).toBe(false);

    run(sim, 5_000, 100);
    expect(sim.read().abilities[0].progress).toBe(1);
    expect(sim.read().abilities[0].ready).toBe(true);
  });

  it('reports no abilities for a fight that has none', () => {
    expect(new Simulation({ heroes: [], teamMaxHp: new Decimal(1e9) }).read().abilities).toEqual([]);
  });
});

describe('the currencies a run earns', () => {
  /**
   * The other half of the economy. Gold and EXP have been earned since Phase
   * 8; these four were earned by nothing at all, while the forge, the summon
   * pool and the prestige trees all spent from a wallet with no income.
   */
  const sim = (over: Partial<SimulationOptions> = {}) =>
    new Simulation({ heroes: team(), teamMaxHp: new Decimal(1e12), enemyHpMult: 1e-9, ...over });

  it('earns nothing but season points and mastery from plain waves', () => {
    // Waves 1 to 9 hold no boss and no chest, which is the whole first chapter
    // of a new game — and is why a port earning only gold looked right.
    const early = new Simulation({ heroes: team(), teamMaxHp: new Decimal(1e12), enemyHpMult: 1e-9, startWave: 1 });
    run(early, 2_000, 100);
    const totals = early.read().totals;
    expect(totals.kills).toBeGreaterThan(0);
    expect(totals.seasonPoints).toBe(totals.kills * 12);
    expect(totals.masteryXp).toBe(totals.kills * 2);
  });

  it('earns essence and a tear from a boss', () => {
    const boss = sim({ startWave: 10 });
    expect(boss.read().totals.essence).toBe(0);
    run(boss, 2_000, 100);
    const after = boss.read().totals;
    expect(after.essence).toBeGreaterThan(0);
    expect(after.bossTears).toBeGreaterThan(0);
  });

  it('rolls a chest with the generator it was given, not a global one', () => {
    /*
     * The same fight twice, once with a generator that always rolls a chest
     * and once with one that never does. Everything else is identical, so the
     * gap is the chest and nothing else — and a simulation reaching for
     * `Math.random` would show no gap at all.
     */
    const lucky = sim({ startWave: 5, random: () => 0.49 });
    const unlucky = sim({ startWave: 5, random: () => 0.99 });
    run(lucky, 5_000, 100);
    run(unlucky, 5_000, 100);
    expect(lucky.read().totals.bossTears).toBeGreaterThan(unlucky.read().totals.bossTears);
    // And the rest of the fight is untouched by which generator ran.
    expect(lucky.read().totals.kills).toBe(unlucky.read().totals.kills);
    expect(lucky.read().totals.gold.eq(unlucky.read().totals.gold)).toBe(true);
  });

  it('runs the same campaign twice when nobody supplies a generator', () => {
    // The engine's default is seeded rather than global, which is what the
    // parity suite and the offline estimator need.
    const first = sim({ startWave: 1 });
    const second = sim({ startWave: 1 });
    run(first, 5_000, 100);
    run(second, 5_000, 100);
    expect(first.read().totals.bossTears).toBe(second.read().totals.bossTears);
    expect(first.read().totals.essence).toBe(second.read().totals.essence);
  });
});
