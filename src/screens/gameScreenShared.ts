export type Tab = 'warroom' | 'battle' | 'heroes' | 'stats' | 'achievements' | 'equipment' | 'operations' | 'social';

export type ExpeditionType = 'artifact' | 'merchant' | 'ruins' | 'vault' | 'abyss';
export type ExpeditionRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'godly';

export const STAT_LABELS = {
  strength: 'STR',
  vitality: 'VIT',
  agility: 'AGI',
  intelligence: 'INT',
  spirit: 'SPR',
} as const;

export const ACH_BONUS_PER_UNLOCK_PCT = 3;

export const EXPEDITION_TYPES: ExpeditionType[] = ['artifact', 'merchant', 'ruins', 'vault', 'abyss'];
export const EXPEDITION_TYPE_META: Record<ExpeditionType, { icon: string; name: string }> = {
  artifact: { icon: '🗿', name: 'Artifact Hunt' },
  merchant: { icon: '🏪', name: 'Merchant Convoy' },
  ruins: { icon: '🏛️', name: 'Ancient Ruins' },
  vault: { icon: '🔐', name: 'Vault Heist' },
  abyss: { icon: '🌑', name: 'Abyss Dive' },
};
export const EXPEDITION_RARITY_META: Record<
  ExpeditionRarity,
  { goldCost: number; durationMs: number; rewardsLabel: string }
> = {
  common: { goldCost: 25_000, durationMs: 5 * 60 * 1000, rewardsLabel: '+35💎 +150💠' },
  rare: { goldCost: 75_000, durationMs: 20 * 60 * 1000, rewardsLabel: '+75💎 +320💠 +1✨' },
  epic: { goldCost: 220_000, durationMs: 90 * 60 * 1000, rewardsLabel: '+140💎 +700💠 +1✨' },
  legendary: { goldCost: 500_000, durationMs: 4 * 60 * 60 * 1000, rewardsLabel: '+240💎 +1300💠 +2✨' },
  godly: { goldCost: 1_000_000, durationMs: 8 * 60 * 60 * 1000, rewardsLabel: '+400💎 +2400💠 +4✨' },
};

export function formatDurationShort(ms: number): string {
  const totalMinutes = Math.max(1, Math.floor(ms / 60_000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
