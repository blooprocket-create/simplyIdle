import type { Destination } from '../nav/destinations';
import styles from './PlaceholderSurface.module.css';

/**
 * What every destination shows until the phase that owns it fills it in.
 *
 * A real surface, not a stand-in for one: it describes data and hands it over,
 * owning no geometry and no scroll container. Which is the constraint the
 * whole `surfaces/` directory is under, and the reason this exists as a file
 * rather than as markup inside the host — a rule that matches no files passes
 * for free, and these rules should be biting from the first surface onward.
 */
export function PlaceholderSurface({ destination }: { destination: Destination }) {
  return (
    <div className={styles.body}>
      <span className={styles.group}>{destination.group}</span>
      <p className={styles.note}>
        Filed and reachable from three shelf slots and More. The fight behind this is still running; it was never
        navigated away from.
      </p>
    </div>
  );
}
