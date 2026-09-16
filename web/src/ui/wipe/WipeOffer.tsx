import type { WipeView } from '../../engine/types';
import styles from './WipeOffer.module.css';

/**
 * The team fell. Here is what you can do about it.
 *
 * The shipped game teleported them to their chapter start without a word, so
 * a player could lose twenty waves and the only trace was a counter going up.
 * This says it happened, says where they went, and offers the one alternative
 * — hold the wave they fell on, at half health.
 *
 * Deliberately a strip rather than a `moment`. The retreat has already been
 * applied and the fight has resumed behind this, so taking the screen would
 * be covering a running battle, which is the exact thing the shell exists to
 * prevent. It also expires: an offer that waited forever would be a game that
 * stops when the player puts their phone down.
 */
export function WipeOffer({
  offer,
  onRally,
  onDismiss,
}: {
  offer: WipeView;
  onRally: () => void;
  onDismiss: () => void;
}) {
  const health = Math.round(offer.rallyHealth * 100);
  return (
    <div className={styles.offer} role="alertdialog" aria-label={`Wiped on wave ${offer.wave}`}>
      <div className={styles.timer} style={{ inlineSize: `${Math.max(0, 1 - offer.urgency) * 100}%` }} />
      <div className={styles.body}>
        <span className={styles.headline}>
          Wiped on wave {offer.wave} — fell back to {offer.retreatTo}
        </span>
        <div className={styles.actions}>
          <button type="button" className={styles.rally} onClick={onRally}>
            Rally to {offer.wave} at {health}%
          </button>
          <button type="button" className={styles.stay} onClick={onDismiss}>
            Stay
          </button>
        </div>
      </div>
    </div>
  );
}
