import { QUALITY_TIERS, type DeviceProfile, type QualityTier } from './DeviceProfile';

/**
 * Holds a frame rate, and gives up fidelity rather than smoothness when it
 * cannot.
 *
 * Two jobs. It paces drawing, so a 30fps target on a weak device draws every
 * other animation frame instead of asking the GPU for 60 and getting 24. And
 * it watches what frames actually cost, dropping a tier when the device is
 * sustainedly behind and restoring it when there is headroom to spare.
 *
 * Time arrives as an argument, the same way it does in the engine. A governor
 * that reads its own clock can only be tested by making real frames take real
 * milliseconds, which is a test nobody writes twice.
 */

export interface FrameDecision {
  /** Draw this frame, or skip it to hold the target rate. */
  draw: boolean;
  tier: QualityTier;
  /** Simulation time this frame accounts for, clamped against long gaps. */
  stepMs: number;
}

/**
 * The longest step handed to the simulation in one frame. A backgrounded tab
 * resumes with one enormous delta, and a simulation asked to advance that far
 * in a single call stalls the frame it was supposed to be smoothing.
 */
export const MAX_STEP_MS = 250;

/**
 * A gap this long was not a slow frame, it was a stall — a hidden tab, a
 * breakpoint, a sleeping laptop. Feeding it to the load average would drop
 * every returning player to the lowest tier on their first frame back.
 */
export const STALL_MS = 500;

/** Weight of the newest frame in the cost average. */
export const LOAD_ALPHA = 0.1;

/**
 * Slack on the draw comparison. Running at exactly the target rate, the
 * accumulator lands a fraction under budget often enough to drop roughly one
 * frame in every hundred — a visible hitch caused by nothing but the
 * accumulated error of adding 16.666… to itself.
 */
export const DRAW_EPSILON_MS = 0.5;

/** Sustained cost above this multiple of the budget gives a tier back. */
export const DOWNGRADE_RATIO = 1.25;
export const DOWNGRADE_FRAMES = 30;

/**
 * Restoring a tier asks for more headroom than losing one did, and for six
 * times as long. Symmetric thresholds oscillate: the frame after an upgrade
 * is the most expensive one there is, which immediately justifies the
 * downgrade that justifies the next upgrade.
 */
export const UPGRADE_RATIO = 0.7;
export const UPGRADE_FRAMES = 180;

export class FrameGovernor {
  private readonly budgetMs: number;
  private readonly ceiling: number;
  private current: number;
  private last: number | null = null;
  private accumulator = 0;
  private load: number;
  private over = 0;
  private under = 0;

  constructor(profile: DeviceProfile) {
    this.budgetMs = 1000 / profile.targetFps;
    this.ceiling = QUALITY_TIERS.indexOf(profile.tier);
    this.current = this.ceiling;
    this.load = this.budgetMs;
  }

  get tier(): QualityTier {
    return QUALITY_TIERS[this.current];
  }

  /** Measured frame cost, for a debug overlay. */
  get loadMs(): number {
    return this.load;
  }

  frame(nowMs: number): FrameDecision {
    const raw = this.last === null ? this.budgetMs : nowMs - this.last;
    this.last = nowMs;

    const stalled = raw >= STALL_MS;
    if (!stalled) {
      this.load += (raw - this.load) * LOAD_ALPHA;
      this.adapt();
    } else {
      // Coming back from a stall, neither the backlog nor the cost of the
      // frame that spanned it says anything about this device.
      this.accumulator = 0;
      this.over = 0;
      this.under = 0;
    }

    const stepMs = Math.min(Math.max(raw, 0), MAX_STEP_MS);
    this.accumulator = Math.min(this.accumulator + stepMs, this.budgetMs * 2);
    const draw = this.accumulator >= this.budgetMs - DRAW_EPSILON_MS;
    if (draw) this.accumulator = Math.max(0, this.accumulator - this.budgetMs);

    return { draw, tier: this.tier, stepMs };
  }

  private adapt(): void {
    if (this.load > this.budgetMs * DOWNGRADE_RATIO) {
      this.under = 0;
      this.over += 1;
      if (this.over >= DOWNGRADE_FRAMES && this.current > 0) {
        this.current -= 1;
        this.over = 0;
      }
      return;
    }
    if (this.load < this.budgetMs * UPGRADE_RATIO) {
      this.over = 0;
      this.under += 1;
      if (this.under >= UPGRADE_FRAMES && this.current < this.ceiling) {
        this.current += 1;
        this.under = 0;
      }
      return;
    }
    this.over = 0;
    this.under = 0;
  }
}
