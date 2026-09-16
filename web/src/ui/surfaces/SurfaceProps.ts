import type { DeviceCapabilities, DeviceProfile } from '../../game/device/DeviceProfile';
import type { SimulationSnapshot } from '../../engine/types';
import type { Cast } from '../../game/models/cast';
import type { Destination } from '../nav/destinations';
import type { PlayerProfile } from '../profile/playerProfile';

/**
 * What every surface is handed.
 *
 * Two read models and the destination that opened it, and nothing else — no
 * setters, no store, no engine. A surface renders what it is given and cannot
 * reach past it, which is what keeps "adding a feature is one registry entry"
 * true: the entry names a component, and the component's whole world is this.
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
}
