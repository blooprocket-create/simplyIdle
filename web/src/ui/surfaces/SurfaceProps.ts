import type { AutomationId } from '../../content/automation';
import type { DeviceCapabilities, DeviceProfile } from '../../game/device/DeviceProfile';
import type { SimulationSnapshot } from '../../engine/types';
import type { Cast } from '../../game/models/cast';
import type { Destination } from '../nav/destinations';
import type { PlayerProfile } from '../profile/playerProfile';
import type { SummonOutcome, SummonPayment } from '../../engine/roster/summonSave';
import type { HeroSpend } from '../../engine/roster/rosterSave';
import type { FormationRole } from '../../engine/combat/formation';
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
    priceOfSummon: (pay: SummonPayment) => number;
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
    place: (uid: string, role: FormationRole) => boolean;
    storeLoadout: (slot: number) => boolean;
    recallLoadout: (slot: number) => boolean;
    buySlot: () => boolean;
  };
  /** The player's save, for the counters no read model carries yet. */
  save: SaveV3;
}
