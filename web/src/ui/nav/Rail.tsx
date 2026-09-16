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
  onSelect: (id: string) => void;
  onDismiss: () => void;
}

export function Rail({ registry, snapshot, onSelect, onDismiss }: RailProps) {
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
                return (
                  <button
                    key={destination.id}
                    type="button"
                    className={styles.entry}
                    onClick={() => onSelect(destination.id)}
                  >
                    {destination.label}
                    {badge !== null && <span className={styles.badge}>{badge === 'dot' ? '' : badge}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
    </>
  );
}
