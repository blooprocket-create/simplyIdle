import { heroTemplatesById } from '../content/heroes';
import { equipmentTemplatesById } from '../content/equipment';
import type { SaveContent, SaveV3 } from '../engine/save/schema';
import type { FacilityId } from '../engine/prestige/facilities';
import type { PrestigePath } from '../engine/prestige/rebirth';
import {
  previewRebirth,
  priceOfEssenceUpgrade,
  priceOfFacility,
  priceOfRebirthPath,
  rebirth,
  spendEssence,
  spendRebirthCore,
  upgradeFacility,
} from '../engine/prestige/prestigeSave';

/**
 * The prestige verbs, with the catalogue supplied.
 *
 * Only `rebirth` needs it — it replays the active team through the selection
 * rules, which needs to know which hero templates still exist — and it is
 * supplied here for the same reason the roster's is.
 */

const CONTENT: SaveContent = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };

export const prestigeActions = {
  preview: (save: SaveV3) => previewRebirth(save),
  rebirth: (save: SaveV3) => rebirth(save, CONTENT),
  priceOfPath: (save: SaveV3, path: PrestigePath) => priceOfRebirthPath(save, path),
  spendCore: (save: SaveV3, path: PrestigePath) => spendRebirthCore(save, path),
  priceOfMeta: (save: SaveV3, path: PrestigePath) => priceOfEssenceUpgrade(save, path),
  spendEssence: (save: SaveV3, path: PrestigePath) => spendEssence(save, path),
  priceOfFacility: (save: SaveV3, facilityId: FacilityId) => priceOfFacility(save, facilityId),
  /**
   * `gold` is the *spendable* balance — banked plus what the run has earned —
   * rather than `save.wallet.gold`, because that is the figure the player can
   * see. The engine floors its own subtraction, so an upgrade paid for partly
   * out of unbanked earnings cannot take the stored balance below zero.
   */
  upgradeFacility: (save: SaveV3, facilityId: FacilityId, gold: number) => upgradeFacility(save, facilityId, gold),
};
