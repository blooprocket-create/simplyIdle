import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import fixture from '../offline/__fixtures__/offline-progress.json';
import { FLAT_RATES, RunEarnings, killReward } from './rewards';

/**
 * The economy, as one kill at a time.
 *
 * Before this the rewrite had none: the offline estimator priced windows in
 * gold and EXP and the live loop threw the numbers away, so a player who stayed
 * earned nothing and a player who left was told nothing.
 */

describe('what one kill pays', () => {
  it('rounds the whole chain up, once', () => {
    /*
     * A monster at wave one is worth 8 gold on the curve and carries `armored`,
     * whose 1.06 takes it to 8.48. The shipped `killMonster` wraps its entire
     * chain in a single `Math.ceil`, so it pays **9**.
     *
     * This one assertion separates all three roundings: 9 under `ceil`, 8 under
     * either `floor` or round-to-nearest. It matters most exactly here — the
     * curve floors at 8 gold and 5 EXP, so a new account's first kills are the
     * ones where a unit either way is a visible fraction of the reward.
     */
    const first = killReward(1, FLAT_RATES);
    expect(first.gold.toString()).toBe('9');
    // 5 EXP against `armored`'s 1.05 is 5.25, which rounds to 5 and ceils to 6.
    expect(first.exp.toString()).toBe('6');
  });

  it('charges the rates against the whole chain rather than the bare curve', () => {
    // Wave three is 10 gold on the curve and 10.6 after its affix. Doubling
    // the rate pays ceil(21.2) = 22, not 2 x ceil(10.6) = 22 by luck — the EXP
    // side is 6.36, where the two readings are 13 and 14.
    const doubled = killReward(3, { goldMult: 2, expMult: 2 });
    expect({ gold: doubled.gold.toString(), exp: doubled.exp.toString() }).toEqual({ gold: '22', exp: '13' });
  });

  it('pays nothing at a rate of zero rather than rounding a zero up', () => {
    // `ceil` of an exact zero is zero. Worth pinning: a chain that collapsed to
    // zero paying one gold per kill would be a floor nobody wrote.
    const nothing = killReward(3, { goldMult: 0, expMult: 0 });
    expect({ gold: nothing.gold.toString(), exp: nothing.exp.toString() }).toEqual({ gold: '0', exp: '0' });
  });
});

describe('the wave that died', () => {
  it('pays a boss several times over', () => {
    // Wave ten is 7x gold and 4x EXP on the curve, and being a boss it also
    // draws a *second* affix. Its neighbours are the control.
    expect(killReward(9, FLAT_RATES).gold.toString()).toBe('28');
    expect(killReward(10, FLAT_RATES).gold.toString()).toBe('213');
    expect(killReward(11, FLAT_RATES).gold.toString()).toBe('31');

    expect(killReward(9, FLAT_RATES).exp.toString()).toBe('13');
    expect(killReward(10, FLAT_RATES).exp.toString()).toBe('64');
    expect(killReward(11, FLAT_RATES).exp.toString()).toBe('16');
  });

  it('reads affixes at the wave asked for, so crediting the wrong one shows', () => {
    /*
     * `Simulation.land` credits before `spawnEnemy(wave + 1)`, for the same
     * reason the BURST meter charges before it: the wave that died is the one
     * that pays. Reading after the respawn would charge a boss kill at the
     * price of the ordinary wave replacing it — a 213 paid as 31.
     *
     * Affixes cycle every five waves, so any adjacent pair disagrees even where
     * the curve barely moves.
     */
    const waves = [9, 10, 11, 12, 13, 14];
    const paid = waves.map(wave => killReward(wave, FLAT_RATES).gold.toString());
    expect(new Set(paid).size).toBe(waves.length);
  });

  it('treats a wave below one as wave one, and a fraction as the wave it is in', () => {
    // Nothing should ever ask for these, which is why they are pinned: a wave
    // of zero reaching the curve is `Decimal.pow(1.14, -1)`, a reward that
    // shrinks below the floor rather than failing loudly.
    const first = killReward(1, FLAT_RATES).gold.toString();
    expect(killReward(0, FLAT_RATES).gold.toString()).toBe(first);
    expect(killReward(-9, FLAT_RATES).gold.toString()).toBe(first);
    expect(killReward(3.9, FLAT_RATES).gold.toString()).toBe(killReward(3, FLAT_RATES).gold.toString());
  });
});

describe('against what the shipped game actually paid', () => {
  /*
   * Every scenario in the offline fixture records `goldPerKill` — the gold one
   * real kill moved the shipped state by — alongside the multiplier chain that
   * produced it. Feeding that chain back through `killReward` should reproduce
   * the payout.
   *
   * **To within one unit, and never under.** The fixture cannot support an
   * exact claim, and the reason is worth naming rather than hiding behind a
   * tolerance: its `goldMult` is `goldPerKill / curve / affix`, and
   * `goldPerKill` has *already* been rounded up by the shipped game. So the
   * stored ratio is the true chain plus whatever that ceiling added, and
   * putting it through a second ceiling here can round up twice.
   *
   * Measured, the reconstruction lands within 2e-15 relative of the shipped
   * integer and straddles it: three of the ten figures reconstruct exactly,
   * `fresh`'s gold (10.6 paid as 11) and `at-ceiling`'s EXP come out a hair
   * above and ceil to one more, and `loses-ground`'s EXP comes out a hair
   * *below* — which is what makes the lower bound bite. Reading the rounding as
   * `floor` pays 502,411 where the game paid 502,412.
   */
  const measured = fixture.scenarios.filter(entry => entry.inputs.goldPerKill !== null);

  it('has scenarios to check', () => {
    expect(measured.length).toBe(5);
  });

  it.each(measured.map(entry => entry.name))('reproduces %s', name => {
    const scenario = measured.find(entry => entry.name === name)!;
    const inputs = scenario.inputs;
    const paid = killReward(inputs.killWave, { goldMult: inputs.goldMult!, expMult: inputs.expMult! });

    // Labelled, in the repo's own idiom, so a failure names which scenario and
    // which side of the purse rather than reporting a bare number.
    const overpaid: [string, number][] = [
      ['gold', paid.gold.sub(inputs.goldPerKill!).toNumber()],
      ['exp', paid.exp.sub(inputs.expPerKill!).toNumber()],
    ];
    for (const [side, over] of overpaid) {
      expect(over, `${name} ${side}`).toBeGreaterThanOrEqual(0);
      expect(over, `${name} ${side}`).toBeLessThanOrEqual(1);
    }
  });
});

describe("a run's earnings", () => {
  it('adds up the kills it is told about', () => {
    const run = new RunEarnings();
    run.creditKill(1);
    run.creditKill(1);
    run.creditKill(10);
    // 9 + 9 + 213, and 6 + 6 + 64.
    expect({ gold: run.read().gold.toString(), exp: run.read().exp.toString() }).toEqual({
      gold: '231',
      exp: '76',
    });
  });

  it('starts from what a resumed run had already earned', () => {
    const run = new RunEarnings(FLAT_RATES, { gold: new Decimal(100), exp: new Decimal(7) });
    run.creditKill(1);
    expect({ gold: run.read().gold.toString(), exp: run.read().exp.toString() }).toEqual({
      gold: '109',
      exp: '13',
    });
  });

  it('starts empty', () => {
    const run = new RunEarnings();
    expect({ gold: run.read().gold.toString(), exp: run.read().exp.toString() }).toEqual({
      gold: '0',
      exp: '0',
    });
  });

  it('does not share the purse it was resumed from', () => {
    /*
     * `EMPTY_PURSE` is a shared default, so the constructor copies rather than
     * aliases. Nothing else makes that observable — crediting replaces the
     * purse rather than adding into it — so this reaches through and mutates
     * the caller's object, which is the one thing an alias would let through.
     */
    const resume = { gold: new Decimal(100), exp: new Decimal(7) };
    const run = new RunEarnings(FLAT_RATES, resume);
    resume.gold = new Decimal(0);
    resume.exp = new Decimal(0);
    expect({ gold: run.read().gold.toString(), exp: run.read().exp.toString() }).toEqual({
      gold: '100',
      exp: '7',
    });
  });

  it('takes an away block whole, fractions and all', () => {
    /*
     * The estimator prices a window by resolving rounds and extrapolating
     * repeats, so its total is not a sum of individually-ceiled kills and must
     * not be re-derived as one. It is also not an integer: rounding it here
     * would be applying a per-kill rule to kills that were never individually
     * simulated.
     */
    const run = new RunEarnings();
    run.creditAway(new Decimal('1.5'), new Decimal('0.25'));
    expect({ gold: run.read().gold.toString(), exp: run.read().exp.toString() }).toEqual({
      gold: '1.5',
      exp: '0.25',
    });
  });

  it('does not move a purse already read', () => {
    // Crediting replaces the purse rather than mutating it, which is what lets
    // a snapshot handed to the UI stay the frame it was taken on.
    const run = new RunEarnings();
    run.creditKill(1);
    const before = run.read();
    run.creditKill(1);
    expect(before.gold.toString()).toBe('9');
    expect(run.read().gold.toString()).toBe('18');
  });
});
