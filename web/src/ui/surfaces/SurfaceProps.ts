import type { AutomationId } from '../../content/automation';
import type { DeviceCapabilities, DeviceProfile } from '../../game/device/DeviceProfile';
import type { SimulationSnapshot } from '../../engine/types';
import type { Cast } from '../../game/models/cast';
import type { Destination } from '../nav/destinations';
import type { PlayerProfile } from '../profile/playerProfile';
import type { SummonOutcome, SummonPayment } from '../../engine/roster/summonSave';
import type { SparkOutcome } from '../../engine/roster/sparkSave';
import type { HeroSpend } from '../../engine/roster/rosterSave';
import type { FormationRole } from '../../engine/combat/formation';
import type { EquipmentRarity, EquipmentSlot } from '../../content/equipment';
import type { CraftOutcome, UpgradeOutcome } from '../../engine/equipment/equipmentSave';
import type { FacilityId } from '../../engine/prestige/facilities';
import type { PrestigePath } from '../../engine/prestige/rebirth';
import type { RebirthPreview } from '../../engine/prestige/prestigeSave';
import type { BuyOutcome, LooseOutcome } from '../../engine/shop/buyOffer';
import type { DungeonOutcome } from '../../engine/dungeons/run';
import type { DungeonId } from '../../content/dungeons';
import type { ExpeditionRarity, ExpeditionType } from '../../content/expeditions';
import type { SaveV3 } from '../../engine/save/schema';

/**
 * What every surface is handed.
 *
 * Two read models, the destination that opened it, and a closed set of things
 * it may *do* — no store, no engine, no save. A surface renders what it is
 * given and cannot reach past it, which is what keeps "adding a feature is one
 * registry entry" true: the entry names a component, and the component's whole
 * world is this.
 *
 * The verbs are named one at a time rather than handed over as a dispatch,
 * deliberately. A `dispatch(action)` would put the whole reducer inside every
 * surface's reach and this file would stop describing anything — which is how
 * the shipped `GameScreen.tsx` reached 4,190 lines with every action in the
 * game available to it.
 */
export interface SurfaceProps {
  destination: Destination;
  /** Per-frame state: the fight, right now. */
  snapshot: SimulationSnapshot;
  /** Everything that is not per-frame: the player, their roster, their wallet. */
  profile: PlayerProfile;
  /** Who is on the field, as the renderer sees them. */
  cast: Cast;
  /** What the renderer decided this device can do, and what it saw. */
  device: { profile: DeviceProfile; capabilities: DeviceCapabilities };
  /** The destinations the player has pinned to the shelf, in their order. */
  pinnedIds: readonly string[];
  /** Earned automations, which of them are running, and how to change that. */
  automation: {
    active: ReadonlySet<AutomationId>;
    enabled: readonly AutomationId[];
    toggle: (id: AutomationId) => void;
  };
  /**
   * What a surface may change about the player, and what it costs.
   *
   * `summon` returns what arrived so the screen can show it, and null when the
   * account could pay with neither a free charge nor the currency asked for —
   * the same answer `canSummon` gives without drawing anything, so a button
   * gated on one is never refused by the other.
   */
  actions: {
    summon: (pay: SummonPayment) => SummonOutcome | null;
    canSummon: (pay: SummonPayment) => boolean;
    /**
     * Use an item from the bag.
     *
     * The one verb whose result is not entirely a save: a potion heals the
     * running fight, so the shell hands that half to the loop. A surface only
     * needs the yes or no.
     */
    useItem: (itemId: string, amount?: number | 'all') => boolean;
    priceOfSummon: (pay: SummonPayment) => number;
    /**
     * The spark exchange, which is the other way a hero arrives: the currency
     * a *duplicate* pull pays out, spent on one at a tier the player picked.
     * Answers what came — a hero, or a free charge for the option that grants
     * one — and null when the option is unknown or unaffordable.
     */
    sparkExchange: (optionId: string) => SparkOutcome | null;
    canAffordSpark: (optionId: string) => boolean;
    /**
     * The roster verbs. Each answers `true` when it happened and `false` when
     * the rules refused — a screen greying out a button has to be able to ask,
     * and "it worked and changed nothing" is a different answer from "it did
     * not happen".
     */
    spendOnHero: (uid: string, spend: HeroSpend) => boolean;
    batchLevel: (uids: readonly string[], addLevels: number | 'max') => boolean;
    recycle: (uid: string) => boolean;
    fieldTeam: (requested: readonly string[]) => boolean;
    /**
     * "Field my best." One press, and the roster decides for the player.
     *
     * A verb, not an automation: the shipped `autoEquipBestHeroes` is a
     * callback name behind a button and not one of the eight settings flags,
     * which is what the rewrite's catalogue had it filed as for six phases.
     */
    fieldBest: () => boolean;
    place: (uid: string, role: FormationRole) => boolean;
    storeLoadout: (slot: number) => boolean;
    recallLoadout: (slot: number) => boolean;
    buySlot: () => boolean;
    /**
     * A hero's unique relic, on or off. Takes the uid of the copy pressed, and
     * the relic still lands on the *best* copy — see `toggleUniqueRelic`.
     */
    toggleRelic: (uid: string) => boolean;
    /**
     * The equipment verbs. `craft` and `upgrade` answer what arrived rather
     * than a boolean, because both hand over a *rolled* item and a screen that
     * could not name it would be a screen that says "something happened".
     */
    equip: (id: string) => boolean;
    unequip: (slot: EquipmentSlot) => boolean;
    dismantle: (id: string) => boolean;
    sweep: () => boolean;
    setSweepFloor: (floor: EquipmentRarity) => boolean;
    craft: (slot: EquipmentSlot) => CraftOutcome | null;
    upgrade: (id: string) => UpgradeOutcome | null;
    refineEssence: (count?: number) => boolean;
    refineShards: (count?: number) => boolean;
    /**
     * Prestige. `previewRebirth` is a query rather than a verb — unlike the
     * equipment upgrade's plan, it draws nothing, so a screen may quote it.
     */
    previewRebirth: () => RebirthPreview;
    rebirth: () => boolean;
    priceOfPath: (path: PrestigePath) => number;
    spendCore: (path: PrestigePath) => boolean;
    priceOfMeta: (path: PrestigePath) => number;
    spendEssence: (path: PrestigePath) => boolean;
    priceOfFacility: (facilityId: FacilityId) => number;
    upgradeFacility: (facilityId: FacilityId) => boolean;
    /**
     * The shop. `buyOffer` answers what arrived rather than a boolean for the
     * same reason `craft` does: the armoury crate hands over a *rolled* item,
     * and a screen that could not name it would be a screen that says
     * "something happened".
     */
    buyOffer: (id: string) => BuyOutcome | null;
    buyUnits: (itemId: string, amount: number) => LooseOutcome | null;
    /**
     * VIP. `claimableCodex` is a query — it counts what a sweep would record
     * without recording it — so a badge and a disabled button can both ask.
     */
    claimVip: (level: number) => boolean;
    recordCodex: () => number;
    claimableCodex: () => number;
    /**
     * The mission board. `claimAll` answers how many it collected, because a
     * returning account can arrive with eight already satisfied and pressing
     * eight buttons is not a design.
     */
    claimMission: (id: string) => boolean;
    claimAllMissions: () => number;
    /** One rung of the weekly track. The login and the rollover are not verbs. */
    claimWeeklyTrack: (milestone: number) => boolean;
    /**
     * The two dungeons. Both answer what happened rather than a boolean: a
     * run that got 40% of the way through a vault and a run that cleared it
     * are two different things to tell a player about.
     */
    runDungeon: (id: DungeonId) => DungeonOutcome | null;
    raidDungeon: (id: DungeonId) => DungeonOutcome | null;
    /**
     * Expeditions. `collectExpeditions` answers how many came home, because
     * five can be out at once and pressing five buttons is not a design.
     */
    sendExpedition: (type: ExpeditionType, rarity: ExpeditionRarity) => boolean;
    collectExpedition: (id: string) => boolean;
    collectExpeditions: () => number;
  };
  /** The player's save, for the counters no read model carries yet. */
  save: SaveV3;
}
