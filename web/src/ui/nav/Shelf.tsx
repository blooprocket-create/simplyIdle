import type { SimulationSnapshot } from '../../engine/types';
import { badgeFor, shelfLayout, type Badge, type Destination } from './destinations';
import styles from './Shelf.module.css';

interface ShelfProps {
  registry: readonly Destination[];
  snapshot: SimulationSnapshot;
  pinnedIds?: readonly string[];
  onSelect?: (id: string) => void;
}

function BadgeMark({ badge }: { badge: Badge | null }) {
  if (badge === null) return null;
  const isDot = badge === 'dot';
  return (
    <span
      className={isDot ? `${styles.badge} ${styles.dot}` : styles.badge}
      aria-label={isDot ? 'Has updates' : `${badge} pending`}
    >
      {isDot ? '' : badge}
    </span>
  );
}

/**
 * Three slots and More, forever. Growth goes behind More, not into the shelf,
 * so navigation stays a fixed cost however large the game gets.
 */
export function Shelf({ registry, snapshot, pinnedIds = [], onSelect }: ShelfProps) {
  const { pinned, overflow, overflowBadge } = shelfLayout(registry, snapshot, pinnedIds);

  return (
    <nav className={styles.shelf} aria-label="Main">
      {pinned.map(destination => (
        <button key={destination.id} type="button" className={styles.slot} onClick={() => onSelect?.(destination.id)}>
          {destination.label}
          <BadgeMark badge={badgeFor(destination, snapshot)} />
        </button>
      ))}
      <button
        type="button"
        className={`${styles.slot} ${styles.more}`}
        onClick={() => onSelect?.('more')}
        aria-label={`More — ${overflow.length} further destinations`}
      >
        More
        <BadgeMark badge={overflowBadge} />
      </button>
    </nav>
  );
}
