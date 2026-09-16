import type { Destination } from '../nav/destinations';
import styles from './PlaceholderSurface.module.css';

/**
 * What a destination shows before the phase that owns it fills it in.
 *
 * Says that it is unbuilt rather than implying it is empty. An Equipment
 * screen showing nothing could mean the player owns no equipment, and that is
 * a different thing to tell someone than "this is not written yet" — the
 * first sends them looking for gear they do have.
 *
 * A real surface, not markup inside the host: it describes data and hands it
 * over, owning no geometry and no scroll container, which is the constraint
 * every file under `surfaces/` is held to. A rule that matches no files passes
 * for free, so these rules bite from the first surface onward.
 */
export function PlaceholderSurface({ destination }: { destination: Destination }) {
  return (
    <div className={styles.body}>
      <span className={styles.group}>{destination.group}</span>
      <p className={styles.note}>
        {destination.label} is filed and reachable, and has no screen written yet. The fight behind this is still
        running; it was never navigated away from.
      </p>
    </div>
  );
}
