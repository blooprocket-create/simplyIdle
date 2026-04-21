const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

const DEFAULT_ENABLED = false;
const DEFAULT_CTA_LABEL = 'DOWN FOR MAINTENANCE';
const DEFAULT_A11Y_LABEL = 'Game is down for maintenance';
const DEFAULT_MESSAGE = 'Simply Idle is currently down for maintenance. Please check back soon.';

function readBooleanEnv(value: string | undefined): boolean | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return null;
}

const envEnabled = readBooleanEnv(process.env.EXPO_PUBLIC_GAME_MAINTENANCE_MODE);
const envMessage = (process.env.EXPO_PUBLIC_GAME_MAINTENANCE_MESSAGE ?? '').trim();

export const APP_MAINTENANCE = Object.freeze({
  // Flip this to true for a hard maintenance lock, or set EXPO_PUBLIC_GAME_MAINTENANCE_MODE=true.
  enabled: envEnabled ?? DEFAULT_ENABLED,
  ctaLabel: DEFAULT_CTA_LABEL,
  a11yLabel: DEFAULT_A11Y_LABEL,
  message: envMessage || DEFAULT_MESSAGE,
});
