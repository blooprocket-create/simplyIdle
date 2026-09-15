import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { getAttackIntervalMs } from '../content/attackSpeeds';
import { MAX_ATTACKS_PER_STEP } from './combat/attackTimer';
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
