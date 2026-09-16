import type { SimulationSnapshot } from '../../engine/types';
import { badgeFor, groupDestinations, visibleDestinations, type Destination } from './destinations';
import styles from './Rail.module.css';

/**
 * Everything behind More.
 *
 * The shelf is a fixed three slots forever, so this is where the game grows.
 * Sections render in rail order and never re-sort — a destination that moved
 * because a badge appeared would be a destination nobody could learn the
 * position of.
 *
 * It is also where the shelf gets decided. Pinning lives next to the thing
 * being pinned rather than in a settings screen, because the player forms the
 * opinion here, looking at the list, and not two menus away.
 */

const GROUP_HEADINGS: Record<string, string> = {
  power: 'Power',
  companion: 'Companions',
  world: 'World',
  record: 'Record',
};

interface RailProps {
  registry: readonly Destination[];
  snapshot: SimulationSnapshot;
  pinnedIds: readonly string[];
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onDismiss: () => void;
}

export function Rail({ registry, snapshot, pinnedIds, onSelect, onTogglePin, onDismiss }: RailProps) {
  const sections = groupDestinations(visibleDestinations(registry, snapshot));

  return (
    <>
      <button type="button" className={styles.scrim} aria-label="Close menu" onClick={onDismiss} />
      <nav className={styles.rail} aria-label="All destinations">
        {sections.map(section => (
          <section key={section.group} className={styles.section}>
            <h2 className={styles.heading}>{GROUP_HEADINGS[section.group] ?? section.group}</h2>
            <div className={styles.entries}>
              {section.entries.map(destination => {
                const badge = badgeFor(destination, snapshot);
                const isPinned = pinnedIds.includes(destination.id);
                return (
                  // A row rather than one button, because the pin is a second
                  // control and a button inside a button is not a thing.
                  <div key={destination.id} className={styles.entry}>
                    <button type="button" className={styles.go} onClick={() => onSelect(destination.id)}>
                      {destination.label}
                    </button>
                    <button
                      type="button"
                      className={isPinned ? `${styles.pin} ${styles.pinned}` : styles.pin}
                      aria-pressed={isPinned}
                      aria-label={
                        isPinned ? `Unpin ${destination.label} from the shelf` : `Pin ${destination.label} to the shelf`
                      }
                      onClick={() => onTogglePin(destination.id)}
                    >
                      <span aria-hidden="true">{isPinned ? '★' : '☆'}</span>
                    </button>
                    {badge !== null && <span className={styles.badge}>{badge === 'dot' ? '' : badge}</span>}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
    </>
  );
}
