import type { Rarity } from '../../content/rarities';
import type { Tone } from '../surfaces/parts/parts';

/**
 * Rarity as a tone.
 *
 * Deliberately coarse: the token sheet has a closed set of meanings and eight
 * rarities may not each claim one, so they group. Keyed off the rarity rather
 * than the hero's tier — an earlier version in `RosterSurface` used tier, which
 * is a different axis, so every tag came out the same colour while the label
 * underneath said otherwise.
 *
 * Lives here rather than in a surface because two screens now show a rarity,
 * and a roster whose colours disagree with the summon that produced them is
 * worse than one with no colours.
 */
export const RARITY_TONE: Record<Rarity, Tone> = {
  common: 'neutral',
  uncommon: 'neutral',
  rare: 'good',
  epic: 'good',
  legendary: 'gold',
  mythic: 'gold',
  godly: 'warn',
  transcendent: 'warn',
};
