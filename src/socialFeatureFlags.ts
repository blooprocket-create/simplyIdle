/** Feature flag defaults. Override at runtime via `setFeatureFlag()`. */
const FLAG_DEFAULTS = {
  guildTreasury: true,
  guildBoss: true,
  guildEvents: true,
  friendGifting: true,
  globalChat: true,
  leaderboard: true,
  // v2 social features — default OFF for staged rollout
  directMessages: false,
  playerSearch: false,
  activityFeed: false,
  blockReport: false,
  guildWars: false,
} as const;

export type FeatureFlagKey = keyof typeof FLAG_DEFAULTS;

// Runtime overrides (e.g., from remote config or admin panel)
const overrides: Partial<Record<FeatureFlagKey, boolean>> = {};

export const SOCIAL_FEATURE_FLAGS: Readonly<Record<FeatureFlagKey, boolean>> = new Proxy(
  { ...FLAG_DEFAULTS },
  {
    get(_target, prop: string) {
      if (prop in overrides) return overrides[prop as FeatureFlagKey];
      if (prop in FLAG_DEFAULTS) return FLAG_DEFAULTS[prop as FeatureFlagKey];
      return undefined;
    },
  },
);

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
