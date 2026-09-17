import type { EquipmentRarity } from '../../content/equipment';
import type { Tone } from '../surfaces/parts/parts';

/**
 * Equipment rarity as a tone.
 *
 * Its own map rather than a reuse of `RARITY_TONE`, because the two rarity
 * unions are not the same set — equipment has six and heroes eight — and a
 * shared map would have to be keyed by a union that covers both, which is how
 * a `godly` sword becomes representable.
 *
 * The catalogue carries the shipped hex for each rarity and this ignores it on
 * purpose: `ui/architecture.test.ts` refuses a colour that is not in
 * `theme/tokens.css`, so the six map onto the four tones the sheet has. The
 * grouping matches `copy/rarities.ts` where the names overlap, so a legendary
 * sword and a legendary hero are the same colour.
 */
export const EQUIPMENT_RARITY_TONE: Record<EquipmentRarity, Tone> = {
  common: 'neutral',
  rare: 'good',
  epic: 'good',
  legendary: 'gold',
  mythic: 'gold',
  transcendent: 'warn',
};
