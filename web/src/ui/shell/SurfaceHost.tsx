import { createElement } from 'react';

import type { SimulationSnapshot } from '../../engine/types';
import type { Cast } from '../../game/models/cast';
import type { Destination } from '../nav/destinations';
import type { PlayerProfile } from '../profile/playerProfile';
import { PlaceholderSurface } from '../surfaces/PlaceholderSurface';
import { surfaceFor } from '../surfaces/registry';
import { ARCHETYPE_LAYOUT } from './archetypes';
import styles from './SurfaceHost.module.css';

/**
 * Where a surface appears: over the fight, which keeps running behind it.
 *
 * This is the whole point of the shell. The shipped game navigated *away* from
 * the battle to reach any of fifty places, so the thing the player came for
 * stopped while they were gone. Here the diorama is never unmounted — a
 * surface is an overlay, and only a `moment` is allowed to take the screen.
 *
 * The archetype owns geometry and scrolling; the surface describes data. That
 * split is enforced by `src/ui/architecture.test.ts`, not merely intended.
 */

interface SurfaceHostProps {
  destination: Destination | null;
  snapshot: SimulationSnapshot;
  profile: PlayerProfile;
  cast: Cast;
  onDismiss: () => void;
}

export function SurfaceHost({ destination, snapshot, profile, cast, onDismiss }: SurfaceHostProps) {
  if (!destination) return null;
  const layout = ARCHETYPE_LAYOUT[destination.archetype];
  // A destination with no surface yet falls back to the placeholder. Deciding
  // that here means an unbuilt destination looks the same everywhere, rather
  // than each surface having to fake its own empty state.
  //
  // Built with `createElement` rather than as `<Surface />`: a capitalized
  // local holding a component is indistinguishable, to the linter, from a
  // component being *defined* during render — which would remount its whole
  // subtree every frame the snapshot changes.
  const surface = surfaceFor(destination.id);

  return (
    <div className={layout.dims ? `${styles.host} ${styles.dimmed}` : styles.host}>
      <section
        className={[
          styles.surface,
          layout.fill === 'sheet' ? styles.sheet : styles.panel,
          layout.scroll === 'block' ? styles.scrolls : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={destination.label}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>{destination.label}</h2>
          <span className={styles.kind}>{destination.archetype}</span>
          <button type="button" className={styles.close} onClick={onDismiss}>
            Close
          </button>
        </header>
        <div className={styles.body}>
          {surface === undefined ? (
            <PlaceholderSurface destination={destination} />
          ) : (
            createElement(surface, { destination, snapshot, profile, cast })
          )}
        </div>
      </section>
    </div>
  );
}
