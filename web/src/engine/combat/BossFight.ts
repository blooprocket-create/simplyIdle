import { bossMechanicForWave, type BossMechanic } from '../../content/bossMechanics';
import { isBossWave } from '../../content/monsters';
import type { BossView } from '../types';
import { bossView } from '../views';
import { advanceTell, answerTell, beginTells, noTell, type TellPayoff, type TellState } from './bossTells';

/**
 * The boss fight, as a thing that owns its own state.
 *
 * `bossTells.ts` holds the rules — when a tell opens, what an answer pays —
 * and this holds the state machine over them, the same way `BurstMeter` sits
 * over `burst.ts` and `RallyOffers` over `wipe.ts`. All three are separate
 * from `Simulation` because that file is under a line cap that exists to stop
 * it absorbing subsystems.
 *
 * It watches the wave rather than being told when the enemy changed. The
 * simulation spawns enemies from four places — a kill, a wipe, a rally and an
 * offline credit — and a subsystem that had to be notified from each of them
 * would be one missed call away from running an act's mechanic against the
 * wrong boss. Reading the wave it was handed cannot drift.
 *
 * Like the other two, it never moves the fight. It reports what an answer
 * earned and the simulation applies it, so there is still one path by which
 * anything gets hurt.
 */
export class BossFight {
  private state: TellState = noTell();
  private mechanic: BossMechanic | null = null;
  private wave: number | null = null;

  /** The clock moved, on whatever wave the fight is now on. */
  tick(wave: number, nowMs: number): void {
    if (wave !== this.wave) this.arrive(wave, nowMs);
    if (this.mechanic === null) return;
    this.state = advanceTell(this.state, this.mechanic, nowMs);
  }

  /** The player answered. Null when there was no tell open to answer. */
  answer(nowMs: number): TellPayoff | null {
    if (this.mechanic === null) return null;
    const result = answerTell(this.state, this.mechanic, nowMs);
    this.state = result.state;
    return result.payoff;
  }

  view(nowMs: number): BossView | null {
    if (this.mechanic === null) return null;
    return bossView(this.state, this.mechanic, nowMs);
  }

  private arrive(wave: number, nowMs: number): void {
    this.wave = wave;
    if (!isBossWave(wave)) {
      this.mechanic = null;
      this.state = noTell();
      return;
    }
    this.mechanic = bossMechanicForWave(wave);
    this.state = beginTells(this.mechanic, nowMs);
  }
}
