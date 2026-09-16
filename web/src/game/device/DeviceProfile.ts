/**
 * What this device can afford to draw.
 *
 * The shipped app draws the same thing everywhere and hopes. A phone with a
 * 3x pixel ratio is asked for nine times the fragments of a 1x desktop at the
 * same CSS size, which is the single biggest reason a scene that is fine on a
 * laptop is a slideshow in a hand.
 *
 * Scoring is pure and capability detection is injectable, so the thresholds
 * below can be exercised in a bare Node test rather than only discovered on
 * real hardware.
 */

export type QualityTier = 'low' | 'medium' | 'high';

export const QUALITY_TIERS: readonly QualityTier[] = ['low', 'medium', 'high'];

export interface DeviceCapabilities {
  /** `navigator.deviceMemory`, in GB. Absent on Safari and Firefox. */
  memoryGb?: number;
  /** `navigator.hardwareConcurrency`. Absent on older Safari. */
  cores?: number;
  /** `devicePixelRatio`. */
  pixelRatio: number;
  /** Longest edge of the drawing surface, in CSS pixels. */
  longestEdgePx: number;
  /** A coarse pointer: touch-first, and usually thermally limited. */
  touch: boolean;
  /** `prefers-reduced-motion: reduce`. */
  reducedMotion: boolean;
}

export interface DeviceProfile {
  tier: QualityTier;
  /**
   * Multiplier on the backbuffer relative to CSS pixels. Capped rather than
   * scaled from `devicePixelRatio` directly: past about 2x the extra fragments
   * buy nothing a player can see at arm's length.
   */
  renderScale: number;
  /** Hard cap on actors drawn at once. The line plus whatever it fights. */
  maxActors: number;
  /** Floating damage numbers alive at once. */
  maxDamageNumbers: number;
  shadows: boolean;
  /** Frames per second the governor aims to hold. */
  targetFps: number;
  /**
   * Carried through rather than folded into the tier: a machine that can
   * afford motion may still be asked not to produce it.
   */
  reducedMotion: boolean;
}

/** Enough fragments that fill rate, not geometry, becomes the limit. */
export const HEAVY_PIXEL_BUDGET = 2_600_000;

/** Everything a tier decides. The governor hands these back as it adapts. */
export type QualitySettings = Omit<DeviceProfile, 'tier' | 'reducedMotion'>;

const PROFILES: Record<QualityTier, QualitySettings> = {
  low: { renderScale: 1, maxActors: 10, maxDamageNumbers: 12, shadows: false, targetFps: 30 },
  medium: { renderScale: 1.25, maxActors: 16, maxDamageNumbers: 24, shadows: false, targetFps: 60 },
  high: { renderScale: 1.5, maxActors: 24, maxDamageNumbers: 40, shadows: true, targetFps: 60 },
};

/**
 * Points towards a tier, so no single missing signal decides the outcome.
 * `deviceMemory` and `hardwareConcurrency` are both unavailable on Safari,
 * and a scheme that keyed off either alone would put every iPhone in the
 * wrong bucket.
 */
export function scoreCapabilities(caps: DeviceCapabilities): number {
  let score = 0;
  if (caps.memoryGb !== undefined) score += caps.memoryGb >= 8 ? 2 : caps.memoryGb >= 4 ? 1 : -1;
  if (caps.cores !== undefined) score += caps.cores >= 8 ? 2 : caps.cores >= 4 ? 1 : -1;
  if (caps.touch) score -= 1;
  if (caps.pixelRatio * caps.longestEdgePx * caps.pixelRatio * caps.longestEdgePx > HEAVY_PIXEL_BUDGET) {
    score -= 1;
  }
  return score;
}

/**
 * The settings a tier asks for, independent of the device that chose it.
 *
 * Exported because the governor changes tier at runtime and something has to
 * be able to ask what the new one means. Copied rather than handed out by
 * reference: a caller that adjusted one of these in place would change what
 * every future device of that tier receives.
 */
export function qualityFor(tier: QualityTier): QualitySettings {
  return { ...PROFILES[tier] };
}

export function tierFor(caps: DeviceCapabilities): QualityTier {
  const score = scoreCapabilities(caps);
  if (score >= 3) return 'high';
  if (score >= 1) return 'medium';
  return 'low';
}

export function profileFor(caps: DeviceCapabilities): DeviceProfile {
  const tier = tierFor(caps);
  return {
    tier,
    ...PROFILES[tier],
    renderScale: Math.min(PROFILES[tier].renderScale, caps.pixelRatio),
    reducedMotion: caps.reducedMotion,
  };
}

/** The slice of the platform this reads, named so a test can supply it. */
export interface CapabilitySource {
  devicePixelRatio?: number;
  innerWidth?: number;
  innerHeight?: number;
  navigator?: { deviceMemory?: number; hardwareConcurrency?: number; maxTouchPoints?: number };
  matchMedia?: (query: string) => { matches: boolean };
}

export function detectCapabilities(source: CapabilitySource): DeviceCapabilities {
  const width = source.innerWidth ?? 0;
  const height = source.innerHeight ?? 0;
  return {
    memoryGb: source.navigator?.deviceMemory,
    cores: source.navigator?.hardwareConcurrency,
    pixelRatio: source.devicePixelRatio ?? 1,
    longestEdgePx: Math.max(width, height),
    touch: (source.navigator?.maxTouchPoints ?? 0) > 0,
    reducedMotion: source.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  };
}
