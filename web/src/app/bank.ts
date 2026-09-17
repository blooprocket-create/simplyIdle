import { grantDrops } from '../engine/equipment/equipmentSave';
import type { BankedRun } from '../engine/combat/rewards';
import { bankRun } from '../engine/save/bankRun';
import type { SaveV3 } from '../engine/save/schema';
import { EQUIPMENT_CONTENT, equipmentUnlocks } from './equipmentActions';
import { vipLevel } from './playerActions';

/**
 * Everything a banked run does to the account, in one place.
 *
 * `bankRun` handles what the engine can answer alone — the wallet, the
 * player's level, the heroes' — and the drops need the catalogue, the forge
 * level and a generator, which the engine's save slice has no business
 * holding. Both happen here so there is one "the run just landed" rather than
 * two the shell has to remember to call in order.
 *
 * Drops come **after** the levelling, and that is not arbitrary: an item rolls
 * against the player's level, so a bank that levelled them and then dropped
 * gives the item the level they just reached. Rolling first would hand a
 * player who just dinged an item from the level before.
 */
export function bankInto(save: SaveV3, banked: BankedRun, nowMs: number, random: () => number): SaveV3 {
  const banked2 = bankRun(save, banked);
  return grantDrops({
    save: banked2,
    content: EQUIPMENT_CONTENT,
    waves: banked.equipmentDrops,
    unlocks: equipmentUnlocks(banked2),
    vipLevel: vipLevel(banked2),
    forgeLevel: banked2.facilities.forge,
    random,
    nowMs,
  }).save;
}
