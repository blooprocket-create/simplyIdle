import type { Destination } from '../nav/destinations';
import { PlaceholderSurface } from '../surfaces/PlaceholderSurface';
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
  onDismiss: () => void;
  children?: React.ReactNode;
}

export function SurfaceHost({ destination, onDismiss, children }: SurfaceHostProps) {
  if (!destination) return null;
  const layout = ARCHETYPE_LAYOUT[destination.archetype];

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
        <div className={styles.body}>{children ?? <PlaceholderSurface destination={destination} />}</div>
      </section>
    </div>
  );
}
