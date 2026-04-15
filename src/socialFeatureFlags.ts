/**
 * Feature flag defaults. Override at runtime via `setFeatureFlag()`.
 *
 * IE 11 NOTICE: This app does NOT support IE 11. The Proxy-based flag system,
 * Set/Map usage in chat reactions, and modern JS throughout the codebase require
 * ES2015+ environments. Minimum supported browsers:
 *   - Chrome 49+, Safari 10+, Firefox 52+, Edge 12+
 *   - Android WebView 49+, iOS Safari 10+
 */
const FLAG_DEFAULTS = {
  guildTreasury: true,
  guildBoss: true,
  guildEvents: true,
  friendGifting: true,
  globalChat: true,
  leaderboard: true,
  // v2 social features
  directMessages: true,
  playerSearch: true,
  activityFeed: true,
  blockReport: true,
  guildWars: true,
} as const;

export type FeatureFlagKey = keyof typeof FLAG_DEFAULTS;

// Runtime overrides (e.g., from remote config or admin panel)
const overrides: Partial<Record<FeatureFlagKey, boolean>> = {};

/**
 * Proxy-based flags with fallback for environments where Proxy is unavailable (IE 11).
 * In unsupported environments, flags use defaults and `setFeatureFlag()` is a no-op.
 */
function createFlagAccessor(): Readonly<Record<FeatureFlagKey, boolean>> {
  if (typeof Proxy !== 'undefined') {
    return new Proxy(
      { ...FLAG_DEFAULTS },
      {
        get(_target, prop: string) {
          if (prop in overrides) return overrides[prop as FeatureFlagKey];
          if (prop in FLAG_DEFAULTS) return FLAG_DEFAULTS[prop as FeatureFlagKey];
          return undefined;
        },
      },
    );
  }

  // Fallback: return frozen copy of defaults (no runtime override support)
  return Object.freeze({ ...FLAG_DEFAULTS });
}

export const SOCIAL_FEATURE_FLAGS: Readonly<Record<FeatureFlagKey, boolean>> = createFlagAccessor();

/** Override a flag at runtime (useful for remote config or kill switches). */
export function setFeatureFlag(key: FeatureFlagKey, value: boolean): void {
  overrides[key] = value;
}

/** Reset all runtime overrides back to defaults. */
export function resetFeatureFlags(): void {
  for (const key of Object.keys(overrides) as FeatureFlagKey[]) {
    delete overrides[key];
  }
}
